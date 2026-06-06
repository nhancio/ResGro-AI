import json

import stripe
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone as dj_tz
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth_helpers import login_payload
from .models import Subscription, UserActivity, WorkspaceUser
from .passwords import hash_password, new_user_id, verify_password
from .serializers import subscription_to_api, user_to_api
from .stripe_sync import handle_webhook_event, sync_customer_id, sync_user_full

stripe.api_key = settings.STRIPE_SECRET_KEY


def _admin_auth_ok(request) -> bool:
    key = request.headers.get("X-Admin-Key", "")
    return bool(settings.ADMIN_API_KEY) and key == settings.ADMIN_API_KEY


@api_view(["POST"])
def login(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    if not email or not password:
        return Response(
            {"code": "validation_error", "error": "Email and password are required."},
            status=400,
        )

    user = WorkspaceUser.objects.filter(email=email).first()
    if not user:
        return Response(
            {
                "code": "not_registered",
                "error": "No account found for this email. Please sign up first.",
            },
            status=404,
        )

    if not user.password_hash or not verify_password(password, user.password_hash):
        return Response(
            {"code": "invalid_password", "error": "Incorrect password."},
            status=401,
        )

    if user.status == "suspended":
        return Response(
            {"code": "account_suspended", "error": "Your account has been suspended. Contact support."},
            status=403,
        )

    if user.stripe_customer_id:
        try:
            sync_user_full(user)
            user.refresh_from_db()
        except Exception as exc:
            print(f"login: stripe sync failed for {user.email}: {exc}")

    user.last_login_at = dj_tz.now()
    user.save(update_fields=["last_login_at"])

    return Response(login_payload(user))


@api_view(["POST"])
def signup(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    business_name = (request.data.get("businessName") or "").strip()
    restaurant_count = int(request.data.get("restaurantCount") or 1)
    date_of_birth = request.data.get("dateOfBirth") or ""
    region = request.data.get("region") or ""
    stripe_customer_id = (request.data.get("stripeCustomerId") or "").strip() or None

    if not email or len(password) < 8:
        return Response(
            {"code": "validation_error", "error": "Valid email and password (min 8 chars) required."},
            status=400,
        )
    if not business_name:
        return Response(
            {"code": "validation_error", "error": "Business name is required."},
            status=400,
        )

    if WorkspaceUser.objects.filter(email=email).exists():
        return Response(
            {"code": "already_registered", "error": "An account with this email already exists. Please sign in."},
            status=409,
        )

    if stripe_customer_id and WorkspaceUser.objects.filter(stripe_customer_id=stripe_customer_id).exists():
        return Response(
            {"code": "already_registered", "error": "This subscription is already linked to an account."},
            status=409,
        )

    user = WorkspaceUser.objects.create(
        id=new_user_id(),
        email=email,
        password_hash=hash_password(password),
        stripe_customer_id=stripe_customer_id,
        business_name=business_name,
        restaurant_count=restaurant_count,
        date_of_birth=date_of_birth,
        region=region,
        can_manage_users=True,
    )

    if stripe_customer_id:
        try:
            sync_user_full(user)
            user.refresh_from_db()
        except stripe.error.StripeError:
            pass

    payload = login_payload(user)
    if not stripe_customer_id:
        payload["access"] = "payment"
    return Response(payload, status=201)


@api_view(["POST"])
def update_profile(request):
    """Update editable profile fields for a workspace user."""
    user_id = (request.data.get("userId") or "").strip()
    if not user_id:
        return Response({"code": "validation_error", "error": "userId is required."}, status=400)

    user = WorkspaceUser.objects.filter(id=user_id).first()
    if not user:
        return Response({"code": "not_registered", "error": "User not found."}, status=404)

    fields: list[str] = []

    if "businessName" in request.data:
        business_name = (request.data.get("businessName") or "").strip()
        if not business_name:
            return Response({"code": "validation_error", "error": "Business name cannot be empty."}, status=400)
        user.business_name = business_name
        fields.append("business_name")

    if "restaurantCount" in request.data:
        try:
            count = int(request.data.get("restaurantCount"))
        except (TypeError, ValueError):
            return Response({"code": "validation_error", "error": "restaurantCount must be a number."}, status=400)
        if count < 1:
            return Response({"code": "validation_error", "error": "restaurantCount must be at least 1."}, status=400)
        user.restaurant_count = count
        fields.append("restaurant_count")

    if "region" in request.data:
        user.region = (request.data.get("region") or "").strip()
        fields.append("region")

    if "dateOfBirth" in request.data:
        user.date_of_birth = (request.data.get("dateOfBirth") or "").strip()
        fields.append("date_of_birth")

    if not fields:
        return Response({"code": "validation_error", "error": "No editable fields provided."}, status=400)

    user.save(update_fields=fields + ["updated_at"])
    return Response({"user": user_to_api(user)})


@api_view(["POST"])
def sync_from_stripe(request):
    secret = request.headers.get("X-Internal-Secret") or ""
    if secret != settings.SECRET_KEY and not settings.DEBUG:
        return Response({"error": "Forbidden"}, status=403)
    cid = request.data.get("stripeCustomerId")
    if not cid:
        return Response({"error": "stripeCustomerId required"}, status=400)
    user = sync_customer_id(cid)
    if not user:
        return Response({"error": "Customer not found"}, status=404)
    return Response(login_payload(user))


@csrf_exempt
@require_http_methods(["POST"])
def stripe_webhook(request):
    payload = request.body
    sig = request.META.get("HTTP_STRIPE_SIGNATURE", "")

    secrets = [s for s in (settings.STRIPE_WEBHOOK_SECRET, settings.STRIPE_WEBHOOK_SECRET_THIN) if s]

    event = None
    if secrets:
        last_err = None
        for secret in secrets:
            try:
                event = stripe.Webhook.construct_event(payload, sig, secret)
                break
            except (ValueError, stripe.error.SignatureVerificationError) as exc:
                last_err = exc
        if event is None:
            return HttpResponse(str(last_err), status=400)
    else:
        event = json.loads(payload)

    event_dict = event if isinstance(event, dict) else event.to_dict()

    # Thin payloads (v2 style) have "related_object" instead of "data.object".
    # Fetch the full object from the Stripe API when needed.
    if "related_object" in event_dict and "data" not in event_dict:
        etype = event_dict.get("type", "")
        related = event_dict.get("related_object") or {}
        obj_id = related.get("id", "")
        obj_type = related.get("type", "")

        obj = None
        try:
            if obj_type == "customer" or etype.startswith("customer.") and not etype.startswith("customer.subscription."):
                obj = stripe.Customer.retrieve(obj_id)
            elif obj_type == "subscription" or etype.startswith("customer.subscription."):
                obj = stripe.Subscription.retrieve(obj_id)
            elif obj_type == "invoice" or etype.startswith("invoice."):
                obj = stripe.Invoice.retrieve(obj_id)
            elif etype == "checkout.session.completed":
                obj = stripe.checkout.Session.retrieve(obj_id)
        except Exception as exc:
            print(f"webhook: failed to fetch {obj_type} {obj_id}: {exc}")

        if obj:
            obj_dict = obj.to_dict() if hasattr(obj, "to_dict") else obj
            event_dict = {**event_dict, "data": {"object": obj_dict}}
        else:
            return JsonResponse({"received": True, "skipped": "could not resolve thin payload"})

    handle_webhook_event(event_dict)
    return JsonResponse({"received": True})


@api_view(["GET"])
def health(_request):
    return Response({"ok": True, "service": "resgro-backend"})


# ── Admin API endpoints ──────────────────────────────────────────────────────

@api_view(["GET"])
def admin_list_users(request):
    if not _admin_auth_ok(request):
        return Response({"error": "Forbidden"}, status=403)
    users = WorkspaceUser.objects.all()
    data = []
    for u in users:
        subs = list(u.subscriptions.values(
            "stripe_subscription_id", "status", "plan_name",
            "current_period_end", "amount", "is_primary",
        ))
        data.append({
            "id": u.id,
            "email": u.email,
            "business_name": u.business_name,
            "status": u.status,
            "restaurant_count": u.restaurant_count,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat(),
            "subscriptions": subs,
        })
    return Response({"users": data})


@api_view(["GET"])
def admin_user_detail(request, user_id):
    if not _admin_auth_ok(request):
        return Response({"error": "Forbidden"}, status=403)
    try:
        u = WorkspaceUser.objects.get(id=user_id)
    except WorkspaceUser.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    subs = list(u.subscriptions.all().values())
    invoices = list(u.invoices.all().values())
    return Response({
        "user": user_to_api(u),
        "subscriptions": subs,
        "invoices": invoices,
    })


@api_view(["POST"])
def admin_suspend_user(request, user_id):
    if not _admin_auth_ok(request):
        return Response({"error": "Forbidden"}, status=403)
    try:
        u = WorkspaceUser.objects.get(id=user_id)
    except WorkspaceUser.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    u.status = "suspended"
    u.suspended_at = dj_tz.now()
    u.suspended_reason = request.data.get("reason", "")
    u.save(update_fields=["status", "suspended_at", "suspended_reason", "updated_at"])
    return Response({"ok": True, "status": u.status})


@api_view(["POST"])
def admin_activate_user(request, user_id):
    if not _admin_auth_ok(request):
        return Response({"error": "Forbidden"}, status=403)
    try:
        u = WorkspaceUser.objects.get(id=user_id)
    except WorkspaceUser.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    u.status = "active"
    u.suspended_at = None
    u.suspended_reason = ""
    u.save(update_fields=["status", "suspended_at", "suspended_reason", "updated_at"])
    return Response({"ok": True, "status": u.status})


@api_view(["POST"])
def admin_cancel_subscription(request, subscription_id):
    if not _admin_auth_ok(request):
        return Response({"error": "Forbidden"}, status=403)
    try:
        sub = Subscription.objects.get(stripe_subscription_id=subscription_id)
    except Subscription.DoesNotExist:
        return Response({"error": "Subscription not found"}, status=404)
    try:
        stripe.Subscription.cancel(sub.stripe_subscription_id)
    except stripe.error.StripeError as exc:
        return Response({"error": f"Stripe error: {exc}"}, status=502)
    sub.status = "canceled"
    sub.canceled_at = dj_tz.now()
    sub.save(update_fields=["status", "canceled_at"])
    return Response({"ok": True, "subscription_id": subscription_id, "status": "canceled"})


# ── User Activity tracking ──────────────────────────────────────────────────

@api_view(["POST"])
def log_activity(request):
    user_id = (request.data.get("userId") or "").strip()
    activity_type = (request.data.get("activityType") or "").strip()
    if not user_id or activity_type not in ("chat", "session", "run"):
        return Response({"error": "userId and valid activityType required."}, status=400)

    try:
        user = WorkspaceUser.objects.get(id=user_id)
    except WorkspaceUser.DoesNotExist:
        return Response({"error": "User not found."}, status=404)

    activity = UserActivity.objects.create(
        user=user,
        activity_type=activity_type,
        chat_id=(request.data.get("chatId") or "").strip(),
        session_id=(request.data.get("sessionId") or "").strip(),
        run_id=(request.data.get("runId") or "").strip(),
        agent_name=(request.data.get("agentName") or "").strip(),
        status=(request.data.get("status") or "active").strip(),
        meta=request.data.get("meta") or {},
    )
    return Response({
        "id": activity.id,
        "activityType": activity.activity_type,
        "chatId": activity.chat_id,
        "sessionId": activity.session_id,
        "runId": activity.run_id,
        "agentName": activity.agent_name,
        "status": activity.status,
        "createdAt": activity.created_at.isoformat(),
    }, status=201)


@api_view(["GET"])
def list_activity(request):
    user_id = request.query_params.get("userId", "").strip()
    if not user_id:
        return Response({"error": "userId query param required."}, status=400)

    try:
        user = WorkspaceUser.objects.get(id=user_id)
    except WorkspaceUser.DoesNotExist:
        return Response({"error": "User not found."}, status=404)

    activity_type = request.query_params.get("type", "").strip()
    qs = UserActivity.objects.filter(user=user)
    if activity_type:
        qs = qs.filter(activity_type=activity_type)

    limit = min(int(request.query_params.get("limit", "100")), 500)
    activities = qs[:limit]

    return Response({
        "activities": [
            {
                "id": a.id,
                "activityType": a.activity_type,
                "chatId": a.chat_id,
                "sessionId": a.session_id,
                "runId": a.run_id,
                "agentName": a.agent_name,
                "status": a.status,
                "meta": a.meta,
                "createdAt": a.created_at.isoformat(),
            }
            for a in activities
        ]
    })
