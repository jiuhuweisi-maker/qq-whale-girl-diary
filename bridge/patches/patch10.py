p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
a = "let 艾特我人 = 0\n  let 艾特时刻 = 0"
assert a in s
s = s.replace(a, a + "\n  const 热聊 = new Map()", 1)
old = """          return q === 'all' || Number(q) === Number(条.self_id)
        })
        if (!被艾特) continue                         // 群里：没 @ 本鱼/全体 → 装死"""
assert old in s, "block"
new = """          return q === 'all' || Number(q) === Number(条.self_id)
        })
        if (!被艾特) {
          const 热 = 热聊.get(群发言者)
          if (!(热 && Date.now() < 热)) continue        // 不在热聊窗口且没 @ → 装死
        } else {
          热聊.set(群发言者, Date.now() + 300000)       // 被 @：陪聊窗口 5 分钟
          if (热聊.size > 40) { const k = 热聊.keys().next().value; 热聊.delete(k) }
        }"""
s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8").write(s)
print("patched10", len(s))