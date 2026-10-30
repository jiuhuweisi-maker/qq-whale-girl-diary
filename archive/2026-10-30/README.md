# 2026-10-30 逐项归档

来源为归档前提交 `9dd3952`。9份原始文件完整保存，未删除源内容；每份SHA256和原路径记录在 [MANIFEST.json](MANIFEST.json)。

清单同时记录源Git对象与归档文件的散列；部分检出文件只有CRLF/LF换行差异，已逐份核对正文一致。归档保留检出原字节，并通过 `.gitattributes` 防止后续换行转换破坏校验。

| 原路径 | 归档原件 | 原入口的处理 |
|---|---|---|
| scripts/proactive.py | [旧群主动聊天](scripts/proactive.py) | 保留停用提示，不发消息 |
| scripts/private_bubble.py | [旧私聊冒泡](scripts/private_bubble.py) | 保留停用提示，不发消息 |
| scripts/reflect.py | [旧反思](scripts/reflect.py) | 保留停用提示，不调模型 |
| scripts/cs.py | [旧CS叫人](scripts/cs.py) | 保留停用提示，不群发 |
| scripts/daily_report.py | [旧日报](scripts/daily_report.py) | 保留停用提示；现行仍用daily_report_v2.py |
| scripts/bootstrap.sh | [旧安装器](scripts/bootstrap.sh) | 保留停用提示；现行用deploy/build-upstream.sh |
| scripts/napcat-risk-guard.sh | [旧NapCat防护](scripts/napcat-risk-guard.sh) | Git入口停用；服务器例外见下文 |
| deploy/napcat-compose.example.yml | [旧容器模板](deploy/napcat-compose.example.yml) | 移入归档，退出现行deploy目录 |
| deploy/napcat-risk-guard.service | [旧服务模板](deploy/napcat-risk-guard.service) | 移入归档；未修改已登记的系统服务 |

运行 `node archive/verify.mjs` 可只读检查原件与入口的完整性，不执行任何历史程序。

服务器的原始脚本可能含私人账号或部署值，另存 `/root/whale-ops/archive/2026-10-30/`，没有导出到Git。5个无引用的旧Python入口已替换为与Git相同的停用提示。旧NapCat防护脚本仍被一个已停用、已禁用的服务登记引用，服务器只做归档副本，原脚本和服务原位置保持不变；没有停启或改写服务。

人物卡两处过时计数/旧协议的原文保存在服务器人物包的 `archive/2026-10-30-retired-counts.md`，全文备份为 `persona.md.bak136`。只归档旧的55/17、固定编号、500张及旧终端发图方式；有效的认图流程、来源判断和市场表情使用偏好已合并回现有条款。当前“表情两线”和3–8张/日的识图任务保留。图库、收藏、关系表、聊天风格与记忆均未清理。

需要恢复时，先按清单核对原路径和哈希，再审查历史依赖。恢复一个文件不代表应当恢复旧cron或启动第二个QQ客户端。
