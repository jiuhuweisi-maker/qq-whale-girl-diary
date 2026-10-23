# -*- coding: utf-8 -*-
import sys, os, json, time, re
import requests

CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
GID = int(CFG.get("群号") or 0)
ME = int(CFG.get("她的QQ") or 0)
DIR = "/root/dsh-workspace/stickers/whale"
IDX = os.path.join(DIR, "INDEX.tsv")
KEYS = os.path.join(DIR, ".grab_keys.txt")
API = "http://127.0.0.1:3000"

def main():
    if len(sys.argv) < 3:
        print("用法: grab_sticker.py <对方昵称或QQ> [倒数第几张,默认1] <标题>")
        return 2
    who, title = sys.argv[1], sys.argv[-1]
    idxn = 1
    if len(sys.argv) >= 4:
        try: idxn = int(sys.argv[2])
        except ValueError: pass
    try: who_num = int(who)
    except ValueError: who_num = 0
    # 1. 拉群历史找发图记录（时间升序，取该人最近的图段）
    r = requests.post(API + "/get_group_msg_history", json={"group_id": GID, "count": 80}, timeout=15)
    ms = (r.json().get("data") or {}).get("messages") or []
    hits = []
    for m in ms:
        sd = m.get("sender") or {}
        uid = int(sd.get("user_id") or 0)
        if uid == ME: continue
        nick = (sd.get("card") or "") + (sd.get("nickname") or "")
        ok = (uid == who_num) if who_num else (who in nick)
        if not ok: continue
        segs = m.get("message") or []
        if not isinstance(segs, list): continue
        for s in segs:
            if isinstance(s, dict) and s.get("type") in ("image", "mface"):
                dd = s.get("data") or {}
                u = dd.get("url") or dd.get("file") or ""
                if u.startswith("http"):
                    try:
                        sz = int(str(dd.get("file_size") or 0).split()[0])
                    except ValueError:
                        sz = 0
                    hits.append((m.get("time") or 0, u, str(dd.get("file") or ""), sz))
    if not hits:
        print("没找到 %s 最近发的图（超过80条历史或对方没发过图）" % who); return 1
    hits.sort(key=lambda x: x[0])
    t, url, fname, size = hits[-min(idxn, len(hits))]
    key = (re.search(r"[0-9A-Fa-f]{32}", fname) or [fname[:24]])[0].lower()
    have = set(open(KEYS, encoding="utf-8").read().split()) if os.path.exists(KEYS) else set()
    if key in have:
        print("这张库里已经有了（%s 这张是重复的）" % who); return 0
    # 2. 下载
    if size and size > 8 * 1048576:
        print("图太大（%dMB），不存" % (size // 1048576)); return 1
    blob = requests.get(url, timeout=20).content
    if len(blob) < 512:
        print("下载失败或太小"); return 1
    ext = ".jpg"
    if blob[4:8] == b"WEBP": ext = ".webp"
    elif blob[:8] == b"\x89PNG\r\n\x1a\n": ext = ".png"
    elif blob[:6] in (b"GIF87a", b"GIF89a"): ext = ".gif"
    elif fname.lower().endswith((".webp", ".png", ".gif")): ext = "." + fname.lower().rsplit(".", 1)[1]
    # 3. 入库 + 登记
    rows = [l for l in open(IDX, encoding="utf-8") if l.strip()]
    n = 432
    while any(r0.startswith("gr%03d" % n) for r0 in rows): n += 1
    fn = "gr%03d%s" % (n, ext)
    with open(os.path.join(DIR, fn), "wb") as f: f.write(blob)
    stamp = time.strftime("%m-%d")
    line = "%s\t%s（来自%s %s）\n" % (fn, title, who, stamp)
    with open(IDX, "a", encoding="utf-8") as f: f.write(line)
    with open(KEYS, "a", encoding="utf-8") as f: f.write(key + "\n")
    print("存好了: %s %dKB → %s [已进轮换池，之后正常用]" % (fn, len(blob) // 1024, title))
    return 0

sys.exit(main())