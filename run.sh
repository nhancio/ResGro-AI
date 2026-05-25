#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Run services
#
# Starts:
#   1. Landing site (Netlify Dev) → http://localhost:8888  (resgro-landing/; proxies Vite on 3000 + /.netlify/functions)
#   2. HTTP API (Stripe, auth, admin CRM) → http://localhost:8080  (apis/http — also proxied from Vite :3000)
#   3. Autonomy Agent API (FastAPI) → http://localhost:8000  (agents/resgro-browser-automation/)
#   4. ResGro Agents API (FastAPI) → http://localhost:8001  (api/main.py — deepdive, marketingreco, etc.)
#   5. Django accounts API → http://localhost:8002  (backend/ — users DB + Stripe sync)
#
# Django admin (local): http://localhost:8002/admin/ — or http://localhost:8888/admin/ when UI proxies backend
#
# Ports: 8888 = Netlify (use for auth functions + production-like routing). 3000 = Vite only (started by Netlify).
# Agent runs use VITE_AGENTS_API_URL=http://localhost:8001 in dev so large zip uploads do not hit Netlify's 6MB POST buffer
# (which crashes the CLI with "Stream body too big").
#
# Self-serve analytics are embedded in the portal Agents UI (operator workflows), not a separate Streamlit process.
#
# Usage:
#   ./run.sh              # Start website + autonomy API, then website (foreground)
#   ./run.sh install      # Install all dependencies only
#   ./run.sh website      # Start website only
#   ./run.sh autonomy     # Start autonomy agent API only
#   ./run.sh stop         # Stop all background services
# ─────────────────────────────────────────────────────────────────────
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_DIR="$ROOT_DIR/resgro-landing"
NETLIFY_FN_ROOT="$ROOT_DIR/apis/netlify"
HTTP_API_DIR="$ROOT_DIR/apis/http"
BACKEND_DIR="$ROOT_DIR/backend"
AUTONOMY_DIR="$ROOT_DIR/agents/resgro-browser-automation"
AGENTS_API_DIR="$ROOT_DIR"
PID_FILE="$ROOT_DIR/.resgro-pids"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[ResGro]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ResGro]${NC} $1"; }
error() { echo -e "${RED}[ResGro]${NC} $1"; }
header(){ echo -e "\n${CYAN}${BOLD}═══════════════════════════════════════════${NC}"; echo -e "${CYAN}${BOLD}  $1${NC}"; echo -e "${CYAN}${BOLD}═══════════════════════════════════════════${NC}\n"; }

# True if any install artifact is missing (npm or Python venv).
needs_install() {
    [ ! -d "$WEBSITE_DIR/node_modules" ] && return 0
    [ ! -d "$NETLIFY_FN_ROOT/node_modules" ] && return 0
    [ ! -d "$HTTP_API_DIR/node_modules" ] && return 0
    [ ! -d "$BACKEND_DIR/.venv" ] && return 0
    [ ! -d "$AUTONOMY_DIR/.venv" ] && return 0
    return 1
}

# ── Cleanup on exit ──────────────────────────────────────────────────
cleanup() {
    log "Shutting down all services..."
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8001 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8080 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8002 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8888 2>/dev/null | xargs kill 2>/dev/null || true
    log "All services stopped."
}

# ── Install dependencies ─────────────────────────────────────────────
install_all() {
    header "Installing Dependencies"

    log "Installing website dependencies (npm)..."
    cd "$WEBSITE_DIR"
    npm install

    log "Installing Netlify functions dependencies (npm, apis/netlify)..."
    cd "$NETLIFY_FN_ROOT"
    npm install

    log "Installing HTTP API dependencies (npm, apis/http)..."
    cd "$HTTP_API_DIR"
    npm install

    log "Setting up Django backend venv..."
    if [ ! -d "$BACKEND_DIR/.venv" ]; then
        python3 -m venv "$BACKEND_DIR/.venv"
    fi
    "$BACKEND_DIR/.venv/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
    cd "$BACKEND_DIR"
    "$BACKEND_DIR/.venv/bin/python" manage.py migrate --noinput 2>/dev/null || true
    "$BACKEND_DIR/.venv/bin/python" manage.py collectstatic --noinput 2>/dev/null || true

    log "Setting up Autonomy Agent Python venv..."
    if [ ! -d "$AUTONOMY_DIR/.venv" ]; then
        python3 -m venv "$AUTONOMY_DIR/.venv"
    fi
    source "$AUTONOMY_DIR/.venv/bin/activate"
    pip install -q -r "$AUTONOMY_DIR/requirements.txt"
    pip install -q -r "$ROOT_DIR/requirements.txt"
    pip install -q fastapi uvicorn pydantic
    deactivate

    log "All dependencies installed."
}

