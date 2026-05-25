/**
 * Base URL for the ResGro Agents API (FastAPI).
 * In Netlify Dev, streaming routes (e.g. /api/chat) time out if proxied — use direct :8001 when VITE_AGENTS_API_URL is set (see netlify.toml [context.dev]).
 */
const RAW_AGENTS_URL = import.meta.env.VITE_AGENTS_API_URL?.replace(/\/$/, "").trim();

export const AGENTS_ORIGIN = (() => {
  if (RAW_AGENTS_URL) return RAW_AGENTS_URL;
  if (import.meta.env.DEV) return "";
  return "https://resgro-agents-api-432223990540.us-west2.run.app";
})();

export const API_BASE =
  import.meta.env.DEV && RAW_AGENTS_URL
    ? `${RAW_AGENTS_URL}/api`
    : import.meta.env.DEV
      ? "/api"
      : `${AGENTS_ORIGIN}/api`;

/**
 * Resolves a path like `/api/runs/...` or a full report URL for fetch().
 */
export function resolveAgentsApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  const origin = AGENTS_ORIGIN || "";
  const isMarketingHost = (host: string) =>
    /^app\.resgro\.ai$/i.test(host) || /^(www\.)?resgro\.ai$/i.test(host);

  try {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      const u = new URL(pathOrUrl);
      const isReport =
        u.pathname.includes("/api/runs/deepdive/") && u.pathname.endsWith("/report");
      if (isReport && isMarketingHost(u.hostname)) {
        return `${origin}${u.pathname}${u.search}`;
      }
      return pathOrUrl;
    }
    if (pathOrUrl.startsWith("/")) {
      return origin ? `${origin}${pathOrUrl}` : pathOrUrl;
    }
    return `${API_BASE}/${pathOrUrl}`;
  } catch {
    return pathOrUrl;
  }
}
