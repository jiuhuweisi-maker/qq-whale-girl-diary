# 鲸鱼娘运维 · 接班人须知（codex 专用入口）

你是鲸鱼娘项目的运维接班人。本仓库就是完整交接件：README.md（项目全貌）、docs/SNOWLUMA.md（架构与补丁史）、docs/QQ-RISK.md（风险与案例）、live-backup/AGENTS.md（她的人设卡镜像）、bridge/host.js（线上代码脱敏镜像）。先读这些再动手。

## 现实拓扑（一切以服务器为准，仓库是镜像）
- 线上真身：服务器 `/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js`（仓库 bridge/host.js 是脱敏镜像，**改完镜像不算上线，必须落到服务器**，落地后两边同步推 git）。
- 转发链：QQ群/私聊 → SnowLuma容器(OneBot 3002) → whale-relay(3000,注入token) → 桥(dsh web 3080 内置插件 host.js) → 鲸鱼娘会话 → 回复原路发回。
- systemd 服务：dsh（3080）、whale-relay（3000→3002）、whale-ws。
- 备份规约：改 host.js 前 `cp host.js host.js.bakNN`（NN=patch号），改坏即回滚。

## 凭据与通道
- 真实凭据（服务器IP/密码/各QQ号/群号/HTTP token）在**仓库外**：`C:\Users\ASUS\whale-ops\SECRETS.md`（接班启动时向主人确认此文件路径）。本仓库内全部是 `<服务器IP>` `<她的QQ>` 这类占位符，git 里**永远不许出现真实值**。
- SSH 通道（Windows 侧）：密码经 askpass，每次调用需设三个环境变量：`SSH_ASKPASS=C:\Users\ASUS\AppData\Local\Temp\askpass.bat`、`SSH_ASKPASS_REQUIRE=force`、`DISPLAY=dummy:0`。长脚本走 base64 管道（`ssh ... "echo $b64 | base64 -d > /tmp/x.sh && bash /tmp/x.sh"`），**scp 会挂死别用**，取文件用 `ssh ... "base64 /path" | Out-File -Encoding ascii`。
- 桥状态 API：`POST http://127.0.0.1:3080/dsh-qq-bridge/state?token=$TK`，体 `{}`；TK 从 `journalctl -u dsh | grep -oE "token=[A-Za-z0-9_-]+" | tail -1` 取（**每次重启后必轮换**）。
- OneBot 直连（服务器内）：`http://127.0.0.1:3000/<action>?access_token=<新家HTTP票>`。

## 铁律（主人定的，违反即事故）
1. **PII 零进 git**：提交前全仓扫一遍真实值（IP/密码/群号/全部QQ号/token/10位裸QQ号正则 `(?<![\d.])[23]\d{9}(?![\d.])`），**违例≠0 就断推**（脚本 scripts/mask_gate 同款逻辑，宁可拒推）。
2. **不动底层**：不升级/重装 dsh 本体与 SnowLuma，不改 systemd ExecStart，不 `docker restart snowluma`（容器重启=她断联，主人明令禁止）。
3. **改线上必留痕**：patch 号递增、docs/bridge-patches.md 记条目、host.js 落服务器、镜像同步推 git、重启 dsh 后向主人报告。
4. **对外静默**：她在群里/私聊里绝不提工具/脚本/接口/桥/模型，运维痕迹不外露。
5. 主人（角屋Bistro）是唯一私聊对象；她是群成员不是客服——人设卡（live-backup/AGENTS.md）里那些聊天纪律同样约束她的回复链路，改提示词前先读卡。

