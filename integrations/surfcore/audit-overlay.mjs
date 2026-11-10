function once(s, a, b, label) {
  if (s.split(a).length !== 2) throw Error('audit overlay anchor drift: ' + label);
  return s.replace(a, b);
}
export function patchBiliApi(s) {
  s = "import { biliReadFetch } from '../whale-compat/bili-read.mjs';\n" + s;
  s=once(s,"if (j?.code !== 0) return { ok: false, items: [], why: `feed/space code=${j?.code ?? r.status}` };", "if (j?.code !== 0) return { ok: false, items: [], backoff:r.backoff===true, why: `feed/space code=${j?.code ?? r.status}` };", 'observable read cooldown');
  return once(s, 'const r = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?', 'const r = await biliReadFetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?', 'root dynamic reader')
    .replace('signal: AbortSignal.timeout(timeoutMs),\n    });\n    const j = await r.json()', 'signal: AbortSignal.timeout(timeoutMs),\n    }, {home});\n    const j = await r.json()');
}
export function patchMyDynamics(s) {
  s = "import { biliReadFetch } from '../../../../whale-compat/bili-read.mjs';\n" + s;
  if(s.split('await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?').length!==3)throw Error('own dynamics fetch anchors drift');
  s=s.replaceAll('await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?', 'await biliReadFetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?');
  s=once(s,"await fetch('https://api.bilibili.com/x/web-interface/nav'", "await biliReadFetch('https://api.bilibili.com/x/web-interface/nav'", 'bounded identity read');
  s=once(s,'  const c = loadCache()', '  const mid = await selfMid(cred)\n  const loaded = loadCache()\n  const c = loaded && String(loaded.mid) === mid ? loaded : null', 'account-scoped own-post cache');
  s=once(s,"    const mid = await selfMid(cred)\n    if (!mid) return { ids:", "    if (!mid) return { ids:", 'reuse verified cache identity');
  s=once(s,"const hit = items.find((it) => String(it?.id_str ?? '') === String(dynId)) ?? items[0]", "const hit = items.find((it) => String(it?.id_str ?? '') === String(dynId))", 'never borrow another post');
  // Previously a temporary feed failure erased all known own-post identity from
  // reply classification. Preserve proven IDs without claiming a fresh read.
  s=once(s,"if (j.code !== 0) return { ids: new Set(), ok: false, why: `feed/space code=${j.code}` }", "if (j.code !== 0) return { ids: new Set((c?.ids || []).map(String)), ok: false, stale: true, why: `feed/space code=${j.code}` }", 'own post cache fallback');
  return once(s,"return { ids: new Set(), ok: false, why: String(e?.message ?? e).slice(0, 80) }", "return { ids: new Set((c?.ids || []).map(String)), ok: false, stale: true, why: 'B站读取暂未完成' }", 'own post timeout cache');
}
export function patchForward(s) {
  s = "import { biliReadFetch } from '../../../../whale-compat/bili-read.mjs';\n" + s;
  s=once(s,'  for (let p = 0; p < pages; p += 1) {',"  let cursor = '';\n  for (let p = 0; p < Math.min(5, pages); p += 1) {",'bounded space pages');
  s=once(s,"const offset = p === 0 ? '' : `&offset=${p * 20}`", "const offset = cursor ? `&offset=${encodeURIComponent(cursor)}` : ''", 'opaque cursor');
  s=once(s,'await fetch(u, {','await biliReadFetch(u, {','forward space reader');
  s=once(s,'    for (const it of (j.data?.items ?? [])) {', '    if (j.code !== 0) return null;\n    for (const it of (j.data?.items ?? [])) {','failed page is not empty success');
  return once(s,'    if (!(j.data?.items ?? []).length) break',"    cursor = String(j.data?.offset || '');\n    if (!j.data?.has_more || !cursor || !(j.data?.items ?? []).length) break", 'space cursor termination');
}
export function patchDynamicsSync(s) {
  s=once(s,"  selfName = '',", "  selfName = '',\n  fetchDynamics = fetchMyDynamics,\n  timers = globalThis,", 'inject transport for offline test');
  s=once(s,'  let timer = null;', '  let timer = null, initialTimer = null, generation = 0;', 'lifecycle timer');
  s=once(s,"      seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {},", "      seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {},\n      deliveries: raw.deliveries && typeof raw.deliveries === 'object' ? raw.deliveries : {},", 'restore destination ledger');
  s=once(s,"    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\\n', { encoding: 'utf8', mode: 0o600 });", "    const fd = fs.openSync(tmp, 'w', 0o600);\n    try { fs.writeFileSync(fd, JSON.stringify(obj, null, 2) + '\\n', 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }", 'fsync delivery reservation');
  s=once(s,'try { atomicWriteJson(stateFile, st); } catch (error) { log(`[B站动态] 状态写入失败：${error?.message ?? error}`); }', 'try { atomicWriteJson(stateFile, st); return true; } catch (error) { log("[B站动态] 状态写入失败，暂停外发"); return false; }', 'fail closed on reserve persistence');
  s=once(s,'    running = true;','    const activeGeneration = generation;\n    running = true;', 'poll generation');
  s=once(s,'const res = await fetchMyDynamics();','const res = await fetchDynamics();\n      if (activeGeneration !== generation) return {ok:false,skipped:true,why:"轮询已停止"};', 'stop after request');
  s=once(s,"log(`[B站动态] 拉取失败：${res.why ?? '未知原因'}`);", "if(!res.backoff) log(`[B站动态] 拉取失败：${res.why ?? '未知原因'}；按退避时间再查`);", 'no repeated cooldown log storm');
  s=once(s,'      let sent = 0;', '      let sent = 0, uncertain = 0;\n      st.deliveries ||= {};', 'delivery accounting');
  s=once(s,'        for (const gid of groups) {',`        for (const gid of groups) {
          if (activeGeneration !== generation) return {ok:false,skipped:true,why:'轮询已停止'};
          const deliveryKey = item.id + ':' + gid;
          if (st.deliveries[deliveryKey]) continue;
          st.deliveries[deliveryKey] = 'uncertain';
          // A crash or timeout is not proof of non-delivery. No automatic resend.
          if (!saveState(st)) throw Error('发送登记未落盘，不外发');`, 'reserve each destination');
  s=once(s,'            sent += 1;', "            sent += 1; st.deliveries[deliveryKey] = 'sent'; saveState(st);", 'count confirmed sends');
  s=once(s,'          } catch (error) {\n            log(`[B站动态] 发送失败 group:${gid}：${error?.message ?? error}`);',"          } catch (error) {\n            uncertain += 1;\n            log('[B站动态] 有一项发送未确认，保留记录，不自动重发');", 'no false success');
  s=once(s,'log(`[B站动态] 新动态 ${item.id} 已同步到 ${groups.length} 个群（${short(item.text || item.title, 30)}）`);', "log(`[B站动态] 本轮累计确认 ${sent} 项，未确认 ${uncertain} 项`);", 'truthful summary');
  s=once(s,'      st.lastPollAt = now;\n      saveState(st);\n      return { ok: true, fresh: fresh.length, sent };', "      st.deliveries = Object.fromEntries(Object.entries(st.deliveries).filter(([k])=>st.seen[k.split(':')[0]]));\n      st.lastPollAt = now;\n      saveState(st);\n      return { ok: uncertain === 0, fresh: fresh.length, sent, uncertain };", 'bounded durable destination records');
  s=once(s,'    setTimeout(() => { void pollOnce(); }, 8_000);', '    initialTimer = timers.setTimeout(() => { initialTimer = null; if(started) void pollOnce(); }, 8_000);\n    initialTimer.unref?.();', 'cancel initial timer');
  s=once(s,'timer = setInterval(', 'timer = timers.setInterval(', 'interval dependency');
  s=once(s,'    if (timer) clearInterval(timer);', '    generation += 1;\n    if (initialTimer) timers.clearTimeout(initialTimer);\n    initialTimer = null;\n    if (timer) timers.clearInterval(timer);', 'stop cancels both timers');
  return once(s,'      groups,\n    };', "      groups,\n      uncertain: Object.values(st.deliveries || {}).filter(v=>v==='uncertain').length,\n    };", 'observable uncertain delivery');
}
export function patchCommentClassification(s) {
  return once(s,'const k = r.ok ? r.map.get(String(oid)) : null', 'const k = r.map.get(String(oid)) // Known own-post IDs remain authoritative during read backoff.', 'preserve proven reply identity');
}
export function patchAuditBridge(s) {
  // The native ledger already supplies a durable effect identity. Carry that
  // identity to the relay so a lost transport receipt cannot become a resend.
  const from=s.indexOf('  async function onebotSend('), to=s.indexOf('  // B站视频卡片',from);
  if(from<0||to<from)throw Error('transport audit range drift');
  let part=s.slice(from,to);
  if(part.split('async (safeSegments) => {').length!==3)throw Error('transport audit callback drift');
  part=part.replaceAll('async (safeSegments) => {','async (safeSegments, delivery) => {');
  if(part.split("'content-type': 'application/json',").length!==3)throw Error('transport audit headers drift');
  part=part.replaceAll("'content-type': 'application/json',", "'content-type': 'application/json',\n        'x-whale-delivery-id': delivery.deliveryId, 'x-whale-origin': 'surfcore',");
  return s.slice(0,from)+part+s.slice(to);
}
