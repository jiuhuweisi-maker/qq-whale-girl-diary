import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  OWNER_RULES_CORE, OWNER_RULES_MARK, readOwnerRules,
  ownerRulesBlock, confirmedExpressionBlock, composeConfirmedPersona,
  EXPRESSION_CORE
} from '../compat/expression-style.mjs';

const noStyle = {readFileSync: () => {const e = new Error('missing'); e.code = 'ENOENT'; throw e;}};

test('owner rules are a real code-level constant, not a generated memory', () => {
  assert(OWNER_RULES_CORE.startsWith(OWNER_RULES_MARK));
  assert(OWNER_RULES_CORE.includes('鱼八股'));
  assert(OWNER_RULES_CORE.includes('每个表情包都吐槽干嘛'));
  assert(OWNER_RULES_CORE.includes('我收起来啦'));
  assert(OWNER_RULES_CORE.includes('不设匹配分门槛'));
  assert(OWNER_RULES_CORE.includes('不设每轮张数上限'));
  // 218: the "全都见过、不用再认" wording was withdrawn by the owner.
  assert(!OWNER_RULES_CORE.includes('全都见过'));
  assert(!OWNER_RULES_CORE.includes('不用再认'));
  assert(!OWNER_RULES_CORE.includes('这些表情包你全都看过了'));
});

test('218 owner rulings on stickers, quotes and emoji all live in the constant', () => {
  const must = [
    '别装熟', '见过了不要说见过了', '正常聊', '同一张只一次', '别大惊小怪',
    '没见过', '猎奇', '认亲／收图只有主人明确叫', '已经有了', '不主动认图',
    '挑图只从 QQ 收藏面板', '不用旧梗图库', '单发一张表情比硬续话有效',
    '不固定结尾', '放在句中、句尾或单独一条',
    '多人同时在说话', '默认引用回复', '正常一对一', '不用引用',
  ];
  for (const phrase of must) assert(OWNER_RULES_CORE.includes(phrase), phrase);
  // The old "only quote to disambiguate" rule must not survive anywhere in the core.
  assert(!EXPRESSION_CORE.includes('只有消除指代歧义时才引用'));
  assert(EXPRESSION_CORE.includes('默认引用回复'));
  assert(EXPRESSION_CORE.includes('位置随情绪'));
});

test('owner rules stay public-safe: no account ids or private detail', () => {
  assert(!/\d{5,12}/.test(OWNER_RULES_CORE));
  for (const bad of ['成人向', '求饶', '惩罚', '身体', '2470003599', '727337049']) {
    assert(!OWNER_RULES_CORE.includes(bad), bad);
  }
});

test('a missing rules file falls back to the built-in text instead of going empty', () => {
  assert.equal(readOwnerRules('/definitely/not/here', {disk: noStyle}), OWNER_RULES_CORE);
  assert.equal(readOwnerRules('/x', {disk: {readFileSync: () => '   \n'}}), OWNER_RULES_CORE);
});

test('an empty rules file never blanks the permanent block', () => {
  assert.equal(ownerRulesBlock(''), '');
  assert.equal(confirmedExpressionBlock('', {rules: ''}), '');
  assert(confirmedExpressionBlock('语气', {rules: ''}).includes('语气'));
});

test('a permission/IO fault is visible rather than silently dropping the rules', () => {
  const e = new Error('EACCES'); e.code = 'EACCES';
  assert.throws(() => readOwnerRules('/x', {disk: {readFileSync: () => {throw e;}}}), /EACCES/);
});

test('the owner may override the rules from a plain workspace file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-rules-'));
  try {
    const file = path.join(home, 'OWNER-RULES.md');
    fs.writeFileSync(file, OWNER_RULES_MARK + '\n后来新教的一条：接梗先接具体那点。');
    const text = readOwnerRules(file);
    assert(text.includes('后来新教的一条'));
    assert(!text.includes('鱼八股'));
    assert(confirmedExpressionBlock('偏好', {rules: text}).includes('后来新教的一条'));
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

test('QQ and Bili both receive the rules on every wake, including a fresh session', () => {
  const rules = OWNER_RULES_CORE;
  const qq = composeConfirmedPersona('人设'.repeat(4000), EXPRESSION_CORE);
  assert(qq.includes('主人永久规则'));
  assert(qq.includes('长期聊天偏好'));
  assert.equal(qq.split('QQ与B站共用').length - 1, 1);
  const bili = confirmedExpressionBlock('简洁的共享偏好', {rules});
  assert(bili.includes('简洁的共享偏好'));
  assert(bili.includes('不设每轮张数上限'));
  assert(bili.indexOf('简洁的共享偏好') < bili.indexOf(OWNER_RULES_MARK));
  assert.equal(confirmedExpressionBlock('简洁的共享偏好', {rules}), bili);
});

test('rules do not depend on anchors, memory cards or any session state', () => {
  const block = confirmedExpressionBlock('', {rules: OWNER_RULES_CORE});
  assert(block.startsWith(OWNER_RULES_MARK));
  assert(block.includes('本轮对方明确说的事实 > 本节 > 钉住事项 > 记忆卡 > 日记与简报'));
});
