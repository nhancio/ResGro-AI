import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ArrowLeft, ArrowRight, Lock, Mail, Store } from "lucide-react";
import type { WorkspaceUser } from "../../lib/userDirectory";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";
import { apiSignup, AuthApiError, type PortalAccess } from "../../config/authApi";
import type { LoginResult } from "../../hooks/usePortalAuth";
import { syncUserToLocal } from "../../hooks/usePortalAuth";

interface PreCheckoutAuthProps {
  onBack: () => void;
  loginWithUserId: (userId: string) => void;
  onSuccess: (payload: { mode: AuthMode; user: WorkspaceUser; access: PortalAccess }) => void;
  serverLogin: (email: string, password: string) => Promise<LoginResult>;
}

type AuthMode = "signin" | "signup";

export function PreCheckoutAuth({ onBack, loginWithUserId, onSuccess, serverLogin }: PreCheckoutAuthProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [authSubview, setAuthSubview] = useState<"form" | "forgot">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [restaurantCount, setRestaurantCount] = useState("1");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === "signup") {
      const count = Number.parseInt(restaurantCount, 10);
      if (!businessName.trim()) {
        setError("Business name is required.");
        return;
      }
      if (!Number.isFinite(count) || count < 1) {
        setError("Restaurant count must be at least 1.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!dateOfBirth) {
        setError("Date of birth is required.");
        return;
      }
      if (!termsAccepted) {
        setError("You must agree to the Terms and Conditions and Privacy Policy.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const result = await serverLogin(email, password);
        if (!result.success) {
          if (result.code === "not_registered") {
            setError("No account found for this email. Please sign up first.");
          } else if (result.code === "invalid_password") {
            setError("Incorrect password.");
          } else {
            setError(result.message);
          }
          return;
        }
        onSuccess({ mode, user: result.user, access: result.access });
        return;
      }

      const count = Number.parseInt(restaurantCount, 10);
      const response = await apiSignup({
        email: email.trim(),
        password,
        businessName: businessName.trim(),
        restaurantCount: count,
        dateOfBirth,
      });
      syncUserToLocal(response.user);
      loginWithUserId(response.user.id);
      onSuccess({ mode, user: response.user, access: response.access });
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "already_registered") {
        setError("An account with this email already exists. Please sign in.");
        setMode("signin");
      } else {
        setError(err instanceof Error ? err.message : "Authentication failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1e] px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col justify-center">
        <div className="rounded-2xl border border-[#2a2a2e] bg-[#202024] p-5 shadow-2xl shadow-black/30 sm:p-7">
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-[#FF6B35]"
          >
            <ArrowLeft size={16} />
            Back to home
          </button>

          <div className="mb-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B35] text-lg font-bold text-white shadow-lg shadow-[#FF6B35]/20">
                R
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#FF6B35]">ResGro AI</p>
                <h1 className="text-2xl font-bold text-white">Get started</h1>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-400">Sign in or create an account before payment.</p>
          </div>

          {authSubview === "forgot" ? (
            <ForgotPasswordPanel
              onBack={() => {
                setAuthSubview("form");
                setError(null);
              }}
            />
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-[#333338] bg-[#1a1a1e] p-1">
                <Button
                  type="button"
                  variant={mode === "signin" ? "cta" : "ghost"}
                  className={`rounded-lg shadow-none hover:shadow-none ${mode === "signin" ? "" : "text-gray-400 hover:bg-[#242428] hover:text-white"}`}
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={mode === "signup" ? "cta" : "ghost"}
                  className={`rounded-lg shadow-none hover:shadow-none ${mode === "signup" ? "" : "text-gray-400 hover:bg-[#242428] hover:text-white"}`}
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Sign up
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="auth-email" className="text-sm font-medium text-gray-200">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-12 rounded-xl border-[#333338] bg-[#242428] pl-10 text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="auth-password" className="text-sm font-medium text-gray-200">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <Input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 rounded-xl border-[#333338] bg-[#242428] pl-10 text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                      required
                    />
                  </div>
                </div>

                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="auth-business" className="text-sm font-medium text-gray-200">
                        Business name
                      </label>
                      <div className="relative">
                        <Store className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <Input
                          id="auth-business"
                          value={businessName}
                          onChange={(event) => setBusinessName(event.target.value)}
                          className="h-12 rounded-xl border-[#333338] bg-[#242428] pl-10 text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="auth-restaurants" className="text-sm font-medium text-gray-200">
                        Number of restaurants
                      </label>
                      <Input
                        id="auth-restaurants"
                        type="number"
                        min={1}
                        value={restaurantCount}
                        onChange={(event) => setRestaurantCount(event.target.value)}
                        className="h-12 rounded-xl border-[#333338] bg-[#242428] text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="auth-dob" className="text-sm font-medium text-gray-200">
                        Date of birth
                      </label>
                      <Input
                        id="auth-dob"
                        type="date"
                        value={dateOfBirth}
                        onChange={(event) => setDateOfBirth(event.target.value)}
                        className="h-12 rounded-xl border-[#333338] bg-[#242428] text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                        required
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm leading-6 text-gray-400">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-1 accent-[#FF6B35]"
                      />
                      <span>
                        I agree to the{" "}
                        <a href="#/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#FF6B35] hover:text-[#FF8C42]">
                          Terms and Conditions
                        </a>{" "}
                        and{" "}
                        <a href="#/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#FF6B35] hover:text-[#FF8C42]">
                          Privacy Policy
                        </a>
                      </span>
                    </label>
                  </>
                )}

                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
                )}

                <Button type="submit" disabled={busy} variant="cta" className="h-12 w-full rounded-xl">
                  {busy ? "Please wait..." : mode === "signup" ? "Continue to payment" : "Continue"}
                  {!busy && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>

              {mode === "signin" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setAuthSubview("forgot");
                    }}
                    className="mt-4 w-full text-center text-sm font-medium text-[#FF6B35] hover:text-[#FF8C42]"
                  >
                    Forgot password?
                  </button>
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Forgot your email?{" "}
                    <a href="mailto:contact@resgro.ai" className="font-medium text-[#FF6B35] hover:text-[#FF8C42]">
                      Contact support
                    </a>
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
