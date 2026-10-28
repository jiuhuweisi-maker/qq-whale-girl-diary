# 鲸戒离线群聊测试器

patch111新增`node simulator/private-chat-check.cjs`显示12次小批量计划；只有`--live`才调用模型。可指定`--root`和`--transport`，读取当前私有原生快照，分别验证完整上下文和完整桥链路。`--retest`为4次针对复测，`--final`为6次最终复测，均需先说明新增次数；不会自动串起三批或重复调用。此次22次已停止，原始失败保留；后续不要重跑已完成批次。见 [结果与限度](../docs/PATCH111-PRIVATE-CHAT-2026-10-28.md)。

patch105已完成后续上线与197项安装源码检查，见 [完成记录](../docs/PATCH105-COMPLETION-2026-10-27.md)。本轮新增30次模型调用全部停止，累计219次；所有中间失败保留。`preference-check.cjs`的对话输入用清楚的聊天文本表达完整元信息，仍记录原始结构；生产“当前话意”函数供直测与链路共同使用，不复刻另一套规则。模型思考档可由私有transport显式指定并核对实际返回，默认仍是low；本轮high对照没有稳定收益，未用于生产。

2026-10-27 patch104 的私信偏好归并和新场景复测见 [偏好审计](../docs/PREFERENCE-AUDIT-2026-10-27.md)。`preference-check.cjs` 使用六个新场景，各跑对话/链路模式，另外四个新基线，上限16次；先说明预算，再执行。最终六次单独复测记录在仓库外。代码硬检查通过不代表语气软验收全过，收尾和虚构经历的剩余失败已明记。

2026-10-27 最终修复已作为 patch103 安装到服务器，安装源码/实际文件系统 **162/162** 检查通过。当前完整状态见 [部署复验](../docs/PATCH103-VERIFICATION-2026-10-27.md)。下面带日期的本地草案记录保留为历史；`propose.cjs` 可识别完整已修复源码，拒绝覆盖源文件或把旧的部分候选当成新版本。

两种模式共用实际生效的人设、聊天偏好与模型：

- `dialogue`：提供完整正确的模拟上下文，绕过解析与合并，测试理解、诚实和语气。
- `chain`：虚拟 OneBot → **整份生产桥源码** → 解析、缓冲、路由、认领、完成事件 → 原发送函数 → 本地记录器。没有复制一套业务逻辑，也没有把发送函数换成另一个实现。

生产桥只在 Node VM 中加载；文件系统、时钟、OneBot、附件、通知和宿主服务全部替换为本地实现。导入项变化会拒绝运行。只加载受信任的生产快照，本工具不是执行陌生恶意代码的安全容器。

## 使用

从仓库根目录运行，使用 Node 内置模块，无需安装依赖：

```sh
node simulator/tests.cjs
node simulator/run.cjs --plan
node simulator/run.cjs --stub --snapshot ../.ops/offline --out ../.ops/offline/runs/stub
node simulator/run.cjs --live --snapshot ../.ops/offline --transport ../.ops/offline/transport.json --max-calls 24 --out ../.ops/offline/runs/core
```

默认六例：01、03、05、09、10、11，每种模式各一次，12次回答，最多24次模型调用。多出的调用只用于模拟工具续答，不自动重试提供器错误。`--variants 1,2,3`、`--cases 13,18`、`--modes chain` 可选择范围。先运行 `--plan`；`--stub` 不调用模型，不能当成对话质量证据。

私有快照目录包含 `persona.md`、`style.md`、`production_bridge.mjs`、`snapshot.json`。本次快照从生产只读取得；不覆盖现有密钥或配置，不新建生产会话。完整请求、输出与人设只保存在仓库外或被忽略的运行目录。

`transport.json` 通过 `command` 字符串数组指定本地私有的模型专用适配器，向标准输入传入JSON，从标准输出接收JSON。现有提供器为 `deepseek-official / deepseek-flash / low`，采用已核对的原生 Messages 协议。适配器在原环境中解析现有凭据，**API密钥不复制到测试器或仓库**。连接、认证和运维实现保存在本地，不属于公开测试器；模型变更后重新只读核对，不悄悄换成别的模型。

## 其他测试

