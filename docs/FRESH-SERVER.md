# 换一台 Linux 服务器：一次部署到最新版（适配 226）

**结论先说：代码层已经可以照 Git 原样复现，不是"差不多"。** 2026-11-04 实测：从本仓库的 `integrations/surfcore/version.mjs` 取固定上游 `0deb8261…`（SurfCore 0.8.8），跑 `build.mjs` 打出覆盖层，得到 **571 个文件（221 新增 `whale-compat/owner-at-receipt.mjs`，222 再新增 `whale-compat/comment-banter.mjs` 与 `plugins/surfcore/lib/owner-share.mjs`，223 再新增 `whale-compat/comment-banter-distill.mjs` 与 `whale-compat/comment-banter.json`），与线上生产清单逐个 sha256 完全相同（0 处差异）**。所以换机不需要拷运行目录，只要这套流程。

**但"一模一样的鲸鱼娘"分三层，Git 只负责第一层：**

| 层 | 是什么 | 从哪来 | 进 Git 吗 |
|---|---|---|---|
| 代码层 | SurfCore 0.8.8 + 鲸戒适配 226（桥、运行时、兼容层、工具） | 本仓库，一条命令构建 | 是 |
| 配置层 | QQ 号、provider/model、OneBot 票、控制台端口 | 仓库外私密 `install.local.json` + 票文件，`init.mjs` 生成 | 否 |
| 状态层 | 她的人设、聊天风格、重要关系、记忆与日记、表情收藏、账本 | 旧机用 `state-transfer.sh` 打包搬过去 | **否，私密** |

只跑 Git，你会得到同一个骨架和同一套行为逻辑，但她不会是"同一个她"——记忆和人设得单独搬。

**219 起，`state-transfer.sh` 的私密包已包含：** `CHAT-STYLE.md`（三端统一说话方式）、`OWNER-RULES.md`（主人永久规则的可覆盖文本，缺失时回落代码常量）、`STICKER-INDEX.md`（352 张 QQ 收藏表情按情绪/画面/编号的速查）、`QQ-CAPABILITIES.md`（219 重写后的能力说明）、`AGENTS.md`（口径指针，不再是总纲）、`SESSION-HANDOFF.md`、`QQ-PEOPLE.md`、`QQ-DUTY-LOG.md`、`surfcore/config.json`（记忆通道与记忆卡设置，`persona.file` 已指向角色卡）、`state/social-v2.json`（会话锚点与当前状态）、`state/qq-public-feed.jsonl`（QQ→B站 的公开消息源）、`state/slang.json`、`state/whale-language/`（语言样本，219 已清掉鱼八股原句）、角色目录下的记忆卡、目的观察与 B站 简报。**219 新增的这几份工作区文件必须一起带走**：漏了 `QQ-CAPABILITIES.md` / `AGENTS.md`，新机会退回旧图闸和 10-27 旧总纲。**219c 起再补两份（主人令：「Git 上有的不用打包，包里留重要的」）**：`dsh:surfcore/bili.config.json`（B站偏好、owner/self 称呼、动态开关、配额、通知，运行时每轮重读即刻生效）和 `dsh:qq-chat-control.json`（群聊忽略名单，按真实账号生效）。Git 里只有**读它们的代码**，没有文件本身，`bootstrap.sh` 也不生成，所以不带就会回默认，私信/群聊/B站对不上现在。

**220 起包内状态文件已换成新口径**：`OWNER-RULES.md` 含第七节「不编过程」与第八节「提了视频就给得出去」，`CHAT-STYLE.md` / `persona.md` / `QQ-CAPABILITIES.md` 追加 220 段，21:05–21:09 那批编造句已从 `social-v2.json`、语言样本、全量卡源流水、待归档队列、当天 journal 和六份记忆卡一起清掉。220 **没有新增清单项**（改动文件都在既有整目录 / `src:state/*` 里），但**必须重打包**——219c 的 89 文件包里仍是旧规则和坏样本。

**224 起包内又换了口径**：`OWNER-RULES.md` 第五节补上主人 11-06 私信教过的日语空耳例子（ciallo～、压力马斯内、狗修金撒嘛）与「别端着、别每句都塞」的分寸，6 份工作区/角色文档追加 224 段。例子同时写进了 Git 代码层 `OWNER_RULES_CORE`，但**磁盘上的 `OWNER-RULES.md` 仍由常量逐字生成，必须一起带走**——文件存在时会覆盖代码常量，只带 Git 不带包，新机上读到的还是旧规则文本。224 没有新增清单项，仍须重打包。

