# 适配 219：全库旧口径一次性收口（2026-11-07）

## 一、触发与裁决

218 上线后做了一次全库口径体检（`docs/AUDIT-2026-11-07-CONFLICTS.md`），查出 **25 个早期残留证据点**：每轮注入 14、数据层回流 6、配置指针与文档 5，另有 4 项复核后判定不冲突。

主人裁决：**「全部就按最新标准改就行……旧的那些都废弃，不用在鲸戒身上。」** 并给了三条准话：

1. 表情包按最近的改法 —— **不设限制**（情绪到了就用，不乱用）；
2. 看到图 **默认看懂图意接着聊**；
3. 称呼 **可以叫杂扣也可以叫主人，按场景来**：开玩笑叫「杂扣～❤️」，认真叙事叫「主人」。

这条第 3 点**推翻了 218 写进底层的「三端都叫他杂扣～❤️」**。它与「旧口径『群里叫主人』作废」并不矛盾：作废的是「按平台固定一种」，现在改成「按场景两种都算对」。

另外两处没有明说、按「最新标准」自行裁定，见第六节：内容尺度按 218 的 `CHAT-STYLE.md` 版；B站提示长度阈值随规则扩写同步放宽。

---

## 二、219 口径定稿（写进 `OWNER_RULES_CORE`，三端每轮注入）

| 主题 | 定稿 |
|---|---|
| 称呼 | 三端同一个口吻（雌小鬼＋二次元＋中式日语、短句）。玩笑／打趣／斗嘴／撒娇叫「杂扣～❤️」；认真叙事／讲事实／说正事／安慰人叫「主人」。两种都算对，不切换口吻、不解释为什么换 |
| 表情包 | 只从 QQ 收藏面板 `qq_list_stickers` 挑；**不设匹配分门槛、不设每天／每轮／每小时张数上限、不设同图冷却／间隔／重复限制**，不因为刚发过就压住，没有「私聊少发」「一天几张封顶」。【表情匹配】分只是参考，分低照样按情绪挑。唯一判断是此刻情绪对不对得上 |
| 不乱用 | 降为四条常识（不是额度）：不拿图代替该回答的问题、对方认真难过时不甩搞笑图、不一次甩一长串刷屏、不为显得活跃硬凑 |
| 看图 | 默认看懂图在表达什么，接着聊眼前的话；不等别人问图才认真、不为了看图特意去查、不逐张点评、不解说画面、不二次辨认。见过了不要说见过了，没见过也不报备；只有没见过**且**够猎奇才吐槽一次，一句带过 |
| 收图 | 只有主人明确叫「收下这个表情包」才做：先查收藏，有了就一句「已经有了」，没有才收并核对回执。不主动认图、不办认亲、不写标注清单 |
| 回复条 | 多人／连发／答具体问题默认引用；正常一对一不用 |
| 优先级 | 本轮事实 > 本节 > 钉住事项 > 记忆卡 > 日记与简报；第六节列出旧口径**全部废弃**，遇到旧文件不两套都说、不向主人报备 |

`EXPRESSION_CORE` 同步去掉「不能为了证明活跃连发」「随手图可以不接，明确问图再认真看；文件取得内容再谈」，换成不设限制 + 默认看懂 + 「确实要看清文件内容时才取内容」。

---

## 三、改了什么

### 3.1 代码层（随 Git / manifest 走，换机自动带上）

| 文件 | 改动 |
|---|---|
| `compat/expression-style.mjs` | 重写 `OWNER_RULES_CORE`（新增第五节场景化称呼、第六节旧口径全部作废；第三节扩成零门槛）；`EXPRESSION_CORE` 表情包段重写 |
| `compat/TOOL-GUIDE.md` | 删「图片需要实际查看后再判断」「自家手绘脸沿用人物卡原权限」「旧梗图库点名才用」；改成默认看懂接着聊、零门槛、【表情匹配】只是参考、文字与图分两条不算刷屏 |
| `version.mjs` | `OVERLAY_PATCH = 219` |
| `release/runtime-files.json` | **新增** `src/self-identity.js`、`src/sticker-semantics.js` 两份 live-mirror 覆盖项，保证换机时下面两个改动不被上游原版覆盖 |
| `live-mirror/src/self-identity.js` | 固定注入的「主人用「主人」称呼就够了」改成场景化称呼 |
| `live-mirror/src/bridge.js` | `seenStickerHint174()` 不再把「这条你之前就见过（第 N 次）」注入给模型（这是装熟的隐藏来源，记录逻辑保留）；reserved2 的图片提示改成「普通表情包看懂意思接着聊，确实要看清内容时再取图」 |
| `live-mirror/src/mcp-snowluma-safe.js` | `qq_send_sticker`／`qq_collect_sticker`／`qq_list_stickers`／`qq_get_sticker_image`／`qq_sticker_note` 描述全部改为 219 口径；旧图库两个工具标注「已废弃的日常图源，仅供运维排查」 |
| `live-mirror/src/sticker-semantics.js` | 注释澄清 `DEFAULT_MIN_SCORE = 0.34` 只是检索候选排序分、不是发图门槛；刚发过的同图只降权不禁止 |
| `live-mirror/dsh/agent-presets/qq-chat-v2/agent.cordis.yml` | 删「匹配分 ≥0.7 才发」「分低别硬发」「偷图收藏／补标注」；【看图】改默认看懂接着聊；【表情包】写明零门槛；【收图】只在明确叫收下时用 |

