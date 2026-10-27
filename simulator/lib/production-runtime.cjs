const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { SimClock } = require('./clock.cjs');
const DEFAULT_SOURCE = path.resolve(__dirname, '../../bridge/host.js');
const ID = { A: 1001, B: 1002, C: 1003, W: 1004 };
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
let runtimeSerial = 0;
function createRuntime({ sourcePath = DEFAULT_SOURCE, style = '', names = { A: '主人', B: '小岚', C: '阿澄', W: '鲸鱼娘' }, clock = new SimClock(), disk = new Map(), sendBehavior, fsFault, autoClaim = true, receiptProbe } = {}) {
  const source = fs.readFileSync(sourcePath, 'utf8'), writes = [], requests = [], deliveries = [], attempts = [], admitted = [], logs = [], modelInbox = [], blocked = [];
  const routes = new Map(), listeners = new Map(), history = [], imageInfo = new Map(); let turn = 0, attachmentId = 0, uuid = 0;
  const config = { 她的QQ: ID.W, 总开关: true, 试运行: false, 目标会话: 'offline-only', 私聊QQ: String(ID.A), 群号: '7001', 转私聊: true, 转群: true, NapCat: 'https://onebot.invalid', 收图: true, 收图最多: 4, 发图: true, 图上限MB: 5, 称呼: '群友', 图片根目录: '/offline/stickers' };
  disk.set('/offline/.dsh/qq-bridge-config.json', Buffer.from(JSON.stringify(config)));
  disk.set('/root/dsh-workspace/CHAT-STYLE.md', Buffer.from(style));
  disk.set('/offline/.dsh/qq-bridge-audit-key', Buffer.from('offline-test-'.repeat(5)));
  const descriptors = new Map(); let fdSerial = 10; const processSerial = ++runtimeSerial;
  const fault = (operation, file, data) => { if (fsFault) fsFault(operation, String(file), data); };
  const vfs = {
    readFileSync(file, encoding) { const key = String(file); if (key.endsWith('/package.json')) return JSON.stringify({ version: 'offline-production-snapshot' }); if (!disk.has(key)) throw Object.assign(new Error('virtual file absent'), { code: 'ENOENT' }); const b = Buffer.from(disk.get(key)); return encoding ? b.toString(typeof encoding === 'string' ? encoding : encoding.encoding) : b; },
    writeFileSync(file, data) { const key = descriptors.get(file) || String(file); fault('write', key, data); disk.set(key, Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(String(data))); writes.push(key); },
    openSync(file, mode) { fault('open', file); const fd = ++fdSerial; descriptors.set(fd, String(file)); if (mode === 'w') disk.set(String(file), Buffer.alloc(0)); return fd; },
    closeSync(fd) { fault('close', descriptors.get(fd)); descriptors.delete(fd); },
    fsyncSync(fd) { fault('fsync', descriptors.get(fd)); },
    renameSync(from, to) { fault('rename', to); if (!disk.has(String(from))) throw new Error('virtual rename source absent'); disk.set(String(to), disk.get(String(from))); disk.delete(String(from)); },
    mkdirSync() {}, existsSync(file) { return disk.has(String(file)); },
  };
  const emit = (event, ...args) => { for (const fn of listeners.get(event) || []) fn(...args); };
  const agent = { session: { id: config.目标会话 }, async followup(message) { const current = ++turn; modelInbox.push({ turn: current, message: structuredClone(message), capturedAt: clock.now }); if (autoClaim) emit('agent/inbox/claimed', { agent, message, turn: current }); } };
  const ctx = {
    ...(receiptProbe ? { qqDeliveryReceipts: { probe: receiptProbe } } : {}),
    logger: { info: message => logs.push({ at: clock.now, message: String(message) }) },
    effect(fn) { fn(); return () => {}; }, interval() { return () => {}; },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); return () => {}; },
    webServer: { register({ path: route, handler }) { routes.set(route, handler); return () => {}; } },
    agents: { get: id => id === config.目标会话 ? agent : undefined },
    sessions: { flush: async () => {}, list: async () => [] }, sessionTitle: {}, workspaceRegistry: { archivedSessionIds: [], workspaces: [] },
    attachments: {
      async admitPromptContent(parts) { return parts.map(p => {
        if (p.type !== 'image') return p;
        const info = imageInfo.get(hash(Buffer.from(p.data, 'base64'))) || { id: 'unmapped-image', description: '图片未映射' };
        const attachment = { attachmentId: 'sim-image-' + ++attachmentId, width: 1, height: 1, name: p.name };
        admitted.push({ ...info, attachmentId: attachment.attachmentId, at: clock.now }); return { type: 'image', attachment };
      }); },
      imageHostPath() { return ''; }, async saveFile(input) { return { attachmentId: 'sim-file-' + ++attachmentId, name: input.name, bytes: input.data.length }; },
    }, get(name) { return this[name]; },
  };
  async function mockedFetch(url, options = {}) {
    const u = new URL(url), action = u.pathname.split('/').at(-1), body = options.body ? JSON.parse(options.body) : {};
    requests.push({ at: clock.now, origin: u.origin, action, body: structuredClone(body) });
    if (u.hostname === 'multimedia.nt.qq.com.cn' && u.pathname.startsWith('/sim/')) {
      const pic = [...imageInfo.values()].find(i => u.pathname === '/sim/' + i.id);
      if (!pic) throw new Error('missing fixture image'); return new Response(pic.bytes, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (u.origin !== 'https://onebot.invalid') { blocked.push({ origin: u.origin, action }); throw new Error('OFFLINE_BOUNDARY_DENIED'); }
    const ok = data => new Response(JSON.stringify({ status: 'ok', retcode: 0, data }), { status: 200 });
    if (action === 'get_group_msg_history' || action === 'get_friend_msg_history') return ok({ messages: history.filter(m => m.time * 1000 <= clock.now && (action === 'get_group_msg_history' ? m.message_type === 'group' : m.message_type === 'private')).slice(-Number(body.count || 30)) });
    if (action === 'get_msg') {
      const row = [...history].reverse().find(m => String(m.message_id) === String(body.message_id));
      return row && !row.recalled ? ok(row) : new Response(JSON.stringify({ status: 'failed', retcode: 100, message: 'recalled_or_missing' }));
    }
    if (action === 'send_group_msg' || action === 'send_private_msg') {
      const attempt = { at: clock.now, action, body: structuredClone(body) }; attempts.push(attempt);
      const behavior = sendBehavior ? await sendBehavior(attempt, attempts.length) : 'success';
      if (behavior === 'received_then_timeout') { deliveries.push(attempt); throw Object.assign(new Error('simulated send timeout'), { name: 'TimeoutError' }); }
      if (behavior === 'rejected') return new Response(JSON.stringify({ status: 'failed', retcode: 100, message: 'simulated_rejection' }));
      if (behavior === 'malformed') return new Response(JSON.stringify({ message: 'proxy lost upstream acknowledgement' }), { status: 502 });
      deliveries.push(attempt); return ok({ message_id: 8000 + deliveries.length });
    }
    if (action === 'get_login_info') return ok({ user_id: ID.W, nickname: names.W });
    if (['get_group_member_list', 'get_friend_list'].includes(action)) return ok([]);
    if (['group_poke', 'friend_poke'].includes(action)) return ok({});
    blocked.push({ action }); throw new Error('OFFLINE_ACTION_DENIED:' + action);
  }
  const imported = [...source.matchAll(/^import .* from ['"]([^'"]+)['"]\r?$/gm)].map(m => m[1]);
  const expectedImports = ['node:fs', 'node:os', 'node:path', 'node:url', 'node:crypto', './selfupdate.mjs'];
  if (imported.length !== expectedImports.length || imported.some(x => !expectedImports.includes(x))) throw new Error('production imports changed; review offline boundaries');
  const anchor = 'return { 记账, 概况, 落地一发, 发到QQ, 收到事件, 日志 }';
  if (source.split(anchor).length !== 2) throw new Error('production instrumentation anchor changed');
  const instrumented = source.replace(/^import .* from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export\s+/gm, '').replaceAll('import.meta.url', "'file:///offline/bridge/host.js'").replace(anchor, `return { 记账, 概况, 落地一发, 发到QQ, 收到事件, 日志, __test: { 条转片段, 记99, 合成群批99, 加缓冲, 冲缓冲, 轮询收消息, 转入一条, 收到认领, 收到丢弃, 缓聊, 待认领路由, 轮路由, 已转消息, 解析主人指令, 本轮聊天动作105: typeof 本轮聊天动作105 === 'function' ? 本轮聊天动作105 : null } }`);
  let randomState = 12345;
  const randomMath = Object.create(Math); randomMath.random = () => { randomState = randomState * 16807 % 2_147_483_647; return (randomState - 1) / 2_147_483_646; };
  const sandbox = { ...vfs, console: { log: x => logs.push({ at: clock.now, message: String(x) }) }, Buffer, URL, TextDecoder, AbortController, AbortSignal, Response, Headers, Map, Set, Math: randomMath, Date: clock.dateClass(),
    setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock), fetch: mockedFetch, homedir: () => '/offline', join: path.posix.join, dirname: path.posix.dirname, fileURLToPath: value => new URL(value).pathname,
    randomUUID: () => 'offline-' + processSerial + '-' + ++uuid, createHash: crypto.createHash, timingSafeEqual: crypto.timingSafeEqual, createSelfUpdate: () => ({ register() {} }), process: { env: { DSH_HOME: '/offline/.dsh' } }, __ctx: ctx };
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(instrumented + '\nglobalThis.__bridge = apply(__ctx);', sandbox, { timeout: 5000 });
  const bridge = sandbox.__bridge;
  function add(row) {
    const segments = [];
    if (row.replyTo != null) segments.push({ type: 'reply', data: { id: String(row.replyTo) } });
    for (const role of row.at || []) segments.push({ type: 'at', data: { qq: String(ID[role] || role) } });
    if (row.text) segments.push({ type: 'text', data: { text: row.text } });
    for (const picture of row.images || []) {
      const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(picture.id)]);
      imageInfo.set(hash(bytes), { ...picture, bytes, sourceMessageId: row.id, sender: row.sender });
      segments.push({ type: 'image', data: { url: 'https://multimedia.nt.qq.com.cn/sim/' + picture.id, file: picture.id } });
    }
    const m = { message_id: row.id, real_id: row.id, message_seq: history.length + 1, user_id: ID[row.sender], self_id: ID.W, time: row.time / 1000, group_id: row.channel === 'private' ? undefined : 7001, message_type: row.channel || 'group', sender: { user_id: ID[row.sender], nickname: row.name || names[row.sender] }, message: segments, recalled: !!row.recalled };
    history.push(m); return m;
  }
  async function finish(inbox, output, { duplicate = false } = {}) {
    emit('session/event', agent.session, { type: 'assistant/message', data: { turn: inbox.turn, message: { content: [{ type: 'text', text: output }] } } });
    const event = { type: 'turn/end', data: { turn: inbox.turn, reason: { kind: 'completed' } } };
    emit('session/event', agent.session, event); if (duplicate) emit('session/event', agent.session, event);
    await clock.drain();
  }
  function modelText(inbox) {
    return inbox.message.content.map(p => p.type === 'text' ? p.text : p.type === 'image' ? (() => { const i = admitted.find(x => x.attachmentId === p.attachment.attachmentId); return '【受控图片说明，模拟视觉输入】' + JSON.stringify(i ? { imageId: i.id, sourceMessageId: i.sourceMessageId, sender: i.sender, description: i.description } : { unavailable: true }); })() : '【文件附件】' + JSON.stringify(p.attachment)).join('\n');
  }
  async function requestRoute(route, body, headers = {}) { const req = { headers, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }; let response; const res = { setHeader() {}, end(value) { response = JSON.parse(value); } }; const handler = routes.get('/dsh-qq-bridge/' + route); if (!handler) throw new Error('offline route unavailable: ' + route); await clock.settle(handler(req, res)); return response; }
  return { bridge, hooks: bridge.__test, sourceSHA256: hash(source), config, disk, clock, writes, requests, deliveries, attempts, admitted, logs, modelInbox, blocked, add, finish, modelText, requestRoute, emit, agent, names,
    setConfig(patch) { Object.assign(config, patch); disk.set('/offline/.dsh/qq-bridge-config.json', Buffer.from(JSON.stringify(config))); },
    assertIsolated() { if (blocked.length) throw new Error('unexpected production side effect: ' + JSON.stringify(blocked)); },
  };
}
module.exports = { createRuntime, ID, DEFAULT_SOURCE };
