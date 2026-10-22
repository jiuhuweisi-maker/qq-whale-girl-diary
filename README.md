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
| 续聊 | 谁 @ 了她，5 分钟内他不用 @ 也接着聊（"热聊窗"） |
| 分流 | 私聊/群聊各回各家，90 秒窗口判来路；网页控制台里聊的不外泄到 QQ |
| 表情包 | memecub 正版鲸鱼娘图库 30+ 张，情绪挑图，轮换曝光 |
| 自动进货 | cron 每 2~4 天随机时刻从 memecub 抓 1~3 张新图入台账（0 token） |
| 冷藏机制 | 新图入库不吆喝，冷藏几天后在聊天里自然冒出来 |
| 现画兜底 | 百炼 qwen-image-2.1-pro，仅限群友原话明确说"画"才用 |
| CS 叫魂 | cron 每 2~4 天随机时刻 @全体 喊打 CS（8 条文案轮换，40% 配图） |
| 记忆 | 值班交接日志 QQ-DUTY-LOG.md + 每 2 天的桌面侧巡检换班 |
| CS 真爱 | 人设焊死：群里 @全体 喊打 CS 她永远最积极，秒回抢报名聊枪法 |
| 网感自学 | cron 每 2~4 天扒微博/百度热榜→冲浪小抄 MEME_NOTES.md，聊天自然用梗、不硬塞、不复读 |
| 人设 | AGENTS.md"群友修炼手册"：口语、短、会抬杠、记仇、callback 旧梗、潜水文化 |

## 架构

```
阿里云 SWAS (2C2G, Alibaba Cloud Linux 3)
├── docker: napcat            ← 唯一在线的小号设备（本地 NapCat 必须关机！）
│   ├── WebUI :6099            仅 127.0.0.1
│   └── OneBot HTTP :3000      仅 127.0.0.1
├── systemd: dsh.service       dsh web --port 3080（token 每次重启会变）
│   └── dsh-qq-bridge 插件     4 秒轮询 NapCat 收消息 → 转进 DSH 会话
│                              会话轮结束 → 按来路分流发回 QQ
├── /root/dsh-workspace/
│   ├── AGENTS.md              人设与规矩（每轮生效，改完不用重启）
│   ├── QQ-DUTY-LOG.md         值班交接日志（记忆载体）
│   └── stickers/memecub/      表情库 + INDEX.tsv 台账 + .used.json 轮换账
└── /opt/qq-cs/                cron 杂务（CS 叫魂 / 自动进货 / 网感自学 / pick_hint）
    ├── cs.py          crontab: 7 * * * *
    ├── auto_memes.py  crontab: 23 * * * *
    ├── learn_memes.py crontab: 39 */6 * * *   扒热搜炼成冲浪小抄
    └── pick_hint.py   被 agent 调用：3 张"久未露面"候选图
```

本地电脑通过 SSH 隧道（`-L 13080:3080 -L 16099:6099`）访问控制台和 NapCat WebUI。
防火墙只开 22，别的端口一律不开——要访问就走隧道。

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
7. **表情库**：跑 `scripts/auto_memes.py`（--demo 首次建台账），cron 挂上。
8. **CS**：`scripts/cs.py` 改群号，cron 挂上，`--force` 打一发验证 @全体
   （前提：先把 bot 设为群管理员，否则 @全体 无效）。
9. **网感**：`scripts/learn_memes.py` cron 挂上（0 token 扒热搜写小抄），
   人设里配"懂才用、不硬塞、不复读、不提爬虫"四条使用纪律。

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

## "像群友而不是客服"心法

1. **别每条都配图**，约一半配一张就够了，全配是客服。
2. **短、参差、口语**：禁止每句结尾打卡式带🐋，允许"哈/得了吧/酸了"。
3. **热聊要跟到底**：续聊窗内主动反问、抛旧梗，不行礼式回一句就蒸发。
4. **记忆最值钱**：callback"你昨天说要戒奶茶"比任何话术都像活人。
5. **拒绝要幽默**：打工请求一句俏皮话软拒，不解释不举例。
6. **进货别吆喝**：新表情冷藏几天，某天聊天自然甩出来，惊喜感 +1。
7. **不接的话就别让 token 进线**：群消息过滤做在桥层（不 @ 不进会话），
   比"进了会话再装死"省钱一个数量级。
8. **给一条真爱爱好**：CS 这种"她自己的兴趣"让对话有重心——喊打游戏时的
   积极劲儿，比任何话术模板都活。
9. **让她上网自学**：热搜小抄自动更新 + "懂才用不硬塞"的纪律，
   梗的保质期跟着滚动，一周后她还"活在网里"。

## 目录

```
templates/  AGENTS.md 群友修炼手册 · QQ-DUTY-LOG 样例
scripts/    cs.py · auto_memes.py · learn_memes.py · pick_hint.py（占位符版）
docs/       bridge-patches.md dsh-qq-bridge 十连补丁全记录
```

## 感谢

- [NapCat](https://github.com/NapNeko/NapCatQQ) · [dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge) · [memecub](https://memecub.com/zh/tag/%E9%B2%B8%E9%B1%BC%E5%A8%98) · [DSH](https://github.com/deepseek-ai) 生态同行（groupmate / NimuQDock 的设计启发了本版人设）
