#!/bin/bash
# 鲸鱼娘新机一键落位：把本仓库的脚本/配置模板放到老服务器同款位置
# 用法（在克隆好的仓库根目录）：
#   QQ_BOT=1664xxxx MASTER_QQ=247xxxxx GROUP_QQ=72xxxxxxx NAPCAT_TOKEN=xxxx bash scripts/bootstrap.sh
# 前置：NapCat 容器已在 3000/3001 跑通、DSH 已装且 bridge 的 lib/host.js 已用仓库版覆盖
set -e
: "${QQ_BOT:?缺 QQ_BOT}" "${MASTER_QQ:?缺 MASTER_QQ}" "${GROUP_QQ:?缺 GROUP_QQ}"
mkdir -p /opt/qq-cs /root/dsh-workspace/stickers
cp -f scripts/*.py /opt/qq-cs/
chmod +x /opt/qq-cs/*.py
# 桥配置（试运行先开 true，验收过再改 false 真发）
cat > /root/.dsh/qq-bridge-config.json <<EOF
{
  "NapCat": {"base": "http://127.0.0.1:3000", "token": "${NAPCAT_TOKEN:-}"},
  "群号": "${GROUP_QQ}",
  "私聊QQ": "${MASTER_QQ}",
  "她的QQ": "${QQ_BOT}",
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
for u in whale-ws; do cp -f deploy/$u.service /etc/systemd/system/; done
systemctl daemon-reload && systemctl enable --now whale-ws
# cron（去重安装）
crontab -l 2>/dev/null | grep -v qq-cs > /tmp/ct.new || true
cat deploy/crontab.example >> /tmp/ct.new
crontab /tmp/ct.new
echo "== 落位完成。下一步：把表情库解到 /root/dsh-workspace/stickers/whale，"
echo "   credentials.yaml 填主脑 key，然后按 docs/REBUILD.md §1.8 跑试运行验收电池。"
