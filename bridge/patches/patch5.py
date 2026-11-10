p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
assert "let 最后来路" in s
s = s.replace("let 最后来路 = 'private'\n  let 来路时刻 = 0",
              "let 最后来路 = 'private'\n  let 来路时刻 = 0\n  let 艾特我人 = 0\n  let 艾特时刻 = 0", 1)
a = "    if (来路) { 最后来路 = 来路; 来路时刻 = Date.now() }"
b = a + "\n    if (来路 === 'group') { 艾特我人 = Number(条 && 条.user_id) || 0; 艾特时刻 = Date.now() } else { 艾特我人 = 0 }"
assert a in s
s = s.replace(a, b, 1)
# 转入一条需要拿得到 条：群/私调用都传了条？没传——改用全局在过滤处记：换方案——在群循环里直接记
old_loop = "        上次群时间 = 条.time || 上次群时间"
assert old_loop in s
s = s.replace(old_loop, "        上次群时间 = 条.time || 上次群时间\n        艾特我人 = 群发言者 || 艾特我人\n        艾特时刻 = Date.now()", 1)
old_priv = "        上次私聊时间 = 条.time || 上次私聊时间"
assert old_priv in s
s = s.replace(old_priv, "        上次私聊时间 = 条.time || 上次私聊时间\n        艾特我人 = 0", 1)
g = "        const 体 = 群消息体(段们[i])\n        体.group_id = Number(配置.群号)"
assert g in s
s = s.replace(g, g + "\n        if (i === 0 && 艾特我人 && Date.now() - 艾特时刻 < 90000) 体.message.unshift({ type: 'at', data: { qq: String(艾特我人) } })", 1)
gi = "        出.push(await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: [一段图(x)] }))"
assert gi in s
s = s.replace(gi, "        出.push(await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: (艾特我人 && Date.now() - 艾特时刻 < 90000 ? [{ type: 'at', data: { qq: String(艾特我人) } }] : []).concat([一段图(x)]) }))", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched5", len(s))