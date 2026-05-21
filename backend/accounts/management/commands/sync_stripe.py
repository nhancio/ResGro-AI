from django.core.management.base import BaseCommand

import stripe
from django.conf import settings

from accounts.stripe_sync import sync_customer_id, upsert_user_from_stripe_customer

stripe.api_key = settings.STRIPE_SECRET_KEY


class Command(BaseCommand):
    help = "Backfill WorkspaceUser, Subscription, and Invoice rows from Stripe."

    def handle(self, *args, **options):
        if not settings.STRIPE_SECRET_KEY:
            self.stderr.write("STRIPE_SECRET_KEY is not set.")
            return

        count = 0
        starting_after = None
        while True:
            params = {"limit": 100}
            if starting_after:
                params["starting_after"] = starting_after
            batch = stripe.Customer.list(**params)
            for c in batch.data:
                meta = c.metadata or {}
                if not meta.get("resgro_email") and not meta.get("resgro_user_id"):
                    continue
                upsert_user_from_stripe_customer(c)
                sync_customer_id(c.id)
                count += 1
                self.stdout.write(f"  synced {meta.get('resgro_email') or c.id}")

            if not batch.has_more or not batch.data:
                break
            starting_after = batch.data[-1].id

        self.stdout.write(self.style.SUCCESS(f"Done. Synced {count} customers."))
