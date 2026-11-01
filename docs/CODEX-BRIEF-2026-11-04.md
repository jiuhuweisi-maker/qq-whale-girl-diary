# CODEX 交接 · 2026-11-04 回来先读（你的六案已由值班妈妈代做完毕）

主人 2026-10-31 裁定：你 11-04 才回额度，遗留六案全部由本运维兜底完成（含桥代码），
"先不用管了"是你回来后的第一句话——**不要重复施工，不要回滚本清单内容**，只做复核。

## 六案对账（案号=10-31 你停摆前立案）

| 案 | 落地 | 文件与备份 | 活体验证点 |
|---|---|---|---|
| 1 热聊不重载（SIGTERM秒退撕上下文） | patch145 缓退45s+安静3s落盘 | src/bridge.js.bak145（15106区改造，__busy145 探针在 queued 定义后） | 重启时 bridge.log 出「收到 SIGTERM：缓退模式」「缓退完成（N秒）」；144 watchdog 缓拉 + 人工 SOP（队三零+log无计划唤醒）三层齐 |
| 2 重启桥刷新MCP子进程 | **实锤天然闭环**：ps 亲验 mcp-snowluma-safe 的 ppid=dsh主进程、etime与重启对齐——整体重启必换子进程。**19:5x 勘误**：14:06 触发源不是"插件级热重载"，而是你自己的 autoStartBridge"root=未知"误杀（journal 实证，全天 13:23/14:05/15:06/19:25 四次发作，19:25 那次撕掉一轮私信回合）——已由 patch148 根治：stale 判据不杀不确定态查询 + 启动探针 12s→120s | lib/bridge.js.bak148 + lib/index.js.bak148（插件端，随 dsh 重启生效） | SOP"只 systemctl restart dsh 整重启"保留；观察点：桥抽风时**不该再见 root=未知 强杀**，只应见下轮复查 |
| 3 发送失败落耐久账 | patch145 recordSendFailure145 三处（8341/8533/9116）→state/send-failures.jsonl；runtime 账本区分 failed(certainFail)/uncertain，failed 放行同调用重试、带err摘录 | whale-compat/runtime.mjs.bak145 + 镜像已同步 repo integrations/surfcore/compat/runtime.mjs（commit 912fabb） | state/send-failures.jsonl 出条即证；runtime.test.mjs 30项全绿 + certainFail/timeout 双场景功能回放 |
| 4 给模型的错误文案去误导 | patch145 批量失败文案改诚实指导（"确实没出去，不是频率限制，别向主人错误归因"） | src/bridge.js.bak145（9126区） | 她下次拿到的工具报错应无"频率限制"字样 |
| 5 重启吞话根治 | patch146 唤醒快照组装前兜底：recentMessages 有、modelSeenSeqs 无回执、unread 无的消息一律补回未读（30分钟窗外不追补，走正常 tryAdd+回执通道） | src/bridge.js.bak146（buildWakeSnapshotV2 内 folded 声明前） | bridge.log「[兜底补看] key: N 条」=生效实锤；15:54 型事故下次自愈 |
| 6 自评重要性/手动钉住通道 | patch147 第四类记忆 anchor：append/remove/clear/format 全贯通，st.anchors 不参与24h清理、每次唤醒常驻注入「【你自己钉下的不能忘】」；卡已教她何时钉（"重不重要由她自己分辨"+category=anchor用法） | src/bridge.js.bak147 + src/mcp-snowluma-safe.js.bak147 + persona.md.bak148（卡正文另见.bak147） | 部署后验证：memory-append(category=anchor) → 唤醒 memoryLine 见【你自己钉下的不能忘】→ memory-remove 撤下；她的自然首钉观察 |

注 6：memory-card.js 的情绪正则评分与「达阈永不遗忘」底线**未动**（你的地盘原样保留）；anchor 是加在它之上的"她自评层"，两轨并行不冲突。白名单四副本（append/update/remove/clear）同源加 anchor 是为分类校验一致，update 体（7736区）未加 anchor 专属 extra 字段——anchor 无 extra 语义，如需扩展再说。

## 主人已裁决、你回来不许翻案的事（10-31 晚补）

