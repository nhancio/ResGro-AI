#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Run all services
#
# Starts three services:
#   1. Landing site (Netlify Dev) → http://localhost:8888  (resgro-landing/; proxies Vite + /.netlify/functions)
#   2. Self-Serve Analytics (Streamlit) → http://localhost:8501  (agents/Resgro-selfserve-app/)
#   3. Autonomy Agent API (FastAPI) → http://localhost:8000  (agents/resgro-browser-automation/)
#
# Usage:
#   ./run.sh              # Start all services
#   ./run.sh install      # Install all dependencies only
#   ./run.sh website      # Start website only
#   ./run.sh selfserve    # Start self-serve app only
#   ./run.sh autonomy     # Start autonomy agent API only
#   ./run.sh stop         # Stop all background services
# ─────────────────────────────────────────────────────────────────────
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSITE_DIR="$ROOT_DIR/resgro-landing"
SELFSERVE_DIR="$ROOT_DIR/agents/Resgro-selfserve-app/app"
AUTONOMY_DIR="$ROOT_DIR/agents/resgro-browser-automation"
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

# True if any install artifact is missing (npm or either Python venv).
needs_install() {
    [ ! -d "$WEBSITE_DIR/node_modules" ] && return 0
    [ ! -d "$SELFSERVE_DIR/.venv" ] && return 0
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
    # Also kill by port as fallback (macOS: lsof)
    lsof -ti:8501 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8888 2>/dev/null | xargs kill 2>/dev/null || true
    log "All services stopped."
}

# ── Install dependencies ─────────────────────────────────────────────
install_all() {
    header "Installing Dependencies"

    log "Installing website dependencies (npm)..."
    cd "$WEBSITE_DIR"
    npm install

    log "Setting up Self-Serve Python venv..."
    if [ ! -d "$SELFSERVE_DIR/.venv" ]; then
        python3 -m venv "$SELFSERVE_DIR/.venv"
    fi
    source "$SELFSERVE_DIR/.venv/bin/activate"
    pip install -q -r "$SELFSERVE_DIR/requirements.txt"
    deactivate

    log "Setting up Autonomy Agent Python venv..."
    if [ ! -d "$AUTONOMY_DIR/.venv" ]; then
        python3 -m venv "$AUTONOMY_DIR/.venv"
    fi
    source "$AUTONOMY_DIR/.venv/bin/activate"
    pip install -q -r "$AUTONOMY_DIR/requirements.txt"
    pip install -q fastapi uvicorn pydantic
    deactivate

    log "All dependencies installed."
}

# ── Start Self-Serve (Streamlit) ─────────────────────────────────────
start_selfserve() {
    log "Starting Self-Serve Analytics (Streamlit) on port 8501..."
    cd "$SELFSERVE_DIR"
    source "$SELFSERVE_DIR/.venv/bin/activate"
    streamlit run app.py \
        --server.port 8501 \
        --server.headless true \
        --server.enableCORS false \
        --server.enableXsrfProtection false \
        --browser.gatherUsageStats false \
        > "$ROOT_DIR/logs/selfserve.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    deactivate
    log "Self-Serve started (PID: $pid) → ${BOLD}http://localhost:8501${NC}"
}

# ── Start Autonomy Agent API (FastAPI) ───────────────────────────────
start_autonomy() {
    log "Starting Autonomy Agent API (FastAPI) on port 8000..."
    cd "$AUTONOMY_DIR"
    source "$AUTONOMY_DIR/.venv/bin/activate"
    python api_server.py \
        > "$ROOT_DIR/logs/autonomy.log" 2>&1 &
    local pid=$!
    echo "$pid" >> "$PID_FILE"
    deactivate
    log "Autonomy API started (PID: $pid) → ${BOLD}http://localhost:8000${NC}"
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
    selfserve)
        start_selfserve
        log "Self-Serve running. Press Ctrl+C to stop."
        wait
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
        header "ResGro-AI — Starting All Services"

        mkdir -p "$ROOT_DIR/logs"
        rm -f "$PID_FILE"

        if needs_install; then
            install_all
        fi

        trap cleanup EXIT INT TERM

        start_selfserve
        start_autonomy

        echo ""
        log "Backend services started. Logs in $ROOT_DIR/logs/"
        echo ""
        echo -e "${BOLD}  Services:${NC}"
        echo -e "    Website          → ${CYAN}http://localhost:8888${NC}"
        echo -e "    Self-Serve App   → ${CYAN}http://localhost:8501${NC}"
        echo -e "    Autonomy API     → ${CYAN}http://localhost:8000${NC}"
        echo -e "    API Health Check → ${CYAN}http://localhost:8000/health${NC}"
        echo ""
        echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
        echo ""

        start_website
        ;;
    *)
        echo "Usage: ./run.sh [all|install|website|selfserve|autonomy|stop]"
        exit 1
        ;;
esac
