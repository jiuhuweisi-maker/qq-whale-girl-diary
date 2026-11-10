# 216：贴吧语言蒸馏与鲸戒表达策略层

## 结论先说

这版没有把贴吧语录塞进提示词。做的是三件事：

1. 用真实贴吧回复统计出「真人怎么短句接话」的节奏基线（长度、标点、疑问比例）。
2. 把这些规律写成 12 类**鲸戒自己的**表达策略，每条带场景、情绪、意图、强度、适用关系、禁忌和原创示例。
3. 在原有文风提示末尾只追加**一条**与当前场景匹配的策略，最多约 110 字，不改人格、不改身份、不复制原句。

## 实际分析的代码

- Fishtalk `0.3.6`（固定提交 `bb621c3`）：`README`、`AGENT.md`、`cli`、`lib/sites/tieba.js`、`lib/bili.js`、`lib/distill.js`、`lib/store.js`、`lib/importers.js`、`lib/check.js`、`lib/deep.js`、`lib/label/*`、DSH 入口与 59 项测试。
- 鲸戒现有语言链：`compat/language-style.mjs`（`styleBlock`/`sceneOf`/`validatePack`）、`compat/language-learning.mjs`（采集/蒸馏/发布）、`compat/language-cli.mjs`、`compat/language-pack.json`、`live-mirror/src/bridge.js` 的调用点、`FISHTALK-NOTICE.md`、`docs/LANGUAGE-V3-2026-11-06.md`。
- 结论：Fishtalk 的贴吧适配器**本来就有**，但注释写明无登录请求会撞「百度安全验证」；其 `pack`/`deep` 是给人读的建议，不适合直接注入。本版只复用其清洗/相似度思路，表达策略自建。

## 数据来源与阻塞点

| 来源 | 方式 | 结果 |
|---|---|---|
| 贴吧线上页面 | 本地 curl、生产服务器 curl、独立配置的真实 Edge | 全部被 `百度安全验证` 拦截（HTTP 403）；未登录、不绕验证码 |
| 用户浏览器真实会话 | 用户手动过一次拼图验证后，公开帖子页正常访问 | 采集 18 个吧、43 个帖子、408 条回复（单次、2.2–2.5 秒间隔、只读） |
| `Orphanage/Baidu_Tieba_KangYaBeiGuo` | HuggingFace 公开数据集，MIT | 934 个帖子，约 10.4 万条回复候选 |
| `Orphanage/Baidu_Tieba_SunXiaochuan` | HuggingFace 公开数据集，CC-BY-4.0 | 同上合并统计 |

没有抓私信、没有碰登录凭据、没有把 cookie 写进仓库。线上采集只取公开帖子正文与楼中楼。

## 采集与过滤

`compat/tieba-corpus.mjs` 是离线管线，输入本地 JSON，输出只含统计与清洗后语料（原始文本落在 Git 忽略目录）：

- 帖子级：标题命中性别、婚恋、政治、疾病、赌博、诈骗、活动公告、招募、水楼、举报楼等，整帖丢弃。
- 回复级：隐私（链接、邮箱、7 位以上数字、联系方式）、广告拉人（私我、日结、代充、租号）、辱骂与人身攻击、性暗示、刷屏重复、纯符号、无中文、元信息残留，全部丢弃。
- 保留楼层顺序与同帖上下文；没有回复关系就不伪造「回复了谁」。
- 去重按归一化文本；相似度复用 Fishtalk 的二元组实现。

结果：

| 口径 | 候选 | 保留 | 中位长度 | ≤30 字 | 问句 | 句尾无标点 |
|---|---|---|---|---|---|---|
| 公开数据集 | 104,437 | 13,754 | 16 字 | 78.5% | 9.8% | 86.6% |
| 线上真实会话 | 408 | 74 | 15 字 | 78.4% | 10.8% | 66.2% |
| 合计 | 104,845 | 13,828 | — | — | — | — |

线上样本保留了用户指定的首页推荐帖（10 个），另补生活、动漫、原神、星穹铁道、猫、美食、大学、恋爱、电影、音乐、王者、英雄联盟、学习等吧。

## 蒸馏结果

`compat/language-strategies.json`，12 类，版本 `v6a662787ba7ee1f2`：

