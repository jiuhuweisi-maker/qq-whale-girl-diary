# -*- coding: utf-8 -*-
# /opt/qq-cs/bili_trends.py —— 每月1次拉B站热门20条写进梗速查文件
import json, time, urllib.request
OUT = "/opt/qq-cs/bili_memes.md"
UA = "curl/7.29.2"
def main():
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://api.bilibili.com/x/web-interface/popular?ps=20", headers={"User-Agent": UA}), timeout=15)
        d = json.loads(r.read().decode("utf-8", "ignore"))
        dd = d.get("data") or {}
        lst = dd.get("list") if isinstance(dd, dict) else dd
        lst = lst or []
    except Exception as e:
        print("热榜没拉到:", str(e)[:60]); return
    if not lst:
        print("热榜空"); return
    mon = time.strftime("%Y-%m")
    lines = ["## %s 热门速览" % mon]
    for v in lst:
        st = v.get("owner") or {}
        lines.append("- %s ｜UP:%s｜%s播" % (str(v.get("title", ""))[:50], st.get("name", "?"), "{:,}".format(int((v.get("stat") or {}).get("view") or 0)).replace(",", "")))
    block = "\n".join(lines) + "\n"
    old = ""
    if time.strftime("%d") == "01" and False: pass
    keep = []
    if time.strftime("%m") == "01":
        keep.append("%d-%02d" % (int(time.strftime("%Y")) - 1, 12))  # 一月清掉上年12月前的? 简单:保留原文件全部,一年后自然被裁
    if __import__("os").path.exists(OUT):
        t = open(OUT, encoding="utf-8").read()
        secs = []
        cur = []
        for l in t.split("\n"):
            if l.startswith("## 20"):
                if cur: secs.append("\n".join(cur).rstrip() + "\n")
                cur = [l]
            elif cur: cur.append(l)
        if cur: secs.append("\n".join(cur).rstrip() + "\n")
        head = t.split("##")[0]
        secs = [block] + secs[:2]  # 保最近3个月
        open(OUT, "w", encoding="utf-8").write(head + "".join(secs))
    else:
        open(OUT, "w", encoding="utf-8").write("# B站近月热门标题（自动每月更新，标题即梗源）\n\n" + block)
    print("热榜已更新 %d 条进 bili_memes.md" % len(lst))
main()