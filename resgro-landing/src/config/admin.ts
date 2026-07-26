const DEFAULT_ADMIN_EMAILS =
  "nithin@theondemandcompany.com,nithindidigam@resgro.ai,demo@resgro.ai,demouser@resgro.ai";

export const ADMIN_EMAILS: string[] = (
  import.meta.env.VITE_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | undefined | null): boolean {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

/** Prefer same-origin /admin on app.resgro.ai (nginx → Django). */
export function getDjangoAdminUrl(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:8080/admin/";
  }
  if (typeof window !== "undefined" && window.location.hostname.startsWith("app.")) {
    return `${window.location.origin}/admin/`;
  }
  const fromEnv =
    import.meta.env.VITE_DJANGO_ADMIN_URL || import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) {
    return `${String(fromEnv).replace(/\/$/, "")}/admin/`;
  }
  return "https://resgro-api-naawlb2ghq-ts.a.run.app/admin/";
}
