#!/usr/bin/env python3
# 私聊主动小温度：每晚一句晚安（22点档）+ 约2~3天一次报备（13-21点档随机）
import sys, random, datetime, subprocess, urllib.request, json, re
ST_R = "/opt/qq-cs/priv_last_report.txt"
ST_N = "/opt/qq-cs/priv_last_night.txt"
LOG = "/opt/qq-cs/log.txt"
now = datetime.datetime.now()
today = now.strftime("%Y-%m-%d")
def rd(p):
    try: return open(p).read().strip()
    except Exception: return ""
mode = sys.argv[1] if len(sys.argv) > 1 else ""
if not mode:
    if now.hour == 22 and rd(ST_N) != today:
        mode = "night"
    elif 13 <= now.hour <= 21 and rd(ST_R) != today:
        last = None
        try: last = datetime.datetime.strptime(rd(ST_R), "%Y-%m-%d")
        except Exception: pass
        gap = (now.date() - last.date()).days if last else 99
        if gap >= 2 and random.random() < 0.4:
            mode = "report"
if not mode:
    raise SystemExit(0)
out = subprocess.check_output(["journalctl", "-u", "dsh", "--no-pager"]).decode("utf-8", "ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks:
    raise SystemExit("no token")
if mode == "night":
    prompt = "（系统提示，对方看不到）晚安时刻：去私聊跟主人道个晚安，一两句，温柔、别模板腔、别跟昨天重复。他今天要是累了或emo了，就多带一句软话。不配图、不解释机制，直接输出你要说的话。"
else:
    prompt = "（系统提示，对方看不到）报备机会：挑一件最近跟你有关的事，去私聊随口跟主人说一句——学了什么新梗新表情、群里什么好玩的名场面、或者你想干什么。最多两句，不配图。编不出来就只输出略过两个字。"
body = json.dumps({"text": prompt, "channel": "private"}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("nudge fail: %s" % e)
open(ST_N if mode == "night" else ST_R, "w").write(today)
open(LOG, "a").write("%s private-bubble mode=%s ok=%s\n" % (now.strftime("%m-%d %H:%M"), mode, r.get("ok")))
