p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
a = "let 最后来路 = 'private'\n  let 来路时刻 = 0\n  let 艾特我人 = 0\n  let 艾特时刻 = 0"
assert a in s, "mem vars"
s = s.replace(a, a + "\n  let qq待转轮 = 0", 1)
f = "await agent.followup({ id: 新id(), role: 'user', content, source: { kind: 'qq' } })"
assert f in s, "followup"
s = s.replace(f, f + "\n      qq待转轮 += 1", 1)
i = "        上一轮 = { 轮号: -1, 文本: '', 图们: [] }\n        return"
assert i in s, "interrupted"
s = s.replace(i, "        if (qq待转轮 > 0) qq待转轮 -= 1\n" + i, 1)
g = """        已发轮.add(d.turn)
        void 落地一发(配置, 上一轮.文本, 上一轮.图们)"""
assert g in s, "gate"
s = s.replace(g, """        已发轮.add(d.turn)
        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          void 落地一发(配置, 上一轮.文本, 上一轮.图们)
        } else {
          记账('这轮不是 QQ 转过来的（多半是网页控制台里直接问的），不发 QQ')
        }""", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched9", len(s))