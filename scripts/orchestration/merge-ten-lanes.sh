#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$SCRIPT_ROOT"

WORKTREE_ROOT="/Users/nb29255/Desktop/GitHubRepos/AgentsLeague_worktrees"
AGENT_COUNT=10
BASE_BRANCH="main"
ALLOW_DIRTY=0
DRY_RUN=0

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --worktree-root <path>   Root folder containing agent-01..agent-10 worktrees
  --agents <count>         Number of lanes to merge (default: 10)
  --base-branch <branch>   Base branch to merge into (default: main)
  --allow-dirty            Allow merge when current worktree has local changes
  --dry-run                Print merge plan without merging
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
    --base-branch)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift 1
      ;;
    --dry-run)
      DRY_RUN=1
      shift 1
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

if [[ "$ALLOW_DIRTY" -ne 1 ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Current repository has local changes. Commit/stash or pass --allow-dirty." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BASE_BRANCH" ]]; then
  echo "Switch to '$BASE_BRANCH' before merging lanes (current: $current_branch)." >&2
  exit 1
fi

git fetch --all --prune

echo "Merging lane branches into '$BASE_BRANCH'"
echo "- worktree root: $WORKTREE_ROOT"
echo "- lane count: $AGENT_COUNT"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "- mode: dry-run"
fi

merged=0
skipped=0

for i in $(seq 1 "$AGENT_COUNT"); do
  PADDED="$(printf "%02d" "$i")"
  LANE_ID="agent-${PADDED}"
  WT="${WORKTREE_ROOT}/${LANE_ID}"
  if [[ ! -d "$WT" ]]; then
    echo "Skip $LANE_ID: missing worktree ($WT)"
    skipped=$((skipped + 1))
    continue
  fi

  LANE_BRANCH="$(git -C "$WT" branch --show-current)"
  if [[ -z "$LANE_BRANCH" ]]; then
    echo "Skip $LANE_ID: detached HEAD in $WT"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ -n "$(git -C "$WT" status --porcelain)" ]]; then
    echo "Skip $LANE_ID: uncommitted changes in $WT ($LANE_BRANCH)"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$LANE_BRANCH" == "$BASE_BRANCH" ]]; then
    echo "Skip $LANE_ID: already on $BASE_BRANCH"
    skipped=$((skipped + 1))
    continue
  fi

  ahead_count="$(git rev-list --count "${BASE_BRANCH}..${LANE_BRANCH}")"
  if [[ "$ahead_count" -eq 0 ]]; then
    echo "Skip $LANE_ID: $LANE_BRANCH has no commits ahead of $BASE_BRANCH"
    skipped=$((skipped + 1))
    continue
  fi

  echo "Merge $LANE_ID: $LANE_BRANCH (ahead by $ahead_count commit(s))"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git merge --no-ff --no-edit "$LANE_BRANCH"
  fi
  merged=$((merged + 1))
done

echo "Done. merged=$merged skipped=$skipped"
