"""Chat pipeline: retrieve -> confidence gate -> grounded answer with citations -> log."""
import json
import time

from . import llm, retrieval
from .db import db

FALLBACK = (
    "I couldn't find a reliable answer to that in our documentation, and I'd rather not guess. "
    "Would you like me to connect you with our support team?"
)
NO_KB = "This assistant doesn't have any knowledge base yet. Please check back soon."


def _citation(c: dict, rank: int) -> dict:
    snippet = c["text"] if len(c["text"]) <= 280 else c["text"][:277].rsplit(" ", 1)[0] + "..."
    return {
        "n": rank,
        "doc_id": c["doc_id"],
        "doc": c["doc_name"],
        "page": c.get("page"),
        "section": c.get("section") or None,
        "snippet": snippet,
        "score": round(c.get("rerank", 0.0), 3),
    }


def get_or_create_conversation(tenant_id: int, session_id: str) -> int:
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM conversations WHERE tenant_id=? AND session_id=?", (tenant_id, session_id)
        ).fetchone()
        if row:
            return row["id"]
        return conn.execute(
            "INSERT INTO conversations(tenant_id, session_id) VALUES(?,?)", (tenant_id, session_id)
        ).lastrowid


def _history(conv_id: int, limit: int = 6) -> list[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?", (conv_id, limit)
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def answer_question(
    tenant: dict, question: str, session_id: str | None = None, log: bool = True, history: list | None = None
) -> dict:
    t0 = time.perf_counter()
    tenant_id = tenant["id"]
    threshold = tenant.get("threshold") or 0.40
    conv_id = get_or_create_conversation(tenant_id, session_id) if (log and session_id) else None
    history = history if history is not None else (_history(conv_id) if conv_id else [])

    # Resolve terse follow-ups ("and for international?") by anchoring on the previous user turn.
    search_q = question
    prev_users = [h["content"] for h in history if h["role"] == "user"]
    if prev_users and len(question.split()) < 5:
        search_q = f"{prev_users[-1]} {question}"

    r = retrieval.retrieve(tenant_id, search_q)
    chunks, confidence = r["chunks"], r["confidence"]

    result = {
        "answer": FALLBACK,
        "answered": False,
        "escalate": True,
        "citations": [],
        "confidence": confidence,
        "grounded": None,
        "mode": "fallback",
    }
    if not chunks:
        result["answer"] = NO_KB
    elif confidence >= threshold:
        gen = llm.generate_answer(question, chunks, history)
        if gen["answerable"] and gen["answer"]:
            used = [chunks[i - 1] for i in dict.fromkeys(gen["used_sources"])]
            result.update(
                answer=gen["answer"],
                answered=True,
                escalate=False,
                citations=[_citation(c, i) for i, c in enumerate(used, 1)],
                grounded=llm.judge_grounded(gen["answer"], used),
                mode=gen["mode"],
            )
            if gen.get("llm_error"):
                result["llm_error"] = gen["llm_error"]

    total_ms = int((time.perf_counter() - t0) * 1000)
    result["latency_ms"] = total_ms
    result["retrieval_ms"] = r["dense_ms"] + r["rerank_ms"]
    result["_chunks"] = chunks
    result["retrieved"] = [_citation(c, i) for i, c in enumerate(chunks, 1)]

    if log and conv_id:
        with db() as conn:
            conn.execute(
                "INSERT INTO messages(tenant_id,conversation_id,role,content) VALUES(?,?,?,?)",
                (tenant_id, conv_id, "user", question),
            )
            mid = conn.execute(
                "INSERT INTO messages(tenant_id,conversation_id,role,content,question,citations,confidence,grounded,answered,"
                "escalated,latency_ms,retrieval_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    tenant_id,
                    conv_id,
                    "assistant",
                    result["answer"],
                    question,
                    json.dumps(result["citations"]),
                    confidence,
                    result["grounded"],
                    int(result["answered"]),
                    int(result["escalate"]),
                    total_ms,
                    result["retrieval_ms"],
                ),
            ).lastrowid
        result["message_id"] = mid
        result["conversation_id"] = conv_id
    return result
