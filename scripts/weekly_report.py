# -*- coding: utf-8 -*-
# /opt/qq-cs/weekly_report.py —— patch38 周荣枯榜（日榜的哥：嘴王/梗王/潜水王）
import json, os, random, time, urllib.request, glob
from collections import Counter

CFG = json.load(open("/root/.dsh/qq-bridge-config.json"))
N = CFG["NapCat"]; N = N.get("base", "") if isinstance(N, dict) else N
ME = int(CFG.get("她的QQ") or <她的QQ>)
GID = int(CFG["群号"])
STATE = "/opt/qq-cs/.weekly_state.txt"
MEMDIR = "/opt/qq-cs/memory"

def thisweek():
    w = time.strftime("%G-%V")
    return w

def load(days=7):
    recs = []
    cutoff = time.time() - days * 86400
    for p in sorted(glob.glob(MEMDIR + "/*.jsonl")):
        try:
            for l in open(p, encoding="utf-8"):
                try: r = json.loads(l)
                except Exception: continue
                if (r.get("t") or 0) >= cutoff and int(r.get("uid") or 0) != ME:
                    recs.append(r)
        except Exception: pass
    return recs

def main():
    w = thisweek()
    if os.path.exists(STATE) and open(STATE).read().strip() == w:
        return
    recs = load()
    if len(recs) < 20:
        print("本周数据太少(%d)，跳过" % len(recs))
        open(STATE, "w").write(w)
        return
    talk = Counter(str(r.get("nick") or "?") for r in recs)
    imgc = Counter()
    for r in recs:
        n = r.get("imgs") or 0
        n = len(n) if isinstance(n, list) else int(n)
        if n: imgc[str(r.get("nick") or "?")] += n
    嘴王, 嘴数 = talk.most_common(1)[0]
    if imgc:
        梗王, 梗数 = imgc.most_common(1)[0]
    else:
        梗王, 梗数 = "", 0
    潜水王 = ""
    try:
        req = urllib.request.Request(N + "/get_group_member_list", data=json.dumps({"group_id": GID, "no_cache": False}).encode(), headers={"content-type": "application/json"})
        们 = json.loads(urllib.request.urlopen(req, timeout=12).read().decode()).get("data") or []
        们 = 们 if isinstance(们, list) else []
        本周说话 = set(str(r.get("nick")) for r in recs)
        上周 = load(days=28)
        近期说话 = set(str(r.get("nick")) for r in 上周)
        潜在 = [str(x.get("card") or x.get("nickname") or "") for x in 们 if x.get("card") or x.get("nickname")]
        潜在 = [x for x in 潜在 if x and x not in 本周说话 and x in 近期说话]
        if 潜在: 潜水王 = random.choice(潜在)
    except Exception: pass
    头 = random.choice(["🏆本周群荣枯榜——", "📜发榜了📜 本周荣枯：", "🏆敲黑板，本周榜单——"])
    句 = 头 + "嘴王 %s（%d条）" % (嘴王, 嘴数)
    if 梗王: 句 += "｜梗王 %s（甩图%d张）" % (梗王, 梗数)
    if 潜水王: 句 += "｜潜水王 %s（出来冒个泡嘛）" % 潜水王
    尾 = random.choice(["上榜的请客，没上的继续水。", "下周再战，鲸鱼裁判吹哨了🐋", "数据我一条一条数出来的，不服憋着💙"])
    句 += "\n" + 尾
    if os.environ.get("WEEK_DRY"):
        print("DRY:", 句); return
    req = urllib.request.Request(N + "/send_group_msg", data=json.dumps({"group_id": GID, "message": 句}).encode(), headers={"content-type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=12).read().decode())
    if j.get("status") == "ok":
        open(STATE, "w").write(w)
        print("发榜成功")
    else:
        print("发榜失败", str(j)[:80])

main()