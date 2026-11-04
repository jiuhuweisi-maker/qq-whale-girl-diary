#!/bin/bash
# dsh 公开发布巡检：版本越过 0.2.1-rc.2 或 rc.3 转正即 webhook 报主人（每天一次，变了才报）
# 可选运维件，不属于部署必需；不要自动装进新机 cron，先确认 notify.conf 里的 webhook 是自己的。
CUR="0.2.1-rc.2"
TAGS=$(curl -s -m 20 "https://registry.npmmirror.com/@deepseek-ai/dsh" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); t=d.get('dist-tags',{})
    print(t.get('latest','?'),t.get('next','?'))
except: print('? ?')" )
L=$(echo $TAGS | awk '{print $1}'); N=$(echo $TAGS | awk '{print $2}')
ST=/opt/qq-cs/.ver_state
NEW="latest=$L next=$N"
OLD=$(cat $ST 2>/dev/null)
if [ "$NEW" != "$OLD" ] && { [ "$L" != "$CUR" ] || [ "$N" != "$CUR" ]; }; then
  URL=$(grep -oP '(?<=webhook=).*' /opt/qq-cs/notify.conf 2>/dev/null)
  [ -n "$URL" ] && curl -s -m 8 "$URL" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"\U0001F430 dsh公开发布有动静:latest=$L next=$N(现役$CUR)。若是新版带插件机制，可择日升主机让dsh-ops上岗\"}}" >/dev/null 2>&1
  echo "$(date '+%F %T') 版本巡检上报:$NEW" >> /opt/qq-cs/version_check.log
fi
echo "$NEW" > $ST
