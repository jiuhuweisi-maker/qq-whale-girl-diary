# 重启后快速恢复手册（2026-11-07 实测版）

> 目标：**「她又不回消息了」或「刚重启完还没活」时，用最短路径判断卡在哪一环并恢复，且不丢任何已改好的东西。**
> 本文的每一步都在 2026-11-07 的 2GB 生产机上实测过；结论与背景见
> [INCIDENT-2026-11-07-MEMORY-EXHAUSTION.md](INCIDENT-2026-11-07-MEMORY-EXHAUSTION.md)。
> 配套只读巡检脚本：`scripts/recovery_status.py`（不写文件、不重启服务、不发消息、不回显凭据）。
> 真实号码、凭据、服务器地址只在仓库外 `SECRETS.md` / 服务器本机；本文所有路径与端口均为生产通用值。

---

## 0. 三十秒决策卡

| 看到的症状 | 判断 | 动作 |
|---|---|---|
| 刚重启完，3000 返回 502 / WS 1006 / `onebot_temporarily_unavailable` | **QQ 冷启动，正常**，约 6 分钟 | 只等，最多 10 分钟；不扫码、不重启容器 |
| `dshReady:false`，其余全绿，告警私信说「检查服务或鉴权」 | 告警文案是模板，**不等于鉴权坏了** | 先查内存/swap 与 3080 连接数，别急着改密钥 |
| 消息进未读、无回复、日志里 `fetch failed / aborted due to timeout` | 会话建不起来，护栏拒绝降级 | 看官方上游状态页 + 本机内存，按 §1 决策 |
| 可用内存 < 200MB、swap 用 > 500MB、DSH 进程 `State: D`、`VmSwap` 几百 MB | **内存死局，重启 DSH 无用** | 直接走 §3 整机重启，别反复 `systemctl restart dsh` |
| 采样一度全绿又变红 | 抖动，不是康复 | 必须连续 3 次全绿（间隔约 20 秒）才算稳 |

**一条命令起手**（服务器上，仓库根目录或脚本所在目录均可）：

```bash
python3 scripts/recovery_status.py --watch 3 --interval 20
```

输出每轮的 `verdict` 与 `hint`：`booting` / `waiting_qq` / `waiting_dsh` / `memory_pressure` / `upstream_suspect` / `healthy` / `degraded`，据此跳到对应章节。

---

## 1. 先判「要不要重启」：三层检查，顺序不能反

```bash
# 1) 当前健康（唯一权威判据；退出码 0=全绿，2/3=异常）
python3 /opt/qq-cs/runtime_health.py

# 2) 内存与 swap：决定是否只能靠整机重启解决
free -m
grep -E 'MemAvailable|AnonPages|SwapFree|SwapCached' /proc/meminfo
for p in $(pgrep -f 'dsh web' | head -1); do grep -E '^(State|VmRSS|VmSwap):' /proc/$p/status; done

# 3) DSH 是否真的能服务：监听 + 堆积连接
ss -ltnp | grep ':3080' || echo NOT_LISTENING
ss -tn | grep ':3080' | wc -l
```

判读：

- **`State: D` + `VmSwap` 很大 + 3080 连接几十到上百条** → 本地卡死，且 `drop_caches` 救不了（实测 122→120MB）。**不要再重启 dsh**：stop 要 90 秒 SIGKILL，重启后要读盘数分钟才绑端口，且很快又被换出。走 §3。
- **`dshReady:false` 但内存健康、3080 正常** → 先查外部依赖：DeepSeek 官方 `https://status.deepseek.com/`，以及 `journalctl -u dsh --no-pager | grep -Ei 'timeout|abort|fetch failed|api.deepseek'`。上游事故期间，本地再怎么重启也回不了消息，等官方恢复即可。
- **字段短暂全绿** → 抖动，继续采样，不要据此收工（本次 16:03 全绿、16:04 就连红三次）。

> 判据陷阱：`secrets.env` 里若只有 `DASHSCOPE_API_KEY`，拿它请求 DeepSeek 得 401 是正常的；
> `curl` 到 `api.deepseek.com` 很快只证明网络通，不证明模型服务健康。

