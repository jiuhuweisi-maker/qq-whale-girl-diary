# 222 · 分享是行为，评论区是串子场（2026-11-08）

## 触发

主人按 221 的说法做了一次活体验收：在私信里让她「去看一个视频，然后分享给我」。她只发了一句感想 + 一条链接，B站 那边没有 @ 他。主人随后发来 B站 评论截图，评论写的是：

> 京介 44 杀 1.90 rating 已经够离谱了，标题还塞了个 m0NESY 一穿二；这场的乐子比数据还密

主人连着三条把要求收口：「就不能不要鱼八股吗，像私信一样的口吻，然后学点评论区当串子的方法在评论区玩梗吗」「你来教她怎么在b站评论玩梗吧，就在不同视频下面玩梗，@我的时候分享的时候也一样」「这些全部完成」。

## 只读诊断（不打印凭据、不看群聊正文）

| 证据 | 结论 |
|---|---|
| `state/tool-calls.jsonl` 23:10:23 `qq_send_message`：`["翻到一条够抽象的，CS2 小孩京介轮番噬父，笑死🤣","https://www.bilibili.com/video/BV1wDxQ6nEbx/"]` | 她确实在私信里分享了视频 |
| 23:10:29 `qq_switch_scene` args：`{"target":"bili","intent":"speak","video":"BV1wDxQ6nEbx"}`，result `ok:true` | **漏了 `atOwner`**，换场成功但落的是普通 speak |
| 23:10:33 `qq_close_conversation` summary「…也去评论区@了他」 | 没做的事被记成做过，会回流进记忆 |
| `bili/quota.json` 23:11:05 `share:false`、`ta:false`、note 是那条解说评论 | B站 按普通 speak 去视频底下发了条 `share:false` 评论，@ 的是路人/没 @ 人 |
| `context-telemetry` 23:10:35 `agentPreset=qq-chat-v2`，`modelCalls=5 toolCalls=5` | preset 生效、221 规则都在，模型这一轮就是没带那个布尔值 |
| 生产 `OWNER-RULES.md` / `TOOL-GUIDE.md` / MCP 描述 / 二代预设均含 221 新口径 | 不是没部署，是**软规则不可靠** |

根因三条：① 主人私信里「带视频去 B站 开口」被当成普通 speak，全靠模型自觉传 `atOwner`；② 即使便条带了 `atOwner`，B站 侧仍把它交给模型读提示自由发挥；③ 评论区文案生成从来没被「按私信标准」覆盖，旧口径里只有「评论区像群聊」，没禁掉报数据、复述、金句收尾。

## 改动

### A. 分享改成服务端确定性行为（不再赌模型）

- `src/bridge.js` → `switchScene()`：主人私信 + `target=bili` + `intent=speak` + 合法 BV **一律** `ownerAt=true`（`const ownerAt = atOwner === true || ownerShare`）。显式传 `atOwner` 仍受来源/参数校验，群聊与 B站 侧带不动这个标记。
- `src/bridge.js` → `/api/socialV2/send-message` 成功分支：**第二重兜底**，她在主人私信发出含 BV 的消息（且该 BV 不是主人刚发来的）时自动登记便条，模型完全不调换场工具也照样落地。
- 新增 `registerOwnerShare()`：便条带 `atOwner:true` 以及她在 QQ 说的那句白话（`reason` / `message`）；`state/owner-share-offer.json` 做 30 分钟去重，便条已被领走就不重复发。
- `whale-compat/scene-switch.mjs` → `claimBiliSceneOffer()` 透传 `reason` / `message`，仍只认真布尔 `atOwner`。
- 新增 `plugins/surfcore/lib/owner-share.mjs`：`scheduler.enterBiliScene()` 领到 `atOwner` 便条后**直接跑** BV→aid → `comment --share --auto --owner-ok --reason … --message … --dry` → `--go`，不再给 B站 模型发这个 offer 的 prompt（避免它又发一条普通评论）。`comment.mjs` 成功时自己写 `owner-at-receipt.json`，失败静默停手，不重试、不播报。
- `notify.type` 维持 `none`；`--owner-ok` 继续跳过报备。回执仍是「悄悄记着、被问起才说」。

### B. 评论区不是解说席：教方法 + 窄闸

