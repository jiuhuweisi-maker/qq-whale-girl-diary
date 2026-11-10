// 223：评论区玩法从「手写示范」升级为「真实语料蒸馏 + 自学习节奏」。
// 与 216 同一条红线：原文不入库、不发布、不注入，这里逐项验证。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OVERLAY_PATCH} from '../version.mjs';
import {distillBanter, validateBanterPack, assertNoRawText} from '../compat/comment-banter-distill.mjs';
import {loadBanterPack, banterStrategy, genreFromBrowse, liveRhythm,
        BANTER_MOVES, COMMENT_BANTER_CORE, looksLikeRecap} from '../compat/comment-banter.mjs';
import {compactBrowseInstructions} from '../compat/bili-wake-economy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('223 overlay patch', () => {
  assert(OVERLAY_PATCH >= 223);
});

test('策略包来自生产真实语料，且不含任何评论原文', () => {
  const p = loadBanterPack();
  assert(validateBanterPack(p));
  assert.equal(p.name, 'whale_bili_banter_v1');
  assert(/^v[0-9a-f]{16}$/.test(p.version));
  assert(p.source.retained >= 100, '真实语料规模');
  assert(p.source.videos >= 3);
  assert(p.genres.length >= 3);
  assert(p.rhythm.medianChars <= 26);
  assert(p.rhythm.noEndPunctRatio > 0.6, '真实热评大多不收句号');
  assert(p.rhythm.replyRatio > 0.4, '真实热评大多是接楼');
  const bad = p.avoid.reduce((s, x) => s + x.evidence.ratio, 0);
  assert(bad < 0.15, '报数据/复述在真实评论里是少数');
  // 包里只有数字和抽象手法，没有一句原文
  assert(!JSON.stringify(p).includes('京介 44 杀'));
  assert(p.method.includes('no comment text'));
  assert(p.source.privacy.includes('never in Git'));
});

test('蒸馏器本身不泄露原文：构造含独特句子的假语料逐字比对', () => {
  const corpus = [
    {text: '这是一条绝不可能出现在策略包里的独特测试句abcd1234', source: 'BVaaa', topic: '游戏区', reply: true, context: '楼上说了啥', at: Date.now()},
    {text: '另一条完全不同的楼中楼测试句wxyz9876', source: 'BVbbb', topic: '鬼畜区', reply: true, context: '接一句', at: Date.now()},
    {text: '短', source: 'BVccc', topic: '生活区', reply: false, context: '', at: Date.now()},
  ];
  const p = distillBanter({corpus, pack: {version: 'v0123456789abcdef'}, now: Date.now()});
  assert(validateBanterPack(p));
  assert(assertNoRawText(p, corpus));
  const blob = JSON.stringify(p);
  assert(!blob.includes('abcd1234'));
  assert(!blob.includes('wxyz9876'));
  assert(!blob.includes('楼上说了啥'));
  // 篡改一句原文进去必须被抓到
  const tampered = {...p, notes: [...p.notes, '这是一条绝不可能出现在策略包里的独特测试句abcd1234']};
  assert.equal(assertNoRawText(tampered, corpus), false);
  assert.equal(distillBanter({corpus: []}), null);
});

test('分区映射：topic 与 tid 都能落到真实语料的分区上', () => {
  assert.equal(genreFromBrowse({topic: '鬼畜区'}), '鬼畜区');
  assert.equal(genreFromBrowse({tid: 1}), '动画区');
  assert.equal(genreFromBrowse({tid: 4}), '游戏区');
  assert.equal(genreFromBrowse({tid: 119}), '鬼畜区');
  assert.equal(genreFromBrowse({tid: 160}), '生活区');
  assert.equal(genreFromBrowse({}), '');
});

