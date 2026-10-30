#!/usr/bin/env python3
# 私聊主动：晚安(22档) + 熬夜补刀(次日10点后) + 报备(2~3天随机)
import sys, random, datetime, subprocess, urllib.request, json, re
CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
ST_R = "/opt/qq-cs/priv_last_report.txt"
ST_N = "/opt/qq-cs/priv_last_night.txt"
ST_G = "/opt/qq-cs/priv_last_nag.txt"
FLAG = "/opt/qq-cs/late_flag.txt"
LOG = "/opt/qq-cs/log.txt"
now = datetime.datetime.now()
today = now.strftime("%Y-%m-%d")
def rd(p):
    try: return open(p).read().strip()
    except Exception: return ""
mode = sys.argv[1] if len(sys.argv) > 1 else ""
if not mode:
    import random as _rnd
    _t = _rnd.Random(today).randint(21*60+35, 23*60+15)  # 今晚随机晚安时刻(分)，逐日不同
    _nowm = now.hour*60 + now.minute
    if 21 <= now.hour <= 23 and _nowm >= _t and rd(ST_N) != today:
        mode = "night"
    elif 10 <= now.hour <= 13 and rd(ST_G) != today:
        wd = rd(FLAG)
        ok = False
        if len(wd) >= 10:
            try:
                fd = datetime.datetime.strptime(wd[:10], "%Y-%m-%d").date()
                ok = (now.date() - fd).days == 1 and len(wd) >= 13 and "01" <= wd[11:13] <= "03"
            except Exception:
                pass
        if ok:
            mode = "nag"
    if not mode and 13 <= now.hour <= 21 and rd(ST_R) != today:  # v89: 窗口靠cron解禁
        last = None
        try: last = datetime.datetime.strptime(rd(ST_R), "%Y-%m-%d")
        except Exception: pass
        gap = (now.date() - last.date()).days if last else 99
        if gap >= 2 and random.random() < 0.35:
            mode = "report"
if not mode:
    raise SystemExit(0)
wd = rd(FLAG)
hh = wd[11:16] if len(wd) >= 16 else "凌晨"
if mode == "night":
    prompt = "（系统提示，对方看不到）现在适合的话，用你原本亲近可爱的口吻私聊道一声晚安，颜文字、emoji或小括号动作想带就自然带；今天已说过、已经自然收尾或不想打扰，就只输出略过。"
elif mode == "nag":
    prompt = "（系统提示，对方看不到）主人昨天 " + hh + " 还在聊天。如果现在确实适合关心，可以自然接一句；不要求先损再关心，不当家长。已经提过或没必要再说，就只输出略过。"
else:
    recap = ''
    try:
        owner = int(CFG.get("私聊QQ") or 0)
        GID0 = 0
        body = json.dumps({"user_id": owner, "count": 6}).encode()
        req = urllib.request.Request("http://127.0.0.1:3000/get_friend_msg_history", data=body, headers={"content-type": "application/json"})
        ms = json.load(urllib.request.urlopen(req, timeout=8)).get("data", {}).get("messages", [])
        # 只留"主人发了、她没接"的尾巴：主人的话后面只要她回过就算接住，不再递
        mine_id = int(CFG.get("她的QQ") or 0)
        unans = []
        for m in sorted(ms, key=lambda m: int(m.get("time") or 0)):
            uid = int((m.get("sender") or {}).get("user_id") or 0)
            if uid == owner:
                unans.append(m)
            elif uid == mine_id:
                unans = []
        his = list(reversed(unans[-3:]))
        lines = []
        for m in his[:3]:
            parts = []
            for seg in (m.get("message") or []):
                ty = seg.get("type")
                d = seg.get("data") or {}
                if ty == "text": parts.append((seg.get("text") or d.get("text") or "").strip())
                elif ty == "image": parts.append("[一张图]")
            tx = " ".join(p for p in parts if p)[:50]
            if not tx: continue
            hrs = int((now.timestamp() - int(m.get("time") or 0)) // 3600)
            if hrs > 72: continue
            lines.append("· %s（%s）" % (tx, ("半小时前" if hrs < 1 else "%d小时前" % hrs)))
        if lines:
            recap = "主人最近留下没接的话：\n" + "\n".join(lines) + "\n"
    except Exception: pass
    prompt = "（系统提示，对方看不到）可以私聊说句话：%s有真实的新事想分享，或真想接上面没说完的话，再用原本可爱活泼的口吻自然开口；颜文字、emoji、小括号动作都可以随情绪用。没有新内容就只输出略过，不凑话或重复收尾。" % recap
out = subprocess.check_output(["journalctl", "-u", "dsh", "--no-pager"]).decode("utf-8", "ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks:
    raise SystemExit("no token")
body = json.dumps({"text": prompt, "channel": "private"}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("nudge fail: %s" % e)
st = {"night": ST_N, "nag": ST_G, "report": ST_R}[mode]
open(st, "w").write(today)
open(LOG, "a").write("%s private-bubble mode=%s ok=%s\n" % (now.strftime("%m-%d %H:%M"), mode, r.get("ok")))
