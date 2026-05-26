import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Navbar } from "./components/layout/Navbar";
import { Hero } from "./components/sections/Hero";
import { MarketPain } from "./components/sections/MarketPain";
import { WhyMatters } from "./components/sections/WhyMatters";
import { Solution } from "./components/sections/Solution";
import { IntelligenceEngine } from "./components/sections/Intelligence";
import { Comparison } from "./components/sections/Comparison";
import { Engagement } from "./components/sections/Engagement";
import { Vision } from "./components/sections/Vision";
import { CaseStudy } from "./components/sections/CaseStudy";
import { PrivacyPolicy } from "./components/sections/PrivacyPolicy";
import { CTA } from "./components/sections/CTA";
import { AppPortal } from "./components/sections/AppPortal";
import { Pricing } from "./components/sections/Pricing";
import { PaymentResult } from "./components/sections/PaymentResult";
import { PostCheckoutSignup } from "./components/sections/PostCheckoutSignup";
import { PreCheckoutAuth } from "./components/sections/PreCheckoutAuth";
import { ChatApp } from "./components/chat/ChatApp";
import type { PlanType } from "./hooks/useSubscription";
import { SubscriptionData, useSubscription } from "./hooks/useSubscription";
import { usePortalAuth } from "./hooks/usePortalAuth";
import type { PortalAccess } from "./config/authApi";
import { getAppOrigin, getSiteOrigin, isPortalHost } from "./config/app";
import { getDjangoAdminUrl, isAdminEmail } from "./config/admin";
import { DEMO_EMAIL, getDemoUser, getSessionUser } from "./lib/userDirectory";
import type { WorkspaceUser } from "./lib/userDirectory";

type Page =
  | "home"
  | "privacy"
  | "get-started"
  | "app"
  | "chat"
  | "pricing"
  | "profile"
  | "payment-verify"
  | "complete-signup"
  | "old-portal";

function readPortalPageFromHash(): Page {
  if (typeof window === "undefined") return "get-started";
  const hash = window.location.hash;
  if (hash === "#/complete-signup") return "complete-signup";
  if (hash === "#/get-started" || hash === "#/login") return "get-started";
  if (hash === "#/pricing") return "pricing";
  if (hash === "#/demo") return "chat";
  if (hash === "#/old-portal") return "old-portal";
  if (hash === "#/profile") return "chat";
  // Chat is the default experience — #/app and #/chat both go to chat workspace
  return "chat";
}

/** Hash routes that mount the SaaS shell (billing, agents, profile). */
function isPortalHashRoute(hash: string): boolean {
  return (
    hash === "#/app" ||
    hash === "#/chat" ||
    hash === "#/pricing" ||
    hash === "#/get-started" ||
    hash === "#/login" ||
    hash === "#/profile" ||
    hash === "#/demo" ||
    hash === "#/complete-signup"
  );
}

/**
 * Keep paid users in the portal when the hash is cleared (logo click, browser back)
 * so we do not drop them onto marketing home or a state that looks like a logout.
 */
function shouldUsePortalMode(
  hash: string,
  opts: { portalHost: boolean; hasWorkspaceSession: boolean },
): boolean {
  if (opts.portalHost) return true;
  if (isPortalHashRoute(hash)) return true;
  if (opts.hasWorkspaceSession && (hash === "" || hash === "#")) return true;
  return false;
}

function buildDemoSubscription(): SubscriptionData {
  const trialStart = new Date().toISOString();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return {
    customer: {
      id: "cus_demo_paid",
      email: DEMO_EMAIL,
      name: "Demo Restaurant Group",
    },
    subscription: {
      id: "sub_demo_paid",
      status: "active",
      trialStart,
      trialEnd: null,
      currentPeriodEnd: periodEnd.toISOString(),
      planName: "autonomy",
      plan: {
        amount: 250,
        currency: "aud",
        interval: "month",
      },
    },
  };
}

function readInitialPage(portalHost: boolean): Page {
  if (typeof window === "undefined") {
    return portalHost ? "get-started" : "home";
  }
  const hash = window.location.hash;
  const hasWorkspaceSession = Boolean(getSessionUser());
  if (shouldUsePortalMode(hash, { portalHost, hasWorkspaceSession })) {
    return readPortalPageFromHash();
  }
  return "home";
}

function redirectLegacyAdminHash(hash: string, email: string | undefined): boolean {
  if (hash !== "#/admin") return false;
  if (email && isAdminEmail(email)) {
    window.location.href = getDjangoAdminUrl();
    return true;
  }
  window.location.hash = "#/get-started";
  return true;
}


function subscribeLocationHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

function getLocationHashSnapshot() {
  return window.location.hash;
}

export default function App() {
  const portalHost = isPortalHost();
  const routeHash = useSyncExternalStore(subscribeLocationHash, getLocationHashSnapshot, () => "");
  const [currentPage, setCurrentPage] = useState<Page>(() => readInitialPage(portalHost));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const { subscription, isActive, activePlan, logout: logoutSubscription } = useSubscription();
  const { login, loginWithUserId, logout, sessionUser } = usePortalAuth();

  /** Prefer hook state; fall back to localStorage so post-login render matches session immediately. */
  const sessionResolved = sessionUser ?? getSessionUser();
  const hasWorkspaceSession = Boolean(sessionResolved);
  const portalMode = shouldUsePortalMode(routeHash, { portalHost, hasWorkspaceSession });
  const isDemoSession = sessionResolved?.email?.toLowerCase() === DEMO_EMAIL;
  const effectiveSubscription = isDemoSession ? buildDemoSubscription() : subscription;
  const effectiveIsActive = isDemoSession || isActive;
  const hasMatchingActiveSubscription = useCallback(
    (user: WorkspaceUser): boolean => {
      if (user.email.toLowerCase() === DEMO_EMAIL) return true;
      if (!user.stripeCustomerId) return false;
      const status = subscription?.subscription?.status || "";
      const activeStatus = status === "trialing" || status === "active" || status === "past_due";
      return activeStatus && subscription?.customer?.id === user.stripeCustomerId;
    },
    [subscription],
  );

  const goToAdminIfAllowed = useCallback((email: string) => {
    if (window.location.hash !== "#/admin" || !isAdminEmail(email)) {
      return false;
    }
    window.location.href = getDjangoAdminUrl();
    return true;
  }, []);

  const handlePreCheckoutSuccess = useCallback(
    ({
      mode,
      user,
      access,
    }: {
      mode: "signin" | "signup";
      user: WorkspaceUser;
      access: PortalAccess;
    }) => {
      const email = user.email.toLowerCase();
      if (goToAdminIfAllowed(email)) {
        return;
      }
      const canChat = access === "chat" || hasMatchingActiveSubscription(user);
      if (canChat) {
        setCheckoutNotice(null);
        window.location.hash = "#/chat";
        setCurrentPage("chat");
        return;
      }
      setCheckoutNotice(
        mode === "signup"
          ? "Account created. Choose a plan to activate your workspace."
          : "Your account is set up, but payment is required before workspace access.",
      );
      window.location.hash = "#/pricing";
      setCurrentPage("pricing");
    },
    [goToAdminIfAllowed, hasMatchingActiveSubscription],
  );

  useEffect(() => {
    const syncLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("session_id");
      const hash = window.location.hash;
      const resolvedUser = sessionUser ?? getSessionUser();
      const hostIsPortal = isPortalHost();

      // Portal routes and logged-in workspace belong on app.resgro.ai, not the marketing apex.
      if (
        !hostIsPortal &&
        !import.meta.env.DEV &&
        shouldUsePortalMode(hash, {
          portalHost: false,
          hasWorkspaceSession: Boolean(resolvedUser),
        })
      ) {
        const appOrigin = getAppOrigin();
        if (!window.location.origin.startsWith(new URL(appOrigin).origin)) {
          const targetHash =
            hash && isPortalHashRoute(hash) ? hash : resolvedUser ? "#/chat" : "#/get-started";
          window.location.replace(
            `${appOrigin}${window.location.pathname}${window.location.search}${targetHash}`,
          );
          return;
        }
      }

      const portalModeNow = shouldUsePortalMode(hash, {
        portalHost: hostIsPortal,
        hasWorkspaceSession: Boolean(resolvedUser),
      });

      if (sid) {
        setSessionId(sid);
        setCurrentPage("payment-verify");
        return;
      }

      if (portalModeNow) {
        const userNow = sessionUser ?? getSessionUser();
        if (!userNow) {
          const allowWithoutSession =
            hash === "#/complete-signup" ||
            hash === "#/demo" ||
            hash === "#/get-started" ||
            hash === "#/login";
          if (!allowWithoutSession) {
            window.location.hash = "#/get-started";
            setCurrentPage("get-started");
            window.scrollTo(0, 0);
            return;
          }
        }

        if (redirectLegacyAdminHash(hash, userNow?.email?.toLowerCase())) {
          return;
        }

        if (hash === "#/chat" || hash === "#/app") {
          setCurrentPage("chat");
        } else if (hash === "#/pricing") {
          setCurrentPage("pricing");
        } else if (hash === "#/demo") {
          const demoUser = getDemoUser();
          if (demoUser) {
            loginWithUserId(demoUser.id);
          }
          setCurrentPage("app");
        } else if (hash === "#/complete-signup") {
          setCurrentPage("complete-signup");
        } else if (hash === "#/get-started" || hash === "#/login") {
          setCurrentPage("get-started");
        } else if (hash === "#/old-portal") {
          setCurrentPage("old-portal");
        } else if (hash === "#/profile") {
          setCurrentPage("chat");
        } else if (hash === "" || hash === "#") {
          setCurrentPage("chat");
        } else {
          setCurrentPage(readPortalPageFromHash());
        }
        window.scrollTo(0, 0);
        return;
      }

      if (hash === "#/privacy-policy") {
        setCurrentPage("privacy");
      } else if (hash === "#/get-started" || hash === "#/login") {
        setCurrentPage("get-started");
      } else if (hash === "#/pricing") {
        // After login/signup, session may be in localStorage before React re-renders sessionUser.
        const resolvedUser = sessionUser ?? getSessionUser();
        if (resolvedUser) {
          if (hasMatchingActiveSubscription(resolvedUser)) {
            window.location.hash = "#/chat";
            setCurrentPage("chat");
          } else {
            setCurrentPage("pricing");
          }
        } else {
          setCurrentPage("get-started");
          window.location.hash = "#/get-started";
        }
      } else if (hash === "#/app") {
        setCurrentPage("app");
      } else if (hash === "#/profile") {
        setCurrentPage("profile");
      } else {
        setCurrentPage("home");
      }

      window.scrollTo(0, 0);
    };

    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);

    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, [routeHash, sessionUser, loginWithUserId, hasMatchingActiveSubscription]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setPaywallMessage(detail?.message || "Please pay to continue");
    };
    window.addEventListener("resgro-paywall-required", handler as EventListener);
    return () => {
      window.removeEventListener("resgro-paywall-required", handler as EventListener);
    };
  }, []);

  const paywallModal = paywallMessage ? (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4">
      <div
        className="w-full max-w-md rounded-3xl border border-[#FF6B35]/25 bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <img src="/logo.png" alt="RESGRO Logo" className="h-6 w-auto" />
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#FF6B35]">ResGro</p>
        </div>
        <h3 className="text-xl font-bold text-black">Subscription required</h3>
        <p className="mt-2 text-sm text-gray-600">{paywallMessage}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setPaywallMessage(null)}
            className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-[#FF6B35] hover:text-[#FF6B35]"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              setPaywallMessage(null);
              window.location.hash = "#/pricing";
            }}
            className="flex-1 rounded-full bg-[#FF6B35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#FF8C42]"
          >
            View plans
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (currentPage === "payment-verify" && sessionId) {
    return (
      <PaymentResult
        sessionId={sessionId}
        loginWithUserId={loginWithUserId}
        onComplete={({ success, userId }) => {
          setSessionId(null);
          if (success) {
            if (userId) {
              loginWithUserId(userId);
            }
            const path = `${window.location.pathname}#/chat`;
            window.history.replaceState({}, "", path);
            if (portalHost) {
              setCurrentPage("chat");
            } else {
              window.location.href = `${getAppOrigin()}/#/chat`;
            }
          } else {
            window.location.href = `${getSiteOrigin()}/#/pricing`;
          }
        }}
      />
    );
  }

  if (portalMode && currentPage === "complete-signup") {
    if (!effectiveIsActive || !effectiveSubscription) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#FFF7F2] px-4">
          <p className="text-center text-sm text-gray-600">
            Complete checkout first, then return here to create your login.{" "}
            <a className="font-medium text-[#FF6B35]" href={`${getSiteOrigin()}/#/pricing`}>
              View pricing
            </a>
          </p>
        </div>
      );
    }
    return (
      <PostCheckoutSignup
        subscription={effectiveSubscription}
        onComplete={(userId) => {
          loginWithUserId(userId);
          window.location.hash = "#/chat";
          setCurrentPage("chat");
        }}
      />
    );
  }

  if (portalMode) {
    if (!sessionResolved) {
      return (
        <PreCheckoutAuth
          serverLogin={login}
          onBack={() => {
            window.location.href = getSiteOrigin();
          }}
          loginWithUserId={loginWithUserId}
          onSuccess={(payload) => {
            if (goToAdminIfAllowed(payload.user.email.toLowerCase())) {
              return;
            }
            handlePreCheckoutSuccess(payload);
          }}
        />
      );
    }

if (!effectiveIsActive || !effectiveSubscription) {
      return (
        <>
          <Pricing
            isSubscribed={false}
            activePlan={null}
            onLogout={() => {
              logout();
              logoutSubscription();
              window.location.hash = "#/get-started";
              setCurrentPage("get-started");
            }}
          />
          {checkoutNotice ? (
            <div className="fixed bottom-5 left-1/2 z-[120] w-[min(92vw,640px)] -translate-x-1/2 rounded-2xl border border-[#FF6B35]/25 bg-white px-5 py-4 text-sm text-gray-700 shadow-xl">
              {checkoutNotice}
            </div>
          ) : null}
        </>
      );
    }

    if (currentPage === "old-portal") {
      return (
        <AppPortal
          subscription={effectiveSubscription}
          sessionUser={sessionResolved}
          initialSection="dashboard"
          onLogout={() => {
            logout();
            window.location.hash = "#/get-started";
            setCurrentPage("get-started");
          }}
        />
      );
    }

    // Default: Chat AI Workspace is the primary experience
    return (
      <ChatApp
        subscription={effectiveSubscription}
        sessionUser={sessionResolved}
        onLogout={() => {
          logout();
          window.location.hash = "#/get-started";
          setCurrentPage("get-started");
        }}
      />
    );
  }

  if (currentPage === "pricing") {
    const effectivePlan = (effectiveSubscription?.subscription.planName as PlanType) ?? activePlan;
    return (
      <>
        <Pricing
          isSubscribed={effectiveIsActive}
          activePlan={effectivePlan}
          onLogout={
            sessionUser
              ? () => {
                  logout();
                  logoutSubscription();
                  setCheckoutNotice(null);
                  window.location.hash = "#/get-started";
                  setCurrentPage("get-started");
                }
              : undefined
          }
        />
        {checkoutNotice ? (
          <div className="fixed bottom-5 left-1/2 z-[120] w-[min(92vw,640px)] -translate-x-1/2 rounded-2xl border border-[#FF6B35]/25 bg-white px-5 py-4 text-sm text-gray-700 shadow-xl">
            {checkoutNotice}
          </div>
        ) : null}
        {paywallModal}
      </>
    );
  }

  if (currentPage === "get-started") {
    return (
      <>
        <PreCheckoutAuth
          serverLogin={login}
          onBack={() => {
            window.location.hash = "";
            setCurrentPage("home");
          }}
          loginWithUserId={loginWithUserId}
          onSuccess={handlePreCheckoutSuccess}
        />
        {paywallModal}
      </>
    );
  }

  if (currentPage === "privacy") {
    return (
      <>
        <div className="bg-white min-h-screen text-black font-sans selection:bg-orange-500/30">
          <nav className="bg-white border-b-2 border-[#FF6B35] sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 md:h-20 flex items-center justify-between gap-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = "";
                }}
                className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity min-w-0"
              >
                <img src="/logo.png" alt="RESGRO Logo" className="h-6 sm:h-8 w-auto" />
                <span className="text-xl sm:text-2xl font-bold tracking-tight text-black">
                  RES<span className="text-[#FF6B35]">GRO</span>
                </span>
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = "";
                }}
                className="text-sm font-medium text-[#FF6B35] hover:text-black transition-colors whitespace-nowrap py-2 px-3 min-h-[44px] flex items-center touch-manipulation"
              >
                &larr; Back to Home
              </a>
            </div>
          </nav>
          <PrivacyPolicy />
          <footer className="bg-white border-t border-gray-200 py-8 text-center text-black text-sm">
            &copy; {new Date().getFullYear()} RESGRO. All rights reserved. |{" "}
            <a href="mailto:contact@resgro.ai" className="text-[#FF6B35] hover:underline">
              contact@resgro.ai
            </a>
          </footer>
        </div>
        {paywallModal}
      </>
    );
  }

  return (
    <>
      <div
        className="bg-white min-h-screen text-black font-sans selection:bg-orange-500/30 overflow-x-hidden"
      >
        <Navbar isSubscribed={isActive} />
        <main className="overflow-x-hidden">
          <Hero isSubscribed={isActive} />
          <MarketPain />
          <WhyMatters />
          <Solution />
          <Comparison />
          <IntelligenceEngine />
          <Engagement />
          <Vision />
          <CaseStudy />
          <CTA />
        </main>
      </div>
      {paywallModal}
    </>
  );
}
