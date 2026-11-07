# 2026-11-07 故障复盘：内存耗尽叠加 DeepSeek 上游中断，导致「不回消息」

> 适用范围：适配 216 / SurfCore 0.8.8 / 2GB 单机的现行生产链路。
> 本文只写结论与证据定位。真实号码、凭据、服务器地址不进仓库；原始诊断输出在仓库外
> `.ops/*.result.json`（已脱敏），脚本清单见文末。
> 配套操作手册：[RECOVERY-RUNBOOK-2026-11-07.md](RECOVERY-RUNBOOK-2026-11-07.md)。

## 一句话结论

不是 QQ 掉线，不是鉴权失效，也不是「她摆烂」：**2GB 物理内存长期见底，DSH 被换出到 swap、卡在磁盘等待（D 状态），消息进了未读队列却建不起专用会话；同一天 DeepSeek 官方又发生 API 中断，两层叠加。** 安全护栏拒绝降级到 DSH 默认会话，所以宁可一条都不回。最终以「完整备份 + 停用可选服务 + 整机重启」恢复，全部改动与状态文件逐项比对无丢失。

## 1. 现象与告警

- 14:47 主人私聊收到 `【系统巡检】SurfCore连续两次未就绪，需要检查服务或鉴权…`。这是 `scripts/runtime_health.py --notify` 由看门狗每 30 分钟采样触发的**自动私信**，不是她说的话。13:17 / 13:47 全绿，14:17 / 14:47 连续两次 `dshReady:false` 触发告警；文案里「检查服务或鉴权」是通用模板，实际日志中**没有 401/403**，鉴权是好的。
- 14:57「杂鱼在吗」、15:05「？？？」两条**确实进了未读队列**（活动日志可查），但没有任何回复。
- 同类抖动当天从早上就有，13:44 起恶化，全天约 18 次「DSH 不可用 ↔ 已就绪」。216 语言包 13:46 上线只重载了 QQ 桥，时间上相邻但**不是原因**。

## 2. 时间线

| 时间 | 事件 |
|---|---|
| 13:44 起 | DSH 开始密集抖动；3080 连接堆积；消息开始入未读 |
| 14:17 / 14:47 | 两次 `dshReady:false` → 14:47 巡检私信告警 |
| 15:11 | DeepSeek 官方状态页记录「网页/API 部分中断」，影响 Chat / V4 Pro / V4.1 Flash API |
| 15:19 / 15:26 | 两次 `systemctl restart dsh`：清空 106 条堆积连接、swap 951→约 490MB，但 DSH 被换出、卡 D 状态，3080 迟迟不监听 |
| 15:32 | 3080 开始监听，但接受连接极慢 |
| 15:35:54 | 桥短暂 `dshReady:true` 并自动补唤醒 2 条未读，创建会话仍超时 |
| 15:58–15:59 | 再次就绪：会话挂载 `qq-chat-v2`、新会话创建成功（13:44 以来第一次），15:59:48 又变不可用 |
| 16:03 | 一次全绿采样，随后 16:04–16:05 连续三次又 `false`（**抖动，不是康复**） |
| 16:11–16:13 | 抖动窗口里抢到几次成功：私聊回复 + 表情 + 群回复，桥日志有 `status:sent` 硬证据；迟到回复被 flush，两条积压消息大概率已接上 |
| 16:16–16:17 | 连续三次 `dshReady:false`、`ok:false`、pending=4、3080 连接 161；用户报「又哑了」 |
| 16:21 | 内存账盘点：可安全停用的非核心服务只占约 65MB，救不了死局 |
| 16:25:30 | 完整备份 + 停用 4 个云厂商服务后触发整机重启 |
| 16:26:14 | 开机完成，SSH 约 30 秒恢复；可用内存 1228MB、swap 归零 |
| 16:26:50–16:32:45 | QQ 冷启动：runtime 起 → 登录态识别 → OneBot 3000/3001 监听 → 群成员预热 → 桥连上 |
| 16:33 起 | 三次采样全绿：`ok:true`、`qqOnline`/`wsConnected`/`dshReady` 全 true、delivery healthy/ready、pending=0 |

## 3. 双层根因

### 第一层：本机内存耗尽（先发问题）

2GB 物理内存长期只剩约 100–120MB 可用，swap 用到 0.5–1GB。内存账（`ps` + cgroup + 容器内核态）：

| 占用方 | 量级 | 能否裁掉 |
|---|---|---|
| 容器内 QQ 客户端（zygote + 主进程） | 约 760MB | 不能，砍了就没 QQ |
| SnowLuma runtime | 约 360MB | 不能，运行时本体 |
| 容器内 Xvfb / x11vnc / websockify | 约 91MB | 不建议，QQ 依赖 X display，扫码也要用 |
| 宿主机桥 `bridge.js` | 约 159MB | 不能，收发核心 |
| DSH | 常驻约 49MB，**另 382–428MB 被换出** | 不能 |
| 云厂商 agent / 调优守护 | 约 65MB | 可停用，但杯水车薪 |

`AnonPages` 恒 1.42GB，`swappiness` 本来就是 0。DSH 进程大量换页、卡在 D（不可中断磁盘等待），一次 `systemctl restart dsh` 的 stop 要 90 秒强杀，重启后要读盘约 6–10 分钟才绑上 3080，`sessionController` 迟迟不可用。**反复重启 DSH 只会更糟**，这是本次最贵的教训。

### 第二层：DeepSeek 上游中断（叠加问题）

