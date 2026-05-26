"""Ensure the local demo portal account exists in WorkspaceUser (not auth.User)."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone as dj_tz

from accounts.models import Subscription, WorkspaceUser
from accounts.passwords import hash_password, verify_password

DEMO_USER_ID = "usr_demo0000000001"
DEMO_EMAIL = "demouser@resgro.ai"
DEMO_PASSWORD = "demo@123"
DEMO_STRIPE_CUSTOMER = "cus_demo_paid"
DEMO_STRIPE_SUB = "sub_demo_paid"


class Command(BaseCommand):
    help = "Create or update demouser@resgro.ai in accounts.WorkspaceUser for app login."

    def handle(self, *args, **options):
        password_hash = hash_password(DEMO_PASSWORD)
        user, created = WorkspaceUser.objects.update_or_create(
            email=DEMO_EMAIL,
            defaults={
                "password_hash": password_hash,
                "stripe_customer_id": DEMO_STRIPE_CUSTOMER,
                "business_name": "Demo Restaurant Group",
                "restaurant_count": 1,
                "date_of_birth": "1990-01-01",
                "region": "AU",
                "can_manage_users": True,
            },
            create_defaults={
                "id": DEMO_USER_ID,
            },
        )

        period_end = dj_tz.now() + timedelta(days=30)
        Subscription.objects.update_or_create(
            stripe_subscription_id=DEMO_STRIPE_SUB,
            defaults={
                "user": user,
                "stripe_price_id": "price_demo",
                "status": "active",
                "plan_name": "autonomy",
                "current_period_end": period_end,
                "amount": 250,
                "currency": "aud",
                "interval": "month",
                "is_primary": True,
            },
        )

        ok = verify_password(DEMO_PASSWORD, user.password_hash)
        verb = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} WorkspaceUser {DEMO_EMAIL} (password check: {'ok' if ok else 'FAILED'})"
            )
        )
        self.stdout.write(
            "Note: Django admin Users (auth.User) are separate — app sign-in uses Accounts → Workspace users."
        )
