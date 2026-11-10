# -*- coding: utf-8 -*-
# /opt/qq-cs/bilibili_search.py —— patch39 找B站视频（bing提BV→view接口验真→热度新鲜度排序）
import sys, os, re, json, time, math, random, urllib.request, urllib.parse

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
LAST = "/opt/qq-cs/.bili_last.txt"
G = 0

def get(url, referer=None, ua=None):
    h = {"User-Agent": ua or UA}
    if referer: h["Referer"] = referer
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=15).read().decode("utf-8", "ignore")

NABUA = "curl/7.29.2"  # B站view接口认裸UA，伪装浏览器反而412

def grab_bvs(html, out):
    for bv in re.findall(r"BV1[0-9A-Za-z]{9}(?![0-9A-Za-z])", html):
        if bv not in out: out.append(bv)
    return out

def bing_bvs(kw, site=True):
    q = (kw + " site:bilibili.com") if site else ("bilibili " + kw)
    html = get("https://cn.bing.com/search?q=" + urllib.parse.quote(q))
    return grab_bvs(html, [])

def sogou_bvs(kw):
    html = get("https://www.sogou.com/web?query=" + urllib.parse.quote(kw + " site:bilibili.com"))
    return grab_bvs(html, [])

def view(bv):
    try:
        time.sleep(0.4)
        d = json.loads(get("https://api.bilibili.com/x/web-interface/view?bvid=" + bv, ua=NABUA))
        if d.get("code") != 0: return None
        v = d["data"]
        t = re.sub(r"(#[^#]{1,14}#)\s*$", "", str(v.get("title") or "").strip())
        t = re.sub(r"[_\-—].{0,12}(哔哩哔哩|bilibili).{0,6}$", "", t).strip()
        return {"bv": bv, "title": t or v.get("title", ""), "up": (v.get("owner") or {}).get("name", "?"),
                "view": int((v.get("stat") or {}).get("view") or 0), "dur": int(v.get("duration") or 0),
                "pub": int(v.get("pubdate") or 0)}
    except Exception: return None

def fmt(n):
    if n >= 100000000: return "%.1f亿" % (n / 1e8)
    if n >= 10000: return "%.1f万" % (n / 1e4)
    return str(n)

def main():
    kw = " ".join(sys.argv[1:]).strip()
    if not kw:
        print("用法: bilibili_search.py 关键词"); return
    try:
        if os.path.exists(LAST):
            last_kw, last_ts = open(LAST).read().split("|")
            if last_kw == kw and time.time() - float(last_ts) < 90:
                print("这个刚搜过，歇90秒再看"); return
    except Exception: pass
    try:
        open(LAST, "w").write(kw + "|" + str(time.time()))
    except Exception: pass
    tries = [kw, " ".join(kw.split()[:2]), kw.split()[0]]
    bvs = []
    for tk in tries:
        for fn in (lambda: bing_bvs(tk, True), lambda: sogou_bvs(tk), lambda: bing_bvs(tk, False)):
            try:
                for cand in fn():
                    if cand not in bvs: bvs.append(cand)
            except Exception: pass
            if len(bvs) >= 5: break
        if len(bvs) >= 5: break
        if bvs: break
    bvs = bvs[:8]
    if not bvs:
        print("bing/sogou 都没回话，这个搜不了"); return
    vids = [v for v in (view(b) for b in bvs) if v]
    if not vids:
        print("找到%d个候选但都验不过（可能删了/加密）" % len(bvs)); return
    fresh = ("最新" in kw or "新" in kw)
    now = time.time()
    def score(v):
        s = math.log10(v["view"] + 10) * 2
        d = (now - v["pub"]) / 86400 if v["pub"] else 9999
        bonus = 3 if d <= 30 else (1.5 if d <= 90 else (0.5 if d <= 180 else 0))
        s2 = 0.0
        if any(x in kw for x in ("名场面", "高光", "剪辑", "操作", "瞬间", "时刻")):
            if v["dur"] <= 600: s2 += 2.0
            elif v["dur"] >= 3600: s2 -= 2.5
        elif v["dur"] >= 7200: s2 -= 1.0
        return s + bonus * (2 if fresh else 1) + s2 + random.random() * 0.3
    vids.sort(key=score, reverse=True)
    for i, v in enumerate(vids[:3]):
        ym = time.strftime("%Y-%m", time.localtime(v["pub"])) if v["pub"] else "?"
        mm = v["dur"] // 60
        line = "%d. %s | UP:%s | %s播放 | %d分%02d秒 | %s | https://www.bilibili.com/video/%s/" % (
            i + 1, v["title"], v["up"], fmt(v["view"]), mm, v["dur"] % 60, ym, v["bv"])
        print(line)
    print("（要第2/3个就说序号，链接都在）")

main()