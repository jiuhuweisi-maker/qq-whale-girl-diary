const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { buildCandidate } = require('./propose.cjs');
const { createRuntime, ID } = require('./lib/production-runtime.cjs');
const { SimClock } = require('./lib/clock.cjs');
const { runHard } = require('./hard-cases.cjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-resume-'));
const sourcePath = path.join(work, 'host.mjs');
buildCandidate(process.argv[2] || path.resolve(__dirname, '../bridge/host.js'), sourcePath);
const results = [], options = { sourcePath };
const row = (r, id, channel = 'group', text = '重启测试') => ({ id, sender: channel === 'group' ? 'B' : 'A', channel, at: channel === 'group' ? ['W'] : [], text, time: r.clock.now, images: [] });
const boot = extras => createRuntime({ ...options, ...extras });
async function dispatch(r, rows) { for (const m of rows) r.add(m); await r.hooks.轮询收消息(); await r.clock.advance(7000); await r.hooks.冲缓冲(r.config); }
function ledger(disk) { return [...disk.entries()].filter(([p]) => /qq-delivery-.*\.[01]$/.test(p)).map(([, b]) => JSON.parse(b)).sort((a,b) => b.revision-a.revision)[0].data; }
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); console.log('PASS '+name); } catch(e) { results.push({ name, passed: false, error: e.stack }); console.log('FAIL '+name+': '+e.message); } }
(async () => {
  for (const channel of ['group', 'private']) {
    await test(channel+': buffered messages survive restart exactly once', async () => {
      const disk = new Map(), clock = new SimClock(); let r = boot({ disk, clock }); const m = row(r, 201, channel);
      r.add(m); await r.hooks.轮询收消息(); assert.equal(r.modelInbox.length, 0);
      r = boot({ disk, clock }); r.add(m); await r.hooks.轮询收消息(); await clock.advance(7000); await r.hooks.冲缓冲(r.config);
      assert.equal(r.modelInbox.length, 1); await r.finish(r.modelInbox[0], '嗯🙂（点头）');
      r = boot({ disk, clock }); await dispatch(r, [m]); assert.equal(r.modelInbox.length, 0); r.assertIsolated();
    });
  }
  await test('claimed turn restores only after original message is re-claimed, even if turn numbers change', async () => {
    const disk = new Map(), clock = new SimClock(); let r = boot({ disk, clock }); await dispatch(r, [row(r, 210)]); const prior = r.modelInbox[0];
    r = boot({ disk, clock }); assert.equal(r.modelInbox.length, 0); await r.finish(prior, '裸旧编号不能发');assert.equal(r.deliveries.length,0);
    const resumed={...prior,turn:prior.turn+10};r.emit('agent/inbox/claimed',{agent:r.agent,message:prior.message,turn:resumed.turn});await r.finish(resumed, '原回合回复'); await r.finish(resumed, '重复完成');
    assert.equal(r.deliveries.length, 1); assert.equal(r.deliveries[0].body.message.find(x=>x.type==='reply').data.id, '210');
  });
  await test('queued request can be claimed after restart by its saved message ID', async () => {
    const disk = new Map(), clock = new SimClock(); let r = boot({ disk, clock, autoClaim: false }); await dispatch(r, [row(r, 211)]); const prior = r.modelInbox[0];
    r = boot({ disk, clock }); r.emit('agent/inbox/claimed', { agent: r.agent, message: prior.message, turn: prior.turn }); await r.finish(prior, '晚认领回复');
    assert.equal(r.deliveries.length, 1);
  });
  await test('dropped queued request does not return after restart', async () => {
    const disk = new Map(), clock = new SimClock(); let r = boot({ disk, clock, autoClaim: false }); const m=row(r,212); await dispatch(r,[m]);
    r.emit('agent/inbox/discarded', {agent:r.agent,message:r.modelInbox[0].message});
    // Use the host event actually registered by this bridge.
    if (r.hooks.待认领路由.size) r.hooks.收到丢弃({agent:r.agent,message:r.modelInbox[0].message});
    r=boot({disk,clock});await dispatch(r,[m]);assert.equal(r.modelInbox.length,0);assert.equal(r.hooks.待认领路由.size,0);
  });
  await test('expired backlog and old claimed completion cannot burst after restart', async () => {
    const disk=new Map(),clock=new SimClock();let r=boot({disk,clock});await dispatch(r,[row(r,213)]);const prior=r.modelInbox[0];await clock.advance(700000);
    r=boot({disk,clock});await r.finish(prior,'过时答复');assert.equal(r.deliveries.length,0);await dispatch(r,[row(r,214)]);assert.equal(r.modelInbox.length,1);
  });
  await test('more than 300 messages retain tombstones through restart', async () => {
    const disk=new Map(),clock=new SimClock();let r=boot({disk,clock});
    for(let i=0;i<350;i++) r.hooks.已转消息.add('g:7001:'+(3000+i));
    r.hooks.已转消息.clear();r=boot({disk,clock});await dispatch(r,[row(r,3000)]);assert.equal(r.modelInbox.length,0);
  });
  await test('group/private identical message IDs remain separate after restart',async()=>{
    const disk=new Map(),clock=new SimClock();let r=boot({disk,clock});const m=row(r,215);await dispatch(r,[m]);await r.finish(r.modelInbox[0],'群回复');
    r=boot({disk,clock});await dispatch(r,[row(r,215,'private')]);assert.equal(r.modelInbox.length,1);assert(r.modelText(r.modelInbox[0]).includes('私聊'));
  });
  await test('received-then-timeout is durable and stops later bubbles',async()=>{
    const disk=new Map(),clock=new SimClock();let r=boot({disk,clock,sendBehavior:()=> 'received_then_timeout'});const m=row(r,216);await dispatch(r,[m]);await r.finish(r.modelInbox[0],'第一句\n第二句');
    assert.equal(r.deliveries.length,1);assert(Object.values(ledger(disk).outbox).some(x=>x.status==='uncertain'));
    r=boot({disk,clock});await dispatch(r,[m]);assert.equal(r.modelInbox.length,0);assert.equal(r.deliveries.length,0);
  });
  await test('malformed HTTP acknowledgement is uncertain, not a quoted-send retry',async()=>{
    const r=boot({sendBehavior:()=> 'malformed'});await dispatch(r,[row(r,217)]);await r.finish(r.modelInbox[0],'一次');assert.equal(r.attempts.length,1);
    assert.equal(Object.values(ledger(r.disk).outbox)[0].status,'uncertain');
  });
  await test('failure to save send acknowledgement retains pre-send intent',async()=>{
    const disk=new Map(),clock=new SimClock();let fail=false;
    let r=boot({disk,clock,fsFault:(op,p,data)=>{if(fail&&op==='write'&&String(data).includes('"status":"sent"'))throw new Error('disk full after remote receipt');}});
    const m=row(r,218);await dispatch(r,[m]);fail=true;await r.finish(r.modelInbox[0],'收到过');assert.equal(r.deliveries.length,1);
    r=boot({disk,clock});await dispatch(r,[m]);assert.equal(r.modelInbox.length,0);assert.equal(r.deliveries.length,0);assert(Object.values(ledger(disk).outbox).some(x=>x.status==='uncertain'));
  });
  await test('failed state write stops intake before model invocation',async()=>{
    let fail=false;const r=boot({fsFault:(op,p)=>{if(fail&&op==='open'&&p.endsWith('.tmp'))throw new Error('disk denied');}});fail=true;
    r.add(row(r,219));try{await r.hooks.轮询收消息();}catch{}await r.clock.advance(7000);await r.hooks.冲缓冲(r.config);assert.equal(r.modelInbox.length,0);assert.equal(r.deliveries.length,0);assert(r.logs.some(x=>x.message.includes('持久消息账本不可用')));
  });
  await test('corrupt existing slot fails closed instead of trusting older tombstones',async()=>{
    const disk=new Map(),clock=new SimClock();let r=boot({disk,clock});await dispatch(r,[row(r,220)]);await r.finish(r.modelInbox[0],'已送');
    const key=[...disk.keys()].find(p=>/qq-delivery-.*\.[01]$/.test(p));disk.set(key,Buffer.from('{bad-json'));
    r=boot({disk,clock});await dispatch(r,[row(r,221)]);await r.hooks.转入一条('直发',[],'222','group',ID.B,ID.B);if(r.modelInbox[0])await r.finish(r.modelInbox[0],'禁止外发');assert.equal(r.deliveries.length,0);assert(r.logs.some(x=>x.message.includes('不可用')));
  });
  await test('unrenamed temporary file cannot erase committed picture cooldown',async()=>{
    const disk=new Map(),clock=new SimClock();disk.set('/offline/stickers/a.png',Buffer.from('image-a'));let r=boot({disk,clock});await r.hooks.转入一条('图',[],'223','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/a.png)');
    const key=[...disk.keys()].find(p=>/qq-delivery-.*\.[01]$/.test(p));disk.set(key+'.tmp',Buffer.from('partial'));
    r=boot({disk,clock});await r.hooks.转入一条('图',[],'224','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/a.png)');assert.equal(r.deliveries.length,0);
  });
  await test('90 second group cooldown survives restart and expires at boundary',async()=>{
    const disk=new Map(),clock=new SimClock();for(const name of ['a','b','c'])disk.set('/offline/stickers/'+name+'.png',Buffer.from(name));
    let r=boot({disk,clock});await r.hooks.转入一条('图',[],'225','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/a.png)');const used=ledger(disk).groupPictureAt;
    r=boot({disk,clock});await r.hooks.转入一条('图',[],'226','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/b.png)');assert.equal(r.deliveries.length,0);
    await clock.advance(used+90000-clock.now);await r.hooks.转入一条('图',[],'227','group',ID.B,ID.B);await r.finish(r.modelInbox.at(-1),'![图](/offline/stickers/c.png)');assert.equal(r.deliveries.length,1);
  });
  await test('same sticker is available again after 24 hours',async()=>{
    const disk=new Map(),clock=new SimClock();disk.set('/offline/stickers/a.png',Buffer.from('a'));let r=boot({disk,clock});await r.hooks.转入一条('图',[],'228','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/a.png)');
    await clock.advance(86400001);r=boot({disk,clock});await r.hooks.转入一条('图',[],'229','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/a.png)');assert.equal(r.deliveries.length,1);
  });
  await test('unreadable sticker does not consume group picture cooldown',async()=>{
    const r=boot();await r.hooks.转入一条('图',[],'230','group',ID.B,ID.B);await r.finish(r.modelInbox[0],'![图](/offline/stickers/missing.png)');assert.equal(ledger(r.disk).groupPictureAt,0);
    r.disk.set('/offline/stickers/ok.png',Buffer.from('ok'));await r.hooks.转入一条('图',[],'231','group',ID.B,ID.B);await r.finish(r.modelInbox.at(-1),'![图](/offline/stickers/ok.png)');assert.equal(r.deliveries.length,1);
  });
  await test('cute expressions are preserved byte for byte through durable sender',async()=>{
    const r=boot();await dispatch(r,[row(r,232)]);const body='好耶🙂（抱住尾巴）(≧∇≦)';await r.finish(r.modelInbox[0],body);assert.equal(r.deliveries[0].body.message.find(x=>x.type==='text').data.text,body);
  });
  const hard=await runHard(options);results.push(...hard.results.map(r=>({name:r.id+' '+r.name,passed:r.passed,error:r.infrastructureError})));
  const report={modelCalls:0,realQQConnections:0,productionModified:false,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
  if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,modelCalls:0}));if(report.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
