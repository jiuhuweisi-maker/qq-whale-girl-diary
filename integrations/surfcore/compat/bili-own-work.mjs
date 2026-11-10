// 2026-11-06（213）：她「自己的作品」下开新楼 —— 必须让主人看见，不能发成没人看的独白。
//
// 背景（主人点名）：12:49 她在自己投稿的视频底下说了段做视频的感受，正文没 @；
//   那条视频没几个人看，主人也就没看见 —— 主人定下两条触发条件：
//     ① 她自己的作品（自己的投稿 / 自己发的动态）下开新楼 → 自动 @ 主人（正文以 @昵称 开头，没写就补）
//     ② 刷到觉得主人会喜欢的 → 必须走 --share（那套标尺和额度不省，见 comment.mjs）
// 这里只放纯函数：网络探测留在 comment.mjs（好单测、好离线跑，不在测试里打真接口）。
const MID = /^[1-9]\d{0,19}$/

/**
 * 这条评论是不是开在她自己的作品底下。
 * @param {{type?:string, oid?:string, selfMid?:string, viewOwnerMid?:string, dynamicIds?:Set<string>|string[]|null}} p
 * @returns {boolean}
 */
export function isOwnWork({ type = '1', oid = '', selfMid = '', viewOwnerMid = '', dynamicIds = null } = {}) {
  const self = String(selfMid ?? '').trim()
  if (!MID.test(self)) return false   // 认不出自己是谁 → 不当成自己的作品（宁可走普通流程）
  if (String(type) === '1') return String(viewOwnerMid ?? '').trim() === self
  if (String(type) === '11' || String(type) === '17') {
    const ids = dynamicIds instanceof Set ? [...dynamicIds]
      : Array.isArray(dynamicIds) ? dynamicIds : []
    return ids.map(String).includes(String(oid))
  }
  return false
}

/**
 * 正文开头补 @主人（已经以 @昵称 开头就原样不动）。
 * @returns {{ok:boolean, message:string, added:boolean, reason?:string}}
 */
export function withOwnerMention(message, ownerName) {
  const text = String(message ?? '')
  const name = String(ownerName ?? '').trim()
  if (!name) return { ok: false, message: text, added: false, reason: 'OWNER_NAME_MISSING' }
  // 边界要跟 ownerMentionMap 对齐：`@昵称的人` 不算 @ 到他，否则会以为已经喊过了。
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const already = new RegExp('^@' + escaped + '(?=$|[\\s，。！？、,.!?:：;；）)])', 'u').test(text.trimStart())
  if (already) return { ok: true, message: text, added: false }
  return { ok: true, message: `@${name} ${text.trimStart()}`, added: true }
}
