#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Deploy landing site to Netlify production
#
# Requires: Node/npm, Netlify CLI (`npm i -g netlify-cli`), linked site in resgro-landing
# Optional: NETLIFY_AUTH_TOKEN in environment for CI / non-interactive auth
#
# Usage:
#   ./deploy.sh           # npm install, build, netlify deploy --prod
#   ./deploy.sh draft     # deploy a draft (preview) URL only
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$ROOT_DIR/resgro-landing"

if ! command -v netlify >/dev/null 2>&1; then
    echo "Error: Netlify CLI not found. Install with: npm install -g netlify-cli"
    exit 1
fi

if [ ! -f "$SITE_DIR/netlify.toml" ]; then
    echo "Error: Missing $SITE_DIR/netlify.toml"
    exit 1
fi

MODE="${1:-prod}"

header() { echo ""; echo "=== $1 ==="; }

header "Install dependencies"
cd "$SITE_DIR"
npm install

header "Production build (vite)"
npm run build

if [ ! -d "$SITE_DIR/dist" ]; then
    echo "Error: Build did not produce dist/"
    exit 1
fi

if [ "$MODE" = "draft" ]; then
    header "Netlify draft deploy"
    netlify deploy --dir=dist
else
    if [ "$MODE" != "prod" ] && [ "$MODE" != "production" ]; then
        echo "Usage: ./deploy.sh [prod|draft]"
        exit 1
    fi
    header "Netlify production deploy"
    netlify deploy --prod --dir=dist
fi

echo ""
echo "Done."
