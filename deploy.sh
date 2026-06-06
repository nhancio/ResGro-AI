#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Single deploy script for all services
#
#   ./deploy.sh                    # Everything: GCP + Netlify
#   ./deploy.sh backend            # Django only → Cloud Run
#   ./deploy.sh api                # Node API only → Cloud Run
#   ./deploy.sh agents             # Python agents API only → Cloud Run
#   ./deploy.sh gcp [all|backend|api|agents] [--cloudbuild|--docker]
#   ./deploy.sh netlify [prod|draft]   # Frontend → resgro.ai / app.resgro.ai
#   ./deploy.sh vercel  [prod|preview] # Optional alternate static host
#
# Prerequisites:
#   GCP:     gcloud CLI (logged in), billing enabled
#   Netlify: npm, netlify-cli
#   Vercel:  npm, vercel CLI
#   cp .env.example .env — fill in keys
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$ROOT_DIR/resgro-landing"
NETLIFY_FN_ROOT="$ROOT_DIR/apis/netlify"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

header() { echo ""; echo "=== $1 ==="; }

push_to_main() {
  if ! command -v git >/dev/null 2>&1; then return 0; fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then return 0; fi

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != "main" ]; then
    echo "Warning: on branch '$branch', not main — skipping git push."
    return 0
  fi

  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    header "Auto-committing changes before deploy"
    git add -A
    git commit -m "pre-deploy: $(date +%Y-%m-%d\ %H:%M:%S)"
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
  local region project backend_url api_url
  region="${GCP_REGION:-us-west2}"
  project="$(gcp_project)"
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"
  [ -z "$backend_url" ] && return 0

  local -a hosts=(".run.app") csrf=()
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

# ── GCP deploy targets ──────────────────────────────────────────────

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

  local -a sql_args=()
  if grep -q '^DATABASE_URL=.*cloudsql' "$ENV_FILE" 2>/dev/null; then
    local instance
    instance="$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|.*host=/cloudsql/([^&"]+).*|\1|')"
    [ -n "$instance" ] && sql_args=(--add-cloudsql-instances "$instance")
  fi

  gcloud run deploy resgro-backend \
    --image "$tag" --region "$region" --project "$project" \
    --platform managed --allow-unauthenticated --port 8080 --memory 512Mi \
    "${gcloud_env[@]}" "${sql_args[@]}"

  gcloud run services update-traffic resgro-backend \
    --to-latest --region "$region" --project "$project" --quiet

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

  gcloud run services update-traffic resgro-api \
    --to-latest --region "$region" --project "$project" --quiet

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
  [ -n "${GEMINI_MODEL:-}" ]      && env_pairs+=("GEMINI_MODEL=${GEMINI_MODEL}")
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

  gcloud run services update-traffic resgro-agents-api \
    --to-latest --region "$region" --project "$project" --quiet

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

deploy_gcp() {
  local target="${1:-all}"
  require_cmd gcloud
  load_env

  local project
  project="$(gcp_project)"
  if [ -z "$project" ]; then
    echo "Error: Set GCP_PROJECT_ID in .env or run: gcloud config set project YOUR_PROJECT"
    exit 1
  fi
  echo "GCP project: $project  region: ${GCP_REGION:-us-west2}"

  ensure_gcp_apis
  ensure_artifact_repo
  resolve_build_method

  case "$target" in
    backend) deploy_backend ;;
    api)     deploy_api ;;
    agents)  deploy_agents ;;
    all)
      deploy_backend
      deploy_api
      deploy_agents
      print_urls
      ;;
    *) echo "Unknown GCP target: $target"; exit 1 ;;
  esac
  echo ""; echo "Done."
}

# ── Frontend deploy targets ─────────────────────────────────────────

