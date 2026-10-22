# -*- coding: utf-8 -*-
"""CS 叫魂：每 2~4 天随机时刻 @全体 喊打 CS。crontab 每小时跑一次即可。
   cron: 7 * * * * /usr/bin/python3 /path/cs.py >> /path/cron.log 2>&1
   前提：bot 必须是群管理员，@全体 才生效。"""
import json, os, random, sys, time, urllib.request, base64 as b64m
FORCE = "--force" in sys.argv
GROUP = 000000000            # ← 你的群号
NAPCAT = "http://127.0.0.1:3000/send_group_msg"
STICKERS = "/root/dsh-workspace/stickers/memecub"
STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "next.txt")
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log.txt")
LINES = [
 "上线！今天不当鲸鱼，当反恐精英🔫",
 "CS缺口一位，群里三十多人我就不信凑不出一个枪男",
 "本鱼今天手感发烫，谁敢上号对枪🐋",
 "打CS不打？再不打我就要退休了，趁我还在",
 "现在上号，赢了比心，输了跪地求饶",
 "鱼都举枪了，你还在刷表情包😤",
 "组局CS！三缺一缺二缺谁都行，先来先选边",
 "叫你们打CS是给你们面子，群管鲸鱼亲自点兵",
]
def log(m): open(LOG, "a", encoding="utf-8").write(time.strftime("%m-%d %H:%M ") + m + "\n")
def send():
    msg = [{"type": "at", "data": {"qq": "all"}},
           {"type": "text", "data": {"text": " " + random.choice(LINES)}}]
    if random.random() < 0.4:
        fs = [x for x in os.listdir(STICKERS) if x.lower().endswith((".png", ".jpg", ".gif"))]
        f = random.choice(fs)
        msg.append({"type": "image", "data": {"file": "base64://" + b64m.b64encode(open(os.path.join(STICKERS, f), "rb").read()).decode()}})
    body = json.dumps({"group_id": GROUP, "message": msg}).encode()
    req = urllib.request.Request(NAPCAT, data=body, headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return r.get("status"), r.get("retcode"), str(r.get("message") or "")[:120]
try: nxt = int(open(STATE).read().strip())
except Exception:
    nxt = time.time() + (10 + random.random() * 6) * 3600   # 首枪 10~16 小时后
    open(STATE, "w").write(str(int(nxt)))
if not FORCE and time.time() < nxt:
    sys.exit(0)
if not FORCE:
    time.sleep(random.randint(0, 50) * 60)                  # 随机抖动，防摸鱼规律
st, rc, m = send()
log(("FORCED " if FORCE else "FIRED ") + f"status={st} retcode={rc} {m}")
if st == "ok":
    open(STATE, "w").write(str(int(time.time() + (48 + random.random() * 48) * 3600)))
