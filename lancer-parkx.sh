#!/bin/sh
# Lance PARKX sur http://localhost:4173 (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé (https://nodejs.org). Vous pouvez aussi ouvrir directement application/PARKX.html"
  exit 1
fi
node serveur-local.mjs
