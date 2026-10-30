#!/bin/bash
set -euo pipefail

PAUSE_FLAG=/opt/qq-cs/.napcat-risk-paused
CONTAINER=napcat

if [ -e "$PAUSE_FLAG" ]; then
  exit 0
fi

# NapCat may keep refreshing a login QR code after QQ revokes the session.
# Follow the container log and stop it as soon as QQ reports a forced logout.
docker logs --follow --since=30s "$CONTAINER" 2>&1 | while IFS= read -r line; do
  case "$line" in
    *'[KickedOffLine]'*)
      printf '%s QQ forced the device offline; NapCat paused.\n' "$(date '+%F %T %z')" > "$PAUSE_FLAG"
      docker update --restart=no "$CONTAINER" >/dev/null
      docker stop "$CONTAINER" >/dev/null
      exit 0
      ;;
  esac
done
