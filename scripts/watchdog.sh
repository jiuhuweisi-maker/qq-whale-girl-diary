#!/bin/bash
# patch135: SurfCore has per-conversation sessions. A retired legacy session or
# legacy heartbeat is not evidence that the current backend needs a restart.
exec 9>/opt/qq-cs/.watchdog.lock
flock -n 9 || exit 0
WD_BACKEND=$(python3 /opt/qq-cs/runtime_health.py --backend 2>/dev/null)
if [ "$WD_BACKEND" = "surfcore" ]; then
  for s in dsh whale-ws; do
    systemctl is-active "$s" --quiet || systemctl restart "$s"
  done
  WD_STATUS=$(python3 /opt/qq-cs/runtime_health.py --notify 2>/dev/null)
  printf '%s SurfCore %s\n' "$(date '+%F %T')" "$WD_STATUS" >> /opt/qq-cs/watchdog.log
  python3 /opt/qq-cs/balance_warn.py >/dev/null 2>&1 || true
  exit 0
fi
if [ "$WD_BACKEND" != "legacy" ]; then
  printf '%s backend probe unavailable; no speculative restart\n' "$(date '+%F %T')" >> /opt/qq-cs/watchdog.log
  exit 1
fi
# v93: 旧NapCat风险旗不再整体短路看门狗(本脚本无QQ进程动作，掉线判定归guard v3)；旗在则仅记痕
if [ -e "/opt/qq-cs/.napcat-risk-paused" ]; then
  echo "$(date '+%F %T') 注意：历史遗留风险旗存在(不影响本看门狗职责)" >> /opt/qq-cs/watchdog.log
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
    curl -s -m 8 "$API/send_private_msg" -d "{\"user_id\":$MASTER,\"message\":[{\"type\":\"text\",\"data\":{\"text\":\"【系统巡检】自动拉起失败：$BAD ，需要人来捞一下了😿\"}}]}" -H 'content-type: application/json' >/dev/null
  fi
  echo "$(date '+%F %T') 异常:$BAD" >> /opt/qq-cs/watchdog.log
else
  echo "$(date '+%F %T') 全场健康" >> /opt/qq-cs/watchdog.log
fi
tail -c 1048576 /opt/qq-cs/watchdog.log > /tmp/wd && mv /tmp/wd /opt/qq-cs/watchdog.log 2>/dev/null || true
python3 /opt/qq-cs/balance_warn.py >/dev/null 2>&1 || true
# v93 心跳探针：host.js成功拉取才刷心跳；心跳窒息>10分钟而桥面还能答=拉取环死了(装睡)→重启dsh(冷却1h)
HB=/opt/qq-cs/.bridge-heartbeat
if [ -f "$HB" ]; then
  HBA=$(( $(date +%s) - $(stat -c %Y "$HB") ))
  if [ $HBA -gt 600 ] && curl -s -m 6 "http://127.0.0.1:3080/dsh-qq-bridge/poke?token=${T}" -d '{}' -H 'content-type: application/json' | grep -qE '"ok"|uid'; then
    if [ ! -f /opt/qq-cs/.hb_mark ] || [ $(( $(date +%s) - $(stat -c %Y /opt/qq-cs/.hb_mark) )) -gt 3600 ]; then
      touch /opt/qq-cs/.hb_mark
      systemctl restart dsh
      echo "$(date '+%F %T') 心跳窒息${HBA}s但桥面能答→判拉取环死，已重启dsh" >> /opt/qq-cs/watchdog.log
      exit 0
    fi
  fi
fi
TK=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE "token=[A-Za-z0-9_-]+" | tail -1 | cut -d= -f2); ALIVE=$(curl -s -m 10 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK" -H 'content-type: application/json' -d '{}')
echo "$(date +%H:%M) $ALIVE" >> /opt/qq-cs/sess_alive.log
if echo "$ALIVE" | grep -q '"ok":true'; then
  rm -f /opt/qq-cs/.brain_notified
elif echo "$ALIVE" | grep -q '"状":"dead"'; then
  # DSH 在线但目标会话没载入：先用 Remote API 唤醒原会话，不重启服务。
  if python3 /opt/qq-cs/wake_dsh_session.py >> /opt/qq-cs/watchdog.log 2>&1; then
    rm -f /opt/qq-cs/.brain_notified
  else
    WHY='鲸鱼娘会话没载入；自动唤醒失败，需检查 DSH 会话状态'
    if [ ! -f /opt/qq-cs/.brain_notified ]; then
      BU=$(grep -oP '(?<=webhook=).*' /opt/qq-cs/notify.conf 2>/dev/null)
      [ -n "$BU" ] && curl -s -m 8 "$BU" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"🧠 养鱼场提醒｜$(date '+%F %H:%M')｜$WHY\"}}" >/dev/null 2>&1
      touch /opt/qq-cs/.brain_notified
    fi
  fi
else
  # 只有桥不通或状态异常时才重启 DSH 服务；重启后仍不健康才报警。
  systemctl restart dsh
  echo "$(date '+%F %T') 桥状态异常，已重启 dsh" >> /opt/qq-cs/watchdog.log
  sleep 90
  TK2=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)
  A2=$(curl -s -m 10 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK2" -H 'content-type: application/json' -d '{}')
  if echo "$A2" | grep -q '"ok":true'; then
    rm -f /opt/qq-cs/.brain_notified
  else
    if echo "$A2" | grep -q '"状":"dead"'; then
      if python3 /opt/qq-cs/wake_dsh_session.py >> /opt/qq-cs/watchdog.log 2>&1; then
        rm -f /opt/qq-cs/.brain_notified
        exit 0
      fi
      WHY='DSH已恢复但鲸鱼娘会话没载入；自动唤醒失败，需检查 DSH 会话状态'
    else
      WHY='重启DSH后桥仍不健康；需要检查服务器日志'
    fi
    if [ ! -f /opt/qq-cs/.brain_notified ]; then
      BU=$(grep -oP '(?<=webhook=).*' /opt/qq-cs/notify.conf 2>/dev/null)
      [ -n "$BU" ] && curl -s -m 8 "$BU" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"🧠 养鱼场提醒｜$(date '+%F %H:%M')｜$WHY\"}}" >/dev/null 2>&1
      touch /opt/qq-cs/.brain_notified
      echo "$(date '+%F %T') DSH恢复后仍需处理，已提醒主人" >> /opt/qq-cs/watchdog.log
    fi
  fi
fi