test('每轮提示按分区给真实分寸，同一 seed 稳定、换分区换内容', () => {
  const p = loadBanterPack();
  const opt = {rhythm: null};
  const a = banterStrategy('BV1wDxQ6nEbx|23', {genre: '鬼畜区', ...opt});
  const b = banterStrategy('BV1wDxQ6nEbx|23', {genre: '鬼畜区', ...opt});
  const c = banterStrategy('BV1wDxQ6nEbx|23', {genre: '游戏区', ...opt});
  const d = banterStrategy('BV1AHhi6XEjn|23', {genre: '鬼畜区', ...opt});
  assert.equal(a, b, '同视频同小时不抖动');
  assert.notEqual(a, c, '换分区分寸不同');
  assert.notEqual(a, d, '换视频换招');
  assert(a.includes(`【真实语料分寸 ${p.version}】`));
  assert(a.includes(`${p.source.retained} 条热评`));
  assert(a.includes('鬼畜区样本') && a.includes('中位 12 字'));
  assert(c.includes('游戏区样本') && c.includes('中位 21 字'));
  assert(a.includes('别照抄') && a.includes('没梗可接就不发'));
  assert(a.includes('评论区玩梗参考'));
  // 分享场景同口径，不写推荐语
  const share = banterStrategy('BVshare', {genre: '@ 主人分享', ...opt});
  assert(share.includes('@ 主人分享'));
  assert(share.includes('不加推荐语'));
  assert(share.includes('真实语料分寸'));
});

test('策略包缺失时退回手写 12 招，不中断说话', () => {
  const s = banterStrategy('BVfallback', {genre: '鬼畜区', pack: null, rhythm: null});
  assert(s.includes('【评论区玩梗参考'));
  assert(!s.includes('真实语料分寸'));
  assert(s.includes('别照抄'));
  assert(BANTER_MOVES.length >= 12);
});

test('自学习节奏每轮可注入，随 active-pack 版本变化', () => {
  const s = banterStrategy('BVrhythm', {genre: '动画区', rhythm: {
    version: 'vfeedcba987654321', medianChars: 14, noEndPunctRatio: 0.9, retained: 612,
  }});
  assert(s.includes('【自学习节奏 vfeedcba987654321】'));
  assert(s.includes('612 条'));
  assert(s.includes('90% 不收句号'));
  assert(s.includes('这不是固定字数'));
  assert.equal(typeof liveRhythm, 'function');
});

test('B站 每轮提示带分区速查，沉默逛不注入玩法', () => {
  const p = loadBanterPack();
  const normal = compactBrowseInstructions({b: {}, limits: {}, kinds: {}, biliDir: '/tmp/x', silent: false});
  assert(normal.includes(`【分区速查 ${p.version}】`));
  assert(normal.includes('游戏区约21字') || normal.includes('游戏区约'));
  assert(normal.includes('【真实语料分寸'));
  assert(normal.includes(COMMENT_BANTER_CORE.slice(0, 20)));
  const silent = compactBrowseInstructions({b: {}, limits: {}, kinds: {}, biliDir: '/tmp/x', silent: true});
  assert(!silent.includes('【分区速查'));
  assert(!silent.includes('【评论区玩梗参考'));
  const guide = read('compat/bili-wake-economy.mjs');
  assert(guide.includes('genreFromBrowse(b)'));
  assert(guide.includes('genreQuickRef()'));
});

test('永久规则第九节写明真实语料依据，仍禁解说腔', () => {
  assert(COMMENT_BANTER_CORE.includes('这不是我编的套话'));
  assert(COMMENT_BANTER_CORE.includes('八成多不收句号'));
  assert(COMMENT_BANTER_CORE.includes('别报数据'));
  assert(COMMENT_BANTER_CORE.includes('@ 主人分享'));
  assert(COMMENT_BANTER_CORE.includes('别把上一条视频的梗硬搬到下一条'));
  const rules = read('compat/expression-style.mjs');
  assert(rules.includes('${COMMENT_BANTER_CORE}'));
  assert.equal(looksLikeRecap(
    '京介 44 杀 1.90 rating 已经够离谱了，标题还塞了个 m0NESY 一穿二；这场的乐子比数据还密'), true);
  assert.equal(looksLikeRecap('这 ID 一看就比我敢冲，我只会蹲箱子'), false);
});
