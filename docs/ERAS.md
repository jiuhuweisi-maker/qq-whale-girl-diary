# 版本时代图（迁服务器直接用这页）

> 生成：2026-11-01。回答两个问题：**现在迭代到哪了**、**git 历史上的时代怎么分**。
> 当前总进度：运维手术计数到 **patch168**。其中桥代码最后一次功能手术是 **159（全自动换班）**；160-161 是启动对齐/承诺落盘的操作号；162-168 全部是 persona 卡的"表达新规套件"（尺度统一、大方直球、emoji 活人感全家桶）。备份 counter 同源（persona.md.bakNNN）。

## 时代划分（git tag 已钉在远端，本地同名同 SHA）

| 时代 | tag | 钉在 | 覆盖手术号 | 形态 | 部署可用性 |
|---|---|---|---|---|---|
| 1. NapCat 时代 | `era1-napcat-final` | c5b7b0c | patch1-51 | NapCat 客户端甲 + dsh 旧桥 + cloud-core 图床 | **仅档案**。NapCat 10-24 退役，此格拿去装会撞上已停用的甲和旧协议 |
| 2. SnowLuma+旧桥时代 | `era2-snowluma-oldbridge-final` | 7aeff1b | patch52-113 | SnowLuma 容器甲 + dsh-qq-bridge/host.js 旧桥（自愈链 v1/v2、群务 106/107、会话换班 105 都在这一格） | **仅档案**。host.js 现为兼容/健康层，单独部署它会和 SurfCore 双发 |
| 3. SurfCore 时代（现行） | `era3-surfcore-start` | 8988801 | patch114 起 | SnowLuma 甲不变 + SurfCore 0.6.20 插件主体（bridge.js + whale-compat + MCP） | 时代开局格，功能远少于现行 |
| **推荐部署格** | `recommended-deploy` | 当前 HEAD | 桥 145-159 + 卡 162-168 全套 | 同上 + 缓退/自愈/兜底/认错钉锚/承诺落 dur/纠正加分/全自动换班/emoji 活人感全套 | **✅ 迁服务器 checkout 这一格**，按 `docs/DEPLOY-SURFCORE.md` 装机 |

另存历史 tag `stickers-lib-2026-10`（表情库里程碑，保留不动）。

## 换服务器三步（最省时间的正路）

1. `git clone <本仓库> && cd <仓库> && git checkout recommended-deploy`
2. 甲 = SnowLuma 容器（**不是 NapCat**，别按时代1/2 的文档装）。核心容器/凭据/hermes 配置是**私有件，不在本仓库**——仓库是镜像+文档，见 README「本仓库不包含什么」。
3. 装机顺序/验收电池：`docs/DEPLOY-SURFCORE.md` + `REBUILD.md` 的踩坑结论；装完必查三件：静窗 SOP、隐私门、token 现取（重启必轮换）。

## 怎么确认 tag 没被动过

`git ls-remote --tags origin` 对照本表钉列：era1=c5b7b0c、era2=7aeff1b、era3=8988801、recommended-deploy 应始终等于当时的 main 最新可部署格（主人裁定"当前稳定=最新"时由运维重打）。

——值班妈妈 2026-11-01
