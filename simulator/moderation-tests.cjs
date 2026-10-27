const assert = require('node:assert/strict'), path = require('node:path');
const { createRuntime, ID } = require('./lib/production-runtime.cjs');
const sourcePath = process.argv[2] || path.resolve(__dirname, '../bridge/host.js');
const members = Object.entries(ID).map(([name, id]) => ({ user_id: id, nickname: name, card: name, role: name === 'W' ? 'admin' : 'member' }));
const boot = options => createRuntime({ sourcePath, members: structuredClone(members), moderationBehavior: () => 'success', ...options });
const text = value => ({ type: 'text', data: { text: value } });
const at = name => ({ type: 'at', data: { qq: String(ID[name]) } });
const command = (r, extra = {}) => ({ id: 601, sender: 'A', time: r.clock.now, segments: [at('W'), text(' 踢 '), at('B')], ...extra });
const actions = r => r.requests.filter(x => /^set_group_/.test(x.action));
const poll = async r => { await r.clock.settle(r.hooks.轮询收消息()); r.assertIsolated(); };
const ledger = disk => [...disk.entries()].filter(([p]) => /qq-delivery-.*\.[01]$/.test(p)).map(([, b]) => JSON.parse(b)).sort((a, b) => b.revision - a.revision)[0].data;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
(async () => {
  await test('owner group kick uses actual @ target and current group; receipt stays private', async () => {
    const r = boot(); r.add(command(r)); await poll(r);
    assert.equal(actions(r).length, 1); assert.deepEqual(actions(r)[0].body, { group_id: 7001, user_id: ID.B, reject_add_request: false });
    assert.equal(r.modelInbox.length, 0); assert.equal(r.deliveries.length, 1); assert.equal(r.deliveries[0].body.user_id, ID.A);
    await r.clock.advance(180000); assert.equal(r.modelInbox.length, 0);
  });
  for (const phrase of ['把 <B> 踢出去', '踢掉 <B>', '踢出 <B>', '踢 <B> 吧', '/踢 <B>', '鲸戒，踢 <B>']) {
    await test('direct imperative variant: ' + phrase, async () => {
      const r = boot(), parts = phrase.split('<B>'); r.add(command(r, { segments: [at('W'), text(parts[0]), at('B'), text(parts[1])] })); await poll(r); assert.equal(actions(r).length, 1);
    });
  }
  for (const phrase of ['不要踢 <B>', '如果我说踢 <B>', '比如踢 <B>', '踢 <B> 吗？', '能不能踢 <B>', '“踢 <B>”', '测试踢 <B>', '踢 <B>，再踢C', '踢他']) {
    await test('non-imperative does not act: ' + phrase, async () => {
      const r = boot(), parts = phrase.split('<B>'); r.add(command(r, { segments: [at('W'), text(parts[0]), ...(parts.length > 1 ? [at('B'), text(parts[1])] : [])] })); await poll(r); assert.equal(actions(r).length, 0);
    });
  }
  for (const [label, mutate] of [
    ['non-owner named 主人 with admin role', m => { m.user_id = ID.C; m.sender = { user_id: ID.C, nickname: '主人', role: 'owner' }; }],
    ['sender ID disagreement', m => { m.sender.user_id = ID.C; }],
    ['wrong group', m => { m.group_id = 7002; }],
    ['missing group', m => { delete m.group_id; }],
    ['wrong account', m => { m.self_id = ID.C; }],
    ['old message', m => { m.time -= 601; }],
    ['future message', m => { m.time += 60; }],
    ['missing ID', m => { delete m.message_id; }],
    ['reply carrying command', m => { m.message.unshift({ type: 'reply', data: { id: '90' } }); }],
    ['forward carrying command', m => { m.message.push({ type: 'forward', data: { id: 'f' } }); }],
    ['file carrying command', m => { m.message.push({ type: 'file', data: { name: 'commands.md' } }); }],
    ['multiple targets', m => { m.message.push(at('C')); }],
    ['fabricated CQ text', m => { m.message = [at('W'), text('踢 [CQ:at,qq=1002]')]; }],
    ['unaddressed owner chatting', m => { m.message = [text('踢 B')]; }],
  ]) await test(label, async () => { const r = boot(), m = r.add(command(r)); mutate(m); await poll(r); assert.equal(actions(r).length, 0); });
  await test('exact unique name succeeds; substring does not', async () => {
    const list = structuredClone(members); list.find(x => x.user_id === ID.B).card = 'Bobby'; list.find(x => x.user_id === ID.B).nickname = 'Bobby';
    for (const name of ['Bobby', 'Bob']) { const r = boot({ members: list }); r.add(command(r, { segments: [at('W'), text('踢 ' + name)] })); await poll(r); assert.equal(actions(r).length, name === 'Bobby' ? 1 : 0); }
  });
  await test('same display name cannot choose an arbitrary member', async () => {
    const list = structuredClone(members); list.find(x => x.user_id === ID.C).card = 'B'; const r = boot({ members: list });
    r.add(command(r, { segments: [at('W'), text('踢 B')] })); await poll(r); assert.equal(actions(r).length, 0);
  });
  for (const target of ['A', 'W']) await test('protected target ' + target, async () => { const r = boot(); r.add(command(r, { segments: [at('W'), text('踢 ' + target)] })); await poll(r); assert.equal(actions(r).length, 0); });
  for (const role of ['owner', 'admin', 'unknown']) await test('target role guard ' + role, async () => {
    const list = structuredClone(members); list.find(x => x.user_id === ID.B).role = role; const r = boot({ members: list }); r.add(command(r)); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('bot without management privilege cannot act', async () => {
    const list = structuredClone(members); list.find(x => x.user_id === ID.W).role = 'member'; const r = boot({ members: list }); r.add(command(r)); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('private ban and unban retain explicit owner control', async () => {
    for (const [word, duration] of [['禁言 B 3', 180], ['解禁 B', 0]]) { const r = boot(); r.add(command(r, { channel: 'private', segments: [text(word)] })); await poll(r); assert.equal(actions(r).length, 1); assert.equal(actions(r)[0].body.duration, duration); }
  });
  await test('same command, overlapping polls and restart cause only one attempt', async () => {
    let r = boot(); const row = command(r); r.add(row); await r.clock.settle(Promise.all([r.hooks.轮询收消息(), r.hooks.轮询收消息()])); await poll(r); assert.equal(actions(r).length, 1);
    r = boot({ disk: r.disk, clock: r.clock }); r.add(row); await poll(r); assert.equal(actions(r).length, 0); assert.equal(r.deliveries.length, 0);
  });
  for (const behavior of ['received_then_timeout', 'rejected', 'malformed']) await test(behavior + ': terminal intent survives restart without retry or English leak', async () => {
    let r = boot({ moderationBehavior: () => behavior }); const row = command(r); r.add(row); await poll(r); assert.equal(actions(r).length, 1);
    assert(r.deliveries.every(x => !JSON.stringify(x).includes('ENGLISH_SIMULATED_ADMIN_ERROR')));
    const status = ledger(r.disk).inbox['g:7001:601'].moderation.status; assert.equal(status, behavior === 'rejected' ? 'rejected' : 'uncertain');
    assert(!r.requests.some(x => /login|restart|reboot/.test(x.action)));
    r = boot({ disk: r.disk, clock: r.clock }); r.add(row); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('persist failure before action fails closed', async () => {
    let armed = false; const r = boot({ fsFault(op, p) { if (armed && op === 'rename' && p.includes('qq-delivery-')) throw new Error('disk fault'); } });
    armed = true; r.add(command(r)); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('ack persist failure cannot repeat the remotely applied kick', async () => {
    let armed = false; let r = boot({ moderationBehavior: () => { armed = true; return 'success'; }, fsFault(op, p) { if (armed && op === 'rename' && p.includes('qq-delivery-')) throw new Error('disk fault after action'); } });
    const row = command(r); r.add(row); await poll(r); assert.equal(actions(r).length, 1);
    r = boot({ disk: r.disk, clock: r.clock }); r.add(row); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('dry-run has no destructive operation', async () => { const r = boot(); r.setConfig({ 试运行: true }); r.add(command(r)); await poll(r); assert.equal(actions(r).length, 0); });
  await test('feature installation cannot execute a fresh but pre-install command from history', async () => {
    const r = boot(); r.add(command(r, { time: r.clock.now - 30000 })); await poll(r); assert.equal(actions(r).length, 0);
  });
  await test('group/private identical message IDs have separate moderation tombstones', async () => {
    const r = boot(); r.add(command(r)); await poll(r); r.add(command(r, { channel: 'private', segments: [text('禁言 C 2')] })); await poll(r); assert.equal(actions(r).length, 2); assert.equal(actions(r)[1].body.user_id, ID.C);
  });
  await test('debug endpoint requires separate key and cannot run moderation even with it', async () => {
    const r = boot(); assert.equal((await r.requestRoute('master-cmd', { text: '踢 B' })).reason, 'unauthorized');
    assert.equal((await r.requestRoute('master-cmd', { text: '踢 B' }, { authorization: 'Bearer ' + 'offline-test-'.repeat(5) })).reason, 'qq_owner_message_required'); assert.equal(actions(r).length, 0);
  });
  await test('authenticated audit is pure and uses only synthetic identities', async () => {
    const r = boot(), m = r.add(command(r)); assert.equal((await r.requestRoute('moderation-audit', { channel: 'group', message: m })).reason, 'unauthorized');
    const a = await r.requestRoute('moderation-audit', { channel: 'group', message: m }, { authorization: 'Bearer ' + 'offline-test-'.repeat(5) });
    assert(a.ok && a.accepted && a.noAgentTurn && a.noQQSend && a.noModerationAction); assert.equal(actions(r).length, 0); assert.equal(r.requests.length, 0);
  });
  console.log('PASS_ALL ' + passed);
})().catch(error => { console.error(error); process.exitCode = 1; });
