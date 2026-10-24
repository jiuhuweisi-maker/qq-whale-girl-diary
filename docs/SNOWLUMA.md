# 🏠 SnowLuma 新家实录（2026-10-24 乔迁 + 踩坑全集）

> 结论先行：**服务器上跑 SnowLuma 比 NapCat 好，实测为证**——旧家 NapCat 单日被风控踢死 7 次（最后一次装死不回话），
> 且"已登录"状态是缓存谎报；新家 SnowLuma 是 **hook 进真实 QQ 官方客户端进程**，腾讯眼里她就是一个正常登录的 QQ，
> 乔迁后连续在线零踢、群/私聊/图片段/戳一戳全链路兼容，还带 noVNC 远程桌面（扫码可视化）。
> 代价也有：登录只认扫码、**容器绝不能 restart**（见坑②）。

## 部署形态（服务器版）

- 官方镜像 `motricseven7/snowluma:latest`（~1.88G，内含 QQ Linux 客户端 + Xvfb + VNC + noVNC + supervisord + SnowLuma 注入）
- 容器名 `snowluma`，`--restart unless-stopped --shm-size=1g --cap-add=SYS_PTRACE --security-opt seccomp=unconfined`
- 端口重映射避开冷备的旧家：OneBot HTTP/WS 映射到 `3002/3003`（旧家冷备仍占着 3000/3001 的名义位）
- 三个命名卷：snowluma-data / snowluma-config / snowluma-clientdata
- 登录：**只能扫码**，开 noVNC 桌面 → QQ 窗口出二维码 → 手机 QQ 扫。无 CLI/密码登录路径。
- 文档：snowluma.github.io/zh/docs/guide/deploy 与 /quickstart（英文路径 404，用 /zh/）

## 踩坑实录（每一条都是真金白银的教训）

### 坑① 桥带票问题 → patch52「带票」
OneBot 开票后桥老代码拼裸 URL → 1401 unauthorized。解法：配置字段支持 `#token=TOKEN` 片段 + URL 出口统一走带票 helper（片段转正 `?access_token=`）。

### 坑② 容器 restart = 掉票 = 人工重扫（血泪，最贵的坑）
为删一根没用上的 httpClients 管道做了一次 `docker restart snowluma`，重启后日志直接 `awaiting login`——
真实客户端的登录票**扛不住整容器重启**（volume 挂了也没用，疑似会话/设备指纹复位）。
- 规矩：**容器永不 restart**。守夜 guard（2 分钟一班）v2 复活梯子：掉线 → 先自动 `supervisorctl restart qq` 进程级重连（15 分钟一次机会，票可能保住）→ 救不回才企微报警求扫码。**报警之外绝不动手。**

### 坑③ 群消息条目不带 self_id → @判定被 NaN 击穿，整群哑火（patch53）
NapCat 历史条目有 `self_id`，SnowLuma **没有**。`Number(条.self_id)` = NaN 三连爆：
被@判定恒 false（@她 = 没@她）、"在叫别人"判定恒 true（@她的话全被当成叫别人 → 装死）、自回声过滤失效。
现象：群里集体沉默但私聊一切正常，极具迷惑性。解法：`自家号 = 条.self_id 有效值 || 配置.她QQ` 兜底，三处判定统一引用。
**教训：协议换血，凡是"依赖对端字段一定存在"的地方都要重新假设。**

### 坑④ 旁路脚本 8 个硬编码旧端口 + 带票 URL 拼接炸（patch54）
桥不是唯一用户：proactive（晚安/冒泡）、cs、auto_memes、grab_sticker、poke、daily_report、memory_store、kick_watch
全写着旧端口 `127.0.0.1:3000`；而且把带 `?access_token=` 的 URL 塞进配置字段后，老式 `API + "/send_xx"` 拼接会把路径拼进 query，全灭（今晚 22:35 日报本该哑火）。
终解法：**主机跑 3000→3002 无状态中转（whale-relay.service，systemd 常驻）自动补票，配置字段回退裸旧地址**——
新老脚本、桥、日报、晚安、记忆库一次性全活，未来新脚本免疫此坑。硬编码的几处已逐个带票（两条路并存）。
- 附带发现：`get_file / get_image` 等 NapCat 私有工具接口新家不支持（retcode 100）——好在图片段自带官方 CDN url，桥的收图函数本来就有 https 直连分支，收图未瞎。

### 坑⑤ watchdog 每 30 分钟偷偷 `docker restart napcat`
搬家没搬它：旧看门狗发现冷备容器不在跑就 restart——一旦跑起来与新家同账号**互踢**，还乱翻风控熔断旗。
改法：改成"只观察不动手"（snowluma 不在跑 → 报警，绝不 restart）；kick_watch 停用（职责并入 guard v2）。

### 坑⑥ dsh 每次重启换 GUI token → 大脑会话被换票切断
活会话归零，必须立刻用新 token 重开会话页签续命。已成 SOP：重启 → journalctl 抓新票 → 落盘 → 重挂 → 验标题。

## 新旧对比快表

| | NapCat（旧，冷备留存） | SnowLuma（新） |
|---|---|---|
| 本质 | 无头协议模拟客户端 | 真实 QQ 客户端 + 注入钩子 |
| 风控观感 | 第三方异常，单日实测被踢 7 次 | 正常登录用户，乔迁后零踢 |
| 登录态查询 | 谎报"已登录"（假在线装死不回话） | get_login_info 真实可信 |
| 掉线自愈 | passkey 快速登录玄学可用 | 软掉线可进程级重连；硬踢 = 重扫 |
| 重启代价 | 可接受 | **容器重启必扫码（铁律禁止）** |
| 内存 | 轻 | +~350M（新加 2G swap 托底） |
| 附加能力 | webui | noVNC 桌面 + WebUI 管理台（初始密码打完即改） |
| 已知杂音 | — | CHECK_PATCH_UPDATE 拉不到（墙）不影响使用；dbus Inhibit 报错无害 |

回滚路子：配置改回裸旧地址 + `docker start napcat` + restart dsh；旧家全量配置快照 tar 留底。

## 行为层顺手优化（同期）

- 表情宪法改软：**不必每句带表情**——带的前提是情绪对号入座，平铺的话素着就好；pick_hint 候选里没有一张贴当前语境就宁可不贴（硬凑比素着更像 bot）。此前"每句都要"导致高语境场景乱贴。
- 表情管线本体是健康的：久未露面轮换 + 情绪标签索引 + 图闸防重复；死掉的 memecub 网络进货链路（目录不存在、6h 一崩的哑炮）已从 cron 解除。
