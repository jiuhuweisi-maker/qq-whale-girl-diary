// The reproducible control-only package deliberately has no self-updater.
// Existing production installations keep their original module; this file is
// for a fresh installation where SurfCore's automatic updates are disabled.
export function createSelfUpdate() {
  return {register() {}};
}
