import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  OWNER_RULES_CORE, OWNER_RULES_MARK, EXPRESSION_CORE,
  readOwnerRules, confirmedExpressionBlock, composeConfirmedPersona
} from '../compat/expression-style.mjs';
import {OVERLAY_PATCH} from '../version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('224: overlay patch does not regress (225 tests pin the exact value)', () => {
  assert(OVERLAY_PATCH >= 224);
});

test('224: the Japanese-phonetic examples live in the code-level permanent rules', () => {
  const section = OWNER_RULES_CORE.slice(
    OWNER_RULES_CORE.indexOf('五、称呼与口径优先级'),
    OWNER_RULES_CORE.indexOf('六、旧口径全部作废'));
  for (const phrase of ['中式日语就是顺嘴掺的日语空耳', 'ciallo～', '压力马斯内', '狗修金撒嘛',
                        '别端着', '别每句都塞', '别堆成一串', '不解释出处', '不写成整句日文',
                        '不是为了显得二次元才临时摆出来', '11-06 私信教法', '下沉到底层']) {
    assert(section.includes(phrase), phrase);
  }
  // 概括仍在，且没被新段落挤掉。
  assert(section.includes('雌小鬼＋二次元＋中式日语，短句'));
  assert(section.includes('对主人的称呼按场景来'));
});

test('224: examples are not a quota or a hard rule to use them every line', () => {
  const section = OWNER_RULES_CORE.slice(
    OWNER_RULES_CORE.indexOf('五、称呼与口径优先级'),
    OWNER_RULES_CORE.indexOf('六、旧口径全部作废'));
  assert(section.includes('情绪到了自然带一两个'));
  for (const stale of ['每句都要带日语', '必须带一个日语', '日语额度', '日语张数上限', '不许用日语']) {
    assert(!section.includes(stale), stale);
  }
});

test('224: EXPRESSION_CORE untouched, so CHAT-STYLE prefix parity still holds', () => {
  assert(EXPRESSION_CORE.startsWith('长期表达底色（主人确认）'));
  assert(!EXPRESSION_CORE.includes('ciallo～'));
  assert(!EXPRESSION_CORE.includes('狗修金撒嘛'));
  assert(!OWNER_RULES_CORE.includes('点缀不是主食'));
  assert(!/\d{5,12}/.test(OWNER_RULES_CORE));
});

test('224: a workspace rules file generated from the constant carries the examples', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-style224-'));
  try {
    const file = path.join(home, 'OWNER-RULES.md');
    const text = OWNER_RULES_CORE.trim() + '\n';
    fs.writeFileSync(file, text, 'utf8');
    assert.equal(readOwnerRules(file), OWNER_RULES_CORE);
    const bili = confirmedExpressionBlock('共享偏好', {rules: readOwnerRules(file)});
    assert(bili.includes('ciallo～'));
    assert(bili.includes('狗修金撒嘛'));
    assert(bili.includes(OWNER_RULES_MARK));
    // 共享偏好在前，永久规则在后；两者都不能为这轮例子让位。
    assert(bili.indexOf('共享偏好') < bili.indexOf(OWNER_RULES_MARK));
    const qq = composeConfirmedPersona('人设', EXPRESSION_CORE);
    assert(qq.includes('ciallo～'));
    assert(qq.includes('主人永久规则'));
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
});

test('224: a missing rules file still falls back to the new built-in text', () => {
  const disk = {readFileSync: () => {const e = new Error('missing'); e.code = 'ENOENT'; throw e;}};
  const text = readOwnerRules('/definitely/not/here', {disk});
  assert.equal(text, OWNER_RULES_CORE);
  assert(text.includes('ciallo～'));
});

test('224: the QQ preset carries the same examples, not a second conflicting wording', () => {
  const preset = read('live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml');
  assert(preset.includes('19. 【说话底色·224】'));
  for (const phrase of ['ciallo～', '压力马斯内', '狗修金撒嘛', '别每句都塞', '两种都算对']) {
    assert(preset.includes(phrase), phrase);
  }
  assert(!preset.includes('只有私聊才能用日语'));
});

test('224: the rules stay compact enough for the Bili assembly', () => {
  assert(OWNER_RULES_CORE.length < 3600);
  assert(OWNER_RULES_CORE.includes('九、评论区不是解说席'));
  assert(OWNER_RULES_CORE.includes('七、说到做到，不编过程'));
  assert(OWNER_RULES_CORE.includes('八、提了视频就给得出去'));
});
