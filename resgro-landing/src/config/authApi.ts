import { getApiBaseUrl, getAppOrigin } from "./app";
import type { WorkspaceUser } from "../lib/userDirectory";

function accountsPath(path: string): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/api/accounts/${path}`;
}

export type AuthErrorCode =
  | "not_registered"
  | "invalid_password"
  | "already_registered"
  | "validation_error"
  | "unknown";

export class AuthApiError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(accountsPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data.code as AuthErrorCode) || "unknown";
    throw new AuthApiError(code, data.error || data.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export type PortalAccess = "chat" | "payment";

export interface LoginResponse {
  user: WorkspaceUser;
  subscription: {
    customer: { id: string; email: string; name: string };
    subscription: {
      id: string;
      status: string;
      trialStart: string | null;
      trialEnd: string | null;
      currentPeriodEnd: string | null;
      planName: string;
      plan: { amount: number; currency: string; interval: string };
    };
  } | null;
  access: PortalAccess;
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  return post<LoginResponse>("login", { email, password });
}

export async function apiSignup(params: {
  email: string;
  password: string;
  businessName: string;
  restaurantCount: number;
  region?: string;
  stripeCustomerId?: string;
}): Promise<LoginResponse> {
  return post<LoginResponse>("signup", params);
}

export async function apiUpdateProfile(params: {
  userId: string;
  businessName?: string;
  restaurantCount?: number;
  region?: string;
  dateOfBirth?: string;
}): Promise<{ user: WorkspaceUser }> {
  return post<{ user: WorkspaceUser }>("update-profile", params);
}

export async function apiForgotPassword(email: string): Promise<{
  success: boolean;
  message: string;
  emailDelivered?: boolean;
  emailConfigured?: boolean;
  emailSendFailed?: boolean;
  _resetToken?: string;
  _email?: string;
  _businessName?: string;
}> {
  return post("forgot-password", { email, appOrigin: getAppOrigin() });
}

export async function apiResetPassword(
  email: string,
  code: string,
  newPassword: string,
  appOrigin?: string,
): Promise<{ success: boolean; message: string }> {
  return post("reset-password", { email, code, newPassword, appOrigin });
}

export async function apiLogActivity(params: {
  userId: string;
  activityType: "chat" | "session" | "run";
  chatId?: string;
  sessionId?: string;
  runId?: string;
  agentName?: string;
  status?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await post("activity", params);
  } catch {
    // fire-and-forget — don't break the UI if activity logging fails
  }
}
