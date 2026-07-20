"""Password hashing and JWT issuing/verification.

Deliberately has no FastAPI or database imports so it stays unit-testable.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from passlib.context import CryptContext

from ..config import get_settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

TokenType = Literal["access", "refresh"]

ALGORITHM = "HS256"


# --- Passwords ---

def hash_password(plain: str) -> str:
    # bcrypt silently truncates at 72 bytes; reject rather than let a user
    # believe a longer passphrase is fully protecting the account.
    if len(plain.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes.")
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd.verify(plain, hashed)
    except ValueError:
        # Malformed/legacy hash in the column — treat as a failed login rather
        # than a 500.
        return False


# --- JWT ---

def _encode(subject: str, token_type: TokenType, expires: timedelta, **claims: Any) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        # Unique id per token so refresh tokens can be revoked individually later.
        "jti": secrets.token_urlsafe(16),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    settings = get_settings()
    return _encode(
        str(user_id),
        "access",
        timedelta(minutes=settings.access_token_minutes),
        role=role,
    )


def create_refresh_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    return _encode(
        str(user_id),
        "refresh",
        timedelta(days=settings.refresh_token_days),
    )


def decode_token(token: str, expect: TokenType) -> dict[str, Any]:
    """Decode and validate a JWT. Raises jwt.PyJWTError on any problem."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    if payload.get("type") != expect:
        # A refresh token must never be usable as an access token.
        raise jwt.InvalidTokenError(f"Expected a {expect} token.")
    return payload


# --- One-time tokens (email verification, password reset) ---

def generate_one_time_token() -> tuple[str, str]:
    """Return (raw_token, token_hash). Only the hash is persisted."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_one_time_token(raw)


def hash_one_time_token(raw: str) -> str:
    # SHA-256 rather than bcrypt: these are already high-entropy random values,
    # so key stretching buys nothing and would slow every verification.
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
