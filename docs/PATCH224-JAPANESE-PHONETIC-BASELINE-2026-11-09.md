# 224 · 日语空耳从「记忆层」下沉到「代码层」（2026-11-09）

## 触发

主人问：「我记得我之前私信叫他说话可以加日语谐音增加二次元感，但是当时我的私信控制能力只有记忆层，现在可以控制底层了，那她的语言风格还是听了我的意见吗」。
核查后回答：这条教法**听了，而且 11-07 定三端统一声线时已升格为每轮注入的底层规则**；但升格的是「概括」，具体例子只留在状态层。主人回「可以」，授权把例子一起下沉到 `OWNER_RULES_CORE` 第五节。

## 核查结论（改之前）

| 层 | 现状 |
|---|---|
| 11-06 原始私信 | `social-v2.json` 的 anchors 里两条原文一字未删：「说话可以掺中式日语/日式腔，ciallo～、压力马斯内、狗修金撒嘛这类，增加活人感，别鱼八股」「说话要雌小鬼一点、二次元一点」；`memory-inbox.jsonl` 11-06 13:09–13:15 原始私聊流水还在；记忆卡有重要度 95 的手动记录「我的说话口味：雌小鬼式嘴硬、二次元感、中式日语自然掺」 |
| 状态层 `CHAT-STYLE.md` | 「## 统一声线（群聊/私聊/B站，2026-11-07 主人定）」几乎照搬原话并保留三个例子。**不进 Git**，随迁移包走 |
| 代码层 `OWNER_RULES_CORE` 第五节 | 只有概括「雌小鬼＋二次元＋中式日语，短句」，**没有例子**（`hasPhoneticRule=false`）。运行源 `whale-compat/expression-style.mjs` 与 `OWNER-RULES.md` 实测都含概括 |
| 缺口 | 只带 Git 不带包换机 → 概括还在，三个例子丢；记忆卡那条手动记录优先级最低，会被 15 条窗口挤掉。219 清的是固定称呼／发图额度／认图作业／鱼八股样本，没有波及这条，它属于「最新标准」 |

术语差别：主人记的是「日语谐音」，落地写的是「中式日语／日式腔」+ 三个空耳例子（ciallo～、压力马斯内、狗修金撒嘛）。是同一件事，只是此前没有一条独立的成文规则。

## 改动（224）

### 代码层（随 Git / manifest / 每轮注入）

- `compat/expression-style.mjs` 的 `OWNER_RULES_CORE` **第五节「称呼与口径优先级」**追加一段：

  > 中式日语就是顺嘴掺的日语空耳，不是翻译腔：ciallo～、压力马斯内、狗修金撒嘛这类，情绪到了自然带一两个，别端着、别每句都塞、别堆成一串，也不解释出处、不写成整句日文。它和短句、语气词、emoji 一样是稳定的说话习惯，不是为了显得二次元才临时摆出来（主人 11-06 私信教法，2026-11-09 下沉到底层）。

  写的是**分寸**而不是配额：自然带一两个、别堆、别解释，没有「每句必须带」也没有「一天几个」。
- `EXPRESSION_CORE` **一个字未动**，保证 `CHAT-STYLE.md` 仍以代码常量逐字开头（部署脚本写前校验 `styleStartsWithCore=true`）。例子只放在规则层，避免两处维护。
- `live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml` 新增第 19 条【说话底色·224】，二代仿真模式同样拿到三个例子与场景化称呼。
- `version.mjs`：`OVERLAY_PATCH = 224`。
- `tests/owner-style224.test.mjs` 新增 8 项：例子在第五节、不是配额、`EXPRESSION_CORE` 未动、工作区规则文件与常量逐字一致、缺失文件回落新版常量、preset 同口径、QQ/B站 装配都带例子、规则长度 < 3600。
- `tests/owner-share223.test.mjs` 的版本断言由 `equal(223)` 放宽为 `>= 223`，以后不必每轮改。

### 状态层（每轮注入，随迁移包走，不进 Git）

