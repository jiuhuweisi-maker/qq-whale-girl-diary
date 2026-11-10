import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneSwitchPrompt} from '../compat/scene-switch.mjs';
import {OWNER_RULES_CORE} from '../compat/expression-style.mjs';
import {OVERLAY_PATCH} from '../version.mjs';
import {
  writeOwnerAtReceipt, readOwnerAtReceipt, ownerAtReceiptBlock, ownerAtReceiptFile,
} from '../compat/owner-at-receipt.mjs';

const BV = 'BV1ab2cd3ef4';
const RPID = '219876543210';
const root = new URL('../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8');

// 221（2026-11-08 主人令）：她在私信里主动提起一个想分享的视频，就该同一轮
// 去评论区 @ 主人，不用等主人开口叫。这条要落进每轮都注入的三处口径里。
test('proactive video sharing is now an instruction, not an opt-in by the owner', () => {
  for (const phrase of [
    '同一轮就用 qq_switch_scene', '不用等他开口叫', 'atOwner=true',
    '真去那条视频评论区发一条 @ 主人的分享型评论',
    '只在主人私信里这么做', '同一条视频不重复去', '不评价那边的成败、不播报、不连环',
  ]) assert(OWNER_RULES_CORE.includes(phrase), phrase);
  // 220 的老口径「等主人叫才去」不能作为触发条件留在规则里。
  assert(!OWNER_RULES_CORE.includes('就真去那条视频的评论区 @ 他，一次到位'));
});

test('tool guide, MCP description and agent preset all say "do not wait to be asked"', () => {
  assert(read('compat/TOOL-GUIDE.md').includes('不用等他开口叫'));
  const mcp = read('live-mirror/src/mcp-snowluma-safe.js');
  assert((mcp.match(/不用等他开口叫/g) || []).length >= 2, '工具描述与参数 describe 都要写');
  assert(!mcp.includes('主人在私信当场叫你去这条视频评论区 @ 他时才传 true'));
  assert(read('live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml').includes('不用等他开口叫'));
});

test('Bili scene prompt covers both owner-asked and self-initiated sharing', () => {
  const text = sceneSwitchPrompt('bili', BV, {intent: 'speak', atOwner: true});
  assert(text.includes('这条视频是要 @ 他来看的'));
  assert(text.includes('也可能是你在私信里自己想分享给他的'));
  assert(text.includes('--share --auto --owner-ok'));
  assert(text.includes(`--bvid ${BV}`));
  assert(text.includes('@ 他'));
  assert(!text.includes('主人刚才在 QQ 当场叫你去'));
});

test('bridge still gates atOwner to the owner private chat, but no longer requires the owner to ask', () => {
  const bridge = read('live-mirror/src/bridge.js');
  // 222 起服务端会自动判定，但显式 atOwner 仍必须是严格布尔、来源仍受校验。
  assert(/const ownerAt = atOwner === true/.test(bridge));
  assert(bridge.includes('source !== owner'));
  assert(!bridge.includes('只有主人私信里当场叫你去这条视频底下 @ 他时，才能带 atOwner'));
  assert(bridge.includes('但不要求主人开口叫'));
  // 事实块只在被问起时注入，且不进 personaOnly 那条早返回。
  assert(bridge.includes('const ownerAtFact = ownerAtReceiptBlock(recentForFact)'));
  assert(bridge.includes('biliBrief, ownerAtFact, memoryBlock'));
  assert(bridge.includes("import {ownerAtReceiptBlock} from '../whale-compat/owner-at-receipt.mjs'"));
});

test('a successful owner share writes one quiet local fact, and never enters the notify path', () => {
  const src = read('live-mirror/plugins/surfcore/tools/commands/comment.mjs');
  assert(src.includes("import {writeOwnerAtReceipt} from '../../../../whale-compat/owner-at-receipt.mjs'"));
  assert(src.includes('if (OWNER_OK) {'));
  assert(src.includes('writeOwnerAtReceipt({bvid, rpid, aid: String(oid ?? \'\')})'));
  assert(src.includes('if ((AUTO || SHARE) && !OWNER_OK) {'));
  // 220 的安全轨一条都不能少。
  for (const rail of ['OWNER_OK && !(SHARE && AUTO)', 'reason.length < 8', 'reserveOwnerMention', '--dry']) {
    assert(src.includes(rail), rail);
  }
});

test('receipt writes only for a real BV + rpid, atomically and 600', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-221-'));
  try {
    const file = path.join(home, 'owner-at-receipt.json');
    assert.equal(writeOwnerAtReceipt({bvid: 'not-a-bv', rpid: RPID, file}), false);
    assert.equal(writeOwnerAtReceipt({bvid: BV, rpid: '', file}), false);
    assert.equal(fs.existsSync(file), false);
    assert.equal(writeOwnerAtReceipt({bvid: BV, rpid: RPID, aid: '12345', file}), true);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const got = readOwnerAtReceipt(file);
    assert.equal(got.bvid, BV);
    assert.equal(got.rpid, RPID);
    assert.equal(got.aid, '12345');
    assert(got.url.includes(`/video/${BV}/#reply${RPID}`));
    assert.equal(fs.readdirSync(home).length, 1, '原子写不能留下 tmp 文件');
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('receipt expires after 7 days and tolerates corrupt files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-221-exp-'));
  try {
    const file = path.join(home, 'owner-at-receipt.json');
    writeOwnerAtReceipt({bvid: BV, rpid: RPID, at: '2026-10-01T12:00:00Z', file});
    assert.equal(readOwnerAtReceipt(file, {now: Date.parse('2026-11-08T12:00:00Z')}), null);
    fs.writeFileSync(file, '{broken');
    assert.equal(readOwnerAtReceipt(file), null);
    assert.equal(ownerAtReceiptBlock('@了没', {file}), '');
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('the fact block is silent in normal chat and appears only when the owner asks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-221-block-'));
  try {
    const file = path.join(home, 'owner-at-receipt.json');
    writeOwnerAtReceipt({bvid: BV, rpid: RPID, file});
    for (const normal of ['今天吃啥', '这只猫好肥', 'B站刷到个整活', '']) {
      assert.equal(ownerAtReceiptBlock(normal, {file}), '', normal);
    }
    for (const asking of ['@了没', '那条评论发出去没', '刚那条 @ 我了吗', '是不是又没成']) {
      const block = ownerAtReceiptBlock(asking, {file});
      assert(block.includes('【跨端事实'), asking);
      assert(block.includes(BV), asking);
      assert(block.includes('#reply' + RPID), asking);
      assert(block.includes('别主动提'), asking);
      assert(block.includes('不要为它再跑去发一次'), asking);
    }
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('receipt path is derived independently of any private state-paths module', () => {
  assert(ownerAtReceiptFile('/tmp/home-a').endsWith('.dsh/surfcore/owner-at-receipt.json') ||
         ownerAtReceiptFile('/tmp/home-a').endsWith('.dsh\\surfcore\\owner-at-receipt.json'));
  assert.notEqual(ownerAtReceiptFile('/tmp/home-a'), ownerAtReceiptFile('/tmp/home-b'));
});

test('overlay patch moves forward from 221', () => {
  assert(OVERLAY_PATCH >= 221);
});
