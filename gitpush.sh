#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ResGro-AI — Stage all changes, commit (if any), push to default branch
#
# Always runs from this repository root (not your current shell directory).
#
# Usage:
#   ./gitpush.sh                      # message: chore: automated commit
#   ./gitpush.sh "feat: your message"
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

MSG="${1:-chore: automated commit}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Error: not a git repository: $ROOT_DIR"
    exit 1
fi

git add -A

if git diff --cached --quiet; then
    echo "Nothing to commit (working tree clean after add). Skipping commit and push."
    exit 0
fi

git commit -m "$MSG"

BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/origin/@@" || true)
if [ -z "$BRANCH" ]; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
fi

echo "Pushing to origin/$BRANCH ..."
git push origin "$BRANCH"
