const { createDeliveryState } = require('./durable-state.cjs');
function resumePatch(edit) {
  edit("import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'", "import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs'", '候选持久账本使用同步原子落盘');
  edit("import { randomUUID, timingSafeEqual } from 'node:crypto'", "import { randomUUID, timingSafeEqual, createHash } from 'node:crypto'", '持久快照校验和与隔离命名');
  const state = `
  // candidate: durability BEGIN
  ${createDeliveryState.toString()}
  const 账摘要 = value => createHash('sha256').update(value).digest('hex')
  const 账配置 = 读配置()
  const 取账域 = c => JSON.stringify([c.她的QQ, c.目标会话, c.群号, c.私聊QQ])
  const 账域 = 取账域(账配置)
  const 消息账 = createDeliveryState({ fs: { readFileSync, writeFileSync, existsSync, openSync, closeSync, fsyncSync, renameSync }, hash: 账摘要, basePath: join(目录, 'qq-delivery-' + 账摘要(账域).slice(0, 20)), namespace: 账域, now: () => Date.now(), diag: 记账 })
  const 账可用 = () => 消息账.healthy && 取账域(读配置()) === 账域
  function 账键(item) {
    return (item.route === 'private' ? 'p:' + 读配置().私聊QQ : 'g:' + 读配置().群号) + ':' + String(item.mid)
  }
  function 账批(项目) { return 项目.map(x => x.ledgerKey || 账键(x)).filter(k => 消息账.data.inbox[k]) }
  function 账阶段(keys, stage, extra = {}) {
    if (!keys || !keys.length) return 消息账.healthy
    return 消息账.change(s => { for (const key of keys) if (s.inbox[key]) Object.assign(s.inbox[key], { stage }, extra) })
  }
  class 持久墓碑 extends Set {
    has(key) { return super.has(key) || !!消息账.data.inbox[key] }
    add(key) {
      if (!消息账.data.inbox[key] && !消息账.change(s => { s.inbox[key] = { stage: 'skipped', at: Date.now(), expiresAt: Date.now() + 600000 } })) throw new Error('durable inbox unavailable')
      super.add(key); return this
    }
  }
  const 已转消息 = new 持久墓碑()
  function 恢复消息账() {
    if (!消息账.healthy) return
    if (!消息账.change(s => {
      for (const r of Object.values(s.inbox)) {
        if (r.stage === 'submitting') r.stage = 'uncertain'
        if (['buffered', 'queued', 'claimed'].includes(r.stage) && Date.now() >= r.expiresAt) r.stage = 'expired'
      }
      for (const r of Object.values(s.outbox)) {
        if (r.status === 'sending') r.status = 'uncertain'
        for (const key of r.keys || []) if (s.inbox[key]) s.inbox[key].stage = r.status === 'uncertain' ? 'uncertain' : 'completed'
      }
    })) return
    for (const [key, r] of Object.entries(消息账.data.inbox)) {
      if (r.stage === 'buffered' && r.item) 加缓冲(r.bufferKey, { ...r.item, ledgerKey: key, restoring: true })
      if (r.stage === 'queued' && r.requestId && r.route) 待认领路由.set(r.requestId, r.route)
      if (r.stage === 'claimed' && Number.isFinite(r.turn) && r.route) 轮路由.set(r.turn, r.route)
    }
  }
  function 清过期账路由() {
    for (const map of [待认领路由, 轮路由]) for (const [id, route] of map) {
      if (route.ledgerKeys?.length && route.ledgerKeys.every(k => Date.now() >= (消息账.data.inbox[k]?.expiresAt || 0))) {
        if (账阶段(route.ledgerKeys, 'expired')) map.delete(id)
      }
    }
  }
  async function 账本发一个(id, base, action, body) {
    const attempt = { action, recipient: body.group_id || body.user_id, digest: 账摘要(JSON.stringify(body)), at: Date.now(), status: 'uncertain' }
    if (!消息账.change(s => s.outbox[id].attempts.push(attempt))) return { ok: false, 不确定: true }
    const index = 消息账.data.outbox[id].attempts.length - 1
    const result = await 发一个(base, action, body)
    const saved = 消息账.change(s => Object.assign(s.outbox[id].attempts[index], { status: result.不确定 ? 'uncertain' : result.ok ? 'sent' : 'rejected', messageId: result.数据?.data?.message_id || null }))
    return saved ? result : { ...result, ok: false, 不确定: true }
  }
  // candidate: durability END
`;
  edit('  const 已转消息 = new Set() // 已经转发进 DSH 的 QQ 消息 id（防重复转）', state, '持久收件箱/发件箱与重启恢复');
  edit('  let 群图最近 = 0', "  let 群图最近 = 消息账.data.groupPictureAt\n  for (const [key, t] of Object.entries(消息账.data.pictures)) 图闸.set(key, t)", '恢复图片去重和群聊冷却');
  edit('        图闸.set(闸键, 现)\n        if (路.来路 === \'group\') 群图最近 = 现', '', '先确认图片可读取，避免坏路径消耗冷却');
  edit("      if (源.kind === 'url') { 图数据.push({ url: 源.value }); return }", `      const 记图片 = () => {
        if (!消息账.change(s => { s.pictures[闸键] = Date.now(); if (路.来路 === 'group') s.groupPictureAt = Date.now() })) return false
        图闸.set(闸键, Date.now()); if (路.来路 === 'group') 群图最近 = Date.now()
        return true
      }
      if (源.kind === 'url') { if (记图片()) 图数据.push({ url: 源.value }); return }`, '图片预留先落盘，超时与崩溃均不撞图');
  edit("        图数据.push({ b64: buf.toString('base64') })", "        if (记图片()) 图数据.push({ b64: buf.toString('base64') })", '本地图验证成功后才记录冷却');
  edit('try { return await 发到QQ原57(配置, 原文字, 图们, 路由) } finally { 解57() }', `try {
      if (!账可用()) return []
      const keys = 路由?.ledgerKeys || []
      if (keys.length && keys.every(k => Date.now() >= (消息账.data.inbox[k]?.expiresAt || 0))) { 账阶段(keys, 'expired'); return [] }
      const id = 路由?.deliveryId || 新id()
      if (消息账.data.outbox[id]) { 记账('已登记的发件批次不重复发送'); return [] }
      if (!消息账.change(s => { s.outbox[id] = { at: Date.now(), status: 'sending', attempts: [], keys } })) return []
      try {
        const results = await 发到QQ原57(配置, 原文字, 图们, 路由, (base, action, body) => 账本发一个(id, base, action, body))
        const status = results.some(x => x.不确定) ? 'uncertain' : !results.length ? 'suppressed' : results.every(x => x.ok) ? 'sent' : 'rejected'
        消息账.change(s => { s.outbox[id].status = status; for (const k of keys) if (s.inbox[k]) s.inbox[k].stage = status === 'uncertain' ? 'uncertain' : 'completed' })
        return results
      } catch (error) { 消息账.change(s => { s.outbox[id].status = 'uncertain' }); 账阶段(keys, 'uncertain'); 记账('发件批次未确认，不自动重放'); return [] }
    } finally { 解57() }`, '整批发件登记先于副作用，保留不确定结果且不自动重放');
  edit('async function 发到QQ原57(配置, 原文字, 图们, 路由) {', 'async function 发到QQ原57(配置, 原文字, 图们, 路由, 发本轮 = 发一个) {', '每次尝试均记入持久发件箱');
  // Only replace the four sends inside this sender, not management/poke paths.
  for (const action of ['send_private_msg', 'send_group_msg']) {
    const suffix = action === 'send_private_msg' ? 'P' : 'G';
    edit(`let 果${suffix} = await 发一个(配置.NapCat, '${action}', 体)`, `let 果${suffix} = await 发本轮(配置.NapCat, '${action}', 体)`, '记录' + action + '正文意图');
    edit(`果${suffix} = await 发一个(配置.NapCat, '${action}', 体)`, `果${suffix} = await 发本轮(配置.NapCat, '${action}', 体)`, '记录' + action + '明确拒收后的降级');
    edit(`出.push(果${suffix})`, `出.push(果${suffix})\n        if (果${suffix}.不确定) return 出`, '不确定时停止后续气泡');
  }
  edit("出.push(await 发一个(配置.NapCat, 'send_private_msg', { user_id: Number(配置.私聊QQ), message: [一段图(x)] }))", "出.push(await 发本轮(配置.NapCat, 'send_private_msg', { user_id: Number(配置.私聊QQ), message: [一段图(x)] }))\n        if (出.at(-1).不确定) return 出", '记录私聊图片尝试');
  edit("出.push(await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: (路.艾特 ? [{ type: 'at', data: { qq: String(路.艾特) } }] : []).concat([一段图(x)]) }))", "出.push(await 发本轮(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: (路.艾特 ? [{ type: 'at', data: { qq: String(路.艾特) } }] : []).concat([一段图(x)]) }))\n        if (出.at(-1).不确定) return 出", '记录群聊图片尝试');
  edit('return { action, ok: ok48, 数据: j }', "return { action, ok: ok48, 不确定: !ok48 && !(r.ok && j?.status === 'failed' && Number.isFinite(j.retcode) && j.retcode !== 0), 数据: j }", '畸形回包或HTTP错误不当明确拒收重试');
  edit('    b.items.push(item)', `    item.ledgerKey = item.ledgerKey || 账键(item)
    if (!项.restoring && !消息账.change(s => { s.inbox[item.ledgerKey] = { stage: 'buffered', at: Date.now(), expiresAt: item.time * 1000 + (项.at || 项.route === 'private' ? 600000 : 180000), bufferKey: 键, item } })) return
    b.items.push(item)`, '进入缓冲先持久保存完整原消息');
  edit('    // A second QQ input must not be claimed', '    if (!账可用()) return\n    清过期账路由()\n    // A second QQ input must not be claimed', '损坏账本停止注入，过期待办不会堵塞新话');
  edit('  async function 轮询收消息() {\n    if (轮询中) return', '  async function 轮询收消息() {\n    if (!账可用()) return\n    if (轮询中) return', '损坏账本停止拉取，避免重复执行管理入口');
  edit("'私聊批', b.files)", "'私聊批', b.files, 账批(项们))", '私聊携带整批来源编号');
  edit("'群批', 合.文件们)", "'群批', 合.文件们, 账批(消费.flatMap(x => 缓冲条目(x.b))))", '只消费本轮对应的消息，其他点名继续排队');
  edit('async function 限时转入(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 批名, 文件们 = []) {', 'async function 限时转入(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 批名, 文件们 = [], ledgerKeys = []) {', '传递持久批次标识');
  edit('    const 请求 = Promise.resolve().then(() => 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们))', "    if (!账阶段(ledgerKeys, 'submitting')) return { ok: false, 不确定: true }\n    const 请求 = Promise.resolve().then(() => 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们, ledgerKeys))", '跨异步边界前写入提交意图');
  edit('    return 结果.value\n  }', "    if (结果.value?.ok === false && !结果.value.不确定) 账阶段(ledgerKeys, 'buffered')\n    return 结果.value\n  }", '明确未收下时恢复为可重试缓冲');
  edit('async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们 = []) {', 'async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们 = [], ledgerKeys = []) {', '实际转入接收来源批次');
  edit('async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们 = [], ledgerKeys = []) {', "async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人, 文件们 = [], ledgerKeys = []) {\n    if (!账可用()) return { ok: false, 不确定: true, 说: '持久账本不可用或通道已变化' }", '直入入口同样遵守账本故障暂停');
  edit("mid: String(消息id || '') })", "mid: String(消息id || ''), ledgerKeys })", '将来源绑定到宿主认领事件');
  edit("    待认领路由.set(id, { ...route, queuedAt: Date.now() })", "    route = { ...route, queuedAt: Date.now(), deliveryId: id }\n    if (!账阶段(route.ledgerKeys, 'queued', { requestId: id, route })) throw new Error('durable route unavailable')\n    待认领路由.set(id, route)", '提交宿主之前保存请求与回发路由');
  edit('      待认领路由.delete(id)\n      throw error', "      待认领路由.delete(id)\n      账阶段(route.ledgerKeys, 'uncertain')\n      throw error", '宿主提交异常留作对账，不在恢复时重投');
  edit('    轮路由.set(轮号, 路由)', "    if (!账阶段(路由.ledgerKeys, 'claimed', { turn: 轮号, route: 路由 })) return\n    轮路由.set(轮号, 路由)", '重启可重新匹配原回合完成事件，不再注入一次');
  edit("    if (待认领路由.delete(id)) 记账('DSH 丢弃了一条还没开始的 QQ 消息，不会误把别的回复发出去')", "    const route = 待认领路由.get(id)\n    if (route) 账阶段(route.ledgerKeys, 'skipped')\n    if (待认领路由.delete(id)) 记账('DSH 丢弃了一条还没开始的 QQ 消息，不会误把别的回复发出去')", '宿主丢弃的消息不在重启后复活');
  edit('        按轮输出.delete(轮号)\n        轮路由.delete(轮号)', "        账阶段(轮路由.get(轮号)?.ledgerKeys, 'skipped')\n        按轮输出.delete(轮号)\n        轮路由.delete(轮号)", '打断状态持久终结');
  edit('      const 有东西 = 输出.文本 || (输出.图们 && 输出.图们.length)', "      const 有东西 = 输出.文本 || (输出.图们 && 输出.图们.length)\n      if (路由 && (!完成 || !有东西 || 输出.文本.trim() === '略过')) 账阶段(路由.ledgerKeys, 'skipped')", '无内容或失败回合不重放旧请求');
  edit("if (!v || n - v > 600) return n; return v } catch (e) { return n }", "if (!v || n - v > 600) return n - 610; return v } catch (e) { return n - 610 }", '私聊重启空窗不吞未见过的新消息');
  edit('  return { 记账, 概况, 落地一发, 发到QQ, 收到事件, 日志 }', '  恢复消息账()\n  return { 记账, 概况, 落地一发, 发到QQ, 收到事件, 日志 }', '入口注册完成后只恢复未提交的有效缓冲与原回合路由');
}
module.exports = { resumePatch };
