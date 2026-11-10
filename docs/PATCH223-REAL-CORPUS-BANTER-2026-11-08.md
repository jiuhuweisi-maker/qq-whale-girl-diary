# 223 · 评论区玩法改由真实 B站 语料蒸馏（2026-11-08）

## 触发与纠偏

222 收尾时我写了「这次的学玩梗是把方法论写进每轮注入，**没有去采 B站 真实热评语料做蒸馏**」。主人回了两句：

> 「之前codex采集过，她也会自己学习，况且你不是也采集了贴吧的嘛」

这是对的，而且比「没采」更具体：素材一直在，不该把手写示范当成唯一教法。一次性核查了三层已有资产：

| 资产 | 位置 | 现状 |
|---|---|---|
| 216 贴吧真实语料 | `compat/tieba-corpus.mjs` → `compat/language-strategies.json` | 104,437 候选 / 13,754 保留 / 934 帖 → 12 类接话策略，原文不入库，每轮注入一条 |
| codex 时期 B站 公开热评 | `.ops/style127-public-comments.result.json`、`.ops/bili-comments-readonly.result.json` | 真实热评 + 楼中楼 + 点赞数，只读采集，含「薄多利：一次卖够」这类接梗样本 |
| 她自己的 B站 自学习 | `compat/fishtalk-bili.cjs` → `language-learning.mjs` → `state/whale-language/` | **生产上已攒 504 条真实评论**、15 个视频、5 个分区；`autoLearn=true` / `browse` 模式，今天仍在采；`active-pack.json v652177a9594e738c` 每轮经 `styleBlock({scene:'楼中楼'})` 注入 B站 |

关键缺口不是「没有语料」，而是：`styleBlock` 只给了节奏（约 12 字、别凑字数），**没有给任何接梗手法**；222 我用 12 条手写招式补了玩法，却没把它和这 504 条真实语料接起来。223 就是把两者接上。

## 真实语料说了什么

在生产上用 `state/whale-language/corpus.json`（私有、永不进 Git）跑了一次离线蒸馏，只输出聚合特征：

- 504 条 / 15 视频 / 分区：动画 106、游戏 114、鬼畜 98、生活 75、热门综合 111
- 中位 **16 字**，p25 9 字，p75 33 字，69% 在 26 字内
- **84.7% 不收句末标点**、**64.5% 是楼中楼回复**、61.1% 有明确上下文
- 信任级别：high 308 / medium 196
- 反面：**报数据/报战绩 1.6%，复述/金句收尾 4.0%**，合计 5.6%
- 分区差异明显：鬼畜区中位 12 字、71% 短句；动画区 13 字、64%；游戏区 21 字、45%；生活区 20 字

也就是说，「44 杀 1.90 rating…这场的乐子比数据还密」那种课代表腔，在真实评论区里是**极少数**，不是常态。花式手法（谐音 0.6%、复读 0.8%、反串 2.4%）在语料里也不常出现——所以这轮教的重点是**分寸**（短、接楼、不收句号、别复述），不是硬凑花活；12 招仍保留作玩法池，按分区轮换。

## 改了什么

**新增**

- `compat/comment-banter-distill.mjs`：纯函数离线蒸馏器。输入私有 `corpus.json` + `active-pack.json`，输出可进 Git 的聚合包。含 `distillBanter()` / `validateBanterPack()` / `assertNoRawText()`；不联网、不调模型、不写文件、不碰凭据。
- `compat/comment-banter.json`：由生产 504 条真实语料蒸馏出的 `whale_bili_banter_v1`，`version=vd926fb3d895f3e9e`。只有数字与抽象手法（`moves` 10 条带观测占比、`genres` 5 个分区、`rhythm`、`avoid`），**一句评论原文都没有**。
- `tests/owner-share223.test.mjs`：9 项，含「构造独特句子逐字比对，确认策略包不漏原文」的反向测试。

**改动**

