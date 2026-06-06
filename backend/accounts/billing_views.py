"""Checkout, billing portal, invoices, session verify — Django accounts API."""

from __future__ import annotations

import stripe
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .email_service import is_email_configured, send_password_changed_email, send_password_reset_email
from .models import Subscription, WorkspaceUser
from .passwords import hash_password, verify_password
from .stripe_billing import (
    ACTIVE_STATUSES,
    infer_plan_name,
    map_invoice_status,
    subscription_payload,
    to_iso,
    verify_checkout_session,
)
from .auth_helpers import login_payload
from .user_lookup import clear_reset_token, find_user_by_email, issue_reset_token, matches_reset_code

stripe.api_key = settings.STRIPE_SECRET_KEY


def _base_url(origin: str | None, fallback: str) -> str:
    return (origin or fallback).rstrip("/")


@api_view(["POST"])
def forgot_password(request):
    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response({"error": "Email is required."}, status=400)

    mail_configured = is_email_configured()
    user = find_user_by_email(email)
    base = {
        "success": True,
        "message": "If an account exists with that email, a reset code has been sent.",
    }

    if not user:
        return Response({**base, "emailDelivered": False, "emailConfigured": mail_configured})

    token = issue_reset_token(user)
    short_code = token[:8].upper()
    app_origin = request.data.get("appOrigin") or settings.APP_ORIGIN

    email_sent = False
    email_send_error = False
    if mail_configured:
        try:
            send_password_reset_email(
                to=email,
                name=user.business_name,
                short_code=short_code,
                app_origin=app_origin,
            )
            email_sent = True
        except Exception as exc:
            email_send_error = True
            print(f"forgot-password email error: {exc}")

    if email_sent:
        return Response({**base, "emailDelivered": True, "emailConfigured": True})

    if settings.EXPOSE_RESET_TOKEN_IN_API_RESPONSE:
        return Response({
            **base,
            "emailDelivered": False,
            "emailConfigured": mail_configured,
            "emailSendFailed": email_send_error,
            "_resetToken": token,
            "_email": email,
            "_businessName": user.business_name,
        })

    return Response({
        **base,
        "emailDelivered": False,
        "emailConfigured": mail_configured,
        "emailSendFailed": mail_configured and email_send_error,
    })


@api_view(["POST"])
def reset_password(request):
    email = (request.data.get("email") or "").strip().lower()
    code = request.data.get("code") or request.data.get("token") or ""
    new_password = request.data.get("newPassword") or ""

    if not email or not new_password:
        return Response({"error": "Email and new password are required."}, status=400)
    if len(new_password) < 8:
        return Response({"error": "Password must be at least 8 characters."}, status=400)
    if not code:
        return Response({"error": "Reset code is required."}, status=400)

    user = find_user_by_email(email)
    if not user:
        return Response({"error": "Invalid or expired reset link."}, status=400)

    if not matches_reset_code(user, code):
        return Response({"error": "Invalid or expired reset link."}, status=400)

    from django.utils import timezone as dj_tz

    if user.reset_expiry and user.reset_expiry < dj_tz.now():
        return Response({"error": "Reset link has expired. Please request a new one."}, status=400)

    recent_hashes = [user.password_hash] + (user.password_history or [])[:2]
    for old_hash in recent_hashes:
        if old_hash and verify_password(new_password, old_hash):
            return Response(
                {"error": "New password must be different from your last 3 passwords."},
                status=400,
            )

    old_hash = user.password_hash
    password_hash = hash_password(new_password)
    history = [old_hash] + (user.password_history or []) if old_hash else (user.password_history or [])
    user.password_hash = password_hash
    user.password_history = history[:3]
    user.save(update_fields=["password_hash", "password_history", "updated_at"])
    clear_reset_token(user)

    try:
        send_password_changed_email(
            to=email,
            name=user.business_name,
            app_origin=request.data.get("appOrigin") or settings.APP_ORIGIN,
        )
    except Exception as exc:
        print(f"reset-password email error: {exc}")

    return Response({
        "success": True,
        "message": "Password updated successfully. You can now log in.",
    })


@api_view(["POST"])
def create_checkout(request):
    plan = request.data.get("plan")
    if plan not in ("self-serve", "autonomy"):
        return Response({"error": "Invalid plan. Must be 'self-serve' or 'autonomy'."}, status=400)

    price_id = (
        settings.STRIPE_SELFSERVE_PRICE_ID
        if plan == "self-serve"
        else settings.STRIPE_AUTONOMY_PRICE_ID
    )
    if not price_id:
        return Response({"error": f"Missing Stripe price configuration for {plan}."}, status=500)

    origin = request.headers.get("Origin") or request.headers.get("origin")
    base_url = _base_url(request.data.get("origin") or origin, "https://resgro.ai")
    portal_url = _base_url(request.data.get("appOrigin"), settings.APP_ORIGIN or base_url)

    customer_email = (request.data.get("customerEmail") or "").strip().lower()
    metadata = {"plan": plan}
    session_kwargs: dict = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "metadata": metadata,
        "subscription_data": {"trial_period_days": 30, "metadata": {"plan": plan}},
        "success_url": f"{portal_url}/?session_id={{CHECKOUT_SESSION_ID}}#/app",
        "cancel_url": f"{base_url}/#/pricing",
    }

    force = request.data.get("force", False)

    if customer_email:
        metadata["resgro_email"] = customer_email
        session_kwargs["metadata"] = metadata
        user = find_user_by_email(customer_email)
        if user:
            metadata["resgro_user_id"] = user.id
            session_kwargs["metadata"] = metadata

            # --- Duplicate subscription guard ---
            if not force:
                existing = Subscription.objects.filter(
                    user=user,
                    status__in=["active", "trialing", "past_due"],
                ).first()
                if existing:
                    return Response(
                        {
                            "error": "Active subscription already exists",
                            "subscription_id": existing.stripe_subscription_id,
                        },
                        status=409,
                    )

            if user.stripe_customer_id:
                session_kwargs["customer"] = user.stripe_customer_id
            else:
                session_kwargs["customer_email"] = customer_email
        else:
            session_kwargs["customer_email"] = customer_email

    session = stripe.checkout.Session.create(**session_kwargs)
    return Response({"url": session.url})


