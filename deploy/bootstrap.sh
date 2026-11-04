#!/bin/bash
# 全新 Linux 服务器一键部署「最新版鲸戒」的代码层。
# 只做代码与模板：不碰 QQ 登录、不迁移她的人设与记忆、不启动 DSH。
# 用法： bash deploy/bootstrap.sh /root/whale-ops/install.local.json [--check]
set -euo pipefail

SETTINGS=${1:?用法: bash deploy/bootstrap.sh /绝对路径/install.local.json [--check]}
CHECK=${2:-}
REPO=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPO"

say(){ printf '%s\n' "$*"; }
die(){ printf '✗ %s\n' "$*" >&2; exit 1; }
ok(){ printf '✓ %s\n' "$*"; }
warn(){ printf '! %s\n' "$*" >&2; }

[ "$(id -u)" = 0 ] || die "以 root 运行（系统单元与 /opt 写入）"
[ -f "$SETTINGS" ] || die "找不到设置文件 $SETTINGS（复制 deploy/settings.example.json 到仓库外填写）"
case "$SETTINGS" in "$REPO"/*) die "设置文件不能放在仓库里（含 QQ 号与票路径），放仓库外";; esac

read_setting(){ node -e 'const s=require(process.argv[1]);process.stdout.write(String(s[process.argv[2]]??""))' "$SETTINGS" "$1"; }
SURFCORE_ROOT=$(read_setting surfcoreRoot)
DSH_HOME=$(read_setting dshHome)
PROFILE=$(read_setting profile); PROFILE=${PROFILE:-web}
TOKEN_FILE=$(read_setting onebotTokenFile)
FORBIDDEN=$(grep -c 'REPLACE_WITH' "$SETTINGS" || true)

say "== 1/6 预检 =="
[ "$FORBIDDEN" = 0 ] || die "设置里还有 REPLACE_WITH 占位符，先填真实值"
for c in node npm python3 git curl; do command -v "$c" >/dev/null || die "缺 $c"; done
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 24 ] || die "Node 需要 24+，当前 $(node -v)"
python3 -c 'import sys; sys.exit(0 if sys.version_info>=(3,6) else 1)' || die "Python 需要 3.6+"
command -v systemctl >/dev/null || die "需要 systemd"
[ -d "$DSH_HOME" ] || die "DSH_HOME 不存在：$DSH_HOME（先装好 DSH 并生成 profile）"
[ -f "$DSH_HOME/profiles/$PROFILE/package.json" ] || die "找不到 DSH profile $PROFILE"
[ -f "$TOKEN_FILE" ] || die "OneBot 票文件不存在：$TOKEN_FILE（权限应 600）"
[ "$(stat -c %a "$TOKEN_FILE")" = 600 ] || warn "OneBot 票文件不是 600，建议 chmod 600"
case "$SURFCORE_ROOT" in /*) ;; *) die "surfcoreRoot 必须是绝对路径";; esac
[ -e "$SURFCORE_ROOT" ] && die "目标源码目录已存在（拒绝覆盖）：$SURFCORE_ROOT"
for p in 3000 13100; do ss -ltn 2>/dev/null | grep -q ":$p " && die "端口 $p 已被占用"; done
read_setting ownerQQ >/dev/null; read_setting groupQQ >/dev/null; read_setting botQQ >/dev/null
ok "root / Node $(node -v) / Python $(python3 -V 2>&1 | cut -d' ' -f2) / DSH profile $PROFILE"
warn "只读提醒：本脚本不部署 NapCat、旧桥、旧 cron、archive/、live-backup/、simulator/、fundpilot"

if [ "$CHECK" = "--check" ]; then
  say "== 预检通过（--check 未写任何文件）=="
  say "将执行：构建 $SURFCORE_ROOT（固定上游 0.8.8 + 适配覆盖层）→ 装 relay → init.mjs → register-control.mjs → 离线回归"
  exit 0
fi

say "== 2/6 构建固定上游 + 现役覆盖层 =="
bash deploy/build-upstream.sh "$SURFCORE_ROOT"
PATCH=$(node -e 'import(process.argv[1]).then(m=>console.log(m.OVERLAY_PATCH))' "$REPO/integrations/surfcore/version.mjs")
[ "$PATCH" = "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).patch)' "$SURFCORE_ROOT/whale-overlay-manifest.json")" ] \
  || die "构建出来的清单版本与 version.mjs 不一致"
ok "源码就绪，清单 patch=$PATCH（536 文件）"

say "== 3/6 装 loopback relay =="
install -d -m 700 /opt/qq-cs
install -m 700 scripts/relay3000.py /opt/qq-cs/relay3000.py
install -m 600 deploy/whale-relay.service /etc/systemd/system/whale-relay.service
systemctl daemon-reload
systemctl enable --now whale-relay
ok "relay 已装（127.0.0.1:3000 → OneBot，票从 $TOKEN_FILE 读）"

say "== 4/6 生成新装配置（不覆盖任何已有文件）=="
node deploy/init.mjs "$SETTINGS"
ok "配置/角色模板/主人控制包已生成"

say "== 5/6 注册主人控制包到 DSH =="
node deploy/register-control.mjs "$DSH_HOME" "$PROFILE"
ok "whale-control 已挂到 $PROFILE"

say "== 6/6 离线回归（不连 QQ、不调模型）=="
node --test tests/broadcast-intent.test.cjs
python3 scripts/test_relay.py
python3 scripts/test_operations.py
SURFCORE_SOURCE="$SURFCORE_ROOT" node --test integrations/surfcore/tests/audit-resilience.test.mjs
node integrations/surfcore/tests/bridge-integration.test.mjs "$SURFCORE_ROOT"
ok "离线回归全绿"

cat <<'NEXT'

== 代码层完成，接下来是机器与账号层（脚本故意不做）==
1. 重启 DSH：systemctl restart dsh，然后打开 SurfCore 设置核对：QQ 后端 reserved2、主人/白名单正确、语音与桌宠关闭、自动更新关闭。
2. SnowLuma / OneBot 也就绪并登录同一个机器人 QQ（扫码由人来做；只保留一个 QQ 客户端）。
3. 把她本人的东西搬过来：bash deploy/state-transfer.sh export … 在旧机，import … 在新机（人设、聊天风格、重要关系、记忆与日记、表情收藏、账本）。这些是私密资料，不进 Git。
4. 用主人私信一条普通问候验收：核对实际回执、收件人、引用与发送次数；不要往真实群灌测试。
5. 想和现在这台一模一样，第 3 步必须是同一份私密包；只跑 Git 只能得到同一个「代码和骨架」，不会自动长出她的记忆。

明确不部署（历史遗留，Git 里只留档）：NapCat 容器与 ws 端口、旧 dsh-qq-bridge 平铺镜像、143 构建器、旧主动聊天 cron、archive/、live-backup/、simulator/、fundpilot 模拟盘。
NEXT
