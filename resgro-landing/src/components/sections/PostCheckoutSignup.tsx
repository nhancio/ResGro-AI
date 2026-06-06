import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ArrowRight, Loader2, Store } from "lucide-react";
import type { SubscriptionData } from "../../hooks/useSubscription";
import { apiSignup, AuthApiError } from "../../config/authApi";
import { syncUserToLocal } from "../../hooks/usePortalAuth";

interface PostCheckoutSignupProps {
  subscription: SubscriptionData;
  onComplete: (userId: string) => void;
}

export function PostCheckoutSignup({ subscription, onComplete }: PostCheckoutSignupProps) {
  const stripeCustomerId = subscription.customer.id;
  const defaultEmail = (subscription.customer.email || "").trim();

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  // Intentionally NOT pre-filled from subscription.customer.name — that's the
  // Stripe billing (personal) name, not the business name. User must type it.
  const [businessName, setBusinessName] = useState("");
  const [restaurantCount, setRestaurantCount] = useState("1");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number.parseInt(restaurantCount, 10);
    if (!email.trim() || !password || password.length < 8) {
      setError("Use a valid email and a password of at least 8 characters.");
      return;
    }
    if (!businessName.trim()) {
      setError("Enter your business or group name.");
      return;
    }
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter how many restaurant locations you operate (1 or more).");
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiSignup({
        email: email.trim(),
        password,
        stripeCustomerId,
        businessName: businessName.trim(),
        restaurantCount: n,
        region: region.trim() || undefined,
      });
      syncUserToLocal(response.user);
      onComplete(response.user.id);
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "already_registered") {
        setError("An account with this email already exists. Sign in from the login page.");
      } else {
        setError(err instanceof Error ? err.message : "Could not create account.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7F2] px-4 py-10">
      <div className="mx-auto max-w-lg rounded-[2rem] border border-[#FF6B35]/10 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-[#FF6B35]/10 p-3">
            <Store className="h-6 w-6 text-[#FF6B35]" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">After checkout</p>
            <h1 className="text-2xl font-bold text-black">Create your workspace login</h1>
          </div>
        </div>
        <p className="mb-6 text-sm text-gray-600">
          Payment succeeded. Create the email and password you will use to access the portal. Use the same email you
          paid with when possible.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-black" htmlFor="signup-email">
              Work email
            </label>
            <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-black" htmlFor="signup-password">
              Password
            </label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-black" htmlFor="signup-business">
              Business / group name
            </label>
            <Input id="signup-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-black" htmlFor="signup-count">
              Number of restaurant locations
            </label>
            <Input
              id="signup-count"
              type="number"
              min={1}
              value={restaurantCount}
              onChange={(e) => setRestaurantCount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-black" htmlFor="signup-region">
              Region (optional)
            </label>
            <Input id="signup-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. NSW, AU" />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Button type="submit" disabled={submitting} variant="cta" className="mt-2 w-full rounded-full">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Save and enter workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
