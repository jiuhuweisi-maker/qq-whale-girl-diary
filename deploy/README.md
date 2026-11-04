# 新部署入口

**换台新 Linux 服务器：看 [一次部署到最新版](../docs/FRESH-SERVER.md)，跑 `bootstrap.sh` 一条命令即可。** 逐步骤手工说明仍在 [SurfCore 部署说明](../docs/DEPLOY-SURFCORE.md)。`settings.example.json` 只放占位符；请复制到仓库外填写。

| 文件 | 作用 |
|---|---|
| `bootstrap.sh` | 一条命令把代码层装完：预检 → 构建固定上游+覆盖层 → 装 relay → `init.mjs` → `register-control.mjs` → 离线回归。带 `--check` 干跑。不碰 QQ 登录，不迁人设，不启动 DSH。 |
| `state-transfer.sh` | `export`/`import` 她本人的私密状态（人设、聊天风格、重要关系、记忆与日记、表情收藏）。带 sha256 清单，不打包任何票与密钥。 |
| `build-upstream.sh` | 只准备固定版本源码和适配，不激活服务。 |
| `init.mjs` | 只生成新安装文件，遇到已有配置、记忆或人设会停止。 |
| `register-control.mjs` | 在指定 DSH profile 中增加主人控制兼容包，保留其他 bundle，不移除 dsh-ops。 |
| `whale-relay.service` / `whale-ws.service` | relay（3000→OneBot）与 ws 客户端单元；`bootstrap.sh` 只装 relay。 |

`settings.example.json` 的字段：三个 QQ、DSH 里真实存在的 provider/model、OneBot HTTP/WS 地址与票文件路径、DSH 地址、控制台端口。

当前生产服务器使用单独的备份、差异部署和验证流程，跑 `bootstrap.sh` 不会去改它。

旧 NapCat 容器/服务模板、143 构建器、平铺镜像已移入 [历史归档](../archive/)，不参与当前部署；`state-transfer.sh` 也不打包它们。
