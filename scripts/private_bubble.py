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
    elif now.hour >= 10 and rd(ST_G) != today:
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
    if not mode and 13 <= now.hour <= 21 and rd(ST_R) != today:
        last = None
        try: last = datetime.datetime.strptime(rd(ST_R), "%Y-%m-%d")
        except Exception: pass
        gap = (now.date() - last.date()).days if last else 99
        if gap >= 1 and random.random() < 0.65:
            mode = "report"
if not mode:
    raise SystemExit(0)
wd = rd(FLAG)
hh = wd[11:16] if len(wd) >= 16 else "凌晨"
if mode == "night":
    prompt = "（系统提示，对方看不到）晚安时刻：去私聊跟主人道个晚安，一两句，温柔、别模板腔、别跟昨天重复。他今天要是累了或emo了，就多带一句软话。带个颜文字就行，不发图、不解释机制，直接输出你要说的话。今天要是已经当面道过晚、或者话已经聊到自然收尾了，就只输出略过，别补第二条。"
elif mode == "nag":
    prompt = "（系统提示，对方看不到）熬夜补刀：主人昨天 " + hh + " 还在说话，你云端全看见了。去私聊损一句再关心一句，两句封顶，别唠叨别说教，不带图。已经补过刀或想不出好的就只输出略过两个字。"
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
    prompt = "（系统提示，对方看不到）报备机会：%s搭话的方式你自己挑：挑一件最近跟你有关的事随口报一句（学了什么新梗新表情、群里什么名场面、或者你想干什么）；或者上头有哪句是你没接住、现在想问下文的，顺那句开口也很自然。最多两句，随机带一个颜文字，不发图。都不想说就只输出略过两个字。" % recap
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
