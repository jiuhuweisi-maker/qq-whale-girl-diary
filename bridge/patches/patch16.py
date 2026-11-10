p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    assert s.count(old) == 1, "dup: " + tag
    s = s.replace(old, new, 1)

# 模块级：缓冲区
rep("  const 路由队 = []\n", """  const 路由队 = []
  // 合并缓冲：有人连珠炮时等他说完，合成一条再转（私聊5秒/群聊7秒静默窗）
  const 缓聊 = new Map()
  function 加缓冲(键, 项) {
    let b = 缓聊.get(键)
    if (!b) { b = { texts: [], images: [], mid: '', first: Date.now(), last: 0, at: 0, speaker: 0, route: 项.route, name: 项.name }; 缓聊.set(键, b) }
    if (项.text && 项.text.trim()) b.texts.push(项.text.trim())
    if (项.images && 项.images.length) b.images.push(...项.images.slice(0, 4))
    b.mid = 项.mid || b.mid
    b.last = Date.now()
    if (项.at) b.at = 项.at
    b.speaker = 项.speaker || b.speaker
    b.name = 项.name || b.name
    b.route = 项.route
  }
  async function 冲缓冲(配置) {
    const now = Date.now()
    for (const [键, b] of Array.from(缓聊.entries())) {
      const 静默 = b.route === 'private' ? 5000 : 7000
      if (now - b.last < 静默 && now - b.first < 25000) continue
      缓聊.delete(键)
      if (now - b.first > 600000) { 记账('缓冲内容太旧，丢弃'); continue }
      const 文 = '【' + b.name + '】' + b.texts.join('\\n')
      const 果 = await 转入一条(文, b.images, b.mid, b.route, b.at, b.speaker)
      if (果 && 果.ok === false) { b.last = now; 缓聊.set(键, b) }   // 会话没醒：放回，下轮再试
    }
  }
""", "buffer-mod")

# 私聊循环：改为进缓冲
rep("""        艾特我人 = 0
        const 果P = await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0, 她的号)
        if (果P && 果P.ok === false) break   // 会话没醒：不标记不推线，下轮重试
        上次私聊时间 = 条.time || 上次私聊时间
        已转消息.add(条.message_id)""",
"""        艾特我人 = 0
        加缓冲('p' + 她的号, { text: 文字, 图们, mid: String(条.message_id || ''), route: 'private', at: 0, speaker: 她的号, name: '主人' })
        上次私聊时间 = 条.time || 上次私聊时间
        已转消息.add(条.message_id)""".replace("{ text: 文字, 图们,", "{ text: 文字, images: 图们,"), "priv-buf")

# 群循环：改为进缓冲
rep("""        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')
        const 果G = await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0, 群发言者)
        if (果G && 果G.ok === false) break   // 会话没醒：不标记不推线，下轮重试
        上次群时间 = 条.time || 上次群时间
        已转消息.add(条.message_id)""",
"""        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')
        加缓冲('g' + 群发言者, { text: 文字, images: 图们, mid: String(条.message_id || ''), route: 'group', at: 被艾特 ? 群发言者 : 0, speaker: 群发言者, name: 名前 })
        上次群时间 = 条.time || 上次群时间
        已转消息.add(条.message_id)""", "grp-buf")

# 收一轮末尾：冲缓冲
rep("    if (已转消息.size > 300) 已转消息.clear()",
    "    await 冲缓冲(配置)\n    if (已转消息.size > 300) 已转消息.clear()", "flush-call")
open(p, "w", encoding="utf-8").write(s)
print("patched16 ok", len(s))