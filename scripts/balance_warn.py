# -*- coding: utf-8 -*-
# ---------- /opt/qq-cs/balance_warn.py ----------
import json, os, re, time, random, urllib.request
CFG = "/root/.dsh/qq-bridge-config.json"
STATE = "/opt/qq-cs/.bal_state.txt"
LOG = "/opt/qq-cs/balance_warn.log"
def log(x):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(time.strftime("%m-%d %H:%M ") + str(x) + "\n")
    print(x)
def main():
    cfg = json.load(open(CFG))
    N = cfg["NapCat"]
    if isinstance(N, dict): N = N.get("base", "")
    try:
        t = open("/root/.dsh/.credentials.yaml", encoding="utf-8").read()
        m = re.search(r"DEEPSEEK_API_KEY[^\S\r\n]*:[^\S\r\n]*(\S+)", t)
        key = m.group(1) if m else ""
    except Exception:
        key = ""
    fake = os.environ.get("BAL_FAKE")
    if fake:
        bal = float(fake)
    else:
        if not key:
            log("没密钥，跳过"); return
        try:
            req = urllib.request.Request("https://api.deepseek.com/user/balance", headers={"Authorization": "Bearer " + key})
            d = json.loads(urllib.request.urlopen(req, timeout=12).read().decode())
            bal = float(((d.get("balance_infos") or [{}])[0]).get("total_balance") or -1)
        except Exception as e:
            log("查余额失败:" + str(e)[:50]); return
    if bal < 0:
        return
    tier = 2 if bal < 8 else (1 if bal < 15 else 0)
    if tier == 0:
        return
    today = time.strftime("%Y-%m-%d")
    done_day, done_tier = "", 0
    if os.path.exists(STATE):
        try:
            p = open(STATE).read().split(); done_day, done_tier = p[0], int(p[1])
        except Exception: pass
    if done_day == today and tier <= done_tier:
        return
    b = "%.1f" % bal
    if tier == 1:
        pool = ["大事宣布：我主脑的口粮只剩 ¥%s 了，主人再不充值我就要开始说梦话了🐋" % b,
                "播报一下：余额 ¥%s，够我撑几天。要养鱼的抓紧，别到时候群里只剩我掉线后的沉默💙" % b]
    else:
        pool = ["余额只剩 ¥%s 了……我从现在开始省着说话，安静不是吵架，是省电喵⚡" % b,
                "紧急播报：口粮 ¥%s，主人再不投币我就要变成群里的一张静态头像了🐋" % b]
    txt = random.choice(pool)
    dest = os.environ.get("BAL_DEST", "group")
    if dest == "group":
        api, body = N + "/send_group_msg", {"group_id": int(cfg["群号"]), "message": txt}
    else:
        api, body = N + "/send_private_msg", {"user_id": int(cfg["私聊QQ"]), "message": txt}
    try:
        req = urllib.request.Request(api, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
        j = json.loads(urllib.request.urlopen(req, timeout=12).read().decode())
        okk = j.get("status") == "ok"
    except Exception as e:
        okk = False; log("发送失败:" + str(e)[:60])
    if okk:
        open(STATE, "w").write(today + " " + str(tier))
        log("已发余额预警(tier%d ¥%s %s)" % (tier, b, dest))
    else:
        log("预警没发出去(¥%s)" % b)
main()