// Public Bili facts and explicit owner mentions; never read private messages.
const BV = /^BV[0-9A-Za-z]{10}$/;
const clean = value => String(value || '').replace(/[\r\n\t]+/g, ' ').trim();

export function ownerMentionMap(message, owner = {}) {
  const name = clean(owner.name);
  if (!name) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp('@' + escaped + '(?=$|[\\s，。！？、,.!?:：;；）)])', 'u').test(String(message || ''))) return null;
  const mid = String(owner.mid || '').trim();
  if (!/^[1-9]\d{0,19}$/.test(mid)) throw Error('主人B站账号未配置完整，这条@暂未发送');
  return { [name]: mid };
}

export function publicWatchFacts(rows, now = Date.now()) {
  const byVideo = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const bvid = String(row?.bvid || ''), title = clean(row?.title).slice(0, 180);
    const timestamp = Date.parse(row?.at || '');
    if (!BV.test(bvid) || !title || row.unknownDate || !Number.isFinite(timestamp) || timestamp > now + 5000) continue;
    const depth = row.frames === true ? 3 : row.subs ? 2 : row.mode === 'full' ? 1 : 0;
    const coverage = depth === 3 ? '记录显示看过部分画面，未确认完整观看'
      : depth === 2 ? '记录显示读到过字幕，未确认覆盖整条视频'
      : depth === 1 ? '记录显示读取过视频资料，未确认完整观看'
      : '仅浏览过标题或简介，未记录观看细节';
    const previous = byVideo.get(bvid);
    if (previous && previous.depth > depth) continue;
    if (previous && previous.depth === depth && Date.parse(previous.at) >= timestamp) continue;
    byVideo.set(bvid, { bvid, title, at: new Date(timestamp).toISOString(), depth, coverage });
  }
  return [...byVideo.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}
