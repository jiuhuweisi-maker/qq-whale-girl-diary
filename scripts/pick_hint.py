# -*- coding: utf-8 -*-
"""pick_hint：给 agent 的挑图提示器——列出"最久没发"的 3 张候选并打使用戳。
   agent 每次要配图先跑这个，从候选里挑情绪最贴的一张（文件名<TAB>标题）。"""
import json, os, time
DIR = "/root/dsh-workspace/stickers/memecub"
ST = os.path.join(DIR, ".used.json")
idx = {}
for l in open(os.path.join(DIR, "INDEX.tsv"), encoding="utf-8"):
    if "\t" in l:
        fn, t = l.strip().split("\t", 1)
        idx[fn] = t
try: used = json.load(open(ST))
except Exception: used = {}
files = [f for f in idx if os.path.exists(os.path.join(DIR, f))]
files.sort(key=lambda f: used.get(f, 0))          # 最久未用在前；不在账上的=新货，冷藏后才轮到
for f in files[:3]:
    used[f] = int(time.time())
    print(f + "\t" + idx[f])
json.dump(used, open(ST, "w"))
