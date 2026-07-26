"""Shared auth helpers — Django is the source of truth for users and passwords."""

from __future__ import annotations

from .models import Subscription, WorkspaceUser
from .serializers import subscription_to_api, user_to_api

ACTIVE_STATUSES = frozenset({"trialing", "active", "past_due"})


def primary_subscription(user: WorkspaceUser) -> Subscription | None:
    """Prefer a paid/active subscription over a stale canceled primary."""
    active = (
        user.subscriptions.filter(status__in=ACTIVE_STATUSES)
        .order_by("-synced_at")
        .first()
    )
    if active:
        return active
    return user.subscriptions.filter(is_primary=True).first() or user.subscriptions.first()


def user_has_paid_access(user: WorkspaceUser) -> bool:
    sub = primary_subscription(user)
    return bool(sub and sub.status in ACTIVE_STATUSES)


def access_for_user(user: WorkspaceUser) -> str:
    return "chat" if user_has_paid_access(user) else "payment"


def login_payload(user: WorkspaceUser) -> dict:
    sub = primary_subscription(user)
    subscription_block = None
    if sub:
        subscription_block = {
            "customer": {
                "id": user.stripe_customer_id,
                "email": user.email,
                "name": user.business_name,
            },
            "subscription": subscription_to_api(sub),
        }
    return {
        "user": user_to_api(user),
        "subscription": subscription_block,
        "access": access_for_user(user),
    }
