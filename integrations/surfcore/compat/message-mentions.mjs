// Preserve OneBot at-segment identity independently of display text and truncation.
export async function extractMentions(segments, {selfId = '', resolveAtName} = {}) {
  const mentions = [], seen = new Set();
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (seg?.type !== 'at') continue;
    const userId = String(seg.data?.qq ?? '').trim();
    if (!/^(?:all|\d+)$/.test(userId) || seen.has(userId)) continue;
    seen.add(userId);
    let name = userId === 'all' ? '全体成员' : '';
    if (!name && resolveAtName) { try { name = await resolveAtName(userId) || ''; } catch {} }
    name = String(name).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0,80);
    mentions.push({userId, ...(name ? {name} : {}), isSelf: userId !== 'all' && userId === String(selfId)});
  }
  return mentions;
}
