# 226 · 持续情绪状态、关系事件与主动求和（2026-11-09）

## 一、先说审计结论：改造前并没有「感情系统」

按代码逐项核对，不靠提示词自称：

| 项 | 实际情况 |
|---|---|
| **A 已实现且接入运行** | `state/social-v2.json` 按**会话 key** 保存最近消息、未读、anchor、`closure.summary / nextOpening`；`relationshipBlock()` 注入主人确认的静态身份事实；记忆卡 `memory-card-full.jsonl` 每轮注入；`buildWakePromptV2()` 每轮拼人格/风格块；`scheduleProactiveCheckV2()` 用 30~90 分钟随机定时器 + `Math.random()` 决定发不发「主动机会」；`sendRateLimitInfo()` / `noteSendFailure()` / `wakeSuspendedUntil` 管发送与唤醒风控 |
| **B 只有提示词、没有代码支撑** | `EXPRESSION_CORE`／`OWNER_RULES_CORE`／二代 preset 里「开心雀跃、委屈软下来、被严厉说就先伤心想哭」「情绪直接用短句落地」；`CHAT-STYLE.md` 里「情绪跟着对话变化」。全部靠模型每轮读一遍文字自觉，**没有状态** |
| **C 有代码但没接入主链路** | `plugins/surfcore/lib/pet-chat.js` 的 `lastEmotionText`（全库只有读取、无写入，桌宠入口）；`plugins/surfcore/lib/scheduler.js` 的「矛盾自愈」文字（其实是 B站 feedback 漏记的自愈提示，不是关系修复）；`src/memory-card.js` 的 `kind='conflict'`（单条记忆文本的分类标签，不是按人追踪的争执状态）；表情库／记忆卡的 `emotion` 字段是**贴纸和记忆的属性**，不是鲸戒自己的心情 |
| **D 完全未实现** | 跨消息持续的自身情绪、情绪的磁盘持久化与衰减；按用户维度记录的争执／亲近度／是否需要关系修复／最近求和时间／对方是否接受；事件驱动的主动发言候选；未解决争执对随机调侃的抑制 |

**结论**：改造前情绪 100% 是提示词文字，定时器一醒就重新随机扮演一种情绪；关系只有静态身份事实；主动发言纯随机时间 + 抛硬币，没有候选、没有排序、没有优先级。所以「刚被骂完过一会儿像没发生」「不记得不愉快」「不会主动和好」都是结构性缺失，不是模型发挥不稳定。

## 二、新增与修改的模块

| 文件 | 改动 |
|---|---|
| `integrations/surfcore/compat/emotion-state.mjs` | **新增**。全部状态逻辑：9 类情绪、多信号交互分类、指数衰减、按 QQ 号分桶的关系事件、求和判定与方向提示、注入块生成、持久化 |
| `integrations/surfcore/live-mirror/src/bridge.js` | **8 处锚点改动**：顶层导入、模块级状态仓库、入站消息观察、每轮注入情绪块、`reconcile` 唤醒分支、`autoWake` 纳入求和、既有主动机会定时器里插入求和候选与随机抑制 |
| `integrations/surfcore/version.mjs` | `OVERLAY_PATCH` 225 → 226 |
| `deploy/state-transfer.sh` | 迁移白名单新增 `src:state/emotion-relations.json`，换机不带就会「刚被骂完就失忆」 |
| `integrations/surfcore/tests/emotion-state.test.mjs` | **新增** 12 项轻量回归 |
| `tests/bridge-integration.test.mjs` | VM harness 注入 `createEmotionStore` 绑定（沙箱会剥掉顶层 import） |
| `tests/owner-lessons225.test.mjs` | 版本断言改为 `>= 225`，不再把 patch 钉死在 225 |

**没有新建定时器、没有新建发送通道、没有改 `saveSocialV2State()` 白名单、没有动任何凭据或通知配置。**

## 三、情绪状态：存储与衰减

