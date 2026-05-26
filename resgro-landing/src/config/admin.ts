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

const DJANGO_BACKEND_URL = "https://resgro-backend-432223990540.us-west2.run.app";

export function getDjangoAdminUrl(): string {
  if (import.meta.env.DEV) {
    return "http://localhost:8080/admin/";
  }
  return `${DJANGO_BACKEND_URL}/admin/`;
}
