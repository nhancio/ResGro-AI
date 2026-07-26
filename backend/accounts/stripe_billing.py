"""Stripe checkout, billing portal, and subscription helpers."""

from __future__ import annotations

from datetime import datetime, timezone

import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

ACTIVE_STATUSES = {"trialing", "active", "past_due"}


def to_iso(unix_seconds: int | None) -> str | None:
    if not unix_seconds:
        return None
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).isoformat()


def subscription_period_end(sub_d: dict) -> int | None:
    period_end = sub_d.get("current_period_end")
    if period_end:
        return period_end
    items = (sub_d.get("items") or {}).get("data") or []
    if items:
        return (items[0] or {}).get("current_period_end")
    return sub_d.get("billing_cycle_anchor")


def infer_plan_name(sub) -> str:
    meta = sub.get("metadata") if isinstance(sub, dict) else (sub.metadata or {})
    if meta.get("plan"):
        return meta["plan"]
    items = (sub.get("items") if isinstance(sub, dict) else sub).get("data", []) if isinstance(sub, dict) else sub.items.data
    product_name = ""
    if items:
        price = items[0].get("price") if isinstance(items[0], dict) else items[0].price
        if price:
            product = price.get("product") if isinstance(price, dict) else getattr(price, "product", None)
            if product:
                product_name = product.get("name", "") if isinstance(product, dict) else getattr(product, "name", "") or ""
    lower = product_name.lower()
    if "self-serve" in lower or "self serve" in lower:
        return "self-serve"
    if "autonomy" in lower or "pro" in lower:
        return "autonomy"
    amount = None
    if items:
        price = items[0].get("price") if isinstance(items[0], dict) else items[0].price
        amount = price.get("unit_amount") if isinstance(price, dict) else getattr(price, "unit_amount", None)
    if amount == 10000:
        return "self-serve"
    if amount == 25000:
        return "autonomy"
    return "self-serve"


def subscription_payload(customer, sub) -> dict | None:
    if not sub:
        return None
    sub_d = sub.to_dict() if hasattr(sub, "to_dict") else sub
    items = (sub_d.get("items") or {}).get("data") or []
    price = items[0].get("price") if items else {}
    return {
        "customer": {
            "id": customer.id if hasattr(customer, "id") else customer.get("id"),
            "email": customer.email if hasattr(customer, "email") else customer.get("email"),
            "name": customer.name if hasattr(customer, "name") else customer.get("name"),
        },
        "subscription": {
            "id": sub_d.get("id"),
            "status": sub_d.get("status"),
            "planName": infer_plan_name(sub_d),
            "trialStart": to_iso(sub_d.get("trial_start")),
            "trialEnd": to_iso(sub_d.get("trial_end")),
            "currentPeriodEnd": to_iso(subscription_period_end(sub_d)),
            "cancelAtPeriodEnd": bool(sub_d.get("cancel_at_period_end")),
            "plan": {
                "amount": (price.get("unit_amount") or 0) / 100,
                "currency": price.get("currency") or "aud",
                "interval": (price.get("recurring") or {}).get("interval") or "month",
            },
        },
    }


def verify_checkout_session(session_id: str) -> dict:
    session = stripe.checkout.Session.retrieve(
        session_id,
        expand=["subscription", "subscription.items.data.price", "customer"],
    )
    subscription = session.subscription
    sub_status = subscription.status if subscription and hasattr(subscription, "status") else None
    is_success = (
        session.payment_status == "paid"
        or session.status == "complete"
        or sub_status in ("trialing", "active")
    )
    if not is_success:
        return {
            "status": "failed",
            "message": "Payment was not completed. Please try again.",
        }

    customer = session.customer
    sub_d = subscription.to_dict() if subscription and hasattr(subscription, "to_dict") else None
    plan_name = None
    if sub_d:
        plan_name = infer_plan_name(sub_d)
    elif session.metadata and session.metadata.get("plan"):
        plan_name = session.metadata.get("plan")

    return {
        "status": "success",
        "customer": {
            "id": customer.id if customer else None,
            "email": (customer.email if customer else None) or (session.customer_details.email if session.customer_details else None),
            "name": (customer.name if customer else None) or (session.customer_details.name if session.customer_details else None),
        },
        "subscription": {
            "id": sub_d.get("id") if sub_d else None,
            "status": sub_d.get("status") if sub_d else None,
            "planName": plan_name,
            "trialStart": to_iso(sub_d.get("trial_start")) if sub_d else None,
            "trialEnd": to_iso(sub_d.get("trial_end")) if sub_d else None,
            "currentPeriodEnd": to_iso(subscription_period_end(sub_d)) if sub_d else None,
            "plan": {
                "amount": ((sub_d.get("items") or {}).get("data") or [{}])[0].get("price", {}).get("unit_amount", 0) / 100
                if sub_d
                else None,
                "currency": ((sub_d.get("items") or {}).get("data") or [{}])[0].get("price", {}).get("currency", "aud")
                if sub_d
                else "aud",
                "interval": ((sub_d.get("items") or {}).get("data") or [{}])[0]
                .get("price", {})
                .get("recurring", {})
                .get("interval", "month")
                if sub_d
                else "month",
            },
        },
    }


def map_invoice_status(status: str | None) -> str:
    if not status:
        return "Draft"
    if status == "paid":
        return "Paid"
    if status == "draft":
        return "Draft"
    if status == "open":
        return "Open"
    return "Upcoming"
