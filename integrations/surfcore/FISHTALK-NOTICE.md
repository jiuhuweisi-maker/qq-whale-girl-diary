# fishtalk 引用与整合范围

来源：[Nozzi2455/fishtalk](https://github.com/Nozzi2455/fishtalk)，版本 0.3.6，固定提交 `bb621c3da31052e7e52b6307db3e27c508e4d502`。MIT，Node >=18，零 npm 依赖。版权与完整许可保存在 `compat/FISHTALK-LICENSE`，构建时随适配层一起分发。

直接复用到 `compat/`：

- `lib/bili.js` → `fishtalk-bili.cjs`，公开视频/评论采集器。
- `lib/sites/bili.js` → `fishtalk-discovery.cjs`，唯一改动为 require 路径。
- `lib/fishrules.js` → `fishtalk-rules.cjs`，引用屏蔽、规则证据、归一化。
- `lib/sim.js` → `fishtalk-sim.cjs`，中文二元组相似度。

本次检查了 README、AGENT、package、CLI、上述源码、store、importers、distill、deep、label server、DSH 入口及测试；原仓库 runner 59/59 通过。其 AGENT 属于被研究项目的使用建议；其中“公开文风压过人格口癖”的规则与本次要求冲突，未采用。

| 原能力 | 源码核实及本项目处理 |
|---|---|
| collect | 存在；复用，但关闭弹幕、登录和重试；包装器补回复对象及统一速率/时限 |
| learn | 存在；手动初始采集复用 B站发现、按主题和排行不同位置取样；上线自动学习只复用正常浏览已获取的评论，不独立发现或抓取 |
| feed | 存在，支持文本/CSV/JSON/聊天导出；未接入，避免把私聊或机器人回复自动当公开语料 |
| label | 存在，本地 HTTP 筛选控制台；未启动、未接入 |
| pack / --scene | 存在；借鉴统计与场景思路，自建有 schema 的抽象包，不注入原版范例和人格覆盖规则 |
| pack --like | 存在，局部相似度检索；未把评论例句检索接入聊天，降低照抄与 Token 风险 |
| check | 存在；复用底层算法，重写决策；原版黑名单/动作括号/自称限制不直接使用 |
| check --keep | 存在，但原始历史无容量/TTL；改用仅确认发送后记录、有容量/期限的历史 |
| scenes | 存在；本项目通过 status 查看包内场景，pack 命令选择场景 |
| distill | 存在，本地统计；本项目轻量实现数字特征蒸馏和发布质量门 |
| deep | 存在，本身只出材料/保存 agent 撰写的打法；未接入深度语义蒸馏，未调用模型 |
| status | 存在；本项目独立 CLI 提供数量、时间、版本和筛选统计 |
| forget | 存在，全量删除要求 --yes；未复用，提供按精确 BV 来源删除及本地备份 |

没有全局安装 fishtalk、加载其 DSH 插件、添加工具提示词集合或新增 npm 依赖。
