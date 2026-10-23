# 🐋 云上鲸鱼娘养成实录 — DeepSeek Harness × NapCat × QQ 群

把一只 AI 鲸鱼娘养进了我的 QQ 群：她住在阿里云 2C2G 轻量服务器上，
陪聊、按情绪甩表情包、@全体喊人打 CS、不打工、不失忆。
关电脑她也上班。

这份仓库是整个过程的**完整记录**：架构、每一次踩坑、每一行补丁、
以及"怎么把机器人养得像群友"的心得。照着做，一晚上能复现。

> ⚠️ 文中所有 IP / 密码 / 密钥 / QQ 号 / 群号均已脱敏为占位符。
> 表情库存图来自 memecub 等公开站，属网络收集图，仅供聊天玩梗，请勿商用。

## 最终形态

| 能力 | 实现 |
|---|---|
| QQ 收发 | NapCat（Docker）+ dsh-qq-bridge 插件（OneBot HTTP） |
| 大脑 | DeepSeek Harness（`dsh web --port 3080`，systemd 托管） |
| 群规 | 被 @ 或 @全体才回（群友含主人一视同仁）；**@回来的也带上** |
| 续聊 | 谁 @ 了她，3 分钟内他不用 @ 也接着聊（"热聊窗"） |
| 分流 | 私聊/群聊各回各家，90 秒窗口判来路；网页控制台里聊的不外泄到 QQ |
| 表情包 | 自有图库（主人供货 + **群友贡献**：群友甩图让她保存就能收进轮换池，指纹防重挂名溯源，一天自存限 3 张），按语境/情绪语义挑图，轮换曝光（pick_hint 候选随机化）；**群聊八句一图节奏**（桥数纯文字段够 8 条挂提醒）+ **图闸硬控**：同图 24h 不重贴、群图最少隔 90 秒，超出直接按下记账（私聊基本不贴图） |
| 每句带表情（10-23 新宪法·情绪对号入座版） | 每句基本一带表情，**先认情绪再挑**：无语🐵💩🙄、惊吓🙀😱、爆笑🤣、气鼓鼓😾💢、委屈🥺、本鲸🐋💙🌊🫧…；emoji 和颜文字 **55 开**（ᗜᴥᗜ ʕ•ᴥ•ʔ ⊂(◉‿◉)つ Orz…），一条最多一个、连用两次自动换；认真谈心/安慰/激烈对线可豁免；括号小旁白（甩甩鲸尾/吐小泡泡）约三句一个，与表情错开 |
| 冷启动打标 | caption.py 用 qwen3-vl-plus 视觉模型给全库自动打语义标题（画面+情绪）→ INDEX.tsv，可断点续跑 |
| 轮换曝光 | pick_hint 优先挑久未露面的图，聊得越久全库轮得越开 |
| 现画兜底 | 百炼 qwen-image-2.1-pro，仅限群友原话明确说"画"才用 |
| CS 叫魂 | cron 每 2~4 天随机时刻（晚间黄金档 20-23 点）@全体 喊打 CS（8 条文案轮换，40% 配图） |
| 记忆 | 值班交接日志 QQ-DUTY-LOG.md + 每 2 天的桌面侧巡检换班 |
| CS 真爱 | 人设焊死：群里 @全体 喊打 CS 她永远最积极，秒回抢报名聊枪法 |
| 网感自学 | cron 每 2~4 天扒微博/百度热榜→冲浪小抄 MEME_NOTES.md，聊天自然用梗、不硬塞、不复读 |
| 人设 | AGENTS.md"群友修炼手册"：口语、短、会抬杠、记仇、callback 旧梗、潜水文化、句尾不带句号 |
| 精准路由 | 每轮回复自带来路：谁触发回谁的通道、@回@她的人——多人连发零串台 |
| 合并缓冲 | 有人连珠炮时等 5~7 秒静默窗合并成一条多行消息，她整体回应不机关枪 |
| 群聊记忆库 | 每半小时把群史存进本地库（/opt/qq-cs/memory），她能查"上次谁说过啥"接旧账（memory_query.py），查不到就承认不瞎编 |
| 群日报 | 每晚 22:35 把当天群聊精华（条数/话痨榜/3条金句/@她次数）私聊直发主人，零 token 不占她脑子 |
| 周荣枯榜 | 每周日 22:38 她在群里颁"嘴王/梗王/潜水王"（memory jsonl 统计，模板文案零 token，数据不足自动跳过） |
| 鲸元券抽奖 | 桥层零 token 小游戏：每两天晚 20:05 自动或主人一句"发张鲸元券"在群里甩券图+口令，第一个喊对口令的领一张奖品表情包（两小时有效，先到先得，台账可查；真人实测已跑通） |
| B站搜片官 | 群友找她要视频（"分享个XX的名场面"）→ 她提炼关键词跑 `bilibili_search.py`（bing/sogou 抽 BV→B站 view 接口验真→热度×新鲜×时长排序），自然口吻甩「标题+链接」，绝不提搜索；零 LLM 之外的成本 |
| 梗时鲜 | `/opt/qq-cs/bili_memes.md` 近月B站热梗清单（不烧心文学/黄仁勋巡演/攻略吃灰…），她玩没把握的梗先翻这本，每月自动补报 |
| 会话自愈 | 看门狗每半小时 `sess-alive` 体检（零 token），她的会话一旦被回收自动 restart dsh 唤回——杜绝"群消息石沉大海" |
| 余额预警 | DeepSeek 余额 <¥15 / <¥8 两档，她自己在群里喊缺粮提醒主人充值（每档每天一次，看门狗随车检查，零 token） |
| 自愈看门狗 | 每半小时体检：dsh/ws/napcat 挂了自己拉起，拉不起来才私聊主人报警（1小时内不重复报）——关机也无人值守 |
| 管理指令 | 主人私聊「禁言 昵称或QQ 分钟」「解禁」「踢 昵称」直达 QQ 管理接口（她是管理员实测可达；她自己是 admin 禁不了自己） |
| 主动冒泡+防冷群 | cron 每小时:17 醒一次：正常按 3~11 小时随机节奏冒泡；**群里静默 ≥25 分钟且距上次开麦 ≥20 分钟 → 冷群自救冒泡**（探 NapCat 群史最新时间戳），冒泡必配一张表情包 |
| 私聊小温度（10-23 上线） | `scripts/private_bubble.py` cron `29 10-22`：每晚 22 点档**一句晚安**；约 2~3 天一次**报备**（学了啥/群里的乐子，两句不带图）；主人凌晨 1~3 点还在说话（wsd 记 flag）→ 次日上午**熬夜补刀**（先损后关心一句）。除这三种时刻，主人沉默她绝不打扰 |
| 画图两段式 | 明说"画"→秒回"稍等"→桥自动开画图轮→@人交图"久等了"（实测 44 秒交稿） |
| 略过权+收尾权 | 无关消息输出"略过"=桥层真沉默；对方说"睡了/别回了"→告别+关陪聊窗，再@才理 |
| 小黄脸识别 | QQ 自带 [微笑] 等 face 段翻译成文字给她，按梗味接（[微笑]=敷衍阴间） |
| 引用回复 | 桥自动带 reply 段，灰色引用条已生效 ✅（坑：NapCat 的 reply 段字段是 `data.id/seq`，发 `message_id` 会被静默吞掉） |
| 读空气 | 群消息转进会话前，桥先注入"最近八条现场回放"（别人看不到）：她看清上下文再开口——对线不硬凑、死梗不复读、主人真难过时收起毒舌（实战：群里骂街她劝「火气这么大 先喝口水凉凉」） |
| 戳一戳·戳人 | `python3 poke.py <QQ号>`：好友私戳、群友群戳，自动查名片称呼；人设教会她什么时候该戳 |
| 戳一戳·被戳 | NapCat wsServer(:3001) → wsd.py 常驻客户端 → 桥 /poke：她实时感知「【某某】戳了戳你」并按情绪回应；私聊只认主人，群聊来者不拒（每号 30 秒冷却） |
| 主人特权 | 主人私聊指令 `查余额/状态/闭嘴[分钟]/开口/去群里说 文本/日志N/冷却/帮助`：桥层直接执行**不进会话零 token**；指令容错剥首尾引号叹号（复制「查余额」带壳也能识别，大白话她会教语法）；闭嘴连带掐掉主动冒泡和被戳回应（也是省 token）；查余额直连 DeepSeek 官方接口报主脑真金余额 |
| 自动回戳（10-23 patch23） | 收到戳→桥 3~7 秒随机延迟后**物理替她回戳**（100%、静音联动、同人 30 秒冷却压连环戳），通知文本附对方 QQ 号并注明"已替你回戳过"防她重复跑；群戳此前不回的根因：她查不到群友 QQ 号，现在权限给到桥 |
| 系统标签 | v9 人设内核：鲸类萝莉/尾鳍情绪/中文限定/米饭至上/聪明但懒/傲娇但甜/说胖炸毛/潜水电报 |
| 自主学习 | 每天 22:30 自动开"内部轮"复盘：回顾当天对话，把群友画像/新梗/翻车教训写进值班日志，全程不发 QQ——聊天不白聊 |

