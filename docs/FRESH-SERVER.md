# 换一台 Linux 服务器：一次部署到最新版（适配 216）

**结论先说：代码层已经可以照 Git 原样复现，不是"差不多"。** 2026-11-04 实测：从本仓库的 `integrations/surfcore/version.mjs` 取固定上游 `0deb8261…`（SurfCore 0.8.8），跑 `build.mjs` 打出覆盖层，得到 **566 个文件，与线上生产清单逐个 sha256 完全相同（0 处差异）**。所以换机不需要拷运行目录，只要这套流程。

**但"一模一样的鲸鱼娘"分三层，Git 只负责第一层：**

| 层 | 是什么 | 从哪来 | 进 Git 吗 |
|---|---|---|---|
| 代码层 | SurfCore 0.8.8 + 鲸戒适配 216（桥、运行时、兼容层、工具） | 本仓库，一条命令构建 | 是 |
| 配置层 | QQ 号、provider/model、OneBot 票、控制台端口 | 仓库外私密 `install.local.json` + 票文件，`init.mjs` 生成 | 否 |
| 状态层 | 她的人设、聊天风格、重要关系、记忆与日记、表情收藏、账本 | 旧机用 `state-transfer.sh` 打包搬过去 | **否，私密** |

只跑 Git，你会得到同一个骨架和同一套行为逻辑，但她不会是"同一个她"——记忆和人设得单独搬。

**216 起，`state-transfer.sh` 的私密包已包含：** `CHAT-STYLE.md`（三端统一说话方式）、`surfcore/config.json`（记忆通道与记忆卡设置）、`state/social-v2.json`（会话锚点与当前状态）、`state/qq-public-feed.jsonl`（QQ→B站 的公开消息源）、`state/slang.json`、角色目录下的记忆卡与 B站 简报。仍然不打包 QQ/OneBot 票、provider 凭据、审计密钥；这些按第 1 步在本机重填。

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

## 验收清单（按顺序，任一项不对就别急着上线）

1. `whale-overlay-manifest.json` 里 `patch=216`、`sums` 566 条；`init.mjs` 已核过哈希才继续。
2. `systemctl status whale-relay` 活着；`curl -s -XPOST 127.0.0.1:3000/get_login_info -d '{}'` 回 `retcode:0`。
3. SurfCore 设置：QQ 后端 `reserved2`、主人/白名单正确、语音与桌宠关闭、自动更新关闭。
4. 私信一句 → 她回了 → 查腾讯接口原记录（不是看日志自证）。
5. 群里她说一句普通话能落地；「带原话到群」等主人自然说一次才算验过。

## 明确不部署（历史遗留，Git 里只留档）

NapCat 容器与 ws 端口、旧 dsh-qq-bridge 平铺镜像、143 构建器、旧主动聊天 cron、`archive/`、`live-backup/`、`simulator/`、FundPilot 模拟盘。后三者已于 2026-11-04 从仓库树移出（提交 `3deeeb8` 之前的 Git 历史可查），不要拿它们安装或覆盖。

## /opt/qq-cs 里的旧助手脚本（默认都不部署）

生产机 `/opt/qq-cs` 除 relay 外还有一批 10 月 23–29 的旧脚本，Git 里没有或与线上不同：

- **Git 里没有**：`eventd.py`、`her_balance.py`、`her_pick_pic.py`、`her_send_pic.py`、`sanitize_live.py`——旧时代助手，cron 已经不跑，按"废弃不部署"处理。
- **与线上不同**：`poke.py`、`auto_memes.py`、`weekly_report.py` 是旧版本；`wsd.py` 线上那份把 OneBot WS 票直接写死在 `WS_URL` 里，Git 版是脱敏的 `ws://127.0.0.1:3001`。要复刻戳一戳转发，自己把票填进脱敏位置（票不进 Git）。
- **cron 实际只跑五个**：`live_backup.sh`、`memory_store.py`、`watchdog.sh`、`snowluma-guard.sh`、`version_check.sh`。`version_check.sh` 已补进 `scripts/`，但**默认不装**——先确认 `notify.conf` 里的 webhook 是你自己的。

所以"一模一样"的边界是清楚的：**她怎么说话、怎么记事、怎么发图、怎么换场，全在 536 个文件里；这堆旧脚本只影响备份、巡检、戳一戳这些外围动作。**

## 已知坑
- **`version.mjs` 的 `OVERLAY_PATCH` 必须等于线上实际补丁号**。2026-11-04 之前它停在 199，而代码已是 200；216 起已同步到 216。以后每次上补丁都要同步这一行。
- `build-upstream.sh` 会 `npm ci`，小内存机（2G 且已有服务）容易顶到 OOM。要么在空闲时段跑，要么先加 swap；**不要在生产机上边跑边重启 DSH**。
- 镜像 `/opt/whale-live` 的 origin 是 `ssh://git@ssh.github.com`，服务器上没有私钥会 `Permission denied`；公开仓库按 HTTPS 匿名取即可。
- 旧记忆导入用 `integrations/surfcore/import-memory.mjs`（只读快照，原文件保留）；不要拿别人的记忆顶替自己的。
