'use strict';

/**
 * B 站只读采集：视频信息、第 1 页热门评论、楼中楼预览、弹幕。
 *
 * 不登录、不写操作。客户端自己做串行限流；服务端 412 / -352 时进入
 * 10 分钟冷却，下一次调用直接抛 rate_limited，不会偷偷重试。
 */

const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_BLOCK_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_DANMAKU_LIMIT = 500;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

class BiliError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'BiliError';
    this.code = code;
    this.detail = detail;
  }
}

let lastRequestAt = 0;
let blockedUntil = 0;
let buvidTried = false;
let buvidCookie = '';

function resetRateLimit() {
  lastRequestAt = 0;
  blockedUntil = 0;
  buvidTried = false;
  buvidCookie = '';
}

function sleepDefault(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBvid(input) {
  const value = String(input || '').trim();
  const match = value.match(/(?<![0-9A-Za-z])BV[0-9A-Za-z]{10}(?![0-9A-Za-z])/); // 锚定首尾：多打一个字母不能静默抓成另一支（交接文档问题 1）
  if (!match) throw new BiliError('invalid_input', `不是有效的 BV 号或链接：${value}`, { input: value });
  return match[0];
}

function dayFromUnix(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date((n + 8 * 3600) * 1000).toISOString().slice(0, 10);
}

function decodeXml(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

async function gate(opts) {
  const now = Date.now();
  if (now < blockedUntil) {
    const retryAfter = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
    throw new BiliError('rate_limited', `B 站风控冷却中，约 ${retryAfter} 秒后再试。`, { retryAfter });
  }
  const interval = Number.isFinite(opts.intervalMs) ? Math.max(0, opts.intervalMs) : DEFAULT_INTERVAL_MS;
  const wait = Math.max(0, lastRequestAt + interval - now);
  if (wait > 0) await (opts.sleep || sleepDefault)(wait);
  lastRequestAt = Date.now();
}

function block(opts, message) {
  const ms = Number.isFinite(opts.blockMs) ? opts.blockMs : DEFAULT_BLOCK_MS;
  blockedUntil = Date.now() + ms;
  const retryAfter = Math.max(1, Math.ceil(ms / 1000));
  throw new BiliError('rate_limited', message || `B 站风控，停 ${retryAfter} 秒。`, { retryAfter });
}

function headers(opts) {
  const h = {
    'user-agent': opts.userAgent || UA,
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    referer: opts.referer || 'https://www.bilibili.com/',
  };
  if (buvidCookie) h.cookie = buvidCookie;
  return h;
}

async function fetchRaw(url, opts, extra = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BiliError('no_fetch', '当前 Node 没有 fetch，请用 Node 18 以上。');
  }
  const retries = Number.isFinite(opts.retries) ? opts.retries : 1;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await gate(opts);
    try {
      const res = await fetchImpl(url, {
        headers: { ...headers(opts), ...(extra.headers || {}) },
        signal: timeoutSignal(Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS),
      });
      if (res.status === 412) block(opts, 'B 站返回 412，已停 10 分钟。');
      if (res.status >= 500 && attempt < retries) {
        lastError = new BiliError('http_error', `B 站返回 HTTP ${res.status}`, { status: res.status });
        await (opts.sleep || sleepDefault)(Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : DEFAULT_RETRY_DELAY_MS);
        continue;
      }
      return res;
    } catch (error) {
      if (error instanceof BiliError) throw error;
      lastError = error;
      if (attempt < retries) {
        await (opts.sleep || sleepDefault)(Number.isFinite(opts.retryDelayMs) ? opts.retryDelayMs : DEFAULT_RETRY_DELAY_MS);
        continue;
      }
      throw new BiliError('network_error', `请求失败：${error.message || error}`, { url });
    }
  }
  throw lastError;
}

async function ensureBuvid(opts) {
  if (opts.buvid !== true || buvidTried || buvidCookie) return;
  buvidTried = true;
  try {
    const res = await fetchRaw('https://api.bilibili.com/x/frontend/finger/spi', opts, {
      headers: { referer: 'https://www.bilibili.com/' },
    });
    if (!res.ok) return;
    const body = await res.json();
    const b3 = body && body.data && body.data.b_3;
    const b4 = body && body.data && body.data.b_4;
    if (b3) {
      buvidCookie = `buvid3=${b3}${b4 ? `; buvid4=${b4}` : ''}`;
    }
  } catch (error) {
    if (error instanceof BiliError && error.code === 'rate_limited') throw error;
    // 拿不到 buvid 也继续试；失败会在正式请求里暴露。
  }
}

async function requestJson(url, opts) {
  const res = await fetchRaw(url, opts);
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    throw new BiliError('api_error', 'B 站返回的不是 JSON。', { status: res.status, sample: raw.slice(0, 120) });
  }
  if (!body || body.code !== 0) {
    if (body && (body.code === -352 || body.code === -412)) {
      block(opts, `B 站风控（${body.code}），已停 10 分钟。`);
    }
    throw new BiliError('api_error', (body && body.message) || 'B 站接口报错。', {
      code: body && body.code,
      status: res.status,
    });
  }
  return body.data;
}

