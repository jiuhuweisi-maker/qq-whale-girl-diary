'use strict';

/**
 * B 站自动学习适配器：
 *   discover("知识区", {limit}) / discover("搜:鸣潮", {limit}) -> 视频链接[]
 *   fetch(link) -> Item[]（复用 lib/bili.js 的评论+弹幕采集；每条带
 *   scene=view.tname / title=view.title，UP 主本人评论已被 collect 过滤）
 *
 * 只读、不登录；客户端串行 2.5 秒/请求，412 / -352 停 10 分钟。
 */

const bili = require('./fishtalk-bili.cjs');

const ZONES = {
  全站: 0,
  知识: 36,
  知识区: 36,
  游戏: 4,
  游戏区: 4,
  生活: 160,
  生活区: 160,
  科技: 188,
  科技区: 188,
  美食: 211,
  美食区: 211,
  动物: 217,
  动物区: 217,
  音乐: 3,
  音乐区: 3,
  影视: 181,
  影视区: 181,
  动画: 1,
  动画区: 1,
  鬼畜: 119,
  鬼畜区: 119,
  舞蹈: 129,
  舞蹈区: 129,
  时尚: 155,
  时尚区: 155,
  汽车: 223,
  汽车区: 223,
  运动: 234,
  运动区: 234,
  纪录片: 177,
  纪录片区: 177,
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const INTERVAL = 2500;
const BLOCK_MS = 10 * 60 * 1000;

let lastRequestAt = 0;
let blockedUntil = 0;

class SiteError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'SiteError';
    this.code = code;
    this.detail = detail;
  }
}

function resetRateLimit() {
  lastRequestAt = 0;
  blockedUntil = 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wait(opts = {}) {
  const now = Date.now();
  if (now < blockedUntil) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    throw new SiteError('rate_limited', `B 站风控冷却中，约 ${retryAfter} 秒后再试。`, { retryAfter });
  }
  const interval = Number.isFinite(opts.intervalMs) ? Math.max(0, opts.intervalMs) : INTERVAL;
  const gap = Math.max(0, lastRequestAt + interval - now);
  if (gap > 0) await (opts.sleep || sleep)(gap);
  lastRequestAt = Date.now();
}

function block(message = 'B 站风控/412，已停 10 分钟。') {
  blockedUntil = Date.now() + BLOCK_MS;
  throw new SiteError('rate_limited', message, { retryAfter: Math.ceil(BLOCK_MS / 1000) });
}

async function getJson(url, opts = {}) {
  await wait(opts);
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new SiteError('no_fetch', '需要 Node 18 的 fetch。');
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': opts.userAgent || UA,
      referer: opts.referer || 'https://www.bilibili.com/',
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
    },
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(opts.timeoutMs || 15000)
      : undefined,
  });
  if (res.status === 412) block('B 站 412，已停 10 分钟。');
  if (!res.ok) throw new SiteError('http_error', `B 站返回 HTTP ${res.status}`, { status: res.status });
  let body;
  try {
    body = await res.json();
  } catch (error) {
    throw new SiteError('api_error', 'B 站返回的不是 JSON。');
  }
  if (body.code !== 0) {
    if (body.code === -352 || body.code === -412) block(`B 站风控（${body.code}），已停 10 分钟。`);
    throw new SiteError('api_error', body.message || `B 站接口错误 ${body.code}`, { code: body.code });
  }
  return body.data;
}

function zoneId(target) {
  const key = String(target || '').trim();
  const noSuffix = key.replace(/区$/, '');
  if (Object.prototype.hasOwnProperty.call(ZONES, key)) return ZONES[key];
  if (Object.prototype.hasOwnProperty.call(ZONES, noSuffix)) return ZONES[noSuffix];
  return null;
}

function replyCount(item) {
  const raw = item && (
    (item.stat && item.stat.reply)
    ?? item.review
    ?? (item.stat && item.stat.reply_count)
  );
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function byRepliesDesc(a, b) {
  return replyCount(b) - replyCount(a);
}

function clampLimit(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 10;
}

async function discover(target, opts = {}) {
  const limit = clampLimit(opts.limit);
  const raw = String(target || '').trim();
  if (!raw) throw new SiteError('invalid_input', 'target 不能为空。');
  if (/^搜[:：]/.test(raw)) {
    const keyword = raw.replace(/^搜[:：]\s*/, '').trim();
    if (!keyword) throw new SiteError('invalid_input', '「搜:」后面要有词。');
    const data = await getJson(
      `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&order=totalrank&page=1`,
      opts,
    );
    const list = data && Array.isArray(data.result) ? data.result : [];
    return list
      .filter((x) => x && /^BV[0-9A-Za-z]{10}$/.test(x.bvid || ''))
      .sort(byRepliesDesc)
      .slice(0, limit)
      .map((x) => `https://www.bilibili.com/video/${x.bvid}`);
  }

  const rid = zoneId(raw);
  if (rid == null) {
    throw new SiteError('invalid_input', `不认识的分区：${raw}。可用：${Object.keys(ZONES).join('、')}；或写「搜:关键词」。`);
  }
  const data = await getJson(
    `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`,
    opts,
  );
  const list = data && Array.isArray(data.list) ? data.list : [];
  return list
    .filter((x) => x && /^BV[0-9A-Za-z]{10}$/.test(x.bvid || ''))
    .sort(byRepliesDesc)
    .slice(0, limit)
    .map((x) => `https://www.bilibili.com/video/${x.bvid}`);
}

async function fetchOne(link, opts = {}) {
  try {
    // discover 刚发过请求；先补足站内间隔，再交给 lib/bili 的三连请求。
    await wait(opts);
    return await bili.collect(link, {
      intervalMs: INTERVAL,
      danmakuLimit: Number.isFinite(opts.danmakuLimit) ? opts.danmakuLimit : 50,
      includeDanmaku: opts.includeDanmaku !== false,
      ...opts,
    });
  } finally {
    lastRequestAt = Date.now();
  }
}

module.exports = {
  discover,
  fetch: fetchOne,
  SiteError,
  resetRateLimit,
  ZONES,
  zoneId,
  replyCount,
  _internal: { getJson, clampLimit },
};
