# GitHub Actions → GCP Cloud Run deploy

## What it does

Workflow: [`.github/workflows/deploy-gcp.yml`](../.github/workflows/deploy-gcp.yml)

| Trigger | Action |
|---------|--------|
| Push to `main` (app paths) | `./gcp_deploy.sh --cloudbuild all` |
| Actions → **Deploy GCP Cloud Run** → Run workflow | Choose `all` / `backend` / `api` / `agents` / `ui` |

Deploys to project **`resgroai`**, region **`australia-southeast1`**.

Custom domains stay on the existing HTTPS load balancer (`resgro.ai` / `app.resgro.ai`); this pipeline only rebuilds Cloud Run services.

## Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Purpose |
|--------|---------|
| `GCP_SA_KEY` | JSON key for `github-actions@resgroai.iam.gserviceaccount.com` |
| `RESGRO_ENV` | Full production `.env` (same file used locally with `gcp_deploy.sh`) |
| `GCP_PROJECT_ID` | Optional; default `resgroai` |
| `GCP_REGION` | Optional; default `australia-southeast1` |

Update `RESGRO_ENV` whenever production env vars change:

```bash
gh secret set RESGRO_ENV --repo nhancio/ResGro-AI < .env
```

## Manual run

```bash
gh workflow run "Deploy GCP Cloud Run" --repo nhancio/ResGro-AI -f target=ui
```

## Local deploy (unchanged)

```bash
./gcp_deploy.sh --cloudbuild all
# or: backend | api | agents | ui
```
