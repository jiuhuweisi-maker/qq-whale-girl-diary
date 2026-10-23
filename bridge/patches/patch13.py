p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
assert "热聊.set(群发言者, Date.now() + 300000)" in s, "window anchor missing"
s = s.replace("热聊.set(群发言者, Date.now() + 300000)       // 被 @：陪聊窗口 5 分钟", "热聊.set(群发言者, Date.now() + 180000)       // 被 @：陪聊窗口 3 分钟", 1)
open(p, "w", encoding="utf-8").write(s)
print("hot-window 3min ok")