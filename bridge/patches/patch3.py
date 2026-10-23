import re
p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
# 1) at 检测：兼容 data.qq 与顶层 qq
s = s.replace("const 被艾特 = 段们.some((x) => x && x.type === 'at' && Number(x.qq) === Number(条.self_id))",
              "const 被艾特 = 段们.some((x) => x && x.type === 'at' && Number((x.data && x.data.qq) || x.qq) === Number(条.self_id))")
# 2) 来路记忆：换成带时间戳
s = s.replace("let 最后来路 = 'private'", "let 最后来路 = 'private'\n  let 来路时刻 = 0")
s = s.replace("if (来路) 最后来路 = 来路", "if (来路) { 最后来路 = 来路; 来路时刻 = Date.now() }")
s = s.replace("if (配置.转私聊 && 配置.私聊QQ && 最后来路 !== 'group') {",
              "if (配置.转私聊 && 配置.私聊QQ && !(来路时刻 && 最后来路 === 'group' && Date.now() - 来路时刻 < 90000)) {")
s = s.replace("if (配置.转群 && 配置.群号 && 最后来路 !== 'private') {",
              "if (配置.转群 && 配置.群号 && !(来路时刻 && 最后来路 === 'private' && Date.now() - 来路时刻 < 90000)) {")
open(p, "w", encoding="utf-8").write(s)
print("patched3", len(s))