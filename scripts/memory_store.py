# -*- coding: utf-8 -*-
"""群聊记忆库：每半小时拉群史存 jsonl（按消息id去重、水位线增量）"""
import json, os, time, requests
CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
GID = int(CFG["群号"])
N = CFG.get("NapCat"); API = N if isinstance(N, str) else (N or {}).get("base", "http://127.0.0.1:3000")
MDIR = "/opt/qq-cs/memory"; os.makedirs(MDIR, exist_ok=True)
WATER = "/opt/qq-cs/.mem_water.txt"
def water():
    try: return int(open(WATER).read().strip())
    except Exception: return 0
def run():
    w = water()
    body = {"group_id": GID, "count": 100}
    if w: body["last_time"] = w
    try:
        ms = (requests.post(API + "/get_group_msg_history", json=body, timeout=15).json().get("data") or {}).get("messages") or []
    except Exception as e:
        print("拉取失败:", e); return
    if not ms:
        print("无新消息(水位", w, ")"); return
    seen = set()
    sf = "/opt/qq-cs/.mem_seen.txt"
    if os.path.exists(sf):
        seen = set(open(sf).read().split())
    new = 0; mx = w; byday = {}
    for m in ms:
        mid = str(m.get("message_id") or "")
        if not mid or mid in seen: continue
        seen.add(mid)
        t = int(m.get("time") or 0); mx = max(mx, t)
        sd = m.get("sender") or {}
        text = ""
        segs = m.get("message") or []
        imgs = 0
        if isinstance(segs, list):
            for s in segs:
                if not isinstance(s, dict): continue
                if s.get("type") == "text": text += (s.get("data") or {}).get("text") or ""
                elif s.get("type") in ("image", "mface", "face"): imgs += 1
                elif s.get("type") == "at": text += "@%s " % ((s.get("data") or {}).get("name") or (s.get("data") or {}).get("qq"))
        text = text.strip().replace("\n", " ")[:300]
        if not text and not imgs: continue
        rec = {"mid": mid, "t": t, "uid": sd.get("user_id"), "nick": sd.get("card") or sd.get("nickname") or "", "text": text}
        if imgs: rec["imgs"] = imgs
        d = time.strftime("%Y-%m", time.localtime(t))
        byday.setdefault(d, []).append(rec)
    for d, recs in byday.items():
        with open(os.path.join(MDIR, d + ".jsonl"), "a", encoding="utf-8") as f:
            for r in recs: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    ids = sorted(seen)[-4000:]
    open(sf, "w").write("\n".join(ids))
    if mx > w: open(WATER, "w").write(str(mx))
    print("入库 %d 条，水位 %s" % (len(byday and sum(len(v) for v in byday.values()) or 0) if False else sum(len(v) for v in byday.values()), mx))
run()