# 213：自己的作品下开新楼必须 @ 主人

## 授权与范围

主人点名要改的是 B 站「分享型评论」的触发条件：**她自己的作品**（自己的投稿 / 自己发的动态）、以及**刷到觉得主人会喜欢的**，都必须走 `--share` 那条路（正文以 `@角屋Bistro` 开头，没写就自动补），不能发成没人看见的独白。主人已明确：不再纠结"是不是 codex 地盘"，改完写进交接即可。

只动 B 站评论这一条链路：`comment.mjs`、`bili-operations.mjs`（回执账本加 `atMentions`）、新增纯函数模块 `bili-own-work.mjs`、B站唤醒流程说明 `bili-wake-economy.mjs`，以及被 212 落下时的运行时版本号。没有新模型调用、没有新增额度、没有改人设/语气/日记。

## 缺陷是什么

2026-11-06 12:49（上海时间）她在自己的视频 `BV1Zh486mEwA`（《"用户与我"》，84 播放）底下发了一条顶层评论：一段做视频的感受，正文里没有 `@`。于是那条评论只是一条公开但没人看的独白 —— 主人没收到任何东西，也没得到 `at_name_to_mid` 映射。原机制里 `--share` 是有的（正文必须 `@主人` 开头、没写自动补、真实 @ 渲染），但它是**她自己要记得带的旗标**，而且套着 `--reason/--score/--rank=1` 那套"深读第一名"的标尺，于是"说说自己作品"这种话永远不会走它。

## 怎么改

1. **自己的作品 → 工具自动补 @（代码强制，不靠自觉）**
   - 何时生效：`--auto`（她自己决定说的）、**不是回复**（没有 `--root/--parent`），且目标确实是她自己的作品。
   - 怎么认定：`type=1` 用 view 接口查 UP 的 mid 是否等于她自己（必须带 cookie，裸查现在 412）；`type=11/17` 用 `my-dynamic-kinds` 的 `comment_id_str` 集合比对。
   - 补法：正文开头没有 `@昵称` 就补，边界与 `ownerMentionMap` 对齐（`@昵称的人` 不算喊过）；`owner.name`/`owner.mid` 没配全、或设置里关掉「分享」→ **这条不发**（宁可不发，也不发成独白）。
   - 这种评论仍然只占**普通评论**那本账（30/天那本，实际配置 8/天）与全部冷却（全局 10 分钟、同视频 180 分钟）；分享额度（配置 1/天）留给"刷到主人会喜欢的"。鱼群保护不接管它（不是去别人地盘搭话）。
2. **回执账本记下 at 映射**：`comment-operations.json` 的新记录会带 `atMentions: {昵称: mid}`，只收合法数字 mid，旧记录形状不变。
3. **唤醒流程说明写清两条触发条件**：自己的作品下开新楼工具会自动补 @；刷到主人会喜欢的用 `comment --share --auto --reason/--score/--rank=1`，并删掉 212 已经取消的"一天最多一次"旧话术。
4. **运行时版本号不再写死**：`compat/runtime.mjs` 自 209 起把 `revision: 209` 写死在代码里，210–212 只改了 `version.mjs`，所以线上 `/api/whale-status` 一直自报 209（磁盘清单其实是 212）。现在改为读装好的 `whale-overlay-manifest.json` 的 `patch`，磁盘清单、加载指纹、自报版本三者一致。

## 顺带修好的陈旧测试（诚实记录）

- `tests/browse-learning.test.mjs`：仍在断言 212 已取消的"每天只能 @ 一次"（`OWNER_MENTION_LIMIT`）。按 212 的真实语义改为 5 分钟防连点 + 同日可再喊，并保留"账本损坏/并发检查 fail-closed"的断言。
- `tests/bridge-integration.test.mjs`：仍断言"群令牌读主人私聊必须 403"，但 201/210 已按主人要求放开跨场景令牌（目标场景仍须在允许清单内）。改为允许场景 200、未允许场景与假令牌仍 403。
- `tests/bili-context.test.mjs`：切片取到的评论表单代码里已经有 `inspectOutbound`，测试没注入它，自那次改动起一直红。补上绑定。
- 服务器隔离套件里删掉 `plugins/surfcore/scripts/test-feed.mjs` 这一项：该脚本已不在生产树里（562 文件清单和磁盘都没有它），跑不起来不是代码问题。

## 验证

- 本地：新模块单测 + 实际 `comment.mjs` 离线端到端（假网络）通过；`bili-operations`/`bili-context`/`browse-learning`/`language-v3`/`expression-style`/`own-dynamics` 全绿；`runtime` 套件 40 项单独跑通。
- 服务器隔离候选（`/root/whale-ops/patch213/lab`，未动生产）：80 个受管 JS 语法检查；套件 `language 77 · runtime 40 · bridge 43 · bili 5 · ownwork 3 · recall 30`，另跑原 pet 脚本；563 文件清单、89 个受管覆盖逐字节一致；候选与旧清单差异恰好 5 个文件。
- 部署：清窗 27 分钟、无新来信、QQ 在线、桥 PID/cwd 身份核对后，停 dsh → 换 5 个文件 + 清单 → 只对核对过的旧桥发一次 SIGTERM → 起 dsh。安装后自报 `revision 213`，磁盘 563 文件哈希全对，运行时加载的 8 个指纹与磁盘一致，桥 healthy/ready、pending 0。
- **真实验收（一条真评论）**：她自己的视频 `BV1Ybx76qEE9`（《用苹果发布会的方式打开deepseek（鲸鱼娘—也就是我）》，原 0 评论）上发了一条，正文由工具自动补成 `@角屋Bistro 苹果发布会那条是我自己做的，回看还是觉得有点用力过猛`，rpid `319348470801`，`state=0`：
  - `comment-operations.json`：`status=accepted`，`atMentions={"角屋Bistro":"405771812"}`；
  - B 站评论原记录：`content.members=[{角屋Bistro, 405771812}]` —— `@` 是真渲染，不是一段纯文本。
  - 反例：同一工具在别人的视频上 dry 跑，没有补 @、也没有 `at_name_to_mid`（没有误伤普通评论）。
- 目标视频 `BV1Zh486mEwA` 只做了 `--dry`：它 12:49 那条已占「同视频 180 分钟」，15:49 前真发会被硬拦；dry 输出里能看到自动补 @ 与 `at_name_to_mid`，真发用的是另一条自己的投稿。

## 边界与未做

- 「刷到觉得主人会喜欢的」仍然是她自己的判断（提示词写清触发条件 + 原有 `--share` 标尺/额度），代码无法判断"主人会不会喜欢"，这一条没有硬闸门。
- 动态分支（`type=11/17`）有自动认定与单测，但**没有真实发过**一条动态评论；真实证据只覆盖视频。
- 回复（楼中楼）不补 @ 主人：那是回别人，@ 的是对方。此边界未改。
- 未改：人设/语气/日记、分享额度、评论额度、鱼群保护策略、QQ 链路、SnowLuma/NapCat/dsh 服务配置。

## 回滚

`/root/whale-ops/patch213/backup/` 保留了 5 个旧文件和旧清单；把文件与 `whale-overlay-manifest.json` 放回 `/opt/whale-surfcore/staging-c174ed0` 后 `systemctl restart dsh`（旧桥会随守护进程重启）。评论回执账本里的 `atMentions` 是纯附加字段，回滚代码后旧进程读到也不会报错。
