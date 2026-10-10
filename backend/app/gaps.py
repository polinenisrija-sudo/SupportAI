"""Knowledge-gap discovery: cluster unanswered / poorly-rated questions and propose new FAQ entries."""
import numpy as np

from . import retrieval
from .db import db

DISTANCE_THRESHOLD = 0.27


def compute_gaps(tenant_id: int) -> list[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT id, question, created_at, answered, feedback, confidence FROM messages "
            "WHERE tenant_id=? AND role='assistant' AND gap_resolved=0 AND question IS NOT NULL "
            "AND (answered=0 OR feedback=-1) ORDER BY id DESC LIMIT 300",
            (tenant_id,),
        ).fetchall()
    if not rows:
        return []
    rows = [dict(r) for r in rows]
    questions = [r["question"] for r in rows]

    if len(rows) == 1:
        labels = np.array([0])
    else:
        from sklearn.cluster import AgglomerativeClustering

        vecs = retrieval.embed_many(questions)
        vecs = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
        labels = AgglomerativeClustering(
            n_clusters=None, metric="cosine", linkage="average", distance_threshold=DISTANCE_THRESHOLD
        ).fit_predict(vecs)

    clusters: dict[int, list[dict]] = {}
    for r, lab in zip(rows, labels):
        clusters.setdefault(int(lab), []).append(r)

    out = []
    for members in clusters.values():
        qs = [m["question"] for m in members]
        uniq = list(dict.fromkeys(qs))
        out.append(
            {
                "count": len(members),
                "questions": uniq[:8],
                "message_ids": [m["id"] for m in members],
                "last_seen": max(m["created_at"] for m in members),
                "reason": "unanswered" if any(not m["answered"] for m in members) else "downvoted",
                "suggested_question": _canonical(uniq),
                "avg_confidence": round(float(np.mean([m["confidence"] or 0 for m in members])), 2),
            }
        )
    out.sort(key=lambda g: -g["count"])
    return out


def _canonical(questions: list[str]) -> str:
    return max(questions, key=len)
