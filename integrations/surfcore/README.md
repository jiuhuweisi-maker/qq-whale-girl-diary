# 鲸戒的 SurfCore 适配层（198）

固定官方 SurfCore 0.8.8，提交由 `version.mjs` 统一指定。这里包含可复现的完整适配覆盖层，不包含私人角色、聊天、记忆、凭据或收藏。新装从[部署说明](../../docs/DEPLOY-SURFCORE.md)开始。

`build.mjs`在写入前校验504个固定上游文件，应用现行覆盖层，生成536文件哈希清单。目标须为全新固定源码目录，不能覆盖已有配置、运行目录或账本。先构建适配的package/lock，再按该lock安装依赖；见部署脚本。不安装桌宠或语音包。

```powershell
node integrations/surfcore/build.mjs <全新固定源码目录>
node integrations/surfcore/tests/runtime.test.mjs
node integrations/surfcore/tests/bridge-integration.test.mjs <已构建的源码目录>
node --test integrations/surfcore/tests/personal-journal.test.mjs integrations/surfcore/tests/journal-ranking.test.mjs integrations/surfcore/tests/legacy-reader-payload.test.mjs integrations/surfcore/tests/session-timing.test.mjs
```

收发关联原生`sessionId + callId`和耐久账本，超时结果不明时不盲重发；持续恢复失败收件，保留主人权限、叫停与群私边界。QQ/B站共用日记，按来源和时间回想，私密内容不在群或评论区转述。189去除检索结果的重复正文，话题查询优先当前人物和会话，分页冻结检索范围；按日浏览维持原规则。

自动兼容更新采用官方源、三方合并、依赖/权限检查、隔离测试和空闲部署；冲突保留现版。设置页原版直接覆盖已保护，检查更新仍可用。不能绕开适配层直接覆盖运行源码。

验证范围见[198短句确认与群发回执](../../docs/PATCH198-OWNER-FOLLOWUP-CONFIRMATION-2026-11-04.md)、[197自然私信交接](../../docs/PATCH197-NATURAL-OWNER-REQUESTS-2026-11-04.md)、[195三处双向换场](../../docs/PATCH195-CROSS-PLATFORM-SCENES-2026-11-04.md)、[194换场意图](../../docs/PATCH194-SCENE-INTENT-2026-11-04.md)、[193自主换场与群近况](../../docs/PATCH193-SELF-WAKE-AND-GROUP-CONTEXT-2026-11-04.md)、[192换场群号](../../docs/PATCH192-SCENE-GROUP-ID-2026-11-04.md)、[191换场](../../docs/PATCH191-SCENE-SWITCH-2026-11-04.md)、[190日常看图](../../docs/PATCH190-CHAT-IMAGE-2026-11-04.md)、[189说明](../../docs/PATCH189-MEMORY-AND-TIMING-2026-11-03.md)、[188收件恢复](../../docs/PATCH188-INTAKE-RECOVERY-2026-11-03.md)及[187完整升级](../../docs/PATCH187-CLOSEOUT-2026-11-03.md)。长期聊天自然度和未来事件须实际观察。基金模拟验收仍暂停，不自动重放不明订单。

历史说明保存在[归档](../../archive/2026-11-03/surfcore-readme-before189.md)，旧版本、旧拓扑和旧“待办”不作为当前部署入口。
