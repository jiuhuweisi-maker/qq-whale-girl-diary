// 225：11-09 深夜私信教训下沉到底层 + 限流叙事隔离。
// 全部是静态/纯函数断言，不连生产、不调模型、不发消息。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OWNER_RULES_CORE, EXPRESSION_CORE} from '../compat/expression-style.mjs';
import {
  stripInternalState, stripObjectStrings, publicSendLimitResult, isOwnerPrivateKey
} from '../compat/internal-state.mjs';
import {OVERLAY_PATCH} from '../version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bridge = () => read('live-mirror/src/bridge.js');
const preset = () => read('live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml');

// 224 交付时的运行时长度（含 COMMENT_BANTER_CORE 展开）：3484 / 1788。
const BASELINE = {rules: 3484, expression: 1788};

test('225: overlay patch does not regress', () => {
  assert(OVERLAY_PATCH >= 225, '225 的修复必须保留在后续 patch 之上');
});

test('225: all eight private-chat lessons are in the code-level rules, not a memory card', () => {
  const lessons = [
    '没人点名就不凑', '别插嘴', '别连回一串', '不突然晚安',
    '简单回答', '不找理由', '不补解释和检讨',
    '委屈、伤心、想哭', '别嘴硬', '别找补',
    '道歉要有诚意', '怕就找怕的图',
    '听得出他在问什么', '别拿表情包或套话应付',
    '不写保证书', '不许有下次',
  ];
  for (const phrase of lessons) assert(OWNER_RULES_CORE.includes(phrase), 'rules: ' + phrase);
  // 表达底色里也有，不靠记忆卡重渲染。
  for (const phrase of ['没人点名就不凑', '简单回答', '不给自己找理由', '先伤心、想哭', '别拿套话或表情包应付', '说了改就是真改']) {
    assert(EXPRESSION_CORE.includes(phrase), 'expression: ' + phrase);
  }
});

test('225: subtraction, not an extra tenth section', () => {
  const sections = OWNER_RULES_CORE.match(/^[一二三四五六七八九十]+、/gm) || [];
  assert.equal(sections.length, 9);
  assert(!OWNER_RULES_CORE.includes('十、'));
  assert(OWNER_RULES_CORE.includes('日常分寸'), 'lessons merged into an unnumbered block');
  assert(OWNER_RULES_CORE.length < BASELINE.rules, 'rules grew: ' + OWNER_RULES_CORE.length);
  assert(EXPRESSION_CORE.length < BASELINE.expression, 'expression grew: ' + EXPRESSION_CORE.length);
  // 224 的例子、219 的场景称呼、222/223 的服务端口径都还在。
  for (const phrase of ['ciallo～', '压力马斯内', '狗修金撒嘛', '对主人的称呼按场景来',
                        '服务端一律按', '九、评论区不是解说席']) {
    assert(OWNER_RULES_CORE.includes(phrase), phrase);
  }
});

test('225: internal state is stripped sentence-by-sentence and normal chat survives', () => {
  const r = stripInternalState('今晚聊得开心。被每小时60条上限挡住了，约01:55恢复。下次接着聊游戏');
  assert.equal(r.removed, true);
  assert.equal(r.text, '今晚聊得开心。下次接着聊游戏');
  assert.equal(r.hits.length, 1);
  for (const phrase of ['限流', '额度', '冷却', '429', '发不出去', '唤醒', '潜水', '会话权限', '工具报错']) {
    const one = stripInternalState('好好聊。' + phrase + '状态别写。继续');
    assert(one.removed, phrase);
    assert(!one.text.includes(phrase + '状态'), phrase);
  }
  const clean = stripInternalState('主人发了两张图，我顺着接了梗，他说good');
  assert.equal(clean.removed, false);
  assert.equal(clean.text, '主人发了两张图，我顺着接了梗，他说good');
  assert.equal(stripInternalState('').text, '');
  assert.equal(stripInternalState(null).text, '');
  assert.equal(stripInternalState(123).removed, false);
});

test('225: object-shaped memory extras get the same filter', () => {
  const r = stripObjectStrings({target: '主人', pendingQuestion: '被限流了还要重试吗', list: ['正常', '约01:55恢复']});
  assert.equal(r.target, '主人');
  assert.equal(r.pendingQuestion, '');
  assert.deepEqual(r.list, ['正常', '']);
});

test('225: the 429 handed to the model carries no settings, counters or recovery time', () => {
  const body = publicSendLimitResult();
  const s = JSON.stringify(body);
  for (const stale of ['60', 'maxSendPer', 'retryAfterMs', 'setting', 'hint', 'path', '上限', '冷却', '恢复', '额度']) {
    assert(!s.includes(stale), stale);
  }
  assert.equal(body.ok, false);
  assert(body.error.length < 30);
});

test('225: only the owner private conversation is exempt from the send cap', () => {
  assert(isOwnerPrivateKey('private:4700000001', '4700000001'));
  assert(!isOwnerPrivateKey('group:4700000002', '4700000001'));
  assert(!isOwnerPrivateKey('private:999', '4700000001'));
  assert(!isOwnerPrivateKey('private:4700000001', ''));
});

test('225: the bridge exempts the owner, de-identifies 429 and filters all four write-back channels', () => {
  const b = bridge();
  assert(b.includes("import {stripInternalState,stripObjectStrings,publicSendLimitResult,isOwnerPrivateKey}"));
  assert(b.includes('if (isOwnerPrivateKey(key, cfg.ownerQQ)) return null;'));
  assert.equal((b.match(/sendJson\(publicSendLimitResult\(\), 429\)/g) || []).length, 4);
  assert(!b.includes('sendJson(rateLimit, 429)'));
  assert(b.includes('发送频率超限|SEND_RATE_LIMIT'), 'limit must not count as a channel fault');
  assert(b.includes('summary: stripInternalState(') && b.includes('nextOpening: stripInternalState('));
  assert(b.includes('cleanedMessage = stripInternalState('));
  assert(b.includes('cleanedContent = stripInternalState('));
  assert(b.includes('stripObjectStrings(body.extra'));
  assert(b.includes('stripObjectStrings(body.newExtra'));
  assert(!b.includes('达到发送频率上限，剩下的没发'));
});

test('225: the preset lost its proactive-interruption engine, not the tool contract', () => {
  const p = preset();
  for (const stale of ['【主动开话题（冷场', '【学习群友策略】', '没被叫但有话题也主动参与', '可以插一句有趣的/相关的']) {
    assert(!p.includes(stale), stale);
  }
  for (const phrase of ['没人点名就不凑', '没点名不凑', '简单回答', '想哭', '不许有下次', '收尾字段只写聊天']) {
    assert(p.includes(phrase), phrase);
  }
  assert(p.includes('19. 【说话底色·224】'), '224 wording preserved');
  assert(p.includes("name: '@deepseek-ai/dsh-compaction-basic'"));
  assert(p.includes('qq_send_sticker(stickerId="#03")'));
  assert(p.includes('prefix: >-'));
  assert(p.length < 25000, 'preset should be materially shorter than 28521 bytes');
});
