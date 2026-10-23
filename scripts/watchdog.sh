#!/bin/bash
# 自愈看门狗：挂了自动拉起；拉不起来才私聊主人报警（1小时内不重复报）
CFG=/root/.dsh/qq-bridge-config.json
API=$(python3 -c "import json;N=json.load(open('$CFG'))['NapCat'];print(N if isinstance(N,str) else N['base'])")
MASTER=$(python3 -c "import json;print(json.load(open('$CFG'))['私聊QQ'])")
BAD=""
for s in dsh whale-ws; do systemctl is-active $s --quiet || { systemctl restart $s; sleep 8; systemctl is-active $s --quiet || BAD="$BAD $s"; }; done
docker ps -q -f name=napcat | grep -q . || { docker restart napcat >/dev/null 2>&1; sleep 15; docker ps -q -f name=napcat | grep -q . || BAD="$BAD napcat"; }
T=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)
curl -s -m 6 "http://127.0.0.1:3080/dsh-qq-bridge/poke?token=$T" -d '{}' -H 'content-type: application/json' | grep -qE '"ok"|uid' || BAD="$BAD bridge"
if [ -n "$BAD" ]; then
  ST=/opt/qq-cs/.wd_alert.txt
  NOW=$(date +%s)
  OLD=$(cat $ST 2>/dev/null || echo 0)
  if [ $((NOW - OLD)) -gt 3600 ]; then
    echo $NOW > $ST
    curl -s -m 8 "$API/send_private_msg" -d "{\"user_id\":$MASTER,\"message\":\"【系统巡检】自动拉起失败：$BAD ，需要人来捞一下了😿\"}" -H 'content-type: application/json' >/dev/null
  fi
  echo "$(date '+%F %T') 异常:$BAD" >> /opt/qq-cs/watchdog.log
else
  echo "$(date '+%F %T') 全场健康" >> /opt/qq-cs/watchdog.log
fi
tail -c 1048576 /opt/qq-cs/watchdog.log > /tmp/wd && mv /tmp/wd /opt/qq-cs/watchdog.log 2>/dev/null || true
python3 /opt/qq-cs/balance_warn.py >/dev/null 2>&1 || true
TK=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE "token=[A-Za-z0-9_-]+" | tail -1 | cut -d= -f2); ALIVE=$(curl -s -m 10 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK" -H "content-type: application/json" -d "{}"); echo "$(date +%H:%M) $ALIVE" >> /opt/qq-cs/sess_alive.log; echo "$ALIVE" | grep -q '"ok":true' || { systemctl restart dsh; for i in $(seq 1 15); do curl -s -m 3 -o /dev/null http://127.0.0.1:3080/ && break; sleep 4; done; echo "$(date +%H:%M) 会话dead已重启dsh" >> /opt/qq-cs/sess_alive.log; }
