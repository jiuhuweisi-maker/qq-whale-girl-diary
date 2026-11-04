# 从 Git 新部署鲸戒

**当前版本：鲸戒适配198 / SurfCore固定0.8.8。** 主入口构建最新完整运行源覆盖层，保留此前耐久回执与主人权限，包含共用日记、按人物/会话优先检索、图片预览兼容和更新保护。旧143构建器和平铺镜像已归档至`archive/2026-11-03/`，不用于新装或更新。

本仓库提供现行 SurfCore 适配、主人控制兼容层、离线测试及安装模板。自己的账号、人设、关系、聊天记忆、收藏、模型凭据和基金账本需要自行准备；仓库不会附带现有鲸戒的私密资料。示例人设保留可爱、吐槽与主动性，不承诺模型每次都说得自然。

## 先准备客户端与宿主

- Linux 主机，Node.js 24、Python 3.6 或更高版本、Git、npm。现有部署使用 systemd；测试不要求连接 QQ。
- 已能启动的 DSH，配置好可用的 provider/model 与凭据。这里不安装、升级或改写 DSH 的启动命令。
- 已配置并登录的 SnowLuma / OneBot 服务。HTTP 和 WS 都仅监听本机，示例上游 HTTP 为 3002、WS 为 3003。只保留一个 QQ 客户端运行。
- 一个主人 QQ、一个机器人 QQ、一个目标群。踢人/禁言还需要机器人真实具有群管理权限；不要用真人试踢验证安装。

当前聊天链路为：QQ → SnowLuma → SurfCore → DSH 的 qq-chat-v2 会话 → 已校验的工具调用 → 本机 relay → QQ。旧桥只保留主人控制与附件等兼容能力，`聊天后端` 必须是 `surfcore`。旧 NapCat 安装器已停止执行，旧文档作为历史记录保留。

## 准备固定源码

克隆本仓库后，在仓库根目录执行：

```bash
bash deploy/build-upstream.sh /opt/whale-surfcore/current-source
```