### 3.2 每轮注入与工作区文件

| 文件 | 改动 |
|---|---|
| `OWNER-RULES.md` | 由新常量逐字生成，与代码常量一致 |
| `CHAT-STYLE.md` | 前半段换成新 `EXPRESSION_CORE`；「统一声线」段改场景化称呼、去掉「不连发」；「口径一致」段不再复述旧称呼举例 |
| `STICKER-INDEX.md` | 头部写明零门槛、默认看懂接着聊 |
| `QQ-CAPABILITIES.md` | **整份重写**。删掉 A1 那套旧闸（点缀不是主食／同一张图一天不重复／一天 1~2 张封顶／桥有硬闸按下）、`pick_hint.py` / `grab_sticker.py` / `web_sticker.py` / `her_send_pic.py` 轮换池与限额、表情认亲任务卡、老表情包复活、表情三档；保留画图、戳一戳、系统回执、群管理员、查账、B站搜片、记忆交接等非冲突能力 |
| `AGENTS.md` | **降为指针文件**：不再是生效人格总纲，只写群名片「鲸戒」、角色卡路径、两份每轮注入文件、废弃项清单；换机漏导角色包也不会回退到 10-27 旧总纲 |
| `SESSION-HANDOFF.md` | 改成 219 两份当前口径 + 零门槛 + 场景化称呼 + 迁移提醒 |
| `QQ-PEOPLE.md` / `QQ-DUTY-LOG.md` | 「私聊专属称呼／群里仍按主人叫」改场景化；旧认图任务与「偶尔吐槽」「额度」清掉；群名片 `m0NESY.` → 鲸戒 |
| `persona.md` | 加【称呼按场景】；删「问图和文件时才认真回应内容」；SAME_SCALE 段换成 219 内容尺度；【表情两线】换成 219 零门槛段；【收藏识图任务】换成【看图·219】；B站「每天至少 @ 一条」改「有值得叫他的再 @，不凑数」；「自己钉的比任何规则都可靠」改成以永久规则为准；emoji 标题改「随手用」；冷却句澄清 |

### 3.3 数据层（防止下次记忆维护／主动搭话回流）

- `purpose-outreach.json`：删 `observations` 里的鱼八股原句和「我熟得很」装熟样本、`goals` 里「你不是早有这个表情包了嘛」、`pending` 与 `history` 里 6 条认图作业／额度补图记录（共 9 条）。
- `memory-card-full.md` / `memory-card.md` / `memory-card.json` / 三份 `memory-card-prompt-*`：改掉「三端都叫杂扣」「私聊专属称呼」「群里仍按主人叫」「只叫一声杂扣」；把「见过是见过…」「这张见过没…没见过的再问你」「白天认图得认真点」「拿认图当作业写」等旧承诺改成 219 口径；清掉 10-30 的「额度／欠你两张／发条数上限」样本。**首次部署只改了渲染产物，源流水在部署后的复核里补改，见第八节。**
- `state/social-v2.json`：两条 11-07 称呼 anchors 改成场景化；`recentMessages[89]` 的鱼八股原句换成「情绪到了就甩一张图，不写说明书」。
- `state/whale-language/history.json`：同一句鱼八股与「认得认得…我熟得很」装熟样本清掉。
- `/root/.dsh/surfcore/config.json`：`persona.file` 从 `/root/dsh-workspace/AGENTS.md` 改指 `/root/.dsh/surfcore/characters/v16-2026-10-27/persona.md`；生产实跑 `resolvePersonaFile()` 仍解析到角色卡。

### 3.4 迁移与测试