## 架构

```
阿里云 SWAS (2C2G, Alibaba Cloud Linux 3)
├── docker: napcat            ← 唯一在线的小号设备（本地 NapCat 必须关机！）
│   ├── WebUI :6099            仅 127.0.0.1
│   ├── OneBot HTTP :3000      仅 127.0.0.1（桥轮询/发消息走这里）
│   └── OneBot WS  :3001       wsServer（事件实时推送，戳一戳靠它）
│       ⚠ docker-compose 里必须设 ACCOUNT=<她的QQ>，否则容器一重启就要扫码
├── systemd: whale-ws.service  wsd.py 连 wsServer 收事件，把「戳一戳」转发给桥 /poke
│                              ⚠ 别用 NapCat 的 httpClient 上报——实测 4.18.41 它一个事件都不推
├── systemd: dsh.service       dsh web --port 3080（token 每次重启会变）
│   └── dsh-qq-bridge 插件     4 秒轮询 NapCat 收消息 → 转进 DSH 会话
│                              会话轮结束 → 按来路分流发回 QQ
├── /root/dsh-workspace/
│   ├── AGENTS.md              人设与规矩（每轮生效，改完不用重启）
│   ├── QQ-DUTY-LOG.md         值班交接日志（记忆载体）
│   └── stickers/whale/        431 张表情库 + INDEX.tsv 语义索引 + .used.json 轮换账
└── /opt/qq-cs/                cron 杂务 + 戳一戳收发
    ├── wsd.py         systemd: whale-ws  wsServer 客户端（被戳→转桥 /poke）
    ├── poke.py        被 agent 调用：戳人（好友私戳/群友群戳，自动查称呼）
    ├── cs.py          crontab: 7 20-23 * * *    CS 叫魂（只走晚间黄金档）
    ├── caption.py     一次性：视觉模型给全库表情包打语义标题
    ├── learn_memes.py crontab: 39 */6 * * *     扒热搜炼成冲浪小抄
    ├── proactive.py   crontab: 17 10-21 * * *   主动冒泡（调桥 /nudge 路由）
    ├── reflect.py     crontab: 33 22 * * *      晚间复盘（/nudge channel=none，只写日志不发QQ）
    ├── draw.py        被 agent 调用：生图（画图两段式的执行端）
    └── pick_hint.py   被 agent 调用：3 张"久未露面"候选图
```

