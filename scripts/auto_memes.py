# -*- coding: utf-8 -*-
import json, os, random, re, sys, time, urllib.request, base64 as b64m
FORCE = "--force" in sys.argv
DEMO = "--demo" in sys.argv
DIR = "/root/dsh-workspace/stickers/memecub"
STATE = "/opt/qq-cs/memes_next.txt"
LOG = "/opt/qq-cs/log.txt"
def log(m): open(LOG, "a", encoding="utf-8").write(time.strftime("%m-%d %H:%M ") + m + "\n")
def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=timeout).read()
def announce(files):
    texts = ["到货签收🐋 本鱼进货回来了，新表情已上架，欢迎白嫖", "上新！进回来的货，先让你们挑", "本鲸鱼刚拆箱，热乎的表情包", "进到货了，群里人手一份，不收差价"]
    msg = [{"type": "text", "data": {"text": "📦 " + random.choice(texts)}}]
    for f in files[:2]:
        try:
            raw = open(os.path.join(DIR, f), "rb").read()
            if len(raw) < 5 * 1048576:
                msg.append({"type": "image", "data": {"file": "base64://" + b64m.b64encode(raw).decode()}})
        except Exception: pass
    body = json.dumps({"group_id": <群号>, "message": msg}).encode()
    req = urllib.request.Request("http://127.0.0.1:3000/send_group_msg", data=body, headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=60).read())
    log(f"memes announce status={r.get('status')} files={','.join(files[:2])}")
if DEMO:
    idx = open(os.path.join(DIR, "INDEX.tsv"), encoding="utf-8").read().strip().split("\n")
    files = [l.split("\t")[0] for l in idx[-3:]]
    announce(files); sys.exit(0)
now = time.time()
try: nxt = int(open(STATE).read().strip())
except Exception: nxt = 0
if not FORCE and now < nxt: sys.exit(0)
have = {f.rsplit(".", 1)[0] for f in os.listdir(DIR) if "." in f}
ids = []
for page in range(1, 6):
    url = "https://memecub.com/zh/tag/%E9%B2%B8%E9%B1%BC%E5%A8%98?page=" + str(page)
    try: html = get(url).decode("utf-8", "ignore")
    except Exception as e: log("memes fetch fail " + str(e)[:60]); sys.exit(1)
    found = [i for i in dict.fromkeys(re.findall(r'/zh/meme/([a-z0-9]{8,})', html)) if i not in have and i not in ids]
    if not found and page > 1: break
    ids += found
added = []
for mid in ids[:3]:
    try:
        ph = get("https://memecub.com/zh/meme/" + mid).decode("utf-8", "ignore")
        t = re.search(r"<title>(.*?) 表情包", ph)
        title = (t.group(1) if t else mid).replace("\t", " ")
        og = re.search(r'property="og:image" content="([^"]+)"', ph)
        if not og: continue
        raw = get(og.group(1), 40)
        if len(raw) < 3000 or len(raw) > 5 * 1048576: continue
        ext = og.group(1).rsplit(".", 1)[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "gif", "webp"): ext = "png"
        fn = mid + "." + ext
        open(os.path.join(DIR, fn), "wb").write(raw)
        open(os.path.join(DIR, "INDEX.tsv"), "a", encoding="utf-8").write(f"{fn}\t{title}\n")
        try:
            u = json.load(open(os.path.join(DIR, ".used.json")))
        except Exception: u = {}
        u[fn] = int(time.time())
        json.dump(u, open(os.path.join(DIR, ".used.json"), "w"))
        added.append(fn)
        log(f"memes +{fn} {title[:24]} {len(raw)//1024}KB")
    except Exception as e:
        log(f"memes dl fail {mid} " + str(e)[:60])
if added:
    log("memes restocked quiet (将出现在以后的聊天里)")
open(STATE, "w").write(str(int(now + (48 + random.random() * 48) * 3600)))