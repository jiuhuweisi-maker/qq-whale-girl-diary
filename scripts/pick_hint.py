# -*- coding: utf-8 -*-
import json, os, random, time
DIR = "/root/dsh-workspace/stickers/memecub"
ST = os.path.join(DIR, ".used.json")
idx = {}
for l in open(os.path.join(DIR, "INDEX.tsv"), encoding="utf-8"):
    if "\t" in l:
        fn, t = l.strip().split("\t", 1)
        idx[fn] = t
try: used = json.load(open(ST))
except Exception: used = {}
now = int(time.time())
files = [f for f in idx if os.path.exists(os.path.join(DIR, f))]
files.sort(key=lambda f: used.get(f, 0))
cands = files[:3]
for f in cands: used[f] = now
json.dump(used, open(ST, "w"))
for f in cands:
    print(f + "\t" + idx[f])