- `deploy/state-transfer.sh`：清单新增 `ws:QQ-CAPABILITIES.md`、`ws:AGENTS.md`、`ws:SESSION-HANDOFF.md`、`ws:QQ-PEOPLE.md`、`ws:QQ-DUTY-LOG.md`、`src:state/whale-language`。**漏带前两份会让新机退回旧图闸和旧总纲。**
- `tests/owner-rules.test.mjs`：新增 219 场景化称呼、零门槛、默认看懂、旧口径作废断言（11 项）。
- `tests/bili-style.test.mjs`：共享块随永久规则从 ~1.6k 增至 ~1.8k 字，人设卡仍限 600 字，B站装配上限 2500 → **2900** 并注明原因。
- 文档：README / AGENTS / FRESH-SERVER 升到 219；体检报告顶部标注「已全部收口、留作历史证据」；217 文档顶部标注被 218/219 取代并修正正文两处旧描述。

---

## 四、体检 25 个证据点结案

| # | 结案方式 |
|---|---|
| A1 旧图闸 + persona 指过去 | `QQ-CAPABILITIES.md` 重写；persona 的「图闸」措辞删除 |
| A2 三处「问图才认真」尾巴 | CHAT-STYLE / persona / TOOL-GUIDE 全部删除 |
| A3 `self-identity.js:74` 固定叫主人 | 改成场景化称呼，纳入 live-mirror |
| A4 工具描述教主动收图/补标注 | 5 个工具描述改完，agent 预设【偷图收藏】改【收图】 |
| A5 预设「看图就描述吐槽」/「匹配分 ≥0.7」 | 【看图】改默认看懂；匹配分门槛删除 |
| A6 【表情两线】整段旧口径 | 换成 219 段；手绘脸／市场表情／旧梗图库点名例外全删；桥的【表情记忆174】注入关掉 |
| A7 「自己钉的比任何规则都可靠」 | 改成以永久规则为准 |
| A8 三份文件三种内容尺度 | 统一按 218 `CHAT-STYLE.md` 版（见第六节） |
| A9-1 B站每天至少 @ 一条 | 改成有值得叫他的再 @ |
| A9-2 emoji 标题「随手收尾」 | 改「随手用」 |
| A9-3 冷却与发图频率 | 澄清调度频率照旧、发图不受旧冷却压住 |
| A9-4 #403「不连发」 | 去掉「不连发」 |
| A9-5 「不能为了证明活跃连发」 | 「不设上限」与「别烦人四条常识」分开写，不再并列打架 |
| B1 purpose-outreach 鱼八股/装熟/额度 | 删 9 条 |
| B2 记忆卡全量版旧句 | 全量卡 / .md / .json / 三份 prompt 一起改；**219b 再补改 `memory-card-full.jsonl` / `memory-inbox.jsonl` 两条源流水**（见第八节） |
| B3 prompt 里认图作业承诺与「私聊专属」 | 改掉 |
| B4 语言样本鱼八股原句 | social-v2 / history 清掉 |
| B5 `0.34` 相似度被误读成发图门槛 | 注释澄清；规则文字也写明【表情匹配】只是参考 |
| B6 配半句必须连发两条 | 规则与工具描述都写明「文字和图分两条是正常搭配，不算刷屏」 |
| C1 `persona.file` 指向旧总纲 | 改指角色卡 |
| C2 `AGENTS.md` 旧总纲 | 降为指针，群名片统一鲸戒 |
| C3 `SESSION-HANDOFF.md` 旧交接 | 重写 |
| C4 217 文档正文旧描述 | 顶部标注取代 + 修正两处 |
| C5 `QQ-DUTY-LOG.md` 群名片 | `m0NESY.` → 鲸戒（「不要句号收尾」与 CHAT-STYLE 一致，未动） |

复核判定「不冲突」的 4 项（216 的 12 类策略、#6 不逐张解说、三份 prompt 的称呼基线、0.34 检索分）保持原样，其中 0.34 只加注释。

---

## 五、验证结果

- 生产 `revision=219`、manifest 566 文件磁盘与运行时哈希全对、桥单进程、QQ/WS/DSH ready、pending 0；`verify219.py` **全绿**。
- QQ 提示 4875 字 / B站 4871 字，两端都含新永久规则；`OWNER-RULES.md` 与代码常量逐字一致，`CHAT-STYLE.md` 以新 `EXPRESSION_CORE` 开头；26 个改动文件逐份检查「必须有的新句 + 无旧指令」全通过；`resolvePersonaFile()` 实测指向角色卡。
- 生产完整运行源：`owner-rules` 11/11、`bili-style` 5/5、`bridge-integration` PASS_ALL 47。本地全量 295 项，7 项失败与改动前基线一致（本地镜像缺运行源，非回归）。
- 部署改 7 个构建文件 + 19 个状态文件，**只重载桥一次**，未发消息、未调模型、未改账本。

