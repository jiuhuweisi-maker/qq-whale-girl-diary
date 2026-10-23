# dsh-qq-bridge 十七连补丁全记录（host.js）

> 可重放：`bridge/host.js` 是打完全部补丁的成品；`bridge/patches/patch.py`~`patch17.py`
> 是逐补丁的重放脚本（按编号顺序对原装 host.js 依次 `python3 patchN.py` 即可复现）。

插件本体：`dsh plugin --profile web add github:Yuuyuko-uu/dsh-qq-bridge`
补丁位置：`~/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js`
备份：改前先 `cp host.js host.js.bak`。**插件升级会把补丁全冲掉**，升级后需重放。

调试路由（都带 `?token=`，token 每次 `systemctl restart dsh` 后从
`journalctl -u dsh | grep 'dsh web:'` 现取）：
- `POST /dsh-qq-bridge/state` → 配置+活会话+日志账本
- `POST /dsh-qq-bridge/save` → 热改配置
- `POST /dsh-qq-bridge/receive` `{"text":"..."}` → 以"QQ 来路"注入一条消息（测试用）
- `POST /dsh-qq-bridge/test-send` → 直发一条到 QQ

## patch1/3 — 私聊群聊分流（90 秒来路窗口）
问题：所有回复同时灌私聊+群，串门。
```js
let 最后来路 = 'private'; let 来路时刻 = 0;
async function 转入一条(文字, 图们, 消息id, 来路) {
  if (来路) { 最后来路 = 来路; 来路时刻 = Date.now() }   // private / group
  ...
}
// 出站处：
if (配置.转私聊 && 配置.私聊QQ && !(来路时刻 && 最后来路 === 'group' && Date.now() - 来路时刻 < 90000)) …发私聊
if (配置.转群  && 配置.群号  && !(来路时刻 && 最后来路 === 'private' && Date.now() - 来路时刻 < 90000)) …发群
```

## patch2 — 群消息带发言人
```js
转入一条('【' + String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友') + '】' + 文字, 图们, 条.message_id, 'group')
```

## patch4 — 群里必须 @ 才进线（省 token 的关键）
```js
if (群发言者 === Number(条.self_id)) continue            // 自己发的跳过
const 被艾特 = 段们G.some(x => x.type === 'at' && (
  String((x.data && x.data.qq) || x.qq || '') === 'all' || // ⚠️ 坑：qq 在 data.qq 里
  Number(x.data && x.data.qq) === Number(条.self_id)))
if (!被艾特) { /* 见 patch10 热聊 */ continue }
```

## patch5/6/7 — 谁 @ 她她就 @ 回去
```js
let 艾特我人 = 0; let 艾特时刻 = 0;
// 群循环里过了 被艾特 判定后：艾特我人 = 群发言者 || 艾特我人; 艾特时刻 = Date.now()
// 私聊循环：艾特我人 = 0（别在 转入一条 里清，/receive 测试会误伤）
// 出站首条文字段：
if (i === 0 && 艾特我人 && Date.now() - 艾特时刻 < 90000)
  体.message.unshift({ type: 'at', data: { qq: String(艾特我人) } })
```
patch6 的教训：曾在全局函数里引用循环局部的 `条` → ReferenceError，
`node --check` 查不出作用域错误，bot 直接全线静音。**补丁只用当前作用域已有变量，
上线前用 /receive 实测。**

## patch8 — 裸图片路径也能转真图
模型经常不按 markdown 输出路径，出站加一条"整行就是路径"的正则：
```js
.replace(/^[ \t`]*(\/[^\n`"'（）()]*?\.(?:png|jpe?g|gif|webp))[ \t`]*$/gim,
  (全, q) => { 图们.push({ kind: 'path', p: q }); return '' })
