import React, { useState } from "react";
import { Button } from "../ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  BarChart3,
  Bot,
  CheckCircle,
  User,
  Loader2,
} from "lucide-react";
import { redirectToCheckout } from "../../config/stripe";
import { PlanType } from "../../hooks/useSubscription";
import { getAppOrigin, openPortal } from "../../config/app";
import { getSessionUser } from "../../lib/userDirectory";

interface PricingProps {
  isSubscribed?: boolean;
  activePlan?: PlanType;
  onLogout?: () => void;
}

export function Pricing({ isSubscribed = false, activePlan = null, onLogout }: PricingProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (plan: "self-serve" | "autonomy") => {
    setLoadingPlan(plan);
    await redirectToCheckout(plan, getSessionUser()?.email);
    setLoadingPlan(null);
  };
  return (
    <div
      className="bg-white min-h-screen font-sans"
    >
      {/* Top bar */}
      <nav className="bg-white border-b-2 border-[#FF6B35] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = "";
            }}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="RESGRO Logo" className="h-6 sm:h-7 w-auto" />
            <span className="text-lg sm:text-xl font-bold tracking-tight text-black">
              RES<span className="text-[#FF6B35]">GRO</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            {isSubscribed && (
              <a
                href={`${getAppOrigin()}/#/profile`}
                className="text-sm font-medium text-[#FF6B35] hover:text-black transition-colors flex items-center gap-1"
              >
                <User size={16} />
                My Profile
              </a>
            )}
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="text-sm font-medium text-gray-600 hover:text-[#FF6B35] transition-colors"
              >
                Logout
              </button>
            ) : null}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = "";
              }}
              className="text-sm font-medium text-gray-600 hover:text-[#FF6B35] transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={16} />
              Back to Home
            </a>
          </div>
        </div>
      </nav>

      {/* Pricing Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-black mb-4">
            Choose Your <span className="text-[#FF6B35]">Plan</span>
          </h1>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            Choose the level of agent access your team needs. Self Serve includes manual modes only, while Autonomous unlocks both manual and auto modes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
          {/* Self Serve Plan */}
          <div className={`rounded-2xl border-2 ${activePlan === "self-serve" ? "border-green-500" : "border-gray-200"} bg-white p-6 sm:p-8 flex flex-col relative overflow-hidden`}>
            {activePlan === "self-serve" && (
              <div className="absolute top-4 right-4">
                <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} />
                  ACTIVE
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <BarChart3 className="text-blue-600" size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-black">Self Serve</h3>
                <p className="text-xs text-gray-500">Manual agent modes</p>
              </div>
            </div>

            <div className="mb-2">
              <span className="text-4xl font-bold text-black">$100</span>
              <span className="text-gray-500 text-base ml-1">AUD / month</span>
            </div>
            <p className="text-sm text-blue-600 font-medium mb-6">
              {activePlan === "self-serve"
                ? "You're subscribed — manual modes unlocked"
                : "First month free — 30-day trial"}
            </p>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Full delivery analytics dashboard",
                "Access to manual modes across RalphAI agents",
                "Upload reports and run recommendations manually",
                "UberEats & DoorDash performance insights",
                "Report generation & export",
                "Google Sheets integration",
                "Email support",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {activePlan === "self-serve" ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => { openPortal(); }}
                  variant="cta-blue"
                  className="w-full min-h-[48px] h-12 text-base rounded-full"
                >
                  <CheckCircle className="mr-2 w-5 h-5" />
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => handleCheckout("self-serve")}
                disabled={!!loadingPlan}
                variant="cta-blue"
                className="w-full min-h-[48px] h-12 text-base rounded-full disabled:opacity-60"
              >
                {loadingPlan === "self-serve" ? (
                  <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Redirecting...</>
                ) : (
                  <>Start Free Trial <ArrowRight className="ml-2 w-5 h-5" /></>
                )}
              </Button>
            )}
          </div>

          {/* Automous Plan */}
          <div className={`rounded-2xl border-2 ${activePlan === "autonomy" ? "border-green-500" : "border-[#FF6B35]"} bg-white p-6 sm:p-8 flex flex-col relative overflow-hidden`}>
            <div className="absolute top-4 right-4">
              {activePlan === "autonomy" ? (
                <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} />
                  ACTIVE
                </span>
              ) : (
                <span className="bg-[#FF6B35] text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center">
                <Bot className="text-[#FF6B35]" size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-black">Autonomous</h3>
                <p className="text-xs text-gray-500">Manual + auto agent modes</p>
              </div>
            </div>

            <div className="mb-2">
              <span className="text-4xl font-bold text-black">$250</span>
              <span className="text-gray-500 text-base ml-1">AUD / month</span>
            </div>
            <p className="text-sm text-[#FF6B35] font-medium mb-6">
              {activePlan === "autonomy"
                ? "You're subscribed — manual and auto modes unlocked"
                : "First month free — 30-day trial"}
            </p>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Everything in Self Serve",
                "Access to both manual and auto modes",
                "Auto-login to merchant portals",
                "Automated report downloads and workflows",
                "Run browser agents hands-free",
                "AI-powered marketing campaigns",
                "Priority support",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check size={16} className="text-[#FF6B35] mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {activePlan === "autonomy" ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => { openPortal(); }}
                  variant="cta"
                  className="w-full min-h-[48px] h-12 text-base rounded-full"
                >
                  <CheckCircle className="mr-2 w-5 h-5" />
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => handleCheckout("autonomy")}
                disabled={!!loadingPlan}
                variant="cta"
                className="w-full min-h-[48px] h-12 text-base rounded-full disabled:opacity-60"
              >
                {loadingPlan === "autonomy" ? (
                  <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Redirecting...</>
                ) : (
                  <>Start Free Trial <ArrowRight className="ml-2 w-5 h-5" /></>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="text-center mt-10">
          <p className="text-gray-500 text-sm">Complete signup and payment to unlock your dashboard.</p>
        </div>

        <p className="text-center text-gray-400 text-xs mt-8">
          All prices in AUD. 30-day free trial on all plans. Cancel anytime. No lock-in contracts.
        </p>
      </div>
    </div>
  );
}
