# -*- coding: utf-8 -*-
# /opt/qq-cs/web_sticker.py v2 —— bing图搜+白名单+限额+审计（patch34改）
import sys, os, re, json, time, random, hashlib
import urllib.request, urllib.parse

STK = "/root/dsh-workspace/stickers/whale"
INDEX = os.path.join(STK, "INDEX.tsv")
KEYS = os.path.join(STK, ".grab_keys.txt")
QUOTA = "/opt/qq-cs/.web_quota.json"
AUDIT = "/opt/qq-cs/web_grab_audit.txt"
ALLOW = ["qiubiaoqing.com", "hdslb.com", "bilibili.com", "iknow-pic.cdn.bcebos.com", "imgsa.baidu.com", "img.bdstatic.com", "i.gtimg.cn", "n.sinaimg.cn", "image.baidu.com", "dtstatic.com", "duitang.com", "ggemo.com", "xlgtx.com", "sinaimg.cn", "qpic.cn", "ifengimg.com"]
DAY_CAP = 3
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def allowed(u):
    host = (urllib.parse.urlparse(u).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in ALLOW)

def main():
    args = [a for a in sys.argv[1:] if a.strip()]
    if not args:
        print("用法: web_sticker.py 搜索词 [第几张=1]"); return
    nth = 1
    if args[-1].isdigit() and len(args) > 1:
        nth = int(args[-1]); args = args[:-1]
    q = " ".join(args).strip()
    today = time.strftime("%Y-%m-%d")
    quota = {}
    if os.path.exists(QUOTA):
        try: quota = json.load(open(QUOTA))
        except Exception: quota = {}
    if quota.get("day") != today: quota = {"day": today, "n": 0}
    if quota["n"] >= DAY_CAP:
        print("今天网络收图到限额了（%d张），明天再来" % DAY_CAP); return
    raw = []; cands = []; seenu = set()
    for suffix in [" 表情包", " 梗图", " gif"]:
        surl = "https://cn.bing.com/images/search?q=" + urllib.parse.quote(q + suffix) + "&form=HDRSC2"
        try:
            html = urllib.request.urlopen(urllib.request.Request(surl, headers={"User-Agent": UA}), timeout=15).read().decode("utf-8", "ignore")
        except Exception as e:
            print("搜索站没搭上来:", str(e)[:70]); return
        for u in re.findall(r'murl&quot;:&quot;(https?://[^&"]+)', html):
            u = u.replace("&amp;", "&")
            if u in seenu: continue
            seenu.add(u); raw.append(u)
            if allowed(u): cands.append(u)
        if cands: break
        time.sleep(2)
    if not cands:
        hosts = sorted(set((urllib.parse.urlparse(u).hostname or "?") for u in raw))[:6]
        print("搜到%d张但没有白名单站点（这次给的站:%s）" % (len(raw), " ".join(hosts))); return
    url = cands[min(max(nth, 1), len(cands)) - 1]
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://cn.bing.com/"}), timeout=20).read()
    except Exception as e:
        print("图下载失败:", str(e)[:70]); return
    if len(data) < 2000 or len(data) > 8 * 1024 * 1024:
        print("大小不对(%d)，不收" % len(data)); return
    ext = "png"
    if data[:3] == b"\xff\xd8\xff": ext = "jpg"
    elif data[:6] in (b"GIF87a", b"GIF89a"): ext = "gif"
    elif data[:4] == b"RIFF": ext = "webp"
    key = hashlib.md5(data).hexdigest().upper()
    old = open(KEYS).read().split() if os.path.exists(KEYS) else []
    if key in old:
        print("这张库里已经有了（指纹撞了），不收"); return
    fn = "wb%03d.%s" % (random.randint(100, 999), ext)
    while os.path.exists(os.path.join(STK, fn)): fn = "wb%03d.%s" % (random.randint(100, 999), ext)
    open(os.path.join(STK, fn), "wb").write(data)
    title = re.sub(r"\s+", " ", q)[:24]
    open(INDEX, "a", encoding="utf-8").write(fn + "\t" + title + "梗图（B站味·" + time.strftime("%m-%d") + "）\n")
    open(KEYS, "a").write(key + "\n")
    quota["n"] += 1
    json.dump(quota, open(QUOTA, "w"))
    open(AUDIT, "a", encoding="utf-8").write("%s\t%s\t%s\t今日第%d张\n" % (time.strftime("%m-%d %H:%M"), q, url, quota["n"]))
    print("收下了 %s：%s（今日 %d/%d）" % (fn, title, quota["n"], DAY_CAP))

main()