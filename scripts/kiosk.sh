#!/usr/bin/env bash
# Event-day launcher: checks LM Studio, starts the server, opens Chromium in kiosk mode.
# Exit the kiosk with Alt+F4 — that also stops the server.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
LLM="${LLM_BASE_URL:-http://localhost:1234/v1}"

if ! curl -sf -m 3 "$LLM/models" >/dev/null; then
  echo
  echo "  ⚠⚠⚠  LM Studio is NOT reachable at $LLM"
  echo "        Start LM Studio, load google/gemma-4-e2b and enable the server, then run this again."
  echo
  exit 1
fi

[ -d client/dist ] || npm run build

NODE_ENV=production PORT="$PORT" node --env-file-if-exists=.env server/src/index.ts &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

until curl -sf -m 1 "http://localhost:$PORT/api/status" >/dev/null; do sleep 0.5; done

PROFILE="$(mktemp -d)"
# X11 (XWayland) on purpose: on KDE Wayland, native-Wayland Chromium reports "fullscreen" but KWin
# gives it a smaller window. It opens on the primary monitor.
# ?kiosk=1 also makes the client request fullscreen on the first key press, as a fallback.
chromium --kiosk --start-fullscreen --ozone-platform=x11 \
  --incognito --noerrdialogs --no-first-run --disable-translate --disable-features=TranslateUI \
  --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$PROFILE" "http://localhost:$PORT/?kiosk=1"
