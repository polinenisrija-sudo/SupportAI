"""Print retrieval confidence for in-scope vs out-of-scope questions to tune CONFIDENCE_THRESHOLD."""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ["SUPPORTAI_DATA"] = tempfile.mkdtemp()

from app import chat, ingest  # noqa: E402
from app.db import db, init_db  # noqa: E402

init_db()
with db() as c:
    tid = c.execute("INSERT INTO tenants(name,email,password_hash,bot_id) VALUES('t','t@t.t','x','b')").lastrowid
for p in sorted((ROOT / "data" / "sample_kb").iterdir()):
    if p.suffix in (".md", ".pdf"):
        ingest.ingest_file(tid, p, p.name)

tenant = {"id": tid, "threshold": 0.45}
golden = json.loads((ROOT / "data" / "sample_kb" / "golden_qa.json").read_text())
extra_out = [
    "What is the weather in Denver today?", "Can I get a job at Northwind?", "Do you sell electric bikes?",
    "How do I install Python?", "What's your phone number?", "Do you offer student discounts on kayaks?",
    "Is there a loyalty rewards program?", "Where is your warehouse?", "tell me a joke",
]
extra_in = ["is shipping free", "can i send back my boots", "how long is the warranty on shoes", "what card can i use",
            "my zipper broke", "how to clean my tent", "i forgot my password", "when do you charge my card"]
print("--- in scope")
for q in [g["question"] for g in golden if g["answerable"]] + extra_in:
    r = chat.answer_question(tenant, q, log=False, history=[])
    print(f"{r['confidence']:.3f}  {'ANS' if r['answered'] else 'fb '}  {q}")
print("--- out of scope")
for q in [g["question"] for g in golden if not g["answerable"]] + extra_out:
    r = chat.answer_question(tenant, q, log=False, history=[])
    print(f"{r['confidence']:.3f}  {'ANS' if r['answered'] else 'fb '}  {q}")