deploy_netlify() {
  local netlify_mode="${1:-prod}"
  require_cmd netlify
  require_cmd npm
  load_env

  if [ ! -f "$SITE_DIR/netlify.toml" ]; then
    echo "Error: Missing $SITE_DIR/netlify.toml"; exit 1
  fi

  header "Install dependencies (landing app)"
  cd "$SITE_DIR"
  npm install

  header "Install dependencies (Netlify functions)"
  cd "$NETLIFY_FN_ROOT"
  npm install

  header "Production build (vite)"
  cd "$SITE_DIR"
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://resgro-api-432223990540.us-west2.run.app}"
  export VITE_AGENTS_API_URL="${VITE_AGENTS_API_URL:-https://resgro-agents-api-432223990540.us-west2.run.app}"
  export VITE_SITE_URL="${VITE_SITE_URL:-https://resgro.ai}"
  export VITE_APP_URL="${VITE_APP_URL:-https://app.resgro.ai}"
  if [ -n "${RESGRO_TUNNEL_AGENTS_URL:-}" ]; then
    export VITE_AGENTS_API_URL="${RESGRO_TUNNEL_AGENTS_URL%/}"
    echo "Using temporary local Agents API bridge: $VITE_AGENTS_API_URL"
  fi
  npm run build

  if [ ! -d "$SITE_DIR/dist" ]; then
    echo "Error: Build did not produce dist/"; exit 1
  fi

  case "$netlify_mode" in
    draft)
      header "Netlify draft deploy"
      netlify deploy --dir dist
      ;;
    prod|production)
      header "Netlify production deploy"
      netlify deploy --prod --dir dist
      ;;
    *)
      echo "Usage: ./deploy.sh netlify [prod|draft]"; exit 1
      ;;
  esac
  echo ""; echo "Done."
}

deploy_vercel() {
  local vercel_mode="${1:-prod}"
  require_cmd vercel
  require_cmd npm
  load_env

  if [ ! -f "$SITE_DIR/vercel.json" ]; then
    echo "Error: Missing $SITE_DIR/vercel.json"; exit 1
  fi

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
  if [ -n "${RESGRO_TUNNEL_AGENTS_URL:-}" ]; then
    export VITE_AGENTS_API_URL="${RESGRO_TUNNEL_AGENTS_URL%/}"
    echo "Using temporary local Agents API bridge: $VITE_AGENTS_API_URL"
  fi

  case "$vercel_mode" in
    draft|preview)
      header "Vercel preview deploy"
      vercel deploy
      ;;
    prod|production)
      header "Vercel production deploy"
      vercel deploy --prod
      ;;
    *)
      echo "Usage: ./deploy.sh vercel [prod|preview]"; exit 1
      ;;
  esac
  echo ""; echo "Done."
}

# ── Status ───────────────────────────────────────────────────────────

print_urls() {
  local backend_url api_url agents_url
  backend_url="$(service_url resgro-backend)"
  api_url="$(service_url resgro-api)"
  agents_url="$(service_url resgro-agents-api)"

  header "Deployment URLs"
  echo "  Frontend (Netlify):  ${VITE_SITE_URL:-https://resgro.ai}"
  echo "  Portal  (Netlify):   ${VITE_APP_URL:-https://app.resgro.ai}"
  echo "  Django backend:      ${backend_url:-—}"
  echo "  Stripe/auth API:     ${api_url:-—}"
  echo "  Agents API:          ${agents_url:-—}"
}

# ── Main ─────────────────────────────────────────────────────────────

print_usage() {
  echo "Usage:"
  echo "  ./deploy.sh                         # Everything (GCP + Netlify)"
  echo "  ./deploy.sh backend                 # Django → Cloud Run"
  echo "  ./deploy.sh api                     # Node API → Cloud Run"
  echo "  ./deploy.sh agents                  # Agents API → Cloud Run"
  echo "  ./deploy.sh gcp [all|backend|api|agents] [--cloudbuild|--docker]"
  echo "  ./deploy.sh netlify [prod|draft]    # Frontend → resgro.ai / app.resgro.ai"
  echo "  ./deploy.sh vercel [prod|preview]   # Optional alternate static host"
}

GCP_TARGET="all"

push_to_main

while [ $# -gt 0 ]; do
  case "$1" in
    --cloudbuild|-c) DEPLOY_METHOD="cloudbuild" ;;
    --docker|-d)     DEPLOY_METHOD="docker" ;;
    --help|-h)       print_usage; exit 0 ;;
    gcp)
      shift
      GCP_TARGET="${1:-all}"
      deploy_gcp "$GCP_TARGET"
      exit 0
      ;;
    backend|api|agents)
      deploy_gcp "$1"
      exit 0
      ;;
    netlify)
      deploy_netlify "${2:-prod}"
      exit 0
      ;;
    vercel)
      deploy_vercel "${2:-prod}"
      exit 0
      ;;
    *)
      echo "Unknown command: $1"
      print_usage
      exit 1
      ;;
  esac
  shift
done

# No arguments → deploy everything (GCP + Netlify)
deploy_gcp all
deploy_netlify prod
