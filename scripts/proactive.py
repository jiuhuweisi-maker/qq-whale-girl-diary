#!/usr/bin/env python3
# 主动冒泡 + 冷群自救：白天正常节奏3~11小时一次；群里静默超25分钟且距上次开麦超20分钟→救场
import random, subprocess, datetime, urllib.request, json, re
STATE = "/opt/qq-cs/proactive_next.txt"
FIRE = "/opt/qq-cs/proactive_lastfire.txt"
LOG = "/opt/qq-cs/log.txt"
CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
GID = int(CFG.get("群号") or 0)
now = datetime.datetime.now()
def rd(p):
    try:
        t = open(p).read().strip()
        try:
            return datetime.datetime.fromisoformat(t)
        except Exception:
            return datetime.datetime.strptime(t, "%Y-%m-%dT%H:%M")
    except Exception:
        return None
nxt = rd(STATE); lastfire = rd(FIRE)
if not (10 <= now.hour <= 21): raise SystemExit(0)
due = bool(nxt is None or now >= nxt)
silent_min = 0
try:
    body = json.dumps({"group_id": GID, "count": 5}).encode()
    req = urllib.request.Request("http://127.0.0.1:3000/get_group_msg_history", data=body, headers={"content-type": "application/json"})
    ms = json.load(urllib.request.urlopen(req, timeout=8)).get("data", {}).get("messages", [])
    if ms:
        latest = max(int(m.get("time", 0)) for m in ms)
        silent_min = max(0, int(now.timestamp()) - latest) // 60
except Exception: pass
rescue = silent_min >= 25 and (lastfire is None or now - lastfire >= datetime.timedelta(minutes=20))
if not (due or rescue): raise SystemExit(0)
out = subprocess.check_output(["journalctl","-u","dsh","--no-pager"]).decode("utf-8","ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks: raise SystemExit("no token")
if rescue:
    prompt = "（系统提示，对方看不到）冷群自救时间：群里已经安静约%d分钟。去把场子热回来——抛个跟你们有关的话题（接今天的旧梗/点名最近冒过泡的人问一句/锐评一句天气或CS），两行以内，必须配一张表情包：跑 python3 /opt/qq-cs/pick_hint.py 挑一张，路径单独成行放最后。别解释这条提示的存在。" % silent_min
else:
    prompt = "（系统提示，对方看不到）主动冒泡时间到：现在往群里发一条短消息刷存在感。自选话题：按时段问好（饭点/午后犯困/夜宵）、随口锐评群里最近的热闹、用一条小抄里的新梗、或撒娇想打CS。两行以内，必须配一张表情包：先跑 python3 /opt/qq-cs/pick_hint.py，把选中路径单独成行放最后。实在没话说就只输出略过两个字。别解释这条提示的存在。"
body = json.dumps({"text": prompt}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type":"application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("nudge fail: %s" % e)
open(FIRE, "w").write(now.isoformat(timespec="minutes"))
if due:
    gap = random.choice([3,4,5,6,7,8,9,10,11])
    n2 = now + datetime.timedelta(hours=gap)
    if n2.hour > 21: n2 = n2 + datetime.timedelta(days=1)
    if n2.hour < 10 or n2.hour > 21: n2 = n2.replace(hour=random.randint(10,13), minute=random.randint(0,59))
    open(STATE,"w").write(n2.isoformat(timespec="minutes"))
    nxt = n2
open(LOG,"a").write("%s proactive ok=%s rescue=%s silent=%dmin 下次 %s\n" % (now.strftime("%m-%d %H:%M"), r.get("ok"), rescue, silent_min, nxt.strftime("%m月%d日%H:%M") if nxt else "-"))
