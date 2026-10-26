#!/bin/bash
# 唤脑闹钟：每2小时戳她一轮(不回QQ)，大脑活动即不被归档；死了则重启dsh自救
T=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)
[ -z "$T" ] && exit 0
R=$(curl -s -m 20 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/nudge?token=$T" -H 'content-type: application/json' -d '{"text":"（内部保养轮·这轮会被桥拦下不发QQ）随口跟我说一句你现在想说的话吧——群里的事、天气、想打CS、随便什么，一行就行；不许用固定客套话开头。","channel":"none"}')
echo "$(date '+%F %H:%M') $R" >> /opt/qq-cs/keep_brain.log
echo "$R" | grep -q '"ok":true' || { systemctl restart dsh; echo "$(date '+%F %H:%M') 唤脑失败已重启dsh" >> /opt/qq-cs/keep_brain.log; }
tail -c 65536 /opt/qq-cs/keep_brain.log > /tmp/kb && mv /tmp/kb /opt/qq-cs/keep_brain.log
