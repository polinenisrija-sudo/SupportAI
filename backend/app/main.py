import ipaddress
import json
import secrets
import socket
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import auth, chat, config, evaluation, gaps, ingest, llm, retrieval
from .db import db, init_db

MAX_UPLOAD = 15 * 1024 * 1024


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    threading.Thread(target=retrieval.warmup, daemon=True).start()
    yield


app = FastAPI(title="SupportAI", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------- helpers
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, limit: int = 40, window: int = 60):
    ip = request.client.host if request.client else "unknown"
    q = _hits[ip]
    now = time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests, slow down.")
    q.append(now)


def tenant_by_bot(bot_id: str) -> dict:
    with db() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE bot_id=?", (bot_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Unknown bot")
    return dict(row)


def public_tenant(t: dict) -> dict:
    return {k: t[k] for k in ("id", "name", "email", "bot_id", "bot_name", "brand_color", "welcome", "support_email", "threshold")}


def safe_url(url: str):
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise HTTPException(400, "Enter a valid http(s) URL")
    try:
        for info in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise HTTPException(400, "That address is not allowed")
    except socket.gaierror:
        raise HTTPException(400, "Could not resolve that host")


# ---------------------------------------------------------------- auth
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/register")
def register(body: RegisterIn):
    with db() as conn:
        if conn.execute("SELECT 1 FROM tenants WHERE email=?", (body.email.lower(),)).fetchone():
            raise HTTPException(409, "An account with this email already exists")
        tid = conn.execute(
            "INSERT INTO tenants(name,email,password_hash,bot_id,support_email,brand_color) VALUES(?,?,?,?,?,?)",
            (body.name.strip(), body.email.lower(), auth.hash_password(body.password), "bot_" + secrets.token_hex(6), body.email.lower(), "#2563eb"),
        ).lastrowid
    return {"token": auth.make_token(tid)}


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request):
    rate_limit(request, limit=15)
    with db() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE email=?", (body.email.lower(),)).fetchone()
    if not row or not auth.verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    return {"token": auth.make_token(row["id"])}


@app.get("/api/me")
def me(t: dict = Depends(auth.current_tenant)):
    return {**public_tenant(t), "llm": "claude" if llm.available() else "offline-extractive"}


class SettingsIn(BaseModel):
    name: str | None = Field(None, max_length=80)
    bot_name: str | None = Field(None, max_length=40)
    brand_color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    welcome: str | None = Field(None, max_length=240)
    support_email: str | None = Field(None, max_length=120)
    threshold: float | None = Field(None, ge=0.1, le=0.9)


@app.patch("/api/settings")
def update_settings(body: SettingsIn, t: dict = Depends(auth.current_tenant)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if fields:
        sets = ", ".join(f"{k}=?" for k in fields)
        with db() as conn:
            conn.execute(f"UPDATE tenants SET {sets} WHERE id=?", (*fields.values(), t["id"]))
            t = dict(conn.execute("SELECT * FROM tenants WHERE id=?", (t["id"],)).fetchone())
    return public_tenant(t)


# ---------------------------------------------------------------- knowledge base
def _doc_rows(tid: int):
    with db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id,name,source_type,source_ref,status,error,chunk_count,created_at FROM documents "
            "WHERE tenant_id=? ORDER BY id DESC", (tid,))]


@app.get("/api/documents")
def list_documents(t: dict = Depends(auth.current_tenant)):
    return _doc_rows(t["id"])


@app.post("/api/documents/upload")
def upload_documents(files: list[UploadFile] = File(...), t: dict = Depends(auth.current_tenant)):
    results = []
    for f in files:
        name = Path(f.filename or "file").name
        data = f.file.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            results.append({"name": name, "ok": False, "error": "File larger than 15 MB"})
            continue
        dest = config.UPLOAD_DIR / f"{uuid.uuid4().hex}{Path(name).suffix.lower()}"
        dest.write_bytes(data)
        try:
            doc_id = ingest.ingest_file(t["id"], dest, name)
            results.append({"name": name, "ok": True, "id": doc_id})
        except Exception as e:
            results.append({"name": name, "ok": False, "error": str(e)[:200]})
    return results


class UrlIn(BaseModel):
    url: str


@app.post("/api/documents/url")
def add_url(body: UrlIn, t: dict = Depends(auth.current_tenant)):
    safe_url(body.url.strip())
    try:
        doc_id = ingest.ingest_url(t["id"], body.url.strip())
    except Exception as e:
        raise HTTPException(400, f"Could not import that page: {str(e)[:150]}")
    return {"id": doc_id}


