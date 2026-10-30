// Read-only Bilibili requests. Never retries a rejected request, rotates credentials,
// changes network identity, or treats a Bilibili failure as QQ login failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const memory = new Map(), inFlight = new Map();
const DEFAULT_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function save(file, state) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const tmp = file + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(state), {mode:0o600}); fs.renameSync(tmp, file); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}
export async function biliReadFetch(url, options = {}, {
  home = os.homedir(), now = Date.now, fetchImpl = globalThis.fetch,
  stateDir = path.join(home, '.dsh', 'surfcore', 'bili', 'read-backoff'),
} = {}) {
  const u = new URL(url);
  if (u.origin !== 'https://api.bilibili.com' || (options.method && options.method !== 'GET')) throw Error('B站只读接口范围错误');
  const headers = new Headers(options.headers);
  if(!headers.get('user-agent')||headers.get('user-agent')==='Mozilla/5.0')headers.set('user-agent',DEFAULT_AGENT);
  // A restricted space endpoint stays restricted across different UP IDs.
  // In-flight results are still isolated by URL: never give another UP's feed
  // to the own-post classifier.
  const key = hash(u.pathname + ':' + (headers.get('cookie') || ''));
  const file = path.join(stateDir, key + '.json');
  const cached=memory.get(file)||{},stored=read(file);
  const state = Number(stored.nextAt||0)>Number(cached.nextAt||0)?stored:cached;
  const flightKey=file+':'+hash(u.href);
  const t = now();
  const response = (body, status = 200, backoff = false) => ({ok:status>=200&&status<300,status,backoff,json:async()=>structuredClone(body)});
  if (Number(state.nextAt) > t) return response({code:state.code || -1,message:'读取冷却中'}, 429, true);
  if (inFlight.has(flightKey)) return inFlight.get(flightKey);
  const run = (async () => {
    let code = -1, status = 502, body;
    try {
      const signals = [options.signal, AbortSignal.timeout(15000)].filter(Boolean);
      headers.set('accept', 'application/json');
      const r = await fetchImpl(u.href, {...options, headers, signal:signals.length>1?AbortSignal.any(signals):signals[0]});
      status = r.status;
      body = await r.json().catch(()=>({code:status || -1}));
      code = Number(body.code ?? status);
      if(!r.ok && code===0)code=status || -1;
      if (r.ok && code === 0) {
        // A concurrent failure in another process must not be erased by an
        // earlier request completing late.
        if(Number(read(file).nextAt||0)<=t){const cleared = {failures:0,nextAt:0,code:0}; memory.set(file, cleared); try{save(file, cleared);}catch{/* read result is still valid */}}
        return response(body, status);
      }
    } catch (error) {
      // No remote error text, URLs or cookies are returned to a chat session.
      code = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? -504 : -502;
      body = {code,message:'B站读取暂未完成'};
    }
    const failures = Math.min(8, Number(state.failures || 0) + 1);
    const restricted = [412,429,-412,4101129].includes(code) || [412,429].includes(status);
    const delay = Math.min(21600000, (restricted ? 900000 : 60000) * 2 ** (failures-1));
    const next = {failures,nextAt:t+delay,code}; memory.set(file, next);
    try { save(file, next); } catch { /* process-local backoff remains active */ }
    return response({code,message:restricted?'B站限制读取，稍后再查':'B站读取暂未完成'}, status);
  })();
  inFlight.set(flightKey, run);
  try { return await run; } finally { inFlight.delete(flightKey); }
}
