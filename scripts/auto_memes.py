# -*- coding: utf-8 -*-
"""表情库自动进货：每 2~4 天从 memecub 标签页抓 1~3 张未入库的新图，
   登记 INDEX.tsv，冷藏（.used.json 打今天戳，几天后才进轮换）。
   cron: 23 * * * * /usr/bin/python3 /path/auto_memes.py >> /path/cron.log 2>&1"""
import json, os, random, re, sys, time, urllib.request, base64 as b64m
FORCE = "--force" in sys.argv
DIR = "/root/dsh-workspace/stickers/memecub"
TAG_URL = "https://memecub.com/zh/tag/%E9%B2%B8%E9%B1%BC%E5%A8%98?page="   # ← 换成你想要的标签
STATE = "/opt/qq-cs/memes_next.txt"
LOG = "/opt/qq-cs/log.txt"
def log(m): open(LOG, "a", encoding="utf-8").write(time.strftime("%m-%d %H:%M ") + m + "\n")
def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=timeout).read()
now = time.time()
try: nxt = int(open(STATE).read().strip())
except Exception: nxt = 0
if not FORCE and now < nxt: sys.exit(0)
have = {f.rsplit(".", 1)[0] for f in os.listdir(DIR) if "." in f}
ids = []
for page in range(1, 6):
    try: html = get(TAG_URL + str(page)).decode("utf-8", "ignore")
    except Exception as e: log("fetch fail " + str(e)[:60]); sys.exit(1)
    found = [i for i in dict.fromkeys(re.findall(r'/zh/meme/([a-z0-9]{8,})', html)) if i not in have and i not in ids]
    if not found and page > 1: break
    ids += found
for mid in ids[:3]:
    try:
        ph = get("https://memecub.com/zh/meme/" + mid).decode("utf-8", "ignore")
        t = re.search(r"<title>(.*?) 表情包", ph)
        title = (t.group(1) if t else mid).replace("\t", " ")
        og = re.search(r'property="og:image" content="([^"]+)"', ph)   # 原图直链，后缀不定
        if not og: continue
        raw = get(og.group(1), 40)
        if len(raw) < 3000 or len(raw) > 5 * 1048576: continue          # QQ 单图 5MB 限制
        ext = og.group(1).rsplit(".", 1)[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "gif", "webp"): ext = "png"
        fn = mid + "." + ext
        open(os.path.join(DIR, fn), "wb").write(raw)
        open(os.path.join(DIR, "INDEX.tsv"), "a", encoding="utf-8").write(f"{fn}\t{title}\n")
        u = {}
        try: u = json.load(open(os.path.join(DIR, ".used.json")))
        except Exception: pass
        u[fn] = int(time.time())                                        # 冷藏：从今天算
        json.dump(u, open(os.path.join(DIR, ".used.json"), "w"))
        log(f"memes +{fn} {title[:24]} {len(raw)//1024}KB")
    except Exception as e:
        log(f"dl fail {mid} " + str(e)[:60])
open(STATE, "w").write(str(int(now + (48 + random.random() * 48) * 3600)))
