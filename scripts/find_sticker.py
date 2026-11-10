# -*- coding: utf-8 -*-
"""定向找图: find_sticker.py 关键词 [关键词2] → 按标题从库里找，最多3张"""
import sys, os, json, time
DIR = "/root/dsh-workspace/stickers/whale"
kws = [a for a in sys.argv[1:] if not a.startswith("-")]
if not kws:
    print("用法: find_sticker.py 关键词"); sys.exit(0)
used = {}
uf = os.path.join(DIR, ".used.json")
if os.path.exists(uf):
    try: used = json.load(open(uf))
    except Exception: pass
rows = []
for l in open(os.path.join(DIR, "INDEX.tsv"), encoding="utf-8"):
    if "\t" not in l: continue
    fn, title = l.strip().split("\t", 1)
    low = (fn + " " + title).lower()
    if all(k.lower() in low for k in kws): rows.append((fn, title))
if not rows:
    print("库里没匹配「%s」的图" % " ".join(kws)); sys.exit(0)
now = time.time()
import random; random.shuffle(rows)
out = rows[:3]
for fn, _ in out: used[fn] = now
json.dump(used, open(uf, "w"))
for fn, title in out: print(os.path.join(DIR, fn) + "\t" + title)