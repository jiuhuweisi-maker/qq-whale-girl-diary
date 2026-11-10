p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
bad = "    if (来路 === 'group') { 艾特我人 = Number(条 && 条.user_id) || 0; 艾特时刻 = Date.now() } else { 艾特我人 = 0 }"
assert bad in s, "bad line not found"
s = s.replace(bad, "    if (来路 !== 'group') { 艾特我人 = 0 }", 1)
open(p, "w", encoding="utf-8").write(s)
print("fixed, len", len(s))