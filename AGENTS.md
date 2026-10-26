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
- OneBot 旁路脚本统一走 `http://127.0.0.1:3000/<action>`，由 whale-relay 统一注入访问票。票只保存在 SnowLuma 配置、relay 和仓库外凭据清单中，不能复制到每个脚本。
- 轮换 OneBot 票时先同步所有调用方；`401/403` 是鉴权故障，不能据此重启 QQ 客户端（patch80 血案实证：guard 把旧票 401 当掉线重启了容器内 QQ 进程，直接逼主人重新扫码——永远记住重启 QQ 进程=她要重登录）。
- **改任何密码/凭据必须同时：写进仓库外 SECRETS.md + 当面向主人报备。**静默改凭据=次日全体失联（WebUI 密码被改当晚值班妈妈只能走重置流程拿回控制台）。
- SnowLuma WebUI 密码重置法（已验证）：容器内 node 算 `scryptSync(新密码, Buffer.from(salt,'hex'), 64, {N:16384,r:8,p:1})` 十六进制写回 `/app/data/config/webui.json`（salt 换 16 字节随机 hex），再 `docker exec snowluma supervisorctl restart snowluma`。**这是容器内服务进程重启，不算动容器本体（docker start/stop/restart 才是红线）；但重启瞬间 WebUI/OneBot 会断数十秒，别在热聊时段做。**
- WebUI 远程桌面：容器内 supervisor 常驻 x11vnc(display :1)，宿主映射 6081（noVNC http://<服务器IP>:6081/vnc.html），密码与 VNC rfbauth 同源，记在 SECRETS.md。QQ 掉线后重新登录/看广告弹窗都从这里操作。

## 铁律（主人定的，违反即事故）
1. **PII 零进 git**：提交前全仓扫一遍真实值（IP/密码/群号/全部QQ号/token/10位裸QQ号正则 `(?<![\d.])[23]\d{9}(?![\d.])`），**违例≠0 就断推**（脚本 scripts/mask_gate 同款逻辑，宁可拒推）。
2. **不动底层**：不升级/重装 dsh 本体与 SnowLuma，不改 systemd ExecStart，不 `docker restart snowluma`（容器重启=她断联，主人明令禁止）。
3. **改线上必留痕**：patch 号递增、docs/bridge-patches.md 记条目、host.js 落服务器、镜像同步推 git、重启 dsh 后向主人报告。**本地提交攒着不推=工作裸奔**（磁盘一坏全丢）；push 被拒先 `git pull --rebase` 再推，别把 non-fast-forward 当"安全审核拦截"吓住自己。
4. **对外静默**：她在群里/私聊里绝不提工具/脚本/接口/桥/模型，运维痕迹不外露。
5. 主人（角屋Bistro）是唯一私聊对象；她是群成员不是客服——人设卡（live-backup/AGENTS.md）里那些聊天纪律同样约束她的回复链路，改提示词前先读卡。

## 排障纪律（用血换的，逐条都是真实事故）
- **空 catch 是坟头草**：任何"已修好"必须有活体证据（账本行/心跳文件/探针圈数），不接受"代码看起来对"。
- **A/B 同源对照才许定罪**：怀疑腾讯接口/外部系统前，先用**同一份输入**（文件原文，不许手抄）跑对照。手抄截断 URL 误判"图床鉴权"、凭旧时间戳误判"时钟漂移"都是本仓库真实翻车案例（见 SNOWLUMA.md 勘误）。
- **host.js 是 ESM**（profile type:module）：里面出现 `require(...)` 会当场 ReferenceError 并被自己的空 catch 吞掉——历史上五个 require 死了三张补丁（patch45/47/notify）。写插件侧代码只用已 import 的 `readFileSync/writeFileSync/mkdirSync/existsSync`。
- **每个 fetch 必须带 AbortController 超时**：拉8s、图15s、转发25s保险丝——裸 await 挂起=批次蒸发（patch70 教训）。
- **水位与墓碑咬合**：收消息水位初值 = now-610s 且落盘持久化（patch72），任何水印不许超过墓碑边界。
- dsh 重启 → GUI token 轮换 → 一切用 token 的脚本要重新取。
- **SnowLuma 二进制没有安全的"看一眼"模式**：`node /app/runtime/index.mjs --help` 不打印帮助，**会把一整套服务真启动**（抢 3000/3001/5099、和正版实例抢 QQ hook 管道 → EPIPE 风暴 → OneBot 挂死 → 她在线但没人接话，10-26 00:27 事故实锤）。容器内想看什么就 `ss/ps/curl`，永远别手滑跑 `index.mjs` 加任何参数。
- **杀容器里的进程必须 `docker exec snowluma kill`**：宿主机 kill 容器 pid = 静默失败的假杀（10-26 值班妈妈亲手踩坑，"我杀了僵尸"其实僵尸活得好好的，撑到 OneBot 挂死才现形）。杀完必须 `docker exec ps` 复验没了才算。
- **给她的会话注入任务（哪怕写了"不用回QQ"），模型收尾可能吐英文 meta 残渣并粘进下条聊天回复**——10-26 群里的"This request appears to contain nothing that can be improved."即此（patch83 出站过滤兜底，但注任务方仍要自觉：任务注入后盯一眼出站账本有无「🧹 摘除」行）。
- **绝不在她的会话输入框预填草稿不执行**：草稿会静静躺在卡片里，下次谁点发送就是事故（10-26 中午值班妈妈自己埋的，已清）。要驱动她就走信封/桥，别碰输入框。

