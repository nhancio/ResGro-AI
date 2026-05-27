from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import stripe
from django.conf import settings
from django.utils import timezone as dj_tz

from .models import Invoice, Subscription, WorkspaceUser
from .user_lookup import find_user_by_email

stripe.api_key = settings.STRIPE_SECRET_KEY


def _ts(unix: int | None) -> datetime | None:
    if not unix:
        return None
    return datetime.fromtimestamp(unix, tz=timezone.utc)


def _stripe_dict(obj) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict_recursive"):
        return obj.to_dict_recursive()
    if hasattr(obj, "_to_dict_recursive"):
        return obj._to_dict_recursive()
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return dict(obj)


def _subscription_period_end(sub_d: dict) -> int | None:
    period_end = sub_d.get("current_period_end")
    if period_end:
        return period_end
    items = (sub_d.get("items") or {}).get("data") or []
    if items:
        return (items[0] or {}).get("current_period_end")
    return sub_d.get("billing_cycle_anchor")


def _payment_status_from_subscription_status(status: str | None) -> str:
    if status in {"trialing", "active", "past_due"}:
        return status
    if status in {"canceled", "cancelled", "incomplete_expired"}:
        return "cancelled"
    if status == "unpaid":
        return "unpaid"
    return "pending"


def _payment_status_for_subscriptions(subscriptions: list[dict]) -> str:
    if not subscriptions:
        return "pending"
    statuses = [sub.get("status") for sub in subscriptions]
    for status in ("active", "trialing", "past_due"):
        if status in statuses:
            return status
    if "unpaid" in statuses:
        return "unpaid"
    if any(status in {"canceled", "cancelled", "incomplete_expired"} for status in statuses):
        return "cancelled"
    return _payment_status_from_subscription_status(statuses[0])


def _set_user_payment_status(user: WorkspaceUser, payment_status: str) -> None:
    if user.payment_status == payment_status:
        return
    user.payment_status = payment_status
    user.save(update_fields=["payment_status", "updated_at"])


def _plan_name(sub) -> str:
    meta = sub.get("metadata") or {}
    if meta.get("plan"):
        return meta["plan"]
    item = (sub.get("items") or {}).get("data") or []
    if not item:
        return "self-serve"
    price = item[0].get("price") or {}
    amount = price.get("unit_amount") or 0
    if amount >= 25000:
        return "autonomy"
    return "self-serve"


def upsert_user_from_stripe_customer(customer: dict | stripe.Customer) -> WorkspaceUser | None:
    if isinstance(customer, stripe.Customer):
        customer = customer.to_dict()

    meta = customer.get("metadata") or {}
    email = (meta.get("resgro_email") or customer.get("email") or "").strip().lower()
    user_id = meta.get("resgro_user_id")

    if not email and not user_id:
        return None

    existing = None
    if user_id:
        existing = WorkspaceUser.objects.filter(id=user_id).first()
    if not existing and email:
        existing = find_user_by_email(email)
    if not existing:
        existing = WorkspaceUser.objects.filter(stripe_customer_id=customer["id"]).first()

    defaults = {
        "stripe_customer_id": customer["id"],
        "business_name": meta.get("resgro_business_name") or customer.get("name") or "",
        "restaurant_count": int(meta.get("resgro_restaurant_count") or 1),
        "date_of_birth": meta.get("resgro_date_of_birth") or "",
        "region": meta.get("resgro_region") or "",
        "can_manage_users": meta.get("resgro_can_manage_users", "true") == "true",
        "stripe_synced_at": dj_tz.now(),
    }

    if existing:
        if email and not existing.email.endswith("@stripe.local"):
            defaults.pop("email", None)
        else:
            defaults["email"] = email or existing.email
        stripe_password = meta.get("resgro_password_hash", "")
        if stripe_password and not existing.password_hash:
            defaults["password_hash"] = stripe_password
        for key, value in defaults.items():
            setattr(existing, key, value)
        existing.save()
        return existing

    create_defaults = {
        **defaults,
        "email": email or f"unknown+{customer['id']}@stripe.local",
        "password_hash": meta.get("resgro_password_hash", ""),
        "id": user_id or f"usr_{customer['id'][-12:]}",
    }
    user, _ = WorkspaceUser.objects.update_or_create(
        stripe_customer_id=customer["id"],
        defaults=create_defaults,
    )
    return user