# ── Start Django accounts API ────────────────────────────────────────
start_django_backend() {
    log "Starting Django accounts API on port 8002..."
    cd "$BACKEND_DIR"
    if [ -f "$ROOT_DIR/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT_DIR/.env"
        set +a
    elif [ -f "$ROOT_DIR/resgro-landing/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT_DIR/resgro-landing/.env"
        set +a
    fi
    export DJANGO_DEBUG=true
    "$BACKEND_DIR/.venv/bin/pip" install -q -r requirements.txt 2>/dev/null || true
    "$BACKEND_DIR/.venv/bin/python" manage.py migrate --noinput >/dev/null 2>&1 || true
    "$BACKEND_DIR/.venv/bin/python" manage.py ensure_demo_user >/dev/null 2>&1 || true
    "$BACKEND_DIR/.venv/bin/python" manage.py collectstatic --noinput >/dev/null 2>&1 || true
    # runserver serves static files in dev; production Docker uses gunicorn + whitenoise
    DJANGO_BACKEND_URL=http://127.0.0.1:8002 \
        "$BACKEND_DIR/.venv/bin/python" manage.py runserver 0.0.0.0:8002 --noreload \
        > "$ROOT_DIR/logs/django-backend.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    log "Django backend started (PID: $pid) → ${BOLD}http://localhost:8002/admin/${NC}"
}

# ── Start HTTP API (Stripe, auth, admin — Cloud Run adapter) ─────────
start_http_api() {
    log "Starting HTTP API (Stripe, auth, admin) on port 8080..."
    cd "$HTTP_API_DIR"
    export DJANGO_BACKEND_URL=http://127.0.0.1:8002
    if [ -f "$ROOT_DIR/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT_DIR/.env"
        set +a
    elif [ -f "$ROOT_DIR/resgro-landing/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT_DIR/resgro-landing/.env"
        set +a
    fi
    PORT=8080 node server.js > "$ROOT_DIR/logs/http-api.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    log "HTTP API started (PID: $pid) → ${BOLD}http://localhost:8080/health${NC}"
}

# ── Start Autonomy Agent API (FastAPI) ───────────────────────────────
start_autonomy() {
    log "Starting Autonomy Agent API (FastAPI) on port 8000..."
    cd "$AUTONOMY_DIR"
    "$AUTONOMY_DIR/.venv/bin/python" api_server.py \
        > "$ROOT_DIR/logs/autonomy.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    log "Autonomy API started (PID: $pid) → ${BOLD}http://localhost:8000${NC}"
}

# ── Start ResGro Agents API (FastAPI — deepdive, marketingreco, etc.) ──
start_agents_api() {
    log "Starting ResGro Agents API (FastAPI) on port 8001..."
    cd "$AGENTS_API_DIR"
    PYTHONPATH="$AGENTS_API_DIR" "$AUTONOMY_DIR/.venv/bin/python" -m uvicorn api.main:app --host 0.0.0.0 --port 8001 --reload \
        > "$ROOT_DIR/logs/agents-api.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    log "Agents API started (PID: $pid) → ${BOLD}http://localhost:8001${NC}"
}

# ── Start landing site (Netlify Dev: Vite + local functions) ─────────
start_website() {
    log "Starting landing site (Netlify Dev on port 8888 — Vite + /.netlify/functions)..."
    cd "$WEBSITE_DIR"
    npm run dev -- --port 8888 --no-open
}

# ── Stop all services ────────────────────────────────────────────────
stop_all() {
    header "Stopping All Services"
    cleanup
}

# ── Main ─────────────────────────────────────────────────────────────
case "${1:-all}" in
    install)
        install_all
        ;;
    website)
        start_website
        ;;
    autonomy)
        start_autonomy
        log "Autonomy API running. Press Ctrl+C to stop."
        wait
        ;;
    stop)
        stop_all
        ;;
    all)
        header "ResGro-AI — Starting Services"

        mkdir -p "$ROOT_DIR/logs"

        # Kill any leftover processes on our ports from a previous run
        log "Clearing ports 3000, 8000, 8001, 8002, 8080, 8888..."
        for p in 3000 8000 8001 8002 8080 8888; do
            lsof -ti:"$p" 2>/dev/null | xargs kill -9 2>/dev/null || true
        done
        if [ -f "$PID_FILE" ]; then
            while read -r pid; do
                kill -9 "$pid" 2>/dev/null || true
            done < "$PID_FILE"
        fi
        rm -f "$PID_FILE"
        sleep 1

        if needs_install; then
            install_all
        fi

        trap cleanup EXIT INT TERM

        start_django_backend
        start_http_api
        start_autonomy
        start_agents_api

        echo ""
        log "Background APIs started. Logs in $ROOT_DIR/logs/"
        echo ""
        echo -e "${BOLD}  Services:${NC}"
        echo -e "    Website (Netlify) → ${CYAN}http://localhost:8888${NC}  ← open this (Vite runs on ${CYAN}3000${NC} behind the proxy)"
        echo -e "    Django admin      → ${CYAN}http://localhost:8002/admin/${NC}"
        echo -e "    Django (users DB) → ${CYAN}http://localhost:8002/admin/${NC}"
        echo -e "    HTTP API          → ${CYAN}http://localhost:8080${NC}  (proxies /api/accounts → Django)"
        echo -e "    Autonomy API      → ${CYAN}http://localhost:8000${NC}"
        echo -e "    Agents API        → ${CYAN}http://localhost:8001${NC}"
        echo -e "    API Health Check  → ${CYAN}http://localhost:8001/api/health${NC}"
        echo ""
        echo -e "  ${YELLOW}Tip:${NC} Analysis Engine posts large multipart bodies; dev uses direct ${CYAN}8001${NC} (see netlify.toml context.dev) so Netlify CLI does not crash."
        echo ""
        echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
        echo ""

        start_website
        ;;
    *)
        echo "Usage: ./run.sh [all|install|website|autonomy|stop]"
        exit 1
        ;;
esac
