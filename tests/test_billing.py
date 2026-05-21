"""Tests for duplicate subscription guard in billing_views.create_checkout."""

from unittest.mock import MagicMock, patch

import pytest

import django
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


@pytest.fixture(autouse=True)
def setup_django():
    try:
        django.setup()
    except RuntimeError:
        pass


@pytest.fixture
def mock_stripe():
    with patch("accounts.billing_views.stripe") as m:
        m.checkout.Session.create.return_value = MagicMock(url="https://checkout.stripe.com/test")
        yield m


@pytest.fixture
def rf():
    from rest_framework.test import APIRequestFactory
    return APIRequestFactory()


class TestDuplicateSubscriptionGuard:
    def test_blocks_checkout_with_active_subscription(self, rf, mock_stripe):
        from accounts.billing_views import create_checkout
        from accounts.models import Subscription, WorkspaceUser

        with patch.object(WorkspaceUser.objects, "filter") as user_filter:
            mock_user = MagicMock()
            mock_user.id = "usr-1"
            mock_user.stripe_customer_id = "cus_test"

            with patch("accounts.billing_views.find_user_by_email", return_value=mock_user):
                mock_sub = MagicMock()
                mock_sub.stripe_subscription_id = "sub_existing"

                with patch.object(Subscription.objects, "filter") as sub_filter:
                    sub_filter.return_value.first.return_value = mock_sub

                    request = rf.post("/create-checkout", {
                        "plan": "self-serve",
                        "customerEmail": "test@example.com",
                    }, format="json")

                    response = create_checkout(request)
                    assert response.status_code == 409
                    assert "Active subscription already exists" in str(response.data)

    def test_allows_checkout_with_force_flag(self, rf, mock_stripe):
        from accounts.billing_views import create_checkout

        with patch("accounts.billing_views.find_user_by_email") as find_user:
            mock_user = MagicMock()
            mock_user.id = "usr-1"
            mock_user.stripe_customer_id = "cus_test"
            find_user.return_value = mock_user

            request = rf.post("/create-checkout", {
                "plan": "self-serve",
                "customerEmail": "test@example.com",
                "force": True,
            }, format="json")

            response = create_checkout(request)
            assert response.status_code == 200

    def test_allows_checkout_without_existing_subscription(self, rf, mock_stripe):
        from accounts.billing_views import create_checkout
        from accounts.models import Subscription

        with patch("accounts.billing_views.find_user_by_email") as find_user:
            mock_user = MagicMock()
            mock_user.id = "usr-1"
            mock_user.stripe_customer_id = "cus_test"
            find_user.return_value = mock_user

            with patch.object(Subscription.objects, "filter") as sub_filter:
                sub_filter.return_value.first.return_value = None

                request = rf.post("/create-checkout", {
                    "plan": "self-serve",
                    "customerEmail": "test@example.com",
                }, format="json")

                response = create_checkout(request)
                assert response.status_code == 200

