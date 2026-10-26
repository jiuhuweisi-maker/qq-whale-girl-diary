# 接班完全运行手册（codex 专递 · 打码版）

> 读者假设：你能读到仓库外的 `C:\Users\ASUS\whale-ops\SECRETS.md`（所有真值在那，本文件只写方法与占位符）。
> 开工顺序：先本文件 → AGENTS.md（接班人须知/红线/血案纪律）→ docs/SNOWLUMA.md（架构+补丁史）→ 有不懂的按 patch 号查 docs/bridge-patches.md。

## 0. 开工三连（每次上班先跑，10 分钟内判完健康）
1. SSH 上服务器（askpass 三环境变量 + 长脚本 base64 管道，见 SECRETS.md"服务器"节；**密码永远不进命令行**——里面的 `@`/`#` 会被转义吃掉，报 Permission denied 不是密码错）。
2. 在线判定：`curl -s -X POST http://127.0.0.1:3000/get_login_info -H 'content-type: application/json' -d '{}'` → `retcode=0` 在线。心跳：`cat /opt/qq-cs/.bridge-heartbeat`（毫秒时间戳，跟 `date +%s%3N` 差 <60s 为鲜）。会话：取 TK（`journalctl -u dsh | grep -oE "token=[A-Za-z0-9_-]+" | tail -1`）→ `curl "http://127.0.0.1:3080/dsh-qq-bridge/sess-alive?token=$TK"` → alive。
3. 账本扫尾：`POST /dsh-qq-bridge/state?token=$TK` 体 `{}`，看「日志」键尾部有无红字（滤掉系统串话/🧹 摘除是好事，见 🚨/报警要跟进）。

## 1. 她"掉线"的正确处置（三步，多数时候一步就到头）
1. get_login_info retcode=0 → **没掉线，收工**。别建隧道、别开远程桌面、别重登——10-26 有接班人对着在线的她跑了整条重登流程，白忙。
2. 真掉线（有 Kicked/offline 实证）→ **什么都不做**：服务器 guard 每 2 分钟巡检、每 15 分钟自动容器内进程级重登（supervisorctl 级），900 秒冷却无限重试。盯 /opt/qq-cs/snowluma_guard.log 等它。
3. guard 连试多轮不成（>1 小时）→ noVNC 人工：浏览器直接开 `http://<服务器IP>:6081/vnc.html?autoconnect=true`（**公网直连，不需要 SSH 隧道**），密码在 SECRETS.md，进桌面登 QQ（可能要手机配合滑块，找主人）。
- 红线：绝不 `docker restart snowluma`（她断联）；401/403 是票问题不是掉线，别动 QQ 进程。

## 2. 改桥代码（host.js）标准循环
1. `cp host.js host.js.bakNN`（NN=下一个 patch 号，查 docs/bridge-patches.md 尾部）。
2. python 锚点替换式修改（每个锚 assert 出现次数==1），改完 `node --check`。
3. `systemctl restart dsh` → 等 40 秒 → **TK 已轮换，重取** → sess-alive 常报 dead → `python3 /opt/qq-cs/wake_dsh_session.py`（看到 SESSION_WAKE_SUCCESS=True）→ 再验 alive。
4. 行为验证：改过滤器就用 `POST /dsh-qq-bridge/parse-test` **拿线上漏发/误拦的原文回放**，自造例子不算数；改完没跑实例验证不许写"已修"。
5. 镜像同步：把线上文件 base64 拉回，写 bridge/host.js，全仓打码闸扫描（裸 10 位数字正则），违例=0 才许 push。

## 3. 改人设卡（AGENTS.md on 服务器）
- 直接改文件，**不用重启**——换班/会话重载自然生效；已载入会话用的还是开头旧卡。
- 改前先通读，**卡内"矛盾"多是版本错序**，后来者往往是主人逐案钦点，别当违规剪掉。
- 新口径落卡要在文字里带上"主人钦定+日期"，防止日后被当野生规则改掉。
- 同步 live-backup/AGENTS.md 镜像（PAIRS 打码：真实QQ号/IP 全换 <占位符>，再跑裸号正则）。

## 4. 判断与定罪纪律（血案浓缩，全文见 AGENTS.md 排障纪律节）
- **"她说了什么/发出去什么"只认腾讯接口记录**（get_group_msg_history / get_friend_msg_history）。桥账本的「✅ 已发到 QQ」行印的是**过滤前原文**——10-26 值班妈妈两次拿它当外发实锤，两次被接口翻案。
- 怀疑外部系统前先 A/B 同源对照（文件原文喂两边，不许手抄）。
- 空 catch 是坟头草：任何"已修好"必须有活体证据（账本行/心跳/探针/接口记录）。
- 注入给她的内部任务别用固定台词（"回我OK"会被她学去对外说）；注入后盯「🧹 摘除」「内部轮…不发 QQ」行。

## 5. 日常节奏（现状，别和旧文档对表）
- 心跳：桥每 ~32 秒写；watchdog 每小时 17/47 分巡检；guard 每 2 分钟。
- 唤脑 keep_brain：奇偶小时的 :03 起隔 2 小时一轮（channel none 内部轮）。
- 主动冒泡 proactive：随机相位注入，**cron 分钟不许钉死**（固定分钟=行为指纹）。
- 22:35 日报、凌晨 01:00-07:00 群话不入脑（深夜静默，三点秒回才是 bot 铁证）。

## 6. 交接确认清单（主人宣布你接班时，逐条打勾回话）
- [ ] 我能独立 SSH 上服务器（askpass 法，密码不进命令行）
- [ ] 我跑过开工三连并拿到一次全绿
- [ ] 我知道三步恢复流程、不会手痒重登在线的 QQ
- [ ] 我知道红线：不 docker restart、不动底层、不合并 fix/snowluma-observe-only（已删，别复原）
- [ ] 我知道 PII 零进 git（含账本截图/文档），违例≠0 断推
- [ ] 我知道改代码循环：备份→锚点改→node check→restart→重取TK→唤醒→接口回放验证→镜像同步→闸→push→报主人
- [ ] 我读过 docs/bridge-patches.md 最近十条（patch89-99）知道现在线上什么行为为什么这样