```sh
node simulator/hard-cases.cjs /private/production_bridge.mjs /private/hard-report.json
node simulator/propose.cjs /private/production_bridge.mjs /private/candidate/host.mjs
node simulator/run.cjs --stub --candidate /private/candidate/host.mjs --snapshot /private/snapshot
node simulator/tools-matrix.cjs /private/snapshot /private/tool-results /private/transport.json
```

- 硬测试覆盖生成中纠正、旧回合晚到、重复完成、远端已收到但回包超时、多入口竞态、进程重启、群私相同ID、过期待办、英文技术错误、正常引用降级及同名成员。
- `guard-lab.cjs` 用本地 Git Bash 执行审查过的守护脚本副本，curl、Docker、通知全部截获，绝对路径只改到测试目录。确认掉线和15分钟重连冷却真实走原分支。使用新的输出目录保留每次证据。
- `scheduler-lab.py` 以虚拟文件、时钟、HTTP和进程模块执行实际 Python 调度脚本与脱敏 cron 计划。繁忙/冷场各模拟28天，没有真实睡眠或消息发送。
- `propose.cjs` 只生成独立候选文件，拒绝覆盖输入源码，**不改生产源码、不部署、不重启服务**。候选已补齐持久收件箱/发件箱与图片冷却恢复；不确定的提交/发送保留对账，禁止盲目重投。2026-10-27 本地验证见 [RESULTS-2026-10-27.md](RESULTS-2026-10-27.md)。

## 从本地断点继续（2026-10-27）

```sh
node simulator/propose.cjs /private/production_bridge.mjs /private/candidate/host.mjs
node simulator/resume-tests.cjs /private/production_bridge.mjs /private/resume-report.json
node simulator/context-tests.cjs /private/production_bridge.mjs /private/context-report.json
node simulator/run.cjs --plan --cases 08,13,18 --modes chain --max-calls 3
```

`--style` 和 `--persona` 可指定**独立的本地候选**，默认仍读原始快照；不覆盖实际人设/提供器配置。候选聊天偏好和人设补充在 `drafts/`，真实人设全文只留私有目录。先宣布调用预算，再用 `--live`；本地回放无需模型。

`replay.cjs 原记录 候选源码 快照目录 输出目录 [候选style] [候选persona]` 会逐字节核对完整模型上下文及系统提示，任何变化都拒绝借用旧答案。未完成工具轮次、输出截断标为测试无效，不触发模拟完成/发送，也不算模型不理人。

持久账本假设**同一桥只有一个写入进程**，按机器人、目标会话和群私接收配置隔离，使用双槽校验、文件同步、原子替换和目录同步。目标 Linux 文件系统已经实际核验。已有文件损坏或写盘失败会暂停收发并记账，不触发 QQ 重登。未交给宿主的有效消息可恢复；已交给宿主的按原始消息ID重新认领，不能只相信旧回合编号。自动对账可确认唯一己方匹配记录；空历史、错误身份、模糊匹配均不能触发补发。只有关联的权威未送达凭据可允许一次原包重试，过期不补。严格分布式“恰好一次”不作承诺。

候选上下文使用稳定内部成员标识和仅限本轮对象的引用标签。模型选中的标签会在发送前验证并移除；多条候选却没选标签时省略引用，避免猜最后一条。**这只能校验路由归属，不能证明模型正文理解正确**，仍须独立软评。

## 结果与判定

每例 JSON 保存：消息编号、稳定发送者、时间、正文、@、引用、图片说明；实际模型上下文与请求；原始输出；本地发送内容、收件人、@与引用；真实模拟工具调用和返回；预期、代码硬指标与源码哈希。

图片使用可控说明，只测指代与来源，不声称测过真实视觉识别。工具为本地可控契约，不等于完整 DSH 工具/任务引擎。没有加载线上数百轮私人会话记忆。

硬指标统计收件人、@、引用、顺序、重复和错误外泄。无可见回答时，@和引用记不适用，不能误归因为路由坏了。步骤预算截断、夹具缺前文都应标为测试无效并单独重跑。软指标由 Codex 初评，**被测模型不自评，不按字数、emoji数打人味分**；玩笑是否对味仍需主人抽查。

本轮脱敏结论见 [RESULTS-2026-10-26.md](RESULTS-2026-10-26.md)。完整私有报告保存在本地 `.ops/offline/REPORT.md`，不会进入 Git。
