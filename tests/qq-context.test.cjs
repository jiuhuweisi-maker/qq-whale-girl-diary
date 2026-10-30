const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'bridge', 'host.js'), 'utf8');
function block(a, b) {
  const start = source.indexOf(a), end = source.indexOf(b, start);
  assert(start >= 0 && end > start, 'test extracts the candidate, not a reimplementation');
  return source.slice(start + a.length, end);
}
const hygiene = source.includes('// patch105: output hygiene BEGIN') ? block('// patch105: output hygiene BEGIN', '// patch105: output hygiene END') : '';
const moderation = source.includes('// patch106: moderation helpers BEGIN') ? block('// patch106: moderation helpers BEGIN', '// patch106: moderation helpers END') : '';
const quiet = source.includes('// patch110: quiet intent BEGIN') ? block('// patch110: quiet intent BEGIN', '// patch110: quiet intent END') : '';
const helpers = quiet + '\n' + moderation + '\n' + hygiene + '\n' + block('// patch102: file helpers BEGIN', '// patch102: file helpers END') + '\n' + ['quote', 'frame', 'dispatch'].map((kind) => block('// patch100: ' + kind + ' helpers BEGIN', '// patch100: ' + kind + ' helpers END')).join('\n');
// A candidate adds a real state dependency. Load that implementation too; only
// its filesystem boundary is virtual, as with the full-chain simulator.
const durability = source.includes('// candidate: durability BEGIN') ? block('// candidate: durability BEGIN', '// candidate: durability END') : '';
const pollStart = source.indexOf('  let 探针66 = 0');
const pollEnd = source.indexOf('  // ============================================================', pollStart);
const poll = source.slice(pollStart, pollEnd);
const lifecycle = source.slice(source.indexOf('  async function 跟进并记路由('), source.indexOf('  /** 手搓一条 user 消息'));
const events = source.slice(source.indexOf('  function 收到事件('), source.indexOf('  // ---------- 路由（将来'));
const nudges = source.slice(source.indexOf('  路线(`${路由前缀}/nudge`'), source.indexOf('  // patch20 戳一戳感知'));
const pokes = source.slice(source.indexOf('  const 上次戳 = new Map()'), source.indexOf('  // 手动试一发'));
const broadcast = source.includes('// patch135: broadcast intent BEGIN') ? block('// patch135: broadcast intent BEGIN', '// patch135: broadcast intent END') : '';
const parser = broadcast + '\n' + source.slice(source.indexOf('  function 解析主人指令('), source.indexOf('  function 读DEEPSEEK密钥('));

