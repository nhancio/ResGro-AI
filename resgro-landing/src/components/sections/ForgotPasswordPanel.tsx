import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CheckCircle, Mail } from "lucide-react";
import { apiForgotPassword, apiResetPassword } from "../../config/authApi";
import { getAppOrigin } from "../../config/app";

type ResetStep = "enter-email" | "email-sent" | "enter-code" | "done";

type ResetNotice = "success" | "warning" | "neutral";

interface ForgotPasswordPanelProps {
  onBack: () => void;
}

export function ForgotPasswordPanel({ onBack }: ForgotPasswordPanelProps) {
  const [resetStep, setResetStep] = useState<ResetStep>("enter-email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetNotice, setResetNotice] = useState<ResetNotice>("neutral");
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState("");

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!resetEmail.trim()) {
      setError("Enter your email address.");
      return;
    }

    setResetBusy(true);
    try {
      const result = await apiForgotPassword(resetEmail.trim());

      setResetStep("email-sent");
      if (result.emailDelivered === true) {
        setResetNotice("success");
        setResetMessage("A reset code has been sent to your email. Check your inbox (and spam folder).");
      } else if (result.emailSendFailed) {
        setResetNotice("warning");
        setResetMessage(
          "We found your account but could not send email (provider error). Try again in a few minutes or contact support.",
        );
      } else if (result.emailConfigured === false) {
        setResetNotice("warning");
        setResetMessage(
          "Password reset email is not configured yet (missing EmailJS or SMTP settings). Ask your admin to set the server environment variables.",
        );
      } else {
        setResetNotice("neutral");
        setResetMessage(
          "If this email is registered with ResGro, you will receive a reset code shortly. Check your spam folder. If nothing arrives, verify the address or contact support.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request password reset.");
    } finally {
      setResetBusy(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!resetCode.trim()) {
      setError("Enter the reset code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setResetBusy(true);
    try {
      const result = await apiResetPassword(
        resetEmail.trim(),
        resetCode.trim(),
        newPassword,
        getAppOrigin(),
      );
      if (!result.success) {
        setError(result.message);
        return;
      }
      setResetStep("done");
      setResetMessage("Password updated successfully! You can now sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {resetStep === "enter-email" && (
        <form onSubmit={handleForgotPassword} className="space-y-5">
          <div className="rounded-xl border border-[#333338] bg-[#1a1a1e] p-4">
            <p className="text-sm font-semibold text-white">Reset your password</p>
            <p className="mt-1 text-xs text-gray-400">
              Enter your account email. We&apos;ll send a reset code to verify your identity.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="reset-email" className="text-sm font-medium text-gray-200">
              Account email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@restaurant.com"
                className="h-12 rounded-xl border-[#333338] bg-[#242428] pl-10 text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-xl border border-[#333338] px-4 py-2.5 text-sm font-medium text-gray-400 hover:border-[#FF6B35]/50 hover:text-white"
            >
              Back
            </button>
            <Button type="submit" disabled={resetBusy} variant="cta" className="flex-1 rounded-xl">
              {resetBusy ? "Sending..." : "Send reset code"}
            </Button>
          </div>
        </form>
      )}

      {resetStep === "email-sent" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setResetStep("enter-code");
            setError("");
          }}
          className="space-y-5"
        >
          <div
            className="rounded-xl border border-[#333338] bg-[#1a1a1e] p-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle
                className={
                  resetNotice === "success"
                    ? "mt-0.5 h-5 w-5 text-green-400"
                    : resetNotice === "warning"
                      ? "mt-0.5 h-5 w-5 text-amber-400"
                      : "mt-0.5 h-5 w-5 text-gray-400"
                }
              />
              <div>
                <p
                  className={
                    resetNotice === "success"
                      ? "text-sm font-semibold text-green-200"
                      : resetNotice === "warning"
                        ? "text-sm font-semibold text-amber-200"
                        : "text-sm font-semibold text-white"
                  }
                >
                  {resetNotice === "success" ? "Email sent" : resetNotice === "warning" ? "Action needed" : "Request received"}
                </p>
                <p
                  className={
                    resetNotice === "success"
                      ? "mt-1 text-xs text-green-100/80"
                      : resetNotice === "warning"
                        ? "mt-1 text-xs text-amber-100/80"
                        : "mt-1 text-xs text-gray-400"
                  }
                >
                  {resetMessage}
                </p>
              </div>
            </div>
          </div>

          <Button type="submit" variant="cta" className="w-full rounded-xl">
            I have the code - continue
          </Button>

          <button
            type="button"
            onClick={onBack}
            className="w-full text-center text-sm font-medium text-gray-500 hover:text-[#FF6B35]"
          >
            Back to sign in
          </button>
        </form>
      )}

      {resetStep === "enter-code" && (
        <form onSubmit={handleResetPassword} className="space-y-5">
          <div className="rounded-xl border border-[#333338] bg-[#1a1a1e] p-4">
            <p className="text-sm font-semibold text-white">Enter reset code</p>
            <p className="mt-1 text-xs text-gray-400">
              Paste the 8-character code from your email, then set your new password.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">Reset code</label>
            <Input
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              placeholder="8-character code from email"
              className="h-12 rounded-xl border-[#333338] bg-[#242428] font-mono tracking-widest text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
              maxLength={64}
              autoComplete="one-time-code"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">New password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="h-12 rounded-xl border-[#333338] bg-[#242428] text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-200">Confirm password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="h-12 rounded-xl border-[#333338] bg-[#242428] text-white placeholder:text-gray-500 focus-visible:border-[#FF6B35]/60 focus-visible:ring-[#FF6B35]/20"
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-xl border border-[#333338] px-4 py-2.5 text-sm font-medium text-gray-400 hover:border-[#FF6B35]/50 hover:text-white"
            >
              Cancel
            </button>
            <Button type="submit" disabled={resetBusy} variant="cta" className="flex-1 rounded-xl">
              {resetBusy ? "Updating..." : "Reset password"}
            </Button>
          </div>
        </form>
      )}

      {resetStep === "done" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
            <CheckCircle className="mx-auto h-8 w-8 text-green-400" />
            <p className="mt-3 text-sm font-semibold text-green-100">Password updated</p>
            <p className="mt-1 text-xs text-green-100/70">You can now sign in with your new password.</p>
          </div>
          <Button type="button" onClick={onBack} variant="cta" className="w-full rounded-xl">
            Back to sign in
          </Button>
        </div>
      )}
    </div>
  );
}