1. **费用额度已按主人令全放开**：token-budget.json qq/bili cny=0（0=不限，.bak149 原位可退）。这是 10-30"取消每日上限"令的补齐——当时只清了次数闸、钱闸漏改，¥5/日内闸 10-31 19:38 真把主人晾在触顶沉默里 40+ 分钟。readBudget 无缓存热生效。**不要以"防烧钱保险丝"名义恢复 ¥5/¥1**：主人 20:4x 听完七道现行防线+无总量顶的空档陈述后明确拍板"不用了"。
2. **无日总量保险丝=主人知悉并接受的已知空档**（病态上界数百元/日、正常日 1~2 元，用量快照+晨验兜底）。"超警戒线私信提醒"方案也被当面拒绝过。**别替他做主加回来。**
3. 现行防烧七道（单次 4096 token 顶/2分钟苏醒间隔/单轮 8 条/生物钟夜眠/概率长冷却/投递失败退避/主人消息只破间隔不破其余）原样保留，动任何一条先问主人。

## 上线状态与待办（你回来时）

- **20:48 主人令提前整重启 dsh，已全部完成并验收（战报见 bridge-patches.md patch150 节）**：145 缓退首演活体成功（3秒干净落盘退出）；148 插件端上线当晚自证（罩住"插件抢跑拉起→桥卡事件流静默~100秒"的既有竞态——旧 12s 探针今夜必再演误杀环）；147 anchor 端到端首验通过（钉入→注入可见→拔除→零残留，QQ 零动静）；150 自断闸活体加载。GUI token 已随重启轮换（需要时 `journalctl -u dsh | grep -oE "token=[A-Za-z0-9_-]+" | tail -1` 现取）；consoleToken 未变。**新识别竞态留你根治**：插件 activation 早于 webServer bind——正解为 spawn 前等 bind 或桥内 DSH 连接退避等待，二选一由你定，改前对照 patch150 节现场证据；另 7493 区 `notifyOwnerOnError` 是假实现（只打日志不发送），修不修、怎么修听主人，别顺手"补全"出新的外发路径。
- 144 三件（hygiene v108 层/出站清洁计数/watchdog 缓拉）10-31 15:47 已上线已验，见 bridge-patches.md「patch144 补录」。
- **漏洞清零三件套（主人 23:2x 令"全修，包括够不着的；不动性格；不产生新问题"）10-31 深夜完成**：H1 勘误=收件侧本有双班补看（13383 区），20:48 漏捞是 bootstrapSent 安全闸正确拦截+maxAge 超窗的有界取舍，**机制未动**；H2 自断阈值 40→80（direct 私聊 60/h 会误触 40）；H3 **核销151**：uncertain 回单唯一自动清锁路径，**铁律=只有接口实锤（±90s 内查到本人消息）才清锁，查不到永远拦等人工，绝不自动重发**（103 双发血案）——别把它"改进"成自动重发；v2 自纠把窗从 1h 放宽到 12h、probe count 12→40（初版参数下 21:14 遗留条目永不可证=滞留变种，见 bridge-patches 151v2 节教训）。
- **代码容灾镜像（新纪律）**：`integrations/surfcore/live-mirror/`+`compat/` = 活体代码**脱敏**镜像（真实 QQ 号/appid 换语义占位符，服务器真身不动）。每落一次桥端手术，当晚**代码=账本=镜像三同步**同 commit 推送，不同步=镜像过期即漏洞。tests/runtime.test.mjs 直接跑在镜像上，现 **32 组 34 断言**（含 reconcile151 与 fatDecision159 用例——159 用例直接从镜像 NETS 块提取真码跑，镜像漂移会先被测试抓到）。镜像面 11-01 已扩到五件：src/{bridge,memory-card}.js + plugins/surfcore/lib/{memory-card,pet-chat,store}.js；脱敏扫描升级为**任意十位裸号**（路人号/appid 级也拦，真值只进仓库外映射表）。
- 复核清单（只看不改）：①node --check 双文件；②runtime.test.mjs **31 项**；③anchor 已手工端到端验过，剩余观察=她自然钉入的意向（social-v2.json anchors 非测试残留）；④send-failures.jsonl 首批真实条目已裁决完毕（21:14 超时+21:20 待核对=主人私信零漏回，见 23:05 判定节）——后续新条目按"接口实锤→151 自动清/人工看"走；⑤收件侧定性=有界设计取舍非漏洞（H1 勘误），主人消息若命中重启窗口再议；⑥23:37 与 23:46 两次桥重载（主人授权窗口内，145 缓退 3.2s 全绿），当前活体链 145/146/147/148/150(80阈值)/151v2，新桥 pid 1404046。
- 遗留观察项（未解，不算案）：reserved2 计划唤醒不计入旧桥 state"运行回合"盲区——146已把**后果**兜住（吞话自愈），计数口径本身仍是旧兼容层的事，动它前先对照旧host.js→SurfCore 迁移面。

