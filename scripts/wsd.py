#!/usr/bin/env python3
# wsd.py — NapCat wsServer 常驻客户端：收 OneBot 事件，把「戳一戳」转发给桥 /poke
import json, time, re, subprocess, urllib.request
import websocket

WS_URL = "ws://127.0.0.1:3001"
BRIDGE = "http://127.0.0.1:3080/dsh-qq-bridge/poke"
LOG    = "/tmp/wsd-last.txt"

def log(s):
    try:
        with open(LOG, "a") as f:
            f.write(time.strftime("%m-%d %H:%M:%S ") + s + "\n")
    except Exception:
        pass

_TOK = [""]
def token(force=False):
    if _TOK[0] and not force:
        return _TOK[0]
    try:
        out = subprocess.run(["journalctl","-u","dsh","--no-pager"],
                             stdout=subprocess.PIPE).stdout.decode("utf-8","ignore")
        m = re.findall(r"token=([A-Za-z0-9_-]+)", out)
        _TOK[0] = m[-1] if m else ""
    except Exception:
        pass
    return _TOK[0]

def forward(uid, gid):
    body = json.dumps({"user_id": uid, "group_id": gid}).encode()
    for _ in range(2):
        try:
            url = BRIDGE + "?token=" + token()
            req = urllib.request.Request(url, data=body, headers={"content-type":"application/json"})
            r = urllib.request.urlopen(req, timeout=10)
            log("已转发戳 uid=%s gid=%s -> %s" % (uid, gid, r.status))
            return
        except Exception:
            token(True)
    log("转发戳失败 uid=%s gid=%s" % (uid, gid))

def load_master():
    try:
        c=json.load(open("/root/.dsh/qq-bridge-config.json"))
        return int(c.get("私聊QQ") or 0)
    except Exception:
        return 0

MASTER = load_master()

def handle(ev):
    pt = ev.get("post_type")
    if pt == "meta_event":
        if ev.get("meta_event_type") == "lifecycle":
            log("lifecycle " + str(ev.get("sub_type")))
        return
    if pt != "notice":
        return
    if ev.get("notice_type") not in ("notify", "poke"):
        return
    st = ev.get("sub_type")
    if st and st != "poke":
        return
    me  = ev.get("self_id")
    uid = ev.get("user_id")
    tgt = ev.get("target_id") or me
    gid = ev.get("group_id") or 0
    if not uid or uid == me:
        return
    if tgt != me:
        return
    if not gid and MASTER and uid != MASTER:
        log("私聊戳非主人,忽略 uid=%s" % uid)
        return
    log("收到戳 uid=%s gid=%s" % (uid, gid))
    forward(uid, gid)

def run():
    while True:
        ws = None
        try:
            ws = websocket.create_connection(WS_URL, timeout=90)
            log("已连上 wsServer")
            while True:
                try:
                    m = ws.recv()
                except websocket.WebSocketTimeoutException:
                    log("recv超时,重连"); break
                if not m:
                    continue
                try:
                    ev = json.loads(m)
                except Exception:
                    continue
                handle(ev)
        except Exception as e:
            log("连接错误 " + repr(e)[:70])
        finally:
            try:
                if ws: ws.close()
            except Exception:
                pass
        time.sleep(3)

if __name__ == "__main__":
    run()