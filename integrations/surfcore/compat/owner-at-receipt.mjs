// 221（2026-11-08 主人令）：她在主人 QQ 私信里提起一个视频想分享时，
// 除了给链接，还要真去那条视频评论区 @ 主人。办完只在本机悄悄记一笔事实：
// 不推送、不报备、不播报。QQ 侧只有主人真问起时，才把这条事实拿出来核对。
//
// 这个文件刻意放在 ~/.dsh/surfcore/ 根下（和 bili.config.json 同级），不依赖
// 角色包目录或任何私有 state-paths 模块 —— B站 侧写、QQ 侧读，两边都能独立算出来。
// 它是运行时产物，不是初始状态：新机没有也正常，第一次成功 @ 后自动生成，不用进迁移包。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BV = /^BV[0-9A-Za-z]{10}$/;
export const OWNER_AT_RECEIPT_NAME = 'owner-at-receipt.json';

export function ownerAtReceiptFile(home = process.env.DSH_HOME || os.homedir()) {
  return path.join(home, '.dsh', 'surfcore', OWNER_AT_RECEIPT_NAME);
}

/** 只在 B站 接口真的接受（code=0 且拿到 rpid）之后调用；失败一律不写，保持沉默。 */
export function writeOwnerAtReceipt({bvid, rpid, aid = '', at, file} = {}) {
  const bv = String(bvid ?? '').trim();
  const id = String(rpid ?? '').trim();
  if (!BV.test(bv) || !id) return false;
  const stamp = Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  const target = file || ownerAtReceiptFile();
  const entry = {
    at: stamp,
    bvid: bv,
    aid: String(aid ?? ''),
    rpid: id,
    url: `https://www.bilibili.com/video/${bv}/#reply${id}`,
    kind: 'owner-share-comment',
  };
  try {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry, null, 2) + '\n', {encoding: 'utf8', mode: 0o600});
    fs.renameSync(tmp, target);
    try { fs.chmodSync(target, 0o600); } catch {}
    return true;
  } catch {
    // 记账失败不能影响已经发出去的评论，也不该让 agent 以为没发成功。
    return false;
  }
}

/** 只认最近 7 天的一条；过期、损坏、缺字段都当作「没有可核对的事实」。 */
export function readOwnerAtReceipt(file, {now = Date.now(), maxAgeMs = 7 * 86400000} = {}) {
  try {
    const e = JSON.parse(fs.readFileSync(file || ownerAtReceiptFile(), 'utf8'));
    if (!e || !BV.test(String(e.bvid ?? '')) || !String(e.rpid ?? '').trim()) return null;
    const t = Date.parse(e.at);
    if (!Number.isFinite(t) || now - t > maxAgeMs || t > now + 60000) return null;
    return e;
  } catch {
    return null;
  }
}

// 只有主人真的在问「@了没 / 那条评论 / 发出去没」时才给事实；平时返回空串，
// 提示里完全不出现，她也就没有机会主动播报这件事。
const ASK = /@\s*(?:了|好)?\s*没|@\s*我|发(?:出去|了|好)?\s*(?:了)?\s*没|那条(?:评论|@|视频)|评论(?:发|去|看)|去\s*@|看得到吗|看得到嘛|搞砸|没发出|又没成|过不去/iu;

export function ownerAtReceiptBlock(query, {file, now = Date.now()} = {}) {
  const q = String(query ?? '');
  if (!q || !ASK.test(q)) return '';
  const r = readOwnerAtReceipt(file, {now});
  if (!r) return '';
  const when = String(r.at).slice(0, 16).replace('T', ' ');
  return [
    '【跨端事实 · 只用来核对，别主动提】',
    `主人问起的这条视频，B站 这边确实发过一条 @ 主人的分享评论：${r.bvid}，${when}，${r.url}。`,
    '只有主人问起才照这句事实答完，不问就一个字都别提；不补进度、不评价成败、不说「没发出去／又没成／搞砸了」，更不要为它再跑去发一次。',
  ].join('\n');
}
