import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";
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
              Try Again
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

  return (
    <div className="bg-white min-h-screen font-sans flex items-center justify-center">
      <div className="text-center px-4 max-w-md">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="text-green-500" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-black mb-2">Welcome to {planName}!</h2>
        <p className="text-gray-500 text-sm mb-2">Your 30-day free trial has started.</p>
        <p className="text-gray-400 text-xs mb-6">
          Logged in as <span className="font-medium text-black">{displayEmail}</span>
        </p>
        <Button
          onClick={() => onComplete({ success: true, userId: verifiedUser?.id })}
          variant="cta"
          className="w-full min-h-[48px] h-12 text-base rounded-full"
        >
          Continue to dashboard
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
