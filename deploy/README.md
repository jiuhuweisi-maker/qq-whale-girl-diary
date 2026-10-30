# 新部署入口

当前入口是 [SurfCore 部署说明](../docs/DEPLOY-SURFCORE.md)。`settings.example.json` 只放占位符；请复制到仓库外填写。

`build-upstream.sh` 只准备固定版本源码和适配，不激活服务。`init.mjs` 只生成新安装文件，遇到已有配置、记忆或人设会停止。`register-control.mjs` 在指定 DSH profile 中增加主人控制兼容包，保留其他 bundle，不移除 dsh-ops。

当前生产服务器使用单独的备份、差异部署和验证流程，不运行这些初始化脚本。

旧NapCat容器/服务模板已移入 [历史归档](../archive/2026-10-30/README.md)，不参与当前部署。
