#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Deploy ALL services to GCP Cloud Run
#
# Same protocol as deploy.sh, but frontend goes to Cloud Run
# instead of Netlify/Vercel.
#
#   ./gcp_deploy.sh                    # All 4 services → Cloud Run
#   ./gcp_deploy.sh backend            # Django → Cloud Run
#   ./gcp_deploy.sh api                # Node API → Cloud Run
#   ./gcp_deploy.sh agents             # Agents API → Cloud Run
#   ./gcp_deploy.sh ui                 # Frontend (React+nginx) → Cloud Run
#   ./gcp_deploy.sh all                # All 4 services → Cloud Run
#   ./gcp_deploy.sh urls               # Print current service URLs
#
# Options:
#   --docker       Force local Docker build
#   --cloudbuild   Force Cloud Build (GCP-hosted)
#
# Prerequisites:
#   gcloud CLI (logged in), billing enabled
#   cp .env.example .env — fill in keys
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

header() { echo ""; echo "=== $1 ==="; }

# ── Git protocol (same as deploy.sh) ────────────────────────────────

push_to_main() {
  if ! command -v git >/dev/null 2>&1; then return 0; fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then return 0; fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "main" ]; then
    echo "Warning: on branch '$branch', not main — skipping git push."
    return 0
  fi

  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: you have uncommitted changes. Commit first, then deploy."
    exit 1
  fi

  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    local ahead
    ahead="$(git rev-list origin/main..HEAD --count 2>/dev/null || echo 0)"
    if [ "$ahead" -gt 0 ]; then
      header "Pushing $ahead commit(s) to origin/main"
      git push origin main
    else
      echo "origin/main is up to date."
    fi
  fi
}

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

# ── GCP helpers ──────────────────────────────────────────────────────

DEPLOY_METHOD="${DEPLOY_METHOD:-auto}"
BUILD_METHOD=""