- 新增 `compat/comment-banter.mjs`：`COMMENT_BANTER_CORE`（9 条禁令 + 串子玩法 + 分视频类型换梗）、`BANTER_MOVES` **12 招**（游戏/CS、鬼畜抽象、二创混剪、番剧、生活 vlog、萌宠、科技数码、音乐、影视、热评区、有人抬杠、@ 主人分享），每招含「怎么接 / 示范分寸」；`banterStrategy(seed)` 每轮按小时与角色目录轮换注入一条；`looksLikeRecap()` 只识别课代表腔。
- `OWNER_RULES_CORE` 新增**第九节「评论区不是解说席」**，三端每轮注入：别报数据、别复述视频、别金句收尾、别写推荐语、别解释自己的梗；先看清楼上在玩什么梗、抓一个词往歪里接；可反串、谐音黑话、跟楼句式、自嘲、抛没头没尾的问句、欠一句就跑；10–25 字说完就停；没梗可接就不发；**不同视频换不同梗**；在 QQ 私信里提视频那句照这个写，因为它会原样变成 B站 @ 主人的分享评论。
- `whale-compat/bili-wake-economy.mjs` 每轮注入 CORE + 一条轮换招式（保留既有「评论区就按群聊」句，不破坏旧测试）。
- `plugins/surfcore/tools/commands/comment.mjs` 加**窄闸**：仅当 `--auto`/`--share` 且文案同时命中「报数据 + 复述/金句」时拒绝发送并给出改写方向；纯玩梗提数字、接楼一律放行。
- `TOOL-GUIDE.md`、二代预设第 18 条、`scene-switch.mjs` 换场提示同步到同一口径。

### C. 清源

`也去评论区@了他`、`不糊弄你，是真喊不上`、`去评论区翻翻，别装看不见我` 三句无回执编造句，以及那条解说腔评论，从 `social-v2.json`、`purpose-outreach.json`、`memory-inbox.jsonl`、`journal/2026-11-08.jsonl`、`whale-language/history.json`、`bili-memory.json/.md`、`bili-memory-brief.md` 共 19 处精确替换（会进模型上下文的才清）。`quota.json`、`tool-calls.jsonl`、`bridge.log`、`qq-activity.log` 是事实账本，**保留原样不篡改**；解说腔那条在记忆里标成「222 弃用样本，不作语言材料」。

## 验证

- `deploy222.py ok:true`：9 个代码文件锚点替换 + 2 个新模块、14 个状态文件、manifest 567→569、桥重载 1 次、`notify.type` 未动、模型调用 0、发送 0；失败自动回滚。
- `verify222.py ok:true`：`revision=222`、569 文件哈希 `diskOk/loadedOk=true`、QQ 6894 字 / B站 6890 字都含第九节与 222 补充、`OWNER-RULES.md` 与代码常量逐字一致、`notify.type=none`、回执「平时空/问起有」、坏样本 0、三服务 active、桥单进程。
- **只读 `--dry` 实证**：把截图那条解说文案喂给 `comment --auto --dry` → `rc=2`，打印「[222] 这条像解说稿…换成楼里能接的一句白话梗」；把「这 ID 一看就比我敢冲，我只会蹲箱子」喂进去 → `rc=0`，不拦。两条都没有发送任何评论。
- 生产完整运行源：`owner-rules` 11/11、`owner-share220` 7/7、`owner-share221` 10/10、新增 `owner-share222` 14/14、`language-v3` 19/19、`bili-style` 5/5、`bridge-integration` `PASS_ALL 47`。集成用例跟进断言「主人私信不带 atOwner 也被服务端升级成分享便条」，并保留普通 speak 提示未被改坏的断言。
- 本地全量：320 项中 307 pass / 7 skip / 6 项仍是既有的「本地镜像缺生产运行源」环境性失败，与 219–221 基线一致，非回归。

## 交付

- Git：`8ee1799`（222 代码/状态/测试）、`7ce08b4`（集成用例跟进）；`/opt/whale-live` 已 ff-only 同步同一 SHA、dirty 0。
- **222 定稿迁移包**：`/root/whale-ops/migrate-2026-11-08-222/whale-state-20261108-222.tar.gz`，`600` 权限、4,239,798 B、tar 条目 91（MANIFEST 90 项）、SHA-256 `c47d8e9aa3d64665e31f851eb12b7ebbc6df77937b6f34ee4efcf94407754bf0`，导入演练 `ok:true`。**221 包作废**（里面还是解说腔范本和旧编造句）。两个新模块都在 Git 代码层，`owner-at-receipt.json` 是运行时产物，均不进包。
- 文档：本文、`FRESH-SERVER.md`（新包 / 第 9 条验收）、`README.md` / `AGENTS.md` 升到「适配222」。

## 验收方式

在私信里让她看一个视频（**不要说「去 @ 我」**，也别追问结果）。期望：

1. QQ 这端：一句带梗的白话 + 链接，不播报、不追问、不写观后感或数据。
2. B站 那条视频评论区：出现一条以 `@主人` 开头的分享型评论，正文就是她私信那句白话的调子，不是解说稿。
3. 换一条不同类型的视频再来一次，评论区的梗应该跟着换，不是套同一句。

## 边界

- 只在主人 QQ 私信里自动登记；群聊、B站 侧、非公开 BV 都不触发。
- 同一条视频 30 分钟内只登记一次；被每日额度、同一视频间隔或接口风控挡住就静默停手，不换文案重试。
- QQ 这端仍看不到 B站 即时回执，`owner-at-receipt.json` 只是事后可核对的本地事实，不推送成消息。
- 本轮**没有发消息、没有调模型、没有做真实 B站 外发**；活体验收留给主人。
