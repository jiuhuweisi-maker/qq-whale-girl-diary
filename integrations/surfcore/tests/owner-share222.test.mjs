// 222：分享视频必须是行为，不能靠模型记得带 atOwner。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OWNER_RULES_CORE} from '../compat/expression-style.mjs';
import {OVERLAY_PATCH} from '../version.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('222 版本号与永久规则：221 口径仍在，新增「不靠记参数」', () => {
  assert(OVERLAY_PATCH >= 222);
  assert(OWNER_RULES_CORE.includes('八、提了视频就给得出去'));
  assert(OWNER_RULES_CORE.includes('不用等他开口叫'));
  assert(OWNER_RULES_CORE.includes('222 补充'));
  assert(OWNER_RULES_CORE.includes('服务端一律按「去评论区 @ 主人」登记'));
  // 220 的反播报规则不能被 222 冲掉
  assert(OWNER_RULES_CORE.includes('不评价那边的成败、不播报、不连环'));
});

test('222 桥：主人私信里带视频 speak 一律强制 @ 主人，不看模型参数', () => {
  const b = read('live-mirror/src/bridge.js');
  assert(b.includes('const ownerShare = source === owner && target === \'bili\' && intent === \'speak\' && !!video'));
  assert(b.includes('const ownerAt = atOwner === true || ownerShare'));
  // 显式参数的来源校验仍然保留，别被 §§ 绕开
  assert(b.includes("if (atOwner === true && (target !== 'bili' || intent !== 'speak' || !video || source !== owner))"));
  assert(b.includes('if (ownerAt) registerOwnerShare(video);'));
});

test('222 桥：她发出含 BV 的私信时自动登记，不靠模型调换场工具', () => {
  const b = read('live-mirror/src/bridge.js');
  assert(b.includes("const bv = /BV[0-9A-Za-z]{10}/.exec(messages.join('\\n'))?.[0] || ''"));
  assert(b.includes("key === `private:${cfg.ownerQQ}`"));
  assert(b.includes('if (!ownerRecent.includes(bv))'));
  assert(b.includes('registerOwnerShare(bv)'));
  // 主人自己刚发来的视频不能反触发
  assert(b.includes('.filter(m=>!m.isSelf).slice(-3)'));
});

test('222 去重：同一条视频 30 分钟内、便条已被领走就不重复发', () => {
  const b = read('live-mirror/src/bridge.js');
  assert(b.includes('at - prev < 30*60*1000 && !fs.existsSync(offerPath)'));
  assert(b.includes("return 'dup'"));
  assert(b.includes('owner-share-offer.json'));
});

