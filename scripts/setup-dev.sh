#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "==> Checking tools..."
command -v go &>/dev/null || { echo "ERROR: go not found"; exit 1; }
command -v node &>/dev/null || { echo "ERROR: node not found"; exit 1; }
command -v brew &>/dev/null || { echo "ERROR: brew not found (https://brew.sh)"; exit 1; }

command -v lefthook &>/dev/null || { echo "==> Installing lefthook..."; brew install lefthook; }

echo "==> Installing frontend dependencies..."
cd "$REPO_ROOT/dashboard/frontend" && npm install

echo "==> Registering pre-commit hook..."
cd "$REPO_ROOT" && lefthook install

echo ""
echo "Done. Pre-commit hook active."
echo "Bypass (emergency only): git commit --no-verify"
