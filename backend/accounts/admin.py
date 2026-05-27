import stripe
from django.conf import settings
from django.contrib import admin
from django.utils import timezone

from .models import ChatMessage, ChatSession, Invoice, Subscription, UserActivity, WorkspaceUser

stripe.api_key = settings.STRIPE_SECRET_KEY


# ---- Admin actions ----

@admin.action(description="Suspend selected users")
def suspend_users(modeladmin, request, queryset):
    queryset.update(status="suspended", suspended_at=timezone.now())


@admin.action(description="Activate selected users")
def activate_users(modeladmin, request, queryset):
    queryset.update(status="active", suspended_at=None, suspended_reason="")


@admin.action(description="Cancel subscriptions for selected users")
def cancel_subscriptions(modeladmin, request, queryset):
    for user in queryset:
        for sub in user.subscriptions.filter(status__in=["active", "trialing", "past_due"]):
            try:
                stripe.Subscription.cancel(sub.stripe_subscription_id)
                sub.status = "canceled"
                sub.canceled_at = timezone.now()
                sub.save(update_fields=["status", "canceled_at"])
            except stripe.error.StripeError as exc:
                modeladmin.message_user(
                    request,
                    f"Failed to cancel {sub.stripe_subscription_id}: {exc}",
                    level="error",
                )
        user.status = "cancelled"
        user.save(update_fields=["status", "updated_at"])


# ---- ModelAdmin classes ----

@admin.register(WorkspaceUser)
class WorkspaceUserAdmin(admin.ModelAdmin):
    list_display = ("email", "business_name", "status", "stripe_customer_id", "suspended_at", "created_at")
    list_filter = ("status",)
    search_fields = ("email", "id", "stripe_customer_id", "business_name")
    readonly_fields = ("created_at", "updated_at", "last_login_at", "stripe_synced_at")
    actions = [suspend_users, activate_users, cancel_subscriptions]


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "plan_name", "current_period_end")
    list_filter = ("status", "plan_name")


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "amount_due", "period_end")
    list_filter = ("status",)


@admin.register(UserActivity)
class UserActivityAdmin(admin.ModelAdmin):
    list_display = ("user", "activity_type", "chat_id", "session_id", "run_id", "agent_name", "status", "created_at")
    list_filter = ("activity_type", "status", "agent_name")
    search_fields = ("user__email", "chat_id", "session_id", "run_id", "agent_name")
    readonly_fields = ("created_at",)
    raw_id_fields = ("user",)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "updated_at", "created_at")
    list_filter = ("user",)
    search_fields = ("user__email", "title", "id")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "role", "agent", "ordering", "timestamp")
    list_filter = ("role", "agent")
    search_fields = ("session__id", "content")
    raw_id_fields = ("session",)