- `compat/comment-banter.mjs`：`COMMENT_BANTER_CORE`（永久规则第九节）补上真实语料依据，明确「这不是我编的套话」；`banterStrategy()` 改为按分区加权轮换 + 注入真实分寸；策略包缺失时退回手写 12 招，不中断说话；新增 `loadBanterPack()` / `genreFromBrowse()`（topic 与 tid 映射）/ `liveRhythm()`，后者每轮读生产 `active-pack.json`，**她继续看继续学，提示里的长度与标点节奏就跟着变**。`looksLikeRecap()` 窄闸一条未动。
- `compat/bili-wake-economy.mjs`：每轮 B站 提示新增 `genreQuickRef()` 分区速查（五个区各自的真实常见长度），`banterStrategy` 传 `genreFromBrowse(b)`；沉默逛时不注入玩法。
- 状态层：`OWNER-RULES.md` 按新常量逐字重生成；`CHAT-STYLE.md`、`QQ-CAPABILITIES.md`、`SESSION-HANDOFF.md`、`AGENTS.md`、`persona.md` 追加 223 段。
- `version.mjs` → `OVERLAY_PATCH = 223`；`manifest` 569 → 571。

**没动**：222 的服务端确定性分享、`--owner-ok`、`notify.type=none`、221/220 的永久规则、216 的 12 类贴吧策略与语料原文、任何凭据。

## 原文红线

与 216 完全一致：`corpus.json` 是唯一原文存放处，属**私密状态层**，不进 Git、不进提示、不进迁移包之外的地方；`comment-banter.json` 只有聚合统计。生产验证里用 `assertNoRawText(pack, corpus)` 把 504 条逐条前 12 字与策略包全文比对，结果 `true`；单元测试还构造了带独特句子的假语料，并反向验证「篡改一句进去会被抓到」。

迁移时这份语料**必须跟着走**：`state-transfer.sh` 的 `src:state/whale-language` 会把 `corpus.json`、`active-pack.json`、`versions/*`、`settings.json` 等一起打包（223 实测 `learningFiles` 11 项齐全）。换机丢了它，新服务器上的「学过的语料」就断了，又得从零攒。

## 验证

- 部署：`deploy223.py ok:true`，5 个 `whale-compat/` 文件整文件覆盖（事先核对生产/本地哈希，未碰 `src/bridge.js` 的脱敏账号），571 文件哈希一致，桥重载 1 次，`notify.type` 仍 `none`，失败自动回滚。
- `verify223.py ok:true`：`revision=223`、`diskOk/loadedOk=true`、pending 0、三服务 active、桥单进程；QQ 7427 字 / B站 7423 字都含新规则；`OWNER-RULES.md` 与代码常量逐字一致、`CHAT-STYLE.md` 前缀仍是 `EXPRESSION_CORE`；策略包 504 条 / 15 视频 / 5 分区、无原文；分区策略「同 seed 稳定、换分区不同」、`@ 主人分享` 同口径；`liveRhythm` 读到 `v652177a9594e738c` 并注入；只读 `--dry` 实证解说文案 `rc=2` 被 222 窄闸拦下、串子白话 `rc=0` 放行；两代坏样本 grep 全 0。
- 生产完整运行源：`owner-rules` 11/11、`220` 7/7、`221` 10/10、`222` 14/14、`223` 9/9、`language-v3` 19/19、`bili-style` 5/5、`bridge-integration` `PASS_ALL 47`。本地除既有的「镜像缺生产运行源」环境性失败外全绿。
- 模型调用 0、消息发送 0、真实 B站 外发 0。

## 交付

- Git `1652bbf`（223 代码与策略包）+ 文档提交；`/opt/whale-live` 已 ff-only 同步同 SHA、dirty 0。
- **223 定稿包** `/root/whale-ops/migrate-2026-11-08-223/whale-state-20261108-223.tar.gz`，4,241,695 B / `600` / 90 文件（tar 91 条目），SHA-256 `67ffba18a7a58a388be72d7ee3646f5de3ca39b4ee6136255b12f930a134c260`，`sha256sum -c` OK、导入演练 `ok:true`；**222 包作废**。

## 边界

这轮**没有新采语料**，用的是已有的 504 条生产语料 + 216 的贴吧管线口径；codex 那份本地公开热评样本只有 2 视频 6 热评 12 楼中楼，量不足以单独统计，没拿它当分布依据。策略包是「此刻的快照」，但 `liveRhythm()` 每轮读 `active-pack.json`，她后续自学习会持续改变节奏；若想让分区手法也定期重蒸馏，可以另开一轮把 `distillBanter()` 接进 `language-learning` 的发布钩子。

活体验收仍留给主人：私信让她看两条不同类型的视频，看 B站 评论区有没有两条 @ 他的分享评论、正文是不是私信那种短白带梗、且梗不一样，QQ 这端不播报结果。
