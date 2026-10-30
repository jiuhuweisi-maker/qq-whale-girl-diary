#!/bin/bash
# Fresh source preparation only: no services, account login or production config.
set -euo pipefail
BUILD_TARGET=${1:?Usage: bash deploy/build-upstream.sh /absolute/NEW_SOURCE_DIRECTORY}
DEPLOY_REPO=$(cd -- "$(dirname -- "$0")/.." && pwd)
case "$BUILD_TARGET" in /*) ;; *) echo 'Use an absolute source directory' >&2; exit 64;; esac
if [ -e "$BUILD_TARGET" ]; then echo 'Target exists; refusing to overwrite it' >&2; exit 64; fi
git clone https://github.com/Mieksido/surfcore.git "$BUILD_TARGET"
git -C "$BUILD_TARGET" checkout --detach c174ed07b7ad5c64654bf3d309dd8cbac1558737
if [ "$(git -C "$BUILD_TARGET" rev-parse HEAD)" != c174ed07b7ad5c64654bf3d309dd8cbac1558737 ]; then exit 1; fi
npm --prefix "$BUILD_TARGET" ci --ignore-scripts
(cd "$BUILD_TARGET" && node scripts/patch-snowluma-sdk.mjs)
node "$DEPLOY_REPO/integrations/surfcore/build.mjs" "$BUILD_TARGET"
printf '%s\n' 'Source prepared. Next: deploy/init.mjs with a private settings JSON. Nothing is activated.'