**223 起包内又换了口径**：`OWNER-RULES.md` 第九节补上真实语料依据（「这不是我编的套话」），6 份工作区/角色文档追加 223 段；评论区玩法改由她自己攒的 504 条真实 B站 热评/楼中楼按 216 贴吧口径蒸馏，策略包与蒸馏器在 Git 代码层，不进包。**特别要确认包里有 `src/state/whale-language/corpus.json` 和 `active-pack.json`**：这是她自学习的私有语料，永不进 Git，但换机必须带走，丢了就得从零攒。223 没有新增清单项，仍然必须重打包。

**222 起包内又换了口径**：`OWNER-RULES.md` 新增第九节「评论区不是解说席」，6 份工作区/角色文档追加 222 段；今晚的编造句（「也去评论区@了他」等）和那条解说腔评论已从会进入上下文的记忆、语言样本、B站 记忆里清掉。222 **没有新增清单项**：两个新模块都在 Git 代码层，`owner-at-receipt.json` 是运行时产物；`notify.type` 仍为 `none`。仍然必须重打包，221 的包里还留着解说腔范本。

**221 起包内又换了口径**：`OWNER-RULES.md` 第八节升级为「私信里主动提视频，同一轮就真去评论区 @ 主人，不用等他开口叫」；`CHAT-STYLE.md` / `persona.md` / `QQ-CAPABILITIES.md` / `SESSION-HANDOFF.md` / `AGENTS.md` 追加 221 段。221 **没有新增清单项**：新增的 `~/.dsh/surfcore/owner-at-receipt.json` 是运行时产物（第一次成功 @ 后自动生成），不是初始状态，不需要带；`bili.config.json` 的 `notify.type` 保持 `none` 未改。仍然必须重打包，220 的包里还是「等主人开口叫才去 @」的旧规则。

仍然不打包 QQ/OneBot 票、provider 凭据、审计密钥、B站 `bili/credentials.json` 与 `owner-credentials.json`（这些按第 1 步在本机重填）；也不带 token 预算、主动搭话历史、消息去重记录、会话瞬态状态、日志与 `.bak`、341MB 旧本地图库（只被 219 已作废的旧发图脚本引用）、`/opt/qq-cs` 外围 cron。它们要么 Git 已有，要么重建后自然产生，要么属于凭据/运维噪音。

> **导出前先设 `SURFCORE_ROOT` 指向实际运行源目录**：老机是 `/opt/whale-surfcore/staging-c174ed0`，不是脚本默认的 `current-source`。不设的话脚本会「跳过不存在」并**静默漏掉** `src:state/*` 五个文件（会话锚点、QQ→B站公开流水、表情库、表情识别、俚语），包会从 71 个文件缩成 66 个。完整命令：
> `SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 bash deploy/state-transfer.sh export /root/whale-state-219.tar.gz`

> **迁移包必须是 219b 之后重新导出的**：`memory-card-full.jsonl`（971 条全量记忆，运行源码标注为「唯一真相、只追加」）和 `memory-inbox.jsonl` 随整目录 `dsh:surfcore/characters` 一起带走。219 首次部署只改了渲染产物 `memory-card-full.md`，19:17 一次记忆维护重渲染就把废弃旧句全部生回全量卡；219b 已把两条源流水按同一套 219 规则改干净，并用运行时的 `renderFullMemoryCard` 重渲染验证。拿 219b 之前的旧包，新机第一次维护就会复活旧口径（详见 `docs/PATCH219-LEGACY-CLEANUP-2026-11-07.md` 第八节）。

## 前提（下列由人准备，脚本故意不碰）

- Ubuntu 22.04+/Debian 12，root，systemd，Node 24+，Python 3.6+，git/npm/curl。
- **DSH 已装好并能启动**，配置好可用的 provider/model 与凭据，且已有目标 profile（下面假定 `web`）。
- **SnowLuma / OneBot 已装好并登录同一个机器人 QQ**，HTTP 3002、WS 3003 只监听本机。只保留一个 QQ 客户端。**2026-11-10 起上游分发已下架：匿名 `docker pull motricseven7/snowluma:latest` 返回 401，新机只能从旧机导出的镜像存档 `docker load` 装——见下方「SnowLuma 容器」一节。**
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

