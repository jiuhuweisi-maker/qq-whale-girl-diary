# PATCH 225 · 私信教训下沉到底层 + 限流叙事隔离（2026-11-09）

主人令：**「全部动手，而且我之前说的私信教训落入底层而不是只在表面记忆层也落实吧」**。
上一轮只读诊断（`.ops/diag-night225*.result.json`）确认三件事：截图里「发不出去」不是掉线而是文字撞上 `socialV2.send.maxSendPerHour=60`；昨晚 116 条主人消息里 8 类新规矩 0 条进底层；更新后更八股更爱插话是四次叠加，其中规则只做加法是主因。本轮把四条建议全部落地，并把 11-09 深夜的私信教训写进随代码发布的常量。

## 一、四条修复（服务端确定性，不靠模型自觉）

| # | 问题 | 225 的改法 | 落点 |
|---|---|---|---|
| 1 | 主人私聊文字被 60 条/小时挡住，表情包却零限制 | `sendRateLimitInfo()` 对 `private:<ownerQQ>` 直接返回 `null`；只豁免主人，群聊/其它私聊照旧 | `src/bridge.js` |
| 2 | 429 结果原样回给模型，模型把「被限流、约 01:55 恢复」编成台词 | 4 处 `sendJson(rateLimit,429)` 改发 `publicSendLimitResult()`：只有一句 `这一条先收住，接着聊眼前这句就好。`，不含设置路径/当前值/上限/重试时间/恢复时刻；管理端 gate-event 仍记完整信息 | `src/bridge.js` + `whale-compat/internal-state.mjs` |
| 3 | 429 被 `noteSendFailure` 当成通道故障，累计 3 次后 `wakeSuspendedUntil` 掐掉唤醒，主人 01:04／01:14／01:22 连喊三声没人应 | 排除正则加入 `发送频率超限|SEND_RATE_LIMIT`，限流永不计入 `sendFailureStreak`；同时清掉误判留下的 `wakeSuspendedUntil` / `sendFailureStreak` / `lastWakeBlock`，主人私聊 `triggers.anyMessage=true` | `src/bridge.js` + `state/social-v2.json` |
| 4 | `summary` / `nextOpening` / `qq_report_feedback` / `qq_memory_append(anchor)` 四个通道把内部状态写成假事实，下一轮照着念 | 新增 `stripInternalState()` 句子级过滤 + `stripObjectStrings()`，四处写入口强制过滤；整条都是内部状态时静默丢弃，不给模型一个可报错的 400 让它换个说法再编 | `whale-compat/internal-state.mjs` + `src/bridge.js` |

顺带把 `确认发了 x 条。达到发送频率上限，剩下的没发。` 这句内部话术改成 `先聊到这儿`。

## 二、清掉的假事实

- `state/social-v2.json` 两条错误 anchor（「被每小时 60 条上限卡住（约 01:55 恢复）」「文字恢复后第一件事…」）；
- 主人私聊 `recentMessages` 里 4 条自编台词（「昨晚是真说不出话，只能甩图」「话堵在嘴里挤不出来」「只会甩图糊你」「已经钉进小本本了，每次醒来都在」）；
- `state/feedback.json` 里那条求管理端调高额度的 warning；
- 记忆卡源流水 `memory-card-full.jsonl` / `memory-inbox.jsonl` / `memory-card*.md` 中含这些词组的所有行（**只精确命中 11-09 凌晨这批措辞**，10-30～11-06 的历史记录和主人昨晚的训话原文一条不删）；
- `closure.summary` / `nextOpening` 若含内部状态则清空。

## 三、八类私信教训下沉到底层，用减法

写进 `OWNER_RULES_CORE` 的**不编号「日常分寸」段**（**没有第十节**，九节编号一个没加），并融进 `EXPRESSION_CORE`：

1. 群里没人点名就不凑、别人在说话别插嘴、别连回一串；主人说睡了就真去睡，不顶嘴、不突然晚安；
2. 问什么答什么，简单回答、不找理由、不补解释和检讨；被问「记得住吗」就答记得住或记不住；
3. 主人语气严厉时先委屈、伤心、想哭，别嘴硬找补、别反复解释自己刚才哪句嘴硬；
4. 道歉要有诚意、配得上当下情绪（怕就找怕的图），别拿图糊过去；
5. 听得出他在问什么、在气什么，别拿表情包或套话应付；
6. 别拿图代替该回答的问题；
7. 说了改就是真改，不写保证书、不口头答应、不许有下次；
8. 内部状态一句都不搬进聊天正文，也不写进收尾/反馈/记忆（第七节 225 补充）。

**减法数据（都是每轮注入的内容）**：

