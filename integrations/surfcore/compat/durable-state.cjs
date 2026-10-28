// Candidate-only state engine. The same function is embedded in the generated bridge.
// Two fsynced, atomically renamed slots; any unreadable existing slot fails closed.
function createDeliveryState({ fs, hash, basePath, namespace, now, diag }) {
  let healthy = true;
  const fresh = () => ({ inbox: {}, outbox: {}, pictures: {}, groupPictureAt: 0 });
  let data = fresh(), revision = 0;
  const fail = error => {
    healthy = false;
    diag('持久消息账本不可用，暂停收发；不会自动重登：' + String(error.message || error).slice(0, 100));
    return false;
  };
  try {
    const slots = [];
    for (const slot of [0, 1]) {
      const file = basePath + '.' + slot;
      if (!fs.existsSync(file)) continue;
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      const { checksum, ...payload } = record;
      if (payload.version !== 1 || payload.namespace !== namespace || !Number.isSafeInteger(payload.revision) || payload.revision < 1 || checksum !== hash(JSON.stringify(payload))) throw new Error('state format/checksum mismatch');
      const d = payload.data;
      if (!d || !['inbox', 'outbox', 'pictures'].every(k => d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) || !Number.isFinite(d.groupPictureAt)) throw new Error('invalid state data');
      if (Object.values(d.inbox).some(r => !r || !Number.isFinite(r.at) || !Number.isFinite(r.expiresAt) || !['buffered', 'submitting', 'queued', 'claimed', 'completed', 'skipped', 'expired', 'uncertain'].includes(r.stage))) throw new Error('invalid inbox');
      if (Object.values(d.outbox).some(r => !r || !Number.isFinite(r.at) || !Array.isArray(r.attempts) || !['sending', 'sent', 'suppressed', 'rejected', 'uncertain'].includes(r.status))) throw new Error('invalid outbox');
      if (Object.values(d.pictures).some(t => !Number.isFinite(t))) throw new Error('invalid picture state');
      slots.push(payload);
    }
    slots.sort((a, b) => b.revision - a.revision);
    if (slots.length) { data = slots[0].data; revision = slots[0].revision; }
  } catch (error) { fail(error); }
  function change(edit) {
    if (!healthy) return false;
    try {
      const next = JSON.parse(JSON.stringify(data));
      const t = now();
      for (const [key, r] of Object.entries(next.inbox)) {
        if (['completed', 'skipped', 'expired'].includes(r.stage) && t - r.at > 86400000) delete next.inbox[key];
      }
      for (const [key, r] of Object.entries(next.outbox)) {
        if (['sent', 'suppressed', 'rejected'].includes(r.status) && t - r.at > 86400000) delete next.outbox[key];
      }
      for (const [key, t0] of Object.entries(next.pictures)) if (t - t0 >= 86400000) delete next.pictures[key];
      edit(next);
      // Never evict fresh or uncertain deliveries to make room for another one.
      if (Object.keys(next.inbox).length > 20000 || Object.keys(next.outbox).length > 20000) throw new Error('state capacity reached; reconciliation required');
      const payload = { version: 1, namespace, revision: revision + 1, data: next };
      const file = basePath + '.' + (payload.revision % 2), temp = file + '.tmp';
      const serialized = JSON.stringify({ ...payload, checksum: hash(JSON.stringify(payload)) });
      let fd;
      try { fd = fs.openSync(temp, 'w', 0o600); fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); }
      finally { if (fd !== undefined) fs.closeSync(fd); }
      fs.renameSync(temp, file);
      // Directory sync is required for the rename to survive a host crash on Linux.
      let dirfd;
      try { dirfd = fs.openSync(basePath.slice(0, basePath.lastIndexOf('/')), 'r'); fs.fsyncSync(dirfd); }
      finally { if (dirfd !== undefined) fs.closeSync(dirfd); }
      data = next; revision = payload.revision;
      return true;
    } catch (error) { return fail(error); }
  }
  return { get healthy() { return healthy; }, get data() { return data; }, change };
}
module.exports = { createDeliveryState };
