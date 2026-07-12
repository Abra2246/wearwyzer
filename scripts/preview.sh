#!/usr/bin/env bash
# Serves the WearWyzer site locally with Python's built-in HTTP server and
# opens the home page in the default browser (macOS). No npm, no build step,
# no dependencies beyond python3, which ships with macOS.
#
# Usage:
#   ./scripts/preview.sh          # serves on port 8000
#   ./scripts/preview.sh 3000     # serves on a custom port
#
# Stop the server with Ctrl+C in this terminal.
set -euo pipefail

PORT="${1:-8000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://localhost:${PORT}/index.dc.html"

cd "${REPO_ROOT}"

if command -v open >/dev/null 2>&1; then
  ( sleep 1 && open "${URL}" ) &
fi

echo "Serving WearWyzer at ${URL}"
echo "Press Ctrl+C to stop the server."
exec python3 -m http.server "${PORT}"
