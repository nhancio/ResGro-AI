#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Deploy all services to Google Cloud Platform (Cloud Run)
#
# Deploys (backends only — frontend is Netlify: ./deploy.sh netlify prod):
#   1. resgro-backend    — Django users DB, auth, passwords, billing, Stripe sync
#   2. resgro-api        — Gateway (proxies /api/accounts → Django)
#   3. resgro-agents-api — DeepDive, monthly reporter, chat agents (Python)
#
# Prerequisites:
#   gcloud CLI (logged in), billing enabled on GCP project
#   Docker optional — without it, images are built in GCP via Cloud Build
#   cp .env.gcp.example .env.gcp  — fill Stripe keys and project id
#
# Usage:
#   ./deploy-gcp.sh              # deploy backend → api → agents
#   ./deploy-gcp.sh --cloudbuild # force Cloud Build (no local Docker)
#   ./deploy-gcp.sh --docker     # force local Docker build + push
#   DEPLOY_METHOD=cloudbuild ./deploy-gcp.sh
#   ./deploy-gcp.sh api          # Node API only
#   ./deploy-gcp.sh agents       # Python agents API only
#   ./deploy.sh netlify prod     # frontend (resgro.ai / app.resgro.ai)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.gcp}"

header() { echo ""; echo "=== $1 ==="; }

load_env() {
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

# docker | cloudbuild | auto (default: docker if available, else cloudbuild)
DEPLOY_METHOD="${DEPLOY_METHOD:-auto}"
BUILD_METHOD=""

resolve_build_method() {
  if [ "$BUILD_METHOD" != "" ]; then
    return
  fi
  case "$DEPLOY_METHOD" in
    docker|cloudbuild) BUILD_METHOD="$DEPLOY_METHOD" ;;
    auto)
      if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        BUILD_METHOD="docker"
      else
        BUILD_METHOD="cloudbuild"
      fi
      ;;
    *)
      echo "Error: DEPLOY_METHOD must be auto, docker, or cloudbuild (got: $DEPLOY_METHOD)"
      exit 1
      ;;
  esac
  echo "Build method: $BUILD_METHOD (set DEPLOY_METHOD=docker|cloudbuild to override)"
}

ensure_gcp_apis() {
  local project
  project="$(gcp_project)"
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$project" \
    --quiet
}

