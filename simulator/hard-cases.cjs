const fs = require('node:fs'), path = require('node:path');
const { createRuntime, ID } = require('./lib/production-runtime.cjs');
const { SimClock } = require('./lib/clock.cjs');
async function ready(r, rows) { for (const row of rows) r.add({ time: r.clock.now, text: '', at: [], images: [], ...row }); await r.hooks.轮询收消息(); await r.clock.advance(6000); await r.hooks.冲缓冲(r.config); }
const data = (r, id, sender, text, extra = {}) => ({ id, sender, text, time: r.clock.now, at: ['W'], ...extra });
const textOf = d => d.body.message.filter(x => x.type === 'text').map(x => x.data.text).join('');
async function runHard({ sourcePath, style = '' } = {}) {
  const options = { sourcePath, style }, results = [];
  async function test(id, name, fn) {
    try { const x = await fn(); results.push({ id, name, ...x, passed: !!x.passed }); } catch (e) { results.push({ id, name, passed: false, infrastructureError: e.message }); }
  }
  await test('H01', '生成中收到纠正，后续仍保留', async () => {
    const r = createRuntime(options); await ready(r, [data(r, 1, 'B', '问第一个')]);
    await r.clock.advance(100); r.add(data(r, 2, 'B', '不是，我说的是另一个')); await r.hooks.轮询收消息();
    await r.finish(r.modelInbox[0], '先前问题的答复'); await r.clock.advance(6000); await r.hooks.冲缓冲(r.config);
    const context = r.modelInbox[1] && r.modelText(r.modelInbox[1]); r.assertIsolated(); return { passed: !!context?.includes('另一个'), capturedContexts: r.modelInbox.map(x => r.modelText(x)), sends: r.deliveries };
  });
  await test('H02', '旧回合晚完成，不借用新对象', async () => {
    const r = createRuntime(options); await r.hooks.转入一条('B的问题', [], '11', 'group', ID.B, ID.B); await r.hooks.转入一条('C的问题', [], '12', 'group', ID.C, ID.C);
    await r.finish(r.modelInbox[1], '答C'); await r.finish(r.modelInbox[0], '答B');
    const targets = r.deliveries.map(d => ({ text: textOf(d), at: d.body.message.find(s => s.type === 'at')?.data.qq, quote: d.body.message.find(s => s.type === 'reply')?.data.id }));
    return { passed: targets.length === 2 && targets[0].at === String(ID.C) && targets[0].quote === '12' && targets[1].at === String(ID.B) && targets[1].quote === '11', targets };
  });
  await test('H03', '重复完成事件不重复发送', async () => {
    const r = createRuntime(options); await ready(r, [data(r, 21, 'B', '问一次')]); await r.finish(r.modelInbox[0], '只答一次', { duplicate: true });
    return { passed: r.deliveries.length === 1, sentCount: r.deliveries.length, attempts: r.attempts };
  });
  await test('H04', '发送超时但远端已收到，不自动补发', async () => {
    const r = createRuntime({ ...options, sendBehavior: (_, n) => n === 1 ? 'received_then_timeout' : 'success' }); await ready(r, [data(r, 31, 'B', '问一次')]); await r.finish(r.modelInbox[0], '远端收到这句话');
    return { passed: r.deliveries.length === 1, sentCount: r.deliveries.length, attempts: r.attempts, failureLayer: '发送' };
  });
  await test('H05', '多个主动入口同时到期不合入同轮', async () => {
    const r = createRuntime(options);
    const answers = await r.clock.settle(Promise.all([r.requestRoute('nudge', { text: '入口一', channel: 'group' }), r.requestRoute('nudge', { text: '入口二', channel: 'group' })]));
    return { passed: r.modelInbox.length <= 1, injectedTurns: r.modelInbox.length, answers, routes: [...r.hooks.轮路由] };
  });
  await test('H06', '重启后不重放已回答消息', async () => {
    const disk = new Map(), clock = new SimClock(); let r = createRuntime({ ...options, disk, clock });
    const row = data(r, 41, 'B', '重启前已答'); await ready(r, [row]); await r.finish(r.modelInbox[0], '重启前答复');
    r = createRuntime({ ...options, disk, clock }); r.add(row); await r.hooks.轮询收消息(); await r.clock.advance(6000); await r.hooks.冲缓冲(r.config);
    return { passed: r.modelInbox.length === 0, repeatedInputs: r.modelInbox.map(x => r.modelText(x)), persistedPaths: [...disk.keys()], failureLayer: '上下文' };
  });
  await test('H07', '群私消息ID相同，不互相去重', async () => {
    const r = createRuntime(options); r.add(data(r, 51, 'A', '私聊问题', { channel: 'private', at: [] })); r.add(data(r, 51, 'B', '群聊问题'));
    await r.hooks.轮询收消息(); await r.clock.advance(7000); await r.hooks.冲缓冲(r.config);
    const first = r.modelInbox[0]; if (first) await r.finish(first, '第一处答复'); await r.hooks.冲缓冲(r.config);
    const contexts = r.modelInbox.map(x => r.modelText(x));
    return { passed: contexts.length === 2 && contexts.some(x => x.includes('私聊问题')) && contexts.some(x => x.includes('群聊问题')), contexts, failureLayer: '解析' };
  });
  await test('H08', '过期主动话不会积攒后一起补发', async () => {
    const r = createRuntime(options);
    r.hooks.加缓冲('g' + ID.B, { text: '早已过时的话', images: [], mid: '61', route: 'group', at: 0, speaker: ID.B, name: 'B' }); await r.clock.advance(700000); await r.hooks.冲缓冲(r.config);
    return { passed: r.modelInbox.length === 0, modelInputs: r.modelInbox.length, logs: r.logs };
  });
  await test('H09', '搜索和英文工具失败不能执行服务控制', async () => {
    const r = createRuntime(options); await ready(r, [data(r, 71, 'B', '找歌超时了')]); await r.finish(r.modelInbox[0], 'Internal Server Error: request failed at upstream resolver');
    const control = r.requests.filter(x => /docker|restart|relogin|kick|systemctl/.test(x.action));
    return { passed: control.length === 0 && r.deliveries.length === 0, serviceActions: control, errorLeakCount: r.deliveries.length };
  });
  await test('H10', '明确拒收引用时保留降级发送正常路径', async () => {
    const r = createRuntime({ ...options, sendBehavior: (_, n) => n === 1 ? 'rejected' : 'success' }); await ready(r, [data(r, 81, 'B', '原引用已过期')]); await r.finish(r.modelInbox[0], '只送到一次');
    return { passed: r.attempts.length === 2 && r.deliveries.length === 1, attempts: r.attempts, delivered: r.deliveries.length };
  });
  await test('H11', '私聊不确定发送也不补发', async () => {
    const r = createRuntime({ ...options, sendBehavior: (_, n) => n === 1 ? 'received_then_timeout' : 'success' });
    await r.hooks.转入一条('主人私聊问题', [], '91', 'private', 0, ID.A); await r.finish(r.modelInbox[0], '主人私聊答复');
    return { passed: r.deliveries.length === 1 && r.deliveries.every(d => d.body.user_id === ID.A), sentCount: r.deliveries.length, attempts: r.attempts };
  });
  await test('H12', '两名同名成员按稳定身份排队并回发', async () => {
    const r = createRuntime(options); await ready(r, [data(r, 101, 'B', '外卖到了', { name: '同名' }), data(r, 102, 'C', '还没下单', { name: '同名' })]);
    await r.finish(r.modelInbox[0], 'B的答复'); await r.hooks.冲缓冲(r.config); await r.finish(r.modelInbox[1], 'C的答复');
    const targets = r.deliveries.map(d => d.body.message.find(s => s.type === 'at')?.data.qq);
    return { passed: targets.join(',') === [ID.B, ID.C].join(','), targets, contexts: r.modelInbox.map(x => r.modelText(x)) };
  });
  await test('H13', '重启后图片24小时去重与90秒冷却恢复', async () => {
    const disk = new Map(), clock = new SimClock(); disk.set('/offline/stickers/test.png', Buffer.from('89504e470d0a1a0a', 'hex'));
    let r = createRuntime({ ...options, disk, clock }); await r.hooks.转入一条('发图', [], '111', 'group', ID.B, ID.B); await r.finish(r.modelInbox[0], '![测试](/offline/stickers/test.png)');
    const before = r.deliveries.length; r = createRuntime({ ...options, disk, clock }); await r.hooks.转入一条('又想发同一张', [], '112', 'group', ID.B, ID.B); await r.finish(r.modelInbox[0], '![测试](/offline/stickers/test.png)');
    return { passed: before === 1 && r.deliveries.length === 0, beforeRestart: before, afterRestart: r.deliveries.length, failureLayer: '发送' };
  });
  return { productionSource: sourcePath, results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, limits: ['H09 targets the bridge; use the independent guard-lab report for original shell behavior', 'Multi-day Python scheduling is evaluated by scheduler-lab, not approximated by response delay'], noRealQQ: true, modelCalls: 0 };
}
if (require.main === module) {
  const sourcePath = process.argv[2] || path.resolve(__dirname, '../bridge/host.js'), file = process.argv[3];
  runHard({ sourcePath }).then(r => { if (file) fs.writeFileSync(file, JSON.stringify(r, null, 2)); console.log(JSON.stringify({ passed: r.passed, failed: r.failed, results: r.results.map(x => ({ id: x.id, passed: x.passed, error: x.infrastructureError, count: x.sentCount || x.injectedTurns || x.repeatedInputs?.length || x.contexts?.length })) }, null, 2)); }).catch(e => { console.error(e); process.exitCode = 1; });
}
module.exports = { runHard };
