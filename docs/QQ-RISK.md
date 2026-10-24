# QQ 风险下线后的暂停与恢复

2026-10-24 07:19:50，NapCat 收到 `KickedOffLine`，QQ 手机端提示 Linux 设备风险下线。随后 NapCat 每约两分钟刷新一次登录二维码。此类设备判定由 QQ 平台作出，脚本无法保证 NapCat 以后不被判风险。

13:24 进行过一次受控重登：旧登录态失效，13:25 手机 QQ 扫码后服务器只显示“等待确认”，手机未出现确认页，始终未登录成功。已再次停止 NapCat；不要连续重试。

13:34 再次受控启动后，NapCat 使用旧会话自动快速登录成功，无需扫码；OneBot `get_login_info` 返回 `retcode=0`，桥接 `sess-alive` 返回 `ok=true`。风险保护服务运行中，看门狗 cron 已恢复。

## 服务器保护

- `/opt/qq-cs/napcat-risk-guard.sh` 由 `napcat-risk-guard.service` 持续看 NapCat 日志。再次出现 `KickedOffLine` 时，它创建 `/opt/qq-cs/.napcat-risk-paused`、关闭容器自动重启并停止 NapCat，防止持续刷新二维码。
- `watchdog.sh` 在暂停标记存在时立即退出，不会重新拉起 NapCat。
- 首次处置时，NapCat 已停止、Docker 重启策略设为 `no`，crontab 的 watchdog 行已注释；原 crontab 备份在 `/root/crontab-before-napcat-risk-20261024-131841.bak`。恢复后 Docker 重启策略为 `unless-stopped`，看门狗已重新启用。
- 保护只负责在下线后止损，不能消除第三方客户端的风控风险。若要求长期避免这类设备风险，应改用 QQ 官方机器人平台并按其开放能力重建桥接；机器人身份和现有小号能力需要重新核对。

## 账号检查

主人先在手机 QQ 中核对已登录设备。若存在不认识的设备，修改密码并移除异常设备；若账号登录受限制，通过 QQ 安全中心处理。在确认账号安全前，不要重新扫描服务器的二维码，也不要删除暂停标记。

## 人工恢复现有 NapCat（接受仍可能再次被下线后）

在确认 QQ 账号安全之后，服务器上依次执行：

```bash
rm -f /opt/qq-cs/.napcat-risk-paused
systemctl start napcat-risk-guard.service
docker update --restart=unless-stopped napcat
docker start napcat
```

此时按 NapCat WebUI 的当前二维码在手机 QQ 中授权。验证 `curl -s http://127.0.0.1:3000/get_login_info -d '{}' -H 'content-type: application/json'` 返回成功且可实际收发消息后，再恢复 watchdog 定时任务：

```bash
crontab -l | sed -E '/^# paused-after-qq-risk /s/^# paused-after-qq-risk //' | crontab -
```

若再次出现设备风险提示，保护会重新暂停 NapCat。不要反复扫码重试。
