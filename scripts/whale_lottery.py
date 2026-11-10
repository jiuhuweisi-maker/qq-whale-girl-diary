# -*- coding: utf-8 -*-
# /opt/qq-cs/whale_lottery.py —— patch38 鲸元券开奖发射器
import json, os, random, time, urllib.request

CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
N = CFG["NapCat"]; N = N.get("base", "") if isinstance(N, dict) else N
GID = int(CFG["群号"])
STK = CFG.get("图片根目录") or "/root/dsh-workspace/stickers/whale"
TICKET = "/opt/qq-cs/.lottery.json"
LAST = "/opt/qq-cs/.lottery_last.txt"
DUR = 7200

def ticket_pic():
    try:
        for l in open(STK + "/INDEX.tsv", encoding="utf-8"):
            p = l.split("\t")
            if len(p) > 1 and "鲸元券" in p[1] and os.path.exists(STK + "/" + p[0]):
                return STK + "/" + p[0]
    except Exception: pass
    f = STK + "/gr434.jpg"
    return f if os.path.exists(f) else ""

def main():
    today = time.strftime("%Y-%m-%d")
    if not os.environ.get("LOT_FORCE"):
        last = ""
        if os.path.exists(LAST):
            try: last = open(LAST).read().strip()
            except Exception: last = ""
        gap = 0
        if last:
            try:
                gap = int((time.mktime(time.strptime(today, "%Y-%m-%d")) - time.mktime(time.strptime(last, "%Y-%m-%d"))) / 86400)
            except Exception: gap = 99
        if gap < 2:
            return  # 两天一开（手动开奖会重置时钟）
    code = random.randint(100, 999)
    pic = ticket_pic()
    txt = "手感来了！甩了张鲸元券，口令「鲸元券 %d」，最先喊到的领一张奖品表情包🐋（两小时有效，别作弊哈）" % code
    段 = [{"type": "text", "data": {"text": txt}}]
    if pic:
        段.insert(0, {"type": "image", "data": {"file": pic}})
    if os.environ.get("LOT_DRY"):
        print("DRY:", txt, "| 券图:", pic or "无"); return
    req = urllib.request.Request(N + "/send_group_msg", data=json.dumps({"group_id": GID, "message": 段}, ensure_ascii=False).encode(), headers={"content-type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=12).read().decode())
    if j.get("status") == "ok":
        json.dump({"active": True, "code": code, "end": time.time() + DUR, "won": False}, open(TICKET, "w"))
        open(LAST, "w").write(today)
        print("开奖了，口令 鲸元券 %d" % code)
    else:
        print("发射失败", str(j)[:80])

main()