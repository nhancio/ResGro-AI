import django

django.setup()

from accounts.stripe_billing import subscription_period_end
from accounts.stripe_sync import _payment_status_for_subscriptions


def test_subscription_period_end_uses_subscription_item_fallback():
    sub = {
        "billing_cycle_anchor": 1782388212,
        "items": {
            "data": [
                {
                    "current_period_end": 1782388212,
                }
            ],
        },
    }

    assert subscription_period_end(sub) == 1782388212


def test_payment_status_prefers_paid_access_states():
    subs = [{"status": "incomplete"}, {"status": "trialing"}]

    assert _payment_status_for_subscriptions(subs) == "trialing"


def test_payment_status_defaults_to_pending_without_subscription():
    assert _payment_status_for_subscriptions([]) == "pending"
