from django.db import models


class WorkspaceUser(models.Model):
    """Registered ResGro operator — source of truth (synced with Stripe)."""

    id = models.CharField(max_length=32, primary_key=True)
    email = models.EmailField(unique=True, db_index=True)
    password_hash = models.CharField(max_length=256, blank=True)
    password_history = models.JSONField(default=list, blank=True)
    stripe_customer_id = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)

    business_name = models.CharField(max_length=255, blank=True)
    restaurant_count = models.PositiveIntegerField(default=1)
    date_of_birth = models.CharField(max_length=32, blank=True)
    region = models.CharField(max_length=64, blank=True)
    can_manage_users = models.BooleanField(default=True)

    status = models.CharField(
        max_length=20,
        choices=[("active", "Active"), ("suspended", "Suspended"), ("cancelled", "Cancelled")],
        default="active",
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=32,
        choices=[
            ("pending", "Pending"),
            ("trialing", "Trialing"),
            ("active", "Active"),
            ("past_due", "Past Due"),
            ("unpaid", "Unpaid"),
            ("cancelled", "Cancelled"),
        ],
        default="pending",
        db_index=True,
    )
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_reason = models.TextField(blank=True)

    reset_token = models.CharField(max_length=128, blank=True)
    reset_expiry = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    stripe_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} ({self.id})"


class Subscription(models.Model):
    user = models.ForeignKey(WorkspaceUser, on_delete=models.CASCADE, related_name="subscriptions")
    stripe_subscription_id = models.CharField(max_length=64, unique=True)
    stripe_price_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=32, db_index=True)
    plan_name = models.CharField(max_length=64, blank=True)

    trial_start = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)

    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, default="aud")
    interval = models.CharField(max_length=16, default="month")

    is_primary = models.BooleanField(default=True)
    synced_at = models.DateTimeField(auto_now=True)

    # Latest Stripe billing-portal (subscription management) link.
    # Portal session URLs expire after a few hours — this stores the most
    # recently generated one for reference in Django admin.
    management_url = models.URLField(max_length=1024, blank=True)
    management_url_created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-synced_at"]


class Invoice(models.Model):
    user = models.ForeignKey(WorkspaceUser, on_delete=models.CASCADE, related_name="invoices")
    stripe_invoice_id = models.CharField(max_length=64, unique=True)
    stripe_subscription_id = models.CharField(max_length=64, blank=True)

    status = models.CharField(max_length=32, db_index=True)
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default="aud")

    hosted_invoice_url = models.URLField(max_length=512, blank=True)
    invoice_pdf = models.URLField(max_length=512, blank=True)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_end"]


class UserActivity(models.Model):
    """Tracks chats, data sessions, and agent runs associated with a user."""

    ACTIVITY_TYPES = [
        ("chat", "Chat"),
        ("session", "Data Session"),
        ("run", "Agent Run"),
    ]

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(WorkspaceUser, on_delete=models.CASCADE, related_name="activities")
    activity_type = models.CharField(max_length=16, choices=ACTIVITY_TYPES, db_index=True)
    chat_id = models.CharField(max_length=128, blank=True, db_index=True)
    session_id = models.CharField(max_length=128, blank=True, db_index=True)
    run_id = models.CharField(max_length=128, blank=True, db_index=True)
    agent_name = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=32, default="active")
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "activity_type"], name="accounts_us_user_id_b3e5f7_idx"),
        ]

    def __str__(self):
        return f"{self.activity_type}:{self.chat_id or self.session_id or self.run_id} ({self.user.email})"


class ChatSession(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    user = models.ForeignKey(WorkspaceUser, on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=255, default="New Chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "-updated_at"], name="accounts_cs_user_updated_idx"),
        ]

    def __str__(self):
        return f"{self.title} ({self.user.email})"


class ChatMessage(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16)
    content = models.TextField(blank=True)
    timestamp = models.BigIntegerField()
    agent = models.CharField(max_length=64, blank=True)
    files = models.JSONField(default=list, blank=True)
    agent_result = models.JSONField(null=True, blank=True)
    process_state = models.JSONField(null=True, blank=True)
    ordering = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["ordering", "timestamp"]
        indexes = [
            models.Index(fields=["session", "ordering"], name="accounts_cm_session_ord_idx"),
        ]
