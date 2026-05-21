"""Resolve workspace users from Django only."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.utils import timezone as dj_tz

from .models import WorkspaceUser


def find_user_by_email(email: str) -> WorkspaceUser | None:
    return WorkspaceUser.objects.filter(email=email.strip().lower()).first()


def issue_reset_token(user: WorkspaceUser) -> str:
    token = secrets.token_hex(32)
    user.reset_token = token
    user.reset_expiry = dj_tz.now() + timedelta(minutes=30)
    user.save(update_fields=["reset_token", "reset_expiry", "updated_at"])
    return token


def matches_reset_code(user: WorkspaceUser, code_or_token: str) -> bool:
    stored = user.reset_token or ""
    if not stored or not code_or_token:
        return False
    raw = str(code_or_token).strip()
    if len(raw) == 64 and all(c in "0123456789abcdefABCDEF" for c in raw):
        return stored == raw
    return stored[:8].upper() == raw.upper()


def clear_reset_token(user: WorkspaceUser) -> None:
    user.reset_token = ""
    user.reset_expiry = None
    user.save(update_fields=["reset_token", "reset_expiry", "updated_at"])
