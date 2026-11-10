#!/bin/bash
# ⚠️ v93(2026-10-26)退役：本哨 retcode!=0 即喊"扫码重登"，把 relay 鉴权故障当掉线误报。
# 掉线/鉴权/挂起三态判定与报警已归 snowluma-guard v3(v92/v93补全报警)。线上 cron 已注释本行，文件留存备查。
# 踢线哨兵：每5分钟一趟，离线即webhook通知主人；恢复即清标记重报
FLAG=/opt/qq-cs/.napcat-risk-paused
NOTI=/opt/qq-cs/.kick_notified
CONF=/opt/qq-cs/notify.conf
R=$(curl -s -m 8 http://127.0.0.1:3000/get_login_info -H 'content-type: application/json' -d '{}' 2>/dev/null)
if echo "$R" | grep -q '"retcode":0'; then rm -f $NOTI; exit 0; fi
[ -f $NOTI ] && exit 0
REASON="NapCat无应答或登录态丢失"
[ -f $FLAG ] && REASON="QQ强制下线：$(head -1 $FLAG 2>/dev/null)"
URL=$(grep -oP '(?<=webhook=).*' $CONF 2>/dev/null)
TS=$(date '+%F %H:%M')
if [ -n "$URL" ]; then
  curl -s -m 8 "$URL" -H 'content-type: application/json' -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"🐋 鲸戒掉线警报｜$TS｜$REASON｜要做的事：手机QQ扫新授权码（去服务器要码：docker logs napcat 或问管家）\"}}" >/dev/null 2>&1
fi
touch $NOTI
echo "$(date '+%F %T') 掉线已报警($REASON)" >> /opt/qq-cs/kick_watch.log
