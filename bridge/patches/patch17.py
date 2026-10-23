p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    assert s.count(old) == 1, "dup: " + tag
    s = s.replace(old, new, 1)

rep("if (来路) { 最后来路 = 来路; 来路时刻 = Date.now() }",
    "if (来路 && 来路 !== 'none') { 最后来路 = 来路; 来路时刻 = Date.now() }", "none-pollute")

rep("""    const 路 = 路由 || { 来路: (来路时刻 && Date.now() - 来路时刻 < 90000 && 最后来路 === 'group') ? 'group' : 'private', 艾特: (艾特时刻 && Date.now() - 艾特时刻 < 90000) ? 艾特我人 : 0 }
    // ⭐ 正文里的 markdown 图""",
"""    const 路 = 路由 || { 来路: (来路时刻 && Date.now() - 来路时刻 < 90000 && 最后来路 === 'group') ? 'group' : 'private', 艾特: (艾特时刻 && Date.now() - 艾特时刻 < 90000) ? 艾特我人 : 0 }
    if (路.来路 === 'none') { 记账('内部轮（复盘/无通道），不发 QQ'); return 出 }
    // ⭐ 正文里的 markdown 图""", "none-guard")

rep("""  // 主动冒泡：cron 注入一条群通道提示词，她的回复会发到群里
  路线(`${路由前缀}/nudge`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字' })
    回(res, await 转入一条(文字, [], '', 'group', 0, 0))
  })""",
"""  // 主动冒泡/复盘：cron 注入提示词；channel=group 发群（默认），channel=none 内部轮不发 QQ
  路线(`${路由前缀}/nudge`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字' })
    const 道 = 来.channel === 'none' ? 'none' : 'group'
    回(res, await 转入一条(文字, [], '', 道, 0, 0))
  })""", "nudge-ch")
open(p, "w", encoding="utf-8").write(s)
print("patched17 ok", len(s))