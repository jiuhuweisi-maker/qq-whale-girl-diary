p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
bad = "    if (来路 !== 'group') { 艾特我人 = 0 }"
assert bad in s, "line missing"
s = s.replace(bad, "    // 私聊轮询自己会清 艾特我人，这里不清，免得 /receive 测试误伤", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched7", len(s))