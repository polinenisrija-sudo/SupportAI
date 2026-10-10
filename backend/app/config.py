import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("SUPPORTAI_DATA", BASE_DIR / "storage"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DB_PATH = Path(os.getenv("SUPPORTAI_DB", DATA_DIR / "supportai.db"))

SAMPLE_DIR = BASE_DIR.parent / "data" / "sample_kb"
WIDGET_PATH = BASE_DIR.parent / "widget" / "widget.js"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANSWER_MODEL = os.getenv("SUPPORTAI_ANSWER_MODEL", "claude-sonnet-5-5")
FAST_MODEL = os.getenv("SUPPORTAI_FAST_MODEL", "claude-haiku-5-5")

EMBED_MODEL = "BAAI/bge-small-en-v1.5"
RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2"

# Confidence below this triggers the human-support fallback.
CONFIDENCE_THRESHOLD = float(os.getenv("SUPPORTAI_CONFIDENCE_THRESHOLD", "0.40"))

_secret_file = DATA_DIR / ".jwt_secret"
if os.getenv("SUPPORTAI_SECRET"):
    JWT_SECRET = os.environ["SUPPORTAI_SECRET"]
else:
    if not _secret_file.exists():
        _secret_file.write_text(secrets.token_hex(32))
    JWT_SECRET = _secret_file.read_text().strip()
JWT_EXPIRE_HOURS = 24 * 7
