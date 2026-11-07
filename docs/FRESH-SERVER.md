# 换一台 Linux 服务器：一次部署到最新版（适配 219）

**结论先说：代码层已经可以照 Git 原样复现，不是"差不多"。** 2026-11-04 实测：从本仓库的 `integrations/surfcore/version.mjs` 取固定上游 `0deb8261…`（SurfCore 0.8.8），跑 `build.mjs` 打出覆盖层，得到 **566 个文件，与线上生产清单逐个 sha256 完全相同（0 处差异）**。所以换机不需要拷运行目录，只要这套流程。

**但"一模一样的鲸鱼娘"分三层，Git 只负责第一层：**

| 层 | 是什么 | 从哪来 | 进 Git 吗 |
|---|---|---|---|
| 代码层 | SurfCore 0.8.8 + 鲸戒适配 219（桥、运行时、兼容层、工具） | 本仓库，一条命令构建 | 是 |
| 配置层 | QQ 号、provider/model、OneBot 票、控制台端口 | 仓库外私密 `install.local.json` + 票文件，`init.mjs` 生成 | 否 |
| 状态层 | 她的人设、聊天风格、重要关系、记忆与日记、表情收藏、账本 | 旧机用 `state-transfer.sh` 打包搬过去 | **否，私密** |

只跑 Git，你会得到同一个骨架和同一套行为逻辑，但她不会是"同一个她"——记忆和人设得单独搬。

**219 起，`state-transfer.sh` 的私密包已包含：** `CHAT-STYLE.md`（三端统一说话方式）、`OWNER-RULES.md`（主人永久规则的可覆盖文本，缺失时回落代码常量）、`STICKER-INDEX.md`（352 张 QQ 收藏表情按情绪/画面/编号的速查）、`QQ-CAPABILITIES.md`（219 重写后的能力说明）、`AGENTS.md`（口径指针，不再是总纲）、`SESSION-HANDOFF.md`、`QQ-PEOPLE.md`、`QQ-DUTY-LOG.md`、`surfcore/config.json`（记忆通道与记忆卡设置，`persona.file` 已指向角色卡）、`state/social-v2.json`（会话锚点与当前状态）、`state/qq-public-feed.jsonl`（QQ→B站 的公开消息源）、`state/slang.json`、`state/whale-language/`（语言样本，219 已清掉鱼八股原句）、角色目录下的记忆卡、目的观察与 B站 简报。**219 新增的这几份工作区文件必须一起带走**：漏了 `QQ-CAPABILITIES.md` / `AGENTS.md`，新机会退回旧图闸和 10-27 旧总纲。**219c 起再补两份（主人令：「Git 上有的不用打包，包里留重要的」）**：`dsh:surfcore/bili.config.json`（B站偏好、owner/self 称呼、动态开关、配额、通知，运行时每轮重读即刻生效）和 `dsh:qq-chat-control.json`（群聊忽略名单，按真实账号生效）。Git 里只有**读它们的代码**，没有文件本身，`bootstrap.sh` 也不生成，所以不带就会回默认，私信/群聊/B站对不上现在。

仍然不打包 QQ/OneBot 票、provider 凭据、审计密钥、B站 `bili/credentials.json` 与 `owner-credentials.json`（这些按第 1 步在本机重填）；也不带 token 预算、主动搭话历史、消息去重记录、会话瞬态状态、日志与 `.bak`、341MB 旧本地图库（只被 219 已作废的旧发图脚本引用）、`/opt/qq-cs` 外围 cron。它们要么 Git 已有，要么重建后自然产生，要么属于凭据/运维噪音。

> **导出前先设 `SURFCORE_ROOT` 指向实际运行源目录**：老机是 `/opt/whale-surfcore/staging-c174ed0`，不是脚本默认的 `current-source`。不设的话脚本会「跳过不存在」并**静默漏掉** `src:state/*` 五个文件（会话锚点、QQ→B站公开流水、表情库、表情识别、俚语），包会从 71 个文件缩成 66 个。完整命令：
> `SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 bash deploy/state-transfer.sh export /root/whale-state-219.tar.gz`

