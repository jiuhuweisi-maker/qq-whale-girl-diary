# 鲸戒的 SurfCore 适配层（当前部署版184）

上游固定为 [SurfCore 0.6.20](https://github.com/Mieksido/surfcore/tree/c174ed07b7ad5c64654bf3d309dd8cbac1558737)，不跟随自动更新。这里保存可重建的适配代码，不包含上游整库、依赖、凭据、真实人设或聊天记录。

```powershell
node integrations/surfcore/build.mjs <干净的上游源码目录>
node integrations/surfcore/tests/memory-scope.test.mjs
node integrations/surfcore/tests/legacy-control.test.cjs
node integrations/surfcore/tests/runtime.test.mjs
node integrations/surfcore/tests/bridge-integration.test.mjs <已生成适配的上游目录>
node integrations/surfcore/tests/bili-listener.test.mjs <原版或已适配的上游目录>
node --test integrations/surfcore/tests/fundpilot.test.mjs
```

`build.mjs`先验348个固定上游源文件，再覆盖完整现行源码及兼容模块，生成374文件清单；错误基座、已有配置或已构建目录都会停止。旧143锚点构建器已归档至`archive/2026-11-03/deployment143/`。依赖使用上游lockfile；先`npm ci --ignore-scripts`，只运行已审查的SDK补丁。`import-memory.mjs`读取仓库外设置，保留原件与群私范围。新装完整步骤见`docs/DEPLOY-SURFCORE.md`。

普通聊天改走 SurfCore。旧桥保留主人控制、管理指令、健康与原始账本；`聊天后端=surfcore` 时禁止旧聊天发送。主人指令先用 OneBot `get_msg` 核实真实来源，再执行原有去重管理器，模型不能传入任意目标执行踢人或禁言。

新发送与 DSH 原生 `sessionId + callId` 关联，发送前双槽持久化；超时保留不确定状态，不盲重试。收件串行、群私分域、重启去重、叫停 epoch、图片冷却都独立于提示词。记忆注入按会话过滤；群聊不能取得私信索引。

新工具包括旧记忆检索、文本文件读取、原图库检索与发送、按当前明确请求画卡通图。表情、颜文字、小括号与普通英文不按配额删除。桌宠和语音包不安装，语音工具关闭。自动更新关闭，防止上游覆盖适配。

上线状态、未验收部分及 DSH 交接见 `docs/PATCH114-SURFCORE-2026-10-28.md`。不要把离线检查通过说成真实群管理、所有附件格式或自然度已经全部验收。

patch121接入主人私信的FundPilot，复用独立模拟服务与既有账本，不给群聊开放账户权限。patch143已将可复现服务源码纳入`services/fundpilot`，测试默认直接使用它；`FUNDPILOT_SOURCE`仍可覆盖路径以检查实际安装源。自由模拟按明确订单补虚拟资金，支持份数或含费金额预算；实际当前模式和边界见`docs/PATCH143-ELASTIC-PAPER-2026-10-31.md`。旧121的固定本金说明仅作历史。更新MCP源码后还需刷新宿主已有MCP子进程，确保实际工具说明加载。

patch122/123增加基金名称核对、B站字幕学习及共享笔记、生成格式错误的有限续接、按稳定账号加载重要人物关系。操作计划不再混入QQ记忆，群聊不载入私信基金说明。新增检查入口：`node --test integrations/surfcore/tests/{finance-learning,conversation-logic,relationships}.test.mjs`（按终端规则展开文件名）。完成情况及软验收不足见 `docs/PATCH123-LOGIC-RELATIONSHIPS-2026-10-29.md`。

patch125按主人纠正撤销自动课程与每日笔记安排：金融只加入原视频兴趣名单，和异环一样走原feed。原笔记和按需资料工具保留，旧next不再派课。当前设置见 `docs/PATCH125-CASUAL-FINANCE-2026-10-29.md`，不要按122/124历史记录恢复学习任务。

## 活体镜像（live-mirror/）与容灾（2026-10-31 深夜起，主人令"服务器单点=漏洞"）

- `live-mirror/`按实际源码路径保存完整差异覆盖层，入口清单在`release/runtime-files.json`，固定基座指纹在`release/upstream-files.json`；旧平铺镜像已归档。兼容模块仅从`compat/`取现行版本，不再让旧模拟器覆盖它。配置、凭据、人设原文和聊天不随源码发布。
- **纪律**：桥端每落一次手术（145/146/147/150/151…），当晚同步本目录+compat/，与 docs/bridge-patches.md 条目同 commit 推送——三者不同步=镜像过期即漏洞。
- 恢复场景：服务器全损时按 README+本目录+bridge-patches 备份链重建代码面；凭据/人设原文/QQ号仍在仓库外（SECRETS.md），永远不进 git。