## SnowLuma 容器（2026-11-10 起：下架后只能离线装）

上游镜像已经下架/私有化，匿名拉取实测 `401 UNAUTHORIZED`，`docker pull motricseven7/snowluma:latest` 在新机上**必然失败**。能用的只有旧机导出的镜像存档：

| 项 | 值 |
|---|---|
| 旧机路径 | `/root/whale-ops/snowluma-archive-2026-11-10/snowluma-image-2.1.1.tar` |
| 大小 / SHA-256 | `1,906,885,632 B` / `bcdc3127c7a9f01b83d3af03111d6f0df99df204ebd7f244f7721bc08ecb3e97` |
| 镜像 | `motricseven7/snowluma:latest`，image id `sha256:40290fa6…6860`，`@snowluma/runtime` **2.1.1** |
| 同目录 | `snowluma-runtime-2.1.1.tar.gz`（23 MB 运行件）、`docker-run.redacted.json`（脱敏运行参数）、`manifest.json` |

```bash
# 1) 校验后加载（不是 pull）
cd /root/whale-ops/snowluma-archive-<日期>
sha256sum -c <(echo "bcdc3127c7a9f01b83d3af03111d6f0df99df204ebd7f244f7721bc08ecb3e97  snowluma-image-2.1.1.tar")
docker load -i snowluma-image-2.1.1.tar

# 2) 建卷（名字必须和旧机一致，才能直接恢复登录态）
docker volume create snowluma-data && docker volume create snowluma-config && docker volume create snowluma-clientdata

# 3) 按旧机参数起容器（端口映射/权限一个都别改）
docker run -d --name snowluma --restart unless-stopped \
  --shm-size=1g --cap-add SYS_PTRACE --security-opt seccomp=unconfined \
  -p 3002:3000 -p 3003:3001 -p 5099:5099 -p 6081:6081 \
  -v snowluma-data:/app/data -v snowluma-config:/app/.config -v snowluma-clientdata:/app/.local/share \
  -e TZ=Asia/Shanghai -e SNOWLUMA_WEBUI_PORT=5099 -e SNOWLUMA_ONEBOT_HOST=0.0.0.0 \
  motricseven7/snowluma:latest
```

- **登录态在三个卷里**（`snowluma-data` 1.1 G、`snowluma-config` 664 M）：卷能一起带过来就不用重新扫码；卷丢了只能开 noVNC（6081）扫码，没有 CLI 登录路径。
- **铁律不变：容器起好之后永远不 `docker restart`**——整容器重启会掉票、要人工重扫；掉线只做容器内进程级 `supervisorctl restart qq`（`scripts/snowluma-guard.sh` 每两分钟自动做这件事）。
- **镜像存档不进 Git**（1.9 GB，且不是源码）；`@snowluma/runtime` 是 private + EULA 的自包含分发，**没有上游源码可编译**，只有 `index.mjs`（9.4 MB，打包但可读）+ `native/` + `client/`。
- 验收：`curl -s -XPOST 127.0.0.1:3002/get_login_info -d '{}' -H 'content-type: application/json'` → `retcode:0`；`get_group_msg_history` 能读到真实记录才算链路通。


## 226 迁移包（旧机已导出 · 2026-11-09 · 226）

| 项 | 值 |
|---|---|
| 旧机路径 | `/root/whale-ops/migrate-2026-11-09-226/whale-state-20261109-226.tar.gz` |
| 大小 / SHA-256 | `4,268,433 B`（约 4.07 MiB） / `f27d7bd8d8ee974d6b3c673cf86e26deb85772c27561989a40da866b67a3fab4` |
| 权限 / 校验 | `600`；同目录 `SHA256SUMS` 已写入；包内 92 文件 + MANIFEST 逐文件哈希 `bad=0`，导入演练通过 |
| 对应 Git | 226 代码、测试与文档提交 `abee6e5`；镜像 `/opt/whale-live` 已 ff-only 同步到同一 HEAD，`dirty=0` |

