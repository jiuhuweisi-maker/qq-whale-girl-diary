p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
anchor = "    .replace(/[ \\t]+$/gm, '')\n    .replace(/\\n{3,}/g, '\\n\\n')\n    .trim()\n  return { 净文字, 图 }"
assert anchor in s, "anchor not found"
add = "    .replace(/^[ \\t`]*(\\/[^\\n`\\\"'（）()]*?\\.(?:png|jpe?g|gif|webp))[ \\t`]*$/gim, (全, q) => {\n      const r = String(q).trim()\n      if (!图.some((x) => x.value === r)) 图.push({ kind: 'path', value: r })\n      return ''\n    })\n" + anchor
s = s.replace(anchor, add, 1)
open(p, "w", encoding="utf-8").write(s)
print("patched8", len(s))