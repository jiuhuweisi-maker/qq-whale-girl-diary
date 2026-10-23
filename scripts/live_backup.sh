#!/bin/bash
# 灵魂资产每日自备份 v2：永远对齐远端再提交，杜绝分叉（内容皆可从源重生成）
set -u
REPO=/opt/whale-live
WS=/root/dsh-workspace
cd $REPO 2>/dev/null || { echo "$(date +%F_%H:%M) 无仓库目录" >> /opt/qq-cs/backup.log; exit 0; }
git fetch -q origin main || { echo "$(date +%F_%H:%M) fetch失败(线路抽?)" >> /opt/qq-cs/backup.log; exit 0; }
git reset -q --hard origin/main
mkdir -p $REPO/live-backup/grabbed
for f in QQ-DUTY-LOG.md MEME_NOTES.md AGENTS.md; do
  python3 /opt/qq-cs/sanitize_live.py $WS/$f $REPO/live-backup/$f
done
cp -n $WS/stickers/whale/gr* $REPO/live-backup/grabbed/ 2>/dev/null
grep "^gr" $WS/stickers/whale/INDEX.tsv > $REPO/live-backup/GRAB-INDEX.tsv 2>/dev/null || true
git add live-backup
if ! git diff --cached --quiet; then
  git commit -qm "live sync $(date +%F_%H:%M)"
  for i in 1 2 3; do
    git push -q origin main 2>>/opt/qq-cs/backup.log && { echo "$(date +%F_%H:%M) 推送成功 $(git rev-parse --short HEAD)" >> /opt/qq-cs/backup.log; break; }
    [ $i -lt 3 ] && { git pull -q --rebase origin main || git reset -q --hard origin/main; sleep 25; }
  done
else
  echo "$(date +%F_%H:%M) 无变化" >> /opt/qq-cs/backup.log
fi