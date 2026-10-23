p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
old = """        if (!条) continue
        const 群发言者 = Number(条.user_id)
        if (群发言者 !== 她的号) {
          const 段们 = Array.isArray(条.message) ? 条.message : []
          const 被艾特 = 段们.some((x) => x && x.type === 'at' && Number((x.data && x.data.qq) || x.qq) === Number(条.self_id))
          if (!被艾特) continue                       // 群友没 @ 本鱼，无视
        }"""
assert old in s, "block not found"
new = """        if (!条) continue
        const 群发言者 = Number(条.user_id)
        if (群发言者 === Number(条.self_id)) continue
        const 段们G = Array.isArray(条.message) ? 条.message : []
        const 被艾特 = 段们G.some((x) => {
          if (!x || x.type !== 'at') return false
          const q = String((x.data && x.data.qq) || x.qq || '')
          return q === 'all' || Number(q) === Number(条.self_id)
        })
        if (!被艾特) continue                         // 群里：没 @ 本鱼/全体 → 装死"""
s = s.replace(old, new, 1)
old2 = "await 转入一条((群发言者 !== 她的号 ? '【' + String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友') + '】' : '') + 文字, 图们, 条.message_id, 'group')"
assert old2 in s, "call not found"
new2 = "await 转入一条('【' + String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友') + '】' + 文字, 图们, 条.message_id, 'group')"
s = s.replace(old2, new2, 1)
open(p, "w", encoding="utf-8").write(s)
print("patched4", len(s))