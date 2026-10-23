#!/usr/bin/env python3
# 戳一戳: python3 /opt/qq-cs/poke.py <QQ号>
# 主人(私聊QQ配置)走 friend_poke，其他人走 group_poke
import sys, json, urllib.request
cfg = json.load(open("/root/.dsh/qq-bridge-config.json"))
master = int(cfg.get("私聊QQ") or 0)
group = int(cfg.get("群号") or 0)
qq = int(sys.argv[1])
def nap(action, body):
    r = urllib.request.Request("http://127.0.0.1:3000/" + action,
        data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=8))
if qq == master:
    r = nap("friend_poke", {"user_id": qq})
else:
    r = nap("group_poke", {"group_id": group, "user_id": qq})
print(r.get("status"), r.get("retcode"), str(r.get("message"))[:60])