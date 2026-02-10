#!/usr/bin/env bash
set -e

PORT=5637
URL="http://localhost:$PORT"

caddy start --config Caddyfile 2>/dev/null
echo "Caddy running at $URL"

while true; do
  echo ""
  echo "  [o] Open in browser"
  echo "  [q] Stop Caddy and exit"
  echo ""
  read -rp "Choose: " choice
  case "$choice" in
    o|O) open "$URL" ;;
    q|Q) caddy stop 2>/dev/null; echo "Stopped."; exit 0 ;;
    *)   echo "Invalid choice." ;;
  esac
done