# build_and_push <dockerfile-relative-to-context> <context-dir> <image-tag> [KEY=value ...]
build_and_push() {
  local dockerfile="$1" context="$2" tag="$3"
  shift 3

  resolve_build_method

  if [ "$BUILD_METHOD" = "docker" ]; then
    require_cmd docker
    local -a cmd=(docker build -f "$context/$dockerfile" -t "$tag")
    while [ $# -gt 0 ]; do
      cmd+=(--build-arg "$1")
      shift
    done
    cmd+=("$context")
    echo "→ docker build -f $dockerfile …"
    "${cmd[@]}"
    docker push "$tag"
    return
  fi

  # Cloud Build — no local Docker required
  # mktemp (BSD/macOS) replaces only trailing X's in the last path component — not X's before .yaml
  local region project cfg
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  cfg="$(mktemp "${TMPDIR:-/tmp}/resgro-cloudbuild.XXXXXX")"
  cfg="${cfg}.yaml"
  # Embed path at trap-set time — locals like $cfg are unset before RETURN traps run (set -u).
  trap "rm -f '$cfg'; trap - RETURN" RETURN

  {
    echo "steps:"
    echo "- name: gcr.io/cloud-builders/docker"
    echo "  args:"
    echo "  - build"
    echo "  - -f"
    echo "  - $dockerfile"
    echo "  - -t"
    echo "  - $tag"
    while [ $# -gt 0 ]; do
      echo "  - --build-arg"
      echo "  - $1"
      shift
    done
    echo "  - ."
    echo "images:"
    echo "- $tag"
    echo "options:"
    echo "  logging: CLOUD_LOGGING_ONLY"
  } >"$cfg"

  echo "→ gcloud builds submit (Cloud Build) …"
  gcloud builds submit "$context" \
    --project="$project" \
    --region="$region" \
    --config="$cfg" \
    --quiet
  trap - RETURN
  rm -f "$cfg"
}

gcp_project() {
  if [ -n "${GCP_PROJECT_ID:-}" ]; then
    echo "$GCP_PROJECT_ID"
    return
  fi
  gcloud config get-value project 2>/dev/null
}

image_prefix() {
  local project region repo
  project="$(gcp_project)"
  region="${GCP_REGION:-us-west2}"
  repo="${GCP_ARTIFACT_REPO:-resgro}"
  echo "${region}-docker.pkg.dev/${project}/${repo}"
}

ensure_artifact_repo() {
  local project region repo
  project="$(gcp_project)"
  region="${GCP_REGION:-us-west2}"
  repo="${GCP_ARTIFACT_REPO:-resgro}"
  gcloud artifacts repositories describe "$repo" \
    --location="$region" --project="$project" >/dev/null 2>&1 \
    || gcloud artifacts repositories create "$repo" \
      --repository-format=docker \
      --location="$region" \
      --project="$project" \
      --description="ResGro containers"
  resolve_build_method
  if [ "$BUILD_METHOD" = "docker" ]; then
    gcloud auth configure-docker "${region}-docker.pkg.dev" --quiet
  fi
}

service_url() {
  local name region project
  name="$1"
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  gcloud run services describe "$name" \
    --region="$region" \
    --project="$project" \
    --format='value(status.url)' 2>/dev/null || true
}

host_from_url() {
  printf '%s' "$1" | sed -E 's|https?://||; s|/.*||'
}

# Django Host + CSRF: Cloud Run service URLs + Netlify origins from ALLOWED_ORIGINS.
patch_django_admin_hosts() {
  local region project backend_url api_url origin hosts_csv csrf_csv
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"

  [ -z "$backend_url" ] && return 0

  local -a hosts=(".run.app")
  local -a csrf=()
  for url in "$backend_url" "$api_url"; do
    [ -z "$url" ] && continue
    hosts+=("$(host_from_url "$url")")
    csrf+=("$url")
  done
  if [ -n "${ALLOWED_ORIGINS:-}" ]; then
    IFS=',' read -r -a origin_list <<<"$ALLOWED_ORIGINS"
    for origin in "${origin_list[@]}"; do
      origin="${origin#"${origin%%[![:space:]]*}"}"
      origin="${origin%"${origin##*[![:space:]]}"}"
      [ -z "$origin" ] && continue
      csrf+=("$origin")
      hosts+=("$(host_from_url "$origin")")
    done
  fi
  hosts_csv=$(IFS=,; echo "${hosts[*]}")
  csrf_csv=$(IFS=,; echo "${csrf[*]}")

  gcloud run services update resgro-backend \
    --region "$region" \
    --project "$project" \
    --update-env-vars "DJANGO_ALLOWED_HOSTS=${hosts_csv},CSRF_TRUSTED_ORIGINS=${csrf_csv},DJANGO_ON_CLOUD_RUN=true" \
    --quiet 2>/dev/null || true
}

# Build a single --env-vars-file (gcloud allows only one env-vars flag per deploy).
# Usage: write_run_env_file <path> [KEY=value ...]
write_run_env_file() {
  local outfile="$1"
  shift
  : >"$outfile"
  if [ -f "$ENV_FILE" ]; then
    grep -E '^(STRIPE_|ALLOWED_ORIGINS|RESGRO_ADMIN|MAIL_|SMTP_|APP_ORIGIN|VITE_EMAILJS_|EMAILJS_|DJANGO_|DATABASE_URL|EXPOSE_RESET)' "$ENV_FILE" \
      2>/dev/null | grep -v '^DJANGO_BACKEND_URL=' >>"$outfile" || true
  fi
  while [ $# -gt 0 ]; do
    local key="${1%%=*}"
    if [ -s "$outfile" ]; then
      grep -v "^${key}=" "$outfile" >"${outfile}.tmp" && mv "${outfile}.tmp" "$outfile"
    fi
    echo "$1" >>"$outfile"
    shift
  done
}

deploy_backend() {
  header "Build & deploy resgro-backend (Django users DB)"
  local prefix tag region project
  prefix="$(image_prefix)"
  tag="${prefix}/resgro-backend:$(date +%Y%m%d%H%M%S)"
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"

  build_and_push "backend/Dockerfile" "$ROOT_DIR" "$tag"

  local backend_env="$ROOT_DIR/.tmp.resgro-backend.env"
  local -a gcloud_env=()
  write_run_env_file "$backend_env"
  if [ -s "$backend_env" ]; then
    gcloud_env=(--env-vars-file "$backend_env")
  fi

  gcloud run deploy resgro-backend \
    --image "$tag" \
    --region "$region" \
    --project "$project" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    "${gcloud_env[@]}"

  local backend_url
  backend_url="$(service_url resgro-backend)"
  echo "resgro-backend → $backend_url"
  echo "  Django admin:         ${backend_url}/admin/"
  echo "$backend_url" >"$ROOT_DIR/.tmp.resgro-backend-url" 2>/dev/null || true
  patch_django_admin_hosts
}

deploy_api() {
  header "Build & deploy resgro-api (Stripe, auth, admin)"
  local prefix tag region project
  prefix="$(image_prefix)"
  tag="${prefix}/resgro-api:$(date +%Y%m%d%H%M%S)"
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"

  build_and_push "apis/http/Dockerfile" "$ROOT_DIR" "$tag"

  local django_url=""
  if [ -f "$ROOT_DIR/.tmp.resgro-backend-url" ]; then
    django_url="$(cat "$ROOT_DIR/.tmp.resgro-backend-url")"
  else
    django_url="$(service_url resgro-backend)"
  fi

  local api_env="$ROOT_DIR/.tmp.resgro-api.env"
  local -a gcloud_env=()
  write_run_env_file "$api_env" "DJANGO_BACKEND_URL=${django_url}"
  if [ -s "$api_env" ]; then
    gcloud_env=(--env-vars-file "$api_env")
  fi

  gcloud run deploy resgro-api \
    --image "$tag" \
    --region "$region" \
    --project "$project" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    "${gcloud_env[@]}"

  local api_url
  api_url="$(service_url resgro-api)"
  echo "resgro-api → $api_url (proxies accounts → ${django_url})"
  echo "  Django admin:         ${api_url}/admin/"
  patch_django_admin_hosts
}

deploy_agents() {
  header "Build & deploy resgro-agents-api (Python FastAPI)"
  local prefix tag region project
  prefix="$(image_prefix)"
  tag="${prefix}/resgro-agents-api:$(date +%Y%m%d%H%M%S)"
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"

  build_and_push "Dockerfile" "$ROOT_DIR" "$tag"

  local env_args=()
  if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
    env_args=(--set-env-vars "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-},GEMINI_API_KEY=${GEMINI_API_KEY:-}")
  fi

  gcloud run deploy resgro-agents-api \
    --image "$tag" \
    --region "$region" \
    --project "$project" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --timeout 900 \
    --cpu 2 \
    "${env_args[@]}"

  local agents_url
  agents_url="$(service_url resgro-agents-api)"
  if [ -n "$agents_url" ]; then
    gcloud run services update resgro-agents-api \
      --region "$region" \
      --project "$project" \
      --update-env-vars "PUBLIC_API_BASE_URL=${agents_url}" \
      --quiet 2>/dev/null || true
  fi
  echo "resgro-agents-api → $agents_url"
  patch_django_admin_hosts
}

print_deployment_urls() {
  local backend_url api_url agents_url
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"
  agents_url="$(service_url resgro-agents-api)"

  header "Deployment URLs"
  echo "  Frontend (Netlify):     ${VITE_SITE_URL:-https://resgro.ai}"
  echo "  Portal (Netlify):       ${VITE_APP_URL:-https://app.resgro.ai}"
  echo "  Deploy frontend:        ./deploy.sh netlify prod"
  echo ""
  echo "  Django backend:         ${backend_url:-—}"
  echo "  Django admin:           ${backend_url:+${backend_url}/admin/}"
  echo "  Django admin (API):     ${api_url:+${api_url}/admin/}"
  echo "  Stripe/auth API:        ${api_url:-—}"
  echo "  Agents API:             ${agents_url:-—}"
  echo ""
  echo "Django admin login uses auth.User (set DJANGO_SUPERUSER_EMAIL/PASSWORD in .env.gcp)."
}

# ── Main ──────────────────────────────────────────────────────────────
TARGET="all"

while [ $# -gt 0 ]; do
  case "$1" in
    --cloudbuild|-c) DEPLOY_METHOD="cloudbuild" ;;
    --docker|-d) DEPLOY_METHOD="docker" ;;
    all|backend|api|agents) TARGET="$1" ;;
    ui)
      echo "Error: resgro-ui was removed. Frontend is Netlify only: ./deploy.sh netlify prod"
      exit 1
      ;;
    --help|-h)
      echo "Usage: ./deploy-gcp.sh [--cloudbuild|--docker] [all|backend|api|agents]"
      echo "Frontend: ./deploy.sh netlify prod"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: ./deploy-gcp.sh [--cloudbuild|--docker] [all|backend|api|agents]"
      exit 1
      ;;
  esac
  shift
done

require_cmd gcloud
load_env

PROJECT="$(gcp_project)"
if [ -z "$PROJECT" ]; then
  echo "Error: Set GCP_PROJECT_ID in .env.gcp or run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

REGION="${GCP_REGION:-us-west2}"
echo "GCP project: $PROJECT  region: $REGION"

ensure_gcp_apis
ensure_artifact_repo
resolve_build_method

case "$TARGET" in
  backend) deploy_backend ;;
  api) deploy_api ;;
  agents) deploy_agents ;;
  all)
    deploy_backend
    deploy_api
    deploy_agents
    print_deployment_urls
    ;;
  *)
    echo "Usage: ./deploy-gcp.sh [--cloudbuild|--docker] [all|backend|api|agents]"
    exit 1
    ;;
esac

echo ""
echo "Done."