## 她的心跳与自愈（现行架构）
- 心跳文件 `/opt/qq-cs/.bridge-heartbeat`（每4圈成功拉写一次）；watchdog 每30分钟：心跳窒息>180s→重启 dsh；dsh 活着而会话没载入时，使用 `/opt/qq-cs/wake_dsh_session.py` 的 Remote 信封动作唤醒既有目标会话，不新建会话、不改模型，也不重启 dsh。
- 群消息转发条件：被@（含空@兜底文案必转）或热聊窗口内（常人3分钟/主人10分钟滑窗）；机器人消息不转；01:00-07:00 群消息不入脑；>600s 旧消息按墓碑弃（留"杀69"痕）。

## 会话唤醒（协议已破 2026-10-25 晚，值班妈妈现场抓捕）
- **她的会话没被删除，实体健康**。GUI 里那条"QQ→DSH 收图失败只读诊断"**就是她本人的主会话**（调查时被改名，原"未命名17小时"）——不要再新建诊断会话找她，目标会话 id 只有一个：session-68a2522f...。
- 网关是 **Remote 信封协议，不是 REST**：`POST /api/session/<endpoint>`，鉴权=登录 cookie（GUI token 不通用；curl 裸调 401/404 是假象不是路由不存在），信封体：
  `{"type":"client-request","rpcId":"任意串","method":"session/<endpoint>","payload":{"args":{"_request":{}}}}`
  三条铁则：method 必须与 endpoint 完全相等；args 必含 `_request` 字段；报错会逐步暴露 descriptor 缺什么字段，照补即可。
- 已验可用：`session/list` → 每项含 `title/agentAvailable/running`。`session/selectModel` 会先 `resolveAgent(sessionId)` 再校验 provider/model；传入不存在的 provider/model 会返回 `session/model-unavailable`，但在校验前已载入原会话，且不会写入模型选择。鉴权流程：GET `/?token=$TK` 建立登录 cookie，再 POST Remote 信封到 `/api/session/selectModel`；此端点字段名是 `args.request`（不是 `_request`）。服务器脚本 `/opt/qq-cs/wake_dsh_session.py` 已验证这条路径，先检查原会话 id 前缀，限频后唤醒，再用桥探针确认 `alive`。
- 死活判定一律用桥探针 `GET /dsh-qq-bridge/sess-alive?token=$TK`，不要猜。

## 未解项（接手后优先）
1. ~~QQ 重新登录后验证~~ **已闭环**：10-26 00:43 主人登录并开自动登录，`get_login_info` retcode=0、sess-alive alive、心跳新鲜、出站实证全过（patch81 记录）。
2. 主人验收项：@她(带文字)30秒内应答——须等主人方便时自然验收，不主动往 QQ 发测试消息。
3. 连发漂移率复测（基线：8回合3漂，patch68 后应显著下降）。quote 掷骰 ~~40%→25%~~ **已裁定已上线**（patch82，闲话引用 25%，回@必引不变）。
4. `dsh-ops` 残留注册行每启动打一条 skip 警告——主人已裁定**别再动它**（第五次重启不值）。
5. 22:35 日报 cron 有启动实证（CROND 记录）但送达痕未查到——主人核对 QQ 即可确认；换班巡检已建为值班妈妈会话内定时任务（每两日 9:15/21:15，五步清单），不再是空白。

## 汇报口径（主人要求的风格）
白话、短、诚实。不要表格腔/金句/排比。坏了就认，修好要给活体证据。主人说"查清楚并永久解决"时，答案=根因+机制级防御+复验，缺一不算完。