---

## 2. 重启前：五分钟保全（**「不能丢东西」的硬步骤**）

生产运行目录下长期存在**未提交**的改动与新增文件（本次 581 个），重启本身不动磁盘，但必须先能证明、可还原。

```bash
ROOT=/opt/whale-surfcore/staging-c174ed0
BAK=/root/whale-ops/backup-1107
mkdir -p "$BAK"

# 1) 改动清单 + 可还原补丁 + 未跟踪文件快照
git -C "$ROOT" status --porcelain=v1 -uall > "$BAK/git-status.txt"
git -C "$ROOT" diff --binary > "$BAK/tracked-changes.patch"
git -C "$ROOT" diff --stat > "$BAK/diffstat.txt"
(cd "$ROOT" && git ls-files --others --exclude-standard -z | tar --null -czf "$BAK/untracked.tgz" -T -)

# 2) 运行时状态：未读队列、人格/记忆/社交、配置
(cd "$ROOT" && tar czf "$BAK/state.tgz" state config.json)

# 3) 重启前指纹（重启后逐项比对，写进 JSON 或文本均可）
{
  echo -n 'changedCount='; git -C "$ROOT" status --porcelain=v1 -uall | wc -l
  echo -n 'gitStatusSha='; git -C "$ROOT" status --porcelain=v1 -uall | sha256sum | cut -d' ' -f1
  echo -n 'head='; git -C "$ROOT" rev-parse HEAD
  echo -n 'configSha='; sha256sum "$ROOT/config.json" | cut -d' ' -f1
} | tee "$BAK/reboot-before.txt"
(cd "$BAK" && sha256sum *.tgz *.patch *.txt) > "$BAK/backup-sha256.txt"
```

**还原方式（仅当文件真的丢了，且先确认当前状态再用）**：

```bash
cd /opt/whale-surfcore/staging-c174ed0
git apply /root/whale-ops/backup-1107/tracked-changes.patch
tar xzf /root/whale-ops/backup-1107/untracked.tgz -C .
```

**开机覆盖风险复核**（每次环境变了都要重查，别假设）：

```bash
systemctl list-unit-files --state=enabled --no-pager --type=service | grep -iE 'whale|dsh|surfcore|qq|snow'
systemctl cat dsh | grep -E 'ExecStart|ExecStartPre|WorkingDirectory'
grep -rEil 'git (reset|checkout|clean)|install\.sh|deploy216' /etc/systemd/system /etc/cron.d /etc/rc.local 2>/dev/null
crontab -l | grep -vE '^#|^$'
```

2026-11-07 的结论：自启单元只有 `dsh` / `whale-relay` / `whale-ws`，ExecStart 直接启动、无 `git reset`；`/etc/cron.d/whale-surfcore-compatible-update` 每天 9:10 只做**只读**兼容性检查且不是 `@reboot`；crontab 无重装项；`rc.local` 仅一行 `touch`。

**自启链路确认**（桥没有 systemd 托管，最容易被漏掉）：

```bash
# 桥由 DSH surfcore 插件的 maybeAutoStartBridge() 拉起：加载即执行 + 每 120 秒兜底
# 条件：SURFCORE_SKIP_AUTOSTART != 1，且 platforms.start.qq = true
grep -R 'autoStartBridge\|SURFCORE_SKIP_AUTOSTART' "$ROOT/plugins/surfcore" | head -10
# QQ 登录态在 Docker 具名卷里，容器 unless-stopped，正常情况下无需扫码
docker inspect snowluma --format '{{.HostConfig.RestartPolicy.Name}} {{json .Mounts}}'
```

若这两项不成立，**先修自启再重启**，否则开机后机器人会彻底哑掉。

---

## 3. 执行重启：可逆、最小副作用

