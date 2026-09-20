#!/usr/bin/env bash
# You.com Search - API-based web search CLI entry point
# Supports macOS / Linux / Windows (Git Bash / WSL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# ---- Resolve Node.js runtime ----
NODE_BIN=""
NODE_ENV_PREFIX=()

if command -v node > /dev/null 2>&1; then
  NODE_BIN="node"
elif [ -n "${WESIGHT_ELECTRON_PATH:-}" ] && [ -x "${WESIGHT_ELECTRON_PATH}" ]; then
  NODE_BIN="$WESIGHT_ELECTRON_PATH"
  NODE_ENV_PREFIX=("ELECTRON_RUN_AS_NODE=1")
else
  echo 'Error: Node.js runtime not found. Install Node.js or ensure the WeSight Electron binary is available.' >&2
  exit 1
fi

# ---- Load .env configuration (YDC_API_KEY etc.) ----
if [ -f "$SKILL_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SKILL_DIR/.env" 2>/dev/null || true
  set +a
fi

# ---- Handle @file syntax for non-ASCII queries ----
args=()
if [ $# -gt 0 ]; then
  args=("$@")
  for i in "${!args[@]}"; do
    if [[ "${args[$i]}" == @* ]]; then
      filepath="${args[$i]:1}"
      if [ -f "$filepath" ]; then
        args[$i]="$(cat "$filepath")"
      fi
    fi
  done
fi

# ---- Execute core script ----
if [ ${#NODE_ENV_PREFIX[@]} -gt 0 ]; then
  exec env "${NODE_ENV_PREFIX[@]}" "$NODE_BIN" "$SCRIPT_DIR/youcom-search.js" "${args[@]+${args[@]}}"
else
  exec "$NODE_BIN" "$SCRIPT_DIR/youcom-search.js" "${args[@]+${args[@]}}"
fi
