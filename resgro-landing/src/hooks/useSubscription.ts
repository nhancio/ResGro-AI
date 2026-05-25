import { useState, useCallback, useEffect } from "react";
import { getApiBaseUrl } from "../config/app";

export const RESGRO_SUBSCRIPTION_REFRESH = "resgro-subscription-refresh";

export type PlanType = "self-serve" | "autonomy" | null;

export interface SubscriptionData {
  customer: {
    id: string | null;
    email: string | null;
    name: string | null;
  };
  subscription: {
    id: string | null;
    status: string | null;
    /** ISO — Stripe `trial_start` when trialing (omitted on older stored sessions). */
    trialStart?: string | null;
    trialEnd: string | null;
    currentPeriodEnd: string | null;
    planName: string | null;
    plan: {
      amount: number;
      currency: string;
      interval: string;
    };
  };
}

const STORAGE_KEY = "resgro_subscription";
const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

export function getStoredSubscription(): SubscriptionData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function storeSubscription(data: SubscriptionData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearSubscription() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSubscribed(): boolean {
  const subscription = getStoredSubscription();
  return Boolean(
    subscription && ACTIVE_STATUSES.has(subscription.subscription.status || "")
  );
}

export function getActivePlan(): PlanType {
  const sub = getStoredSubscription();
  if (!sub) return null;
  return sub.subscription.planName as PlanType;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    getStoredSubscription
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifySession = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${getApiBaseUrl().replace(/\/$/, "")}/api/accounts/verify-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        },
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data?.message || data?.error || "Payment verification failed";
        setError(message);
        return { success: false, message };
      }

      if (data.status === "success") {
        const subData: SubscriptionData = {
          customer: data.customer,
          subscription: data.subscription,
        };
        storeSubscription(subData);
        setSubscription(subData);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(RESGRO_SUBSCRIPTION_REFRESH));
        }
        return {
          success: true,
          planName: data.subscription.planName,
          user: data.user ?? null,
          access: data.access ?? null,
        };
      } else {
        const message = data?.message || data?.error || "Payment verification failed";
        setError(message);
        return { success: false, message };
      }
    } catch {
      setError("Unable to verify payment. Please contact support.");
      return { success: false, message: "Network error" };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSubscription();
    setSubscription(null);
  }, []);

  const isActive = Boolean(
    subscription && ACTIVE_STATUSES.has(subscription.subscription.status || "")
  );
  const activePlan: PlanType = isActive
    ? (subscription?.subscription?.planName as PlanType) || null
    : null;

  useEffect(() => {
    const onRefresh = () => {
      setSubscription(getStoredSubscription());
    };
    window.addEventListener(RESGRO_SUBSCRIPTION_REFRESH, onRefresh);
    return () => window.removeEventListener(RESGRO_SUBSCRIPTION_REFRESH, onRefresh);
  }, []);

  return { subscription, loading, error, verifySession, logout, isActive, activePlan };
}
