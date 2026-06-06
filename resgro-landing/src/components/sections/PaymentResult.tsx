import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { CheckCircle, XCircle, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { useSubscription } from "../../hooks/useSubscription";
import { syncUserToLocal } from "../../hooks/usePortalAuth";
import type { WorkspaceUser } from "../../lib/userDirectory";

interface PaymentResultProps {
  sessionId: string;
  loginWithUserId: (userId: string) => void;
  onComplete: (result: { success: boolean; userId?: string }) => void;
}

export function PaymentResult({ sessionId, loginWithUserId, onComplete }: PaymentResultProps) {
  const { verifySession, loading, error, subscription } = useSubscription();
  const [verified, setVerified] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<WorkspaceUser | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (sessionId && !verified) {
      verifySession(sessionId).then((result) => {
        setVerified(true);
        if (result.success) {
          window.history.replaceState({}, "", window.location.pathname);
          if (result.user) {
            syncUserToLocal(result.user);
            loginWithUserId(result.user.id);
            setVerifiedUser(result.user);
          }
        }
      });
    }
  }, [sessionId, verified, verifySession, loginWithUserId]);

  useEffect(() => {
    if (!loading && verified) return;
    const timer = setTimeout(() => setTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, [loading, verified]);

  if ((loading || (!verified && !error)) && !timedOut) {
    return (
      <div className="bg-white min-h-screen font-sans flex items-center justify-center">
        <div className="text-center px-4">
          <Loader2 className="w-12 h-12 text-[#FF6B35] animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-black mb-2">Verifying your payment...</h2>
          <p className="text-gray-500 text-sm">Please wait while we confirm your subscription.</p>
        </div>
      </div>
    );
  }

  if (timedOut && !verified) {
    return (
      <div className="bg-white min-h-screen font-sans flex items-center justify-center">
        <div className="text-center px-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="text-yellow-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-black mb-2">Verification is taking longer than expected</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your payment was received. Please refresh the page or contact support if this persists.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => window.location.reload()} variant="cta" className="w-full min-h-[48px] h-12 text-base rounded-full">
              Refresh page
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              onClick={() => onComplete({ success: false })}
              variant="outline"
              className="w-full min-h-[48px] h-12 text-base rounded-full"
            >
              <ArrowLeft className="mr-2 w-5 h-5" />
              Back to plans
            </Button>
            <a href="mailto:contact@resgro.ai" className="text-sm text-gray-500 hover:text-[#FF6B35] transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className="bg-white min-h-screen font-sans flex items-center justify-center">
        <div className="text-center px-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <XCircle className="text-red-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-black mb-2">Payment Failed</h2>
          <p className="text-gray-500 text-sm mb-6">
            {error || "We couldn't verify your payment. Please try again or contact support."}
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => onComplete({ success: false })} variant="cta" className="w-full min-h-[48px] h-12 text-base rounded-full">
              <ArrowLeft className="mr-2 w-5 h-5" />
              Back to plans
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full min-h-[48px] h-12 text-base rounded-full">
              Check payment again
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <a href="mailto:contact@resgro.ai" className="text-sm text-gray-500 hover:text-[#FF6B35] transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  const planName = subscription.subscription.planName === "self-serve" ? "Pro" : "Max";
  const displayEmail = verifiedUser?.email || subscription.customer.email;
  const plan = subscription.subscription.plan;
  const trialEnd = subscription.subscription.trialEnd;
  const periodEnd = subscription.subscription.currentPeriodEnd;
  const formatDay = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  const details: { label: string; value: string }[] = [
    { label: "Plan", value: `ResGro ${planName} (${subscription.subscription.planName || "—"})` },
    {
      label: "Price",
      value: `$${plan.amount} ${plan.currency?.toUpperCase() || ""} / ${plan.interval || "month"}`,
    },
    { label: "Status", value: subscription.subscription.status || "—" },
    ...(formatDay(trialEnd)
      ? [{ label: "Free trial ends", value: formatDay(trialEnd)! }]
      : []),
    ...(formatDay(trialEnd || periodEnd)
      ? [{ label: "First charge on", value: formatDay(trialEnd || periodEnd)! }]
      : []),
    ...(displayEmail ? [{ label: "Account email", value: displayEmail }] : []),
  ];

  return (
    <div className="bg-white min-h-screen font-sans flex items-center justify-center">
      <div className="text-center px-4 max-w-md w-full py-10">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="text-green-500" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-black mb-2">
          Thank you for your subscription!
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Welcome to ResGro {planName}. Your 30-day free trial has started — here are
          your payment details.
        </p>

        {/* Payment details card */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 text-left mb-6 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 bg-white">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Subscription summary
            </span>
          </div>
          <div className="divide-y divide-gray-200">
            {details.map((d) => (
              <div key={d.label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-gray-500">{d.label}</span>
                <span className="text-sm font-medium text-black text-right">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 mb-5">
          A confirmation and invoice were sent to your email. You can manage your
          subscription anytime from Billing inside the app.
        </p>

        <Button
          onClick={() => onComplete({ success: true, userId: verifiedUser?.id })}
          variant="cta"
          className="w-full min-h-[48px] h-12 text-base rounded-full"
        >
          Continue to app
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