```bash
# 1) 只停用与机器人无关的云厂商/调优守护；不删文件、不改业务代码、不碰 QQ 与桥
#    先把原始状态写盘，便于一键恢复
for u in aegis.service aliyun.service cloudmonitor.service ecs_mq.service tuned.service; do
  echo "$u enabled=$(systemctl is-enabled $u 2>/dev/null) active=$(systemctl is-active $u 2>/dev/null)"
done > /root/whale-ops/backup-1107/services-before.txt
systemctl disable --now aliyun.service cloudmonitor.service ecs_mq.service tuned.service
# 注意：aegis 有自我保护，disable 可能被拒绝；保持原样即可，不要强行杀它

# 2) 落脏页，延迟重启；后台进程 fd 全部重定向，避免占住 SSH 通道导致输出丢失
sync
setsid /bin/sh -c 'sleep 8; sync; /usr/bin/systemctl reboot' >/dev/null 2>&1 </dev/null &
```

**能砍的只有约 65MB，救不了 118MB 的死局**——真正的收益来自重启清空 swap。QQ 客户端约 760MB、SnowLuma runtime 约 360MB、桥约 159MB、DSH 本体都不能砍；Xvfb 砍了 QQ 就没有 display。

**一键恢复可选服务**（需要时）：

```bash
systemctl enable --now aegis.service aliyun.service cloudmonitor.service ecs_mq.service tuned.service
```

---

## 4. 重启后：启动顺序与耗时基准（照着等，别乱动）

| 阶段 | 实测耗时（本次） | 期望现象 | 不要做的事 |
|---|---|---|---|
| 开机 → SSH 可连 | 约 30 秒 | `uptime -s` 变新；可用内存约 1200MB、swap 0 | — |
| systemd 拉起 | 开机后即刻 | `dsh` / `whale-relay` / `whale-ws` / `docker` 全 active | — |
| 容器自动起 | 1 分钟内 | `docker ps` 里 `snowluma` 为 Up；策略 `unless-stopped` | 不要 `docker restart` |
| 桥自动起 | 1–2 分钟 | `pgrep -f 'src/bridge.js'` 有 PID（插件 `autoStartBridge`） | 不要手工再拉一个桥，双桥会串消息 |
| QQ / OneBot 冷启动 | **约 6 分钟** | 先 `login identity discovered`，再 `OneBot session started`、HTTP 3000 / WS 3001 监听、群成员预热、桥连上 | **不要扫码、不要重登、不要重启容器** |
| 全链路稳定 | 约 7–8 分钟 | 三次采样全绿 | — |

逐阶段确认：

```bash
uptime -s; free -m
for s in dsh whale-relay whale-ws docker; do echo -n "$s="; systemctl is-active $s; done
docker ps --format '{{.Names}} {{.Status}}'
pgrep -f 'src/bridge.js' | head -3
ss -ltnp | grep -E ':(3000|3001|3080)'
tail -n 30 "$ROOT/state/bridge.log"
```

**这段时间里 3000 返回 502、relay 回 `onebot_temporarily_unavailable`、桥日志 `SnowLuma 连接断开 code=1006`、`token 自愈失败` 都是冷启动正常现象。** 本次 16:26:50 runtime 起、16:27:10 识别登录态、16:32:41 登录完成、16:32:42 OneBot 监听、16:32:45 桥连上——中间那 6 分钟看着最吓人，其实什么都不用做。

补唤醒会由桥自动排队（本次群 12 条、私聊 2 条），WS 未连时护栏会暂时跳过，**消息不会丢**，连上后自动补。

---

## 5. 收口验证：三绿 + 资产比对，缺一不可

```bash
# 1) 连续三次采样（全绿才算稳；单次全绿可能是抖动）
python3 scripts/recovery_status.py --watch 3 --interval 20
# 或直接：
for i in 1 2 3; do python3 /opt/qq-cs/runtime_health.py; sleep 20; done
```

全绿标准：`ok:true`、`dshReady` / `qqOnline` / `wsConnected` / `deliveryHealthy` / `deliveryReady` 全 true、`pending=0`、3080 连接个位数。

