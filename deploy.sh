#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Deploy landing, portal, APIs, and Django accounts backend
#
# Default: GCP backends (Django + API + agents). Frontend is Netlify only.
#   ./deploy.sh                    # backend → api → agents (GCP)
#   ./deploy.sh backend            # Django only (resgro-backend)
#   ./deploy.sh gcp [backend|api|agents|all] [--cloudbuild|--docker]
#   ./deploy.sh netlify prod       # resgro.ai + app.resgro.ai (frontend)
#
# Django (users DB, auth, billing) runs on Cloud Run only — not Vercel/Netlify.
# Vercel is optional alternate static host; production frontend is Netlify.
#
# Vercel (marketing + portal SPA only):
#   ./deploy.sh vercel             # production
#   ./deploy.sh vercel preview     # preview URL
#
# Legacy Netlify (marketing site; Stripe functions in apis/netlify):
#   ./deploy.sh netlify [prod|draft]
#
# Requires (GCP): gcloud — see deploy-gcp.sh and .env.gcp.example
# Requires (Vercel): Node/npm, Vercel CLI (`npm i -g vercel`)
# Requires (Netlify): Node/npm, Netlify CLI (`npm i -g netlify-cli`)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$ROOT_DIR/resgro-landing"
NETLIFY_FN_ROOT="$ROOT_DIR/apis/netlify"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"

header() { echo ""; echo "=== $1 ==="; }

load_gcp_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' not found."
    exit 1
  fi
}

# GCP targets → deploy-gcp.sh (Django + API + agents on Cloud Run; no resgro-ui)
is_gcp_target() {
  case "$1" in
    gcp|all|backend|api|agents) return 0 ;;
    --cloudbuild|-c|--docker|-d) return 0 ;;
  esac
  return 1
}

run_gcp_deploy() {
  local -a args=()
  local mode="${1:-all}"
  shift || true

  if [ "$mode" = "gcp" ]; then
    mode="${1:-all}"
    shift || true
  fi

  args=("$mode" "$@")
  exec "$ROOT_DIR/deploy-gcp.sh" "${args[@]}"
}

deploy_vercel() {
  local vercel_mode="${1:-prod}"
  require_cmd vercel
  require_cmd npm

  if [ ! -f "$SITE_DIR/vercel.json" ]; then
    echo "Error: Missing $SITE_DIR/vercel.json"
    exit 1
  fi

  load_gcp_env

  header "Install dependencies (landing app)"
  cd "$SITE_DIR"
  npm install

  export VITE_AGENTS_API_URL="${VITE_AGENTS_API_URL:-https://resgro-agents-api-432223990540.us-west2.run.app}"
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-}"
  export VITE_SITE_URL="${VITE_SITE_URL:-}"
  export VITE_APP_URL="${VITE_APP_URL:-}"
  export VITE_STRIPE_PUBLISHABLE_KEY="${VITE_STRIPE_PUBLISHABLE_KEY:-}"
  export VITE_EMAILJS_PUBLIC_KEY="${VITE_EMAILJS_PUBLIC_KEY:-}"
  export VITE_EMAILJS_SERVICE_ID="${VITE_EMAILJS_SERVICE_ID:-}"
  export VITE_EMAILJS_TEMPLATE_ID="${VITE_EMAILJS_TEMPLATE_ID:-}"
  export VITE_ADMIN_EMAILS="${VITE_ADMIN_EMAILS:-}"

  if [ "$vercel_mode" = "preview" ] || [ "$vercel_mode" = "draft" ]; then
    header "Vercel preview deploy (SPA only — Django stays on Cloud Run)"
    vercel deploy
  else
    case "$vercel_mode" in
      prod|production) ;;
      *)
        echo "Usage: ./deploy.sh vercel [prod|preview]"
        exit 1
        ;;
    esac
    header "Vercel production deploy (SPA only — Django stays on Cloud Run)"
    vercel deploy --prod
  fi

  echo ""
  echo "Done. Backends on Cloud Run; frontend: ./deploy.sh netlify prod"
}

deploy_netlify() {
  local netlify_mode="${1:-prod}"
  require_cmd netlify
  require_cmd npm

  if [ ! -f "$SITE_DIR/netlify.toml" ]; then
    echo "Error: Missing $SITE_DIR/netlify.toml"
    exit 1
  fi

  load_gcp_env

  header "Install dependencies (landing app)"
  cd "$SITE_DIR"
  npm install

  header "Install dependencies (Netlify functions)"
  cd "$NETLIFY_FN_ROOT"
  npm install

  header "Production build (vite)"
  cd "$SITE_DIR"
  export VITE_AGENTS_API_URL="${VITE_AGENTS_API_URL:-https://resgro-agents-api-432223990540.us-west2.run.app}"
  npm run build

  if [ ! -d "$SITE_DIR/dist" ]; then
    echo "Error: Build did not produce dist/"
    exit 1
  fi

  if [ "$netlify_mode" = "draft" ]; then
    header "Netlify draft deploy"
    cd "$SITE_DIR"
    netlify deploy --dir dist
  else
    case "$netlify_mode" in
      prod|production) ;;
      *)
        echo "Usage: ./deploy.sh netlify [prod|draft]"
        exit 1
        ;;
    esac
    header "Netlify production deploy"
    cd "$SITE_DIR"
    netlify deploy --prod --dir dist
  fi

  echo ""
  echo "Done."
}

print_usage() {
  echo "Usage:"
  echo "  ./deploy.sh                         # GCP backends (backend + api + agents)"
  echo "  ./deploy.sh backend                 # Django resgro-backend → Cloud Run"
  echo "  ./deploy.sh gcp [backend|api|agents|all] [--cloudbuild|--docker]"
  echo "  ./deploy.sh netlify [prod|draft]    # Frontend → resgro.ai / app.resgro.ai"
  echo "  ./deploy.sh vercel [prod|preview]   # Optional alternate static host"
}

MODE="${1:-}"

# Default: GCP backends only (frontend is Netlify)
if [ -z "$MODE" ]; then
  run_gcp_deploy all
fi

if is_gcp_target "$MODE"; then
  run_gcp_deploy "$@"
fi

case "$MODE" in
  vercel)
    deploy_vercel "${2:-prod}"
    ;;
  netlify)
    deploy_netlify "${2:-prod}"
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
