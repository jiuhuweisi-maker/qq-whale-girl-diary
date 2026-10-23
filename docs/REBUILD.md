# 新服务器速建手册（REBUILD）

> 目标：**新开一台 Linux 服务器后，让 agent 照着本文一次性重建鲸鱼娘**，
> 全程 90 分钟内、少探索少 token——所有踩过的坑都已写成结论，照抄即可。
> 仓库里没有的东西只有三类：①她的灵魂资产（表情库/日志/小抄）②密钥与真实号码
> ③QQ 号本体。其余全部在 git 里，`bridge/host.js` 就是打完全部补丁的最终态，
> **不要重放 patch1~25，直接覆盖**（patches/ 目录只是考古资料）。

## 0. 从旧机器必须带走的清单
| 资产 | 旧机路径 | 迁移方式 |
|---|---|---|
| 表情库 431 张 + INDEX.tsv + .used.json | /root/dsh-workspace/stickers/whale/ | GitHub Release `stickers-lib-2026-10`（分卷）或老服务器存活时 `rsync -a` 直迁 |
| 值班日志 / 梗小抄 | QQ-DUTY-LOG.md / MEME_NOTES.md | git 里有 live 副本（docs/），新机器从 docs/ 拷出当种子；若旧机还活着优先 rsync 最新 |
| 人设 AGENTS.md | /root/dsh-workspace/ | 仓库 templates/ 即最新（每次改动都同步过） |
| DeepSeek 主脑密钥 + 镜像站 key | /root/.dsh/.credentials.yaml | **不在 git**。主人手里要一份，新机器原样填 |
| 桥配置 | /root/.dsh/qq-bridge-config.json | 含真实号码，仓库 config/ 有模板；旧机 rsync 最省事 |
| NapCat onebot11 配置 | /root/.napcat/onebot11_<她的QQ>.json | 仓库 config/onebot11_example.json 改号即用 |
| cron 五条 | crontab -l | 仓库 deploy/crontab.example，装完脚本后 `crontab` 挂上 |

## 1. 装机顺序（每步都有验证，验证不过不前进）
1. **Docker + NapCat**：用 `deploy/napcat-compose.example.yml`（env 填她的 QQ 号做
   ACCOUNT 自动快速登录）。起容器后验证：
   `curl -s http://127.0.0.1:3000/get_login_info -d '{}' -H 'content-type: application/json'` → retcode 0。
   **铁律：事件通道用 wsServer（NapCat 开 0.0.0.0:3001），HTTP 上报 httpClient 在此版本 0 事件，别再试。**
2. **NapCat onebot11 配置**：按 example 改号；`websocketServers` 用数组格式开 3001；
   容器 `docker update --restart=always napcat`。
3. **DSH**：装好后 `dsh plugin --profile web add dsh-qq-bridge`，然后**用仓库
   bridge/host.js 直接覆盖**插件的 lib/host.js，`node --check` 通过再启 dsh：
   `dsh web --port 3080`（systemd unit 见 deploy/；token 每次重启变，取法：
   `journalctl -u dsh | grep -oE 'token=[A-Za-z0-9_-]+' | tail -1`）。
4. **脚本落位** `scripts/*.py` → /opt/qq-cs/（python3.6 兼容是硬约束：**无 walrus、无
   subprocess.run(capture_output)**），依赖 `pip3 install websocket-client`。
   一键可用：`bash scripts/bootstrap.sh`（见文末占位符说明）。
5. **wsd 常驻**：`deploy/whale-ws.service` → systemd，enable 并启动，
   `/tmp/wsd-last.txt` 出现"已连上 wsServer"才算活。
6. **配置与密钥**：credentials.yaml、qq-bridge-config.json 按模板填真值。
   `/root/dsh-workspace` 放 AGENTS.md 与日志小抄种子。
7. **crontab** 五条（deploy/crontab.example）：学梗 39 */6、冒泡 17 10-21、
   CS 7 20-23、复盘 33 22、私聊温度 29 10-22。
8. **试运行验收（零噪音，必做）**：config 里 `试运行:true`（POST /save 可改），
   跑一遍验证电池：/state 心跳、群里 @ 她、私聊发「帮助」「查余额」（【系统】回执秒回）、
   桥 /poke 模拟、图闸看账本。**全过之后把试运行改回 false**——这是唯一不骚扰群友的验证姿势。

## 2. 已付过学费的坑（照抄即可，勿再探索）
- agent 侧 pwsh 远程执行：**含中文/JSON/`$()` 的负载一律 base64 传文件再 bash 跑**，
  引号内 `$()` 会被 pwsh 本地展开。
- QQ 号字段：NapCat 群成员列表是 `user_id`（不是 uin）；戳一戳事件只走 wsServer。
- 表情选择必须走 pick_hint 本轮候选——图闸（24h 重图/90s 密图）会拦照抄记忆的旧图。
- 主人指令只在**私聊纯文本严格匹配**（首尾引号叹号会被剥），自然语言不进指令层。
- 私聊轮只认主人号、群聊自指过滤——所以不会有循环风险。
- GitHub 从阿里云直连经常抽（本地也一样）：**git 备份走 bundle→scp→服务器中转 push**，
  表情库这种大资产走 Release 分卷（split -b 65m，`cat` 还原）。
- 查余额 API：`GET https://api.deepseek.com/user/balance` + Bearer（镜像站无计费端点）。

## 3. 时间/token 预算
- 单人 agent 一口气照做：**约 60~90 分钟、十几次工具调用**（每步已给验证命令，
  不需要读源码、不需要重放补丁）。
- 最省姿势：把本文 + README 的部署步骤喂给 agent，让它按 §1 顺序执行，
  遇验证不过就地排障，不要跳步。
