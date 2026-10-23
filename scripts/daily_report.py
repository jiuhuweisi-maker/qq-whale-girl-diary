# -*- coding: utf-8 -*-
"""群日报：每晚22:35把今天的群聊精华私聊报给主人（零token直发）"""
import json, os, time, requests
CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
N = CFG.get("NapCat"); API = N if isinstance(N, str) else (N or {}).get("base", "http://127.0.0.1:3000"); GID = int(CFG["群号"]); MASTER = int(CFG["私聊QQ"])
ME = int(requests.get(API + "/get_login_info", timeout=8).json()["data"]["user_id"])
STATE = "/opt/qq-cs/.report_date.txt"
today = time.strftime("%Y-%m-%d")
if open(STATE).read().strip() if os.path.exists(STATE) else "" == today:
    print("今天已报过"); raise SystemExit
day = time.strftime("%Y-%m")
recs = []
p = "/opt/qq-cs/memory/" + day + ".jsonl"
if os.path.exists(p):
    for l in open(p, encoding="utf-8"):
        try: r = json.loads(l)
        except Exception: continue
        if time.strftime("%Y-%m-%d", time.localtime(r["t"])) == today: recs.append(r)
mine = [r for r in recs if int(r.get("uid") or 0) != ME]
if len(mine) < 5:
    print("今天群里没什么话，跳过"); open(STATE, "w").write(today); raise SystemExit
from collections import Counter
talk = Counter(str(r["nick"]) for r in mine)
at_me = [r for r in mine if str(r.get("text", "")).find("鲸戒") >= 0 or str(r.get("text", "")).find("m0NESY") >= 0 or str(r.get("text", "")).find("@" + str(ME)) >= 0]
longs = sorted(mine, key=lambda r: len(str(r.get("text", ""))), reverse=True)
picked, seen = [], set()
for r in longs:
    k = str(r["nick"])
    if k in seen: continue
    seen.add(k); picked.append(r)
    if len(picked) >= 3: break
lines = ["【群日报 %s】今天 %d 条话（我说了 %d 条）" % (time.strftime("%m-%d"), len(recs), len(recs) - len(mine))]
lines.append("话最多：" + "、".join("%s×%d" % kv for kv in talk.most_common(3)))
for r in picked:
    lines.append("· [%s] %s" % (str(r["nick"])[:10], str(r.get("text", ""))[:50]))
if at_me: lines.append("今天@/喊我 %d 次" % len(at_me))
text = "\n".join(lines)
requests.post(API + "/send_private_msg", json={"user_id": MASTER, "message": text}, timeout=10)
open(STATE, "w").write(today)
print("已发日报")