> **迁移包必须是 219b 之后重新导出的**：`memory-card-full.jsonl`（971 条全量记忆，运行源码标注为「唯一真相、只追加」）和 `memory-inbox.jsonl` 随整目录 `dsh:surfcore/characters` 一起带走。219 首次部署只改了渲染产物 `memory-card-full.md`，19:17 一次记忆维护重渲染就把废弃旧句全部生回全量卡；219b 已把两条源流水按同一套 219 规则改干净，并用运行时的 `renderFullMemoryCard` 重渲染验证。拿 219b 之前的旧包，新机第一次维护就会复活旧口径（详见 `docs/PATCH219-LEGACY-CLEANUP-2026-11-07.md` 第八节）。

## 前提（下列由人准备，脚本故意不碰）

- Ubuntu 22.04+/Debian 12，root，systemd，Node 24+，Python 3.6+，git/npm/curl。
- **DSH 已装好并能启动**，配置好可用的 provider/model 与凭据，且已有目标 profile（下面假定 `web`）。
- **SnowLuma / OneBot 已装好并登录同一个机器人 QQ**，HTTP 3002、WS 3003 只监听本机。只保留一个 QQ 客户端。
- 一个主人 QQ、一个机器人 QQ、一个目标群；要踢人/禁言，机器人得真有群管权限——别拿真人试踢。

## 四步部署

```bash
# 0) 拉仓库（只取最新 main）
git clone https://github.com/jiuhuweisi-maker/qq-whale-girl-diary.git whale-girl && cd whale-girl

# 1) 写私密设置（仓库外，600）
install -d -m 700 /root/whale-ops
cp deploy/settings.example.json /root/whale-ops/install.local.json
chmod 600 /root/whale-ops/install.local.json
#    填：ownerQQ / botQQ / groupQQ / provider / model / 实际端口
#    OneBot 票放 /opt/qq-cs/.onebot-http-token（600），别写进命令行历史

# 2) 先干跑，确认前提齐全、目标目录没被占
bash deploy/bootstrap.sh /root/whale-ops/install.local.json --check

# 3) 真跑：构建固定上游 → 装 relay → 生成配置 → 注册控制包 → 离线回归
bash deploy/bootstrap.sh /root/whale-ops/install.local.json

# 4) 她本人搬过来（旧机打包、新机铺开）
#    旧机：bash deploy/state-transfer.sh export /root/whale-state.tar.gz
#    新机：bash deploy/state-transfer.sh import /root/whale-state.tar.gz
```

然后 `systemctl restart dsh`，用主人私信一句普通问候验收：核对实际回执、收件人、引用和发送次数。**不要往真实群灌测试消息。**

## 219 迁移包（旧机已导出 · 2026-11-07 · 219b）

| 项 | 值 |
|---|---|
| 旧机路径 | `/root/whale-ops/migrate-2026-11-07-219/whale-state-20261107-219.tar.gz` |
| 权限 / 大小 | `600` / 4,179,304 字节 |
| 内含文件 | 87 个（`MANIFEST.json` 逐个文件 sha256） |
| SHA-256 | `7cd8de412ec7f97e60691b1310702993fae0622b0a15c087537d16ce06eeaf80` |
| 同目录产物 | `SHA256SUMS`、`result.json`（只读导入演练结果） |
| 对应 Git | `816780b`（219b），镜像 `/opt/whale-live` 已 ff-only 同步 |

导出命令（重打时照抄，`SURFCORE_ROOT` 不能省）：

```bash
SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 \
  bash /opt/whale-live/deploy/state-transfer.sh export \
  /root/whale-ops/migrate-2026-11-07-219/whale-state-20261107-219.tar.gz
```

新机把包与 `SHA256SUMS` 放同一目录后 `sha256sum -c SHA256SUMS`，再按验收清单第 6 条查源流水。只读导入演练已验证：87 个文件哈希全对、219 新句齐备、废弃旧句 0、无票与凭据文件。**包是私密状态，不进 Git、别放公开目录，传完就删。** 重新导出会改变 gzip 时间戳与 sha256，以 `SHA256SUMS` 当时那份为准。

## 验收清单（按顺序，任一项不对就别急着上线）

