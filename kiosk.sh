#!/usr/bin/env bash
# Starts the kiosk from the build (dist/kiosk.sh). Rebuilds dist/ first if it is missing or older than the sources.
# On the reception PC you can also copy just dist/ and run dist/kiosk.sh there.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x dist/kiosk.sh ] || [ -n "$(find client server/src server/content deploy vite.config.ts package.json package-lock.json \
    -newer dist/package.json -print -quit)" ]; then
  echo "  Building dist/ ..."
  npm run build
fi
exec dist/kiosk.sh "$@"
