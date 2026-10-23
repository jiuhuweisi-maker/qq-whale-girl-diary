#!/bin/bash
# 灵魂资产每日自备份（cron 40 12,22 调用；新机 deploy key 挂好后即用）
set -u
REPO=/opt/whale-live          # clone 到本地（remote 走 ssh://git@ssh.github.com:443/...）
WS=/root/dsh-workspace
mkdir -p $REPO/live-backup
for f in QQ-DUTY-LOG.md MEME_NOTES.md AGENTS.md; do
  python3 /opt/qq-cs/sanitize_live.py $WS/$f $REPO/live-backup/$f
done
cd $REPO || exit 0
git pull -q --rebase origin main || true
git add live-backup
git diff --cached --quiet || git commit -qm "live sync $(date +%F_%H:%M)"
for i in 1 2 3; do
  git push -q origin main 2>>/opt/qq-cs/backup.log && { echo "$(date +%F_%H:%M) 推送成功" >> /opt/qq-cs/backup.log; break; }
  sleep 20
done
