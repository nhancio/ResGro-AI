# ResGro API (HTTP adapter for Netlify functions)

This service runs the same handlers as `apis/netlify/functions` on **Google Cloud Run**, a VM, or any Node host. Routes:

- `POST /.netlify/functions/<name>`
- `POST /api/<name>`

Names: `auth-login`, `auth-signup`, `auth-forgot-password`, `auth-reset-password`, `create-checkout`, `create-billing-portal`, `get-billing-data`, `verify-session`.

## Environment

See `env.example`. Load the same secrets you use on Netlify (Stripe, `ALLOWED_ORIGINS`, email for password reset).

Password reset email is sent **from the server** when EmailJS (`VITE_EMAILJS_*`) or `SMTP_*` is set. Without email configured, set `EXPOSE_RESET_TOKEN_IN_API_RESPONSE=true` only on local/staging.

## Deploy to Cloud Run

**Build context must be the repository root** (the Dockerfile copies `apis/netlify/`).

Do **not** use `--source apis/http` alone — that zip omits `apis/netlify` and the build fails.

### Option A — Cloud Build (no local Docker)

From the **repository root**:

```bash
gcloud config set project resgro-ai
gcloud run deploy resgro-api \
  --source . \
  --dockerfile apis/http/Dockerfile \
  --region us-west2 \
  --allow-unauthenticated \
  --env-vars-file .env.gcp
```

(Use a filtered env file for the API if `.env.gcp` includes `VITE_*` — or run `./deploy-gcp.sh api`.)

### Option B — Local Docker + push

```bash
docker build -f apis/http/Dockerfile -t REGION-docker.pkg.dev/PROJECT/REPO/resgro-api:latest .
gcloud run deploy resgro-api \
  --image REGION-docker.pkg.dev/PROJECT/REPO/resgro-api:latest \
  --region REGION \
  --allow-unauthenticated
```

Point the marketing/app site at this API with `VITE_API_BASE_URL=https://YOUR_RUN_URL` (no trailing slash). The frontend calls `/.netlify/functions/...` under that base.

## Health

`GET /health` returns `{ "ok": true, "service": "resgro-api" }`.