class FaqIn(BaseModel):
    question: str = Field(min_length=3, max_length=300)
    answer: str = Field(min_length=3, max_length=3000)


@app.post("/api/documents/faq")
def add_faq(body: FaqIn, t: dict = Depends(auth.current_tenant)):
    return {"id": ingest.ingest_faq(t["id"], body.question, body.answer)}


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int, t: dict = Depends(auth.current_tenant)):
    if not ingest.delete_document(t["id"], doc_id):
        raise HTTPException(404, "Document not found")
    return {"ok": True}


@app.get("/api/documents/{doc_id}/chunks")
def document_chunks(doc_id: int, t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        rows = conn.execute(
            "SELECT id,page,section,text FROM chunks WHERE doc_id=? AND tenant_id=? ORDER BY id", (doc_id, t["id"])
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/knowledge/sample")
def load_sample(t: dict = Depends(auth.current_tenant)):
    """Load the bundled demo knowledge base + golden question set."""
    if not config.SAMPLE_DIR.exists():
        raise HTTPException(404, "Sample data not bundled")
    existing = {d["name"] for d in _doc_rows(t["id"])}
    added = 0
    for p in sorted(config.SAMPLE_DIR.iterdir()):
        if p.suffix.lower() in (".pdf", ".md", ".txt", ".docx") and p.name not in existing:
            ingest.ingest_file(t["id"], p, p.name)
            added += 1
    golden_file = config.SAMPLE_DIR / "golden_qa.json"
    if golden_file.exists():
        with db() as conn:
            if not conn.execute("SELECT 1 FROM golden WHERE tenant_id=?", (t["id"],)).fetchone():
                for g in json.loads(golden_file.read_text(encoding="utf-8")):
                    conn.execute(
                        "INSERT INTO golden(tenant_id,question,expected_answer,answerable) VALUES(?,?,?,?)",
                        (t["id"], g["question"], g.get("expected_answer", ""), int(g.get("answerable", True))),
                    )
    return {"added": added}


# ---------------------------------------------------------------- chat
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    session_id: str = Field(min_length=4, max_length=64)


def _chat_payload(res: dict) -> dict:
    return {k: res.get(k) for k in (
        "answer", "answered", "escalate", "citations", "confidence", "grounded",
        "latency_ms", "retrieval_ms", "message_id", "mode")}


@app.post("/api/chat")
def dashboard_chat(body: ChatIn, request: Request, t: dict = Depends(auth.current_tenant)):
    rate_limit(request, limit=60)
    res = chat.answer_question(t, body.message.strip(), session_id="dash-" + body.session_id)
    out = _chat_payload(res)
    out["retrieved"] = res["retrieved"]
    return out


@app.get("/api/public/{bot_id}/config")
def public_config(bot_id: str):
    t = tenant_by_bot(bot_id)
    return {k: t[k] for k in ("bot_name", "brand_color", "welcome", "name", "support_email")}


@app.post("/api/public/{bot_id}/chat")
def public_chat(bot_id: str, body: ChatIn, request: Request):
    rate_limit(request, limit=30)
    t = tenant_by_bot(bot_id)
    res = chat.answer_question(t, body.message.strip(), session_id="pub-" + body.session_id)
    return _chat_payload(res)


class FeedbackIn(BaseModel):
    message_id: int
    value: int = Field(ge=-1, le=1)


@app.post("/api/public/{bot_id}/feedback")
def public_feedback(bot_id: str, body: FeedbackIn, request: Request):
    rate_limit(request, limit=60)
    t = tenant_by_bot(bot_id)
    with db() as conn:
        cur = conn.execute(
            "UPDATE messages SET feedback=? WHERE id=? AND tenant_id=? AND role='assistant'",
            (body.value or None, body.message_id, t["id"]),
        )
    if not cur.rowcount:
        raise HTTPException(404, "Message not found")
    return {"ok": True}


@app.post("/api/feedback")
def dashboard_feedback(body: FeedbackIn, t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        conn.execute(
            "UPDATE messages SET feedback=? WHERE id=? AND tenant_id=? AND role='assistant'",
            (body.value or None, body.message_id, t["id"]),
        )
    return {"ok": True}


class HandoffIn(BaseModel):
    session_id: str = Field(min_length=4, max_length=64)
    name: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=1000)


@app.post("/api/public/{bot_id}/handoff")
def public_handoff(bot_id: str, body: HandoffIn, request: Request):
    rate_limit(request, limit=10)
    t = tenant_by_bot(bot_id)
    conv = chat.get_or_create_conversation(t["id"], "pub-" + body.session_id)
    with db() as conn:
        conn.execute(
            "INSERT INTO handoffs(tenant_id,conversation_id,name,email,message) VALUES(?,?,?,?,?)",
            (t["id"], conv, body.name, body.email, body.message),
        )
        conn.execute("UPDATE messages SET escalated=1 WHERE conversation_id=? AND tenant_id=?", (conv, t["id"]))
    return {"ok": True}


@app.get("/api/handoffs")
def list_handoffs(t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        rows = conn.execute(
            "SELECT h.*, (SELECT m.question FROM messages m WHERE m.conversation_id=h.conversation_id "
            "AND m.role='assistant' AND m.question IS NOT NULL ORDER BY m.id DESC LIMIT 1) AS last_question "
            "FROM handoffs h WHERE h.tenant_id=? ORDER BY h.id DESC", (t["id"],)).fetchall()
    return [dict(r) for r in rows]


class HandoffStatus(BaseModel):
    status: str = Field(pattern="^(open|resolved)$")


@app.patch("/api/handoffs/{hid}")
def update_handoff(hid: int, body: HandoffStatus, t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        conn.execute("UPDATE handoffs SET status=? WHERE id=? AND tenant_id=?", (body.status, hid, t["id"]))
    return {"ok": True}


# ---------------------------------------------------------------- conversations
@app.get("/api/conversations")
def list_conversations(t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        rows = conn.execute(
            "SELECT c.id, c.session_id, c.created_at, COUNT(m.id) AS messages, "
            "SUM(CASE WHEN m.role='assistant' AND m.escalated=1 THEN 1 ELSE 0 END) AS escalations, "
            "(SELECT content FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY id LIMIT 1) AS first_question, "
            "MAX(m.created_at) AS last_at "
            "FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id "
            "WHERE c.tenant_id=? GROUP BY c.id HAVING messages > 0 ORDER BY last_at DESC LIMIT 100", (t["id"],)).fetchall()
    return [{**dict(r), "source": "dashboard" if r["session_id"].startswith("dash-") else "widget"} for r in rows]


@app.get("/api/conversations/{cid}")
def get_conversation(cid: int, t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        if not conn.execute("SELECT 1 FROM conversations WHERE id=? AND tenant_id=?", (cid, t["id"])).fetchone():
            raise HTTPException(404, "Conversation not found")
        rows = conn.execute(
            "SELECT id,role,content,citations,confidence,grounded,answered,escalated,feedback,latency_ms,created_at "
            "FROM messages WHERE conversation_id=? AND tenant_id=? ORDER BY id", (cid, t["id"])).fetchall()
    return [{**dict(r), "citations": json.loads(r["citations"] or "[]")} for r in rows]


# ---------------------------------------------------------------- analytics
@app.get("/api/analytics")
def analytics(t: dict = Depends(auth.current_tenant)):
    tid = t["id"]
    with db() as conn:
        a = [dict(r) for r in conn.execute(
            "SELECT answered,escalated,confidence,grounded,latency_ms,retrieval_ms,feedback,created_at,question "
            "FROM messages WHERE tenant_id=? AND role='assistant'", (tid,))]
        docs = conn.execute("SELECT COUNT(*) c, COALESCE(SUM(chunk_count),0) ch FROM documents WHERE tenant_id=?", (tid,)).fetchone()
        convs = conn.execute("SELECT COUNT(*) c FROM conversations WHERE tenant_id=?", (tid,)).fetchone()["c"]
        open_handoffs = conn.execute("SELECT COUNT(*) c FROM handoffs WHERE tenant_id=? AND status='open'", (tid,)).fetchone()["c"]
    n = len(a)
    answered = [x for x in a if x["answered"]]
    lats = sorted(x["latency_ms"] for x in a if x["latency_ms"] is not None)
    up = sum(1 for x in a if x["feedback"] == 1)
    down = sum(1 for x in a if x["feedback"] == -1)
    grounded = [x["grounded"] for x in answered if x["grounded"] is not None]
    risky = sum(1 for g in grounded if g < 0.5)

    days: dict[str, dict] = {}
    for x in a:
        d = x["created_at"][:10]
        e = days.setdefault(d, {"date": d, "questions": 0, "answered": 0})
        e["questions"] += 1
        e["answered"] += 1 if x["answered"] else 0
    series = [days[k] for k in sorted(days)][-14:]

    def avg(vals):
        return round(sum(vals) / len(vals), 3) if vals else None

    return {
        "documents": docs["c"], "chunks": docs["ch"], "conversations": convs,
        "questions": n,
        "answer_rate": round(len(answered) / n, 3) if n else None,
        "fallback_rate": round((n - len(answered)) / n, 3) if n else None,
        "avg_confidence": avg([x["confidence"] for x in a if x["confidence"] is not None]),
        "avg_groundedness": avg(grounded),
        "hallucination_risk": round(risky / len(grounded), 3) if grounded else None,
        "latency_avg_ms": int(sum(lats) / len(lats)) if lats else None,
        "latency_p95_ms": lats[min(len(lats) - 1, int(0.95 * (len(lats) - 1) + 0.5))] if lats else None,
        "retrieval_avg_ms": avg([x["retrieval_ms"] for x in a if x["retrieval_ms"] is not None]),
        "thumbs_up": up, "thumbs_down": down,
        "satisfaction": round(up / (up + down), 3) if (up + down) else None,
        "open_handoffs": open_handoffs,
        "series": series,
    }


# ---------------------------------------------------------------- knowledge gaps
@app.get("/api/gaps")
def list_gaps(t: dict = Depends(auth.current_tenant)):
    return gaps.compute_gaps(t["id"])


class DraftIn(BaseModel):
    questions: list[str] = Field(min_length=1, max_length=20)


@app.post("/api/gaps/draft")
def draft_gap(body: DraftIn, t: dict = Depends(auth.current_tenant)):
    return llm.draft_faq(body.questions)


class ResolveIn(BaseModel):
    question: str = Field(min_length=3, max_length=300)
    answer: str = Field(min_length=3, max_length=3000)
    message_ids: list[int]


@app.post("/api/gaps/resolve")
def resolve_gap(body: ResolveIn, t: dict = Depends(auth.current_tenant)):
    doc_id = ingest.ingest_faq(t["id"], body.question, body.answer)
    if body.message_ids:
        marks = ",".join("?" * len(body.message_ids))
        with db() as conn:
            conn.execute(
                f"UPDATE messages SET gap_resolved=1 WHERE tenant_id=? AND id IN ({marks})", (t["id"], *body.message_ids)
            )
    return {"id": doc_id}


# ---------------------------------------------------------------- evaluation
class GoldenIn(BaseModel):
    question: str = Field(min_length=3, max_length=300)
    expected_answer: str = Field(default="", max_length=1000)
    answerable: bool = True


@app.get("/api/golden")
def list_golden(t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM golden WHERE tenant_id=? ORDER BY id", (t["id"],))]


@app.post("/api/golden")
def add_golden(body: GoldenIn, t: dict = Depends(auth.current_tenant)):
    if body.answerable and not body.expected_answer.strip():
        raise HTTPException(400, "Answerable questions need an expected answer")
    with db() as conn:
        gid = conn.execute(
            "INSERT INTO golden(tenant_id,question,expected_answer,answerable) VALUES(?,?,?,?)",
            (t["id"], body.question, body.expected_answer, int(body.answerable))).lastrowid
    return {"id": gid}


@app.delete("/api/golden/{gid}")
def delete_golden(gid: int, t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        conn.execute("DELETE FROM golden WHERE id=? AND tenant_id=?", (gid, t["id"]))
    return {"ok": True}


@app.post("/api/eval/run")
def run_eval(t: dict = Depends(auth.current_tenant)):
    try:
        return evaluation.run_evaluation(t)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/eval/runs")
def eval_runs(t: dict = Depends(auth.current_tenant)):
    with db() as conn:
        rows = conn.execute(
            "SELECT id,metrics,details,created_at FROM eval_runs WHERE tenant_id=? ORDER BY id DESC LIMIT 10", (t["id"],)
        ).fetchall()
    return [{"id": r["id"], "created_at": r["created_at"], "metrics": json.loads(r["metrics"]), "details": json.loads(r["details"])} for r in rows]


# ---------------------------------------------------------------- deployment
@app.get("/api/snippet")
def snippet(request: Request, t: dict = Depends(auth.current_tenant)):
    origin = str(request.base_url).rstrip("/")
    return {"snippet": f'<script src="{origin}/widget.js" data-bot-id="{t["bot_id"]}" async></script>', "origin": origin}


@app.get("/api/health")
def health():
    return {"ok": True, "llm": "claude" if llm.available() else "offline-extractive"}


@app.get("/widget.js")
def widget():
    if not config.WIDGET_PATH.exists():
        raise HTTPException(404, "Widget not built")
    return FileResponse(config.WIDGET_PATH, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/demo-site")
def demo_site():
    p = config.WIDGET_PATH.parent / "demo.html"
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


# ---------------------------------------------------------------- serve the built dashboard
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
