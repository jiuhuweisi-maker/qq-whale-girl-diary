# -*- coding: utf-8 -*-
import json, os, random, sys, time, urllib.request, base64 as b64m
FORCE = "--force" in sys.argv
STATE = "/opt/qq-cs/next.txt"
LOG = "/opt/qq-cs/log.txt"
GROUP = <群号>
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
def get_next():
    try: return int(open(STATE).read().strip())
    except Exception:
        t = time.time() + (10 + random.random() * 6) * 3600
        open(STATE, "w").write(str(int(t))); return t
def send():
    txt = random.choice(LINES)
    msg = [{"type": "at", "data": {"qq": "all"}}, {"type": "text", "data": {"text": " " + txt}}]
    if random.random() < 0.4:
        d = "/root/dsh-workspace/stickers/memecub"
        fs = [x for x in os.listdir(d) if x.lower().endswith((".png", ".jpg", ".gif"))]
        f = random.choice(fs)
        msg.append({"type": "image", "data": {"file": "base64://" + b64m.b64encode(open(os.path.join(d, f), "rb").read()).decode()}})
    body = json.dumps({"group_id": GROUP, "message": msg}).encode()
    req = urllib.request.Request("http://127.0.0.1:3000/send_group_msg", data=body, headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return r.get("status"), r.get("retcode"), str(r.get("message") or "")[:120]
now = time.time()
nxt = get_next()
if not FORCE and now < nxt:
    sys.exit(0)
if not FORCE:
    time.sleep(random.randint(0, 50) * 60)
st, rc, m = send()
log(("FORCED " if FORCE else "FIRED ") + f"status={st} retcode={rc} {m}")
if st == "ok":
    open(STATE, "w").write(str(int(time.time() + (48 + random.random() * 48) * 3600)))
    log("next raid scheduled 2-4d out")