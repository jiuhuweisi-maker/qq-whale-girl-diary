import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createDeliveryState } from './durable-state.cjs';
import { conversation } from './memory-scope.mjs';
import {includesParticipantAccount} from './relationships.mjs';
import {availabilityNotice} from './private-availability.mjs';
import {memoryHealth} from './memory-health.mjs';
import {inspectOutbound,rememberOutbound} from './language-style.mjs';

const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const parseArgs = value => {
  for (let n = 0; n < 3 && typeof value === 'string'; n++) { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === 'object' ? value : {};
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sendTool = name => /(?:^|__)qq_(?:send|reply|poke|fundpilot|switch_scene$|owner_group_send$)/.test(name);
const sendRoute = route => /^\/api\/(?:send\/|socialV2\/(?:send-|reply|fundpilot$|scene-switch$|owner-group-send$))/.test(route);

// One process owns this ledger. Two fsynced slots are shared with the proven legacy engine.
export function createWhaleRuntime({ root, config, control, now = Date.now, disk = fs, log = () => {}, clean = x => x, expressionContext = () => '' }) {
  const dir = path.join(root, 'state'); disk.mkdirSync(dir, { recursive: true });
  const ledger = createDeliveryState({ fs: disk, hash: digest, basePath: path.join(dir, 'whale-delivery').replaceAll('\\', '/'), namespace: 'whale-surfcore-114', now, diag: log });
  // Capture once in the running process. Disk hashes alone cannot prove a reload.
  // 2026-11-06（213）：revision 不再写死（209 时代写死过一次，210–212 忘了改，
  //   运行时一直自报 209）。唯一真相 = 装好的覆盖层清单，和磁盘哈希一起证明"加载的是哪一版"。
  const loadedBuild185 = { revision: 0, pid: process.pid, startedAt: now(), sources: {} };
  try {
    const installed = JSON.parse(disk.readFileSync(path.join(root, 'whale-overlay-manifest.json'), 'utf8'));
    loadedBuild185.upstream = installed.upstream;
    loadedBuild185.revision = Number(installed.patch) || 0;
  } catch {}
  for (const name of ['src/bridge.js', 'whale-compat/runtime.mjs', 'whale-compat/legacy-reader.mjs', 'whale-compat/personal-journal.mjs', 'whale-compat/model-image.mjs','whale-compat/experience-workbench.mjs','whale-compat/workbench-panel.mjs','whale-compat/bili-operations.mjs']) {
    try { loadedBuild185.sources[name] = crypto.createHash('sha256').update(disk.readFileSync(path.join(root, name))).digest('hex'); }
    catch { loadedBuild185.sources[name] = null; }
  }
  const contexts = new AsyncLocalStorage();
  const active = new Map();
  const intakeQueues = new Map();
  let recoveryInFlight = null;
  let ready = false;
  const liveTurns = new Map();
  function requireHealthy() { if (!ledger.healthy) throw new Error('本地收发记录不可用，已暂停发送'); }
  function change(fn) { requireHealthy(); if (!ledger.change(fn)) requireHealthy(); }
  function allowed(key) {
    const c = conversation(key);
    return Boolean(c && (c.kind === 'private' ? c.id === String(config.ownerQQ) : config.allow?.groups?.map(String).includes(c.id)));
  }
  function quiet(key) {
    const c = conversation(key), s = ledger.data.control || {};
    return !ready || !allowed(key) || (c.kind === 'group'
      ? Number(s.quietUntil || 0) > now()
      : s.privateQuietForever === true || Number(s.privateQuietUntil || 0) > now());
  }
  function epoch(key) { return conversation(key)?.kind === 'group' ? Number(ledger.data.control?.epoch || 0) : Number(ledger.data.privateEpoch || 0); }
  async function syncControl(message = null) {
    const result = await control(message);
    if (!result?.ok) { ready = false; throw new Error('主人控制状态尚未确认，暂不处理'); }
    const before = ledger.data.control || {};
    const after = Object.fromEntries(['epoch', 'quietUntil', 'privateQuietUntil', 'privateQuietForever'].map(k => [k, result[k] ?? (k === 'privateQuietForever' ? false : 0)]));
    if (!equal(before, after)) change(data => {
      data.control = after;
      if ((!before.privateQuietForever && after.privateQuietForever) || Number(after.privateQuietUntil) > Number(before.privateQuietUntil || 0)) data.privateEpoch = Number(data.privateEpoch || 0) + 1;
    });
    ready = true;
    return result;
  }
  function guard(key) {
    requireHealthy(); const version = epoch(key);
    return () => { requireHealthy(); if (quiet(key) || epoch(key) !== version) throw new Error('本轮已取消，不再补发'); };
  }
  function incoming(key, event, fn, options = {}) {
    const previous = intakeQueues.get(key) || Promise.resolve();
    const task = previous.then(() => processIncoming(key, event, fn, options));
    const tail = task.then(() => null, () => null);
    intakeQueues.set(key, tail);
    tail.then(() => { if (intakeQueues.get(key) === tail) intakeQueues.delete(key); });
    return task;
  }
  async function processIncoming(key, event, fn, { restoring = false } = {}) {
    requireHealthy();
    if (!allowed(key) || config.deny?.users?.map(String).includes(String(event.user_id))) return { skipped: 'unauthorized' };
    const id = String(event.message_id ?? event.msg_id ?? '');
    if (!/^-?[1-9]\d*$/.test(id)) return { skipped: 'missing-message-id' };
    const time = Number(event.time) * 1000, cutover = Number(config.whaleCompat?.cutover || 0) * 1000;
    if (!Number.isFinite(time) || time < cutover || time > now() + 5000 || now() - time > 600000) return { skipped: 'historical' };
    const receipt = `${key}:${id}`, prior = ledger.data.inbox[receipt];
    if (active.has(receipt) || (prior && (!restoring || prior.stage !== 'buffered'))) return { skipped: 'duplicate' };
    active.set(receipt, !restoring);
    try {
      if (!prior) change(data => { data.inbox[receipt] = { at: now(), expiresAt: time + 600000, stage: 'buffered', key, event }; });
      if (String(event.user_id) === String(config.ownerQQ)) {
        const result = await syncControl({ channel: conversation(key).kind, messageId: id });
        if (result.handled) { change(data => { data.inbox[receipt].stage = 'completed'; delete data.inbox[receipt].event; }); return { handled: true }; }
      }
      if (!ready) throw new Error('主人控制状态尚未确认，收件保留待恢复');
      if (quiet(key)) { change(data => { data.inbox[receipt].stage = 'skipped'; delete data.inbox[receipt].event; }); return { skipped: 'quiet' }; }
      await fn();
      change(data => { data.inbox[receipt].stage = 'completed'; delete data.inbox[receipt].event; });
      return { ok: true };
    } finally { active.delete(receipt); }
  }
  function recover(deliver, hasMessage) {
    if (recoveryInFlight) return recoveryInFlight;
    recoveryInFlight = recoverPending(deliver, hasMessage).finally(() => { recoveryInFlight = null; });
    return recoveryInFlight;
  }
  async function recoverPending(deliver, hasMessage) {
    for (const [receipt, row] of Object.entries(ledger.data.inbox)) {
      if (row.stage !== 'buffered') continue;
      if (active.has(receipt)) continue;
      if (row.expiresAt <= now()) { change(d => { d.inbox[receipt].stage = 'expired'; delete d.inbox[receipt].event; }); continue; }
      if (!row.event || !allowed(row.key) || config.deny?.users?.map(String).includes(String(row.event.user_id))) {
        change(d => { d.inbox[receipt].stage = 'skipped'; delete d.inbox[receipt].event; }); continue;
      }
      if (hasMessage(row.key, row.event)) { change(d => { d.inbox[receipt].stage = 'completed'; delete d.inbox[receipt].event; }); continue; }
      if (Number(row.retryAt || 0) > now()) continue;
      try { await incoming(row.key, row.event, () => deliver(row.key, row.event), { restoring: true }); }
      catch {
        // Retain each failed intake independently. One transient owner-control
        // timeout must not block every other channel, or retry in a hot loop.
        change(d => { const pending=d.inbox[receipt]; if(pending?.stage!=='buffered')return;pending.recoveryAttempts=Number(pending.recoveryAttempts||0)+1;pending.retryAt=now()+Math.min(60000,5000*2**Math.min(4,pending.recoveryAttempts-1)); });
        log('[收件恢复] 本次未完成，已保留并退避；不重登QQ、不补发过期消息');
      }
    }
  }
  function onEvent(key, sessionId, event) {
    requireHealthy();
    if (event.type === 'turn/start') {
      const id = `${sessionId}:${event.data?.turn ?? ''}`;
      if (!ledger.data.turns?.[id]) change(d => { (d.turns ||= {})[id] = { key, epoch: epoch(key), at: now() }; });
      liveTurns.set(sessionId, id);
    }
    if (event.type !== 'tool/call' || !sendTool(String(event.data?.name))) return;
    const callId = event.data?.callId;
    if (callId == null) return;
    const id = `${sessionId}:${callId}`;
    if (ledger.data.calls?.[id]) return;
    const turn = ledger.data.turns?.[liveTurns.get(sessionId)];
    // A late call without its original turn cannot inherit today's permission.
    change(d => { (d.calls ||= {})[id] = { key, name: String(event.data.name).split('__').at(-1), args: parseArgs(event.data.arguments ?? event.data.input), at: now(), epoch: turn?.epoch ?? -1 }; });
  }
  async function action(key, label, fn) {
    requireHealthy();
    const ctx = contexts.getStore(), effect = ctx?.effect;
    if (!effect || effect.key !== key || effect.epoch !== epoch(key) || quiet(key)) throw new Error('当前操作已失效');
    const id = 'action:' + key + ':' + label;
    if (ledger.data.outbox[id]) throw new Error('此项操作已经尝试过，不重复执行');
    change(d => { d.outbox[id] = { at: now(), attempts: [now()], status: 'sending', key }; });
    try { const value = await fn(); change(d => { d.outbox[id].status = 'sent'; }); return value; }
    catch (error) { if (ledger.healthy) change(d => { d.outbox[id].status = 'uncertain'; }); throw error; }
  }
  function enterRequest(req, route) {
    const ctx = { req, route, part: 0, effect: null };
    contexts.enterWith(ctx);
    return ctx;
  }
  async function authorizeRequest(ctx, body) {
    if (!sendRoute(ctx.route)) return;
    requireHealthy();
    const requestId = String(ctx.req.headers['x-whale-request-id'] || '');
    const name = String(ctx.req.headers['x-whale-tool'] || '');
    let args;
    try { args = JSON.parse(Buffer.from(String(ctx.req.headers['x-whale-args'] || ''), 'base64').toString('utf8')); } catch { throw new Error('发送缺少调用关联'); }
    const key = body.key || (args.groupId ? `group:${args.groupId}` : args.userId ? `private:${args.userId}` : '');
    if (!allowed(key) || !/^[a-f0-9-]{20,100}$/.test(requestId) || !sendTool(name)) throw new Error('发送调用来源未验证');
    const matches = row => row.key === key && row.name === name && Object.entries(row.args).every(([k, v]) => equal(v, args[k]));
    let candidates = [];
    for (let n = 0; n < 40; n++) {
      candidates = Object.entries(ledger.data.calls || {}).filter(([, row]) => matches(row) && (row.requestId === requestId || !row.requestId) && now() - row.at < 600000);
      if (candidates.length) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (candidates.length !== 1) throw new Error('发送与当前回合无法唯一关联，已暂停本次发送');
    const [id, row] = candidates[0];
    if (row.epoch !== epoch(key) || quiet(key)) throw new Error('原回合已叫停，不补发旧话');
    if (!row.requestId) change(d => { d.calls[id].requestId = requestId; });
    ctx.effect = { id, key, epoch: row.epoch };
  }
  async function send(key, segments, transport) {
    requireHealthy();
    const ctx = contexts.getStore(), effect = ctx?.effect;
    if (!effect || effect.key !== key || effect.epoch !== epoch(key) || quiet(key)) throw new Error('发送缺少有效的当前回合');
    const source = Array.isArray(segments) ? segments : [];
    const ownerCommand = effect.ownerGroupCommand === true && conversation(key)?.kind === 'group';
    const message = source.map(s => s.type === 'text' && !ownerCommand ? { ...s, data: { ...s.data, text: clean(String(s.data?.text || ''), key) } } : s).filter(s => s.type !== 'text' || s.data.text.trim());
    if(message.some(s=>s.type==='text'&&includesParticipantAccount(s.data.text,config,disk)))throw new Error('正文含有成员账号，请改用昵称后再发送；本次尚未发送');
    // 179c：custom_face 是真内容不是内部提示，本行为排除表，179初版误加custom_face已回正
    const wholeGroup = ownerCommand && message.length === 1 && message[0].type === 'at' && message[0].data.qq === 'all';
    if (!wholeGroup && !message.some(s => !['reply', 'at'].includes(s.type))) throw new Error('本条只有内部提示，已取消发送')
    if (source.some(s => ['record', 'video'].includes(s.type))) throw new Error('语音和视频发送已关闭');
    const at = message.filter(s => s.type === 'at').map(s => String(s.data.qq));
    const replies = message.filter(s => s.type === 'reply');
    if (at.length > 1 || at.some(id => (id === 'all' && !wholeGroup) || config.deny?.users?.map(String).includes(id)) || replies.length > 1) throw new Error('引用或提醒目标不明确');
    const id = `${effect.id}:${ctx.part++}`, hash = digest([key, message]);
    const previous = ledger.data.outbox[id];
    if (previous) {
      if (previous.hash !== hash) throw new Error('同一调用的内容发生变化，拒绝重发');
      if (previous.status === 'sent') return previous.receipt;
      if (previous.status !== 'failed') throw new Error('上次发送结果尚未确认，不自动重发');
      // 145：failed=传输层明确拒发（certainFail），放行同调用重试
    }
    if (Object.values(ledger.data.outbox).some(r => r.hash === hash && ['sending', 'uncertain'].includes(r.status))) throw new Error('相同消息仍待核对，不重试');
    const expressionText=message.filter(s=>s.type==='text').map(s=>s.data.text).join('\n');
    const expressionOptions={scope:key,home:process.env.WHALE_LANGUAGE_HOME||path.join(root,'state/whale-language'),enabled:config.whaleCompat?.language?.enabled};
    if(!ownerCommand){
      const quality=inspectOutbound(expressionText,{...expressionOptions,context:expressionContext(key)});
      if(!quality.ok)throw Object.assign(new Error('本条与近期表达或语料过于相似，尚未发送；这次可以沉默，不要反复改写重试'),{code:'LANGUAGE_QUALITY',certainFail:true});
    }
    const picture = message.some(s => ['image', 'mface', 'custom_face'].includes(s.type));
    const pictureHash = picture ? digest([key, message.filter(s => ['image', 'mface', 'custom_face'].includes(s.type))]) : '';
    const pictureCooldown = Math.max(0, Number(config.whaleCompat?.pictureCooldownMs ?? 0) || 0);
    if (picture && pictureCooldown > 0 && now() - Number(ledger.data.pictures[pictureHash] || 0) < pictureCooldown) throw new Error('这张图刚发过，稍后再发');
    if (picture) {
      const gap = Number(config.whaleCompat?.pictureGapMs || 0);
      if (gap && now() - Number(ledger.data.pictureConversationAt?.[key] || 0) < gap) throw new Error('刚贴过图，这次先用文字聊');
      const privateChat = conversation(key).kind === 'private';
      const window = privateChat ? 86400000 : 3600000;
      const limit = Number(privateChat ? config.whaleCompat?.privatePicturesPerDay : config.whaleCompat?.groupPicturesPerHour) || 0;
      if (limit && Object.values(ledger.data.outbox).filter(r => r.key === key && r.picture && now() - r.at < window && ['sent', 'sending', 'uncertain'].includes(r.status)).length >= limit) throw new Error('这阵子贴图够多了，先不用图');
    }
    change(d => {
      d.outbox[id] = { at: now(), attempts: [now()], status: 'sending', hash, key, picture };
      if (picture) { d.pictures[pictureHash] = now(); (d.pictureConversationAt ||= {})[key] = now(); }
    });
    try {
      // Persisted before the side effect; a lost reply is uncertainty, not a retry signal.
      const deliveryId = digest([key, id]);
      const receipt = await transport(message, {deliveryId});
      change(d => { d.outbox[id].status = 'sent'; d.outbox[id].receipt = receipt; });
      if(!ownerCommand)rememberOutbound(expressionText,expressionOptions);
      try { log('[鲸戒发送] ' + JSON.stringify({scope:key.split(':')[0], conversation:digest(key).slice(0,16), deliveryId, messageId:receipt?.message_id ?? null, status:'sent'})); }
      catch { /* The confirmed durable receipt remains authoritative if diagnostics fail. */ }
      return receipt;
    } catch (error) {
      if (ledger.healthy) change(d => { d.outbox[id].status = error?.certainFail === true ? 'failed' : 'uncertain'; d.outbox[id].err = String(error?.message ?? error ?? '').slice(0, 140); });
      try { log('[鲸戒发送] ' + JSON.stringify({scope:key.split(':')[0], conversation:digest(key).slice(0,16), status:'uncertain'})); }
      catch { /* Do not replace the original transport error with a logging error. */ }
      throw error;
    }
  }
  async function ownerGroupOnce(source, event, destination, lines, dispatch, report) {
    const messageId = String(event.message_id ?? event.msg_id ?? '');
    const owner = String(config.ownerQQ ?? '');
    const inbound = `${source}:${messageId}`;
    const direct = active.get(inbound) === true && ledger.data.inbox[inbound]?.stage === 'buffered';
    const effect = contexts.getStore()?.effect;
    const draft = event.draft_message_id ? `${source}:${event.draft_message_id}` : inbound;
    const fromTurn = !report && effect?.key === source && effect.epoch === epoch(source)
      && ledger.data.inbox[inbound]?.stage === 'completed' && ledger.data.inbox[draft]?.stage === 'completed';
    if (!owner || source !== `private:${owner}` || String(event.user_id) !== owner
        || !(report ? direct : fromTurn) || quiet(source)) return;
    const id = `owner-group:${draft}`;
    if (ledger.data.outbox[id]) return;
    // Consume the original message before any send. A restart never continues
    // the remainder of an interrupted batch, even if the inbox is recovered.
    change(data => { data.outbox[id] = {at: now(), attempts: [now()], status: 'suppressed', key: source}; });
    const run = (key, suffix, fn) => contexts.run({part: 0, effect: {
      id: id + suffix, key, epoch: epoch(key), ownerGroupCommand: suffix === ':group',
    }}, fn);
    let result;
    if (!destination || quiet(destination) || conversation(destination)?.kind !== 'group') {
      result = '这次没发。请指定一个当前可发言的开放群。';
    } else if (lines.some(line => includesParticipantAccount(line, config, disk))) {
      result = '这次没发，正文里有成员账号。';
    } else {
      result = await run(destination, ':group', () => dispatch(guard(destination)));
    }
    if (report && !quiet(source)) await run(source, ':receipt', () => report(result));
    return result;
  }
  // Two factual owner-only notices, independent of a model turn. Never exposed
  // as an agent tool; group destinations and arbitrary text are impossible.
  async function ownerNotice(kind, transport) {
    const key = `private:${config.ownerQQ}`, notice = availabilityNotice(kind, now());
    if (!notice || quiet(key)) return { skipped: 'unavailable' };
    const id = `availability:${key}:${notice.label}`, assertCurrent = guard(key);
    if (ledger.data.outbox[id]) return { skipped: 'duplicate' };
    change(d => { d.outbox[id] = { at: now(), attempts: [now()], status: 'sending', key }; });
    try {
      assertCurrent();
      const receipt = await transport({ user_id: Number(config.ownerQQ), message: [{type:'text',data:{text:notice.text}}] }, digest(id), assertCurrent);
      change(d => { d.outbox[id].status = 'sent'; });
      return { sent: true, receipt };
    } catch (error) {
      if (ledger.healthy) change(d => { d.outbox[id].status = 'uncertain'; });
      throw error;
    }
  }
  // 核销151（主人 10-31 深夜令）：uncertain 回单自动对账。只有接口实锤才清锁，绝不重发
  // （patch103 双发是血案）。183：probe还须校验内容哈希及唯一真实回执，时间相近本身不是实锤。
  async function reconcileUncertain151(historyProbe) {
    if (!ledger.healthy) return { skipped: 'ledger-unhealthy' };
    const nowT = now();
    const pend = Object.entries(ledger.data.outbox).filter(([, r]) => r && r.status === 'uncertain' && r.key && nowT - Number(r.at || 0) > 120000 && nowT - Number(r.at || 0) < 43200000);
    let cleared = 0;
    for (const [id, r] of pend) {
      try {
        const proof=await historyProbe(r.key, Number(r.at), r.hash);
        if (r.hash && proof?.confirmed===true && proof.hash===r.hash && typeof proof.messageId==='string' && proof.messageId.trim() && proof.messageId!=='0') {
          let changed=false;
          change(d => { if (d.outbox[id]?.status==='uncertain' && d.outbox[id].hash===r.hash) { d.outbox[id].status = 'sent'; d.outbox[id].receipt={message_id:proof.messageId}; d.outbox[id].reconciled = 'exact183'; changed=true; } });
          if(changed)cleared += 1;
        }
      } catch { /* 对账失败=保持拦锁，人工裁决优先 */ }
    }
    return { checked: pend.length, cleared };
  }

  function status() {
    return { memoryHealth:memoryHealth(config,{disk}),build: { ...loadedBuild185, sources: { ...loadedBuild185.sources } }, healthy: ledger.healthy, ready, pendingIncoming: Object.values(ledger.data.inbox).filter(r => r.stage === 'buffered').length, uncertain: Object.values(ledger.data.outbox).filter(r => ['sending', 'uncertain'].includes(r.status)).length, calls: Object.keys(ledger.data.calls || {}).length };
  }
  return { syncControl, incoming, recover, reconcileUncertain151, onEvent, action, guard, quiet, enterRequest, authorizeRequest, send, ownerGroupOnce, ownerNotice, status, ledger, contexts };
}
