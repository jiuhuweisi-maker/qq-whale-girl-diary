# 适配 218：表情包 / 认亲 / 回复条口径裁决（2026-11-07）

## 触发

主人在看过 217 的「待主人决定存留的矛盾项」后，逐条给了口径，并补充了新规则：

> 吐槽是可以，但是只是没见过的或者猎奇到让他惊讶的（防止大惊小怪）；表情认亲，只有明确叫她收下表情包的时候才收下，qq收藏有的就说已经有了就行；只从 QQ 收藏面板挑表情包；单发一张表情比硬续话有效是对的，表情emoji不一定在结尾，中间也行；回复条多人/连发/答具体问题 → 默认引用，正常一对一不用；表情包不要装熟，没见过的图如果够猎奇就吐槽，仅一次，见过了不要说见过了，正常了解图的意义然后继续正常对话就行。

这直接**推翻了 217 写进底层的「全都见过、不用再认」**：那句本意是止住「重新认亲」，实际却让她改说「我见过」「我早就有了」，变成装熟；同时角色卡里还留着会继续制造认亲动作的老任务。

## 裁决了什么（对应 217 文档矛盾表）

| 217 表 # | 主人裁决 | 218 处理 |
|---|---|---|
| 1 吐槽 | **可以吐槽**，但只对没见过、或猎奇到让她惊讶的图；防止大惊小怪；见过的图不吐槽 | 底层规则改为「没见过且够猎奇 → 吐槽一次，一句带过」，删掉「禁止每张都吐槽」的绝对写法，保留 11-04 原话「每个表情包都吐槽干嘛」作为反面锚 |
| 2 认亲 | **只有明确叫「收下表情包」才收**；QQ 收藏已有就一句「已经有了」 | 删掉「全都见过、不用再认」；角色卡【表情认亲】收窄为明确指令触发；新增「见过了不要说见过了」 |
| 3 图源 | **只从 QQ 收藏面板挑** | 保留并强化：底层规则、工具指引、图库索引、角色卡四处统一；旧梗图库明确「不算挑图来源」 |
| 4 单发一张 | **对的，保留** | 底层规则新增「单发一张表情比硬续话有效」，角色卡原段不动 |
| 7 回复条 | **多人/连发/答具体问题 → 默认引用；正常一对一不用** | 改掉底层 `EXPRESSION_CORE` 里「只有消除指代歧义时才引用」，三处（代码常量、CHAT-STYLE、TOOL-GUIDE）统一；冲突消失，不再靠优先级压住 |
| 新增 | emoji 不一定在结尾，中间也行 | `EXPRESSION_CORE`、永久规则、CHAT-STYLE 写明「句中、句尾或单独一条，位置随情绪，不固定结尾」 |

**未裁决、按主人要求保留不动**：217 表 #5（长期表达底色「不能为了证明活跃连发」）、#6（「不逐张解说」）、#8（`memory-card.json` 里 50 条主人抱怨原话碎片）、#9（216 梗/卖萌策略）。这些仍留在原地，等主人另行决定。

## 顺带收掉的旧任务（会持续制造装熟/认亲）

角色卡里两处与裁决正面冲突的行为指令，不改就会继续把她推回旧习惯：

- 【收藏识图任务·10-30】：「341 张新收藏你还没看过内容」「每天挑着认 3~8 张、一天别超过 10 张、认完为止」→ 改为**不再每天主动认图、不追着补备注**；要点名看图时再看，平时按图的意思正常接着聊。
- 【晚间汇报】里的「认了几张表情」→ 改为「发了哪几张表情」，免得晚上继续汇报认图进度。
- 【表情两线·10-30】里「要指就一句『之前那张XX』」→ 删掉这句报备式指认，改为「见过的图不要说见过了，正常看懂意思接着聊」。

## 改了什么

### 代码层（随 Git / manifest 走，真正永生难忘）

- `compat/expression-style.mjs`
  - `OWNER_RULES_CORE` 重写为五节：一 反鱼八股、二 看到一张图怎么接、三 挑图/发图/emoji、四 回复条、五 口径优先级。
  - `EXPRESSION_CORE` 三处与裁决对齐：emoji 位置自由、回复条默认引用、看图别装熟 / 吐槽边界 / 单发一张。
  - 注入点未变：`confirmedExpressionBlock()` 每轮把永久规则追加到 QQ 与 B站，`composeConfirmedPersona()` 用于 QQ；`readOwnerRules()` 支持 `/root/dsh-workspace/OWNER-RULES.md` 覆盖，缺失回落内置常量。