function runtime() {
  let now = Date.parse('2026-10-26T09:40:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } getHours() { return 17; } }
  const config = { 转群: true, 转私聊: false, 群号: '7', 她的QQ: 900, 私聊QQ: '100', 总开关: true, 目标会话: 'existing', NapCat: 'http://mock.invalid' };
  const calls = [], logs = [], lookups = [];
  const disk = new Map(), fds = new Map(); let fd = 10;
  const sandbox = {
    Date: Clock, Set, Map, JSON, Number, String, Array, Math, Promise, URL, TextDecoder, Buffer, AbortController, setTimeout, clearTimeout,
    待认领路由: new Map(), 轮路由: new Map(), 黄脸表: [], 已转消息: new Set(), 热聊: new Map(),
    上次群时间: now / 1000 - 600, 上次私聊时间: now / 1000 - 600, 拉败69: 0,
    读配置: () => config, 群静默中: () => false, 禁言中: () => false, existsSync: () => false,
    写心跳66: () => {}, 写水位文件: () => true, 群水位文件: 'group-wm', 私水位文件: 'private-wm',
    记账: (s) => logs.push(s), 带票52: (s) => s, 现场气氛: async () => [],
    console: { log: () => {} }, 解析主人指令: () => { throw new Error('quoted command was executed'); },
    执行群务106: () => { throw new Error('unexpected moderation'); },
    群轮有效110: () => true, 群收声中110: () => false, 忽略群成员110: () => false, 处理群收声110: () => false, 当前群序110: () => 0,
    routes: new Map(), 按轮输出: new Map(), 已发轮: new Set(), 路由前缀: '/bridge', 内部注入91: 0,
    读体: async req => req, 回: (res, value) => { res.value = value; return value; },
    路线: (name, handler) => { sandbox.routes.set(name, handler); }, 新id: (() => { let id = 0; return () => 'test-' + ++id; })(),
    提取正文: m => m.text || '', 提取图块: () => [], 落地一发: async (cfg, body, images, route) => { sandbox.delivered.push({ body, route }); }, delivered: [],
    目录: '/virtual', join: path.posix.join, createHash: require('node:crypto').createHash,
    readFileSync: p => { if (!disk.has(String(p))) throw new Error('virtual file absent'); return disk.get(String(p)); },
    writeFileSync: (p, text) => disk.set(fds.get(p) || String(p), String(text)),
    openSync: (p, mode) => { const id=++fd; fds.set(id,String(p)); if(mode==='w')disk.set(String(p),''); return id; },
    fsyncSync: () => {}, closeSync: id => fds.delete(id),
    renameSync: (a,b) => { disk.set(String(b),disk.get(String(a)));disk.delete(String(a)); },
  };
  if (durability) sandbox.existsSync = p => disk.has(String(p));
  let history = [], lookup = async () => { throw new Error('not found'); }, result = { ok: true }, onSend = null;
  sandbox.fetch = async (url, options) => {
    if (url.endsWith('/get_group_msg_history') || url.endsWith('/get_friend_msg_history')) return { ok: true, status: 200, json: async () => ({ status: 'ok', data: { messages: history } }) };
    assert(url.endsWith('/get_msg'));
    const id = JSON.parse(options.body).message_id;
    lookups.push(id);
    return lookup(id, options);
  };
  sandbox.限时转入 = async (text, images, mid, route, at, speaker, batch, files = []) => {
    calls.push({ text, images, mid, route, at, speaker, files });
    if (onSend) await onSend();
    if (result.ok) sandbox.待认领路由.set('call-' + calls.length, { 来路: route });
    return result;
  };
  vm.createContext(sandbox);
  vm.runInContext(durability + '\n' + helpers + '\n' + poll + '\n' + lifecycle + '\n' + events + '\n' + nudges + '\n' + pokes + '\n globalThis.api = {记99, 取引用99, 条转片段, 群消息指向99, 消息先后99, 加缓冲, 缓冲条目, 合成群批99, 退回缓冲, 冲缓冲, 轮询收消息, 缓聊, 消息记99, 有QQ待办100, 跟进并记路由, 收到认领, 收到事件, 收到丢弃};', sandbox);
  return { api: sandbox.api, config, sandbox, calls, logs, lookups, advance: (ms) => { now += ms; }, now: () => now, setHistory: (h) => { history = h; }, lookup: (fn) => { lookup = fn; }, result: (r) => { result = r; }, onSend: (fn) => { onSend = fn; }, clearBusy: () => { sandbox.待认领路由.clear(); sandbox.轮路由.clear(); } };
}
const text = (s) => ({ type: 'text', data: { text: s } });
const reply = (id) => ({ type: 'reply', data: { id } });
const at = (id) => ({ type: 'at', data: { qq: String(id) } });
const msg = (id, uid, body, seconds, extras = {}) => ({ message_id: id, user_id: uid, self_id: 900, time: seconds, message: body, sender: { nickname: uid === 900 ? '鲸戒' : '用户' + uid }, ...extras });
function add(r, uid, mid, body, signal, seconds) {
  r.api.加缓冲('g' + uid, { text: body, images: [], mid, route: 'group', at: signal ? uid : 0, speaker: uid, name: uid === 100 ? '主人' : '用户' + uid, time: seconds || r.now() / 1000 });
}
const checks = [];
async function test(name, fn) { await fn(); checks.push(name); process.stdout.write('PASS ' + name + '\n'); }

async function run() {
  await test('quote survives a later poll whose history no longer contains the original', async () => {
    const r = runtime(), t = r.now() / 1000;
    r.setHistory([msg(-1, 900, [text('有下厨的自己冒个头')], t - 60)]);
    await r.api.轮询收消息();
    r.setHistory([msg(-2, 100, [reply(-1), text('你觉得有吗')], t)]);
    await r.api.轮询收消息();
    assert.equal(r.api.缓聊.get('g100').at, 100, 'reply to bot starts conversation even without @');
    r.advance(6000); await r.api.轮询收消息();
    assert.equal(r.calls.length, 1);
    assert(r.calls[0].text.includes('有下厨的自己冒个头'));
    assert.equal(r.calls[0].mid, '-2'); assert.equal(r.calls[0].at, 100);
    assert.equal(r.lookups.length, 0);
  });
  await test('cold cache uses get_msg once and preserves segment text longer than 60 characters', async () => {
    const r = runtime(), body = '这是真实原话'.repeat(30);
    r.lookup(async (id) => ({ ok: true, json: async () => ({ status: 'ok', data: msg(Number(id), 900, [text(body)], 1, { group_id: 7 }) }) }));
    const input = msg(-4, 100, [reply(-3), text('我说的是这句')], 2);
    const decoded = await r.api.条转片段(input, 'g:7', r.config);
    assert(decoded.文字.includes(body)); assert.equal(decoded.引用.uid, '900');
    await r.api.条转片段(input, 'g:7', r.config);
    assert.equal(r.lookups.length, 1);
  });
  await test('cache separates private/group messages with the same message ID and supports aliases', async () => {
    const r = runtime();
    r.api.记99('g:7', msg(-5, 900, [text('群原话')], 1, { real_id: -6 }));
    r.api.记99('p:100', msg(-5, 100, [text('私聊原话')], 1));
    const a = await r.api.条转片段(msg(-7, 100, [reply(-6)], 2), 'g:7', r.config);
    const b = await r.api.条转片段(msg(-8, 100, [reply(-5)], 2), 'p:100', r.config);
    assert(a.文字.includes('群原话')); assert(!a.文字.includes('私聊原话'));
    assert(b.文字.includes('私聊原话')); assert(!b.文字.includes('群原话'));
  });
  await test('lookup failure stays honest, has short backoff, then can recover', async () => {
    const r = runtime(), input = msg(-9, 100, [reply(-10), text('这个呢')], 1);
    const failed = await r.api.条转片段(input, 'g:7', r.config);
    assert.equal(failed.引用.known, false); assert(failed.文字.includes('不要猜原文'));
    await r.api.条转片段(input, 'g:7', r.config); assert.equal(r.lookups.length, 1);
    r.advance(16000);
    r.lookup(async () => ({ ok: true, json: async () => ({ status: 'ok', data: msg(-10, 900, [text('补回来的原话')], 1) }) }));
    const recovered = await r.api.条转片段(input, 'g:7', r.config);
    assert(recovered.文字.includes('补回来的原话')); assert.equal(r.lookups.length, 2);
  });
  await test('mismatched lookup result does not fabricate a quote', async () => {
    const r = runtime();
    r.lookup(async () => ({ ok: true, json: async () => ({ status: 'ok', data: msg(-11, 900, [text('错误的原话')], 1, { group_id: 8 }) }) }));
    const a = await r.api.条转片段(msg(-12, 100, [reply(-11)], 1), 'g:7', r.config);
    assert.equal(a.引用.known, false); assert(!a.文字.includes('错误的原话'));
  });
  await test('reply to another member is not a direct request to the bot', async () => {
    const r = runtime();
    const known = { known: true, uid: '200' };
    assert.equal(r.api.群消息指向99(msg(-13, 100, [reply(-14)], 1), r.config, known).找我, false);
    assert.equal(r.api.群消息指向99(msg(-13, 100, [reply(-14), at(200)], 1), r.config, { known: true, uid: '900' }).找我, false);
    assert.equal(r.api.群消息指向99(msg(-13, 100, [reply(-14), at(900)], 1), r.config, known).找我, true);
  });
  await test('screenshot pattern binds owner question and treats noodle reply as background', async () => {
    const r = runtime(), t = r.now() / 1000;
    add(r, 100, '-20', '（引用鲸戒原话：有下厨的自己冒个头）你觉得有吗', true, t);
    add(r, 200, '-21', '我会煮泡面，这算下厨吗', false, t + 1);
    r.advance(7000); await r.api.冲缓冲(r.config);
    assert.equal(r.calls.length, 1); assert.equal(r.calls[0].mid, '-20'); assert.equal(r.calls[0].at, 100);
    assert(/【本轮对象·主人(?:\|[^】]+)?】/.test(r.calls[0].text));
    assert(/【背景·用户200(?:\|[^】]+)?】我会煮泡面/.test(r.calls[0].text));
    assert(r.calls[0].text.includes('不把别人的问题当成他的'));
  });
  await test('A1 B1 A2 retains original chronology instead of A1 A2 B1', async () => {
    const r = runtime(), t = r.now() / 1000;
    add(r, 100, '-30', 'A1', true, t); add(r, 200, '-31', 'B1', false, t + 1); add(r, 100, '-32', 'A2', false, t + 2);
    r.advance(8000); await r.api.冲缓冲(r.config);
    const p = r.calls[0]; assert(p.text.indexOf('A1') < p.text.indexOf('B1')); assert(p.text.indexOf('B1') < p.text.indexOf('A2'));
    assert.equal(p.mid, '-32', 'anchor actual later content, not the initial ping');
  });
  await test('two directly addressed people keep separate turns without losing the second', async () => {
    const r = runtime(), t = r.now() / 1000;
    add(r, 100, '-40', 'A的问题', true, t); add(r, 200, '-41', 'B的问题', true, t + 1);
    r.advance(7000); await r.api.冲缓冲(r.config);
    assert.equal(r.calls.length, 1); assert.equal(r.calls[0].at, 100); assert(r.api.缓聊.has('g200'));
    await r.api.冲缓冲(r.config); assert.equal(r.calls.length, 1, 'do not coalesce into occupied DSH turn');
    r.clearBusy(); await r.api.冲缓冲(r.config);
    assert.equal(r.calls.length, 2); assert.equal(r.calls[1].at, 200); assert.equal(r.calls[1].mid, '-41');
  });
  await test('multi-person unsolicited chat does not randomly quote the wrong speaker', async () => {
    const r = runtime(); add(r, 100, '-50', 'A闲话', false); add(r, 200, '-51', 'B闲话', false);
    r.advance(7000); await r.api.冲缓冲(r.config);
    assert.equal(r.calls[0].at, 0); assert.equal(r.calls[0].mid, '');
  });
  await test('failed delivery merges a new arrival without losing message order', async () => {
    const r = runtime(); add(r, 100, '-60', '旧问句', true); r.advance(7000);
    r.result({ ok: false }); r.onSend(async () => add(r, 100, '-61', '新补充', false));
    await r.api.冲缓冲(r.config);
    const b = r.api.缓聊.get('g100'); assert.equal(b.items.length, 2); assert.equal(b.items[0].mid, '-60'); assert.equal(b.items[1].mid, '-61');
  });
  await test('pure ping followed by image uses the image message as anchor', async () => {
    const r = runtime();
    r.api.加缓冲('g100', { text: '', images: [], mid: '-70', pingOnly: true, route: 'group', at: 100, speaker: 100, name: '主人' });
    r.api.加缓冲('g100', { text: '', images: [{ type: 'image', data: { file: 'mock-image' } }], mid: '-71', route: 'group', at: 0, speaker: 100, name: '主人' });
    r.advance(7000); await r.api.冲缓冲(r.config);
    assert.equal(r.calls[0].mid, '-71'); assert.equal(r.calls[0].images.length, 1);
  });
  await test('poll lock releases after an early disabled-state return', async () => {
    const r = runtime(); r.config.总开关 = false;
    await r.api.轮询收消息(); r.config.总开关 = true;
    r.setHistory([msg(-80, 100, [at(900), text('在吗')], r.now() / 1000)]);
    await r.api.轮询收消息(); assert(r.api.缓聊.has('g100'));
  });
  await test('cold quote lookups are bounded and deferred rows survive to the next poll', async () => {
    const r = runtime(), t = r.now() / 1000;
    const rows = [1, 2, 3].map((n) => msg(-100 - n, 100, [at(900), reply(-200 - n), text('问' + n)], t + n));
    r.lookup(async (id) => ({ ok: true, json: async () => ({ status: 'ok', data: msg(Number(id), 900, [text('旧话' + id)], 1, { group_id: 7 }) }) }));
    r.setHistory(rows); await r.api.轮询收消息();
    assert.equal(r.lookups.length, 2); assert.equal(r.api.缓聊.get('g100').items.length, 2);
    assert.equal(r.sandbox.已转消息.has(-103), false);
    await r.api.轮询收消息(); assert.equal(r.lookups.length, 3); assert.equal(r.api.缓聊.get('g100').items.length, 3);
  });
  await test('same-second history uses sequence order when API returned rows backwards', async () => {
    const r = runtime(), t = r.now() / 1000;
    const rows = [3, 2, 1].map((n) => msg(-300 - n, 100, [at(900), text('句' + n)], t, { message_seq: n }));
    r.setHistory(rows); await r.api.轮询收消息();
    assert.equal(r.api.缓聊.get('g100').items.map((x) => x.mid).join(','), '-301,-302,-303');
  });
  await test('private quote lookup rejects group content', async () => {
    const r = runtime();
    r.lookup(async () => ({ ok: true, json: async () => ({ status: 'ok', data: msg(-400, 900, [text('其他群的消息')], 1, { group_id: 8, message_type: 'group' }) }) }));
    const row = await r.api.条转片段(msg(-401, 100, [reply(-400)], 1), 'p:100', r.config);
    assert.equal(row.引用.known, false); assert(!row.文字.includes('其他群的消息'));
  });
  await test('quoting a command in private chat cannot execute the command', async () => {
    const r = runtime(), t = r.now() / 1000;
    r.config.转群 = false; r.config.转私聊 = true;
    r.setHistory([msg(-500, 900, [text('你刚才说的是查余额吗')], t - 1), msg(-501, 100, [reply(-500), text('查余额是举例')], t)]);
    await r.api.轮询收消息();
    assert(r.api.缓聊.get('p100').texts[0].includes('你刚才说的是查余额吗'));
  });
  await test('overlapping timer callbacks do not run a second poll during quote lookup', async () => {
    const r = runtime(), t = r.now() / 1000;
    let release; const wait = new Promise((resolve) => { release = resolve; });
    r.lookup(async (id) => { await wait; return { ok: true, json: async () => ({ status: 'ok', data: msg(Number(id), 900, [text('原话')], t - 1) }) }; });
    r.setHistory([msg(-600, 100, [at(900), reply(-601), text('在问这个')], t)]);
    const first = r.api.轮询收消息();
    await new Promise(setImmediate);
    await r.api.轮询收消息(); assert.equal(r.lookups.length, 1);
    release(); await first; assert.equal(r.api.缓聊.get('g100').items.length, 1);
  });
  await test('real claimed/end lifecycle releases serial queue and routes both people correctly', async () => {
    const r = runtime(); let turn = 0;
    const agent = { session: { id: 'existing' }, followup: async m => r.api.收到认领({ agent, message: m, turn: ++turn }) };
    r.sandbox.限时转入 = async (body, images, mid, kind, at, speaker) => {
      await r.api.跟进并记路由(agent, [{ type: 'text', text: body }], { 来路: kind, 艾特: at, 话: speaker, mid });
      return { ok: true };
    };
    add(r, 100, '-700', 'A问题', true); add(r, 200, '-701', 'B问题', true);
    r.advance(7000); await r.api.冲缓冲(r.config); assert.equal(r.sandbox.轮路由.size, 1);
    await r.api.冲缓冲(r.config); assert.equal(turn, 1);
    const finish = n => { r.api.收到事件({ id: 'existing' }, { type: 'assistant/message', data: { turn: n, message: { text: '答复' + n } } }); r.api.收到事件({ id: 'existing' }, { type: 'turn/end', data: { turn: n, reason: { kind: 'completed' } } }); };
    finish(1); assert.equal(r.sandbox.轮路由.size, 0);
    await r.api.冲缓冲(r.config); assert.equal(turn, 2); finish(2);
    assert.equal(r.sandbox.delivered.map(x => x.route.艾特).join(','), '100,200');
    assert.equal(r.sandbox.delivered.map(x => x.route.mid).join(','), '-700,-701');
  });
  await test('discarded and interrupted inbox messages release busy state', async () => {
    const r = runtime(), agent = { session: { id: 'existing' }, followup: async () => {} };
    const id = await r.api.跟进并记路由(agent, [], { 来路: 'group' });
    assert.equal(r.sandbox.待认领路由.size, 1);
    r.api.收到丢弃({ agent, message: { id } }); assert.equal(r.sandbox.待认领路由.size, 0);
    r.sandbox.轮路由.set(1, { 来路: 'group' });
    r.api.收到事件({ id: 'existing' }, { type: 'assistant/message', data: { turn: 1, interrupted: true } });
    assert.equal(r.sandbox.轮路由.size, 0);
  });
  await test('optional nudge cannot merge into an active or buffered human conversation', async () => {
    const r = runtime(); add(r, 100, '-710', '还在问', true);
    const response = {}; await r.sandbox.routes.get('/bridge/nudge')({ text: '主动冒泡', channel: 'none' }, response);
    assert.equal(response.value.skipped, true); assert.equal(r.sandbox.内部注入91, 0); assert.equal(r.calls.length, 0);
  });
  await test('poke joins buffer instead of injecting another DSH turn', async () => {
    const r = runtime(); r.sandbox.setTimeout = () => 0;
    r.sandbox.fetch = async () => ({ json: async () => ({ data: { nickname: '测试群友' } }) });
    const response = {}; await r.sandbox.routes.get('/bridge/poke')({ user_id: 100, group_id: 7 }, response);
    assert.equal(response.value.ok, true); assert(r.api.缓聊.has('g100')); assert.equal(r.calls.length, 0);
  });
  await test('stalled in-flight round emits a bounded diagnostic and retains the question', async () => {
    const r = runtime(); add(r, 100, '-720', '排队问题', true);
    r.sandbox.轮路由.set(1, { queuedAt: r.now() - 181000 });
    await r.api.冲缓冲(r.config); await r.api.冲缓冲(r.config);
    assert.equal(r.logs.filter(x => x.includes('等待超过180秒')).length, 1); assert(r.api.缓聊.has('g100'));
  });
  await test('warning status variants remain positive-only', async () => {
    const r = runtime(); vm.runInContext(parser + '\nglobalThis.parse100=解析主人指令;', r.sandbox);
    for (const phrase of ['余额预警开没开', '余额预警开着没', '预警是不是开着']) assert.equal(r.sandbox.parse100(phrase).cmd, '余额预警');
    for (const phrase of ['我不是问预警开没开', '别问余额预警开着没', '比如余额预警开没开', '我是说余额的问题']) assert.equal(r.sandbox.parse100(phrase), null);
    assert.equal(r.sandbox.parse100('查余额').cmd, '余额');
  });
  process.stdout.write('PASS_ALL ' + checks.length + '\n');
  if (process.env.WHALE_TEST_REPORT) fs.writeFileSync(process.env.WHALE_TEST_REPORT, JSON.stringify({ testedAt: new Date().toISOString(), candidateSHA256: require('node:crypto').createHash('sha256').update(source).digest('hex'), passed: checks, limits: ['No server or QQ calls; all OneBot responses mocked', 'No claim of LLM response quality or deployed fix'] }, null, 2));
}
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { runtime, text, reply, at, msg, source };
