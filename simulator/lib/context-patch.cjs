function contextPatch(edit) {
  edit('  function 合成群批99(群批, 目标) {', String.raw`  function 成员标识(uid) { return '成员' + 账摘要(账域 + ':actor:' + String(uid)).slice(0, 8) }
  function 解析回复选择(text, route) {
    const match = String(text).match(/^\s*【回复[:：]([^】\n]{1,80})】\s*/)
    const choices = route.replyChoices || []
    let mid = choices.length > 1 ? '' : route.mid
    if (match) {
      const picked = choices.find(c => c.ref === match[1] && Number(c.speaker) === Number(route.话) && route.来路 === 'group')
      mid = picked ? picked.mid : ''
      if (!picked) 记账('回复选择不在本轮对象候选中，去掉引用但保留正文')
    }
    return { text: String(text).replace(/【回复[:：][^】\n]{1,80}】\s*/g, '').trim(), route: { ...route, mid } }
  }
  function 合成群批99(群批, 目标) {`, '稳定成员标识与本轮限定的回复选择');
  edit('    const 行们 = 全部.map(({ item, batch }) => {', '    const 行们 = 全部.map(({ item, batch }, index) => {', '每条当前消息带可选择的短引用标签');
  edit("+ (item.name || batch.b.name) + '】' + 话 + 图话 + 文件话", "+ (item.name || batch.b.name) + '|' + 成员标识(item.speaker || batch.b.speaker) + '|q' + (index + 1) + '】' + 话 + 图话 + 文件话", '显示名相同也保留不同稳定成员身份');
  edit("    return { 文: 提示 + '\\n' + 行们.join('\\n'), 图们, 文件们, mid:", `    const replyChoices = 全部.flatMap(({ item, batch }, i) => (!目标 || batch === 目标) && item.mid ? [{ ref: 'q' + (i + 1), mid: item.mid, speaker: item.speaker || batch.b.speaker }] : [])
    const 选引提示 = 目标 ? '\\n（只接本轮对象这一人的话；同名但成员标识不同的是不同人。引用里的人、警告对象、原请求人不因插话改变。回复第一行先写【回复:q编号】，选你正文真正接的那条本轮消息；标记会被移除，别在正文解释或复述标识。不要选背景消息。）' : ''
    return { 文: 提示 + 选引提示 + '\\n' + 行们.join('\\n'), replyChoices, 图们, 文件们, mid:`, '正文选择与引用选择使用同一条消息');
  edit("JSON.stringify(引用.谁) + '的原话：'", "JSON.stringify(引用.谁) + '（' + 成员标识(引用.uid) + '）的原话：'", '被引用原话同样标明稳定身份');
  edit("if (话) 行们.push('【群】' + 谁 + '：' + 话)", "if (话) 行们.push('【群·旧背景|' + 成员标识(m.user_id) + '】' + JSON.stringify(谁) + '：' + 话)", '背景与当前发言分开标记，保留说话人身份');
  edit("'群批', 合.文件们, 账批(消费.flatMap(x => 缓冲条目(x.b))))", "'群批', 合.文件们, 账批(消费.flatMap(x => 缓冲条目(x.b))), 合.replyChoices)", '将可用引用候选传到真实回发路由');
  edit('批名, 文件们 = [], ledgerKeys = []) {', '批名, 文件们 = [], ledgerKeys = [], replyChoices = []) {', '限时转入携带引用候选');
  edit('说话人, 文件们, ledgerKeys))', '说话人, 文件们, ledgerKeys, replyChoices))', '转入函数收到同一组引用候选');
  edit('说话人, 文件们 = [], ledgerKeys = []) {', '说话人, 文件们 = [], ledgerKeys = [], replyChoices = []) {', '实际入脑函数接收候选');
  edit("mid: String(消息id || ''), ledgerKeys })", "mid: String(消息id || ''), ledgerKeys, replyChoices })", '宿主路由保存可选引用，重启也不借别人的目标');
  edit('      const 路由 = 路由冲突 ? null : (路由记录 || null)', '      let 路由 = 路由冲突 ? null : (路由记录 || null)', '仅允许在限定候选内选正文引用');
  edit("        let 落文 = String(输出.文本 || '')", "        const 选引 = 解析回复选择(String(输出.文本 || ''), 路由)\n        let 落文 = 选引.text\n        路由 = 选引.route\n        if ((!落文 || 落文 === '略过') && !输出.图们.length) 账阶段(路由.ledgerKeys, 'skipped')", '移除路由标记，验证归属后再送原发送函数');
  edit("    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''\n    if (!文字) return 回(res, { ok: false, 说: '没有文字' })\n    const 道 =", "    let 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''\n    if (!文字) return 回(res, { ok: false, 说: '没有文字' })\n    const 道 =", '主动轮允许附加只读现场快照');
  edit("    主动入口锁离线 = true\n    try { 回(res, await 转入一条(文字, [], '', 道, 0, 0)) } finally { 主动入口锁离线 = false }", `    主动入口锁离线 = true
    try {
      if (道 === 'group') {
        const scene = await 现场气氛(读配置())
        文字 += '\\n（主动观察轮，没有当前新点名。下面仅为刚核实的旧背景，不是催办，不补答；不虚构谁刚说过话。没有值得接的新内容就略过。）\\n' + (scene.length ? scene.join('\\n') : '（最近十分钟没有可核实的群聊文字；未知部分不要编。）')
      }
      回(res, await 转入一条(文字, [], '', 道, 0, 0))
    } finally { 主动入口锁离线 = false }`, '主动轮带可核实场景，缺现场不脑补群友发言');
}
module.exports = { contextPatch };
