p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    s = s.replace(old, new, 1)

rep("""        if ((条.time || 0) < 上次私聊时间) continue           // 旧的，跳过
        if (已转消息.has(条.message_id)) continue             // 转过了
        上次私聊时间 = 条.time || 上次私聊时间
        艾特我人 = 0
        const { 文字, 图们 } = 条转片段(条)
        已转消息.add(条.message_id)
        // 纯表情（没图没字）就别转了，记掉别再反复拉
        if (!文字 && !图们.length) continue
        await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0)""",
"""        if ((条.time || 0) < 上次私聊时间) continue           // 旧的，跳过
        if (已转消息.has(条.message_id)) continue             // 转过了
        const { 文字, 图们 } = 条转片段(条)
        if (!文字 && !图们.length) { 已转消息.add(条.message_id); 上次私聊时间 = 条.time || 上次私聊时间; continue }
        if (Date.now() / 1000 - (条.time || 0) > 600) { 已转消息.add(条.message_id); 上次私聊时间 = 条.time || 上次私聊时间; continue } // 超10分钟不挖坟
        艾特我人 = 0
        const 果P = await 转入一条('【主人】' + 文字, 图们, 条.message_id, 'private', 0)
        if (果P && 果P.ok === false) break   // 会话没醒：不标记不推线，下轮重试
        上次私聊时间 = 条.time || 上次私聊时间
        已转消息.add(条.message_id)""", "priv-retry")

rep("""        if ((条.time || 0) < 上次群时间) continue
        if (已转消息.has(条.message_id)) continue
        上次群时间 = 条.time || 上次群时间
        艾特我人 = 群发言者 || 艾特我人
        艾特时刻 = Date.now()
        const { 文字, 图们 } = 条转片段(条)
        已转消息.add(条.message_id)
        if (!文字 && !图们.length) continue
        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')
        await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0)""",
"""        if ((条.time || 0) < 上次群时间) continue
        if (已转消息.has(条.message_id)) continue
        const { 文字, 图们 } = 条转片段(条)
        if (!文字 && !图们.length) { 已转消息.add(条.message_id); 上次群时间 = 条.time || 上次群时间; continue }
        if (Date.now() / 1000 - (条.time || 0) > 600) { 已转消息.add(条.message_id); 上次群时间 = 条.time || 上次群时间; continue } // 超10分钟不挖坟
        艾特我人 = 群发言者 || 艾特我人
        艾特时刻 = Date.now()
        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')
        const 果G = await 转入一条('【' + 名前 + '】' + 文字, 图们, 条.message_id, 'group', 被艾特 ? 群发言者 : 0)
        if (果G && 果G.ok === false) break   // 会话没醒：不标记不推线，下轮重试
        上次群时间 = 条.time || 上次群时间
        已转消息.add(条.message_id)""", "grp-retry")
open(p, "w", encoding="utf-8").write(s)
print("patched12 ok", len(s))