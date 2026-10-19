#!/usr/bin/env bash
# Event-day launcher (Linux). Lives in the build output: `npm run build` copies it from deploy/ to dist/.
# Run it as dist/kiosk.sh, or ./kiosk.sh / `npm run kiosk` from the project root. Windows: dist\kiosk.cmd.
# All the kiosk logic (watchdog, blocked shortcuts, PIN-only exit) is in server/src/kiosk/launcher.ts.
# Override the browser with KIOSK_BROWSER=/path/to/browser.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d public ] || [ ! -d node_modules ]; then
  echo "  ⚠  This folder is not a complete build. From the project root, run ./kiosk.sh (it builds dist/ first)." >&2
  exit 1
fi
exec node server/src/kiosk/run.ts "$@"
