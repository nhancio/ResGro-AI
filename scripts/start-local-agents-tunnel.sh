#!/usr/bin/env bash
# Publish a laptop-hosted Agents API so the deployed frontend can use local Chrome.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AUTOMATION_DIR="$ROOT_DIR/agents/resgro-browser-automation"
PYTHON="$AUTOMATION_DIR/.venv/bin/python"
CHROME_SCRIPT="$AUTOMATION_DIR/scripts/start_chrome_debug.sh"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$ROOT_DIR/.resgro-local-tunnel-pids"
AGENTS_PORT="${RESGRO_LOCAL_AGENTS_PORT:-8001}"
CHROME_PORT="${RESGRO_LOCAL_CHROME_PORT:-9222}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required."
    exit 1
  fi
}

stop_started_services() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No local Agents API tunnel started by this script is recorded."
    return
  fi

  while IFS= read -r pid; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  echo "Stopped the local Agents API tunnel processes."
}

wait_for_url() {
  local url="$1"
  local service="$2"
  local attempt
  for attempt in {1..30}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Error: $service did not become ready at $url."
  return 1
}

if [ "${1:-start}" = "stop" ]; then
  stop_started_services
  exit 0
fi
if [ "${1:-start}" != "start" ]; then
  echo "Usage: ./scripts/start-local-agents-tunnel.sh [start|stop]"
  exit 1
fi

require_cmd curl
require_cmd ngrok
if [ ! -x "$PYTHON" ]; then
  echo "Error: Python environment is missing. Run: ./run.sh install"
  exit 1
fi
if [ ! -x "$CHROME_SCRIPT" ]; then
  echo "Error: Chrome launcher is missing: $CHROME_SCRIPT"
  exit 1
fi
if ! ngrok config check >/dev/null 2>&1; then
  echo "Error: ngrok is not authenticated."
  echo "Run: ngrok config add-authtoken <your-ngrok-authtoken>"
  exit 1
fi
if curl -fsS "http://127.0.0.1:${AGENTS_PORT}/api/health" >/dev/null 2>&1; then
  echo "Error: an Agents API is already running on port $AGENTS_PORT."
  echo "Stop it first so this script can start it with local-browser settings."
  exit 1
fi
if curl -fsS "http://127.0.0.1:4040/api/tunnels" >/dev/null 2>&1; then
  echo "Error: an ngrok process is already exposing a local service."
  echo "Stop it first so the published URL is unambiguous."
  exit 1
fi

mkdir -p "$LOG_DIR"
: > "$PID_FILE"
cleanup_on_error() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    stop_started_services >/dev/null
    echo "See logs in $LOG_DIR for startup details."
  fi
  exit "$status"
}
trap cleanup_on_error EXIT

if curl -fsS "http://127.0.0.1:${CHROME_PORT}/json/version" >/dev/null 2>&1; then
  echo "Using Chrome already available on debugging port $CHROME_PORT."
else
  echo "Starting a dedicated Chrome window for agent automation..."
  "$CHROME_SCRIPT" "$CHROME_PORT" > "$LOG_DIR/local-tunnel-chrome.log" 2>&1 &
  echo "$!" >> "$PID_FILE"
  wait_for_url "http://127.0.0.1:${CHROME_PORT}/json/version" "Chrome debugging"
fi

echo "Starting local Agents API on port $AGENTS_PORT..."
(
  cd "$ROOT_DIR"
  export PYTHONPATH="$ROOT_DIR"
  export LOCAL_BROWSER_CDP_URL="http://127.0.0.1:${CHROME_PORT}"
  export USE_LOCAL_BROWSER=true
  export PUBLIC_API_BASE_URL=""
  exec "$PYTHON" -m uvicorn api.main:app --host 127.0.0.1 --port "$AGENTS_PORT"
) > "$LOG_DIR/local-tunnel-agents-api.log" 2>&1 &
echo "$!" >> "$PID_FILE"
wait_for_url "http://127.0.0.1:${AGENTS_PORT}/api/health" "local Agents API"

echo "Opening ngrok HTTPS tunnel to the local Agents API..."
ngrok http "http://127.0.0.1:${AGENTS_PORT}" --log stdout --log-format json \
  > "$LOG_DIR/local-tunnel-ngrok.log" 2>&1 &
echo "$!" >> "$PID_FILE"
wait_for_url "http://127.0.0.1:4040/api/tunnels" "ngrok inspector"

TUNNEL_URL="$(
  curl -fsS "http://127.0.0.1:4040/api/tunnels" |
    "$PYTHON" -c 'import json, sys; data=json.load(sys.stdin); print(next((t["public_url"] for t in data["tunnels"] if t["public_url"].startswith("https://")), ""))'
)"
if [ -z "$TUNNEL_URL" ]; then
  echo "Error: ngrok did not publish an HTTPS URL."
  exit 1
fi

trap - EXIT
echo ""
echo "Local Agents API bridge is ready: $TUNNEL_URL"
echo ""
echo "Deploy the frontend against this temporary URL:"
echo "  RESGRO_TUNNEL_AGENTS_URL=\"$TUNNEL_URL\" ./deploy.sh netlify prod"
echo ""
echo "Open the dedicated Chrome window and log into DoorDash when prompted by an agent."
echo "The URL exposes your local Agents API; keep it private and stop it after testing:"
echo "  ./scripts/start-local-agents-tunnel.sh stop"

wait

