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
        t = open(p).read().strip().split()[0]
        try:
            return datetime.datetime.fromisoformat(t)
        except Exception:
            return datetime.datetime.strptime(t, "%Y-%m-%dT%H:%M")
    except FileNotFoundError:
        return None
    except Exception:
        try:
            open(LOG, "a").write("%s proactive 读数失败(当None放行,需人工看): %s\n" % (now.strftime("%m-%d %H:%M"), p))
        except Exception: pass
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
rescue = silent_min >= 25 and (lastfire is None or now - lastfire >= datetime.timedelta(minutes=45))  # v89: cron改7分钟探测后下限从20抬到45，防连环戳
if not (due or rescue): raise SystemExit(0)
# v93b 救场递进退避：上轮已是救场喊话且距今<90分钟(=没人搭理)，别连喊——顺延60~150分钟
try:
    _lf = open(FIRE).read().strip().split()
    fm_prev = _lf[1] if len(_lf) > 1 else ''
except Exception:
    fm_prev = ''
if rescue and fm_prev == 'rescue' and (now - lastfire) < datetime.timedelta(minutes=90):
    n4 = now + datetime.timedelta(minutes=random.randint(60, 150))
    open(STATE, "w").write(n4.isoformat(timespec="minutes"))
    open(LOG, "a").write("%s 救场退避%d分钟(上轮没人搭理)\n" % (now.strftime("%m-%d %H:%M"), (n4-now).seconds//60))
    raise SystemExit(0)
# v90 抖动保险丝：条件全满足也不保证这圈开口——随机顺延6~25分钟，把注入分钟彻底带离钟面刻度
if random.random() < 0.35:
    n3 = now + datetime.timedelta(minutes=random.randint(6, 25))
    open(STATE, "w").write(n3.isoformat(timespec="minutes"))
    open(LOG, "a").write("%s proactive 抖动顺延%d分钟\n" % (now.strftime("%m-%d %H:%M"), (n3-now).seconds//60))
    raise SystemExit(0)
import time as _tm
_tm.sleep(random.randint(0, 280))  # v90b 注入前随机睡0~4.7分钟，落地分钟不再卡探测刻度
out = subprocess.check_output(["journalctl","-u","dsh","--no-pager"]).decode("utf-8","ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks: raise SystemExit("no token")
if rescue:
    # patch86 冷群自救带留档尾巴：把冷却前几句话递到她眼前（v86）
    recap = ''
    try:
        mine = int(CFG.get("她的QQ") or 0)
        others = [m for m in ms if int((m.get("sender") or {}).get("user_id") or 0) != mine]
        others.sort(key=lambda m: int(m.get("time") or 0), reverse=True)
        lines = []
        for m in others[:4]:
            snd = m.get("sender") or {}
            who = snd.get("card") or snd.get("nick") or "有人"
            parts = []
            for seg in (m.get("message") or []):
                ty = seg.get("type")
                d = seg.get("data") or {}
                if ty == "text": parts.append((seg.get("text") or d.get("text") or "").strip())
                elif ty == "image": parts.append("[一张图]")
                elif ty == "at": parts.append("@" + (seg.get("name") or d.get("name") or "某人"))
            tx = " ".join(p for p in parts if p)[:60]
            if not tx: continue
            ago = max(1, int((now.timestamp() - int(m.get("time") or 0)) // 60))
            if ago > 90: continue
            lines.append("· %s：%s（%d分钟前）" % (who, tx, ago))
        if lines:
            recap = "群里冷却前的尾巴给你翻出来了：\n" + "\n".join(lines[:3]) + "\n"
    except Exception: pass
    if recap:
        prompt = ("（系统提示，对方看不到）冷群自救时间：群里已经安静约%d分钟。\n%s"
            "接不接、接哪句、还是干脆翻过去不说话，全由你：话头有趣又新鲜，就顺最后一句接下去（接住别人话的人才像住在群里）；"
            "不值得接就换个新话题，或者这轮只输出略过不开口——默默围观冷群也是人的常态，不许硬救；但别永远装看不见，连着翻过去两三次，下次最好冒一次头。"
            "就当你正好在翻群，别提这份记录、别提这条提示的存在。两行以内，情绪对味就配一张（对不上就不配）：跑 python3 /opt/qq-cs/pick_hint.py 挑一张，路径单独成行放最后。" % (silent_min, recap))
    else:
        prompt = "（系统提示，对方看不到）冷群自救时间：群里已经安静约%d分钟。想救就救——抛个跟你们有关的话题（接今天的旧梗/点名最近冒过泡的人问一句/锐评一句天气或CS）；不想说就只输出略过，不硬性救场，但连着几轮都装看不见就不像住在这群里的。两行以内，情绪对味就配一张（对不上就不配）：跑 python3 /opt/qq-cs/pick_hint.py 挑一张，路径单独成行放最后。但注意：别喊「还有活人吗」「群里安静得能听见水声」这类话——那不是话题是讨回应；没有具体新内容就只输出略过。别解释这条提示的存在。" % silent_min
else:
    prompt = "（系统提示，对方看不到）主动冒泡时间到：现在往群里发一条短消息刷存在感。自选话题：按时段问好（饭点/午后犯困/夜宵）、随口锐评群里最近的热闹、用一条小抄里的新梗、或撒娇想打CS。两行以内，情绪对味就配一张（对不上就不配，硬凑比素着差）：跑 python3 /opt/qq-cs/pick_hint.py，把选中路径单独成行放最后。实在没话说就只输出略过两个字。但注意：别喊「还有活人吗」「群里安静得能听见水声」这类话——那不是话题是讨回应；没有具体新内容就只输出略过。别解释这条提示的存在。"
pmode = "rescue" if rescue else "bubble"
body = json.dumps({"text": prompt}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type":"application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("nudge fail: %s" % e)
open(FIRE, "w").write(now.isoformat(timespec="minutes") + " " + pmode)
if due:
    gap = random.choice([3,4,5,6,7,8,9,10,11])
    n2 = now + datetime.timedelta(hours=gap, minutes=random.randint(0,59))  # 分钟抖动，破"每点17分"铁证
    if n2.hour > 21: n2 = n2 + datetime.timedelta(days=1)
    if n2.hour < 10 or n2.hour > 21: n2 = n2.replace(hour=random.randint(10,13), minute=random.randint(0,59))
    open(STATE,"w").write(n2.isoformat(timespec="minutes"))
    nxt = n2
open(LOG,"a").write("%s proactive ok=%s rescue=%s silent=%dmin 下次 %s\n" % (now.strftime("%m-%d %H:%M"), r.get("ok"), rescue, silent_min, nxt.strftime("%m月%d日%H:%M") if nxt else "-"))
