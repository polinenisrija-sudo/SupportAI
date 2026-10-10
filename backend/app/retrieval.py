"""Hybrid retrieval: dense (BGE) + sparse (SQLite FTS5 BM25) fused with RRF, then cross-encoder rerank."""
import math
import re
import threading
import time

import numpy as np

from .config import EMBED_MODEL, RERANK_MODEL
from .db import db

_embedder = None
_reranker = None
_lock = threading.Lock()
_cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}


def _get_embedder():
    global _embedder
    with _lock:
        if _embedder is None:
            from fastembed import TextEmbedding

            _embedder = TextEmbedding(EMBED_MODEL)
        return _embedder


def _get_reranker():
    global _reranker
    with _lock:
        if _reranker is None:
            from fastembed.rerank.cross_encoder import TextCrossEncoder

            _reranker = TextCrossEncoder(RERANK_MODEL)
        return _reranker


def warmup():
    _get_embedder()
    _get_reranker()
    embed_query("warmup")


def embed_passages(texts: list[str]) -> np.ndarray:
    return np.array(list(_get_embedder().passage_embed(texts)), dtype=np.float32)


def embed_query(text: str) -> np.ndarray:
    return np.array(list(_get_embedder().query_embed([text]))[0], dtype=np.float32)


def embed_many(texts: list[str]) -> np.ndarray:
    """Symmetric embedding for clustering questions against each other."""
    return np.array(list(_get_embedder().embed(texts)), dtype=np.float32)


def invalidate(tenant_id: int):
    _cache.pop(tenant_id, None)


def _load(tenant_id: int):
    if tenant_id in _cache:
        return _cache[tenant_id]
    with db() as conn:
        rows = conn.execute("SELECT id, embedding FROM chunks WHERE tenant_id=?", (tenant_id,)).fetchall()
    if not rows:
        entry = (np.zeros(0, dtype=np.int64), np.zeros((0, 384), dtype=np.float32))
    else:
        ids = np.array([r["id"] for r in rows], dtype=np.int64)
        mat = np.stack([np.frombuffer(r["embedding"], dtype=np.float32) for r in rows])
        mat = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9)
        entry = (ids, mat)
    _cache[tenant_id] = entry
    return entry


_STOP = set(
    "a an the is are was were be to of in on for and or do does did i you my your it this that "
    "with can how what when where who why please at by from as if me we our".split()
)


def _fts_query(q: str) -> str:
    toks = [t for t in re.findall(r"[A-Za-z0-9]+", q.lower()) if t not in _STOP and len(t) > 1]
    return " OR ".join(f'"{t}"' for t in toks[:12])


def _sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def retrieve(tenant_id: int, query: str, top_k: int = 4, pool: int = 20) -> dict:
    """Return {chunks, confidence, dense_ms, rerank_ms}. Every query is scoped by tenant_id."""
    t0 = time.perf_counter()
    ids, mat = _load(tenant_id)
    if len(ids) == 0:
        return {"chunks": [], "confidence": 0.0, "dense_ms": 0, "rerank_ms": 0}

    qv = embed_query(query)
    qv = qv / (np.linalg.norm(qv) + 1e-9)
    sims = mat @ qv
    dense_order = np.argsort(-sims)[:pool]
    dense_rank = {int(ids[i]): r for r, i in enumerate(dense_order)}
    cos_by_id = {int(ids[i]): float(sims[i]) for i in dense_order}

    sparse_rank: dict[int, int] = {}
    fq = _fts_query(query)
    if fq:
        with db() as conn:
            rows = conn.execute(
                "SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND tenant_id=? "
                "ORDER BY bm25(chunks_fts) LIMIT ?",
                (fq, tenant_id, pool),
            ).fetchall()
        sparse_rank = {int(r["chunk_id"]): i for i, r in enumerate(rows)}
    dense_ms = int((time.perf_counter() - t0) * 1000)

    k = 60
    fused: dict[int, float] = {}
    for cid, r in dense_rank.items():
        fused[cid] = fused.get(cid, 0) + 1 / (k + r + 1)
    for cid, r in sparse_rank.items():
        fused[cid] = fused.get(cid, 0) + 1 / (k + r + 1)
    cand_ids = [c for c, _ in sorted(fused.items(), key=lambda x: -x[1])[:10]]

    with db() as conn:
        marks = ",".join("?" * len(cand_ids))
        rows = conn.execute(
            f"SELECT id, doc_id, doc_name, page, section, text FROM chunks "
            f"WHERE tenant_id=? AND id IN ({marks})",
            (tenant_id, *cand_ids),
        ).fetchall()
    by_id = {r["id"]: dict(r) for r in rows}
    cands = [by_id[c] for c in cand_ids if c in by_id]

    t1 = time.perf_counter()
    docs = [f"{c['section']}. {c['text']}" if c["section"] else c["text"] for c in cands]
    scores = list(_get_reranker().rerank(query, docs))
    rerank_ms = int((time.perf_counter() - t1) * 1000)
    for c, s in zip(cands, scores):
        c["rerank"] = float(s)
        c["cosine"] = cos_by_id.get(c["id"], 0.0)
        c["in_dense"] = c["id"] in dense_rank
        c["in_sparse"] = c["id"] in sparse_rank
    cands.sort(key=lambda c: -c["rerank"])
    top = cands[:top_k]

    # Confidence blends cross-encoder relevance with dense similarity of the best chunk.
    best = top[0]
    rer = _sigmoid(best["rerank"] / 2.0)
    cos = min(max((best["cosine"] - 0.45) / 0.35, 0.0), 1.0)
    confidence = round(0.65 * rer + 0.35 * cos, 3)
    return {"chunks": top, "confidence": confidence, "dense_ms": dense_ms, "rerank_ms": rerank_ms}


def dense_only(tenant_id: int, query: str, top_k: int = 3) -> list[dict]:
    """Naive baseline (vector search only, no keyword fusion or reranking) for A/B evaluation."""
    ids, mat = _load(tenant_id)
    if len(ids) == 0:
        return []
    qv = embed_query(query)
    qv = qv / (np.linalg.norm(qv) + 1e-9)
    order = np.argsort(-(mat @ qv))[:top_k]
    chosen = [int(ids[i]) for i in order]
    with db() as conn:
        marks = ",".join("?" * len(chosen))
        rows = conn.execute(
            f"SELECT id, doc_id, doc_name, page, section, text FROM chunks WHERE tenant_id=? AND id IN ({marks})",
            (tenant_id, *chosen),
        ).fetchall()
    by_id = {r["id"]: dict(r) for r in rows}
    return [by_id[c] for c in chosen if c in by_id]
