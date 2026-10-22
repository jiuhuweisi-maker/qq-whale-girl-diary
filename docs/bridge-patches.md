# dsh-qq-bridge 十连补丁全记录（host.js）

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
