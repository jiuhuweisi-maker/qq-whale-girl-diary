#!/bin/bash
# Fresh source preparation only: no services, account login or production config.
set -euo pipefail
BUILD_TARGET=${1:?Usage: bash deploy/build-upstream.sh /absolute/NEW_SOURCE_DIRECTORY}
DEPLOY_REPO=$(cd -- "$(dirname -- "$0")/.." && pwd)
case "$BUILD_TARGET" in /*) ;; *) echo 'Use an absolute source directory' >&2; exit 64;; esac
if [ -e "$BUILD_TARGET" ]; then echo 'Target exists; refusing to overwrite it' >&2; exit 64; fi
git clone https://github.com/Mieksido/surfcore.git "$BUILD_TARGET"
UPSTREAM_PIN=$(node --input-type=module -e 'import {pathToFileURL} from "node:url"; const m=await import(pathToFileURL(process.argv[1])); console.log(m.SURFCORE_UPSTREAM)' "$DEPLOY_REPO/integrations/surfcore/version.mjs")
git -C "$BUILD_TARGET" checkout --detach "$UPSTREAM_PIN"
if [ "$(git -C "$BUILD_TARGET" rev-parse HEAD)" != "$UPSTREAM_PIN" ]; then exit 1; fi
node "$DEPLOY_REPO/integrations/surfcore/build.mjs" "$BUILD_TARGET"
# The overlay adds the bounded-image preview dependencies to package + lock.
# Install that reviewed lockfile, rather than the unmodified upstream package.
npm --prefix "$BUILD_TARGET" ci --ignore-scripts
(cd "$BUILD_TARGET" && node scripts/patch-snowluma-sdk.mjs)
printf '%s\n' 'Source prepared. Next: deploy/init.mjs with a private settings JSON. Nothing is activated.'
