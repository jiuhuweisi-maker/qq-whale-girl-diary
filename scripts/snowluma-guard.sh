#!/bin/bash
# snowluma-guard v2 复活梯子：掉线→先试进程级重连→无效才报警求扫码。绝不restart容器。
STATE=/opt/qq-cs/.snowluma-alive
RETRY=/opt/qq-cs/.snowluma-retry
T="<新家HTTP票>"
LOGF=/opt/qq-cs/snowluma-guard.log
R=$(curl -s -m 8 "http://127.0.0.1:3002/get_login_info?access_token=$T" -d '{}' 2>/dev/null)
KICK=$(docker logs snowluma --since 3m 2>&1 | grep -aE "Kicked|踢下线" | wc -l)
ALIVE=dead
echo "$R" | grep -q '"retcode":0' && ALIVE=alive
[ "$KICK" -gt 0 ] && ALIVE=dead
OLD=$(cat $STATE 2>/dev/null || echo unknown)
[ "$OLD" = unknown ] && echo "$ALIVE" > $STATE
WEBHOOK=$(grep -oE "webhook=\S+" /opt/qq-cs/notify.conf 2>/dev/null | cut -d= -f2)
say() { [ -n "$WEBHOOK" ] && curl -s -m 10 -X POST "$WEBHOOK" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$1\"}}" >/dev/null 2>&1; }
if [ "$ALIVE" = dead ] && [ "$OLD" = alive ]; then
  NOW=$(date +%s); MARK=$(cat $RETRY 2>/dev/null || echo 0)
  if [ $((NOW-MARK)) -gt 900 ]; then
    echo $NOW > $RETRY
    docker exec snowluma supervisorctl restart qq >/dev/null 2>&1
    echo "$(date '+%m-%d %H:%M') 掉线→已试进程级重连" >> $LOGF
  else
    echo dead > $STATE
    say "🧟‍♀️ SnowLuma会话掉了，自动重连也救不回(踢票了)。请主人开 noVNC 远程桌面重扫：http://<服务器IP>:6081/vnc.html?autoconnect=true&password=<新家VNC密码> 。规矩：绝不重启容器。"
    echo "$(date '+%m-%d %H:%M') 重连无效→报警" >> $LOGF
  fi
elif [ "$ALIVE" = alive ] && [ "$OLD" != alive ]; then
  echo alive > $STATE
  say "🐋✅ SnowLuma会话在线（若是自动重连救回的则无需操作；若是刚扫码，辛苦了主人）"
  echo "$(date '+%m-%d %H:%M') →alive" >> $LOGF
fi
