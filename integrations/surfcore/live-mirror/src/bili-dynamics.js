// 把 B 站角色**自己发的动态**同步到 QQ 白名单群。
//
// 做法：轮询自己的空间动态（只读公开接口），第一次只建立基线（不把历史动态倒进群里），
// 之后只推送新出现的动态。动态正文 + 链接直接发到每个白名单群，不再让 AI 二次改写，
// 避免延迟和走样。
//
// 隐私：本模块只读公开动态，不读私信。
import fs from 'node:fs';
import path from 'node:path';
import { fetchMyDynamics } from './bili-api.js';

function readJson(file, fallback = null) {
  try {
    let text = fs.readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function atomicWriteJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(16).slice(2, 10)}.tmp`;
  try {
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(obj, null, 2) + '\n', 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    throw error;
  }
}

function short(text, n) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 动态 -> QQ 文本。selfName 来自 bili.config.json 的 self.name，不写死具体账号。 */
export function formatDynamicMessage(item, { selfName = '' } = {}) {
  const text = String(item?.text ?? '').trim();
  const title = String(item?.title ?? '').trim();
  const url = String(item?.url ?? '').trim();
  const lines = [`【B站动态】${String(selfName || '').trim() || 'B站账号'}刚在B站发了一条动态～`];
  if (text) lines.push(short(text, 420));
  else if (title) lines.push(short(title, 160));
  else if ((item?.images ?? []).length) lines.push(`（图片动态，${item.images.length} 张图）`);
  else lines.push('（这条动态没有文字）');
  if (url && !lines.some((line) => line.includes(url))) lines.push(url);
  return lines.join('\n');
}

/**
 * @param {{
 *   stateDir:string,
 *   log?:(...args:any[])=>void,
 *   sendToQQ:(key:string, text:string)=>Promise<any>,
 *   groups:string[],
 *   isReady?:()=>boolean,
 *   intervalMs?:number,
 * }} options
 */
export function createBiliDynamicsSync({
  stateDir,
  log = () => {},
  sendToQQ,
  groups = [],
  isReady = () => true,
  intervalMs = 180_000,
  selfName = '',
  fetchDynamics = fetchMyDynamics,
  timers = globalThis,
}) {
  const stateFile = path.join(stateDir, 'bili-dynamics-state.json');
  const cacheFile = path.join(stateDir, 'bili-dynamics-cache.json');
  let timer = null, initialTimer = null, generation = 0;
  let running = false;
  let started = false;

  function loadState() {
    const raw = readJson(stateFile, null);
    if (!raw || typeof raw !== 'object') return { version: 1, baselineAt: 0, seen: {}, lastPollAt: 0 };
    return {
      version: 1,
      baselineAt: Number(raw.baselineAt) || 0,
      seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {},
      deliveries: raw.deliveries && typeof raw.deliveries === 'object' ? raw.deliveries : {},
      lastPollAt: Number(raw.lastPollAt) || 0,
    };
  }

  function saveState(st) {
    try { atomicWriteJson(stateFile, st); return true; } catch (error) { log("[B站动态] 状态写入失败，暂停外发"); return false; }
  }

  function saveCache(items) {
    try { atomicWriteJson(cacheFile, { at: Date.now(), items }); } catch {}
  }

  async function pollOnce({ initial = false } = {}) {
    if (running) return { ok: false, skipped: true };
    if (!isReady()) return { ok: false, skipped: true, why: 'QQ 未就绪' };
    const activeGeneration = generation;
    running = true;
    try {
      const res = await fetchDynamics();
      if (activeGeneration !== generation) return {ok:false,skipped:true,why:"轮询已停止"};
      if (!res.ok) {
        if(!res.backoff) log(`[B站动态] 拉取失败：${res.why ?? '未知原因'}；按退避时间再查`);
        return { ok: false, why: res.why };
      }
      saveCache(res.items);
      const st = loadState();
      const now = Date.now();
      if (!st.baselineAt) {
        // 第一次运行：只记基线，不推送历史动态。
        for (const it of res.items) st.seen[it.id] = new Date(now).toISOString();
        st.baselineAt = now;
        st.lastPollAt = now;
        saveState(st);
        log(`[B站动态] 已建立基线：${res.items.length} 条历史动态不推送；之后只推新动态`);
        return { ok: true, baseline: true, count: res.items.length };
      }

      const fresh = res.items
        .filter((it) => it.id && !st.seen[it.id])
        .filter((it) => !initial)
        .sort((a, b) => (a.pubTs || 0) - (b.pubTs || 0));
      let sent = 0, uncertain = 0;
      st.deliveries ||= {};
      for (const item of fresh) {
        const message = formatDynamicMessage(item, { selfName });
        for (const gid of groups) {
          if (activeGeneration !== generation) return {ok:false,skipped:true,why:'轮询已停止'};
          const deliveryKey = item.id + ':' + gid;
          if (st.deliveries[deliveryKey]) continue;
          st.deliveries[deliveryKey] = 'uncertain';
          // A crash or timeout is not proof of non-delivery. No automatic resend.
          if (!saveState(st)) throw Error('发送登记未落盘，不外发');
          try {
            await sendToQQ(`group:${gid}`, message);
            sent += 1; st.deliveries[deliveryKey] = 'sent'; saveState(st);
          } catch (error) {
            uncertain += 1;
            log('[B站动态] 有一项发送未确认，保留记录，不自动重发');
          }
        }
        st.seen[item.id] = new Date().toISOString();
        log(`[B站动态] 本轮累计确认 ${sent} 项，未确认 ${uncertain} 项`);
      }
      // 只保留最近 300 条，避免状态文件无限长。
      const ids = Object.keys(st.seen);
      if (ids.length > 300) {
        const keep = ids.sort((a, b) => Date.parse(st.seen[b]) - Date.parse(st.seen[a])).slice(0, 300);
        const next = {};
        for (const id of keep) next[id] = st.seen[id];
        st.seen = next;
      }
      st.deliveries = Object.fromEntries(Object.entries(st.deliveries).filter(([k])=>st.seen[k.split(':')[0]]));
      st.lastPollAt = now;
      saveState(st);
      return { ok: uncertain === 0, fresh: fresh.length, sent, uncertain };
    } catch (error) {
      log(`[B站动态] 轮询异常：${error?.message ?? error}`);
      return { ok: false, why: String(error?.message ?? error) };
    } finally {
      running = false;
    }
  }

  function start() {
    if (started) return;
    started = true;
    const ms = Math.max(60_000, Number(intervalMs) || 180_000);
    // 启动先探一次：首次只建基线，避免把旧动态灌进群。
    initialTimer = timers.setTimeout(() => { initialTimer = null; if(started) void pollOnce(); }, 8_000);
    initialTimer.unref?.();
    timer = timers.setInterval(() => { void pollOnce(); }, ms);
    timer.unref?.();
    log(`[B站动态] 已启动：每 ${Math.round(ms / 1000)} 秒检查一次 → ${groups.length} 个群`);
  }

  function stop() {
    generation += 1;
    if (initialTimer) timers.clearTimeout(initialTimer);
    initialTimer = null;
    if (timer) timers.clearInterval(timer);
    timer = null;
    started = false;
  }

  function status() {
    const st = loadState();
    const cache = readJson(cacheFile, { at: 0, items: [] });
    return {
      baselineAt: st.baselineAt ? new Date(st.baselineAt).toISOString() : '',
      seen: Object.keys(st.seen).length,
      lastPollAt: st.lastPollAt ? new Date(st.lastPollAt).toISOString() : '',
      cached: Array.isArray(cache.items) ? cache.items.length : 0,
      groups,
      uncertain: Object.values(st.deliveries || {}).filter(v=>v==='uncertain').length,
    };
  }

  return { start, stop, pollOnce, status, formatDynamicMessage };
}