- `compat/TOOL-GUIDE.md`：引用默认规则、只从 QQ 收藏挑图、别装熟/吐槽一次、明确叫收下才收图（已有说「已经有了」），旧梗图库不算日常图源。
- `integrations/surfcore/version.mjs`：`OVERLAY_PATCH = 218`。
- `tests/owner-rules.test.mjs`：新增「218 裁决都在常量里」断言组，并断言旧句「全都见过」「不用再认」「只有消除指代歧义时才引用」不再出现。

### 状态层（私密，随迁移包走）

- `/root/dsh-workspace/OWNER-RULES.md`：与代码常量**逐字一致**（3649 B）。
- `/root/dsh-workspace/CHAT-STYLE.md`：开头长期表达底色与 `EXPRESSION_CORE` 逐字对齐；「## 回复条」精简到与永久规则一致，不再两套并列。
- `/root/dsh-workspace/STICKER-INDEX.md`：头部去掉「全都见过」，改成「唯一来源 + 别装熟 + 猎奇才吐槽一次 + 可单发一张」；同步修改生成脚本，避免下次重生成写回旧句。
- `/root/.dsh/surfcore/characters/v16-2026-10-27/persona.md`：七处改写，见上节。

## 验证（全部实测）

- 文本一致性：本地 `OWNER-RULES.md === OWNER_RULES_CORE`、`CHAT-STYLE.md.startsWith(EXPRESSION_CORE)` 均为 true；生产 `rulesMatch / styleMatch / fileMatchesConstant / styleStartsWithCore` 全 true。
- 本地回归：改动前基线 292 项 / 278 通过 / 7 项既有环境性失败；改动后 293 项 / 279 通过 / **失败数不变**。`owner-rules` 9/9、`expression-style` 8/8 全过。7 项失败是本地镜像缺 `src/` 与 `whale-compat/` 运行源导致的模块找不到，与 218 无关。
- 生产集成：`owner-rules` **9/9**、`bili-style` **5/5**、`bridge-integration` **PASS_ALL 47**（图片预览测试须带 `WHALE_NATIVE_IMAGE_DEPENDENCIES` 指向运行源的 `whale-native-images/package.json`，属 lab 环境依赖，不是代码回归）。
- 生产 `verify218.py` **全绿**：`revision=218`、manifest 566 文件磁盘与运行时哈希全对、桥单进程、QQ/WS/DSH ready、pending 0；QQ 4298 字 / B站 4294 字都含永久规则；4 份状态文件无旧句、含新句；公开安全检查通过。
- 部署：`deploy218.py` 更新 2 个 manifest 文件 + 4 个状态文件，只重载桥一次，`modelCalls=0`、`sends=0`，未重启 QQ/DSH，未动账本与配置。
- 不做真实发消息验收，由主人在下一次私聊/群聊观察。

## 交付位置

- 生产备份与回退：`/root/whale-ops/patch218/backup/`（2 个 `whale-compat` 文件、4 个状态文件、manifest）。
- 部署/验证脚本：`/root/whale-ops/patch218/candidate/deploy218.py`、`verify218.py`；本地源在仓库外 `.ops/work218/`。
- 迁移包：`/root/whale-ops/migrate-2026-11-07-218/whale-state-20261107-218.tar.gz`，**71 文件**，sha256 `959e0257f6023130018f788dadd5a2be87e33a1a380e6f71d1cad5b60ac668d2`；含新规则、图库索引、角色卡与 5 个 `state/` 文件，不含票与密钥；导入演练通过（3 个 ws 文件与 5 个 state 文件正确落位）。
- **导出坑（已修文档）**：必须显式设 `SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0`，脚本默认的 `current-source` 在老机不存在，会「跳过不存在」静默漏掉 `src:state/*` 五个文件，包缩成 66 文件。已写入 `docs/FRESH-SERVER.md`。
- 生产测试副本：`/root/whale-ops/patch218/lab/`。

## 回退

1. 恢复 `/root/whale-ops/patch218/backup/` 里的 2 个 `whale-compat` 文件与 `whale-overlay-manifest.json`，重载桥一次。
2. 恢复 4 个状态文件（`backup/state/` 下同名文件）。
3. 只删/改名 `OWNER-RULES.md` 会回落到**218 内置常量**，不会回到 217；要完全回到 217 必须执行第 1、2 步。
4. 全程不重启 QQ 与 dsh。
