from django.urls import path

from . import billing_views, chat_views, views

urlpatterns = [
    path("health", views.health),
    path("login", views.login),
    path("signup", views.signup),
    path("update-profile", views.update_profile),
    path("forgot-password", billing_views.forgot_password),
    path("reset-password", billing_views.reset_password),
    path("create-checkout", billing_views.create_checkout),
    path("create-billing-portal", billing_views.create_billing_portal),
    path("get-billing-data", billing_views.get_billing_data),
    path("verify-session", billing_views.verify_session),
    path("resolve-workspace-subscription", billing_views.resolve_workspace_subscription),
    path("sync-from-stripe", views.sync_from_stripe),
    path("webhooks/stripe", views.stripe_webhook),
    # Admin API
    path("admin/users", views.admin_list_users),
    path("admin/users/<str:user_id>", views.admin_user_detail),
    path("admin/users/<str:user_id>/suspend", views.admin_suspend_user),
    path("admin/users/<str:user_id>/activate", views.admin_activate_user),
    path("admin/subscriptions/<str:subscription_id>/cancel", views.admin_cancel_subscription),
    # Activity tracking
    path("activity", views.log_activity),
    path("activity/list", views.list_activity),
    # Chat sessions
    path("chat-sessions/list", chat_views.list_sessions),
    path("chat-sessions/get", chat_views.get_session),
    path("chat-sessions/save", chat_views.save_session),
    path("chat-sessions/delete", chat_views.delete_session),
]