这是 **226 定稿包**：在 225 全部口径之上，新增 `src/state/emotion-relations.json`（持续情绪与按 QQ 号分桶的关系事件，600 权限）。`deploy/state-transfer.sh` 白名单已加入这一项，**换机不带就会「刚被骂完就失忆」**；情绪模块 `whale-compat/emotion-state.mjs` 属代码层，在 Git，不进包。225b 漏清的运行时主卡 `memory-card.json` 里那句「已经钉进小本本了，每次醒来都在」已在 226b 连主卡一起清掉，桥重载后复查无复活；包内假事实扫描为 0、主人训话原文保留。`notify.type=none`；**含** `src/state/whale-language/corpus.json`（504 条真实评论原文）与 `active-pack.json` 等自学习文件（私密状态，绝不进 Git）。**225 包作废**：拿它换机会丢掉 `emotion-relations.json`，且主卡里的保证书套话会跟着回来。包里不含策略包与蒸馏器（在 Git）、不含 `owner-at-receipt.json`（运行时产物）。

导出命令（重打时照抄，`SURFCORE_ROOT` 不能省）：

```bash
SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 \
  bash /opt/whale-live/deploy/state-transfer.sh export \
  /root/whale-ops/migrate-2026-11-09-226/whale-state-20261109-226.tar.gz
```

新机把包与 `SHA256SUMS` 放同一目录后 `sha256sum -c SHA256SUMS`，再按验收清单查各代废弃句与新口径。**包是私密状态，不进 Git、别放公开目录，传完就删。**

## 223 迁移包（旧机已导出 · 2026-11-08 · 223，已作废）

| 项 | 值 |
|---|---|
| 旧机路径 | `/root/whale-ops/migrate-2026-11-08-223/whale-state-20261108-223.tar.gz` |
| 权限 / 大小 | `600` / 4,241,695 字节 |
| 内含文件 | 90 个（`MANIFEST.json` 逐个文件 sha256；tar 条目 91） |
| SHA-256 | `67ffba18a7a58a388be72d7ee3646f5de3ca39b4ee6136255b12f930a134c260` |
| 同目录产物 | `SHA256SUMS` |
| 对应 Git | `1652bbf`（223 代码与策略包）+ 文档提交，镜像 `/opt/whale-live` 已 ff-only 同步 |

这是 **223 定稿包**：`OWNER-RULES.md` 第九节含真实语料依据，6 份工作区/角色文档都带 223 段；`notify.type=none`；**不含**解说腔范本与编造句；**含** `src/state/whale-language/corpus.json`（504 条真实评论原文）与 `active-pack.json v652177a9594e738c` 等 11 个自学习文件——这是私密状态层，绝不进 Git，但换机必须带走。**222 的 90 文件包（sha256 `c47d8e9a…`）作废**：拿它换机，新服务器上她学过的语料还是旧的，评论区玩法也没有真实分布可依。包里不含蒸馏器与策略包（在 Git）、不含 `owner-at-receipt.json`（运行时产物）。

导出命令（重打时照抄，`SURFCORE_ROOT` 不能省）：

```bash
SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 \
  bash /opt/whale-live/deploy/state-transfer.sh export \
  /root/whale-ops/migrate-2026-11-08-223/whale-state-20261108-223.tar.gz
```

新机把包与 `SHA256SUMS` 放同一目录后 `sha256sum -c SHA256SUMS`，再按验收清单第 6–10 条查各代废弃句与新口径。只读导入演练 `ok:true`：90 个文件哈希全对、223/222/221 口径都在、无票与 B站凭据、无运行时回执、无新模块、无 341MB 旧图库。**包是私密状态，不进 Git、别放公开目录，传完就删。** 重新导出会改变 gzip 时间戳与 sha256，以 `SHA256SUMS` 当时那份为准。

## 验收清单（按顺序，任一项不对就别急着上线）

1. `whale-overlay-manifest.json` 里 `patch=224`、`sums` 571 条（含 `whale-compat/owner-at-receipt.mjs`、`whale-compat/comment-banter.mjs`、`whale-compat/comment-banter-distill.mjs`、`whale-compat/comment-banter.json`、`plugins/surfcore/lib/owner-share.mjs`）；`init.mjs` 已核过哈希才继续。
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
7. **220 自检**（换机导入后以及每次记忆维护后，预期值见括号）：
   ```bash
   MEM=/root/.dsh/surfcore/characters/v16-2026-10-27/memory
   grep -cE '我这就去那条评论区|等下看看@有没有变成蓝的|我搞砸啦|那条评论根本没发出去|又没成，评论区那关|白让你跑去翻' "$MEM/memory-card-full.jsonl"   # 0
   grep -c  '七、说到做到，不编过程' /root/dsh-workspace/OWNER-RULES.md                                                  # >=1
   ```
   不为 0 就是拿到了 220 之前的包：那批 21:05–21:09 的编造句会在下一次维护里回流成说话模板。详见 `docs/PATCH220-CROSS-SCENE-2026-11-08.md`。