- 日常接话、吐槽与互损、抽象整活、撒娇卖萌、嘴硬与傲娇、阴阳怪气、安慰与关心、游戏和二次元、熟人互动、私聊互动、群聊多人、网络梗。
- 每类含：场景、上下文、情绪、意图、强度 1–3、适用关系、可复用规律、禁忌、注意事项、3–5 条**原创**示例。
- 证据标注：`measured`（≥200 条）6 类、`limited` 3 类、`persona-anchored` 3 类。撒娇、嘴硬、熟人、私聊在公开语料里没有可靠关系标注或样本，明确写「不由语料推断」，不编数据。
- 语料里的戾气没有学：攻击、性别、地域、外貌相关内容在过滤阶段就删了；策略层再写一遍禁忌。

## 接入方式

- `compat/language-strategies.mjs`：校验、按场景取策略、同一会话不连续重复、同一条消息不抖动、5 秒缓存、任何异常返回空串。
- `language-style.mjs` 的 `styleBlock` 在原有约 170–200 字提示后追加一条 `【接话参考 版本】…`，实测总长 222 字（生活分享场景），只增约 40–50 字。
- 场景优先取「主场景」：写给药方的安慰策略不会因为副场景列表里带「生活分享」就误触发到普通晒生活。
- 私聊类标 `autoSelect:false`，只作为人工参考，不参与群聊自动选择。
- 不新增模型调用、不新增 npm 依赖、不常驻进程；关闭语言增强时整段不出现。

## 验证

- 新增 `tests/tieba-strategies.test.mjs` 11 项：schema 与版本哈希、每类规则长度、注入内容拒绝、场景匹配与回退、同种子稳定与会话内轮换、提示长度、开关行为、过滤规则（隐私/广告/辱骂/重复）、帖子上下文分类、楼层顺序、清洗前缀。
- 语言与运行时相关回归 47 项全过（language-v3 19、本版 11、runtime 10、reply-continuity 4、expression-style 3）。
- `node --check` 覆盖新增与修改的 `.mjs`。
- 未做真实群聊测试、未发任何 QQ/B站消息、未调用付费模型。

## 改动文件

新增：

- `integrations/surfcore/compat/tieba-corpus.mjs`
- `integrations/surfcore/compat/language-strategies.json`
- `integrations/surfcore/compat/language-strategies.mjs`
- `integrations/surfcore/tests/tieba-strategies.test.mjs`
- `docs/PATCH216-TIEBA-LANGUAGE-2026-11-07.md`、`docs/PATCH216-VALIDATION.json`

修改：

- `compat/language-style.mjs`：追加一条场景策略。
- `compat/language-cli.mjs`：新增 `strategies` / `strategy <场景>` 两个只读命令。
- `version.mjs`：`OVERLAY_PATCH=216`。
- `README.md`、`AGENTS.md`：版本与交接入口。

## 上线

生产目录 `/opt/whale-surfcore/staging-c174ed0`，2026-11-07 13:46（上海）：

- 部署前基线：manifest patch=215、563 文件、磁盘哈希全对、45 秒内无新来信。
- 替换 5 个受管文件（3 新增、2 修改），manifest 升到 216、566 文件；备份在 `/root/whale-ops/patch216/backup/`。
- 只重载 QQ 桥一次（原 `start`/`stop` 接口），**没有重启 QQ，没有重启 dsh**；账本、配置、人格、关系、收藏均未动。
- 校验：`revision=216`，磁盘 566 文件哈希全对，运行时捕获 8 个加载指纹全对，桥进程身份与工作目录正确且只有 1 个；QQ 在线、WS 连接、DSH ready、pending=0，原 2 条 uncertain 未变。
- 生产内实际调用 `styleBlock`：三个场景都带 `【接话参考 v6a662787ba7ee1f2】`，长度 199–223 字。
- `dsh`/`whale-relay`/`whale-ws` 三个服务 active；部署后日志无 TypeError/ReferenceError/SyntaxError。
- 部署后未发任何 QQ 或 B站消息，未调用模型。

## 限制与未完成

- 贴吧线上直连仍被风控；要扩大线上样本，只能在用户浏览器里由本人过验证后分批采集，不自动过验证码。
- 公开数据集集中在抗压背锅吧、孙笑川吧，游戏与抽象语境偏多；生活、安慰、动漫样本相对少。这类偏差已在证据强度里标出，没有用数量掩盖。
- 撒娇、嘴硬、熟人、私聊四类没有语料证据，规则来自原人格与既有关系记忆，属于「不学坏、不乱编」的保守写法。
- 未做语义级深度蒸馏（Fishtalk 的 `deep` 需要模型逐篇读材料），本版是统计特征 + 人工归纳；没有训练或微调。
- B站语言包 `whale_bilibili_style_v1` 未改动，两套包并存：B站统计包负责节奏数字，贴吧策略包负责接话规则。
- 长期自然度只能在真实聊天里观察，不能拿离线测试当验收。
