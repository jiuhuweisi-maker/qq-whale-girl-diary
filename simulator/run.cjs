const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { scenario, CORE } = require('./cases.cjs');
const { createRuntime } = require('./lib/production-runtime.cjs');
const { generate, CallBudget } = require('./lib/model.cjs');
const { score } = require('./lib/score.cjs');
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; };
function completeContext(spec) {
  const rows = spec.messages.map(m => ({ messageId: m.id, sender: m.sender, stableId: m.stableId, displayName: m.name, time: new Date(m.time).toISOString(), text: m.text, mentions: m.at, quoteTarget: m.replyTo, images: m.images, recalled: !!m.recalled }));
  return '【完整正确的模拟群聊上下文】\n' + JSON.stringify(rows, null, 2) + (spec.id === '20' ? '\n【当前回合】群里没有新消息和新问题，主动观察轮可选择沉默，不存在要回答的提问者。' : '\n【当前回合】只回答' + spec.primary + '（' + spec.names[spec.primary] + '）这一轮，自动@与引用锚为消息' + spec.expectedAnchor + '。上下文里的历史不是新的催办。只回应当前问的事，不自行追加接单或索要材料。');
}
function writeFailure(file, r) {
  const content = '用例编号：' + r.caseId + ' / ' + r.mode + ' / 变体' + r.variant + '\n模拟原始消息：\n' + JSON.stringify(r.simulatedMessages, null, 2) + '\n实际传给模型的上下文：\n' + r.context + '\n模型原始输出：\n' + r.rawOutput + '\n最终发送内容、@对象和引用目标：\n' + JSON.stringify(r.finalSends, null, 2) + '\n工具实际调用与结果：\n' + JSON.stringify(r.toolCalls, null, 2) + '\n预期行为：' + r.expected + '\n实际偏差：\n' + JSON.stringify(r.judgement.hard.failures, null, 2) + '\n问题层级：' + [...new Set(r.judgement.hard.failures.map(f => f.layer))].join(' / ') + '\n软指标：待Codex初评，不能用代码检查代替语言质量判断。\n';
  fs.writeFileSync(file, content);
}
async function runOne({ spec, mode, snapshotDir, outputDir, transport, budget, stub, candidate, stylePath, personaPath, generateFn = generate }) {
  const persona = fs.readFileSync(personaPath || path.join(snapshotDir, 'persona.md'), 'utf8'), style = fs.readFileSync(stylePath || path.join(snapshotDir, 'style.md'), 'utf8');
  const runtime = createRuntime({ names: spec.names, style, sourcePath: candidate || path.join(snapshotDir, 'production_bridge.mjs') });
  let inbox;
  if (mode === 'dialogue') {
    await runtime.clock.settle(runtime.hooks.转入一条(completeContext(spec), [], String(spec.expectedAnchor), 'group', spec.primary === 'W' ? 0 : require('./lib/production-runtime.cjs').ID[spec.primary], spec.primary === 'W' ? 0 : require('./lib/production-runtime.cjs').ID[spec.primary]));
    inbox = runtime.modelInbox[0];
  } else {
    const ordered = spec.messages.slice().sort((a, b) => a.time - b.time);
    runtime.clock.now = Math.min(...ordered.map(m => m.time));
    for (const row of ordered) {
      await runtime.clock.advance(row.time - runtime.clock.now); runtime.add(row);
      if (row.phase === 'background') { runtime.hooks.已转消息.add(row.id); runtime.hooks.已转消息.add((row.channel === 'private' ? 'p:1001:' : 'g:7001:') + row.id); }
      await runtime.clock.settle(runtime.hooks.轮询收消息());
    }
    await runtime.clock.advance(6000); await runtime.clock.settle(runtime.hooks.冲缓冲(runtime.config));
    if (spec.id === '20') await runtime.requestRoute('nudge', { text: '（内部主动观察提示）有空看看群聊。有具体新话想分享可以自然说，没有就只输出略过，不为刷存在感讨回应。', channel: 'group' });
    inbox = runtime.modelInbox[0];
  }
  if (!inbox) throw new Error('no model input captured for ' + spec.id + '/' + mode);
  const context = runtime.modelText(inbox), prefix = spec.id + '-' + mode + '-v' + spec.variant;
  const generated = await generateFn({ spec, context, persona, transport, budget, requestPrefix: prefix, stub });
  const truncated = generated.calls.some(c => [c.response.stopReason, c.response.stop_reason, c.response.metadata?.stopReason].includes('max_tokens'));
  const validRun = !generated.unfinishedToolTurn && !truncated;
  if (validRun) await runtime.finish(inbox, generated.text);
  runtime.assertIsolated();
  const result = { caseId: spec.id, variant: spec.variant, title: spec.title, mode, stub: !!stub, sourceSHA256: runtime.sourceSHA256,
    simulatedMessages: spec.messages, actualAgentMessage: inbox.message, context, system: generated.system, personaSHA256: require('node:crypto').createHash('sha256').update(persona).digest('hex'), acceptedAnchors: spec.acceptedAnchors, modelCalls: generated.calls, modelMetadata: generated.metadata, rawOutput: generated.text,
    toolCalls: generated.toolCalls, pendingToolTurn: !!generated.unfinishedToolTurn, validRun, invalidReason: validRun ? null : generated.unfinishedToolTurn ? 'unfinished_tool_turn' : 'truncated_response', styleSHA256: require('node:crypto').createHash('sha256').update(style).digest('hex'), expected: spec.expected, pendingInputCount: runtime.hooks.缓聊.size, judgement: score(spec, runtime, context), oneBotRequests: runtime.requests,
    virtualTime: runtime.clock.now, log: runtime.logs, privacy: 'private local artifact; includes live persona, do not publish', limits: ['Synthetic image descriptions; no real visual capability claim', 'Fresh isolated simulation, not the full 389-turn production memory', 'Tool contract is a controlled local search stub', 'No production service writes, QQ connection, Docker or notification execution'] };
  result.finalSends = result.judgement.sends;
  if (!validRun) result.judgement = { ...result.judgement, hard: { passed: null, checks: [], failures: [], invalid: true }, soft: { status: '测试无效；不得记作模型/路由失败' } };
  const filename = path.join(outputDir, prefix + '.json'); fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  if (result.judgement.hard.passed === false) writeFailure(path.join(outputDir, prefix + '.failure.md'), result);
  return { caseId: spec.id, variant: spec.variant, mode, file: filename, validRun, invalidReason: result.invalidReason, hardPassed: result.judgement.hard.passed, hardFailures: result.judgement.hard.failures.map(f => f.name), rawOutput: result.rawOutput, modelCalls: generated.calls.length };
}
async function main() {
  const cases = arg('cases', CORE.join(',')).split(','), variants = arg('variants', '0').split(',').map(Number), modes = arg('modes', 'dialogue,chain').split(',');
  const stub = process.argv.includes('--stub'), snapshotDir = path.resolve(arg('snapshot', '../.ops/offline')), outputDir = path.resolve(arg('out', 'simulator/runs/' + new Date().toISOString().replace(/[:.]/g, '-')));
  const total = cases.length * variants.length * modes.length, cap = Number(arg('max-calls', total * 2));
  const plan = { cases, variants, modes, answers: total, expectedModelCalls: stub ? 0 : total, maximumModelCalls: stub ? 0 : cap, extraCallsOnlyForMockToolContinuation: true, productionServicesModified: false, realQQConnections: 0, credentialLeavesServer: false };
  console.log(JSON.stringify({ plan })); if (process.argv.includes('--plan')) return;
  if (!stub && !process.argv.includes('--live')) throw new Error('choose --stub or --live after reviewing --plan');
  const transport = stub ? {} : JSON.parse(fs.readFileSync(arg('transport', '../.ops/offline/transport.json'), 'utf8'));
  const budget = new CallBudget(cap); fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(path.join(outputDir, 'plan.json'), JSON.stringify(plan, null, 2));
  const results = [];
  for (const variant of variants) for (const id of cases) for (const mode of modes) {
    const spec = scenario(id, variant);
      try { const r = await runOne({ spec, mode, snapshotDir, outputDir, transport, budget, stub, candidate: arg('candidate', null), stylePath: arg('style', null), personaPath: arg('persona', null) }); results.push(r); console.log(JSON.stringify({ completed: id, mode, variant, hardPassed: r.hardPassed, failures: r.hardFailures, modelCalls: r.modelCalls })); }
    catch (error) { const r = { caseId: id, mode, variant, infrastructureError: error.message }; results.push(r); fs.writeFileSync(path.join(outputDir, id + '-' + mode + '-v' + variant + '.error.json'), JSON.stringify(r, null, 2)); console.log(JSON.stringify(r)); }
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify({ plan, callsUsed: budget.used, results, softVerdicts: 'pending independent Codex review; target model does not score itself' }, null, 2));
  }
  console.log(JSON.stringify({ finished: true, outputDir, callsUsed: budget.used, hardFailures: results.filter(r => r.hardPassed === false).length, invalidRuns: results.filter(r => r.validRun === false).length, infrastructureErrors: results.filter(r => r.infrastructureError).length }));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { runOne, completeContext, main };