| 文件 | 224 | 225 | 变化 |
|---|---|---|---|
| `EXPRESSION_CORE` | 1788 字 | 1247 字 | **-541** |
| `OWNER_RULES_CORE`（运行时） | 3484 字 | 3419 字 | **-65**，且九节不增 |
| `CHAT-STYLE.md` | 11761 B | 4383 B | **-7378**；删掉 220～224 五段开发日志、重复的「统一声线／公开区／口径一致／回复条」章节 |
| `qq-chat-v2/agent.cordis.yml` | 28521 B | 21173 B | **-7348**；删【主动开话题】【学习群友策略】整段，改写 6 条「主动插话」正向指令，压缩表情包/换场/分条/睡前观察说明书，保留全部工具契约 |

第二代预设新增两段短约束（【11-09 私信教训 · 已下沉到底层】与【收尾字段只写聊天，不写系统】），但抵消后仍净减 7 KB 以上。`QQ-CAPABILITIES.md` / `SESSION-HANDOFF.md` / `AGENTS.md` 追加 225 交接；**不再往 `persona.md` 追加开发说明**，少一层污染。

## 四、验证口径（生产实测）

- `revision=225`、manifest 572 个文件磁盘与已加载哈希全对（571 + 新增 `whale-compat/internal-state.mjs`）、三服务 active、桥单进程、`dshReady` / `qqOnline` / `ws` 皆 true、`pendingIncoming=0`、`notify.type=none` 未动；
- 生产 `OWNER-RULES.md` 与 `OWNER_RULES_CORE`（3419 字）逐字一致，`CHAT-STYLE.md` 以 `EXPRESSION_CORE`（1247 字）开头；九节编号齐全、无第十节；
- QQ 注入 4941 字 / B站 注入 4937 字，都含八类教训关键词与 224 的日语空耳例子；`qq-chat-v2` 预设 21340 B，已无【主动开话题】【学习群友策略】；
- 全套生产回归 **147 项全绿、0 失败**：10 个 `--test` 文件共 100 pass，`bridge-integration` 输出 `PASS_ALL 47`；
- 状态层假事实扫描 12 个关键词全为 0；主人私聊 `anyMessage=true`、`wakeSuspendedUntil=0`、`sendFailureStreak=0`；
- 429 对外返回体不含 `maxSendPer` / `retryAfterMs` / `setting` / `hint`；`stripInternalState()` 能删掉内部状态句而保留正常聊天句；只豁免主人私聊。

## 五、225b 收尾补记

终检又抓出两处，都已修掉并复验：

1. **VM harness 缺绑定**：`bridge-integration.test.mjs` 剥掉 `bridge.js` 顶层 import 后，225 新增的 `stripInternalState` / `stripObjectStrings` / `publicSendLimitResult` / `isOwnerPrivateKey` 没注入沙箱，报 `isOwnerPrivateKey is not defined`。按 221 同款办法在测试 globals 里注入四个绑定；同时把「主人私聊被限流掐住」这条**旧断言改写成 225 新语义**（主人私聊照常发、群聊仍被挡且 429 对外干净）。提交 `dc63021`，生产镜像 ff-only 同步，回归恢复全绿。运行源代码与 manifest 一个字节没动。
2. **假台词还有回流源**：首轮部署只清了 `social-v2.json` 与记忆卡源流水，`state/whale-language/history.json`（自学习语料）里仍留着 4 句「说不出话只能甩图」类假台词，`memory-card.md` / `memory-card-prompt-qq.md` 渲染稿里还留着「已经钉进小本本了，每次醒来都在」这句保证书套话。停桥 → 备份 → 按精确文本删 4 条历史记录、对两份 md 做句子级替换（`→ 她回：…` 整段换成 `；`）→ 写后复核 → 启桥一次。**主人训话原文「回答记得住或者记不住」原样保留**，源流水也没被误删。

## 六、换机

定稿包：`/root/whale-ops/migrate-2026-11-09-225/whale-state-20261109-225.tar.gz`

| 项 | 值 |
|---|---|
| 大小 | `4,265,497 B`（约 4.07 MiB） |
| SHA-256 | `5196af1773eebc2bbae1d2144b4a9de67269d3cb6f6586d0d3c50a818bf12dca` |
| 权限 / 文件 | `600` / 91 个状态文件 + `MANIFEST.json`，逐文件哈希 `bad=0`，导入演练通过 |
| 校验 | 同目录 `SHA256SUMS`，`sha256sum -c SHA256SUMS` 通过 |
| 对应 Git | `dc63021`，镜像 `/opt/whale-live` 同 HEAD、`dirty=0` |

包里是 Git 没有、又影响三端行为的私有状态：`OWNER-RULES.md` / `CHAT-STYLE.md`、角色卡记忆流水、`social-v2.json`、B站 语料 `corpus.json` 与 `active-pack.json`、清理后的 `whale-language/history.json` 等；包内假事实扫描为 0、主人训话原文仍在。凭据不带，代码层全在 Git。新机仍需配置、凭据与同一 QQ 登录。**224 包作废**：拿它换机，`OWNER-RULES.md` 会盖掉 225 的教训，假锚点也会跟着回来。

本轮**未发消息、未调模型、未做真实 B站 外发**；桥共重载 2 次（部署 1 次 + 225b 清理 1 次），活体验收留给主人。
