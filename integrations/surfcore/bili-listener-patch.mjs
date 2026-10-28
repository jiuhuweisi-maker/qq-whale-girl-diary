// Fix only the reviewed upstream listener; refuse drift instead of editing another loop.
export function patchBiliListener(source) {
  const start = source.indexOf('  async function listenTick() {');
  const end = source.indexOf('\n  // ── 直播间监听', start);
  if (start < 0 || end < start) throw new Error('Bili listener boundary drift');
  let body = source.slice(start, end);
  for (const [before, after] of [
    ['      const L = limitsNow()', '      const quotas = limitsNow()'],
    ['${L.replyDaily}', '${quotas.replyDaily}'],
    ['${L.mineDaily}', '${quotas.mineDaily}'],
    ['${L.minePerPerson}', '${quotas.minePerPerson}'],
  ]) {
    if (body.split(before).length !== 2) throw new Error('Bili listener anchor drift');
    body = body.replace(before, after);
  }
  return source.slice(0, start) + body + source.slice(end);
}
