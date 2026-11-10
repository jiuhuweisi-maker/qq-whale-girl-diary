p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    s = s.replace(old, new, 1)

rep("  const 热聊 = new Map()", "  const 热聊 = new Map()\n  const 路由队 = []", "queue-decl")
rep("async function 转入一条(文字, 图们, 消息id, 来路) {", "async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁) {", "sig")
rep("      qq待转轮 += 1", "      qq待转轮 += 1\n      路由队.push({ 来路: 来路 || 最后来路 || 'private', 艾特: Number(艾特谁) || 0 })\n      if (路由队.length > 60) 路由队.shift()", "enqueue")
rep("        if (qq待转轮 > 0) qq待转轮 -= 1", "        if (qq待转轮 > 0) { qq待转轮 -= 1; 路由队.shift() }", "interrupted")
rep("""        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          void 落地一发(配置, 上一轮.文本, 上一轮.图们)
        } else {
          记账('这轮不是 QQ 转过来的（多半是网页控制台里直接问的），不发 QQ')
        }
      }
      上一轮 = { 轮号: -1, 文本: '', 图们: [] }""",
"""        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          const 路由 = 路由队.shift() || null
          if ((上一轮.文本 || '').trim() === '略过' && !(上一轮.图们 && 上一轮.图们.length)) 记账('她选择略过这条，不发 QQ')
          else void 落地一发(配置, 上一轮.文本, 上一轮.图们, 路由)
        } else {
          记账('这轮不是 QQ 转过来的（多半是网页控制台里直接问的），不发 QQ')
        }
      } else if (!完成 && qq待转轮 > 0) {
        qq待转轮 -= 1; 路由队.shift(); 记账('这轮没正常跑完，不发 QQ')
      }
      上一轮 = { 轮号: -1, 文本: '', 图们: [] }""", "gate")
rep("  async function 落地一发(配置, 文字, 图们) {", "  async function 落地一发(配置, 文字, 图们, 路由) {", "落地sig")
rep("    const 结果 = await 发到QQ(配置, 文字, 图们)", "    const 结果 = await 发到QQ(配置, 文字, 图们, 路由)", "落地call")
rep("  async function 发到QQ(配置, 原文字, 图们) {\n    const 出 = []", "  async function 发到QQ(配置, 原文字, 图们, 路由) {\n    const 出 = []\n    const 路 = 路由 || { 来路: (来路时刻 && Date.now() - 来路时刻 < 90000 && 最后来路 === 'group') ? 'group' : 'private', 艾特: (艾特时刻 && Date.now() - 艾特时刻 < 90000) ? 艾特我人 : 0 }", "发到QQsig")
rep("    if (配置.转私聊 && 配置.私聊QQ && !(来路时刻 && 最后来路 === 'group' && Date.now() - 来路时刻 < 90000)) {", "    if (配置.转私聊 && 配置.私聊QQ && 路.来路 !== 'group') {", "priv-cond")
rep("    if (配置.转群 && 配置.群号 && !(来路时刻 && 最后来路 === 'private' && Date.now() - 来路时刻 < 90000)) {", "    if (配置.转群 && 配置.群号 && 路.来路 === 'group') {", "grp-cond")
rep("        if (i === 0 && 艾特我人 && Date.now() - 艾特时刻 < 90000) 体.message.unshift({ type: 'at', data: { qq: String(艾特我人) } })", "        if (i === 0 && 路.艾特) 体.message.unshift({ type: 'at', data: { qq: String(路.艾特) } })", "at-text")
rep("message: (艾特我人 && Date.now() - 艾特时刻 < 90000 ? [{ type: 'at', data: { qq: String(艾特我人) } }] : []).concat([一段图(x)])", "message: (路.艾特 ? [{ type: 'at', data: { qq: String(路.艾特) } }] : []).concat([一段图(x)])", "at-img")
rep("""        if (!被艾特) {
          const 热 = 热聊.get(群发言者)
          if (!(热 && Date.now() < 热)) continue        // 不在热聊窗口且没 @ → 装死
        } else {""",
"""        if (!被艾特) {
          const 热 = 热聊.get(群发言者)
          if (!(热 && Date.now() < 热)) continue        // 不在热聊窗口且没 @ → 装死
          if (段们G.some((x) => x && x.type === 'at' && String((x.data && x.data.qq) || x.qq || '') !== 'all' && Number((x.data && x.data.qq) || 0) !== Number(条.self_id))) continue  // 在叫别人 → 不接茬
        } else {""", "hot-skip")
rep("        await 转入一条('【' + String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友') + '】' + 文字, 图们, 条.message_id, 'group')",
"        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')\n        await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0)", "grp-tag")
rep("        await 转入一条(文字, 图们, 条.message_id, 'private')", "        await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0)", "priv-tag")
open(p, "w", encoding="utf-8").write(s)
print("patched11 ok", len(s))