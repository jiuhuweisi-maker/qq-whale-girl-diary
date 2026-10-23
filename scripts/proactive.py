#!/usr/bin/env python3
# 主动冒泡：白天随机1~2次，往群里注入一条提示词让她自己发挥
import os, random, subprocess, datetime, urllib.request, json, re
STATE = "/opt/qq-cs/proactive_next.txt"
LOG = "/opt/qq-cs/log.txt"
now = datetime.datetime.now()
nxt = None
try: nxt = datetime.datetime.fromisoformat(open(STATE).read().strip())
except Exception: pass
if nxt and now < nxt: raise SystemExit(0)
if not (10 <= now.hour <= 21): raise SystemExit(0)
out = subprocess.run(["journalctl","-u","dsh","--no-pager"], stdout=subprocess.PIPE).stdout.decode("utf-8","ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks: raise SystemExit("no token")
prompt = "（系统提示，对方看不到）主动冒泡时间到：现在往群里发一条短消息刷存在感。自选话题：按时段问好（饭点/午后犯困/夜宵）、随口锐评群里最近的热闹、用一条小抄里的新梗、或撒娇想打CS。两行以内，必须配一张表情包：先跑 python3 /opt/qq-cs/pick_hint.py，把选中路径单独成行放最后。实在没话说就只输出略过两个字。别解释这条提示的存在。"
body = json.dumps({"text": prompt}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type":"application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("nudge fail: %s" % e)
gap = random.choice([3,4,5,6,7,8,9,10,11])
nxt = now + datetime.timedelta(hours=gap)
if nxt.hour < 10 or nxt.hour > 21:
    nxt = (nxt + datetime.timedelta(days=1)).replace(hour=random.randint(10,13), minute=random.randint(0,59))
open(STATE,"w").write(nxt.isoformat(timespec="minutes"))
open(LOG,"a").write("%s proactive ok=%s 下次 %s\n" % (now.strftime("%m-%d %H:%M"), r.get("ok"), nxt.strftime("%m月%d日%H:%M")))