test('222 便条：atOwner + reason/message 由 claimBiliSceneOffer 透传', async () => {
  const {claimBiliSceneOffer, sceneOfferFile} = await import('../compat/scene-switch.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale222-'));
  try {
    fs.writeFileSync(sceneOfferFile(dir), JSON.stringify({
      at: Date.now(), video: 'BV1wDxQ6nEbx', intent: 'speak', atOwner: true,
      reason: '主人在私信里让她分享这条视频', message: '翻到一条够抽象的，笑死',
    }));
    const offer = claimBiliSceneOffer(dir);
    assert.equal(offer.atOwner, true);
    assert.equal(offer.video, 'BV1wDxQ6nEbx');
    assert.match(offer.reason, /分享/);
    assert.match(offer.message, /够抽象/);
    // 严格布尔：字符串 "true" 不能绕开
    fs.writeFileSync(sceneOfferFile(dir), JSON.stringify({at: Date.now(), video: '', atOwner: 'true'}));
    assert.equal(claimBiliSceneOffer(dir).atOwner, false);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('222 B站 scheduler：atOwner 便条直发，不再交给模型自由发挥', () => {
  const s = read('live-mirror/plugins/surfcore/lib/scheduler.js');
  assert(s.includes("import { runOwnerShareComment } from './owner-share.mjs'"));
  assert(s.includes('if (offer.atOwner === true)'));
  assert(s.includes('await runOwnerShareComment({ ...offer, runBili, log })'));
  // 直发分支必须先于 ensureSession / promptBili
  assert(s.indexOf('if (offer.atOwner === true)') < s.indexOf('await ensureSession()'));
});

test('222 执行器：BV→aid，dry→go，且必须是 --share --auto --owner-ok', async () => {
  const {runOwnerShareComment} = await import('../live-mirror/plugins/surfcore/lib/owner-share.mjs');
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => ({json: async () => ({data: {aid: '115123456789'}})});
  try {
    const res = await runOwnerShareComment({
      bvid: 'BV1wDxQ6nEbx',
      reason: '主人在私信里让她分享这条视频，她也想叫他来看',
      message: '翻到一条够抽象的 https://www.bilibili.com/video/BV1wDxQ6nEbx/ @某人 笑死',
      runBili: async (args) => { calls.push(args); return {ok: true, out: '评论 rpid=123456789'}; },
    });
    assert.equal(res.ok, true);
    assert.equal(res.aid, '115123456789');
    assert.equal(res.rpid, '123456789');
    assert.equal(calls.length, 2);
    const dry = calls[0], go = calls[1];
    assert.equal(dry[0], 'comment');
    assert(dry.includes('--oid') && dry.includes('115123456789'));
    for (const flag of ['--share', '--auto', '--owner-ok', '--reason']) {
      assert(dry.includes(flag) && go.includes(flag));
    }
    assert(dry.includes('--dry') && !dry.includes('--go'));
    assert(go.includes('--go') && !go.includes('--dry'));
    const msg = dry[dry.indexOf('--message') + 1];
    assert(!msg.includes('http'), '分享正文不能带链接');
    assert(!msg.includes('@'), '分享正文不能夹别的 @');
  } finally {
    globalThis.fetch = orig;
  }
});

test('222 执行器：dry 失败就不发、不重试；BV 非法直接拒绝', async () => {
  const {runOwnerShareComment} = await import('../live-mirror/plugins/surfcore/lib/owner-share.mjs');
  const calls = [];
  const bad = await runOwnerShareComment({bvid: 'BV123', runBili: async () => ({ok: true})});
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'bad-bvid');
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({json: async () => ({data: {aid: '999'}})});
  try {
    const res = await runOwnerShareComment({
      bvid: 'BV1wDxQ6nEbx', reason: '主人想一起看这条视频',
      runBili: async (args) => { calls.push(args); return {ok: false, err: 'quota'}; },
    });
    assert.equal(res.ok, false);
    assert.match(res.reason, /^dry:/);
    assert.equal(calls.length, 1, 'dry 没过就绝不 --go');
  } finally {
    globalThis.fetch = orig;
  }
});

test('222 工具描述与指引都写明「不靠记参数」', () => {
  const guide = read('compat/TOOL-GUIDE.md');
  const mcp = read('live-mirror/src/mcp-snowluma-safe.js');
  const preset = read('live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml');
  for (const t of [guide, mcp, preset]) {
    assert(t.includes('222'));
    assert(t.includes('服务端一律按'));
  }
  // 221 的口径没被删掉
  assert(guide.includes('不用等他开口叫'));
  assert(mcp.includes('atOwner:z.boolean()'));
});

test('222 永久规则第九节：评论区不是解说席，私信提视频那句同口径', () => {
  assert(OWNER_RULES_CORE.includes('九、评论区不是解说席'));
  for (const s of ['别报数据', '别复述视频', '别拿「这场的乐子比数据还密」这类金句收尾',
    '你是来当串子的', '十到二十五字说完就停', '不同视频换不同的梗', '@ 主人分享']) {
    assert(OWNER_RULES_CORE.includes(s), s);
  }
  assert(OWNER_RULES_CORE.includes('那句话会原样变成 B站 评论区 @ 他的分享评论'));
});

test('222 玩法包：12 招覆盖不同视频类型，示范是分寸不是套话', async () => {
  const {BANTER_MOVES, banterStrategy, COMMENT_BANTER_CORE} = await import('../compat/comment-banter.mjs');
  assert(BANTER_MOVES.length >= 12);
  const scenes = BANTER_MOVES.map(m => m.scene).join('|');
  for (const s of ['游戏', '鬼畜', '二创', '番剧', '生活', '萌宠', '科技', '音乐', '@ 主人分享']) {
    assert(scenes.includes(s), s);
  }
  assert(COMMENT_BANTER_CORE.includes('别把上一条视频的梗硬搬到下一条'));
  // 同一 seed 稳定，换 seed 能换招，且明确写了「别照抄」
  const a = banterStrategy('BV1wDxQ6nEbx');
  const b = banterStrategy('BV1wDxQ6nEbx');
  const c = banterStrategy('BV1AHhi6XEjn');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert(a.includes('【评论区玩梗参考'));
  assert(a.includes('别照抄'));
});

test('222 窄闸：只拦课代表腔，纯玩梗提数字不拦', async () => {
  const {looksLikeRecap} = await import('../compat/comment-banter.mjs');
  assert.equal(looksLikeRecap(
    '京介 44 杀 1.90 rating 已经够离谱了，标题还塞了个 m0NESY 一穿二；这场的乐子比数据还密'), true);
  assert.equal(looksLikeRecap('这 ID 一看就比我敢冲，我只会蹲箱子'), false);
  assert.equal(looksLikeRecap('44 杀，我人也看傻了'), false);
  assert.equal(looksLikeRecap('楼上复读三遍了，我第四遍负责跑调'), false);
  assert.equal(looksLikeRecap(''), false);
});

test('222 B站 每轮注入方法论 + 轮换招式，评论脚本挂上窄闸', async () => {
  const {compactBrowseInstructions} = await import('../compat/bili-wake-economy.mjs');
  const text = compactBrowseInstructions({b: {owner: {contactMode: 'comment-mention'}}});
  assert(text.includes('评论区不是解说席'));
  assert(text.includes('【评论区玩梗参考'));
  // 既有 B站 口径没被删
  assert(text.includes('评论区就按群聊'));
  assert(text.includes('视频以外'));
  const c = read('live-mirror/plugins/surfcore/tools/commands/comment.mjs');
  assert(c.includes("import {looksLikeRecap} from '../../../../whale-compat/comment-banter.mjs'"));
  assert(c.includes('if ((AUTO || SHARE) && looksLikeRecap(message))'));
  assert(c.includes('[222] 这条像解说稿'));
});

test('222 工具指引与 agent 预设都教「私信那句也要写成串子白话」', () => {
  const guide = read('compat/TOOL-GUIDE.md');
  const preset = read('live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml');
  for (const t of [guide, preset]) {
    assert(t.includes('都不是解说席'));
    assert(t.includes('一句带梗的白话'));
    assert(t.includes('原样变成'));
  }
});
