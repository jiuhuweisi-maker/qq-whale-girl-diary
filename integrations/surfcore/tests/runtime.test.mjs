import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWhaleRuntime } from '../compat/runtime.mjs';
import { OVERLAY_PATCH } from '../version.mjs';
import path from 'node:path';
let passed = 0;
const check = async (name, fn) => { await fn(); console.log('PASS ' + name); passed++; };
function diskFixture(files = new Map()) {
  const fds = new Map(); let fd = 0;
  return { files,
    mkdirSync() {}, existsSync: x => files.has(String(x)),
    readFileSync: (x, enc) => { if (!files.has(String(x))) throw new Error('absent'); return enc ? files.get(String(x)).toString() : Buffer.from(files.get(String(x))); },
    openSync(x, mode) { fds.set(++fd, String(x)); if (mode === 'w') files.set(String(x), Buffer.alloc(0)); return fd; },
    writeFileSync(x, value) { files.set(fds.get(x) || String(x), Buffer.from(value)); },
    fsyncSync() {}, closeSync(x) { fds.delete(x); },
    renameSync(a, b) { files.set(String(b), files.get(String(a))); files.delete(String(a)); }
  };
}
function fixture({ disk = diskFixture() } = {}) {
  const clock = { now: 1800000000000 }, control = { ok: true, epoch: 0, quietUntil: 0, privateQuietUntil: 0, privateQuietForever: false };
  const cfg = { ownerQQ: '1001', allow: { groups: ['7001', '7002'] }, deny: { users: ['1003'] }, whaleCompat: { cutover: clock.now / 1000 - 1, pictureCooldownMs: 120000 } };
  const options = { root: '/fake', config: cfg, now: () => clock.now, disk, control: async () => structuredClone(control), clean: x => x.replace('INTERNAL ERROR', '') };
  // 213：运行时版本取自「装好的覆盖层清单」，不再写死在代码里；fixture 也照这个来。
  const manifestPath = path.join('/fake', 'whale-overlay-manifest.json');
  if (!disk.files.has(manifestPath)) disk.files.set(manifestPath, Buffer.from(JSON.stringify({patch: OVERLAY_PATCH, upstream: 'fixture'})));
  const w = createWhaleRuntime(options);
  const event = { time: clock.now / 1000, message_id: 51, user_id: 1002, message: [{ type: 'text', data: { text: '你好' } }] };
  return { w, clock, control, cfg, disk, options, event };
}
async function tool(f, { key = 'group:7001', callId = 'c1', sessionId = 's1', requestId = '11111111-1111-1111-1111-111111111111', args = { key: 'group:7001', token: 'fake', messages: ['你好'] }, name = 'qq_send_message', turn = 1, start = true } = {}) {
  if (start) f.w.onEvent(key, sessionId, { type: 'turn/start', data: { turn } });
  f.w.onEvent(key, sessionId, { type: 'tool/call', data: { name: 'mcp__snowluma__' + name, callId, arguments: JSON.stringify(args) } });
  const ctx = f.w.enterRequest({ headers: { 'x-whale-request-id': requestId, 'x-whale-tool': name, 'x-whale-args': Buffer.from(JSON.stringify(args)).toString('base64') } }, '/api/socialV2/send-message');
  await f.w.authorizeRequest(ctx, { key });
  return ctx;
}
const text = value => [{ type: 'text', data: { text: value } }];
await check('no sending before control state is verified', async () => { const f = fixture(); assert(f.w.quiet('group:7001')); });
await check('incoming duplicate is consumed once, including after restart', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; await f.w.incoming('group:7001', f.event, () => { n++; }); await f.w.incoming('group:7001', f.event, () => { n++; }); const next = createWhaleRuntime(f.options); await next.syncControl(); await next.incoming('group:7001', f.event, () => { n++; }); assert.equal(n, 1); });
await check('same message id in group and private does not collide', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; await f.w.incoming('group:7001', f.event, () => n++); await f.w.incoming('private:1001', { ...f.event, user_id: 1001 }, () => n++); assert.equal(n, 2); });
await check('unapproved private and ignored users never enter context', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; await f.w.incoming('private:1002', f.event, () => n++); await f.w.incoming('group:7001', { ...f.event, user_id: 1003 }, () => n++); assert.equal(n, 0); });
await check('pre-cutover, expired and future events cannot be replayed', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; for (const delta of [-2, -601, 7]) await f.w.incoming('group:7001', { ...f.event, time: f.event.time + delta }, () => n++); assert.equal(n, 0); });
await check('concurrent delivery of same inbound message is serialized', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; await Promise.all([f.w.incoming('group:7001', f.event, async () => { n++; await Promise.resolve(); }), f.w.incoming('group:7001', f.event, () => n++)]); assert.equal(n, 1); });
await check('slow quote resolution cannot reorder concurrent speakers', async () => { const f=fixture();await f.w.syncControl();const order=[];await Promise.all([f.w.incoming('group:7001',f.event,async()=>{await new Promise(r=>setTimeout(r,20));order.push('B');}),f.w.incoming('group:7001',{...f.event,message_id:52},()=>order.push('C'))]);assert.deepEqual(order,['B','C']); });
await check('durable intake recovers the gap before upstream append', async () => { const f = fixture(); await f.w.syncControl(); await assert.rejects(f.w.incoming('group:7001', f.event, () => { throw new Error('crash'); })); const next = createWhaleRuntime(f.options); await next.syncControl(); let n = 0; await next.recover(() => n++, () => false); assert.equal(n, 1); assert.equal(next.status().pendingIncoming, 0); });
await check('recovery does not append an already stored upstream message', async () => { const f = fixture(); await f.w.syncControl(); await assert.rejects(f.w.incoming('group:7001', f.event, () => { throw new Error('crash after append'); })); const next = createWhaleRuntime(f.options); await next.syncControl(); let n = 0; await next.recover(() => n++, () => true); assert.equal(n, 0); });
await check('expired pending inbox is retained as expired, not sent in a backlog', async () => { const f = fixture(); await f.w.syncControl(); await assert.rejects(f.w.incoming('group:7001', f.event, () => { throw new Error('offline'); })); f.clock.now += 700000; let n = 0; await f.w.recover(() => n++, () => false); assert.equal(n, 0); assert.equal(f.w.status().pendingIncoming, 0); });
await check('native tool id binds a send once; repeated HTTP receipt is idempotent', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); let n = 0; const sent = await f.w.send('group:7001', text('你好'), async () => ({ message_id: ++n })); await tool(f); assert.deepEqual(await f.w.send('group:7001', text('你好'), async () => ({ message_id: ++n })), sent); assert.equal(n, 1); });
await check('sent receipt remains idempotent after process restart', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); let n = 0; await f.w.send('group:7001', text('你好'), async () => ({ message_id: ++n })); f.w = createWhaleRuntime(f.options); await f.w.syncControl(); await tool(f); await f.w.send('group:7001', text('你好'), async () => ({ message_id: ++n })); assert.equal(n, 1); });
await check('same native call cannot change content on replay', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); await f.w.send('group:7001', text('你好'), async () => ({})); await tool(f); await assert.rejects(f.w.send('group:7001', text('换内容'), async () => ({})), /内容发生变化/); });
await check('timeout after remote acceptance remains uncertain across restart', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); let n = 0; await assert.rejects(f.w.send('group:7001', text('你好'), async () => { n++; throw new Error('timeout'); })); f.w = createWhaleRuntime(f.options); await f.w.syncControl(); await tool(f); await assert.rejects(f.w.send('group:7001', text('你好'), async () => { n++; }), /未确认/); assert.equal(n, 1); assert.equal(f.w.status().uncertain, 1); });
await check('certainly rejected sends survive cold restart without automatic retry',async()=>{const f=fixture();await f.w.syncControl();await tool(f);let attempts=0;await assert.rejects(f.w.send('group:7001',text('你好'),async()=>{attempts++;throw Object.assign(Error('definitely not sent'),{certainFail:true});}));assert.equal(Object.values(f.w.ledger.data.outbox)[0].status,'failed');f.w=createWhaleRuntime(f.options);assert.equal(f.w.status().healthy,true);await f.w.syncControl();assert.equal(attempts,1);assert.equal(Object.values(f.w.ledger.data.outbox)[0].status,'failed');await tool(f);await f.w.send('group:7001',text('你好'),async()=>({message_id:++attempts}));assert.equal(attempts,2);});
await check('accepting known failed status does not accept unknown outbox states',async()=>{const f=fixture();await f.w.syncControl();f.w.ledger.change(d=>{d.outbox.invalid={at:f.clock.now,attempts:[f.clock.now],status:'future-unknown'};});const next=createWhaleRuntime(f.options);assert.equal(next.status().healthy,false);await assert.rejects(next.syncControl());});
await check('switching tool call id cannot retry an uncertain same-content send', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); await assert.rejects(f.w.send('group:7001', text('你好'), async () => { throw new Error('timeout'); })); await tool(f, { callId: 'c2', requestId: '22222222-2222-2222-2222-222222222222' }); await assert.rejects(f.w.send('group:7001', text('你好'), async () => ({})), /仍待核对/); });
await check('new legitimate tool invocation may repeat known-success text', async () => { const f = fixture(); await f.w.syncControl(); let n = 0; await tool(f); await f.w.send('group:7001', text('好'), async () => ++n); await tool(f, { callId: 'c2', requestId: '22222222-2222-2222-2222-222222222222' }); await f.w.send('group:7001', text('好'), async () => ++n); assert.equal(n, 2); });
await check('owner stop cancels old guard even after resuming', async () => { const f = fixture(); await f.w.syncControl(); const guard = f.w.guard('group:7001'); f.control.epoch++; f.control.quietUntil = f.clock.now + 600000; await f.w.syncControl(); assert.throws(guard); f.control.quietUntil = 0; await f.w.syncControl(); assert.throws(guard); assert.doesNotThrow(f.w.guard('group:7001')); });
await check('late native tool call retains pre-stop epoch, never inherits resumed permission', async () => { const f = fixture(); await f.w.syncControl(); f.w.onEvent('group:7001', 's1', { type: 'turn/start', data: { turn: 1 } }); f.control.epoch++; await f.w.syncControl(); await assert.rejects(tool(f, { start: false }), /原回合已叫停/); });
await check('missing turn start cannot grant permission to an old replayed tool call', async () => { const f = fixture(); await f.w.syncControl(); await assert.rejects(tool(f, { start: false }), /原回合已叫停/); });
await check('group quiet does not suppress owner private channel', async () => { const f = fixture(); f.control.quietUntil = f.clock.now + 50000; await f.w.syncControl(); assert(f.w.quiet('group:7001')); assert(!f.w.quiet('private:1001')); });
await check('send cannot borrow another conversation effect', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); await assert.rejects(f.w.send('group:7002', text('你好'), async () => ({})), /缺少有效/); await assert.rejects(f.w.send('private:1001', text('你好'), async () => ({})), /缺少有效/); });
await check('picture cooldown survives restart and a new tool call', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); const image = [{ type: 'image', data: { file: 'base64://fake-image' } }]; await f.w.send('group:7001', image, async () => ({})); f.w = createWhaleRuntime(f.options); await f.w.syncControl(); await tool(f, { callId: 'c2', requestId: '22222222-2222-2222-2222-222222222222' }); await assert.rejects(f.w.send('group:7001', image, async () => ({})), /刚发过/); f.clock.now += 121000; await f.w.send('group:7001', image, async () => ({})); });
await check('zero image policy permits rapid sticker battles and known-success reuse across restart',async()=>{
 const f=fixture();Object.assign(f.cfg.whaleCompat,{pictureCooldownMs:0,pictureGapMs:0,privatePicturesPerDay:0,groupPicturesPerHour:0});await f.w.syncControl();
 const image=[{type:'image',data:{file:'base64://same-sticker'}}];let sends=0;
 for(let i=1;i<=12;i++){if(i===7){f.w=createWhaleRuntime(f.options);await f.w.syncControl();}await tool(f,{callId:'image-'+i,requestId:'11111111-1111-1111-1111-'+String(i).padStart(12,'0')});await f.w.send('group:7001',image,async()=>({message_id:++sends}));}
 assert.equal(sends,12);
 await tool(f,{callId:'image-12',requestId:'11111111-1111-1111-1111-000000000012'});await f.w.send('group:7001',image,async()=>({message_id:++sends}));assert.equal(sends,12);
});
await check('unlimited images retain uncertainty and owner stop protection',async()=>{
 const f=fixture();Object.assign(f.cfg.whaleCompat,{pictureCooldownMs:0,pictureGapMs:0,privatePicturesPerDay:0,groupPicturesPerHour:0});await f.w.syncControl();const image=[{type:'image',data:{file:'base64://image'}}];let sends=0;
 await tool(f);await assert.rejects(()=>f.w.send('group:7001',image,async()=>{sends++;throw Error('ack lost')}));
 await tool(f,{callId:'c2',requestId:'22222222-2222-2222-2222-222222222222'});await assert.rejects(()=>f.w.send('group:7001',image,async()=>{sends++;}));assert.equal(sends,1);
 f.control.epoch++;f.control.quietUntil=f.clock.now+60000;await f.w.syncControl();await assert.rejects(()=>f.w.send('group:7001',image,async()=>{sends++;}));assert.equal(sends,1);
});
await check('internal English-only notices are suppressed while cute text survives', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); await assert.rejects(f.w.send('group:7001', text('INTERNAL ERROR'), async () => ({})), /内部提示/); let actual; await f.w.send('group:7001', text('哼🐟（探头）(｡･ω･｡)'), async s => { actual = s; }); assert.equal(actual[0].data.text, '哼🐟（探头）(｡･ω･｡)'); });
await check('voice, mass mention and ignored target cannot escape through segments', async () => { const f = fixture(); await f.w.syncControl(); await tool(f); for (const segments of [[{ type: 'record', data: { file: 'x' } }], [{ type: 'at', data: { qq: 'all' } }, ...text('hi')], [{ type: 'at', data: { qq: '1003' } }, ...text('hi')]]) await assert.rejects(f.w.send('group:7001', segments, async () => ({}))); });
await check('ledger corruption fails closed and never invokes login recovery', async () => { const f = fixture(); await f.w.syncControl(); await f.w.incoming('group:7001', f.event, () => {}); for (const k of f.disk.files.keys()) if (/whale-delivery\.[01]$/.test(k)) f.disk.files.set(k, Buffer.from('broken')); const next = createWhaleRuntime(f.options); assert.equal(next.status().healthy, false); await assert.rejects(next.syncControl()); });
await check('known account text is rejected before the actual transport or outbox write',async()=>{const f=fixture();f.cfg.ownerQQ='87654321';await f.w.syncControl();await tool(f);let sends=0;await assert.rejects(()=>f.w.send('group:7001',text('账号87654321'),()=>{sends++;}),/改用昵称/);assert.equal(sends,0);assert.equal(Object.keys(f.w.ledger.data.outbox).length,0);});
await check('owner availability notice is one DM across restart and calendar midnight', async()=>{
  const f=fixture();f.clock.now=Date.parse('2026-10-29T23:55:00+08:00');await f.w.syncControl();const sent=[];
  await f.w.ownerNotice('night-rest',async(body,id)=>{sent.push({body,id});return{message_id:1};});
  f.clock.now+=20*60000;const reboot=createWhaleRuntime(f.options);await reboot.syncControl();
  assert.equal((await reboot.ownerNotice('night-rest',async()=>{throw Error('duplicate');})).skipped,'duplicate');
  assert.equal(sent.length,1);assert.equal(sent[0].body.user_id,1001);assert(sent[0].body.message[0].data.text.includes('晚安'));
});
await check('uncertain owner notice never retries and explicit private silence is respected',async()=>{
  const f=fixture();await f.w.syncControl();let sends=0;
  await assert.rejects(f.w.ownerNotice('budget',async()=>{sends++;throw Error('remote received then timed out');}));
  assert.equal((await f.w.ownerNotice('budget',async()=>{sends++;})).skipped,'duplicate');assert.equal(sends,1);
  const g=fixture();g.control.privateQuietForever=true;await g.w.syncControl();assert.equal((await g.w.ownerNotice('budget',async()=>{throw Error('quiet');})).skipped,'unavailable');
  assert.equal((await g.w.ownerNotice('arbitrary',async()=>{throw Error('unknown');})).skipped,'unavailable');
});
// 核销151（2026-10-31 深夜，主人令零遗留）：uncertain 自动对账——无实锤保持拦锁，有实锤才清锁放行。
await check('reconcileUncertain151 keeps blocking without proof and releases only with it', async () => {
  const f = fixture(); await f.w.syncControl(); await tool(f);
  await assert.rejects(f.w.send('group:7001', text('你好'), async () => { throw new Error('timeout'); }));
  assert.equal(f.w.status().uncertain, 1);
  f.clock.now += 130000; // 对账窗口只处理 2 分钟前的条目
  let r = await f.w.reconcileUncertain151(async () => false);
  assert.equal(r.checked, 1); assert.equal(r.cleared, 0);
  await assert.rejects(f.w.send('group:7001', text('你好'), async () => ({})), /仍待核对/); // 查无实锤=继续拦
  r = await f.w.reconcileUncertain151(async () => true);
  assert.equal(r.cleared,0);assert.equal(f.w.status().uncertain,1,'a legacy nearby-message boolean is not content proof');
  r = await f.w.reconcileUncertain151(async (key,atMs,hash)=>({confirmed:true,hash:'0'.repeat(64),messageId:'wrong'}));
  assert.equal(r.cleared,0);
  r = await f.w.reconcileUncertain151(async (key,atMs,hash)=>({confirmed:key==='group:7001'&&atMs>0,hash,messageId:'receipt-151'}));
  assert.equal(r.cleared, 1); assert.equal(f.w.status().uncertain, 0);
  let n = 0; await f.w.send('group:7001', text('你好'), async () => ++n); assert.equal(n, 1); // 21:14 误拦场景自此放行
});
// 换班159（2026-11-01 主人钦定全自动换班）：从 live-mirror 提取 NETS 测试块实跑 fatDecision159 七场景。
await check('fatDecision159 rotates only fat idle cooled sessions within daily caps', async () => {
  const src = fs.readFileSync(new URL('../live-mirror/src/bridge.js', import.meta.url), 'utf8');
  const m = src.match(/\/\*__NETS153_TESTABLE__\*\/([\s\S]*?)\/\*__NETS153_TESTABLE_END__\*\//);
  assert.ok(m, 'NETS testable block must exist in mirror');
  const fatDecision159 = new Function(m[1] + '; return fatDecision159;')();
  const now = 1793600000000;
  const L = { ctxLimit: 250000, idleMin: 20, cooldownMs: 21600000, perDay: 3, dayKey: '2026-11-01' };
  const base = { ctx: 678000, idleMs: 25 * 60000, busy: false, presetKnown: true, rotAt: 0, day: '', count: 0, now, limits: L };
  assert.ok(fatDecision159(base), 'fat idle preset-known must rotate');
  assert.equal(fatDecision159({ ...base, busy: true }), null);
  assert.equal(fatDecision159({ ...base, presetKnown: false }), null);
  assert.equal(fatDecision159({ ...base, idleMs: 10 * 60000 }), null);
  assert.equal(fatDecision159({ ...base, ctx: 120000 }), null);
  assert.equal(fatDecision159({ ...base, rotAt: now - 3 * 3600000 }), null);
  assert.equal(fatDecision159({ ...base, day: L.dayKey, count: 3 }), null);
  assert.ok(fatDecision159({ ...base, day: '', count: 3 }), 'day rollover resets cap');
  const L2 = { idleMin: 20, cooldownMs: 21600000, perDay: 3, dayKey: '2026-11-01' };
  assert.ok(fatDecision159({ ...base, ctx: 200000, limits: L2 }), 'defaults the 150k threshold');
  assert.equal(fatDecision159({ ...base, ctx: 100000, limits: L2 }), null, 'default 150k spares lean sessions');
});
await check('running build proof stays tied to the loaded process when disk source changes',async()=>{
 const f=fixture(),sep=process.platform==='win32'?'\\':'/';
 const bridge=['','fake','src','bridge.js'].join(sep),runtime=['','fake','whale-compat','runtime.mjs'].join(sep);
 f.disk.files.set(bridge,Buffer.from('bridge-old'));f.disk.files.set(runtime,Buffer.from('runtime-old'));
 for(const n of ['legacy-reader.mjs','personal-journal.mjs'])f.disk.files.set(['','fake','whale-compat',n].join(sep),Buffer.from(n+'-old'));
 const loaded=createWhaleRuntime(f.options),before=loaded.status().build;
 assert.equal(before.revision,(await import('../version.mjs')).OVERLAY_PATCH);assert.equal(before.pid,process.pid);assert.match(before.sources['src/bridge.js'],/^[a-f0-9]{64}$/);
 for(const n of ['legacy-reader.mjs','personal-journal.mjs']){assert.match(before.sources['whale-compat/'+n],/^[a-f0-9]{64}$/);f.disk.files.set(['','fake','whale-compat',n].join(sep),Buffer.from(n+'-new'));assert.equal(loaded.status().build.sources['whale-compat/'+n],before.sources['whale-compat/'+n]);assert.notEqual(createWhaleRuntime(f.options).status().build.sources['whale-compat/'+n],before.sources['whale-compat/'+n]);}
 f.disk.files.set(bridge,Buffer.from('bridge-new'));
 assert.equal(loaded.status().build.sources['src/bridge.js'],before.sources['src/bridge.js']);
 assert.notEqual(createWhaleRuntime(f.options).status().build.sources['src/bridge.js'],before.sources['src/bridge.js']);
});
await check('one failed recovered intake cannot block other channels and retries persist across restart',async()=>{
 const f=fixture();await f.w.syncControl();for(const key of ['group:7001','group:7002'])await assert.rejects(f.w.incoming(key,f.event,()=>{throw Error('temporary');}));
 let attempted=0,delivered=0;await f.w.recover(key=>{if(key==='group:7001'){attempted++;throw Error('control timeout');}delivered++;},()=>false);
 assert.equal(attempted,1);assert.equal(delivered,1);const next=createWhaleRuntime(f.options);await next.syncControl();await next.recover(()=>attempted++,()=>false);assert.equal(attempted,1);
 f.clock.now+=5000;await next.recover(()=>attempted++,()=>false);assert.equal(attempted,2);assert.equal(next.status().pendingIncoming,0);
});
await check('recovery cannot race an intake that is still actively running',async()=>{
 const f=fixture();await f.w.syncControl();let release;const gate=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);const pending=f.w.incoming('group:7001',f.event,async()=>{entered();await gate;});await started;
 await f.w.recover(()=>{throw Error('duplicate intake');},()=>false);release();await pending;assert.equal(f.w.status().pendingIncoming,0);
});
await check('parallel recovery sweeps coalesce without adding duplicate context',async()=>{
 const f=fixture();await f.w.syncControl();await assert.rejects(f.w.incoming('group:7001',f.event,()=>{throw Error('crash');}));let n=0;const deliver=async()=>{n++;await new Promise(r=>setTimeout(r,10));};await Promise.all([f.w.recover(deliver,()=>false),f.w.recover(deliver,()=>false)]);assert.equal(n,1);
});
await check('a pending intake that loses authorization is closed without delivery',async()=>{
 const f=fixture();await f.w.syncControl();await assert.rejects(f.w.incoming('group:7001',f.event,()=>{throw Error('crash');}));f.cfg.allow.groups=[];await f.w.recover(()=>{throw Error('unauthorized');},()=>false);assert.equal(f.w.status().pendingIncoming,0);
});
await check('unconfirmed control retains group intake instead of treating it as an explicit quiet instruction',async()=>{
 const f=fixture();f.control.ok=false;await assert.rejects(f.w.syncControl());let delivered=0;await assert.rejects(f.w.incoming('group:7001',f.event,()=>delivered++));assert.equal(f.w.status().pendingIncoming,1);assert.equal(delivered,0);
 f.control.ok=true;await f.w.syncControl();await f.w.recover(()=>delivered++,()=>false);assert.equal(delivered,1);assert.equal(f.w.status().pendingIncoming,0);
});
console.log('PASS_ALL ' + passed);
