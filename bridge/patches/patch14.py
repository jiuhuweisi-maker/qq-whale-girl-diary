p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    s = s.replace(old, new, 1)

idexpr = "newId()" if "newId()" in s else "String(Date.now()) + '-' + Math.random().toString(36).slice(2)"

# A. 路由元素带 mid + wa
rep("async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁) {", "async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人) {", "sig6")
rep("路由队.push({ 来路: 来路 || 最后来路 || 'private', 艾特: Number(艾特谁) || 0 })",
    "路由队.push({ 来路: 来路 || 最后来路 || 'private', 艾特: Number(艾特谁) || 0, 话: Number(说话人) || 0, mid: String(消息id || '') })", "push6")
rep("await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0)",
    "await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0, 群发言者)", "grp6")
rep("await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0)",
    "await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0, 她的号)", "priv6")

# B. 引用回复（私聊文本段）
rep("""      for (let i = 0; i < 段们.length; i++) {
        const 体 = 私人消息体(段们[i])
        体.user_id = Number(配置.私聊QQ)
        出.push(await 发一个(配置.NapCat, 'send_private_msg', 体))""",
"""      for (let i = 0; i < 段们.length; i++) {
        const 体 = 私人消息体(段们[i])
        体.user_id = Number(配置.私聊QQ)
        const 带引P = i === 0 && 路.mid && 路.mid !== 'qq' && Array.isArray(体.message)
        if (带引P) 体.message.unshift({ type: 'reply', data: { message_id: 路.mid } })
        let 果P = await 发一个(配置.NapCat, 'send_private_msg', 体)
        if (!果P.ok && 带引P) { 体.message.shift(); 果P = await 发一个(配置.NapCat, 'send_private_msg', 体) }
        出.push(果P)""", "priv-reply")

# B2. 引用回复（群文本段，reply 在最前）
rep("""        if (i === 0 && 路.艾特) 体.message.unshift({ type: 'at', data: { qq: String(路.艾特) } })
        出.push(await 发一个(配置.NapCat, 'send_group_msg', 体))""",
"""        if (i === 0 && 路.艾特) 体.message.unshift({ type: 'at', data: { qq: String(路.艾特) } })
        const 带引G = i === 0 && 路.mid && 路.mid !== 'qq' && Array.isArray(体.message)
        if (带引G) 体.message.unshift({ type: 'reply', data: { message_id: 路.mid } })
        let 果G = await 发一个(配置.NapCat, 'send_group_msg', 体)
        if (!果G.ok && 带引G) { 体.message.shift(); 果G = await 发一个(配置.NapCat, 'send_group_msg', 体) }
        出.push(果G)""", "grp-reply")

# C+D. 落地闸口：收尾权 + 画待两轮
rep("""        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          const 路由 = 路由队.shift() || null
          if ((上一轮.文本 || '').trim() === '略过' && !(上一轮.图们 && 上一轮.图们.length)) 记账('她选择略过这条，不发 QQ')
          else void 落地一发(配置, 上一轮.文本, 上一轮.图们, 路由)
        } else {""",
"""        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          const 路由 = 路由队.shift() || null
          let 落文 = String(上一轮.文本 || '')
          if (落文.indexOf('【收尾】') !== -1) {
            落文 = 落文.replace(/【收尾】/g, '').trim()
            if (路由 && 路由.话) { 热聊.delete(路由.话); 记账('她收尾了话题，' + 路由.话 + ' 的陪聊窗已关（再@才会理）') }
          }
          let 画描 = ''
          const 画match = 落文.match(/【画待[:：]([\\s\\S]*?)】/)
          if (画match) { 画描 = String(画match[1] || '').trim() || '对方刚才要的东西'; 落文 = 落文.replace(/【画待[:：][\\s\\S]*?】/g, '').trim() }
          const 有料 = 落文 || (上一轮.图们 && 上一轮.图们.length)
          if (落文.trim() === '略过' && !(上一轮.图们 && 上一轮.图们.length)) 记账('她选择略过这条，不发 QQ')
          else if (有料) void 落地一发(配置, 落文, 上一轮.图们, 路由)
          else 记账('这条剥掉标记后没内容，不发')
          if (画描) {
            void (async () => {
              await new Promise((r) => setTimeout(r, 1200))
              const ag = 找agent(配置.目标会话)
              if (!ag) { 记账('画待：会话没醒，画不成了'); return }
              qq待转轮 += 1
              路由队.push({ 来路: 路由 ? 路由.来路 : 'private', 艾特: (路由 && (路由.话 || 路由.艾特)) || 0, 话: (路由 && 路由.话) || 0, mid: (路由 && 路由.mid) || '' })
              try {
                await ag.followup({ id: IDENTITY_EXPR, role: 'user', source: { kind: 'qq' }, content: [{ type: 'text', text: '（系统提示，对方看不到）现在开始画：' + 画描 + '。画法：Bash 跑 python3 /opt/qq-cs/draw.py 描述 --size=1024x1024，它会打印成图路径；把该路径单独成行放在回复最后，配一句自然的话（比如 来啦，久等了）。画失败就老实说没画出来，别硬编路径。' }] })
              } catch (e) { 记账('画待注入失败：' + String((e && e.message) || e)) }
            })()
          }
        } else {""".replace("IDENTITY_EXPR", idexpr), "gate2")
open(p, "w", encoding="utf-8").write(s)
print("patched14 ok", len(s), "id:", idexpr)