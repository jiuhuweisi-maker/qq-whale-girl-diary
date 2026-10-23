# 🐋 鲸鱼娘遥控器 — 不开服务器界面也能调
# 用法（在本目录开 pwsh）：
#   .\whale.ps1 status          体检：服务/cron夜报/账本/表情库
#   .\whale.ps1 say 在吗小鱼     给她发条测试消息，40秒后看回话
#   .\whale.ps1 log 20          看最近20条收发账本
#   .\whale.ps1 pull            把守则+交接日志拉到本地改
#   .\whale.ps1 push            改完推回去（下一轮对话即生效，不用重启）
param(
  [Parameter(Position = 0)][string]$Cmd = "status",
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ap = "$env:TEMP\askpass.bat"
if (-not (Test-Path $ap)) { Set-Content $ap "@echo off`r`necho <服务器密码>" -Encoding ascii }
$env:SSH_ASKPASS = $ap; $env:SSH_ASKPASS_REQUIRE = "force"; $env:DISPLAY = "dummy:0"
$SRV = "root@<服务器IP>"
$OPT = @("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL")
function Remote($c) { ssh @OPT $SRV $c 2>$null }
$TOK = 'T=$(journalctl -u dsh --no-pager | grep -oE "token=[A-Za-z0-9_-]+" | tail -1 | cut -d= -f2)'

switch ($Cmd) {
  "status" {
    Remote 'echo "=== 服务 ==="; systemctl is-active dsh; docker ps --filter name=napcat --format "{{.Status}}"; echo "=== 昨夜cron ==="; tail -5 /opt/qq-cs/log.txt 2>/dev/null; echo "=== 账本 ==="; T=$(journalctl -u dsh --no-pager | grep -oE "token=[A-Za-z0-9_-]+" | tail -1 | cut -d= -f2); curl -s -m 5 -X POST -d "{}" "http://127.0.0.1:3080/dsh-qq-bridge/state?token=$T" | python3 -c "import json,sys;[print(l[\"时间\"],\"|\",l[\"文本\"][:120]) for l in json.load(sys.stdin)[\"日志\"][-6:]]"; echo "=== 表情库 ==="; ls /root/dsh-workspace/stickers/memecub/ | grep -cE "\.(png|jpg|jpeg|gif|webp)$"'
  }
  "say" {
    $text = ($Rest -join " ").Trim()
    if (-not $text) { "用法: .\whale.ps1 say 想说的话"; exit }
    $tmp = "$env:TEMP\whale-say.json"
    [IO.File]::WriteAllText($tmp, (@{ text = $text } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    scp @OPT $tmp "${SRV}:/tmp/whale-say.json" 2>$null
    Remote ($TOK + '; curl -s -m 20 -X POST -H "content-type: application/json" -d @/tmp/whale-say.json "http://127.0.0.1:3080/dsh-qq-bridge/receive?token=$T"')
    "（等 40 秒看她回什么…回复会发到你QQ私聊）"
    Start-Sleep 40
    Remote ($TOK + '; curl -s -m 5 -X POST -d "{}" "http://127.0.0.1:3080/dsh-qq-bridge/state?token=$T" | python3 -c "import json,sys;[print(l[\"时间\"],\"|\",l[\"文本\"][:150]) for l in json.load(sys.stdin)[\"日志\"][-2:]]"')
  }
  "log" {
    $n = 10; if ($Rest) { [int]::TryParse($Rest[0], [ref]$n) | Out-Null }
    Remote ($TOK + '; curl -s -m 5 -X POST -d "{}" "http://127.0.0.1:3080/dsh-qq-bridge/state?token=$T" | python3 -c "import json,sys;[print(l[\"时间\"],\"|\",l[\"文本\"][:150]) for l in json.load(sys.stdin)[\"日志\"][-' + $n + ':]]"')
  }
  "pull" {
    scp @OPT "${SRV}:/root/dsh-workspace/AGENTS.md" "$PSScriptRoot\AGENTS.local.md" 2>$null
    scp @OPT "${SRV}:/root/dsh-workspace/QQ-DUTY-LOG.md" "$PSScriptRoot\QQ-DUTY-LOG.local.md" 2>$null
    "已拉到脚本旁边：AGENTS.local.md（守则）/ QQ-DUTY-LOG.local.md（记忆）"
    "用记事本改完，跑 .\whale.ps1 push"
  }
  "push" {
    if (-not (Test-Path "$PSScriptRoot\AGENTS.local.md")) { "先跑 .\whale.ps1 pull"; exit }
    scp @OPT "$PSScriptRoot\AGENTS.local.md" "${SRV}:/root/dsh-workspace/AGENTS.md" 2>$null
    scp @OPT "$PSScriptRoot\QQ-DUTY-LOG.local.md" "${SRV}:/root/dsh-workspace/QQ-DUTY-LOG.md" 2>$null
    "已推上去，她下一句话就是新人设（守则每轮生效，不用重启）"
  }
  "wake" {
    # 服务器重启后她可能昏迷：重搭隧道+开浏览器GUI唤醒（标签页保持开着1分钟即可）
    Get-Process ssh -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Out-Null
    Start-Process -WindowStyle Hidden ssh -ArgumentList '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=NUL', '-o', 'ServerAliveInterval=30', '-L', '13080:127.0.0.1:3080', 'root@<服务器IP>', '-N'
    Start-Sleep 6
    $u = (Remote 'journalctl -u dsh --no-pager | grep -oE "http://127.0.0.1:3080/\?token=[A-Za-z0-9_-]+" | tail -1')
    if (-not $u) { "拿不到token，检查网络"; exit }
    $u = ($u -replace '127\.0\.0\.1:3080', '127.0.0.1:13080')
    Start-Process $u
    "已在浏览器打开她的会话页，标签页开着别关，1分钟后跑 .\whale.ps1 status 确认"
  }
  default { "命令: status / say / log / pull / push / wake" }
}
