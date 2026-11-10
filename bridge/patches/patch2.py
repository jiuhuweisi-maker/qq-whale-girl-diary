p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
old = "if (!条 || Number(条.user_id) !== 她的号) continue     // 群里只认她"
assert old in s, "filter line not found"
new = """if (!条) continue
        const 群发言者 = Number(条.user_id)
        if (群发言者 !== 她的号) {
          const 段们 = Array.isArray(条.message) ? 条.message : []
          const 被艾特 = 段们.some((x) => x && x.type === 'at' && Number(x.qq) === Number(条.self_id))
          if (!被艾特) continue                       // 群友没 @ 本鱼，无视
        }"""
s = s.replace(old, new, 1)
old2 = "await 转入一条(文字, 图们, 条.message_id, 'group')"
assert old2 in s, "group call not found"
new2 = "await 转入一条((群发言者 !== 她的号 ? '【' + String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友') + '】' : '') + 文字, 图们, 条.message_id, 'group')"
s = s.replace(old2, new2, 1)
open(p, "w", encoding="utf-8").write(s)
print("ok", len(s))