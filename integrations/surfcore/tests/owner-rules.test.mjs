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
  assert(OWNER_RULES_CORE.includes('这些表情包你全都看过了'));
  assert(OWNER_RULES_CORE.includes('不设匹配分门槛'));
  assert(OWNER_RULES_CORE.includes('不设每轮张数上限'));
  assert(OWNER_RULES_CORE.includes('我收起来啦'));
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