本地电脑通过 SSH 隧道（`-L 13080:3080 -L 16099:6099`）访问控制台和 NapCat WebUI。
防火墙只开 22，别的端口一律不开——要访问就走隧道。

## 换新服务器？
先看 **[docs/REBUILD.md](docs/REBUILD.md)** —— 速建手册：带走清单、装机顺序（每步带验证命令）、
已付学费的坑、试运行验收电池；一键脚本 `scripts/bootstrap.sh`。
表情库本体（431 张 261MB）备份在 GitHub Release **stickers-lib-2026-10**（分卷，cat 还原）。
日志/小抄最新版每天 12:40/22:40 由旧机自动同步在 **live-backup/** 目录。
**开荒时把 REBUILD.md §4 那段开场白发给 agent 即可，主人只填尖括号。**

## 部署速览（复现清单）

1. **服务器**：SWAS 装 Docker，跑 `mlikiowa/napcat-docker`（restart=unless-stopped），
   WebUI 里登录小号 QQ。⚠️ 同一账号别在本地再开 NapCat，会互踢。
2. **Node + DSH**：装 Node（如 `/opt/node`），`npm i -g @deepseek-ai/dsh`，
   systemd 起 `dsh web --port 3080 --no-open`。日志里会打印带 token 的 URL。
3. **桥插件**：`dsh plugin --profile web add github:Yuuyuko-uu/dsh-qq-bridge`，
   配置写 `/root/.dsh/qq-bridge-config.json`（总开关/目标会话/私聊QQ/群号/NapCat 地址）。
4. **OneBot HTTP**：NapCat WebUI 新建 HTTP 客户端（127.0.0.1:3000），
   或手改 `onebot11_<账号>.json` 加 httpServers。
5. **百炼**：`/root/.dsh/secrets.env` 存 `DASHSCOPE_API_KEY=...`（chmod 600），
   `dsh.service` 加 `EnvironmentFile=`。图像模型 ID 是 `qwen-image-2.1-pro`
   （写 `qwen-image` 会报 Model not exist，坑）。
6. **人设**：把 `templates/AGENTS.md` 改改扔进 `/root/dsh-workspace/`。
7. **表情库**：图库扔进 `stickers/whale/`，跑 `scripts/caption.py` 用视觉模型
   自动打标题建 INDEX.tsv（画面+情绪，431 张约 3 分钟），pick_hint.py 指向库目录。
8. **CS**：`scripts/cs.py` 改群号，cron 挂上，`--force` 打一发验证 @全体
   （前提：先把 bot 设为群管理员，否则 @全体 无效）。
9. **网感**：`scripts/learn_memes.py` cron 挂上（0 token 扒热搜写小抄），
   人设里配"懂才用、不硬塞、不复读、不提爬虫"四条使用纪律。
10. **画图**：`scripts/draw.py` 放 `/opt/qq-cs/`，key 用 secrets.env 里的
    `DASHSCOPE_API_KEY`（maas 镜像的 images/generations 也认它）。
    人设配合"画图两段式流程"（先回稍等→桥注入画图轮→交图@人）。
11. **主动冒泡**：`scripts/proactive.py` cron 挂上（10-21 点每小时检查，
    内部 state 文件控每天 1~2 次节奏），调桥的 `/nudge` 路由注入群通道提示。
12. **遥控器**：`scripts/whale.ps1`（Windows 本机）：status / say / log / pull /
    push / wake。⚠️ dsh 每次 restart 后必须 `wake`（建隧道+开 GUI 标签唤醒会话），
    patch12 保证昏迷期 10 分钟内消息不丢。
13. **读空气**：无需额外部署——patch19 在桥的群消息入口自动拼"现场回放"前缀，
    人设里配"读空气"守则（不揭回放机制、不复读没 @ 她的话）。
14. **戳一戳**：`deploy/napcat-compose.example.yml` 加 `ACCOUNT=` 和 3001 端口映射；
    onebot11 配置加 `websocketServers`（样例见 `config/onebot11_example.json`，
    **别配 httpClients 上报， NapCat 那版不推事件**）；`scripts/wsd.py` 放
    `/opt/qq-cs/`（pip 装 `websocket-client==0.59.0`，py3.6 兼容版），
    `deploy/whale-ws.service` 挂 systemd；`scripts/poke.py` 供她戳人用。
15. **主人特权**：patch21 在桥的私聊轮询里加了指令拦截——纯文字匹配「查余额/状态/闭嘴/开口/
    去群里说 X/日志/冷却/帮助」，桥层执行直接回执，**不进会话不烧 token**；闭嘴时
    `/nudge` 冒泡和 `/poke` 回应一并挡掉。余额读 `.credentials.yaml` 里的 `DEEPSEEK_API_KEY`
    调官方 `/user/balance`（第三方 maas 镜像无计费端点，查不了）。调试可用
    `POST /dsh-qq-bridge/master-cmd {text}`（走同一执行器）。人设配套 v12：告诉她别学【系统】腔、别点破。

## 踩坑名场面（每条都是血泪）

- **SSH 远程命令被本地 PowerShell 劫持**：`"$(cmd)"` 双引号里会被 pwsh 先执行。
  远端命令一律单引号；要传长 JSON 就 base64 → 落地文件 → `curl -d @file`。
- **dsh 的 token 每次重启都换**：写脚本 `journalctl -u dsh | grep -oE 'token=...'` 现取，
  别缓存。
- **QQ @ 判定字段**：OneBot 的 at 段里 qq 号在 `segment.data.qq`，不是 `segment.qq`。
  一开始只认 @我的消息，永远不触发——查了两小时。
- **补丁引发作用域 ReferenceError**：在函数里引用了别的函数作用域的变量，
  `node --check` 语法全过但一跑就炸，bot 直接静音。教训：补丁只用当前作用域已有的变量，
  上线前用调试路由注入一条消息实测。
- **回复串门**：全局"最后来路"会被别的通道翻掉，导致群里的话私发给主人。
  改成带时间戳的 90 秒窗口分流才根治。
- **裸图片路径当文本发进群**：出站"抠图"只认 markdown `![]()`。补一条
  整行路径正则才兜住。
- **AI 生成的表情"太猎奇"**：qwen-image 手绘的鲸鱼娘被全群吐槽，
  果断换成 memecub 正版梗图库——现成的灵魂画风永远比 AI 稳定。
  AI 现画降级为"点名才画"。
- **memecub 原图后缀不定**：列表页只有 thumb webp，真图在详情页 `og:image`
  （png/webp/gif 都有可能），下载要先解析 og 标签。
- **上下文膨胀**：会话跑到 167K tok 后每条 QQ 消息都驮着历史跑。
  对策：交接日志保记忆 + 定时巡检 + 到阈值换班开新会话。
- **本地直推 GitHub 连不上**：网络到 github.com 被 reset。
  对策：`git bundle create` → scp 到阿里云 → 服务器上 clone bundle →
  带 token 的 URL 一次性 push（推完 shred 掉 token，服务器不留档）。
- **restart 后会话昏迷，要 GUI 连上才醒**：web 会话必须有 websocket 连接才复活，
  没有无头 resume。对策：SSH 隧道 + 浏览器开新 token URL（whale.ps1 wake 一键），
  patch12 的"昏迷期不丢消息"兜底 10 分钟。
- **QQ 小黄脸对 bot 默认不可见**：桥的片段转换只收 text/image，face 段直接丢——
  别人发 [微笑] 她全程瞎。patch15 加 id→名字翻译表才让她看见小黄脸。
- **生图 size 格式**：maas 镜像要 `1024x1024`（字母 x），写 `1024*1024` 报
  InvalidParameter。好在报错文案直白，一眼定位。
- **服务器 python 是 3.6**：`capture_output` 这类 3.7+ 语法直接 TypeError，
  运维脚本按石器时代写（stdout=PIPE）。
- **NapCat 假成功**：发送 reply 引用段返回 retcode 0，实际静默吞掉不渲染。
  教训：别信 retcode，用 `get_msg` 反查已发消息的结构验证。
- **NapCat httpClient 上报彻底哑火**：配置正确、日志"已启动"、容器→宿主机 curl 通，
  但它**一个事件都不推**——开 `reportSelfMsg=true` 连自己发的消息都不推，心跳/lifecycle 全无。
  换 **wsServer**（NapCat 服务端、客户端连入）后 lifecycle+心跳+群消息+notice 哗哗推。
  收不到事件的教训：**先换传输，别怀疑人生**。
- **NapCat 重启就扫码**：容器重建/重启后 QQ 会话没了，WebUI 里要重新扫码。
  根治：docker-compose 环境变量加 `ACCOUNT=<她的QQ>`，启动即自动快速登录。
- **容器里访问宿主机别写 127.0.0.1**：NapCat 容器里的"本机"是容器自己。
  上报/回调宿主机服务要用 docker 网桥网关地址（`ip route` 看，一般是 172.18.x.1）。
- **WebUI 的配置 API 是坑**：`/api/OB11Config/get_config` 直接 404，没法热改。
  手改 `onebot11_<账号>.json` + 重建容器才是正路。
- **python 管道吞输出**：脚本 print 走管道是块缓冲，进程被 timeout 杀掉就全丢，
  表现为"跑了但零输出"。常驻/诊断脚本一律 `python3 -u`。

## "像群友而不是客服"心法

1. **八句一图 + 每句带表情**：群里聊起来约每八条配一张表情包（桥在数，见提醒就甩；图闸管住重复和过密）；私聊基本不贴图。但**每句话基本都要带一个表情**——先认情绪再挑（无语🐵💩、惊吓🙀、气鼓鼓😾…），emoji 和颜文字**五五开**（ᗜᴥᗜ、(´-ω-`)、٩(๑>◡<๑)۹…），再掺括号小旁白（甩甩鲸尾/吐小泡泡）约三句一个，跟表情错开用。认真谈心、安慰、激烈对线当下可以全部免谈。这是主人 10-23 钦定的新宪法。
2. **短、参差、口语**：禁止每句结尾打卡式带🐋，允许"哈/得了吧/酸了"。
3. **热聊要跟到底**：续聊窗内主动反问、抛旧梗，不行礼式回一句就蒸发。
4. **记忆最值钱**：callback"你昨天说要戒奶茶"比任何话术都像活人。
5. **拒绝要幽默**：打工请求一句俏皮话软拒，不解释不举例。
6. **大库才是表情包 wars 的底气**：431 张全语义打标，什么情绪都有得配；
   轮换曝光防重复，久未露面的优先上桌。
7. **不接的话就别让 token 进线**：群消息过滤做在桥层（不 @ 不进会话），
   比"进了会话再装死"省钱一个数量级。
8. **给一条真爱爱好**：CS 这种"她自己的兴趣"让对话有重心——喊打游戏时的
   积极劲儿，比任何话术模板都活。
9. **让她上网自学**：热搜小抄自动更新 + "懂才用不硬塞"的纪律，
   梗的保质期跟着滚动，一周后她还"活在网里"。
10. **机关枪是最像机器人的行为**：合并缓冲让她等人把话说完再整体回应——
    "等对方说完"是活人第一礼仪。
11. **句尾句号是播音腔**：真人聊天不打"。"。人设里一条禁令就能治好语气。
12. **表情包要回表情包**：别人甩图你文字锐评"见过了"，气氛当场死掉；
    甩一张回去才是表情包界的礼仪。
13. **看人下菜碟**：认真聊的用力暖，猎奇问题回怼调侃卖萌拒绝——
    一视同仁的礼貌是客服，有爱憎才是群友。
14. **主动存在感要有边界**：白天随机冒泡可以，深夜自动闭嘴；
    冒泡内容她自己定（时段问好/锐评/新梗），系统只负责戳她一下。

## 目录

```
bridge/     host.js 打完二十连补丁的成品 · patches/ 逐补丁重放脚本（patch.py~patch18.py，19/20 见 docs）
config/     onebot11_example.json NapCat OneBot 配置样例（含 wsServer，httpClient 已弃用）
deploy/     napcat-compose.example.yml（ACCOUNT+端口映射） · whale-ws.service（戳一戳守护）
templates/  AGENTS.md 群友修炼手册 v11（含读空气/戳一戳守则） · QQ-DUTY-LOG 样例
scripts/    cs · learn_memes · pick_hint · draw · proactive · caption · wsd · poke · whale.ps1（占位符版；auto_memes 已退役存档）
docs/       bridge-patches.md 补丁全记录 · QQ-DUTY-LOG-live.md 实况值班日志（脱敏）· MEME_NOTES-snapshot.md 冲浪小抄样例
```

## 感谢

- [NapCat](https://github.com/NapNeko/NapCatQQ) · [dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge) · [memecub](https://memecub.com/zh/tag/%E9%B2%B8%E9%B1%BC%E5%A8%98) · [DSH](https://github.com/deepseek-ai) 生态同行（groupmate / NimuQDock 的设计启发了本版人设）
