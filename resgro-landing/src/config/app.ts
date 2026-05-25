function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function getWindowOrigin() {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}

export function isPortalHost() {
  return (
    import.meta.env.VITE_FORCE_APP_HOST === "true" ||
    window.location.hostname.startsWith("app.")
  );
}

export function getSiteOrigin() {
  // Vite dev: always stay on the current origin so local runs never jump to production URLs
  // even when `.env.local` defines VITE_SITE_URL / VITE_APP_URL for deployment.
  if (import.meta.env.DEV) {
    return getWindowOrigin();
  }

  if (import.meta.env.VITE_SITE_URL) {
    return trimTrailingSlash(import.meta.env.VITE_SITE_URL);
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return getWindowOrigin();
  }

  if (window.location.hostname.startsWith("app.")) {
    return `${window.location.protocol}//${window.location.hostname.replace(/^app\./, "")}`;
  }

  return `${window.location.protocol}//${window.location.hostname.replace(/^www\./, "")}`;
}

export function getAppOrigin() {
  if (import.meta.env.DEV) {
    return getWindowOrigin();
  }

  if (import.meta.env.VITE_APP_URL) {
    return trimTrailingSlash(import.meta.env.VITE_APP_URL);
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return getWindowOrigin();
  }

  if (window.location.hostname.startsWith("app.")) {
    return getWindowOrigin();
  }

  const hostname = window.location.hostname.replace(/^www\./, "").replace(/^app\./, "");
  return `${window.location.protocol}//app.${hostname}`;
}

const DEFAULT_PRODUCTION_API_ORIGIN =
  "https://resgro-api-432223990540.us-west2.run.app";

export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL);
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8888`;
  }

  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return `${window.location.protocol}//${window.location.hostname}:8888`;
  }

  // Production: auth/billing API is on Cloud Run — never the Netlify marketing origin.
  return DEFAULT_PRODUCTION_API_ORIGIN;
}

export function openPortal(path = "") {
  if (import.meta.env.DEV && path.startsWith("/#/")) {
    window.location.hash = path.slice(2);
    return;
  }
  window.location.href = `${getAppOrigin()}${path}`;
}

function isDemoSessionUser(userId: string | null, usersRaw: string | null): boolean {
  if (!userId || !usersRaw) return false;
  try {
    const users = JSON.parse(usersRaw) as Array<{ id?: string; email?: string }> | null;
    if (!Array.isArray(users)) return false;
    const user = users.find((u) => u.id === userId);
    return user?.email?.toLowerCase?.() === "demouser@resgro.ai";
  } catch {
    return false;
  }
}

function hasActiveSubscription(subscriptionRaw: string | null): boolean {
  if (!subscriptionRaw) return false;
  try {
    const parsed = JSON.parse(subscriptionRaw) as { subscription?: { status?: string | null } } | null;
    const status = parsed?.subscription?.status || "";
    return status === "trialing" || status === "active" || status === "past_due";
  } catch {
    return false;
  }
}

/**
 * "Open app" behavior:
 * - Logged in + paid (or demo user): open dashboard
 * - Logged in + not paid: show paywall prompt
 * - Not logged in: open login page
 */
export function openAppEntryPoint() {
  const sessionUserId = localStorage.getItem("resgro_session_user_id");
  const usersRaw = localStorage.getItem("resgro_workspace_users");
  const subscriptionRaw = localStorage.getItem("resgro_subscription");

  if (!sessionUserId) {
    openPortal("/#/get-started");
    return;
  }

  if (isDemoSessionUser(sessionUserId, usersRaw) || hasActiveSubscription(subscriptionRaw)) {
    openPortal("/#/app");
    return;
  }

  window.dispatchEvent(
    new CustomEvent("resgro-paywall-required", {
      detail: { message: "Please pay to continue" },
    }),
  );
}

