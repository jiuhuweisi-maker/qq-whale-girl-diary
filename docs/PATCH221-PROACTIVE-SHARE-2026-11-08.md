# 221 · 私信提视频就真去评论区 @ 主人 + 悄悄记着的本地事实

日期：2026-11-08 21:50–22:20（北京时间）
前置：[220 跨端 @主人打通](PATCH220-CROSS-SCENE-2026-11-08.md)

---

## 一、触发与主人的原话

220 交付时我写了句边界：「QQ 这端仍看不到 B站 发送回执，你在 B站 看到那条 @ 就是回执。」主人回：

> 「不是打开了qq和b站的通道了嘛」

随后补上真正要的东西：

> 「关键是，她看到想私信分享给我的视频，除了私信我，还应该在视频评论区@我才对啊」

以及回执口径的裁决：**「悄悄记着，不吭声」**。

也就是说，220 只解决了「主人当场叫她去 @」这一条被动触发；主人要的是**她自己看到好视频想分享时，本来就该双管齐下**。我最初把重心放在事后回执上，抓偏了，221 按主人这句重新定标。

## 二、先查清「通道」到底通的是哪一层

生产只读诊断（`.ops/diag-channel221.py` / `diag-channel221b.py`，脱敏输出，模型调用 0 / 发送 0）：

| 层 | 现值 | 传的是什么 |
|---|---|---|
| B站→QQ 记忆简报 | ✅ `biliBridge.enabled=true`、`memory.enabled=true`、`refreshIntervalMs=600000`；`bridge.js` 4 处注入；活跃简报 21:49:48 刚刷新 | 公开见闻、看过的视频、发过的公开评论。`bili-memory.js` 的 `PRIVATE_RE` 会丢掉含「私信／主人／@／评论区」的段落，且是 10 分钟级异步 |
| QQ→B站 换场意图 | ✅ 220 打通 `atOwner`，120 秒窗口由 `scheduler.js` 领取 | 一个 offer 文件；当前无 pending |
| **B站→QQ 动作回执** | ❌ `bili.config.json` 的 `notify.type="none"` | `comment.mjs` 发成功后会调 `notify.mjs` 报备（支持 `qq/dm/webhook/desktop/command`），但配置落在 `none` 分支直接返回 |

硬证据：活跃 `quota.json` 今晚 2 条评论全部 `share:false / ta:true`（@ 的是路人，印证 220 诊断）；简报含「@主人」「评论」字样但 `hasShareLabel=false`，没有「这次 @ 成没成」的确定性结果。

**另一条独立约束是时序**：QQ 那句回复生成时，B站 的动作还没发生，任何通道都不可能把未来结果送回已生成的回复里。所以 220「不编过程」不是权宜，221 完整保留。

结论：通道确实开着，我之前那句措辞不准；开的是「共用日记」和「带话过去」，缺的是「办完知会一声」——而主人要的更靠前，是**办这件事本身**。

## 三、主人裁决

- **行为**：私信里主动提起一个具体视频想给主人看 → 除了给链接/BV，同一轮就真去那条视频评论区发一条 @ 主人的分享型评论，**不用等主人开口叫**；主人当场叫了也照做，一次到位。
- **回执**：选 ①「悄悄记着，不吭声」。只写本地事实，不推送、不报备、不播报；主人真问起才照事实答。
- **不改**：`bili.config.json` 的 `notify.type` 保持 `none`。把它开成 `qq` 会让每发一条评论就推一条「[分享型·@主人] 评论已发出 rpid=…」的机器味报备，与 220 刚定的「不播报、不连环」正面冲突。

## 四、代码层（8 个锚点替换 + 1 个新增模块）

| 文件 | 改动 |
|---|---|
| `compat/expression-style.mjs` | 第八节保留标题，正文升级：同一轮 `qq_switch_scene(..., atOwner=true)`，不用等主人开口；只在主人私信、只认真实 BV、同一条不重复、被额度挡住就停；办完只悄悄记一笔 |
| `compat/TOOL-GUIDE.md` | 「主人在私信当场叫…」→「不用等他开口叫」 |
| `compat/scene-switch.mjs` | B站 换场提示不再假定「一定是主人叫的」，覆盖主人叫 / 她自己想分享两种来源 |
| `compat/bili-wake-economy.mjs` | `atOwner` 分支说明同步 |
| `src/mcp-snowluma-safe.js` | `qq_switch_scene` 工具描述与 `atOwner` 参数 describe 都改成主动分享口径 |
| `src/bridge.js` | 门禁**仍只认主人私信**（`source === owner`、`target=bili`、`speak`、带 video），但不再要求主人开口叫；新增 `ownerAtReceiptBlock` 条件注入，只在最近消息命中「@了没 / 那条评论 / 发出去没」时才把事实放进提示 |
| `plugins/surfcore/tools/commands/comment.mjs` | 成功拿到 `rpid` 后写本地事实；`--owner-ok` 那条显式跳过 notify 报备（即使将来有人打开 `config.notify`，也不会把「我发好了」推成播报） |
| `dsh/agent-presets/qq-chat-v2/agent.cordis.yml` | 第 18 条同步 |
| **`compat/owner-at-receipt.mjs`（新增）** | `writeOwnerAtReceipt` / `readOwnerAtReceipt` / `ownerAtReceiptBlock`。写在 `~/.dsh/surfcore/owner-at-receipt.json`，不依赖角色目录或私有 `state-paths`；原子写、600、只留最近一条、7 天过期、坏文件静默 |