脚本克隆 [SurfCore](https://github.com/Mieksido/surfcore)，固定提交 `0deb8261afe4c31b3127759ee4de36a1439cf422`（0.8.8），先构建适配的package/lock，再按该lockfile安装依赖并手动运行已审查的SDK补丁。构建器在任何写入前检查504个固定源文件的指纹，然后应用完整的现行覆盖层及兼容模块，生成536文件哈希清单。目标目录必须不存在。不会使用 latest、覆盖已有运行目录、安装桌宠/语音包或启动聊天。

## 本地 relay 与凭据

把 `scripts/relay3000.py` 放到 `/opt/qq-cs/relay3000.py`。OneBot 的访问票写入仓库外 `/opt/qq-cs/.onebot-http-token`，文件权限 600，父目录仅管理员可访问。可以用终端静默输入，别把实际票据写进命令历史、Git 或聊天：

```bash
install -d -m 700 /opt/qq-cs
read -r -s -p 'OneBot token: ' WHALE_ONEBOT_INPUT
printf '\n'
umask 077
printf '%s' "$WHALE_ONEBOT_INPUT" > /opt/qq-cs/.onebot-http-token
unset WHALE_ONEBOT_INPUT
install -m 600 deploy/whale-relay.service /etc/systemd/system/whale-relay.service
systemctl daemon-reload
systemctl enable --now whale-relay
```

访问票由 relay 通过 Authorization 传给上游，不放 URL。3000 只监听 127.0.0.1。发送日志只存时间、来源、会话摘要、请求摘要和回执，不存正文或账号；带 delivery ID 的重复请求会返回原回执，结果不明时不会重试。无 ID 的旧调用只审计，不按文本误杀正常复读。

## 生成新配置

把 `deploy/settings.example.json` 复制到仓库外，例如 `/root/whale-ops/install.local.json`，填写自己的三个 QQ 号以及 DSH 中实际存在的 provider/model ID，核对 OneBot 端口。然后：

```bash
node deploy/init.mjs /root/whale-ops/install.local.json
```

它会生成：SurfCore `config.json`、原生 reserved2 模式、随机控制台/审计密钥、角色包、独立聊天风格、空的常驻关系表与历史记忆索引，以及控制兼容包。已有文件一律不覆盖。模型密钥沿用 DSH 的凭据管理；OneBot票从设置里的 `onebotTokenFile` 读取并仅写入权限600的私人配置，供直接连接WS鉴权，不能提交Git。

示例角色在 `~/.dsh/surfcore/characters/whale/`。改自己的 `persona.md` 与 `CHAT-STYLE.md` 即可；重要关系只将本人确认的资料写进 `important-people.json`。不要把私人关系表、原始会话或角色备份提交到公开仓库。B站和QQ读取同一个现行角色包。

## 注册并启动

使用 DSH 实际运行的 profile，下面假定是 `web`：

```bash
cd /opt/whale-surfcore/current-source
DSH_HOME=/root/.dsh node scripts/setup-dsh.mjs web
cd /path/to/this/repository
node deploy/register-control.mjs /root/.dsh web
```

前一步是上游原有的 preset/MCP/bundle 注册器，后一步只增加本仓库的主人控制包，并备份 profile package.json，保留其他插件。不要重装 dsh-ops 或删除现有 bundle。完成后按自己的托管方式重启 DSH，再打开设置里的 SurfCore 检查：QQ 后端为 reserved2；主人与白名单正确；QQ 工具不带本地文件、终端、Docker、服务控制能力；语音和桌宠关闭；自动更新关闭。

控制台只放本机，默认 13100；DSH 默认 3080。远程管理用自己的 SSH 转发或现有受控管理入口，不将带票据的控制台直接开放公网。

## 离线与只读验收

在仓库根目录，先运行没有模型、没有真实 QQ 的验证：

```bash
node --test tests/broadcast-intent.test.cjs
python3 scripts/test_relay.py
python3 scripts/test_operations.py
SURFCORE_SOURCE=/opt/whale-surfcore/current-source node --test integrations/surfcore/tests/audit-resilience.test.mjs
node integrations/surfcore/tests/bridge-integration.test.mjs /opt/whale-surfcore/current-source
```

把 `runtime_health.py` 放入 `/opt/qq-cs/` 后，运行它检查原生会话、QQ、WS 与耐久账本。`verify-live.mjs` 提供进一步哈希与记忆校验，但它默认按现有生产机的附加文件组织；新部署先核对配置路径，不把缺少个人历史索引当作 QQ 掉线。

最后由主人私信机器人一句普通问候，再核对实际回执和 relay 日志，确认收件人、引用与发送次数。不要往真实群里灌测试，不拿真人测试管理功能。离线通过并不能保证账号永不掉线或模型永远不误解。

## 可选能力

群聊、私信均不设每日唤醒次数上限：新部署默认 `maxWakesPerDay=0`、`privateMaxWakesPerDay=0`，现有运行配置也已取消原群聊20次/私信40次限制。实际费用/Token上限、后台最小间隔、防刷屏和休息安排仍生效。到达费用上限仅私信主人说明一次。私信代发群功能已退役，普通群聊和主人群管仍保留；定时抽奖默认关闭，手动发券保留。

夜间休息按北京时间判断，使用实际跨夜休息计划决定是否道晚安；普通收尾不固定发晚安。模拟验证包括夜间、早晨、重启及费用到顶，但上线后仍要观察自己的账号表现。

- B站：在 SurfCore 设置中登录自己的机器人账号，再绑定主人；按需要启用评论/动态与预算。本仓库默认关闭 B站自动启动，QQ可先独立验收。保留原角色，语音/桌宠仍关闭。遇到412按退避等待，不切代理、反复换票或高频重试。
- 旧记忆：使用 `integrations/surfcore/import-memory.mjs` 生成新的只读导入快照；原文件保留，群私范围分开。不要用别人的记忆替代自己的。
- 表情：图片数量、间隔和同图冷却默认均0，原生收藏不占文字的次数配额。按语境接图/斗图，费用、叫停、调用去重和未知结果不重试保留；不要用定时发图证明活跃。
- FundPilot：本仓库含基金名称/公开净值查询、逐只关注及提醒适配，以及[独立纯模拟服务源码](../services/fundpilot/README.md)。安装并配置自己的服务后，开启`whaleCompat.fundpilot.enabled`，将`whaleCompat.fundpilot.tokenFile`指向本机私有服务票文件，核对MCP工具已加载再使用；服务只监听本机3092，个人数据库/票据不在Git中。默认自由模拟按明确订单补充虚拟资金，不设旧本金/仓位/次数业务上限；金额预算含模拟手续费，支持产品和市场规则仍要核对。关注范围不受原交易两只白名单限制；“准备买”只保存待确认计划，逐只确认期限与条件后提醒。公开净值注明日期，不当实时成交价，手工持有不当券商验证。机器人默认模板不自动启用基金服务，不连接真实券商或银行卡。详情见[基金关注说明](PATCH142-STICKERS-AND-FUND-WATCH-2026-10-31.md)及[自由模拟说明](PATCH143-ELASTIC-PAPER-2026-10-31.md)。
- 定时任务：`deploy/crontab.example` 是运维参考，不自动安装整张表。先将需要的Python脚本与依赖的 `memory_archive.py` 放到 `/opt/qq-cs/`；启用日报还须放入 `report-no-tools.mjs` 和 `report-no-tools.patch.yml`，路径改了也要对应修改覆盖文件中的模块路径。备份路径、日报主人、余额通知方向和抽奖是否启用，应先按自己的需求确认。现有生产机的私有版本通知脚本未附送，新模板保持注释。退役的旧主动聊天 cron 不应恢复。

## 更新与回滚

保留源码版本、清单、配置、角色、原始记忆与耐久账本的独立备份。更新前先在新目录从固定源码构建、离线回归，再差异安装并验证全部清单哈希。只在确认代码需要重新加载时短暂重启 DSH；不升级宿主，不修改其 ExecStart，不重启 QQ 容器。

回滚只恢复有备份的代码和相应清单，保留新的收件去重、未确认发送和图片冷却记录，不清空账本重试旧任务。控制台或B站错误不等同于QQ登录失效，401/403应先核对鉴权。

### 可选的兼容自动更新

原版自动覆盖保持关闭；本适配提供独立的官方源兼容更新器。复制一份私人JSON填写 `root`（运行源根）、`work`（新的私有更新目录）、`node`（Node绝对路径）、`service: "dsh"`，必要时填写 `imageDeps`（已有预览依赖package.json）。以root运行 `python3 deploy/install-compatible-updater.py /absolute/private-settings.json` 安装每日09:10服务器本地时间检查；安装动作本身不启动或重启服务。

更新器不调用模型、不发消息、不执行npm安装；有依赖/运行要求变化、新插件、合并冲突或离线失败就保留现版。通过后仍须原生回合结束且至少两分钟没有新消息，才备份并替换代码、重载DSH、核对加载指纹；失败回滚代码并保留事务标记，等待检查，不循环重启。QQ容器、配置、人设、记忆、图库和账本不进入替换范围。状态位于私人work目录的status.json。设置页的原版覆盖按钮在有适配清单时受保护，检查版本仍能使用。

### 共用日记与图片

同一角色的memory目录下journal按北京时间分日保存经历，保留稳定发送者、时间、来源和私密标记；QQ按话题/日期/游标查询，B站通过journal命令内部回想，公开发送仍受私密边界限制。源记录、完整卡、旧收件和原日记均保留。无原日期的记录明确标记未知，不能伪造发生时间。

迁移自己的已有历史时，在服务器内部运行 `DSH_HOME=/root/.dsh node integrations/surfcore/backfill-journal.mjs /absolute/installed-source`。先备份个人目录；输出只含计数，第二遍须0新增。它不改原件、不调用模型、不发送消息；单个源超过64MiB会停止，要求流式整理。不要把journal或旧记录推Git。

PNG/JPEG/GIF原图保留，给模型的预览限制在32KiB内（GIF明确为首帧），以兼容附件导入；不额外调用视觉模型。依赖在适配后的lockfile中，鲜安装按前述构建顺序即可获得。当前有像素上限和格式边界，失败会如实说明未看到图，不能猜图或归咎发送者。