def sync_subscriptions_for_user(user: WorkspaceUser) -> None:
    if not user.stripe_customer_id:
        _set_user_payment_status(user, "pending")
        return
    subs = stripe.Subscription.list(customer=user.stripe_customer_id, status="all", limit=20)
    seen = set()
    synced_subscriptions = []
    for i, sub in enumerate(subs.data):
        sub_d = _stripe_dict(sub)
        synced_subscriptions.append(sub_d)
        seen.add(sub.id)
        item = (sub_d.get("items") or {}).get("data") or []
        price = item[0].get("price") if item else {}
        Subscription.objects.update_or_create(
            stripe_subscription_id=sub.id,
            defaults={
                "user": user,
                "stripe_price_id": price.get("id") or "",
                "status": sub.status,
                "plan_name": _plan_name(sub_d),
                "trial_start": _ts(sub.trial_start),
                "trial_end": _ts(sub.trial_end),
                "current_period_end": _ts(_subscription_period_end(sub_d)),
                "canceled_at": _ts(sub.canceled_at),
                "amount": Decimal((price.get("unit_amount") or 0) / 100),
                "currency": price.get("currency") or "aud",
                "interval": (price.get("recurring") or {}).get("interval") or "month",
                "is_primary": i == 0,
            },
        )
    Subscription.objects.filter(user=user).exclude(stripe_subscription_id__in=seen).delete()
    _set_user_payment_status(user, _payment_status_for_subscriptions(synced_subscriptions))


def sync_invoices_for_user(user: WorkspaceUser, limit: int = 24) -> None:
    if not user.stripe_customer_id:
        return
    invs = stripe.Invoice.list(customer=user.stripe_customer_id, limit=limit)
    for inv in invs.data:
        inv_d = _stripe_dict(inv)
        sub_id = inv_d.get("subscription") or ""
        if isinstance(sub_id, dict):
            sub_id = sub_id.get("id", "")
        Invoice.objects.update_or_create(
            stripe_invoice_id=inv.id,
            defaults={
                "user": user,
                "stripe_subscription_id": sub_id,
                "status": inv_d.get("status") or "",
                "amount_due": Decimal((inv_d.get("amount_due") or 0) / 100),
                "amount_paid": Decimal((inv_d.get("amount_paid") or 0) / 100),
                "currency": inv_d.get("currency") or "aud",
                "hosted_invoice_url": inv_d.get("hosted_invoice_url") or "",
                "invoice_pdf": inv_d.get("invoice_pdf") or "",
                "period_start": _ts(inv_d.get("period_start")),
                "period_end": _ts(inv_d.get("period_end")),
                "paid_at": _ts((inv_d.get("status_transitions") or {}).get("paid_at")),
            },
        )


def sync_user_full(user: WorkspaceUser) -> WorkspaceUser:
    if user.stripe_customer_id:
        customer = stripe.Customer.retrieve(user.stripe_customer_id)
        upsert_user_from_stripe_customer(customer)
        user.refresh_from_db()
        sync_subscriptions_for_user(user)
        sync_invoices_for_user(user)
    return user


def sync_customer_id(stripe_customer_id: str) -> WorkspaceUser | None:
    customer = stripe.Customer.retrieve(stripe_customer_id)
    user = upsert_user_from_stripe_customer(customer)
    if user:
        sync_subscriptions_for_user(user)
        sync_invoices_for_user(user)
    return user


def link_checkout_customer(stripe_customer_id: str, email: str = "") -> WorkspaceUser | None:
    """Attach a Stripe customer from checkout to an existing Django user when possible."""
    user = WorkspaceUser.objects.filter(stripe_customer_id=stripe_customer_id).first()
    if not user and email:
        user = find_user_by_email(email)
        if user and not user.stripe_customer_id:
            user.stripe_customer_id = stripe_customer_id
            user.save(update_fields=["stripe_customer_id", "updated_at"])
    synced = sync_customer_id(stripe_customer_id)
    if synced:
        return synced
    return user


def handle_webhook_event(event: dict) -> None:
    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}

    if etype == "checkout.session.completed":
        cid = obj.get("customer")
        if cid:
            sync_customer_id(cid)
        return

    if etype.startswith("customer.subscription."):
        cid = obj.get("customer")
        if cid:
            sync_customer_id(cid)
        return

    if etype.startswith("customer."):
        user = upsert_user_from_stripe_customer(obj)
        if user:
            sync_subscriptions_for_user(user)
        return

    if etype.startswith("invoice."):
        cid = obj.get("customer")
        if cid:
            user = sync_customer_id(cid)
            if user:
                sync_invoices_for_user(user)
        return
