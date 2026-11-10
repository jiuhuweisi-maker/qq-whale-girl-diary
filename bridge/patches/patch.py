import re
p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
orig = s
s = s.replace('async function 转入一条(文字, 图们, 消息id) {',
              'async function 转入一条(文字, 图们, 消息id, 来路) {\n    if (来路) 最后来路 = 来路', 1)
assert '来路) {' in s, "sig fail"
s = s.replace('let 最后来路 = \'private\'', '', 1)  # noop guard
idx = s.find('async function 转入一条')
s = s[:idx] + "let 最后来路 = 'private'\n  " + s[idx:]
# 调用点：私聊轮询和 /receive(转入文字) 标私聊，群轮询标群
s = re.sub(r'await 转入一条\(文字, 图们, 条\.message_id\)\n(\s*)\}\n\s*\}\n\n\s*if \(配置\.转群',
           'await 转入一条(文字, 图们, 条.message_id, \'private\')\n\\1}\n    }\n\n    if (配置.转群', s, count=1)
assert "条.message_id, 'private'" in s, "priv call fail"
s = re.sub(r'await 转入一条\(文字, 图们, 条\.message_id\)(?!\,)',
           "await 转入一条(文字, 图们, 条.message_id, 'group')", s, count=1)
assert s.count("'group'") >= 1, "grp call fail"
s = s.replace('转入一条(文字, [], \'\')', "转入一条(文字, [], '', 'private')", 1)
s = s.replace('if (配置.转私聊 && 配置.私聊QQ) {',
              "if (配置.转私聊 && 配置.私聊QQ && 最后来路 !== 'group') {", 1)
s = s.replace('if (配置.转群 && 配置.群号) {',
              "if (配置.转群 && 配置.群号 && 最后来路 !== 'private') {", 1)
open(p, "w", encoding="utf-8").write(s)
print("patched", len(orig), "->", len(s))