`version.mjs` → `OVERLAY_PATCH = 221`。

**安全轨一条没动**：`--owner-ok` 仍只和 `--share --auto` 一起用，只豁免评分/排名；理由 ≥8 字、@主人 格式、每日额度、`owner-mention` lease、`comment-operations` 幂等、`--dry → --go` 全部保留。

**为什么生产用锚点替换而不是整文件覆盖**：见 `.ops/PAUSED-2026-11-02.md` —— Git 镜像 `src/bridge.js` 的账号是脱敏值，整文件覆盖会抹掉真值。`deploy221.py` 逐条断言锚点命中 1 次，任何一条不命中就整体不动。

## 五、状态层（6 份文档，都在迁移清单里）

`OWNER-RULES.md` 由新 `OWNER_RULES_CORE` 逐字生成；`CHAT-STYLE.md` 追加「主动分享（2026-11-08 · 221）」且保持 `EXPRESSION_CORE` 前缀；`QQ-CAPABILITIES.md` / `SESSION-HANDOFF.md` / `AGENTS.md` / `persona.md` 追加 221 说明。

新增的 `owner-at-receipt.json` 是**运行时产物**，不是初始状态：新机没有也正常，第一次成功 @ 后自动生成，**不进迁移包**。`state-transfer.sh` 清单未改。

## 六、验证

部署：`deploy221.py` `ok:true`，8 代码文件 + 1 新模块 + 6 状态文件，`whale-overlay-manifest.json` 566 → **567** 条、`patch=221`，桥重载 1 次，`notifyTypeUntouched=true`。

生产 `verify221.py` `ok:true`：

```
revision=221  healthy/ready=true  pending=0  diskOk/loadedOk=true
manifestFiles=567  bridgeIdentity=true  bridgeProcesses=1
QQ 5859 字 / B站 5855 字，两者都含「不用等他开口叫」「同一轮就用 qq_switch_scene」
OWNER-RULES.md 与代码常量逐字一致；CHAT-STYLE 前缀一致且含 221 段
receipt: 平时空串、被问起才出事实（含 BV 与 #reply rpid）
notify.type=none；comment.mjs 的 --owner-ok 不进 notify
dsh / whale-relay / whale-ws 全 active
```

测试：本地新增 `tests/owner-share221.test.mjs`（10 项），连同 `owner-share220`（7）、`owner-rules`（11）**28/28 通过**；本地全量 306 项 294 pass / 7 skip / 5 项既有的「本地镜像缺上游运行源」环境性失败（与 220 基线一致）。生产完整运行源下 `owner-rules`、`owner-share220`、`owner-share221`、`language-v3`、`bili-style` 全绿，`bridge-integration` `PASS_ALL 47`。其中 `bridge-integration` 的 VM harness 需要把新增的 `ownerAtReceiptBlock` 作为全局注入，已补（提交 `0508224`）。模型调用 0、消息发送 0。

## 七、定稿迁移包

| 项 | 值 |
|---|---|
| 路径 | `/root/whale-ops/migrate-2026-11-08-221/whale-state-20261108-221.tar.gz` |
| 权限 / 大小 | `600` / 4,225,309 字节 |
| 内含文件 | 90 个（+ `MANIFEST.json`；tar 条目 91） |
| SHA-256 | `33d382bd1938f8b6151c8c3ae52743ae1f9ecdf6aec58a81fef6b1c7973fc28c` |
| 同目录产物 | `SHA256SUMS` |

导入演练 `ok:true`（90 文件哈希全对、6 份 221 文档齐备、包内不含 receipt）。**220 的 90 文件包（sha256 `650374e9…`）作废**：里面还是「等主人开口叫才去 @」的旧规则。

导出时 `SURFCORE_ROOT=/opt/whale-surfcore/staging-c174ed0` 不能省，否则会漏 `src/state/*`。

## 八、验收（换机后）

```bash
grep -c '不用等他开口叫' /root/dsh-workspace/OWNER-RULES.md                  # >=1
grep -c '主动分享（2026-11-08 · 221）' /root/dsh-workspace/CHAT-STYLE.md     # >=1
node -e "console.log(JSON.parse(require('fs').readFileSync('/root/.dsh/surfcore/bili.config.json')).notify.type)"  # none
```

再看一次真实行为：主人在私信里让她看到一个视频（别提「去 @ 我」），她应该把链接给出来，并且 B站 那条视频评论区出现一条 @ 主人的分享评论；QQ 这端不播报、不追问回执。之后主人问「@ 了没」，她照本地事实一句答完。

## 九、边界

- QQ 这端仍看不到 B站 的即时发送回执；221 给的是「事后可核对的一条本地事实」，不是把回执推成消息。**主人能在 B站 看到那条 @ 就是回执。**
- 本轮未发任何消息、未调模型、未做真实 B站 外发验收；能力打通与只读验证已完成。
- 只在主人私信里自动这么做；群聊、B站 侧不照搬。没有真实 BV 不编，同一条视频不重复，被每日额度 / 同一视频 7 天限制挡住就停，不换文案重试。
