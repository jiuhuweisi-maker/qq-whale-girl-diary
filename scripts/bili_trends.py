# -*- coding: utf-8 -*-
# 周更梗：每周一09:12 由 cron 跑，通过桥 nudge 派"搜梗任务"给她的大脑，
# 她自己用 web_search 收集近两周B站热梗并维护 /opt/qq-cs/bili_memes.md。QQ 无感。
import subprocess, json, re, time, urllib.request

LOG = "/opt/qq-cs/bili_trends.log"
def log(m):
    try: open(LOG, "a", encoding="utf-8").write(time.strftime("%m-%d %H:%M") + " " + m + "\n")
    except Exception: pass

def get_token():
    try:
        out = subprocess.check_output(["journalctl", "-u", "dsh", "--no-pager"], timeout=40).decode("utf-8", "ignore")
        ms = re.findall(r"token=([A-Za-z0-9_-]+)", out)
        return ms[-1] if ms else None
    except Exception as e:
        log("取token失败:" + str(e)[:60])
        return None

TASK = ("〔主人特批·每周搜梗〕不用回QQ，直接做事：用 web_search 查最近两周的B站热梗/名场面"
        "（关键词像「B站 热梗 本周」「XX 是什么梗 bilibili」「B站 名场面 出圈」），挑3~6条还在流行的，"
        "更新 /opt/qq-cs/bili_memes.md：新开一节「## 本周新增（MM-DD）」每条写梗+一句用法，"
        "把明显过气的旧条目删掉或收进「## 归档」，保住文件头那行标题。写完 cat 一遍文件头自查格式。"
        "注意：这是给自己涨见识的台账，口吻随便你，但用法描述要能直接照着接梗。")

def nudge(tok):
    req = urllib.request.Request(
        "http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + tok,
        data=json.dumps({"text": TASK, "channel": "none"}).encode("utf-8"),
        headers={"content-type": "application/json"}, method="POST")
    try:
        return json.loads(urllib.request.urlopen(req, timeout=25).read().decode("utf-8"))
    except Exception as e:
        log("nudge失败:" + str(e)[:60])
        return {"ok": False}

tok = get_token()
if not tok:
    log("没token，这周跳")
    raise SystemExit
r = nudge(tok)
if not r.get("ok"):
    log("首投不成，重启dsh补投一次")
    subprocess.call(["systemctl", "restart", "dsh"])
    time.sleep(30)
    tok = get_token()
    if tok:
        r = nudge(tok)
log("派单结果:" + ("ok" if r.get("ok") else "fail"))