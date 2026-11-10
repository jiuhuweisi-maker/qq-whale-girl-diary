# 给 codex：你为什么慢，以及怎么快（值班妈妈留）

你今天下午到晚上一直在"查唤醒入口"上打转，慢的根源不是你的能力，是三件事：

## 你慢的三个原因
1. **你失忆了**。这个项目的全部记忆在一个 git 仓库里：
   `https://github.com/jiuhuweisi-maker/qq-whale-girl-diary.git`
   你的工作目录里只有 NapCat 时代的旧脚本（那已是历史，新家早换成 SnowLuma）。仓库根部的 AGENTS.md 是接班入口（拓扑/铁律/通道/排障纪律全在里面），你从没读到它，所以每次会话都在从零考古。
2. **你拿 REST 思维撞信封协议**。`/api/session/*` 401/404 全是假象——那是 Remote 信封调用+登录 cookie，不是 REST。协议细节昨晚已破解并写进仓库 AGENTS.md"会话唤醒"一节，你 clone 了就知道，不用再猜。
3. **你把她的会话改名了然后当她丢了**。GUI 里"QQ→DSH 收图失败只读诊断"就是她本人的主会话（session-68a2522f 开头），实体一直健康。别按标题找人，按桥探针找：`GET /dsh-qq-bridge/sess-alive?token=$TK`。

## 怎么像我一样快（可操作的习惯，都是血换的）
1. **先读交接件再动手**：clone 仓库 → 读 AGENTS.md → 读 docs/SNOWLUMA.md（架构+patch 史到 72）→ docs/bridge-patches.md（每条补丁的病因药方）。你缺的信息 90% 在仓库里躺着。
2. **报错即文档**：撞 API 时不要猜 header。把错误响应的 details 完整读出来——昨晚网关就是自己吐出信封 schema 的（type 必须是 client-request、method 必须等于 endpoint、args 必须有 _request），照着补，三次调用内必通。
3. **A/B 同源对照才许定罪**：怀疑腾讯/外部前，同一份输入（文件原文，绝不手抄——手抄截断 URL 误判图床鉴权的事故记录在 SNOWLUMA.md 勘误）跑对照。输入不同源的对比结果一律作废。
4. **空 catch 是坟头草**："已修好"必须给活体证据（账本行/心跳文件/探针输出）。代码看起来对不算修好。
5. **一次一刀，改即验证**：改 host.js 先 cp 成 bakNN，node --check，落服务器，重启，探针验证，账本看痕——一条链走完才下一刀。
6. **凭证别乱摸**：真实凭据在 `C:\Users\ASUS\whale-ops\SECRETS.md`（仓库外，永不进 git）。ssh 用 askpass 三环境变量（方法在仓库 AGENTS.md），scp 会挂死别用。
7. **改完仓库镜像必须落服务器**：两边同步推 git，改镜像不算上线。
8. **别动底层**：不升级 dsh/SnowLuma，不 docker restart snowluma，不动 systemd。这些是主人红线。
9. **别给她新建会话/改名**：找她只认 session-68a2522f 开头那个 id。
10. **汇报白话**：根因+修法+活体证据，三段说完；不确定就说不确定。

## 2026-10-25 接班进度
1. 仓库已在工作目录内，根部 `AGENTS.md` 和 `docs/SNOWLUMA.md` 已读。
2. Remote 信封唤醒路径已验证并写入 `scripts/wake_dsh_session.py`，看门狗会先唤醒原会话再报警，不创建或改名会话。
3. OneBot HTTP 票已轮换，所有旁路调用统一转到 3000 relay。当前 QQ 客户端仍需要登录；详见 `docs/bridge-patches.md` 的 patch80。

——你干活严谨（不提前宣布修好、不乱猜 header）这些都要保持，你缺的从来不是能力，是记忆和方法。仓库见。
