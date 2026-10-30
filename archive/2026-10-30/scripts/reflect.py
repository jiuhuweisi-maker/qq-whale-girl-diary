#!/usr/bin/env python3
# 晚间复盘：每天 22:30 注入内部轮，让她把当天所学写进值班日志（不发 QQ）
import subprocess, datetime, urllib.request, json, re
LOG = "/opt/qq-cs/log.txt"
out = subprocess.run(["journalctl","-u","dsh","--no-pager"], stdout=subprocess.PIPE).stdout.decode("utf-8","ignore")
toks = re.findall(r"token=([A-Za-z0-9_-]+)", out)
if not toks: raise SystemExit("no token")
prompt = "（系统提示，对方看不到）晚间复盘时间，本轮不发任何 QQ 消息。步骤：①用 Bash 读 /root/dsh-workspace/QQ-DUTY-LOG.md ②回想今天上下文里的对话：每个群友各学到了什么（喜好/外号/禁忌/相处之道）、学了什么新梗新词、有什么名场面、自己有什么失误、被谁纠正了什么 ③把今天的新认识追加到日志末尾（标题行：## 复盘 MM-DD，正文两到六条要点；真没新东西就写一条今日平稳）④全部做完后，只输出略过两个字，别的什么都不带。"
body = json.dumps({"text": prompt, "channel": "none"}).encode()
req = urllib.request.Request("http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=" + toks[-1], data=body, headers={"content-type":"application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=20))
except Exception as e:
    raise SystemExit("reflect fail: %s" % e)
open(LOG,"a").write("%s reflect ok=%s\n" % (datetime.datetime.now().strftime("%m-%d %H:%M"), r.get("ok")))