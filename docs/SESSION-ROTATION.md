# DSH 会话换班与记忆保留

2026-10-24 检查时，鲸鱼娘的目标 DSH 会话已有 905 轮、约 3.6 MB 压缩日志；最近一轮读取约 53 万 token 缓存上下文。仓库和服务器定时任务中没有发现按阈值自动新建会话、迁移 QQ 桥接的实现。`watchdog.sh` 的 `sess-alive` 只在会话失活时重启 DSH，不负责换班。

当天已在同一个 `/root/dsh-workspace` 工作区新建会话，确认读到 `AGENTS.md`、`QQ-DUTY-LOG.md` 和服务器私有的 `SESSION-HANDOFF.md`，再将 `/root/.dsh/qq-bridge-config.json` 的 `目标会话` 切到新会话。切换后 `sess-alive` 为 `ok=true`，QQ `get_login_info` 为 `retcode=0`，服务正常，实际群消息进入新会话。服务器到期提醒原先绑定旧会话，已在新会话重建同样时间和内容的单次任务，并移除旧绑定；当前只保留一条。

## 记忆分层

- `AGENTS.md` 保存行为规则；`QQ-DUTY-LOG.md` 保存经整理的长期人物与事件记忆；`SESSION-HANDOFF.md` 保存最近换班摘要，涉及私人内容，不提交公开仓库。
- `/opt/qq-cs/memory/*.jsonl` 保存按半小时抓取的 QQ 群史，由 `memory_query.py` 查询。
- 旧 DSH 会话的原始 `session.v4.jsonl.zstd` 留在服务器，不删除。`/opt/qq-cs/.dsh-archive-session` 每行列出一个旧会话档案路径；用 `node /opt/qq-cs/session_archive_query.js --kw 关键词 --limit 8` 查询旧会话文字消息。无需在每轮对话加载全部历史。
- 摘要与群史抓取不等同于让新模型实时记住旧会话每个细节。遇到具体旧事，先查询原档；检索结果仍需按说话人和时间核对。

## 下次换班

1. 在旧会话里用内部轮更新 `QQ-DUTY-LOG.md` 和 `SESSION-HANDOFF.md`；核对内容，避免把不确定的关系当事实。
2. 将旧会话档案路径追加到 `.dsh-archive-session`，保留原文件。先用 `session_archive_query.js` 验证可检索。
3. 在同一工作区新建会话，要求先读三份交接文件，并在网页完成一次内部验证；先不要改 QQ 桥接。
4. 检查 DSH 自动化任务是否绑定旧会话。按原时间和内容在新会话重建，确认后移除旧绑定，避免重复触发或提醒丢失。
5. 备份桥接配置，更新 `目标会话`；验证 `sess-alive`、QQ 登录状态和一条实际消息的路由。保留旧会话用于审计和查旧账。

长期自动换班仍是待实现项：需要在保证交接、任务迁移和桥接切换均可回滚的前提下设计，不能仅靠一句“上下文将满时开新会话”的提示词。