8. **221 自检**（换机导入后，预期值见括号）：
   ```bash
   grep -c '不用等他开口叫' /root/dsh-workspace/OWNER-RULES.md               # >=1
   grep -c '主动分享（2026-11-08 · 221）' /root/dsh-workspace/CHAT-STYLE.md  # >=1
   node -e "console.log(JSON.parse(require('fs').readFileSync('/root/.dsh/surfcore/bili.config.json')).notify.type)"   # none
   ```
   再在私信里让她看一个视频（**不要说「去 @ 我」**），B站 那条视频评论区应出现一条 @ 主人的分享评论，而 QQ 这端不播报、不追问结果。详见 `docs/PATCH221-PROACTIVE-SHARE-2026-11-08.md`。
9. **222 自检**（换机导入后，预期值见括号）：
   ```bash
   grep -c '九、评论区不是解说席' /root/dsh-workspace/OWNER-RULES.md                 # >=1
   grep -c '222（2026-11-08 · 主人令）' /root/dsh-workspace/CHAT-STYLE.md            # >=1
   grep -cE '也去评论区@了他|不糊弄你，是真喊不上|乐子比数据还密' /root/dsh-workspace/CHAT-STYLE.md   # 0
   node -e "const m=require('/opt/whale-surfcore/staging-c174ed0/whale-compat/comment-banter.mjs');" 2>/dev/null || true
   ```
   再在私信里让她看**两条不同类型**的视频：B站 评论区应出现两条 @ 主人的分享评论，正文是私信那种带梗的白话（不报数据、不复述、不金句收尾），且两条的梗不一样；QQ 这端不播报、不追问结果。详见 `docs/PATCH222-PROACTIVE-SHARE-2026-11-08.md`。
10. **223 自检**（换机导入后，预期值见括号）：
   ```bash
   grep -c '这不是我编的套话' /root/dsh-workspace/OWNER-RULES.md                 # >=1
   grep -c '223（2026-11-08 · 主人令）' /root/dsh-workspace/CHAT-STYLE.md          # >=1
   tar -tzf whale-state-20261108-223.tar.gz | grep 'whale-language/corpus.json'   # 有
   node -e "const p=require('/opt/whale-surfcore/staging-c174ed0/whale-compat/comment-banter.json'); console.log(p.version,p.source.retained)"  # vd926fb3d895f3e9e 504
   ```
   `comment-banter.json` 里只有聚合统计，用 `assertNoRawText(pack, corpus)` 逐条比对过 504 条原文，一句都没漏进去。详见 `docs/PATCH223-REAL-CORPUS-BANTER-2026-11-08.md`。
11. **224 自检**（换机导入后，预期值见括号）：
   ```bash
   grep -c 'ciallo～' /root/dsh-workspace/OWNER-RULES.md                        # >=1
   grep -c '狗修金撒嘛' /root/dsh-workspace/OWNER-RULES.md                     # >=1
   grep -c '简单回答' /root/dsh-workspace/OWNER-RULES.md                       # >=1
   node -e "import('/opt/whale-surfcore/staging-c174ed0/whale-compat/expression-style.mjs').then(m=>console.log(m.OWNER_RULES_CORE.includes('ciallo～')))"   # true
   ```
   `OWNER-RULES.md` 与代码常量必须逐字一致（文件存在时优先于常量），否则例子等于没下沉。详见 `docs/PATCH224-JAPANESE-PHONETIC-BASELINE-2026-11-09.md`。
12. **225 自检**（换机导入后，预期值见括号）：
   ```bash
   grep -c '没人点名就不凑' /root/dsh-workspace/OWNER-RULES.md                    # >=1
   grep -c '不许有下次' /root/dsh-workspace/OWNER-RULES.md                       # >=1
   grep -c '十、' /root/dsh-workspace/OWNER-RULES.md                             # 0（没新增第十节）
   grep -c '每小时60条上限' /opt/whale-surfcore/staging-c174ed0/state/social-v2.json  # 0（假锚点已清）
   node -e "import('/opt/whale-surfcore/staging-c174ed0/whale-compat/internal-state.mjs').then(m=>console.log(m.stripInternalState('被限流了。接着聊').text))"  # 接着聊
   ```
   225 把 11-09 私信教训写进代码常量而非记忆卡，并把 `CHAT-STYLE.md` 与二代预设里的开发说明段删掉；换机后这两处应当明显变短。详见 `docs/PATCH225-PRIVATE-LESSONS-BASELINE-2026-11-09.md`。
