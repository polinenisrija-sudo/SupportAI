import time

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_EXPIRE_HOURS, JWT_SECRET
from .db import db

_bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def make_token(tenant_id: int) -> str:
    payload = {"sub": str(tenant_id), "exp": int(time.time()) + JWT_EXPIRE_HOURS * 3600}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_tenant(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Resolve the tenant from the bearer token. Every dashboard query is then scoped to this tenant id."""
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        data = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        tid = int(data["sub"])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    with db() as conn:
        row = conn.execute("SELECT * FROM tenants WHERE id=?", (tid,)).fetchone()
    if not row:
        raise HTTPException(401, "Account not found")
    return dict(row)
