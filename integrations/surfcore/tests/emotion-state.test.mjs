// 226：持续情绪 / 关系事件 / 主动求和的轻量回归。
// 纯函数 + 临时状态文件，不调模型、不发消息、不需要完整运行源。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createEmotionStore, classifyInteraction, decayIntensity, effectiveEmotion,
  eventAlive, EVENT_TTL_MS, EMOTIONS,
} from '../compat/emotion-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = Date.UTC(2026, 10, 9, 5, 0, 0);
const OWNER = '4700000001';
const OTHER = '4700000003';
const KEY = 'private:' + OWNER;
const MIN = 60_000;
const CRITICISM = '你又在那插嘴，说真的我跟你说了多少遍了，别再这样';

function makeStore(t, at = T, random = () => 0.5) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-emotion-'));
  const file = path.join(dir, 'emotion-relations.json');
  t.after(() => { try { fs.rmSync(dir, {recursive: true, force: true}); } catch {} });
  return {file, store: createEmotionStore({file, now: () => at, random})};
}
const observeCriticism = (store, opts = {}) => store.observe({
  userId: OWNER, key: KEY, isOwner: true, text: CRITICISM,
  displayName: '主人', recentSelf: ['杂鱼你懂什么'], at: T, ...opts,
});

// 1. 认真批评后不会立刻恢复挑衅
test('226: 认真批评后十分钟仍有情绪，挑衅称呼被暂时压住', (t) => {
  const {store} = makeStore(t);
  const res = observeCriticism(store);
  assert.equal(res.classification.kind, 'criticism');
  assert.equal(res.classification.blame, 'self');
  const s = store.snapshot(OWNER, T + 10 * MIN);
  assert.notEqual(s.emotion.label, '平静');
  assert(s.emotion.intensity > 0.5, '十分钟后委屈强度仍应超过一半');
  assert.equal(s.event.needsRepair, true);
  const block = store.promptBlock({userId: OWNER, key: KEY, isOwner: true, at: T + 10 * MIN});
  assert(block.includes('先别叫「杂鱼」'));
  assert(block.includes('少玩梗'));
  // 反复读取/定时器式轮询不得清空事件或重置起点
  for (let i = 0; i < 5; i++) store.pendingFor(KEY, T + 10 * MIN);
  assert.equal(store.raw().relations[OWNER].event.at, T);
  assert.equal(store.raw().relations[OWNER].event.needsRepair, true);
});

// 2. 玩笑式骂不过度求和
test('226: 开玩笑骂她不会造出争执事件，也不会求和', (t) => {
  const {store} = makeStore(t);
  const res = store.observe({
    userId: OWNER, key: KEY, isOwner: true, text: '哈哈哈杂鱼你又来了，笑死',
    recentSelf: ['杂鱼你懂什么'], at: T,
  });
  assert.equal(res.classification.kind, 'joke');
  assert.equal(store.snapshot(OWNER, T).event, null);
  assert.equal(store.promptBlock({userId: OWNER, key: KEY, isOwner: true, at: T}), '');
  const d = store.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at: T + 20 * MIN});
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'no-unresolved-event');
});

// 3. 确实说错话时可以主动承认
test('226: 自己说错话时求和方向是承认，而不是固定台词', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  const at = T + 20 * MIN;
  const d = store.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at});
  assert.equal(d.allowed, true, JSON.stringify(d));
  assert.equal(d.style, 'admit');
  const prompt = store.reconcilePrompt({userId: OWNER, style: d.style, at});
  assert(prompt.includes('自己承认'));
  assert(prompt.includes('不追问'));
  assert(!/别生气了|对不起，我错了|我以后一定/.test(prompt), '不得塞固定台词库');
});

// 4. 用户已原谅后不会重复道歉
test('226: 用户主动缓和后不再求和，提示里明确别再道歉', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  store.observe({userId: OWNER, key: KEY, isOwner: true, text: '算了，不生气了，翻篇', at: T + 2 * MIN});
  const s = store.snapshot(OWNER, T + 3 * MIN);
  assert.equal(s.event.userReconciled, true);
  assert.equal(s.event.needsRepair, false);
  assert(Number(s.event.acceptedAt) > 0);
  const d = store.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at: T + 20 * MIN});
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'already-reconciled');
  const block = store.promptBlock({userId: OWNER, key: KEY, isOwner: true, at: T + 3 * MIN});
  assert(block.includes('别再道歉'));
});

