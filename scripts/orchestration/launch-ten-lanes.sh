#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$SCRIPT_ROOT"

WORKTREE_ROOT="/Users/nb29255/Desktop/GitHubRepos/AgentsLeague_worktrees"
AGENT_COUNT=10
BASE_PORT=4300
DURATION_MS=$((6 * 60 * 60 * 1000))
RUN_ROOT="orchestration/runs"
RUN_ID=""

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --worktree-root <path>   Root folder containing agent-01..agent-10 worktrees
  --agents <count>         Number of lanes (default: 10)
  --base-port <port>       Base port (agent N uses base+N)
  --duration-ms <ms>       Duration per lane in ms (default: 21600000 = 6h)
  --run-root <path>        Root output folder (default: orchestration/runs)
  --run-id <id>            Explicit run id (default: UTC timestamp)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worktree-root)
      WORKTREE_ROOT="$2"
      shift 2
      ;;
    --agents)
      AGENT_COUNT="$2"
      shift 2
      ;;
    --base-port)
      BASE_PORT="$2"
      shift 2
      ;;
    --duration-ms)
      DURATION_MS="$2"
      shift 2
      ;;
    --run-root)
      RUN_ROOT="$2"
      shift 2
      ;;
    --run-id)
      RUN_ID="$2"
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

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
fi

RUN_DIR="${RUN_ROOT}/${RUN_ID}"
mkdir -p "$RUN_DIR"
PIDS_FILE="$RUN_DIR/pids.txt"
: > "$PIDS_FILE"

echo "Launching ${AGENT_COUNT} lanes"
echo "- worktree root: $WORKTREE_ROOT"
echo "- run dir: $RUN_DIR"
echo "- duration ms: $DURATION_MS"

for i in $(seq 1 "$AGENT_COUNT"); do
  PADDED="$(printf "%02d" "$i")"
  LANE_ID="agent-${PADDED}"
  WT="${WORKTREE_ROOT}/${LANE_ID}"
  if [[ ! -d "$WT" ]]; then
    echo "Missing worktree: $WT" >&2
    exit 1
  fi

  PORT=$((BASE_PORT + i))
  LANE_RUN_DIR="$RUN_DIR/$LANE_ID"
  mkdir -p "$LANE_RUN_DIR"

  echo "Starting $LANE_ID on port $PORT"
  ./scripts/orchestration/worktree-lane-runner.sh \
    --worktree "$WT" \
    --agent-id "$PADDED" \
    --port "$PORT" \
    --run-dir "$LANE_RUN_DIR" \
    --duration-ms "$DURATION_MS" \
    > "$LANE_RUN_DIR/lane-wrapper.log" 2>&1 &

  PID=$!
  echo "$LANE_ID $PID" >> "$PIDS_FILE"
done

cleanup_all() {
  local code=$?
  while read -r lane pid; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done < "$PIDS_FILE"
  wait || true
  exit "$code"
}

trap cleanup_all INT TERM

while true; do
  ACTIVE=0
  while read -r _lane pid; do
    PARENT_PID="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
    if [[ "$PARENT_PID" == "$$" ]]; then
      ACTIVE=$((ACTIVE + 1))
    fi
  done < "$PIDS_FILE"

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] active lanes: $ACTIVE"
  if [[ "$ACTIVE" -eq 0 ]]; then
    break
  fi
  sleep 20
done

echo "All lanes completed, generating aggregate summary"
node ./scripts/orchestration/summarize-run.mjs "$RUN_DIR"
echo "Done: $RUN_DIR"