## 回滚（如果你复核发现问题）

按案回退：bridge.js.bak151→147→146→145、runtime.mjs.bak151/bak145、mcp-snowluma-safe.js.bak147、persona.md.bak148/147、token-budget.json.bak150→bak149。
回滚=systemctl restart dsh 整重启（禁止插件级热重载！），重启前走静窗SOP。

——值班妈妈 2026-10-31 16:5x，主人令全兜底+交接防新题。git 链：912fabb（145/146记录）→本篇+147记录。
- **152 后新增两条给你（00:2x）**：①记忆卡生成器不提取"主人纠正X"类事实（案2根因①），建议提取器加纠正识别并把纠正同时写进被纠正的记录本体（就地改写课表类条目）；②dsh 事件流断在中途回合的"外发意图蒸发"变体（案1）——桥侧补救（恢复回合后短时无外发即强制复查）待主人点头，你回来若见主人已允可再做，别抢跑。147/152 锚链路已"过盘+过重载"全验，别动序列化白名单里的 anchors。
- 00:4x 更新：主人拍板"都要修"→153/154/155/156 已上线（见 bridge-patches 详账），三张网=丢发自查/认错钉锚/承诺落dur+定时，**桥侧兜底已完成，别重复造**。151v2 与 152/155 持久化白名单（anchors/promises 两个键）别再动。待你：①宿主事件流断+fetch failed 本根；②（若主人点头）卡提取器识别"主人纠正X"模式。今晚桥重载 00:34/00:41 各一次，之后别再要求重启。
- 01:0x 两单处置（主人令归我）：卡纠正可见性=已修（官方pin双条入永不忘段+157评分加成src已落，**等你下次正常重启dsh web自动带载，rev已戳新，勿手动回退**）；事件流本根仍在 dsh 内部（红线我没动），桥侧153网兜已上线，你顺手时再治本根。memory-card.js 已入 live-mirror（脱敏），改 src/memory-card.js 必同步镜像。
- 换班159 已上线待重载带载（11-01 主人令全自动）：fatDecision159 在 NETS 测试块内、扫描器挂表情库预热锚前、台账 state/rotate159.json、护栏 sid隔离+preset已知+冷却+日cap。live-mirror 已同步（**注意脱敏清单新增路人甲/乙QQ号（真值见仓库外映射表）**），tests 32 项含 159 七场景。别再造轮子；cfg.autoRotate159 可调参。

## 11-01 15:2x 补记 · 你回来时的真实余量（值班妈妈）

- **今晚 14:48 主人令提前四合一，dsh web 已整重启并全部带载**：152→159 现行活体链（157 评分活体 76 分理由含"纠正" ✓；159 首班 14:53:35 双会话退役实锤、台账/归档/零二连全验）。01:0x 节里"等下次重启自动带载"的 157 与"待重载带载"的 159 两条状态**已结**，别再找带载证据。桥活体 pid 见 pgrep src/bridge.js；GUI token 尾段 GxPtJ048。
- **真正还归你的三件**（都不碰 dsh 二进制/容器/人设 CHAT-STYLE）：
  1. **插件 activation 早于 webServer bind 的竞态根治**（20:4x 识别，见上）：正解 spawn 前等 bind 或桥内连接退避，二选一。**新语境**：159 上线后换班依赖 dshPresetIds 非空，重启早期 preset 清单未就绪时换班静默让路（血案护栏）——你修竞态时别把这个静默改"积极"。
  2. **notifyOwnerOnError 假实现**：修不修听主人，别顺手补全出外发路径。
  3. **reserved2 计划唤醒不计入旧桥"运行回合"**的口径盲区：146 已兜住后果，动口径前先对照迁移面。
- 听似留给你的两件其实没了：事件流 fetch failed 本根在 dsh 内部（你我同拦红线，桥侧 146/148/153/156 四网+159 缩面到小会话，够罩了）；卡提取器"主人纠正X"=157 已上线生效。
- 复核清单加一条：⑦ 157/159 生效后 mirror 五件与 tests 32 组是你接手的第一现场，node --check + node --test 跑绿再谈任何新改动。
