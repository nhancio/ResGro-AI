"""Create a Django admin user from env when missing (Cloud Run bootstrap)."""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create auth superuser from DJANGO_SUPERUSER_EMAIL / DJANGO_SUPERUSER_PASSWORD if unset."

    def handle(self, *args, **options):
        email = (os.environ.get("DJANGO_SUPERUSER_EMAIL") or "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD") or ""
        if not email or not password:
            return

        User = get_user_model()
        if User.objects.filter(email__iexact=email).exists():
            user = User.objects.get(email__iexact=email)
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save(update_fields=["password", "is_staff", "is_superuser"])
            self.stdout.write(f"Updated superuser: {email}")
            return

        User.objects.create_superuser(
            username=email,
            email=email,
            password=password,
        )
        self.stdout.write(f"Created superuser: {email}")