## 排障纪律（用血换的，逐条都是真实事故）
- **空 catch 是坟头草**：任何"已修好"必须有活体证据（账本行/心跳文件/探针圈数），不接受"代码看起来对"。
- **A/B 同源对照才许定罪**：怀疑腾讯接口/外部系统前，先用**同一份输入**（文件原文，不许手抄）跑对照。手抄截断 URL 误判"图床鉴权"、凭旧时间戳误判"时钟漂移"都是本仓库真实翻车案例（见 SNOWLUMA.md 勘误）。
- **host.js 是 ESM**（profile type:module）：里面出现 `require(...)` 会当场 ReferenceError 并被自己的空 catch 吞掉——历史上五个 require 死了三张补丁（patch45/47/notify）。写插件侧代码只用已 import 的 `readFileSync/writeFileSync/mkdirSync/existsSync`。
- **每个 fetch 必须带 AbortController 超时**：拉8s、图15s、转发25s保险丝——裸 await 挂起=批次蒸发（patch70 教训）。
- **水位与墓碑咬合**：收消息水位初值 = now-610s 且落盘持久化（patch72），任何水印不许超过墓碑边界。
- dsh 重启 → GUI token 轮换 → 一切用 token 的脚本要重新取。

## 她的心跳与自愈（现行架构）
- 心跳文件 `/opt/qq-cs/.bridge-heartbeat`（每4圈成功拉写一次）；watchdog 每30分钟：心跳窒息>180s→重启 dsh；**但 dsh 活着而会话没载入→只提醒不重启**（patch76）——此时需要人工打开 GUI（14080 隧道页）点她的会话卡片唤醒，或见下条未解项。
- 群消息转发条件：被@（含空@兜底文案必转）或热聊窗口内（常人3分钟/主人10分钟滑窗）；机器人消息不转；01:00-07:00 群消息不入脑；>600s 旧消息按墓碑弃（留"杀69"痕）。

## 会话唤醒（协议已破 2026-10-25 晚，值班妈妈现场抓捕）
- **她的会话没被删除，实体健康**。GUI 里那条"QQ→DSH 收图失败只读诊断"**就是她本人的主会话**（调查时被改名，原"未命名17小时"）——不要再新建诊断会话找她，目标会话 id 只有一个：session-68a2522f...。
- 网关是 **Remote 信封协议，不是 REST**：`POST /api/session/<endpoint>`，鉴权=登录 cookie（GUI token 不通用；curl 裸调 401/404 是假象不是路由不存在），信封体：
  `{"type":"client-request","rpcId":"任意串","method":"session/<endpoint>","payload":{"args":{"_request":{}}}}`
  三条铁则：method 必须与 endpoint 完全相等；args 必含 `_request` 字段；报错会逐步暴露 descriptor 缺什么字段，照补即可。
- 已验可用：`session/list` → 每项含 `title/agentAvailable/running`。**agentAvailable:true ≠ 已载入**——载入发生在**前端打开会话卡片的瞬间**。浏览器代理法：登录后（`/?token=$TK` 打开即带 cookie）POST session/list 拿条目、点对应卡片即唤醒（21:3x 实证：点开→桥探针 sess-alive 转 alive）。
- 死活判定一律用桥探针 `GET /dsh-qq-bridge/sess-alive?token=$TK`，不要猜。

## 未解项（接手后优先）
1. 无浏览器载入 endpoint：上节协议的最后一公里（open/attach/wake 已试过不匹配，别再撞；从 descriptor 注册表方向挖：报错含 endpoint 名的都是真路由，可用同样信封挨个 list 探）。
2. 主人验收项：@她(带文字)30秒内应答——上线后做一次实弹并记账。
3. 连发漂移率复测（基线：8回合3漂，patch68 后应显著下降）；quote 掷骰比例 40%→主人可能想调 25%。
4. `dsh-ops` 残留注册行每启动打一条 skip 警告——主人已裁定**别再动它**（第五次重启不值）。
5. 每日 18:00 日报 cron、48h 换班巡检提醒——确认它们仍在跑。

## 汇报口径（主人要求的风格）
白话、短、诚实。不要表格腔/金句/排比。坏了就认，修好要给活体证据。主人说"查清楚并永久解决"时，答案=根因+机制级防御+复验，缺一不算完。
