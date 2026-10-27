# 桥接上下文回归

patch106 主人群务检查：`node simulator/moderation-tests.cjs [实际host.js路径]`。50项检查复用完整生产桥，成员、管理动作、收发和时钟全部模拟；覆盖真实身份、命令归属、同名、保护对象、旧消息、重启去重、超时不重试、持久化故障和独立鉴权。不会踢真实群员，不调用模型。

在仓库根目录运行：

```sh
node tests/qq-context.test.cjs
```

也可检查实际部署的桥源码：

```sh
node tests/qq-context.test.cjs /absolute/path/to/host.js
```

使用 Node 内置模块，提取目标源码中的解码、缓冲、路由、认领及结束回调，在模拟宿主/接口中运行；不会启动 DSH、连接真实 QQ 或发送消息。生产代码的分段标记用于提取被测实现，测试不复制一份业务实现。

patch101 的聊天偏好加载与传递另运行：

```sh
node tests/chat-style.test.cjs
node tests/chat-rhythm.test.cjs
node tests/output-hygiene.test.cjs
node tests/conversation-act.test.cjs
```

8项检查覆盖动态更新、回退、内部轮、文字与图片的消息传递；它们不为模型语言是否自然打自动分。口吻判断场景见 `docs/CHAT-STYLE.md`。

覆盖24个场景，包括跨轮引用、私聊/群聊隔离、失败与恢复、明确回答对象、多个人点名的串行回合、顺序、水位、旁路冒泡/戳一戳避让、丢弃/打断清理和预警否定句。可选设置 `WHALE_TEST_REPORT` 将脱敏结果写到指定路径；默认仅输出结果。

patch102 附件检查：

```sh
node tests/qq-attachments.test.cjs
```

26项检查覆盖直接文件、文件引用、同人附件追问、私聊和群聊隔离、多人的附件归属、引用图片与图片纠正、文件与图片同时传递、原生文件保留、文本编码和截断、下载大小和跳转限制、失败状态，以及无模型调用和QQ发送的管理回放。三个脚本都可在最后加实际部署的桥源码路径；合计58项。