resolve_build_method() {
  if [ "$BUILD_METHOD" != "" ]; then return; fi
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

gcp_project() {
  if [ -n "${GCP_PROJECT_ID:-}" ]; then echo "$GCP_PROJECT_ID"; return; fi
  gcloud config get-value project 2>/dev/null
}

image_prefix() {
  local project region repo
  project="$(gcp_project)"
  region="${GCP_REGION:-us-west2}"
  repo="${GCP_ARTIFACT_REPO:-resgro}"
  echo "${region}-docker.pkg.dev/${project}/${repo}"
}

ensure_gcp_apis() {
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    --project="$(gcp_project)" --quiet
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
      --location="$region" --project="$project" \
      --description="ResGro containers"
  resolve_build_method
  if [ "$BUILD_METHOD" = "docker" ]; then
    gcloud auth configure-docker "${region}-docker.pkg.dev" --quiet
  fi
}

build_and_push() {
  local dockerfile="$1" context="$2" tag="$3"
  shift 3
  resolve_build_method

  if [ "$BUILD_METHOD" = "docker" ]; then
    require_cmd docker
    local -a cmd=(docker build -f "$context/$dockerfile" -t "$tag")
    while [ $# -gt 0 ]; do cmd+=(--build-arg "$1"); shift; done
    cmd+=("$context")
    echo "→ docker build -f $dockerfile …"
    "${cmd[@]}"
    docker push "$tag"
    return
  fi

  local region project cfg
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  cfg="$(mktemp "${TMPDIR:-/tmp}/resgro-cloudbuild.XXXXXX")"
  cfg="${cfg}.yaml"
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
    while [ $# -gt 0 ]; do echo "  - --build-arg"; echo "  - $1"; shift; done
    echo "  - ."
    echo "images:"
    echo "- $tag"
    echo "options:"
    echo "  logging: CLOUD_LOGGING_ONLY"
  } >"$cfg"
  echo "→ gcloud builds submit (Cloud Build) …"
  gcloud builds submit "$context" \
    --project="$project" --region="$region" --config="$cfg" --quiet
  trap - RETURN
  rm -f "$cfg"
}

service_url() {
  local name="$1"
  gcloud run services describe "$name" \
    --region="${GCP_REGION:-us-west2}" \
    --project="$(gcp_project)" \
    --format='value(status.url)' 2>/dev/null || true
}

host_from_url() { printf '%s' "$1" | sed -E 's|https?://||; s|/.*||'; }

patch_django_admin_hosts() {
  local region project backend_url api_url ui_url
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"
  ui_url="$(service_url resgro-ui)"
  [ -z "$backend_url" ] && return 0

  local -a hosts=(".run.app") csrf=()
  for url in "$backend_url" "$api_url" "$ui_url"; do
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
  local hosts_csv csrf_csv
  hosts_csv=$(IFS=,; echo "${hosts[*]}")
  csrf_csv=$(IFS=,; echo "${csrf[*]}")
  gcloud run services update resgro-backend \
    --region "$region" --project "$project" \
    --update-env-vars "DJANGO_ALLOWED_HOSTS=${hosts_csv},CSRF_TRUSTED_ORIGINS=${csrf_csv},DJANGO_ON_CLOUD_RUN=true" \
    --quiet 2>/dev/null || true
}

write_run_env_file() {
  local outfile="$1"; shift
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

# ── Deploy targets (backend, api, agents — identical to deploy.sh) ──

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
  if [ -s "$backend_env" ]; then gcloud_env=(--env-vars-file "$backend_env"); fi

  gcloud run deploy resgro-backend \
    --image "$tag" --region "$region" --project "$project" \
    --platform managed --allow-unauthenticated --port 8080 --memory 512Mi \
    "${gcloud_env[@]}"

  local backend_url
  backend_url="$(service_url resgro-backend)"
  echo "resgro-backend → $backend_url"
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
  if [ -s "$api_env" ]; then gcloud_env=(--env-vars-file "$api_env"); fi

  gcloud run deploy resgro-api \
    --image "$tag" --region "$region" --project "$project" \
    --platform managed --allow-unauthenticated --port 8080 --memory 512Mi \
    "${gcloud_env[@]}"

  local api_url
  api_url="$(service_url resgro-api)"
  echo "resgro-api → $api_url (proxies accounts → ${django_url})"
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

  local env_pairs=()
  [ -n "${ANTHROPIC_API_KEY:-}" ] && env_pairs+=("ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}")
  [ -n "${GEMINI_API_KEY:-}" ]    && env_pairs+=("GEMINI_API_KEY=${GEMINI_API_KEY}")
  [ -n "${GCS_UPLOAD_BUCKET:-}" ] && env_pairs+=("GCS_UPLOAD_BUCKET=${GCS_UPLOAD_BUCKET}")
  [ -n "${GCS_SIGNING_SERVICE_ACCOUNT:-}" ] && env_pairs+=("GCS_SIGNING_SERVICE_ACCOUNT=${GCS_SIGNING_SERVICE_ACCOUNT}")

  local -a env_args=()
  if [ "${#env_pairs[@]}" -gt 0 ]; then
    local IFS=,
    env_args=(--set-env-vars "${env_pairs[*]}")
  fi

  gcloud run deploy resgro-agents-api \
    --image "$tag" --region "$region" --project "$project" \
    --platform managed --allow-unauthenticated --port 8080 \
    --memory 8Gi --timeout 3600 --cpu 4 \
    "${env_args[@]}"

  local agents_url
  agents_url="$(service_url resgro-agents-api)"
  if [ -n "$agents_url" ]; then
    gcloud run services update resgro-agents-api \
      --region "$region" --project "$project" \
      --update-env-vars "PUBLIC_API_BASE_URL=${agents_url}" \
      --quiet 2>/dev/null || true
  fi
  echo "resgro-agents-api → $agents_url"
  patch_django_admin_hosts
}

# ── Frontend → Cloud Run (replaces Netlify/Vercel from deploy.sh) ──

deploy_ui() {
  header "Build & deploy resgro-ui (React + nginx → Cloud Run)"
  local prefix tag region project
  prefix="$(image_prefix)"
  tag="${prefix}/resgro-ui:$(date +%Y%m%d%H%M%S)"
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"

  # ── Resolve backend URL (runtime env for nginx /admin proxy) ──
  local backend_url=""
  if [ -f "$ROOT_DIR/.tmp.resgro-backend-url" ]; then
    backend_url="$(cat "$ROOT_DIR/.tmp.resgro-backend-url")"
  fi
  if [ -z "$backend_url" ]; then
    backend_url="$(service_url resgro-backend)"
  fi
  if [ -z "$backend_url" ]; then
    echo "Warning: resgro-backend URL unknown — nginx /admin/ proxy will be disabled"
  fi

  # ── Resolve API & Agents URLs (build-time VITE_* args) ──
  local api_url agents_url
  api_url="$(service_url resgro-api)"
  agents_url="$(service_url resgro-agents-api)"

  api_url="${api_url:-${VITE_API_BASE_URL:-}}"
  agents_url="${agents_url:-${VITE_AGENTS_API_URL:-}}"

  if [ -z "$api_url" ]; then
    echo "Error: Cannot determine resgro-api URL. Deploy api first or set VITE_API_BASE_URL in .env"
    exit 1
  fi
  if [ -z "$agents_url" ]; then
    echo "Error: Cannot determine resgro-agents-api URL. Deploy agents first or set VITE_AGENTS_API_URL in .env"
    exit 1
  fi

  echo "  VITE_API_BASE_URL   = $api_url"
  echo "  VITE_AGENTS_API_URL = $agents_url"
  echo "  DJANGO_BACKEND_URL  = ${backend_url:-<unset>}"

  # ── Build args (baked into Vite at compile time) ──
  local -a build_args=(
    "VITE_API_BASE_URL=${api_url}"
    "VITE_AGENTS_API_URL=${agents_url}"
    "VITE_FORCE_APP_HOST=true"
    "VITE_SITE_URL=${VITE_SITE_URL:-https://resgro.ai}"
    "VITE_APP_URL=${VITE_APP_URL:-https://app.resgro.ai}"
  )
  [ -n "${VITE_STRIPE_PUBLISHABLE_KEY:-}" ] && build_args+=("VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}")
  [ -n "${VITE_EMAILJS_PUBLIC_KEY:-}" ]     && build_args+=("VITE_EMAILJS_PUBLIC_KEY=${VITE_EMAILJS_PUBLIC_KEY}")
  [ -n "${VITE_EMAILJS_SERVICE_ID:-}" ]     && build_args+=("VITE_EMAILJS_SERVICE_ID=${VITE_EMAILJS_SERVICE_ID}")
  [ -n "${VITE_EMAILJS_TEMPLATE_ID:-}" ]    && build_args+=("VITE_EMAILJS_TEMPLATE_ID=${VITE_EMAILJS_TEMPLATE_ID}")
  [ -n "${VITE_ADMIN_EMAILS:-}" ]           && build_args+=("VITE_ADMIN_EMAILS=${VITE_ADMIN_EMAILS}")

  build_and_push "resgro-landing/Dockerfile" "$ROOT_DIR" "$tag" "${build_args[@]}"

  # ── Runtime env vars (nginx envsubst at container start) ──
  local -a env_pairs=()
  [ -n "$backend_url" ] && env_pairs+=("DJANGO_BACKEND_URL=${backend_url}")

  local -a env_args=()
  if [ "${#env_pairs[@]}" -gt 0 ]; then
    local IFS=,
    env_args=(--set-env-vars "${env_pairs[*]}")
  fi

  gcloud run deploy resgro-ui \
    --image "$tag" --region "$region" --project "$project" \
    --platform managed --allow-unauthenticated --port 8080 --memory 256Mi \
    "${env_args[@]}"

  local ui_url
  ui_url="$(service_url resgro-ui)"
  echo "resgro-ui → $ui_url"
  patch_django_admin_hosts
}

# ── Status ──────────────────────────────────────────────────────────

print_urls() {
  local backend_url api_url agents_url ui_url
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"
  agents_url="$(service_url resgro-agents-api)"
  ui_url="$(service_url resgro-ui)"

  header "Deployment URLs"
  echo "  Frontend (Cloud Run):  ${ui_url:-—}"
  echo "  Django backend:        ${backend_url:-—}"
  echo "  Stripe/auth API:       ${api_url:-—}"
  echo "  Agents API:            ${agents_url:-—}"
}

# ── Main ────────────────────────────────────────────────────────────

print_usage() {
  echo "Usage:"
  echo "  ./gcp_deploy.sh                     # All 4 services → Cloud Run"
  echo "  ./gcp_deploy.sh all                  # All 4 services → Cloud Run"
  echo "  ./gcp_deploy.sh backend              # Django → Cloud Run"
  echo "  ./gcp_deploy.sh api                  # Node API → Cloud Run"
  echo "  ./gcp_deploy.sh agents               # Agents API → Cloud Run"
  echo "  ./gcp_deploy.sh ui                   # Frontend → Cloud Run"
  echo "  ./gcp_deploy.sh urls                 # Print current service URLs"
  echo ""
  echo "Options:"
  echo "  --docker       Force local Docker build"
  echo "  --cloudbuild   Force Cloud Build"
  echo "  --help         Show this message"
}

push_to_main

while [ $# -gt 0 ]; do
  case "$1" in
    --cloudbuild|-c) DEPLOY_METHOD="cloudbuild"; shift ;;
    --docker|-d)     DEPLOY_METHOD="docker"; shift ;;
    --help|-h)       print_usage; exit 0 ;;
    *)               break ;;
  esac
done

TARGET="${1:-all}"

require_cmd gcloud
load_env

project="$(gcp_project)"
if [ -z "$project" ]; then
  echo "Error: Set GCP_PROJECT_ID in .env or run: gcloud config set project YOUR_PROJECT"
  exit 1
fi
echo "GCP project: $project  region: ${GCP_REGION:-us-west2}"

case "$TARGET" in
  urls)
    print_urls
    exit 0
    ;;
esac

ensure_gcp_apis
ensure_artifact_repo
resolve_build_method

case "$TARGET" in
  backend) deploy_backend ;;
  api)     deploy_api ;;
  agents)  deploy_agents ;;
  ui)      deploy_ui ;;
  all)
    deploy_backend
    deploy_api
    deploy_agents
    deploy_ui
    print_urls
    ;;
  *)
    echo "Unknown target: $TARGET"
    print_usage
    exit 1
    ;;
esac

echo ""
echo "Done."