async function requestText(url, opts) {
  const res = await fetchRaw(url, opts);
  if (!res.ok) {
    throw new BiliError('http_error', `B 站返回 HTTP ${res.status}`, { status: res.status, url });
  }
  return res.text();
}

function commentItems(data, bvid, meta = {}) {
  const items = [];
  const seen = new Set();
  const roots = [];
  const ownerMid = Number(meta.ownerMid);
  const scene = String(meta.scene || '').trim() || 'bili';
  const title = String(meta.title || '').trim();
  if (data && data.top) roots.push(data.top);
  // data.upper.top 是 UP 主置顶，通常是推广；整条不要。
  if (data && Array.isArray(data.replies)) roots.push(...data.replies);

  const add = (r, kind) => {
    if (!r || seen.has(r.rpid)) return;
    if (Number.isFinite(ownerMid) && ownerMid > 0 && Number(r.mid) === ownerMid) {
      // UP 主本人发的评论（置顶推广、作者回复）不是真人语料。
      return;
    }
    seen.add(r.rpid);
    const text = String((r.content && r.content.message) || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return;
    const item = {
      text,
      source: 'bili',
      where: bvid,
      kind,
      likes: Number.isFinite(r.like) ? r.like : 0,
      day: dayFromUnix(r.ctime),
      scene,
      ...(title ? { title } : {}),
    };
    items.push(item);
  };

  for (const root of roots) {
    if (!root) continue;
    add(root, 'comment');
    if (Array.isArray(root.replies)) {
      for (const reply of root.replies) add(reply, 'reply');
    }
  }
  return items;
}

function danmakuItems(xml, bvid, limit, meta = {}) {
  const items = [];
  const scene = String(meta.scene || '').trim() || 'bili';
  const title = String(meta.title || '').trim();
  const re = /<d\b[^>]*\bp="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
  let match;
  while ((match = re.exec(xml))) {
    const p = match[1].split(',');
    const text = decodeXml(match[2]).replace(/\r\n?/g, '\n').trim();
    if (!text) continue;
    const time = Number(p[0]);
    const ts = Number(p[4]);
    items.push({
      text,
      source: 'bili',
      where: bvid,
      kind: 'danmaku',
      day: dayFromUnix(ts),
      scene,
      ...(title ? { title } : {}),
      _time: Number.isFinite(time) ? time : 0,
    });
  }
  items.sort((a, b) => a._time - b._time);
  return items.slice(0, Math.max(0, limit)).map(({ _time, ...item }) => item);
}

/**
 * @param {string} bv BV 号或链接
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=2500]
 * @param {number} [opts.danmakuLimit=500]
 * @param {boolean} [opts.includeDanmaku=true]
 * @param {boolean} [opts.buvid=false] 默认不带 buvid；实测新 buvid 反而只回 3 条
 * @param {Function} [opts.fetch] 测试注入
 * @param {Function} [opts.sleep] 测试注入
 * @returns {Promise<Array>}
 */
async function collect(bv, opts = {}) {
  const bvid = normalizeBvid(bv);
  const options = {
    intervalMs: DEFAULT_INTERVAL_MS,
    blockMs: DEFAULT_BLOCK_MS,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    danmakuLimit: DEFAULT_DANMAKU_LIMIT,
    includeDanmaku: true,
    buvid: false,
    ...opts,
  };

  await ensureBuvid(options);
  const view = await requestJson(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    options,
  );
  const aid = view && view.aid;
  const cid = (view && view.pages && view.pages[0] && view.pages[0].cid) || (view && view.cid);
  if (!aid) throw new BiliError('api_error', '没有拿到视频 aid。', { bvid });

  const reply = await requestJson(
    // main 接口在未登录时仍返回第 1 页 20 条热门评论；老 v2/reply 只回 3 条。
    `https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&next=0&mode=3`,
    options,
  );
  const ownerMid = Number(view && view.owner && view.owner.mid);
  const scene = String((view && view.tname) || '').trim() || 'bili';
  const title = String((view && view.title) || '').trim();
  const items = commentItems(reply, bvid, { ownerMid, scene, title });

  if (options.includeDanmaku !== false) {
    if (!cid) throw new BiliError('api_error', '没有拿到视频 cid，无法取弹幕。', { bvid });
    const xml = await requestText(`https://comment.bilibili.com/${cid}.xml`, options);
    items.push(...danmakuItems(xml, bvid, options.danmakuLimit, { scene, title }));
  }
  return items;
}

module.exports = {
  collect,
  normalizeBvid,
  BiliError,
  resetRateLimit,
  dayFromUnix,
  decodeXml,
  _internal: { commentItems, danmakuItems },
};
