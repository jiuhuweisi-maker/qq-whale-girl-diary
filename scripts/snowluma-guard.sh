#!/bin/bash
# snowluma-guard: 只报警不重启（重启容器=票据必死=扫码）
STATE=/opt/qq-cs/.snowluma-alive
T="<新家HTTP票>"
R=$(curl -s -m 8 "http://127.0.0.1:3002/get_login_info?access_token=$T" -d '{}' 2>/dev/null)
KICK=$(docker logs snowluma --since 3m 2>&1 | grep -acE "Kicked|踢下线" || true)
ALIVE=dead
echo "$R" | grep -q '"retcode":0' && ALIVE=alive
[ "$KICK" -gt 0 ] && ALIVE=dead
OLD=$(cat $STATE 2>/dev/null || echo unknown)
[ "$OLD" = unknown ] && echo "$ALIVE" > $STATE
WEBHOOK=$(grep -oE "webhook=\S+" /opt/qq-cs/notify.conf 2>/dev/null | cut -d= -f2)
if [ "$ALIVE" = dead ] && [ "$OLD" = alive ]; then
  [ -n "$WEBHOOK" ] && curl -s -m 10 -X POST "$WEBHOOK" -H 'content-type: application/json' -d '{"msgtype":"text","text":{"content":"🧟‍♀️ SnowLuma会话掉了(踢下线flag:'$KICK')。规矩：绝不重启容器——重启=必须扫码。请主人开 http://服务器:6081 远程桌面重扫，或让Agent排查网络层。"}}' 
  echo dead > $STATE
  echo "$(date '+%m-%d %H:%M') 报警:alive→dead" >> /opt/qq-cs/snowluma-guard.log
elif [ "$ALIVE" = alive ] && [ "$OLD" != alive ]; then
  [ -n "$WEBHOOK" ] && curl -s -m 10 -X POST "$WEBHOOK" -H 'content-type: application/json' -d '{"msgtype":"text","text":{"content":"🐋✅ SnowLuma会话恢复在线，无需操作。"}}'
  echo alive > $STATE
  echo "$(date '+%m-%d %H:%M') 恢复→alive" >> /opt/qq-cs/snowluma-guard.log
fi