官方状态页确认 15:11 起网页/API 部分中断，收口时仍为「已实施修复，监控中」，未宣告 Resolved。服务器侧对应证据：`[llm-deepseek-account] model listing https://api.deepseek.com/models timed out after 5000 ms; using the bundled catalog`，以及 13:56–15:47 连续 `fetch failed / aborted due to timeout`。

注意两点判据陷阱：
- `secrets.env` 里只有 `DASHSCOPE_API_KEY`，拿它请求 DeepSeek 得到 401 是**正常的**，不能当上游故障证据；
- `curl` 到 `api.deepseek.com` 0.2 秒返回只说明网络层通，不等于模型服务健康。判上游要看官方状态页 + DSH 日志里的模型列表/会话超时。

### 为什么「一条都不回」

消息入未读 → 桥为该来源创建专用会话 `qq-chat-v2` → `fetch failed / aborted due to timeout`。安全护栏明确**拒绝降级**到 DSH 默认 preset（那会把本地工具暴露给 QQ 通道），因此宁可沉默。补唤醒队列由桥自己维护，恢复后自动触发，不需要也不要手工重发旧消息。

### 已排除的误判

QQ 在线、WS connected、delivery healthy/ready、pending=0、wakeGuard 未 blocked、唤醒额度未锁、tokenGuard 上限 0、无 401/403、不是 216 语言包代码问题、不是「机器人自己停了」。

## 4. 处置与结果

1. **只读排查**：线上状态、桥日志、活动日志、DSH 负载、抖动分布、在途回合，全部走仓库外既有只读通道，未改配置、未发测试消息。
2. **完整保全**：`/root/whale-ops/backup-1107/` 存 `state.tgz`（state 目录 + config.json）、`tracked-changes.patch` + `untracked.tgz`（生产目录 **581 个改动/新增文件**的完整可还原快照）、`patch216.tgz`、`git-status.txt` / `diffstat.txt`，均带 sha256。
3. **无损内存优化 → 无效**：`sync + drop_caches` 后可用内存 122→120MB，纹丝不动。刻意**没有**调 `swappiness`：内存见底时降低它反而会阻止匿名页换出、诱发 OOM kill。
4. **重启安全审查**：开机自启只有 `dsh` / `whale-relay` / `whale-ws`（ExecStart 直接启动，无 `git reset` / 重新部署）；`/etc/cron.d/whale-surfcore-compatible-update` 每天 9:10 只做只读兼容性检查且非 `@reboot`；crontab 无重装项；`rc.local` 只有一行 `touch`。桥虽无 systemd 托管（PPID=1），但由 DSH surfcore 插件 `maybeAutoStartBridge()` 加载即执行 + 每 120 秒兜底拉起。QQ 登录态在 Docker 具名卷 `snowluma-config`，容器 `unless-stopped`。**结论：整机重启不会覆盖那 581 个改动，也不需要扫码。**
5. **砍功能 → 只砍能砍的**：`systemctl disable --now` 停用 `aliyun` / `cloudmonitor` / `ecs_mq` / `tuned` 四个与机器人无关的服务（可逆，不删文件、不改业务代码）；`aegis` 有自我保护拒绝停用、保持原样。原始状态与一键恢复命令写在 `backup-1107/disabled-services.json`。
6. **整机重启 + 逐项复核**：重启后 581 改动数量一致、git 状态 sha 一致、HEAD 不变、config.json sha 一致、4 个备份包校验值不变、state 文件全在。可用内存 118MB→371MB 稳定，swap 784MB→255MB；DSH 从 D 状态变为正常 S 状态，3080 连接 161→4。
7. **QQ 冷启动约 6 分钟属正常**：期间 3000 一直 502、WS 1006、relay 返回 `onebot_temporarily_unavailable`，看着像坏了，实际是 QQ 客户端/NapCat 尚未就绪；关机日志里的 `OneBot shutdown failed: AggregateError` 不影响恢复。**当时没有贸然重做登录或重启容器。**

## 5. 遗留与建议

- **2GB 是硬瓶颈，建议升配到 4GB 治本。** 本次恢复的实质收益来自整机重启清空 swap，过段时间仍可能复发。
- 复发时**不要反复重启 DSH**（stop 需 90 秒强杀、冷启动要读盘数分钟且治标不治本），直接走 [恢复手册](RECOVERY-RUNBOOK-2026-11-07.md) 的决策流程。
- 先看官方状态页再判断「消息进队列但回不出来」，区分本地与上游，避免把上游事故当成自己服务坏了。
- DeepSeek 事故在本次收口时尚未宣告 Resolved，属外部依赖，需持续观察。
- 如需恢复被停用的云厂商服务，使用 `disabled-services.json` 里的 `restoreCommand`。

## 6. 证据位置（均在仓库外，不进 Git）

| 类别 | 文件 |
|---|---|
| 状态 / 桥日志 / 抖动 / 负载 | `.ops/diag1107-{a..y}.py` 及同名 `.result.json` |
| 两次 DSH 重启 | `.ops/recover1107.py`、`recover1107-b.py` |
| 备份与重启前审查 | `.ops/backup1107.py`、`precheck1107.py` |
| 无损内存优化 | `.ops/optimize1107.py` |
| 重启与恢复验证 | `.ops/reboot1107.py`、`ping1107.py`、`ping1107-b.py`、`verify1107.py`、`final1107.py` |
| 完整过程记录 | `.workbuddy/memory/2026-11-07.md`（工作区记忆，非仓库） |

所有结果 JSON 已统一脱敏（`token=`、会话令牌、API key 形式串），仓库内不保留任何原文。