13. **226 自检**（换机导入后，预期值见括号）：
   ```bash
   stat -c '%a' /opt/whale-surfcore/staging-c174ed0/state/emotion-relations.json     # 600
   grep -c 'src:state/emotion-relations.json' /opt/whale-live/deploy/state-transfer.sh  # 1
   grep -c '已经钉进小本本了' /root/.dsh/surfcore/characters/v16-2026-10-27/memory/memory-card.json  # 0
   node -e "import('/opt/whale-surfcore/staging-c174ed0/whale-compat/emotion-state.mjs').then(m=>console.log(typeof m.createEmotionStore))"  # function
   ```
   226 的持续情绪与关系事件是**状态层**，代码模块在 Git。换机后 `emotion-relations.json` 必须在、权限 600，否则她会刚被骂完就失忆、也不会主动和好。详见 `docs/PATCH226-EMOTION-RELATION-REPAIR-2026-11-09.md`。

## 明确不部署（历史遗留，Git 里只留档）

NapCat 容器与 ws 端口、旧 dsh-qq-bridge 平铺镜像、143 构建器、旧主动聊天 cron、`archive/`、`live-backup/`、`simulator/`、FundPilot 模拟盘。后三者已于 2026-11-04 从仓库树移出（提交 `3deeeb8` 之前的 Git 历史可查），不要拿它们安装或覆盖。

## /opt/qq-cs 里的旧助手脚本（默认都不部署）

生产机 `/opt/qq-cs` 除 relay 外还有一批 10 月 23–29 的旧脚本，Git 里没有或与线上不同：

- **Git 里没有**：`eventd.py`、`her_balance.py`、`her_pick_pic.py`、`her_send_pic.py`、`sanitize_live.py`——旧时代助手，cron 已经不跑，按"废弃不部署"处理。
- **与线上不同**：`poke.py`、`auto_memes.py`、`weekly_report.py` 是旧版本；`wsd.py` 线上那份把 OneBot WS 票直接写死在 `WS_URL` 里，Git 版是脱敏的 `ws://127.0.0.1:3001`。要复刻戳一戳转发，自己把票填进脱敏位置（票不进 Git）。
- **cron 实际只跑五个**：`live_backup.sh`、`memory_store.py`、`watchdog.sh`、`snowluma-guard.sh`、`version_check.sh`。`version_check.sh` 已补进 `scripts/`，但**默认不装**——先确认 `notify.conf` 里的 webhook 是你自己的。

所以"一模一样"的边界是清楚的：**她怎么说话、怎么记事、怎么发图、怎么换场，全在 566 个文件里；这堆旧脚本只影响备份、巡检、戳一戳这些外围动作。**

## 已知坑
- **`version.mjs` 的 `OVERLAY_PATCH` 必须等于线上实际补丁号**。2026-11-04 之前它停在 199，而代码已是 200；220 起已同步到 220。以后每次上补丁都要同步这一行。
- `build-upstream.sh` 会 `npm ci`，小内存机（2G 且已有服务）容易顶到 OOM。要么在空闲时段跑，要么先加 swap；**不要在生产机上边跑边重启 DSH**。
- 镜像 `/opt/whale-live` 的 origin 是 `ssh://git@ssh.github.com`，服务器上没有私钥会 `Permission denied`；公开仓库按 HTTPS 匿名取即可。
- 旧记忆导入用 `integrations/surfcore/import-memory.mjs`（只读快照，原文件保留）；不要拿别人的记忆顶替自己的。
- **`memory-card-full.md` 只是渲染产物，别只改它**：它由 `memory-card-full.jsonl` 经 `renderFullMemoryCard()` 生成，同一目录的 `memory-inbox.jsonl` 是待归档队列。只清理渲染出来的 `.md`，下一次记忆维护（生产上每半点一次）会把源流水里的旧句原样生回来。219b 的教训，见验收清单第 6 条。
