# 鲸戒的 SurfCore 适配层（patch114）

上游固定为 [SurfCore 0.6.20](https://github.com/Mieksido/surfcore/tree/c174ed07b7ad5c64654bf3d309dd8cbac1558737)，不跟随自动更新。这里保存可重建的适配代码，不包含上游整库、依赖、凭据、真实人设或聊天记录。

```powershell
node integrations/surfcore/build.mjs <干净的上游源码目录>
node integrations/surfcore/tests/memory-scope.test.mjs
node integrations/surfcore/tests/legacy-control.test.cjs
node integrations/surfcore/tests/runtime.test.mjs
node integrations/surfcore/tests/bridge-integration.test.mjs <已生成适配的上游目录>
node integrations/surfcore/tests/bili-listener.test.mjs <原版或已适配的上游目录>
```

`build.mjs` 遇到锚点漂移或重复安装会停止，不靠模糊替换。依赖使用上游 lockfile；先 `npm ci --ignore-scripts`，只运行已审查的 SDK 补丁。`import-memory.mjs` 读取仓库外 JSON 设置，保留原始文件，生成带来源和群私隔离的索引与活动记忆。`verify-live.mjs` 在服务器只读校验实际安装文件、连接、记忆索引和配置，不生成模型回合、不发 QQ。

普通聊天改走 SurfCore。旧桥保留主人控制、管理指令、健康与原始账本；`聊天后端=surfcore` 时禁止旧聊天发送。主人指令先用 OneBot `get_msg` 核实真实来源，再执行原有去重管理器，模型不能传入任意目标执行踢人或禁言。

新发送与 DSH 原生 `sessionId + callId` 关联，发送前双槽持久化；超时保留不确定状态，不盲重试。收件串行、群私分域、重启去重、叫停 epoch、图片冷却都独立于提示词。记忆注入按会话过滤；群聊不能取得私信索引。

新工具包括旧记忆检索、文本文件读取、原图库检索与发送、按当前明确请求画卡通图。表情、颜文字、小括号与普通英文不按配额删除。桌宠和语音包不安装，语音工具关闭。自动更新关闭，防止上游覆盖适配。

上线状态、未验收部分及 DSH 交接见 `docs/PATCH114-SURFCORE-2026-10-28.md`。不要把离线检查通过说成真实群管理、所有附件格式或自然度已经全部验收。
