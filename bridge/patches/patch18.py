import re
p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
n = len(re.findall(r"data:\s*\{\s*message_id:\s*路\.mid\s*\}", s))
assert n == 2, "reply unshift count=%d" % n
s = re.sub(r"data:\s*\{\s*message_id:\s*路\.mid\s*\}", "data: { id: String(路.mid) }", s)
open(p, "w", encoding="utf-8").write(s)
print("patch18 ok, replaced", n)