# ResGro deployment (landing + portal)

## Production stack

| Layer | Host | Deploy |
|-------|------|--------|
| Frontend (`resgro.ai`, `app.resgro.ai`) | **Netlify** | `./deploy.sh netlify prod` |
| Auth / Stripe API | **GCP Cloud Run** `resgro-api` | `./deploy.sh gcp api` |
| Django (users, admin) | **GCP Cloud Run** `resgro-backend` | `./deploy.sh gcp backend` |
| Agents (DeepDive, chat) | **GCP Cloud Run** `resgro-agents-api` | `./deploy.sh gcp agents` |

GCP does **not** host the frontend. Do not deploy `resgro-ui` (removed).

## Monorepo layout (ResgroAI-style)

| Path | Role |
|------|------|
| `resgro-landing/` | Marketing / landing Vite app, pricing, Stripe checkout UI, embedded portal |
| `agents/` (repo root) | Operator TS agents (deep dive, campaign flows, monthly reporter UI) **and** optional local API: `agents/resgro-browser-automation/` |
| `apis/netlify/functions/` | Stripe and session Netlify functions (see `resgro-landing/netlify.toml`) |
| `apis/netlify/package.json` | **Required:** `npm install` here so Netlify can bundle `stripe` (functions live outside `resgro-landing/`, so deps are not taken only from the Vite app). `./deploy.sh` and `./run.sh install` do this automatically. |
| `apis/http/` | Reserved for a future HTTP API (e.g. FastAPI) |

The landing app imports shared agent **contracts/UI** from repo-root `agents/` via the `@agents` alias (see `resgro-landing/vite.config.ts`).

## Target setup (single Netlify site)

Use **one** Netlify project for both the marketing site and the operator portal. The same `resgro-landing/` build is served everywhere; the app switches to portal mode when the hostname is `app.resgro.ai` (see `isPortalHost()` in `src/config/app.ts`).

| Domain | Role |
|--------|------|
| `https://resgro.ai` | Landing, pricing, Stripe checkout (calls `/.netlify/functions/*` on this host) |
| `https://app.resgro.ai` | Portal login, dashboard, post-payment return URL |

### Custom domains

In Netlify: **Site configuration → Domain management** add **both**:

1. `resgro.ai` (primary marketing domain; optional `www` redirect as you prefer)
2. `app.resgro.ai` (domain alias on the **same** site)

Point DNS at Netlify per their wizard (A/CNAME records). No second host (e.g. Vercel) is required.

## Netlify CLI

From the `resgro-landing/` directory:

```bash
netlify link    # or sites:create if starting fresh
netlify env:import .env
netlify deploy --prod
```

## Environment variables

Set in **Site configuration → Environment variables** (or `netlify env:import .env`). Used at build time (`VITE_*`) and by serverless functions (`STRIPE_*`).

```bash
VITE_EMAILJS_PUBLIC_KEY=...
VITE_EMAILJS_SERVICE_ID=...
VITE_EMAILJS_TEMPLATE_ID=...
VITE_STRIPE_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_SELFSERVE_PRICE_ID=...
STRIPE_AUTONOMY_PRICE_ID=...
VITE_SITE_URL=https://resgro.ai
VITE_APP_URL=https://app.resgro.ai
```

Do not set `VITE_FORCE_APP_HOST=true` on the Netlify site.** That flag forces portal/chat mode on every hostname, including `resgro.ai`.

`VITE_API_BASE_URL`, `VITE_AGENTS_API_URL`, `VITE_SITE_URL`, and `VITE_APP_URL` are set in `netlify.toml` for production builds. The browser calls Cloud Run directly for auth and agents (not Netlify `/api/*` redirects).

## Logins (production)

| Use | URL | Username | Password |
|-----|-----|----------|----------|
| **App / portal** | `https://app.resgro.ai` | `demouser@resgro.ai` | `demo@123` |
| **Django admin** | `https://resgro-api-432223990540.us-west2.run.app/admin/` | Value of `DJANGO_SUPERUSER_EMAIL` in `.env.gcp` | Value of `DJANGO_SUPERUSER_PASSWORD` |

The demo user is a **WorkspaceUser** (app sign-in). Django admin uses a separate **auth.User** superuser created by `ensure_superuser` on backend deploy.

**Do not set `VITE_FORCE_APP_HOST=true` on the Netlify site.** That flag forces portal/chat mode on every hostname, including `resgro.ai`. (It was only used by the retired GCP `resgro-ui` Cloud Run service.)

`VITE_AGENTS_API_URL` is set in `netlify.toml` for production builds. Agent uploads call that host directly from the browser (not Netlify redirects).

Optional: `VITE_AUTONOMY_API_URL` if the autonomy runner API is not on the default origin (see portal config).

## Production troubleshooting

| Symptom | Typical cause | Fix |
|--------|----------------|-----|
| **Unable to reach the server** on app login | SPA called `resgro.ai/api/accounts/*` (Netlify localhost proxy) instead of Cloud Run | Redeploy Netlify after `VITE_API_BASE_URL` fix in `netlify.toml` |
| Agent error: **Failed to fetch** on DeepDive upload | Total upload &gt; **32 MB** (Cloud Run limit). The 413 response has no CORS headers, so the browser reports a network error. | Upload fewer/smaller ZIPs per run (~30 MB max). |
| `resgro.ai` shows chat / portal welcome | Hash routes like `#/chat` or a saved workspace session on the marketing domain | Use `https://app.resgro.ai`; redeploy Netlify after the apex→app redirect fix. |
| Django admin **ERR_TOO_MANY_ACCEPT_CH_RESTARTS** | `resgro-api` Express redirected `/admin/` → `/admin/` in a loop | Redeploy `resgro-api` (`./deploy-gcp.sh api` or `./deploy.sh api`). Direct backend admin: `resgro-backend` `/admin/` works. |

## Workspace login

Portal sign-in uses the email and password created after checkout (`#/complete-signup`), stored in the browser user directory until you wire a backend.
