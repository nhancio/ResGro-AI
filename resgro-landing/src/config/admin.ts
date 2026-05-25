const DEFAULT_ADMIN_EMAILS =
  "nithin@theondemandcompany.com,demo@resgro.ai,demouser@resgro.ai";

export const ADMIN_EMAILS: string[] = (
  import.meta.env.VITE_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | undefined | null): boolean {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

/** Django admin UI (proxied at /admin/ on UI and API hosts in production). */
export function getDjangoAdminUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/admin/`;
  }
  return "/admin/";
}