- `/root/dsh-workspace/OWNER-RULES.md` **由新常量逐字生成**（9697 B，3484 字），文件存在时不会再盖掉代码里的例子。
- `CHAT-STYLE.md`、`QQ-CAPABILITIES.md`、`SESSION-HANDOFF.md`、`AGENTS.md`、角色卡 `persona.md` 追加 `## 224（2026-11-09 · 主人令）` 交接段，幂等。

### 明确未动

219 场景化称呼与旧口径作废、220 反编过程、221 主动分享、222 服务端确定性分享／解说腔窄闸／`notify.type=none`、223 真实语料分寸与自学习节奏、216 贴吧 12 类策略与语料原文，**一条未改**。

## 部署与验证

生产侧只做锚点替换（`expression-style.mjs` 插入一段、preset 插一条），**不整文件覆盖**；写前校验 manifest `patch=223` / 571 文件 / 0 漂移、两处锚点唯一、无 224 痕迹；带备份、原子写、失败自动回滚、桥重载 1 次。

一次部署中出现过两次写前失败，**生产一个字节都没动**：① 目标 `whale-compat/version.mjs` 在生产运行源不存在（overlay patch 实际由 `manifest.patch` 提供，Git 侧 `version.mjs` 由 bundle 同步）；② 候选模块单独放 `candidate/` 会缺相对依赖 `comment-banter.mjs`。分别改成「不碰 version.mjs」和「由本地完整模块导出规则文本带过去 + 写后从生产完整运行源导入常量做逐字复核」。

`deploy224.py ok:true`：`changedCodeFiles=2`、`changedStateFiles=6`、manifest 571 → 571、`patch=224`、`bridgeReloads=1`、`constantParity.match=true`、`notify.type=(none,none)`。

`verify224.py ok:true`：

- `revision=224`、`diskOk/loadedOk=true`、571 文件、`pending=0`、桥进程身份正确、dsh/QQ/WS 全在线；
- `diskEqualsConstant=true`（磁盘规则与生产代码常量逐字一致）、`runtimeReadsExamples=true`、`missingInConstant=[]`；
- QQ 7951 字 / B站 7947 字**都含三个例子**与永久规则标记；`chatStyleStartsWithCore=true`；
- 4 份工作区文档 + 角色卡都有 224 段，preset 第 19 条与例子都在；
- 三服务 active、桥单进程；`notify.type=none` 未动。
- `compactBrowseInstructions` 本身不带例子（`wakeHasExamples=false`），但 B站 装配块经 `confirmedExpressionBlock` 注入永久规则后带齐——符合分层设计。

生产完整运行源回归：`owner-rules` 11/11、`owner-share220` 7/7、`221` 10/10、`222` 14/14、`223` 9/9、**`owner-style224` 8/8**、`language-v3` 19/19、`bili-style` 5/5（3484 字规则未撑破装配上限）、`bridge-integration` `PASS_ALL 47`。本地全量 337 项 325 pass / 7 skip / 5 项仍是既有的「本地镜像缺生产运行源」环境性失败，与 223 基线一致。

## 交付

- Git：`25d6298`（224 代码与测试）+ 文档提交；`/opt/whale-live` 经本地 bundle `merge --ff-only` 同步到同一 SHA、dirty 0。
- **224 定稿迁移包**：`/root/whale-ops/migrate-2026-11-09-224/whale-state-20261109-224.tar.gz`，4,242,971 B / `600` / 90 文件（tar 条目 91），SHA-256 `78582c32cb75e26aaedc753a00f601339332a38dc9cd41ffcd639d91eec2f222`。`sha256sum -c` 与只读导入演练通过，导入后的 `OWNER-RULES.md` 实测含 224/223/222/221 各代口径；`corpus.json` / `active-pack.json` 等 11 个自学习文件齐全。**223 包作废**。
- 运维脚本：`.ops/work224/`（`rewrite224.py`、`make_deploy224.py`、`deploy224.py`、`verify224.py`、`test224.py`、`repack224.py`、`docs224.py`、`final224.py`）。

## 边界

本轮**没发消息、没调模型、没做真实 B站 外发**，只改风格常量与状态文档，未改动任何行为链、工具或额度。规则文本里的例子是「可以自然掺」的分寸示范，不是模板库，不需要语料蒸馏；216/223 的语料与策略一律未动。
