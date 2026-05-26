from .models import Subscription, WorkspaceUser


def user_to_api(user: WorkspaceUser) -> dict:
    sub = user.subscriptions.filter(is_primary=True).first() or user.subscriptions.first()
    return {
        "id": user.id,
        "email": user.email,
        "stripeCustomerId": user.stripe_customer_id,
        "paymentStatus": user.payment_status,
        "canManageUsers": user.can_manage_users,
        "metadata": {
            "businessName": user.business_name,
            "restaurantCount": user.restaurant_count,
            "dateOfBirth": user.date_of_birth,
            "region": user.region,
        },
        "createdAt": user.created_at.isoformat(),
    }


def subscription_to_api(sub: Subscription) -> dict:
    return {
        "id": sub.stripe_subscription_id,
        "status": sub.status,
        "trialStart": sub.trial_start.isoformat() if sub.trial_start else None,
        "trialEnd": sub.trial_end.isoformat() if sub.trial_end else None,
        "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "canceledAt": sub.canceled_at.isoformat() if sub.canceled_at else None,
        "planName": sub.plan_name,
        "plan": {
            "amount": float(sub.amount or 0),
            "currency": sub.currency,
            "interval": sub.interval,
        },
    }