// 5. 求和发出后用户没回应，不连续追问
test('226: 每次争执最多求和一次，没回应不补发', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  const first = store.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at: T + 20 * MIN});
  assert.equal(first.allowed, true);
  assert.equal(store.noteReconcileSent(OWNER, KEY, T + 20 * MIN), true);
  const second = store.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at: T + 40 * MIN});
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'once-per-quarrel');
  assert.equal(store.raw().relations[OWNER].event.reconcileCount, 1);
  assert.equal(store.noteReconcileSent(OWNER, KEY, T + 41 * MIN), false); // 幂等，不新增
  assert.equal(store.raw().relations[OWNER].event.reconcileCount, 1);
});

// 6. 多个用户的关系状态不串线
test('226: 关系事件按 QQ 号分桶，群聊里也不会张冠李戴', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  store.observe({userId: OTHER, key: 'private:' + OTHER, isOwner: false, text: '今天天气不错啊', at: T});
  assert(store.snapshot(OWNER, T).event);
  assert.equal(store.snapshot(OTHER, T).event, null);
  assert.equal(store.promptBlock({userId: OTHER, key: 'private:' + OTHER, at: T}), '');
  assert.equal(store.reconcileCandidate({userId: OTHER, key: 'private:' + OTHER, at: T + 20 * MIN}).allowed, false);

  const {store: group} = makeStore(t);
  group.observe({userId: OWNER, key: 'group:456', isGroup: true, isOwner: true, text: CRITICISM, recentSelf: ['杂鱼'], at: T});
  group.observe({userId: OTHER, key: 'group:456', isGroup: true, text: '哈哈哈', at: T});
  assert.deepEqual(group.pendingFor('group:456', T).map(x => x.userId), [OWNER]);
  const d = group.reconcileCandidate({userId: OWNER, key: 'group:456', isGroup: true, isOwner: true, at: T + 20 * MIN});
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'avoid-public-scene');
});

// 7. 重启后未过期事件仍有效，过期后自然清除
test('226: 重启不丢短期情绪与关系事件，过期后自然清除', (t) => {
  const {file, store} = makeStore(t);
  observeCriticism(store);
  const T2 = T + 20 * MIN;
  const restarted = createEmotionStore({file, now: () => T2, random: () => 0.5});
  const s = restarted.snapshot(OWNER, T2);
  assert(s.event && s.event.needsRepair);
  assert(s.emotion.intensity > 0);
  assert.equal(s.event.at, T);
  assert.equal(restarted.reconcileCandidate({userId: OWNER, key: KEY, isOwner: true, at: T2}).allowed, true);
  const T3 = T + EVENT_TTL_MS + MIN;
  const late = createEmotionStore({file, now: () => T3, random: () => 0.5});
  assert.equal(late.snapshot(OWNER, T3).event, null);
  assert.equal(late.promptBlock({userId: OWNER, key: KEY, isOwner: true, at: T3}), '');
  assert.equal(eventAlive(late.raw().relations[OWNER].event, T3), false);
});

// 8. 普通自主发言不会覆盖重要情绪事件
test('226: 未解决争执压制随机调侃，但不过期阻塞', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  assert.equal(store.randomChatFactorForKey(KEY, T + 5 * MIN), 0.15);
  assert.equal(store.randomChatFactor(OWNER, T + 5 * MIN), 0.15);
  const late = T + EVENT_TTL_MS + MIN;
  assert.equal(store.randomChatFactorForKey(KEY, late), 1);
  assert.equal(store.snapshot(OWNER, late).event, null);
});

// 补充：交互分类必须区分玩笑 / 吐槽 / 认真批评 / 争执 / 恶意攻击
test('226: 分类区分玩笑、吐槽、认真批评、争执与恶意攻击', () => {
  assert.equal(classifyInteraction('哈哈哈杂鱼你又来了，笑死').kind, 'joke');
  assert.equal(classifyInteraction('你够了啊', {closeness: 0.9}).kind, 'tease');
  assert.equal(classifyInteraction(CRITICISM, {recentSelf: ['杂鱼']}).kind, 'criticism');
  assert.equal(classifyInteraction('你又来了，说真的够了', {recentNegative: 2, closeness: 0.9}).kind, 'quarrel');
  const attack = classifyInteraction('去死吧你', {closeness: 0.1});
  assert.equal(attack.kind, 'attack');
  assert.equal(attack.blame, 'other');
  assert.equal(classifyInteraction('别说话了，我要睡了').kind, 'silence');
  assert.equal(classifyInteraction('厉害啊，这个好玩').kind, 'praise');
  assert.equal(classifyInteraction('没事了，和好吧').kind, 'forgive');
  assert.equal(EMOTIONS.length, 9);
  assert(EMOTIONS.includes('想和好') && EMOTIONS.includes('委屈'));
});