@api_view(["POST"])
def create_billing_portal(request):
    customer_id = request.data.get("customerId")
    if not customer_id:
        return Response({"error": "Missing Stripe customer ID"}, status=400)

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=request.data.get("returnUrl") or f"{settings.APP_ORIGIN}/#/app",
    )

    # Store the latest subscription-management link on the user's subscriptions
    # so it is visible in Django admin.
    try:
        from django.utils import timezone as dj_tz

        user = WorkspaceUser.objects.filter(stripe_customer_id=customer_id).first()
        if user:
            user.subscriptions.update(
                management_url=session.url,
                management_url_created_at=dj_tz.now(),
            )
    except Exception as exc:
        print(f"create-billing-portal: failed to store management link: {exc}")

    return Response({"url": session.url})


@api_view(["POST"])
def get_billing_data(request):
    customer_id = request.data.get("customerId")
    subscription_id = request.data.get("subscriptionId")
    if not customer_id:
        return Response({"error": "Missing Stripe customer ID"}, status=400)

    try:
        invoice_list = stripe.Invoice.list(customer=customer_id, limit=10)
    except stripe.error.StripeError:
        return Response({"invoices": []})

    upcoming = None
    if subscription_id:
        # stripe-python v12+ removed Invoice.upcoming (replaced by create_preview).
        # Never let the preview lookup break the invoice history.
        try:
            if hasattr(stripe.Invoice, "upcoming"):
                upcoming = stripe.Invoice.upcoming(customer=customer_id, subscription=subscription_id)
            else:
                upcoming = stripe.Invoice.create_preview(
                    customer=customer_id, subscription=subscription_id
                )
        except Exception as exc:
            print(f"get-billing-data: upcoming invoice preview failed: {exc}")
            upcoming = None

    invoices = []
    for inv in invoice_list.data:
        try:
            invoices.append({
                "id": inv.id,
                "label": inv.description or (inv.lines.data[0].description if inv.lines.data else "Stripe invoice"),
                "amount": (inv.amount_due or 0) / 100,
                "status": map_invoice_status(inv.status),
                "date": to_iso(inv.status_transitions.paid_at if inv.status_transitions else inv.created),
                "hostedInvoiceUrl": inv.hosted_invoice_url,
                "invoicePdf": inv.invoice_pdf,
            })
        except Exception as exc:
            print(f"get-billing-data: skipping invoice {getattr(inv, 'id', '?')}: {exc}")

    if upcoming:
        try:
            invoices.insert(
                0,
                {
                    "id": getattr(upcoming, "id", None) or "upcoming",
                    "label": getattr(upcoming, "description", None) or "Upcoming charge",
                    "amount": (getattr(upcoming, "amount_due", 0) or 0) / 100,
                    "status": "Upcoming",
                    "date": to_iso(
                        getattr(upcoming, "period_end", None)
                        or getattr(upcoming, "next_payment_attempt", None)
                        or getattr(upcoming, "created", None)
                    ),
                    "hostedInvoiceUrl": getattr(upcoming, "hosted_invoice_url", None),
                    "invoicePdf": getattr(upcoming, "invoice_pdf", None),
                },
            )
        except Exception as exc:
            print(f"get-billing-data: skipping upcoming preview: {exc}")

    return Response({"invoices": invoices})


@api_view(["POST"])
def verify_session(request):
    session_id = request.data.get("session_id")
    if not session_id:
        return Response({"error": "Missing session_id"}, status=400)
    try:
        payload = verify_checkout_session(session_id)
    except stripe.error.StripeError as exc:
        return Response({"error": str(exc)}, status=400)

    if payload.get("status") != "success":
        return Response(payload)

    cid = (payload.get("customer") or {}).get("id")
    email = ((payload.get("customer") or {}).get("email") or "").strip().lower()
    if not cid:
        return Response(payload)

    try:
        from .stripe_sync import link_checkout_customer

        user = link_checkout_customer(cid, email)
        if user:
            lp = login_payload(user)
            payload["user"] = lp["user"]
            payload["access"] = lp["access"]
            if lp["subscription"]:
                payload["subscription"] = lp["subscription"]["subscription"]
                payload["customer"] = lp["subscription"]["customer"]
    except Exception as exc:
        print(f"verify-session: user linking failed for {cid}: {exc}")

    return Response(payload)


@api_view(["POST"])
def resolve_workspace_subscription(request):
    customer_id = request.data.get("customerId")
    if not customer_id or not str(customer_id).startswith("cus_"):
        return Response({"error": "Valid Stripe customer id is required."}, status=400)

    try:
        customer = stripe.Customer.retrieve(customer_id)
    except stripe.error.StripeError:
        return Response({"error": "Could not load customer."}, status=400)

    if getattr(customer, "deleted", False):
        return Response({"error": "Customer not found"}, status=404)

    listed = stripe.Subscription.list(customer=customer_id, status="all", limit=10)
    candidates = [s for s in listed.data if s.status in ACTIVE_STATUSES]
    sub_summary = candidates[0] if candidates else (listed.data[0] if listed.data else None)
    if not sub_summary:
        return Response({"data": None})

    sub = stripe.Subscription.retrieve(sub_summary.id, expand=["items.data.price.product"])
    return Response({"data": subscription_payload(customer, sub)})
