#!/bin/bash
QQ_RISK_PAUSE=/opt/qq-cs/.napcat-risk-paused
if [ -e "$QQ_RISK_PAUSE" ]; then
  echo "$(date '+%F %T') QQ风险暂停，跳过自动拉起" >> /opt/qq-cs/watchdog.log
  exit 0
fi
# 自愈看门狗：挂了自动拉起；拉不起来才私聊主人报警（1小时内不重复报）
CFG=/root/.dsh/qq-bridge-config.json
API=$(python3 -c "import json;N=json.load(open('$CFG'))['NapCat'];print(N if isinstance(N,str) else N['base'])")
MASTER=$(python3 -c "import json;print(json.load(open('$CFG'))['私聊QQ'])")
BAD=""
for s in dsh whale-ws; do systemctl is-active $s --quiet || { systemctl restart $s; sleep 8; systemctl is-active $s --quiet || BAD="$BAD $s"; }; done
docker ps -q -f name=snowluma | grep -q . || { BAD="$BAD snowluma(容器不在跑!只报警绝不restart)"; }
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
TK=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE "token=[A-Za-z0-9_-]+" | tail -1 | cut -d= -f2); ALIVE=$(curl -s -m 10 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK" -H 'content-type: application/json' -d '{}')
echo "$(date +%H:%M) $ALIVE" >> /opt/qq-cs/sess_alive.log
echo "$ALIVE" | grep -q '"ok":true' || {
  systemctl restart dsh
  echo "$(date '+%F %T') 脑宕机已重启dsh" >> /opt/qq-cs/watchdog.log
  sleep 90
  TK2=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)
  A2=$(curl -s -m 10 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK2" -H 'content-type: application/json' -d '{}')
  if echo "$A2" | grep -q '"ok":true'; then
    rm -f /opt/qq-cs/.brain_notified
  elif [ ! -f /opt/qq-cs/.brain_notified ]; then
    BU=$(grep -oP '(?<=webhook=).*' /opt/qq-cs/notify.conf 2>/dev/null)
    [ -n "$BU" ] && curl -s -m 8 "$BU" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"🧠 养鱼场大脑告警｜$(date '+%F %H:%M')｜重启后她的会话仍没醒｜要做的事：电脑上打开鲸鱼娘GUI(14080隧道页)点开她那张会话卡片即可\}}" >/dev/null 2>&1
    touch /opt/qq-cs/.brain_notified
    echo "$(date '+%F %T') 脑重启未醒已推送主人" >> /opt/qq-cs/watchdog.log
  fi
}
