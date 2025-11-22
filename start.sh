#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run this project. Please install Node.js 18+ and npm." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting dev environment (Vite + Electron)..."
npm run dev
