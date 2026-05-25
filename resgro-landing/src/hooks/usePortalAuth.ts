import { useCallback, useMemo, useState } from "react";
import {
  clearSessionUser,
  getSessionUser,
  setSessionUserId,
} from "../lib/userDirectory";
import type { WorkspaceUser } from "../lib/userDirectory";
import { getStoredSubscription, storeSubscription, RESGRO_SUBSCRIPTION_REFRESH } from "./useSubscription";
import { apiLogin, AuthApiError, type PortalAccess } from "../config/authApi";

export type LoginResult =
  | { success: true; user: WorkspaceUser; access: PortalAccess }
  | {
      success: false;
      code: "not_registered" | "invalid_password" | "network" | "unknown";
      message: string;
    };

export function usePortalAuth() {
  const [sessionTick, setSessionTick] = useState(0);

  const sessionUser = useMemo((): WorkspaceUser | null => {
    void sessionTick;
    return getSessionUser();
  }, [sessionTick]);

  const isAuthenticated = Boolean(sessionUser);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await apiLogin(email, password);
      syncUserToLocal(response.user);
      setSessionUserId(response.user.id);

      if (response.subscription) {
        storeSubscription(response.subscription);
        window.dispatchEvent(new Event(RESGRO_SUBSCRIPTION_REFRESH));
      }

      setSessionTick((t) => t + 1);
      return { success: true, user: response.user, access: response.access };
    } catch (err) {
      if (err instanceof AuthApiError) {
        if (err.code === "not_registered") {
          return {
            success: false,
            code: "not_registered",
            message: err.message,
          };
        }
        if (err.code === "invalid_password") {
          return {
            success: false,
            code: "invalid_password",
            message: err.message,
          };
        }
        return { success: false, code: "unknown", message: err.message };
      }
      if (err instanceof TypeError) {
        return {
          success: false,
          code: "network",
          message: "Unable to reach the server. Check your connection and try again.",
        };
      }
      return {
        success: false,
        code: "unknown",
        message: err instanceof Error ? err.message : "Sign in failed.",
      };
    }
  }, []);

  const loginWithUserId = useCallback((userId: string) => {
    setSessionUserId(userId);
    setSessionTick((t) => t + 1);
  }, []);

  const logout = useCallback(() => {
    clearSessionUser();
    setSessionTick((t) => t + 1);
  }, []);

  return { isAuthenticated, sessionUser, login, loginWithUserId, logout };
}

export function syncUserToLocal(user: WorkspaceUser) {
  try {
    const raw = localStorage.getItem("resgro_workspace_users");
    const users: WorkspaceUser[] = raw ? JSON.parse(raw) : [];
    const idx = users.findIndex(
      (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase(),
    );
    const localUser: WorkspaceUser = {
      ...user,
      passwordHash: "server-managed",
    };
    if (idx >= 0) {
      users[idx] = localUser;
    } else {
      users.push(localUser);
    }
    localStorage.setItem("resgro_workspace_users", JSON.stringify(users));
  } catch {
    // Non-critical — session id still drives routing
  }
}

export function readStoredAccess(): PortalAccess | null {
  const sub = getStoredSubscription();
  const status = sub?.subscription?.status || "";
  if (status === "trialing" || status === "active" || status === "past_due") {
    return "chat";
  }
  return null;
}