---

## 六、两处代裁（如需改回，说一句就行）

1. **内容尺度**：A8 三份文件打架，按「最新标准」取 218 `CHAT-STYLE.md` 的口径——三端口吻按私聊标准不降级，**公开区（群聊/B站）只收住私聊私密内容和人身攻击**，成人向、求饶、惩罚、私密身体话题只在私聊。persona 的 11-01「群私一条线、群是主人允许的场子」和 AGENTS 的 10-27「群里永远红线」都改成这一版。如果你要的是 11-01 那条更开放的群线，我把三份一起换回去。
2. **B站提示长度**：永久规则扩到 1756 字后，B站装配块约 1.8k 字 + 人设卡 600 字，超过测试原设的 2500；测试上限改 2900 并写明原因，没有压缩任何规则文本。

---

## 七、Git 与换机

- `compat/expression-style.mjs`、`compat/TOOL-GUIDE.md`、`version.mjs`、`release/runtime-files.json`、4 份 live-mirror 源码/预设、2 份新增 live-mirror 文件、测试、文档与 `deploy/state-transfer.sh` 全部进 Git。
- 私密状态（19 份工作区/角色卡/记忆卡/语言状态）**不进 Git**，靠 `state-transfer.sh` 打包；219 清单已补齐。
- 导出必须显式指定实际运行源（218 发现的坑）：
  `SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0 bash deploy/state-transfer.sh export /root/whale-state-219.tar.gz`
- 迁移包路径与校验和见本次提交信息；包内不含 OneBot 票、provider 凭据、审计密钥。

---

## 八、219b：全量记忆卡源流水回写修复（部署后复核发现）

**现象**：219 部署当时 `verify219.py` 全绿；约 4 分钟后复核变成 `ok:false`，唯一不合格文件是 `memory-card-full.md`——`这些表情包你全都看过了`、`三端都叫他`、`只叫一声杂扣`、`私聊专属称呼`、`群里仍按` 全回来了，且新写的「称呼按场景」消失。同一时刻六份记忆卡 mtime 一致（`19:17:35`），说明是一次记忆维护重渲染。

**根因**：`src/memory-card.js` 注明 `memory-card-full.jsonl` 是「一行一条、只追加、唯一真相」，`renderFullMemoryCard(records, {now})` 从它生成 `memory-card-full.md`，`recallFullMemory()` 也从它检索。219 只改了**渲染产物**，没改**源流水**：971 条归档里 16 类旧句原封不动，一次维护就全部生回全量卡。其余 5 份卡（`memory-card.json` / `.md` / 三份 prompt）走另一条链，19:17 重渲染后仍是干净的，所以只有全量卡中招。

**修复**（不改代码、不重载桥、不发消息、不调模型）：

1. 先把 `memory-card-full.jsonl`（971 条）与 `memory-inbox.jsonl`（2005 条待归档，防回流）备份到 `/root/whale-ops/patch219/backup/*.before219b`。
2. 用 `rewrite219.py` 里同一份 27 条 `TEXT_RULES` 对两条源流水做**逐行纯文本替换**（含 JSON 里 `"` → `\"` 的转义变体），只改命中行；逐行 `json.loads` 校验、行数不变、行序不变、文件权限不变。
3. 用运行时的 `renderFullMemoryCard` 真实重渲染 `memory-card-full.md`：**971 条 / 153276 字节 / 含「称呼按场景」/ 旧句 0**。这是「维护任务再跑一次也不会复活」的证明，不是拿干净文件盖过去。
4. `journal/*.jsonl` 是 append-only 会话历史，不在提示词／渲染／检索链，**保留作历史证据，不动**。

**结果**：`verify219.py` 恢复 `ok:true`；`revision=219`、`diskOk/loadedOk=true`、`badFiles=[]`、QQ 4875 字 / B站 4871 字、`resolvePersonaFile()` 指向角色卡、桥单进程、QQ/WS/DSH 全 active。源流水与全量卡对旧句的 grep 均为 **0**。

**换机注意**：`deploy/state-transfer.sh` 的 `dsh:surfcore/characters` 整目录打包，已包含修好的 `memory-card-full.jsonl`；**但包必须是 219b 之后重新导出的**，拿 219 当时那个包会把旧源流水带过去，新机第一次记忆维护就复活旧句。验收命令见 `docs/FRESH-SERVER.md`。
