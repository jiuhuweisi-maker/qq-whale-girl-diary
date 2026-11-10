// 222（2026-11-08 主人令）：「分享」必须是行为，不是一句链接。
//
// 221 的失败：QQ 侧模型调了 qq_switch_scene，但漏带 atOwner；B站 侧按普通 speak
// 去视频底下发了条 share:false 的评论，主人压根没被 @。规则、角色卡、preset 全在，
// 模型这一轮就是没照做 —— 所以 222 起不再让模型决定这件事。
//
// 这条执行器由 scheduler 在领到 atOwner=true 的换场便条时直接跑：BV→aid、
// comment --share --auto --owner-ok 先 --dry 再 --go。comment.mjs 自己会把
// 「发出去了」悄悄写进 owner-at-receipt.json（不推送、不报备、不播报）。
// 任何一步不成功就静默停手，不重试、不换文案、不惊动 QQ 那端。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const BV = /^BV[0-9A-Za-z]{10}$/

async function aidOf(bvid) {
  const res = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
    headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
    signal: AbortSignal.timeout(10000),
  })
  const j = await res.json()
  const aid = String(j?.data?.aid ?? '')
  return /^\d{1,20}$/.test(aid) ? aid : ''
}

/**
 * @param {{bvid:string, reason?:string, message?:string, runBili:(args:string[])=>Promise<{ok:boolean,out?:string,err?:string}>, log?:(s:string)=>void}} input
 */
export async function runOwnerShareComment({ bvid, reason = '', message = '', runBili, log = () => {} } = {}) {
  const bv = String(bvid ?? '').trim()
  if (!BV.test(bv)) return { ok: false, reason: 'bad-bvid' }
  if (typeof runBili !== 'function') return { ok: false, reason: 'no-runner' }

  let aid = ''
  try { aid = await aidOf(bv) } catch (error) {
    return { ok: false, reason: 'aid-fetch:' + String(error?.name || error) }
  }
  if (!aid) return { ok: false, reason: 'aid-missing' }

  // 分享型评论正文里不许带 URL（会被 B站 判成仅自己可见），也不许夹别的 @。
  // @ 主人由 comment.mjs 按配置里的 owner.name 自动补在最前面。
  const msg = String(message ?? '')
    .replace(/https?:\/\/\S+/gu, '')
    .replace(/@/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 90) || `这条挺有意思，叫主人也来看看 ${bv}`
  const why = String(reason ?? '').trim().slice(0, 120)
    || `主人在 QQ 私信里想一起看这条视频，她顺手把他也叫来了 ${bv}`
  if (why.length < 8) return { ok: false, reason: 'reason-too-short' }

  const base = ['comment', '--oid', aid, '--bvid', bv, '--message', msg,
    '--share', '--auto', '--owner-ok', '--reason', why]
  const dry = await runBili([...base, '--dry'])
  if (!dry?.ok) return { ok: false, aid, reason: 'dry:' + String(dry?.err || dry?.out || '').slice(-180) }
  const go = await runBili([...base, '--go'])
  if (!go?.ok) return { ok: false, aid, reason: 'go:' + String(go?.err || go?.out || '').slice(-180) }
  const rpid = /rpid=(\d+)/.exec(String(go.out || ''))?.[1] ?? ''
  log(`[bili-whale] 主人分享已发出 ${bv} rpid=${rpid}`)
  return { ok: true, aid, rpid }
}
