#!/bin/bash
# snowluma-guard v3 值班妈妈 10-26：三态判诊+拉停滞兆哨。绝不restart容器；空回包≠掉线。
STATE=/opt/qq-cs/.snowluma-alive
RETRY=/opt/qq-cs/.snowluma-retry
LOGF=/opt/qq-cs/snowluma-guard.log
STALL=/opt/qq-cs/.pull-stall-notified
R=$(curl -s -m 8 "http://127.0.0.1:3000/get_login_info" -d '{}' 2>/dev/null)
WEBHOOK=$(grep -oE "webhook=\S+" /opt/qq-cs/notify.conf 2>/dev/null | cut -d= -f2)
say() { [ -n "$WEBHOOK" ] && curl -s -m 10 -X POST "$WEBHOOK" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$1\"}}" >/dev/null 2>&1; }
# --- 拉停滞兆哨(每2分钟一圈,桥账本近10分钟连3条拉坏即报,30分钟去重) ---
TK=$(journalctl -u dsh --no-pager 2>/dev/null | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1 | cut -d= -f2)
ST=$(curl -s -m 6 -X POST "http://127.0.0.1:3080/dsh-qq-bridge/state?token=$TK" -H 'content-type: application/json' -d '{}' 2>/dev/null)
BADCNT=$(echo "$ST" | python3 -c "
import json,sys,time,re
try:
    d=json.load(sys.stdin); n=0
    for r in d.get('日志',[]):
        t=r.get('时间',''); txt=str(r.get('文本',''))
        if '拉坏' not in txt: continue
        m=re.match(r'(\d+)-(\d+) (\d+):(\d+):(\d+)',t)
        if not m: continue
        mo,day,hh,mm,ss=(int(x) for x in m.groups())
        now=time.localtime(); yr=now.tm_year
        import calendar
        ts=calendar.timegm((yr,mo,day,hh-8,mm,ss,0,0,0))
        if now.tm_year==yr and time.time()-ts<600: n+=1
    print(n)
except Exception: print(0)" 2>/dev/null)
NOW=$(date +%s)
if [ "${BADCNT:-0}" -ge 3 ]; then
  LASTN=$(cat $STALL 2>/dev/null || echo 0)
  if [ $((NOW-LASTN)) -gt 1800 ]; then
    echo $NOW > $STALL
    say "🎣 拉停滞兆：桥活着但最近10分钟连续$BADCNT次拉消息失败，OneBot/relay 可能挂了。guard 不动手（上回就是乱动手出的事），值班妈妈醒来处理。详见桥账本。"
    echo "$(date '+%m-%d %H:%M') 拉停滞兆x$BADCNT→已报" >> $LOGF
  fi
fi
# --- 三态判诊 ---
if echo "$R" | grep -q '"retcode":0'; then
  VERDICT=alive
elif echo "$R" | grep -qE 'relay fail HTTP Error 40(1|3)|"retcode":1401|unauthorized'; then
  echo "$(date '+%m-%d %H:%M') 鉴权故障：不重启QQ，检查票同步" >> $LOGF
  exit 0
elif [ -z "$R" ] || echo "$R" | grep -qE 'relay fail|Errno 1(04|11)|Connection'; then
  # relay/OneBot 挂死或无回包：QQ可能登录得好好的，绝不动它
  echo "$(date '+%m-%d %H:%M') 无回包/relay故障：判挂起非掉线，不动QQ" >> $LOGF
  exit 0
else
  KICK=$(docker logs snowluma --since 3m 2>&1 | grep -acE "Kicked|踢下线" || echo 0)
  if [ "${KICK:-0}" -gt 0 ] || echo "$R" | grep -qE '"retcode":140[0-9]|logged.?out|offline'; then
    VERDICT=dead
  else
    echo "$(date '+%m-%d %H:%M') 判读不明($R 前60字:${R:0:60})：宁不动手" >> $LOGF
    exit 0
  fi
fi
OLD=$(cat $STATE 2>/dev/null || echo unknown)
if [ "$VERDICT" = dead ] && [ "$OLD" != dead ]; then
  MARK=$(cat $RETRY 2>/dev/null || echo 0)
  if [ $((NOW-MARK)) -gt 900 ]; then
    echo $NOW > $RETRY
    docker exec snowluma supervisorctl restart qq >/dev/null 2>&1
    echo "$(date '+%m-%d %H:%M') 真掉线→已试进程级重连(有自动登录)" >> $LOGF
  else
    echo dead > $STATE
    say "🧟‍♀️ 鲸鱼娘真掉线(踢下线)，自动重连冷却中救不回。请主人开 noVNC 远程桌面重登：http://<服务器IP>:6081/vnc.html?autoconnect=true 密码见 SECRETS.md。规矩：绝不重启容器。"
    echo "$(date '+%m-%d %H:%M') 重连无效→报警" >> $LOGF
  fi
elif [ "$VERDICT" = alive ] && [ "$OLD" != alive ]; then
  echo alive > $STATE
  say "🐋✅ SnowLuma会话在线（若是自动重连救回的则无需操作；若是刚扫码，辛苦了主人）"
  echo "$(date '+%m-%d %H:%M') →alive" >> $LOGF
fi
