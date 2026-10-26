const fs = require('node:fs'), path = require('node:path');
const { scenario } = require('./cases.cjs'), { runOne } = require('./run.cjs'), { CallBudget } = require('./lib/model.cjs');
const { createRuntime, ID } = require('./lib/production-runtime.cjs');
class LocalTasks {
  constructor() { this.jobs = new Map(); }
  add(job) { if (this.jobs.has(job.id)) return false; this.jobs.set(job.id, { ...job, status: 'pending' }); return true; }
  async fire(id, fn) { const job = this.jobs.get(id); if (!job || job.status !== 'pending') return { skipped: true }; job.status = 'running'; await fn(job); job.status = 'done'; return { skipped: false }; }
}
function toolScenario(index) {
  const s = scenario('11', 0), statuses = ['not_called', 'no_match', 'timeout', 'multiple_versions', 'english_error', 'no_followup', 'existing_followup'];
  s.id = 'T' + String(index).padStart(2, '0'); s.title = statuses[index];
  s.prior = [{ role: 'user', content: '【小岚】请找栞的《夜行灯》日文原唱。' }, { role: 'assistant', content: '我先看看。' }];
  const last = s.messages.at(-1); last.text = '请用搜索找栞的《夜行灯》日文原唱，别给翻唱。'; last.replyTo = null;
  s.messages = [last]; s.messages[0].time = Date.parse('2026-10-26T10:00:00Z');
  if (index === 0) { s.toolState = { status: 'not_called' }; last.text = '先别搜索，我只问你刚才真的搜过了吗？'; }
  if ([1, 2, 4].includes(index)) s.toolState = { status: statuses[index], results: [] };
  if (index === 5) { s.toolState = { status: 'no_match' }; last.text = '现在找不到就等会自动帮我找吧。'; }
  if (index === 6) {
    s.toolState = { status: 'not_called' }; last.sender = 'A'; last.stableId = 'A'; last.name = '主人'; last.text = '小岚那个找歌的后续任务还在吗？'; s.primary = 'A';
    s.environmentFacts = { toolCallsBeforeThisTurn: [], registeredTasks: [{ id: 'song-B-1', owner: 'B', recipient: 'B', channel: 'group', group: 7001, anchor: '1103', status: 'pending', runAfterSeconds: 300 }] };
  } else s.environmentFacts = { toolCallsBeforeThisTurn: [], registeredTasks: [], automaticFollowupCapability: false };
  s.expected = [
    '实际没有搜索调用，不说搜过或网站故障。', '搜索成功但没匹配结果，不归因网站故障。', '明确超时，可以说暂时没查到，不假称完成。',
    '选栞的日文原唱，不取第一个翻唱结果。', '不把英文错误原文发进群。', '没有后续任务能力，不承诺自动继续。', '识别任务属于B，回发B，重复触发不重复执行。',
  ][index];
  return s;
}
async function followupCheck(sourcePath, style) {
  const tasks = new LocalTasks(), runtime = createRuntime({ sourcePath, style }); const job = { id: 'song-B-1', owner: 'B', recipient: ID.B, channel: 'group', anchor: '1103' };
  tasks.add(job); const addedAgain = tasks.add(job);
  const execute = async j => { await runtime.hooks.转入一条('本地任务结果：已找到原唱', [], j.anchor, j.channel, j.recipient, j.recipient); await runtime.finish(runtime.modelInbox.at(-1), '找到的是栞的日文原唱'); };
  await tasks.fire(job.id, execute); const again = await tasks.fire(job.id, execute);
  const d = runtime.deliveries[0], at = d?.body.message.find(x => x.type === 'at')?.data.qq, quote = d?.body.message.find(x => x.type === 'reply')?.data.id;
  return { task: tasks.jobs.get(job.id), repeatedAddAccepted: addedAgain, secondFire: again, sends: runtime.deliveries, passed: !addedAgain && again.skipped && runtime.deliveries.length === 1 && at === String(ID.B) && quote === '1103', limits: 'Controlled local task registry, not a claim about the full DSH background-task engine' };
}
async function main() {
  const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
  const [snapshotArg, outArg, transportArg] = process.argv.slice(2), snapshotDir = path.resolve(snapshotArg), out = path.resolve(outArg); fs.mkdirSync(out, { recursive: true });
  const selected = process.argv[5] ? process.argv[5].split(',').map(Number) : [0,1,2,3,4,5,6];
  const transport = JSON.parse(fs.readFileSync(transportArg, 'utf8')), budget = new CallBudget(Number(option('max-calls',selected.length * 2))), results = [];
  console.log(JSON.stringify({ plan: { answers: selected.length, maximumModelCalls: budget.max, toolReturns: 'local fixtures', noRealQQ: true } }));
  for (const i of selected) {
    const spec = toolScenario(i);
    const r = await runOne({ spec, mode: 'chain', snapshotDir, outputDir: out, transport, budget, stub: false, candidate:option('candidate',null),stylePath:option('style',null),personaPath:option('persona',null) }); results.push(r); console.log(JSON.stringify({ completed: spec.id, calls: r.modelCalls, hardPassed: r.hardPassed }));
  }
  const followup = await followupCheck(option('candidate',path.join(snapshotDir, 'production_bridge.mjs')), fs.readFileSync(option('style',path.join(snapshotDir, 'style.md')), 'utf8'));
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ callsUsed: budget.used, results, followup, needIndependentSoftReview: true }, null, 2));
  console.log(JSON.stringify({ finished: true, callsUsed: budget.used, localTaskRoutingPassed: followup.passed }));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { LocalTasks, toolScenario, followupCheck };
