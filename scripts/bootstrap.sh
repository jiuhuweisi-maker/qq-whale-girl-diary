#!/bin/bash
# ⚠️ 历史遗留(NapCat时代安装器)：会拉NapCat容器、改Docker自启策略。当前新家=SnowLuma+DSH桥，
#    严禁在本机运行本脚本(同号双客户端会互踢)。重建流程看 docs/SNOWLUMA.md 与 docs/REBUILD.md。(v93注,10-26)
# 鲸鱼娘新机一键落位：把本仓库的脚本/配置模板放到老服务器同款位置
# 用法（在克隆好的仓库根目录）：
#   QQ_BOT=1664xxxx MASTER_QQ=247xxxxx GROUP_QQ=72xxxxxxx NAPCAT_TOKEN=xxxx bash scripts/bootstrap.sh
# 前置：NapCat 容器已在 3000/3001 跑通、DSH 已装且 bridge 的 lib/host.js 已用仓库版覆盖
set -e
: "${QQ_BOT:?缺 QQ_BOT}" "${MASTER_QQ:?缺 MASTER_QQ}" "${GROUP_QQ:?缺 GROUP_QQ}"
mkdir -p /opt/qq-cs /root/dsh-workspace/stickers
cp -f scripts/*.py /opt/qq-cs/
cp -f scripts/watchdog.sh scripts/live_backup.sh scripts/napcat-risk-guard.sh /opt/qq-cs/ 2>/dev/null || true
cp -f scripts/session_archive_query.js /opt/qq-cs/
chmod +x /opt/qq-cs/*.py /opt/qq-cs/*.sh 2>/dev/null || true
# 桥配置（试运行先开 true，验收过再改 false 真发）
cat > /root/.dsh/qq-bridge-config.json <<EOF
{
  "NapCat": "http://127.0.0.1:3000",
  "群号": "${GROUP_QQ}",
  "私聊QQ": "${MASTER_QQ}",
  "她的QQ": "${QQ_BOT}",
  "称呼": "鲸鱼娘",
  "目标会话": "${GROUP_QQ}",
  "图片根目录": "/root/dsh-workspace/stickers/whale",
  "收图": true,
  "收图最多": 2,
  "总开关": true,
  "试运行": true,
  "转群": true,
  "转私聊": true,
  "发图": true,
  "图上限MB": 8
}
EOF
# 人设与日志种子（若旧机 rsync 过就跳过覆盖）
[ -f /root/dsh-workspace/AGENTS.md ] || cp templates/AGENTS.md /root/dsh-workspace/AGENTS.md
[ -f /root/dsh-workspace/QQ-DUTY-LOG.md ] || cp docs/QQ-DUTY-LOG-live.md /root/dsh-workspace/QQ-DUTY-LOG.md
[ -f /root/dsh-workspace/MEME_NOTES.md ] || cp docs/MEME_NOTES-snapshot.md /root/dsh-workspace/MEME_NOTES.md
# systemd
for u in whale-ws napcat-risk-guard; do cp -f deploy/$u.service /etc/systemd/system/; done
systemctl daemon-reload && systemctl enable --now whale-ws napcat-risk-guard
# cron（去重安装）
crontab -l 2>/dev/null | grep -v qq-cs > /tmp/ct.new || true
tr -d '\r' < deploy/crontab.example >> /tmp/ct.new
crontab /tmp/ct.new
echo "== 落位完成。下一步：把表情库解到 /root/dsh-workspace/stickers/whale，"
echo "   credentials.yaml 填主脑 key，然后按 docs/REBUILD.md §1.8 跑试运行验收电池。"