- 状态文件：`state/emotion-relations.json`（权限 600），结构 `{version, savedAt, relations: {<QQ号>: {...}}}`。独立文件是刻意的：不碰 `social-v2.json` 那套带多进程指纹保护的写回白名单。
- **按 QQ 号分桶**，一个用户一份 `{closeness, interactions, emotion, event, history, silenceUntil, recentNegative}`。情绪是「她面对这个人时的心情」，A 的争执绝不会算到 B 头上。
- 9 类情绪：`开心 / 平静 / 委屈 / 生气 / 难过 / 害羞 / 想亲近 / 犹豫 / 想和好`。**不是随机标签**，只由 `observe()` 的真实事件更新：认真批评→委屈或生气、安慰→负面缓解、夸奖→开心、玩笑/吐槽→不产生负面事件。
- 衰减用绝对时间戳现算：`intensity * 0.5 ^ ((now - since) / halfLife)`。半衰期分档（开心 18min、委屈 45min、生气 35min、难过 60min、想和好 90min…），低于 0.08 归为平静。**定时器触发、轮询、换会话都不清空情绪**；模块里没有任何 `clear/reset`，重启只是重新读同一个文件继续算。
- 事件默认 6 小时过期，配合衰减保证不会永久陷在负面情绪里。

## 四、关系事件：记录与清除

每个桶的 `event` 记满要求的字段：`at / lastAt / kind / severity / blame / summary / key / isGroup / needsRepair / userReconciled / reconcileCount / reconcileSentAt / acceptedAt / expiresAt / displayName`。

- **记录**：`handleIncomingWhale` 拿到 `userId / key / 群或私聊 / 原文 / 自己最近几条发言` 后调用 `observe()`。分类是多信号打分，不靠脏话关键词：玩笑与亲昵称呼减权，「认真／说真的／又／说了多少遍／第 N 次／别再」等元信号加权，连续多轮负面才升级成争执；区分玩笑、吐槽、认真批评、争执、恶意攻击、缓和、夸奖、静默要求。
- **清除**：
  - 用户道歉／主动缓和／开玩笑／连续 3 次正常互动 → `userReconciled=true`、`needsRepair=false`、`acceptedAt=now`，情绪按 0.45 系数缓解而不是一键清零；
  - 过期（6h）或已和好超过 30 分钟 → `gc()` 把事件移进限量 `history` 并从 `event` 移除；
  - 每次争执 `reconcileCount` 上限 1，`noteReconcileSent()` 幂等。

## 五、主动求和：触发逻辑

`reconcileCandidate()` 综合判断，缺一不可：真实未解决争执（严重度 ≥ 0.42，玩笑/吐槽不算）、双方够熟（亲近度 ≥ 0.35 或主人）、用户**没有**先递台阶、每次争执只一次、没被要求安静、非夜间、当前会话不忙、没刚聊过、收尾冷却中不动、**只在事件发生的那个 key**、**群聊一律不公开处理私怨**。

时间窗刻意不固定：`8 + 6×(1−严重度) + 6×随机 + 2×(1−亲近度)` 分钟浮动，上界取 3 小时与事件剩余有效期的较小值。所以不是「每次都等十分钟」。

求和不给台词库。`reconcilePrompt()` 只给方向 + 事件原因 + 关系 + 情绪，按四种情况分寸：确实说错话→自己承认；熟人拌嘴→带点嘴硬但意思是和好；受不公平责骂→有自尊、轻轻提一句自己也不开心；对方已递台阶→顺着翻篇。统一边界：只说一句、日常口气、不摆保证书、不反复道歉、不装可怜、不制造愧疚、不催回复、没回就当翻篇不补发。

## 六、与自主发言调度器的集成

**不新建竞争调度器**，只在 `scheduleProactiveCheckV2()` 现有的 30~90 分钟回调函数里插入一段：

1. 用户指令与静默：`socialV2.paused` / `whale.quiet(key)` / `closureSuppressesWake` 之外，还要过 `silenceUntil`；
2. 风控与频率：求和走 `sendWakePromptV2(key, 'reconcile', …)`，`'reconcile'` 已加入 `autoWake`，共用 `wakeSuspendedUntil`、通道闸门、唤醒限频；真正发送时和被动回复共用同一套 `sendRateLimitInfo()`；
3. 当前上下文：会话忙、刚有来信、刚发过言都不触发；
4. 未解决的重要关系事件：命中就 `noteReconcileSent()` → 发一次 `reconcile`，本轮**不再发**普通 `proactiveCheck`；
5. 普通随机发言：有未解决争执时概率乘 `0.15`（不是 0），已和好乘 `0.75`，事件过期自动回到 `1`。**不无限期阻塞正常聊天**。

情绪对正常聊天的影响通过 `promptBlock()` 的一小段文字落地，而且**平静且无未解决事件时返回空串**——不往每轮注入里加常驻条例，不把 225 做下来的减法堆回去。有情绪时才给短约束：被认真责骂后先软下来、话短一点、先别叫「杂鱼」这类挑衅称呼、少玩梗、别翻旧账；随衰减自然淡去，挑衅称呼也随关系缓和逐步恢复。

