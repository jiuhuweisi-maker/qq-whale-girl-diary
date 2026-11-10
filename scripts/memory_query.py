# -*- coding: utf-8 -*-
"""查旧账: memory_query.py [--who 昵称或QQ] [--kw 关键词] [--days N] [--limit N]"""
import sys, os, json, time, re
MDIR = "/opt/qq-cs/memory"
def arg(name, d=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv) and not sys.argv[i+1].startswith("--"): return sys.argv[i+1]
    return d
who, kw = arg("--who"), arg("--kw")
days = int(arg("--days", "14")); limit = int(arg("--limit", "6"))
cut = time.time() - days * 86400
hits = []
for fn in sorted(os.listdir(MDIR), reverse=True):
    if not fn.endswith(".jsonl"): continue
    for l in open(os.path.join(MDIR, fn), encoding="utf-8"):
        try: r = json.loads(l)
        except Exception: continue
        if r.get("t", 0) < cut: continue
        if who:
            try: ok = int(r.get("uid") or 0) == int(who)
            except (ValueError, TypeError): ok = who in str(r.get("nick", ""))
            if not ok: continue
        if kw and kw.lower() not in str(r.get("text", "")).lower(): continue
        hits.append(r)
hits.sort(key=lambda r: r["t"], reverse=True)
if not hits: print("翻到了这几个月记的账，没有这个"); sys.exit(0)
for r in hits[:limit]:
    print("%s [%s] %s" % (time.strftime("%m-%d %H:%M", time.localtime(r["t"])), r["nick"], r["text"][:80]))