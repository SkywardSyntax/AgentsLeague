#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

WORKTREE=""
AGENT_ID=""
PORT=""
RUN_DIR=""
DURATION_MS="21600000"

usage() {
  cat <<USAGE
Usage: $0 --worktree <path> --agent-id <id> --port <port> --run-dir <path> [--duration-ms <ms>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worktree)
      WORKTREE="$2"
      shift 2
      ;;
    --agent-id)
      AGENT_ID="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --run-dir)
      RUN_DIR="$2"
      shift 2
      ;;
    --duration-ms)
      DURATION_MS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$WORKTREE" || -z "$AGENT_ID" || -z "$PORT" || -z "$RUN_DIR" ]]; then
  usage
  exit 1
fi

if [[ ! -d "$WORKTREE" ]]; then
  echo "Missing worktree: $WORKTREE" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"
RUN_DIR="$(cd "$RUN_DIR" && pwd)"

SERVER_LOG="$RUN_DIR/server.log"
LOOP_LOG="$RUN_DIR/loop.log"
RUNNER_LOG="$RUN_DIR/runner.log"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
BASE_URL="http://127.0.0.1:${PORT}"

exec > >(tee -a "$RUNNER_LOG") 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] lane.start agent=$AGENT_ID worktree=$WORKTREE port=$PORT"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] lane.end agent=$AGENT_ID exit=$exit_code"
  if [[ "$exit_code" -ne 0 ]]; then
    exit "$exit_code"
  fi
}

trap cleanup EXIT INT TERM

cd "$WORKTREE"

if [[ ! -x node_modules/.bin/next ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] installing dependencies"
  npm install
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting next dev on port $PORT (mock stream mode)"
env -u OPENAI_API_KEY -u OPENAI_BASE_URL -u OPENAI_EXTRA_HEADERS_JSON \
  AGENT_STREAM_MODE=mock \
  NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --port "$PORT" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 120); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] server healthy"
    break
  fi
  sleep 2
done

if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Server failed health check at $HEALTH_URL" >&2
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting playwright loop"
AGENT_ID="$AGENT_ID" \
BASE_URL="$BASE_URL" \
RUN_DIR="$RUN_DIR" \
DURATION_MS="$DURATION_MS" \
node "$SCRIPT_ROOT/scripts/orchestration/agent-playwright-loop.mjs" > "$LOOP_LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] playwright loop complete"
