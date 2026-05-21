"""PBKDF2-SHA256 — matches apis/netlify/functions/auth-signup.js / auth-login.js."""

import hashlib
import secrets

PBKDF2_ITERATIONS = 100_000
KEY_LENGTH = 32


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
        dklen=KEY_LENGTH,
    )
    return f"{salt}:{derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or ":" not in stored_hash:
        return False
    salt, expected = stored_hash.split(":", 1)
    if not salt or not expected:
        return False
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
        dklen=KEY_LENGTH,
    )
    return derived.hex() == expected


def new_user_id() -> str:
    return f"usr_{secrets.token_hex(8)}"