```

## patch9 — 网页控制台的消息不回 QQ（内外有别）
bridge 维护"QQ 待转轮数"：只有 QQ 转进的轮才 +1，轮结束不超发就静默。
```js
let qq待转轮 = 0
// 转入一条 成功 followup 后：qq待转轮 += 1
// assistant/message interrupted 分支：if (qq待转轮 > 0) qq待转轮 -= 1
// turn/end：
if (qq待转轮 > 0) { qq待转轮 -= 1; void 落地一发(配置, 上一轮.文本, 上一轮.图们) }
else 记账('这轮不是 QQ 转过来的（多半是网页控制台里直接问的），不发 QQ')
```

## patch10 — 热聊续聊窗
被 @ 一次 = 5 分钟内的续聊资格，不用反复 @：
```js
const 热聊 = new Map()          // qq号 → 截止时间戳
if (!被艾特) {
  const 热 = 热聊.get(群发言者)
  if (!(热 && Date.now() < 热)) continue       // 不在热聊窗且没 @ → 装死
} else {
  热聊.set(群发言者, Date.now() + 300000)
  if (热聊.size > 40) { 热聊.delete(热聊.keys().next().value) }
}
```
人设侧配套："热聊要跟到底，接话、反问、抛旧梗，绝不行礼式回一句就蒸发。"

## patch11 — 路由队列：每轮自带来路（串台根治）+ 略过权
全局"最后来路/艾特我人"在多人并发时会翻车（A 的话回了 B 的通道）。
改成队列：`转入一条` 成功后 `路由队.push({来路,艾特,...})`，turn/end 时 `shift()`
出队头给这一轮用——谁触发的就回谁的通道、@回@她的人。
同补丁上线**略过权**：模型只输出"略过" → 桥真沉默，不发 QQ。
群循环配套：热聊窗内消息若在 @别人 → 不接茬。

## patch12 — 会话昏迷不丢消息
`systemctl restart dsh` 后 web 会话是昏迷的，**必须有 GUI websocket 连上才复活**
（无头 resume 不存在）。昏迷期 followup 失败 → `转入一条` 返回 `{ok:false}` →
轮询循环 `break`：不标记已转、不推时间线，下轮重试（10 分钟内的消息不丢）。
唤醒法：本机 SSH 隧道 `-L 13080:127.0.0.1:3080` + 浏览器开新 token URL 挂着。

## patch13 — 热聊窗 5 分钟 → 3 分钟
主人拍板：跟聊窗口别太长，3 分钟刚好。

## patch14 — 引用回复 + 收尾权 + 画待两段式
1. 路由元素扩成 `{来路,艾特,话:说话人,mid:消息id}`；出站第一段 `unshift`
   QQ 引用段 `{type:'reply',data:{message_id}}`，发送失败自动去掉 reply 重发降级。
2. 模型输出`【收尾】`→ 剥标记 + `热聊.delete(说话人)`：关这个人的陪聊窗，
   再 @ 才会理（对方明确说"睡了/别回了"时用）。
3. 模型输出`【画待：描述】`→ 先秒发文字（"稍等两三分钟"），1.2 秒后给会话
   注入 followup 开"画图轮"，并把原路由塞回路由队——画完自动回原通道原人。
   画图本体：`scripts/draw.py`（DASHSCOPE key + maas 镜像 qwen-image-2.1-pro；
   **size 必须 `1024x1024` 星号会报 InvalidParameter**）。实测从"稍等"到交图 44 秒。

## patch15 — 小黄脸翻译 + /nudge 主动冒泡路由
1. QQ 自带 `[微笑]` 等 face 段此前被桥直接丢弃——她是小黄脸盲。
   face id → 名字映射表（104 个），转成 `[微笑]` 文字给她看；人设侧教梗味
   （[微笑]=敷衍阴间，[再见]=阴阳怪气）。
2. `/nudge` 调试路由：注入一条**群通道**系统提示（`scripts/proactive.py`
   cron 白天 10-21 点随机 1~2 次调用）→ 她主动往群里冒泡刷存在感。

## patch16 — 合并缓冲（反机关枪）
一人连发 N 条 → 以前每条一轮一回复 = 机关枪。现在按说话人开缓冲区：
私聊 5 秒 / 群聊 7 秒静默窗（最长攒 25 秒），把连发的话合并成一条多行消息
再转给她，**整体回应一次**。会话昏迷时放回缓冲重试，超 10 分钟丢弃。
人设侧配套："同一个名字下面好几行 = 他连发的，整体回应别逐行回。"

## patch17 — 内部轮通道（自主学习的基建）
`/nudge` 加 `channel` 参数：`{"channel":"none"}` → 路由来路为 `none`：
1. `转入一条` 不污染全局"最后来路"；2. `发到QQ` 开头直接记账返回，一个字节都不发 QQ。
配合 `scripts/reflect.py`（cron 每天 22:30）：注入"晚间复盘"提示 →
她读值班日志+回顾当天对话+把新认识写回日志 → 输出"略过"收尾。
**聊天沉淀成记忆的闭环**：白天聊 → 晚上复盘写日志 → 换班/重启后读日志继承。
双保险：就算她复盘轮忘了输出"略过"，none 通道也发不出去。

## 已知坑（NapCat 4.18.41，未解）
- **发送 reply 段被静默吞**：API 返回 retcode 0，但 `get_msg` 反查发出消息里
  reply 段消失，客户端也没有灰色引用条（历史 id 和活 id 都试过）。
  桥里保留"尝试 + 失败降级"代码，等 NapCat 修复，或改用事件上报拿活 id 再战。
