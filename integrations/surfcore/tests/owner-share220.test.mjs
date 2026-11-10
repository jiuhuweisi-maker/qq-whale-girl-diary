import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sceneSwitchPrompt, sceneOfferFile, claimBiliSceneOffer,
} from '../compat/scene-switch.mjs';
import {OWNER_RULES_CORE} from '../compat/expression-style.mjs';
import {strategyLine, loadStrategies} from '../compat/language-strategies.mjs';

const BV = 'BV1ab2cd3ef4';

// 220 (2026-11-08): a plain intent=speak used to send her to chat with strangers,
// even when the owner had just asked her to @ him under that exact video.
test('an owner-requested @ produces a real share comment instead of a generic chat', () => {
  const text = sceneSwitchPrompt('bili', BV, {intent: 'speak', atOwner: true});
  assert(text.includes('comment --oid <aid>'));
  assert(text.includes('--share --auto --owner-ok'));
  assert(text.includes(`--bvid ${BV}`));
  assert(text.includes('@ 他'));
  assert(text.includes('别 @ 别人'));
  assert(!text.includes('qq_send_message'));
  assert(!text.includes('想公开聊一句'));
});

test('without atOwner the ordinary Bili scene switch is unchanged', () => {
  const text = sceneSwitchPrompt('bili', BV, {intent: 'speak'});
  assert(text.includes('想公开聊一句'));
  assert(!text.includes('--owner-ok'));
  assert(!text.includes('@ 他'));
});

test('atOwner is a strict boolean: strings and missing values cannot arm the share path', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-220-'));
  try {
    const write = value => fs.writeFileSync(sceneOfferFile(home),
      JSON.stringify({at: Date.now(), video: BV, intent: 'speak', atOwner: value}));
    write(true);
    assert.equal(claimBiliSceneOffer(home).atOwner, true);
    write('true');
    assert.equal(claimBiliSceneOffer(home).atOwner, false);
    write(undefined);
    assert.equal(claimBiliSceneOffer(home).atOwner, false);
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('permanent rules forbid invented progress, tool detail and serial promises', () => {
  for (const phrase of [
    '说到做到，不编过程', '不请人等、不承诺重试', '提了视频就给得出去',
    '顺手把链接或 BV 号带上', '一次到位', '不评价那边的成败',
    '不把一件事拆成一长串连续短消息',
  ]) assert(OWNER_RULES_CORE.includes(phrase), phrase);
  // The exact fish-eight-legged sentences from the 21:05 private chat must be retired
  // as live wording (their fragments may appear only inside a prohibition list).
  for (const stale of ['等下看看@有没有变成蓝的', '评论区那关我过不去', '我搞砸啦']) {
    assert(!OWNER_RULES_CORE.includes(stale), stale);
  }
  assert(OWNER_RULES_CORE.includes('一句都不搬'));
  assert(OWNER_RULES_CORE.includes('全部禁止'));
});

test('language pack pins an anti-broadcast rule when the topic is a cross-scene task', () => {
  const pack = loadStrategies();
  assert(pack, 'language pack must still validate');
  const line = strategyLine({scene: '日常闲聊', text: '你@我去看了嘛', scope: 'private:test'}, pack);
  assert(line.includes('不编进度'));
  assert(line.includes('不报成败'));
  const normal = strategyLine({scene: '日常闲聊', text: '今天饭点也太飘了', scope: 'private:other'}, pack);
  assert(!normal.includes('不编进度'));
});

test('bridge and MCP gate atOwner to the owner private chat only', () => {
  const root = new URL('../live-mirror/src/', import.meta.url);
  const bridge = fs.readFileSync(new URL('bridge.js', root), 'utf8');
  const mcp = fs.readFileSync(new URL('mcp-snowluma-safe.js', root), 'utf8');
  assert(bridge.includes('const ownerAt = atOwner === true'));
  assert(bridge.includes('source !== owner'));
  assert(bridge.includes('...(ownerAt?{atOwner:true}:{})'));
  assert(bridge.includes('别评价成败'));
  assert(mcp.includes('atOwner:z.boolean().optional()'));
  assert(mcp.includes('一次换场就够'));
});

test('comment.mjs keeps the share safety rails while allowing an owner exemption', () => {
  const src = fs.readFileSync(new URL('../live-mirror/plugins/surfcore/tools/commands/comment.mjs', import.meta.url), 'utf8');
  assert(src.includes("const OWNER_OK = process.argv.includes('--owner-ok')"));
  assert(src.includes('OWNER_OK && !(SHARE && AUTO)'));
  assert(src.includes('主人当场授权 @：跳过评分/排名闸'));
  // Reason, @owner formatting, quota and leases are outside the exemption.
  assert(src.includes('reason.length < 8'));
  assert(src.includes("if (!body.startsWith(want))"));
  assert(src.includes('reserveOwnerMention'));
});
