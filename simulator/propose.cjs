const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function buildCandidate(sourcePath, destination) {
  if (path.resolve(sourcePath) === path.resolve(destination) || (fs.existsSync(destination) && fs.realpathSync(sourcePath) === fs.realpathSync(destination))) throw new Error('candidate must not overwrite its source');
  const baseline = fs.readFileSync(sourcePath, 'utf8'); let s = baseline.replace(/\r\n/g, '\n'); const changes = [];
  const edit = (before, after, why) => { if (s.split(before).length !== 2) throw new Error('candidate anchor changed: ' + why); s = s.replace(before, after); changes.push(why); };
  edit("图们.push(...recent.图们)\n        文件们.push(...recent.文件们.map(f => ({ ...f, origin: '同一发言者两分钟内最近的附件，仅作上下文' })))", "const 附图上下文 = recent.图们.length ? candidates.filter(v => v.图们.length).slice(0, 2).reverse() : [recent]\n        for (const old of 附图上下文) 图们.push(...old.图们)\n        文件们.push(...recent.文件们.map(f => ({ ...f, origin: '同一发言者两分钟内最近的附件，仅作上下文' })))", '同人前两张图片按时间附回，避免上图丢失');
  edit("return { action, ok: false, 数据: { 错: String((error && error.message) || error) } }", "return { action, ok: false, 不确定: true, 数据: { 错: String((error && error.message) || error) } }", '网络异常标记结果不确定');
  edit('if (!果P.ok && 带引P)', 'if (!果P.ok && 带引P && !果P.不确定)', '私聊不确定发送不降级重发');
  edit('if (!果G.ok && 带引G)', 'if (!果G.ok && 带引G && !果G.不确定)', '群聊不确定发送不降级重发');
  edit('let 冲缓冲中 = false', 'let 冲缓冲中 = false\n  let 主动入口锁离线 = false', '主动入口增加原子占位');
  edit("if (有QQ待办100()) return 回(res, { ok: true, skipped: true, 说: '已有对话待处理，本次主动轮略过' })", "if (主动入口锁离线 || 有QQ待办100()) return 回(res, { ok: true, skipped: true, 说: '已有对话待处理，本次主动轮略过' })", '多个主动入口互斥');
  edit("回(res, await 转入一条(文字, [], '', 道, 0, 0))", "主动入口锁离线 = true\n    try { 回(res, await 转入一条(文字, [], '', 道, 0, 0)) } finally { 主动入口锁离线 = false }", '主动注入后释放互斥');
  edit("if (/[\\u4e00-\\u9fff]/.test(t)) return false", "if (/^(?:Internal Server Error\\b|Traceback \\(most recent call last\\)|Error:\\s.*(?:upstream|request|timeout))/i.test(t.trim())) return true\n      if (/[\\u4e00-\\u9fff]/.test(t)) return false", '拦明确技术错误前缀，保留正常中文解释');
  const start = s.indexOf('    const 旧水位47 ='), middle = s.indexOf('    if (配置.转群 && 配置.群号)', start), end = s.indexOf('    await 冲缓冲(配置)', middle);
  if (start < 0 || middle < 0 || end < 0) throw new Error('poll namespaces unavailable');
  const scoped = (text, ns) => text.replaceAll('已转消息.has(条.message_id)', '已转消息.has(' + ns + ')').replaceAll('已转消息.add(条.message_id)', '已转消息.add(' + ns + ')');
  s = s.slice(0, start) + scoped(s.slice(start, middle), "'p:' + 她的号 + ':' + String(条.message_id)") + scoped(s.slice(middle, end), "'g:' + 配置.群号 + ':' + String(条.message_id)") + s.slice(end);
  changes.push('消息去重按群/私域隔离，保留同号消息');
  require('./lib/resume-patch.cjs').resumePatch(edit);
  require('./lib/context-patch.cjs').contextPatch(edit);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, s);
  return { baselineSHA256: crypto.createHash('sha256').update(baseline).digest('hex'), candidateSHA256: crypto.createHash('sha256').update(s).digest('hex'), changes, productionModified: false, unresolved: ['提交/发送结果不确定时保留账目，等待对账，不自动重放；不承诺分布式严格恰好一次', '正文选择/引用归属及语气另行离线验证'] };
}
if (require.main === module) {
  const source = process.argv[2], dest = process.argv[3], r = buildCandidate(source, dest); fs.writeFileSync(dest + '.proposal.json', JSON.stringify(r, null, 2)); console.log(JSON.stringify(r, null, 2));
}
module.exports = { buildCandidate };
