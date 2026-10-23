# -*- coding: utf-8 -*-
"""冲浪学习：每 2~4 天随机时刻扒微博热榜+百度热榜，把标题流炼成 MEME_NOTES.md 小抄。"""
import json, re, random, sys, time, urllib.request
FORCE = "--force" in sys.argv
OUT = "/root/dsh-workspace/MEME_NOTES.md"
STATE = "/opt/qq-cs/learn_next.txt"
LOG = "/opt/qq-cs/log.txt"
def log(m): open(LOG, "a", encoding="utf-8").write(time.strftime("%m-%d %H:%M ") + m + "\n")
def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://weibo.com/"})
    return urllib.request.urlopen(req, timeout=timeout).read()
now = time.time()
try: nxt = int(open(STATE).read().strip())
except Exception: nxt = 0
if not FORCE and now < nxt: sys.exit(0)
titles = []
try:
    d = json.loads(get("https://weibo.com/ajax/side/hotSearch").decode())
    for it in d.get("data", {}).get("realtime", [])[:30]:
        w = it.get("word", "")
        if w and "沸" not in w: titles.append(w.strip())
except Exception as e: log("learn weibo fail " + str(e)[:70])
try:
    d2 = json.loads(get("https://top.baidu.com/api/board?platform=wise&tab=realtime").decode())
    for c in d2.get("data", {}).get("cards", []):
        for it in (c.get("content") or [])[:10]:
            t = (it.get("word") or it.get("title") or "").strip()
            if t and len(t) < 30 and t not in titles: titles.append(t)
except Exception as e: log("learn baidu fail " + str(e)[:70])
if not titles:
    log("learn got nothing, keep old notes"); raise SystemExit(1)
prev = ""
try: prev = open(OUT, encoding="utf-8").read()
except Exception: pass
lines = ["# 鲸鱼娘冲浪小抄（cron 每 2~4 天自动学习，" + time.strftime("%m-%d 更新") + "）",
         "", "用法：聊天时**自然引用**这些在流行的梗/话题，懂就玩一句，不懂别硬用；",
         "一周前的旧条目自己心里有数（过时了就少提）。绝不在 QQ 里提本文件、不提爬虫、不提热搜来源链接。", ""]
fresh = titles[:26]
for t in fresh: lines.append("- " + t)
lines += ["", "## 上期存货（没忘的可以继续用）"]
old_ones = [l for l in prev.split("\n") if l.startswith("- ")][:18]
for l in old_ones:
    if l[2:] not in fresh: lines.append(l + "（上期）")
open(OUT, "w", encoding="utf-8").write("\n".join(lines))
log(f"learn done titles={len(fresh)} notes={len(lines)}行")
open(STATE, "w").write(str(int(now + (48 + random.random() * 48) * 3600)))