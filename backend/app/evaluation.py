"""Automatic evaluation against a golden Q&A set: retrieval accuracy, groundedness, hallucination, latency."""
import json
import statistics

from . import chat, llm, retrieval
from .db import db


def _recall(expected: str, texts: list[str]) -> float:
    et = llm.tokens(expected)
    if not et:
        return 0.0
    pool: set[str] = set()
    for t in texts:
        pool |= llm.tokens(t)
    return len(et & pool) / len(et)


def _hit(expected: str, chunks: list[dict], k: int = 3) -> bool:
    """A retrieval hit means one of the top-k chunks holds most of the expected answer's key facts."""
    return any(_recall(expected, [c["text"]]) >= 0.5 for c in chunks[:k])


def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return float(s[min(len(s) - 1, int(round(p * (len(s) - 1))))])


def run_evaluation(tenant: dict) -> dict:
    tid = tenant["id"]
    with db() as conn:
        golden = [dict(r) for r in conn.execute("SELECT * FROM golden WHERE tenant_id=? ORDER BY id", (tid,))]
    if not golden:
        raise ValueError("Add at least one golden question first.")

    details, lat = [], []
    hits = base_hits = correct = 0
    answerable_n = unanswerable_n = refused_ok = hallucinated = 0
    grounded_scores: list[float] = []

    for g in golden:
        res = chat.answer_question(tenant, g["question"], log=False, history=[])
        lat.append(res["latency_ms"])
        row = {
            "id": g["id"],
            "question": g["question"],
            "answerable": bool(g["answerable"]),
            "answer": res["answer"],
            "answered": res["answered"],
            "confidence": res["confidence"],
            "latency_ms": res["latency_ms"],
            "grounded": res["grounded"],
            "sources": [f"{c['doc']}" + (f" p.{c['page']}" if c["page"] else "") for c in res["citations"]],
        }
        if g["answerable"]:
            answerable_n += 1
            retrieved = res["_chunks"]
            hit = _hit(g["expected_answer"], retrieved)
            base = _hit(g["expected_answer"], retrieval.dense_only(tid, g["question"], 3))
            ok = res["answered"] and llm.judge_correct(g["question"], g["expected_answer"], res["answer"])
            hits += hit
            base_hits += base
            correct += bool(ok)
            row.update(retrieval_hit=hit, baseline_hit=base, correct=bool(ok), passed=bool(ok))
        else:
            unanswerable_n += 1
            refused = not res["answered"]
            refused_ok += refused
            row.update(retrieval_hit=None, baseline_hit=None, correct=refused, passed=refused)
            if not refused:
                hallucinated += 1
        if res["answered"] and res["grounded"] is not None:
            grounded_scores.append(res["grounded"])
            if res["grounded"] < 0.5 and g["answerable"]:
                hallucinated += 1
        details.append(row)

    n = len(golden)
    metrics = {
        "questions": n,
        "retrieval_hit_at_3": round(hits / answerable_n, 3) if answerable_n else None,
        "baseline_hit_at_3": round(base_hits / answerable_n, 3) if answerable_n else None,
        "answer_accuracy": round(correct / answerable_n, 3) if answerable_n else None,
        "groundedness": round(statistics.mean(grounded_scores), 3) if grounded_scores else None,
        "fallback_accuracy": round(refused_ok / unanswerable_n, 3) if unanswerable_n else None,
        "hallucination_rate": round(hallucinated / n, 3),
        "latency_p50_ms": int(_pct(lat, 0.5)),
        "latency_p95_ms": int(_pct(lat, 0.95)),
        "judge": "llm" if llm.available() else "lexical",
    }
    with db() as conn:
        run_id = conn.execute(
            "INSERT INTO eval_runs(tenant_id, metrics, details) VALUES(?,?,?)",
            (tid, json.dumps(metrics), json.dumps(details)),
        ).lastrowid
    return {"id": run_id, "metrics": metrics, "details": details}