```bash
# 2) 「已改好的东西」逐项比对，全部应为 match:true
ROOT=/opt/whale-surfcore/staging-c174ed0
git -C "$ROOT" status --porcelain=v1 -uall | wc -l
git -C "$ROOT" status --porcelain=v1 -uall | sha256sum | cut -d' ' -f1
git -C "$ROOT" rev-parse HEAD
sha256sum "$ROOT/config.json" | cut -d' ' -f1
ls -l "$ROOT/state"/{sessions.json,social-v2.json,slang.json,stickers.json,whale-delivery.0} 2>/dev/null
(cd /root/whale-ops/backup-1107 && sha256sum -c backup-sha256.txt)

# 3) 确认真的发出过回复（而不是只建了会话）
grep -aE '补唤醒|status:sent|工具统一发送' "$ROOT/state/qq-activity.log" | tail -12
```

本次结果：581 个改动数量一致、git 状态 sha 一致、HEAD 不变、config.json sha 一致、4 个备份包校验值不变、state 文件全在；16:33 起三次采样全绿。

---

## 6. 超过 10 分钟仍不绿：分级排查

| 卡点 | 证据 | 处理 |
|---|---|---|
| 桥没起来 | `pgrep -f 'src/bridge.js'` 空 | 查 DSH 插件日志里的「已请求启动 bridge.js」；确认 `SURFCORE_SKIP_AUTOSTART` 未设、`platforms.start.qq=true`；等 120 秒兜底周期 |
| DSH 没绑 3080 | `ss -ltnp` 无 3080、`State: D`、`VmSwap` 大 | 说明又在换页，等冷启动读盘；**此时重启 dsh 只会重新排队**，先看内存是否回升 |
| 3000/3001 未监听 | 容器在运行但 relay 502 | 看容器内 supervisor 的 `qq` / `snowluma` 是否 RUNNING、容器日志有没有 `login identity discovered`；**仍属冷启动，不要重登** |
| 全绿但仍不回消息 | `pending>0`、日志 `fetch failed / aborted due to timeout` | 查 DeepSeek 官方状态页 + DSH 模型列表超时；上游事故只能等 |
| 登录态真失效 | 容器日志明确要求扫码 / 无 identity | **只有这一种情况**才需要主人本人扫码；先确认卷挂载还在 |

---

## 7. 明确禁止（都是这次付过学费的）

1. 不要反复 `systemctl restart dsh`：stop 需 90 秒强杀，冷启动读盘数分钟，治标不治本。
2. 不要在冷启动 6 分钟内扫码、重登 QQ、`docker restart snowluma` 或手工再拉一个桥。
3. 不要在内存见底时调低 `swappiness`：会阻止匿名页换出、诱发 OOM kill。
4. 不要手工重发旧消息、不要往真实群灌测试消息；补唤醒是桥的职责。
5. 不要用 `git reset` / 重新部署来「修」生产目录，那里有未提交的适配改动。
6. 不要把生产目录的 `config.json`、`state/`、凭据或原始日志拷进 Git；诊断输出一律脱敏后再留存。
7. 单次全绿不等于康复，必须连续三次。

---

## 8. 本次运维脚本清单（仓库外 `.ops/`，**不入库**）

这些脚本通过既有只读 SSH 通道执行，含服务器路径、凭据读取与现场数据，按 AGENTS.md 的边界不进 Git；需要复刻时照本文命令重写即可。

| 用途 | 脚本 |
|---|---|
| 只读状态 / 日志 / 抖动 / 负载 / 内存账 / 上游报错 | `diag1107-{a..y}.py` |
| 备份、重启前审查、无损内存优化 | `backup1107.py`、`precheck1107.py`、`optimize1107.py` |
| 两次 DSH 重启（**本次证明无效，仅留作反面记录**） | `recover1107.py`、`recover1107-b.py` |
| 停用可选服务 + 整机重启 | `reboot1107.py` |
| 开机轮询、资产比对、最终采样 | `ping1107.py`、`ping1107-b.py`、`verify1107.py`、`final1107.py` |

结果与证据 JSON 同名 `.result.json`，均已脱敏。完整经过亦见工作区记忆 `.workbuddy/memory/2026-11-07.md`。
