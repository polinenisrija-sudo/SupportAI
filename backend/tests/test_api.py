import os
import tempfile

os.environ["SUPPORTAI_DATA"] = tempfile.mkdtemp()

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def signup(client, email):
    r = client.post("/api/auth/register", json={"name": "Biz " + email, "email": email, "password": "secret12"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture(scope="module")
def tenant_a(client):
    h = signup(client, "a@example.com")
    assert client.post("/api/knowledge/sample", headers=h).status_code == 200
    return h


def test_grounded_answer_with_citation(client, tenant_a):
    r = client.post("/api/chat", headers=tenant_a, json={"message": "How much is standard shipping?", "session_id": "s-test1"})
    d = r.json()
    assert d["answered"] and d["citations"]
    assert "5.95" in d["answer"]
    assert d["citations"][0]["doc"] == "shipping_policy.md"


def test_pdf_citation_has_page(client, tenant_a):
    d = client.post("/api/chat", headers=tenant_a, json={"message": "How do I wash a down sleeping bag?", "session_id": "s-test2"}).json()
    assert d["answered"]
    assert any(c["doc"] == "product_care_guide.pdf" and c["page"] == 2 for c in d["citations"])


def test_out_of_scope_falls_back(client, tenant_a):
    d = client.post("/api/chat", headers=tenant_a, json={"message": "Who won the football world cup in 1998?", "session_id": "s-test3"}).json()
    assert d["answered"] is False and d["escalate"] is True and not d["citations"]


def test_tenant_isolation(client, tenant_a):
    h_b = signup(client, "b@example.com")
    assert client.get("/api/documents", headers=h_b).json() == []
    d = client.post("/api/chat", headers=h_b, json={"message": "How much is standard shipping?", "session_id": "s-test4"}).json()
    assert d["answered"] is False and not d["citations"]
    doc_id = client.get("/api/documents", headers=tenant_a).json()[0]["id"]
    assert client.delete(f"/api/documents/{doc_id}", headers=h_b).status_code == 404
    assert client.get(f"/api/documents/{doc_id}/chunks", headers=h_b).json() == []


def test_requires_auth(client):
    assert client.get("/api/documents").status_code == 401


def test_public_widget_flow(client, tenant_a):
    bot = client.get("/api/me", headers=tenant_a).json()["bot_id"]
    cfg = client.get(f"/api/public/{bot}/config").json()
    assert cfg["bot_name"]
    d = client.post(f"/api/public/{bot}/chat", json={"message": "Do you take PayPal?", "session_id": "pub-session-1"}).json()
    assert d["answered"]
    assert client.post(f"/api/public/{bot}/feedback", json={"message_id": d["message_id"], "value": 1}).status_code == 200
    q = client.post(f"/api/public/{bot}/chat", json={"message": "Do you sell gift wrapping paper?", "session_id": "pub-session-1"}).json()
    assert q["escalate"]
    assert client.post(f"/api/public/{bot}/handoff", json={"session_id": "pub-session-1", "email": "x@y.com", "message": "help"}).status_code == 200
    assert client.get("/api/handoffs", headers=tenant_a).json()


def test_gaps_and_resolve(client, tenant_a):
    for i, q in enumerate(["Do you offer gift wrapping?", "Can you gift wrap my order?", "Is gift wrap available?"]):
        client.post("/api/chat", headers=tenant_a, json={"message": q, "session_id": f"s-gap{i}"})
    gaps = client.get("/api/gaps", headers=tenant_a).json()
    assert gaps, "expected at least one gap cluster"
    g = next((x for x in gaps if any("gift" in q.lower() for q in x["questions"])), None)
    assert g and g["count"] >= 2
    r = client.post("/api/gaps/resolve", headers=tenant_a, json={
        "question": "Do you offer gift wrapping?", "answer": "Yes, gift wrapping is available for $4 per item at checkout.",
        "message_ids": g["message_ids"]})
    assert r.status_code == 200
    d = client.post("/api/chat", headers=tenant_a, json={"message": "Can you gift wrap my order?", "session_id": "s-gap9"}).json()
    assert d["answered"], d


def test_evaluation_and_analytics(client, tenant_a):
    r = client.post("/api/eval/run", headers=tenant_a)
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    print(m)
    assert m["retrieval_hit_at_3"] >= 0.8
    assert m["fallback_accuracy"] is not None
    a = client.get("/api/analytics", headers=tenant_a).json()
    assert a["questions"] > 0 and a["documents"] >= 5