// 补充：衰减单调、不清零、不因定时器重置
test('226: 情绪按绝对时间衰减，定时器触发不清空', () => {
  const e = {label: '委屈', intensity: 0.9, since: T};
  const a = decayIntensity(e, T + 10 * MIN), b = decayIntensity(e, T + 60 * MIN);
  assert(a > b && b > 0, '十分钟后不应清零，也不应比一小时前更强');
  assert.equal(effectiveEmotion(e, T + 10 * MIN).label, '委屈');
  assert.equal(effectiveEmotion(e, T + 12 * 60 * MIN).label, '平静');
  assert.equal(decayIntensity({label: '平静', intensity: 1, since: T}, T), 0);
});

// 补充：七项触发条件逐项生效
test('226: 静默、时机、熟悉度、时间窗与场景边界都拦得住', (t) => {
  const {store} = makeStore(t);
  observeCriticism(store);
  const at = T + 20 * MIN;
  const base = {userId: OWNER, key: KEY, isOwner: true, at};
  const reason = (extra) => store.reconcileCandidate({...base, ...extra}).reason;
  assert.equal(reason({quiet: true}), 'not-a-good-moment');
  assert.equal(reason({paused: true}), 'not-a-good-moment');
  assert.equal(reason({busy: true}), 'not-a-good-moment');
  assert.equal(reason({night: true}), 'not-a-good-moment');
  assert.equal(reason({closureCooldown: true}), 'not-a-good-moment');
  assert.equal(reason({lastIncomingAt: at - 1000}), 'just-talked');
  assert.equal(reason({lastAiReplyAt: at - 1000}), 'spoke-recently');
  const {store: stranger} = makeStore(t);
  stranger.observe({userId: OTHER, key: 'private:' + OTHER, isOwner: false, text: CRITICISM, recentSelf: ['杂鱼'], at: T});
  assert.equal(stranger.reconcileCandidate({userId: OTHER, key: 'private:' + OTHER, at}).reason, 'not-close-enough');
  assert.equal(store.reconcileCandidate({...base, key: 'private:' + OTHER}).reason, 'no-cross-scene');
  assert.equal(store.reconcileCandidate({...base, at: T + 2 * MIN}).reason, 'too-soon');
  assert.equal(store.reconcileCandidate({...base, at: T + 4 * 60 * MIN}).reason, 'too-late');
  // 明确要求安静后，在有效期内不主动联系
  const {store: quietStore} = makeStore(t);
  observeCriticism(quietStore);
  quietStore.observe({userId: OWNER, key: KEY, isOwner: true, text: '别说话了，我想静静', at: T + MIN});
  assert.equal(quietStore.reconcileCandidate({...base, at}).reason, 'asked-for-quiet');
});

// 补充：bridge.js 确实把状态与调度器接上了（不是只写了模块）
test('226: bridge.js 挂接了入站观察、注入、求和候选与抑制', () => {
  const bridge = fs.readFileSync(path.join(ROOT, 'live-mirror/src/bridge.js'), 'utf8');
  assert(bridge.includes("import {createEmotionStore} from '../whale-compat/emotion-state.mjs'"));
  assert(bridge.includes('emotion().observe('));
  assert(bridge.includes('+ antiAiLine + emotionLine + proactiveLine +'));
  assert(bridge.includes("reason === 'reconcile'"));
  assert(bridge.includes("['proactiveCheck', 'reconcile', 'timeout'"));
  assert(bridge.includes('store.pendingFor(key, atEmotion)'));
  assert(bridge.includes('store.noteReconcileSent('));
  assert(bridge.includes('reconcileHandled'));
  assert(bridge.includes('randomChatFactorForKey'));
  assert(bridge.includes("sendWakePromptV2(key, 'reconcile', {emotionStyle: decision.style})"));
  const version = fs.readFileSync(path.join(ROOT, 'version.mjs'), 'utf8');
  assert(version.includes('OVERLAY_PATCH = 226'));
});