## 七、验收

`node --test integrations/surfcore/tests/emotion-state.test.mjs` 12 项全绿，覆盖任务要求的 8 个场景：

1. 认真批评后十分钟仍有情绪，挑衅称呼被压住；
2. 玩笑式骂不造争执事件、不过度求和；
3. 确实说错话时求和方向是承认，且不含固定台词；
4. 用户已原谅后不再求和、提示明确别再道歉；
5. 求和发出后无回应不补发，每次争执最多一次；
6. 多用户按 QQ 号分桶不串线，群聊也不会张冠李戴；
7. 重启后未过期事件仍有效，过期后自然清除；
8. 普通自主发言被重要事件压制但不过期阻塞。

另有分类区分、衰减单调不清空、静默/时机/熟悉度/时间窗/场景边界逐项拦截、以及 `bridge.js` 挂接的静态断言。

**生产实测**（完整运行源、带参）：

| 项 | 结果 |
|---|---|
| 运行源 | `revision=226`、manifest 573 文件磁盘/已加载哈希全对、`drift=0`；桥单进程、三服务 active、`pendingIncoming=0` |
| 全套回归 | 12 个测试文件共 **112 项 pass + `bridge-integration PASS_ALL 47`，合计 159 项，0 失败**（含新增 `emotion-state` 12 项；220～225 全部未回归） |
| 生产烟测 | 平静时情绪块为空串；认真批评后重启实例读到「委屈」+ 未解决事件；提示块含「先别叫『杂鱼』」；求和判定 `allowed=true, style=admit`；无关用户的块为空 |
| 注入 | QQ 4941 / B站 4937 字，与 225 完全一致 —— 情绪块只在非平静时注入，没有把减法堆回去 |
| 状态 | `state/emotion-relations.json` 权限 `600`、结构合法；226c 修掉「原子写回丢失权限」后启桥复查仍为 600 |
| 遗留清理 | 225b 漏清的运行时主卡 `memory-card.json` 里保证书套话已连主卡一起清掉，启桥 8 秒后复查无复活；状态层假事实扫描 0、主人训话原文保留 |

## 八、换机与边界

- 代码层全在 Git；`state/emotion-relations.json` 属私密状态层，已加进 `state-transfer.sh` 白名单，随定稿迁移包带走。
- **226 定稿包**：`/root/whale-ops/migrate-2026-11-09-226/whale-state-20261109-226.tar.gz` — 4,268,433 B（约 4.07 MiB）、权限 600、92 文件 + MANIFEST、SHA-256 `f27d7bd8d8ee974d6b3c673cf86e26deb85772c27561989a40da866b67a3fab4`，同目录 `SHA256SUMS`。逐文件哈希 `bad=0`、导入演练通过、导入后情绪状态文件权限 600、包内假事实 0、主人训话原文保留；代码模块不进包。**225 包作废**。
- Git：`dedc128`（226 主体）→ `abee6e5`（226c 权限修复），`/opt/whale-live` 已 ff-only 同步到 `abee6e5`、`dirty=0`。
- 新机仍需配置、凭据与同一 QQ 登录；凭据不带。
- 本轮**未发消息、未调模型、未做真实 B站 外发**；未重启整机或其它线上服务、未改 `notify.type`（仍为 `none`）。桥共重载 **3 次**，均为必要：226 运行源代码生效 1 次、226b 清理主卡渲染回流 1 次、226c 让新的 `save()` 权限修复生效 1 次。

## 九、未完成事项与风险

- 交互分类是本地规则 + 多信号打分，**不是 LLM 语义理解**：反讽、极短的「哦」、纯表情包、大段阴阳怪气仍可能误判。设计上偏向「宁可不求和、不可乱求和」，误判的代价是少一次和好，不是骚扰。
- 分类只对**有文本**的消息生效；纯图片/表情不参与事件观察。
- 群聊争执按「不公开处理私怨」一律不主动求和，只通过情绪块让正常聊天自然软化；如果主人希望群里也主动和好，需要另定口径。
- 状态文件是单文件原子写，依赖生产只有一个桥进程（终检会核对）；若将来跑多实例，需要加文件锁。
- 情绪与关系事件是**模拟状态**，不是真实情感；活体效果（语气是否自然、会不会显得卑微）仍需主人实聊验收，本轮没有做 LLM 群聊模拟。
- 亲近度从 0.3 起、按互动次数缓慢增长，新认识的人短期内不会触发主动求和；这是有意的安全阈值，不是漏判。
