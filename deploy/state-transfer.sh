#!/bin/bash
# 把这台机器上「她本人」的私密状态打包带走 / 铺到新机，让新服务器长成同一个她。
# 只装人设、说话风格、记忆与行为设置；QQ/OneBot 票、审计密钥、provider 凭据不打包。
# 用法：
#   旧机： bash deploy/state-transfer.sh export /root/whale-state-20261104.tar.gz
#   新机： bash deploy/state-transfer.sh import /root/whale-state-20261104.tar.gz [--force]
set -euo pipefail

MODE=${1:?用法: state-transfer.sh export <out.tar.gz> | import <bundle.tar.gz> [--force]}
BUNDLE=${2:?缺少包路径}
FORCE=${3:-}
REPO=$(cd -- "$(dirname -- "$0")/.." && pwd)
DHS_HOME=${DSH_HOME:-/root/.dsh}
SURFCORE_ROOT=${SURFCORE_ROOT:-/opt/whale-surfcore/current-source}
WORKSPACE_HOME=${WORKSPACE_HOME:-/root/dsh-workspace}

die(){ printf '✗ %s\n' "$*" >&2; exit 1; }
ok(){ printf '✓ %s\n' "$*"; }

# 私密状态清单：人设/风格/关系、角色包、日记与记忆、表情库、会话锚点、行为设置。
ITEMS=(
  "dsh:surfcore/characters"
  "dsh:surfcore/memory"
  "dsh:surfcore/relationship-facts.json"
  "dsh:surfcore/config.json"
  "dsh:qq-bridge-config.json"
  "ws:CHAT-STYLE.md"
  "ws:OWNER-RULES.md"
  "ws:STICKER-INDEX.md"
  # 219：早期口径文档已改写，换机必须一起带走，否则新机会退回旧总纲/旧图闸。
  "ws:QQ-CAPABILITIES.md"
  "ws:AGENTS.md"
  "ws:SESSION-HANDOFF.md"
  "ws:QQ-PEOPLE.md"
  "ws:QQ-DUTY-LOG.md"
  "src:state/stickers.json"
  "src:state/sticker-recognition.json"
  "src:state/social-v2.json"
  "src:state/qq-public-feed.jsonl"
  "src:state/slang.json"
  "src:state/whale-language"
)
EXCLUDES=(--exclude='*.bak*' --exclude='*.before*' --exclude='archive' --exclude='snapshots' --exclude='*.log')

case "$MODE" in
export)
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/bundle"
  for item in "${ITEMS[@]}"; do
    scope=${item%%:*}; rel=${item#*:}
    case "$scope" in dsh) base=$DHS_HOME;; src) base=$SURFCORE_ROOT;; ws) base=$WORKSPACE_HOME;; esac
    [ -e "$base/$rel" ] || { printf '! 跳过不存在：%s\n' "$base/$rel" >&2; continue; }
    mkdir -p "$TMP/bundle/$scope/$(dirname "$rel")"
    cp -a "$base/$rel" "$TMP/bundle/$scope/$rel"
  done
  # 去掉备份/归档噪音，只留现值
  find "$TMP/bundle" \( -name '*.bak*' -o -name '*.before*' -o -name '*.log' \) -type f -delete
  rm -rf "$TMP"/bundle/dsh/surfcore/characters/*/archive "$TMP"/bundle/dsh/surfcore/characters/*/snapshots 2>/dev/null || true
  node -e '
    const fs=require("fs"),path=require("path"),crypto=require("crypto");
    const root=process.argv[1], out=[];
    (function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
      if(e.isDirectory())walk(p); else out.push({path:path.relative(root,p).replaceAll("\\","/"),sha256:crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),size:fs.statSync(p).size});}})(root);
    out.sort((a,b)=>a.path.localeCompare(b.path));
    fs.writeFileSync(path.join(root,"MANIFEST.json"),JSON.stringify({version:1,createdAt:new Date().toISOString(),files:out.length,entries:out},null,2));
    console.log(JSON.stringify({files:out.length,bytes:out.reduce((n,x)=>n+x.size,0)}));
  ' "$TMP/bundle"
  tar -czf "$BUNDLE" -C "$TMP/bundle" .
  chmod 600 "$BUNDLE"
  ok "已打包 $BUNDLE（600 权限；含人设/记忆/表情库，不含任何票与密钥）"
  printf '%s\n' "提醒：这是私密包，别进 Git、别放公开目录；传完就删。" >&2
  ;;
import)
  [ -f "$BUNDLE" ] || die "找不到 $BUNDLE"
  [ -d "$DHS_HOME" ] || die "DSH_HOME 不存在：$DHS_HOME"
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  tar -xzf "$BUNDLE" -C "$TMP"
  [ -f "$TMP/MANIFEST.json" ] || die "包里缺 MANIFEST.json，不是本脚本导出的包"
  node -e '
    const fs=require("fs"),path=require("path"),crypto=require("crypto");
    const root=process.argv[1],m=JSON.parse(fs.readFileSync(path.join(root,"MANIFEST.json"),"utf8"));
    let bad=0;for(const e of m.entries){const p=path.join(root,e.path);
      if(!fs.existsSync(p)){console.error("缺文件 "+e.path);bad++;continue;}
      const h=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      if(h!==e.sha256){console.error("校验失败 "+e.path);bad++;}}
    if(bad)process.exit(1);console.log("包校验通过：",m.files,"个文件");
  ' "$TMP" || die "包校验失败，拒绝导入"
  if [ "$FORCE" != "--force" ]; then
    while IFS= read -r f; do
      rel=${f#"$TMP"/}; rel=${rel#./}
      case "$rel" in dsh/*) target=$DHS_HOME/${rel#dsh/};; src/*) target=$SURFCORE_ROOT/${rel#src/};; ws/*) target=$WORKSPACE_HOME/${rel#ws/};; *) continue;; esac
      [ -e "$target" ] && die "目标已存在：$target（确认要覆盖就加 --force，旧文件会备份成 .bak-import-<时间>）"
    done < <(cd "$TMP" && find . -type f)
  fi
  STAMP=$(date +%Y%m%d%H%M%S)
  while IFS= read -r f; do
    rel=${f#"$TMP"/}; rel=${rel#./}
    case "$rel" in dsh/*) target=$DHS_HOME/${rel#dsh/};; src/*) target=$SURFCORE_ROOT/${rel#src/};; ws/*) target=$WORKSPACE_HOME/${rel#ws/};; *) continue;; esac
    mkdir -p "$(dirname "$target")"
    [ -e "$target" ] && cp -a "$target" "$target.bak-import-$STAMP"
    install -m 600 "$TMP/$rel" "$target"
    chown --reference="$(dirname "$target")" "$target" 2>/dev/null || true
  done < <(cd "$TMP" && find . -type f)
  chmod 700 "$DHS_HOME/surfcore/characters" 2>/dev/null || true
  ok "已铺入人设/记忆/表情库；重启 DSH 后生效"
  printf '%s\n' "提醒：导入的是私密状态，别把她的记忆推到 Git 或公开日志。" >&2
  ;;
*) die "未知模式：$MODE（只支持 export / import）";;
esac