1. `whale-overlay-manifest.json` 里 `patch=219`、`sums` 566 条；`init.mjs` 已核过哈希才继续。
2. `systemctl status whale-relay` 活着；`curl -s -XPOST 127.0.0.1:3000/get_login_info -d '{}'` 回 `retcode:0`。
3. SurfCore 设置：QQ 后端 `reserved2`、主人/白名单正确、语音与桌宠关闭、自动更新关闭。
4. 私信一句 → 她回了 → 查腾讯接口原记录（不是看日志自证）。
5. 群里她说一句普通话能落地；「带原话到群」等主人自然说一次才算验过。
6. **219b 源流水自检**（换机导入后、以及每次记忆维护后都能跑，预期值见括号）：
   ```bash
   MEM=/root/.dsh/surfcore/characters/v16-2026-10-27/memory
   grep -cE '三端都叫他|群里仍按|这些表情包你全都看过了|只叫一声杂扣|私聊专属称呼' "$MEM/memory-card-full.jsonl"   # 0
   grep -cE '三端都叫他|群里仍按|这些表情包你全都看过了|只叫一声杂扣|私聊专属称呼' "$MEM/memory-card-full.md"      # 0
   grep -c  '称呼按场景' "$MEM/memory-card-full.md"                                                              # >=1
   ```
   任一不对，说明导入的是 219b 之前的旧包，或全量卡又被旧源流水重渲染了；先按第八节修源，别只把 `.md` 盖回去。

## 明确不部署（历史遗留，Git 里只留档）

NapCat 容器与 ws 端口、旧 dsh-qq-bridge 平铺镜像、143 构建器、旧主动聊天 cron、`archive/`、`live-backup/`、`simulator/`、FundPilot 模拟盘。后三者已于 2026-11-04 从仓库树移出（提交 `3deeeb8` 之前的 Git 历史可查），不要拿它们安装或覆盖。

## /opt/qq-cs 里的旧助手脚本（默认都不部署）

生产机 `/opt/qq-cs` 除 relay 外还有一批 10 月 23–29 的旧脚本，Git 里没有或与线上不同：

- **Git 里没有**：`eventd.py`、`her_balance.py`、`her_pick_pic.py`、`her_send_pic.py`、`sanitize_live.py`——旧时代助手，cron 已经不跑，按"废弃不部署"处理。
- **与线上不同**：`poke.py`、`auto_memes.py`、`weekly_report.py` 是旧版本；`wsd.py` 线上那份把 OneBot WS 票直接写死在 `WS_URL` 里，Git 版是脱敏的 `ws://127.0.0.1:3001`。要复刻戳一戳转发，自己把票填进脱敏位置（票不进 Git）。
- **cron 实际只跑五个**：`live_backup.sh`、`memory_store.py`、`watchdog.sh`、`snowluma-guard.sh`、`version_check.sh`。`version_check.sh` 已补进 `scripts/`，但**默认不装**——先确认 `notify.conf` 里的 webhook 是你自己的。

所以"一模一样"的边界是清楚的：**她怎么说话、怎么记事、怎么发图、怎么换场，全在 566 个文件里；这堆旧脚本只影响备份、巡检、戳一戳这些外围动作。**

## 已知坑
- **`version.mjs` 的 `OVERLAY_PATCH` 必须等于线上实际补丁号**。2026-11-04 之前它停在 199，而代码已是 200；219 起已同步到 219。以后每次上补丁都要同步这一行。
- `build-upstream.sh` 会 `npm ci`，小内存机（2G 且已有服务）容易顶到 OOM。要么在空闲时段跑，要么先加 swap；**不要在生产机上边跑边重启 DSH**。
- 镜像 `/opt/whale-live` 的 origin 是 `ssh://git@ssh.github.com`，服务器上没有私钥会 `Permission denied`；公开仓库按 HTTPS 匿名取即可。
- 旧记忆导入用 `integrations/surfcore/import-memory.mjs`（只读快照，原文件保留）；不要拿别人的记忆顶替自己的。
- **`memory-card-full.md` 只是渲染产物，别只改它**：它由 `memory-card-full.jsonl` 经 `renderFullMemoryCard()` 生成，同一目录的 `memory-inbox.jsonl` 是待归档队列。只清理渲染出来的 `.md`，下一次记忆维护（生产上每半点一次）会把源流水里的旧句原样生回来。219b 的教训，见验收清单第 6 条。
