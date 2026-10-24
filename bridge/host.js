// DSH「通到 QQ」· 宿主半边
//
// 这一半只做一件事（先只做 DSH → QQ）：
//   伙伴在「目标会话」里说完一句话（一整轮的最后一句），就自动把它发到 QQ（私聊 / 群）。
//   发 QQ 走 NapCat 的 OneBot HTTP 接口（127.0.0.1:3000），走标准的 OneBot 11 HTTP。
//
// 反过来（QQ → DSH）是下一半，放到另一个插件/进程里做，不在这里混。
//
// ⚠ 安全默认：总开关 = false、试运行 = true —— 不手动打开，一句都不会真的发到 QQ。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createSelfUpdate } from './selfupdate.mjs'

export const name = 'qq-bridge'

/** 需要宿主提供：webServer（路由）+ sessions/sessionTitle（目标会话清单 + 标题）+ agents（followup）+ timer（轮询收消息）+ attachments（图片）。 */
export const inject = ['agents', 'sessions', 'sessionTitle', 'webServer', 'timer', 'workspaceRegistry', 'attachments']

// ---------- 常量 ----------

const 目录 = process.env.DSH_HOME || join(homedir(), '.dsh')
const 配置文件 = join(目录, 'qq-bridge-config.json')
const 路由前缀 = '/dsh-qq-bridge'
const 日志上限 = 60

const 默认配置 = {
  她的QQ: 0,
  总开关: false, // 关着 = 一句都不发（安全默认）
  试运行: true, // 开着 = 只记账、不真发到 QQ
  目标会话: '', // 盯哪个 DSH 会话（在设置页下拉里选，一般是你平时聊天的那一间）
  私聊QQ: '', // 发到哪个私聊（QQ 号，字符串）
  群号: '', // 发到哪个群（可空）
  转私聊: true,
  转群: false,
  NapCat: 'http://127.0.0.1:3000', // OneBot HTTP 接口（无 token）
  // ⭐ 2026-10-22：图片两个方向
  收图: true, // QQ → DSH：她发的图片也转进来
  收图最多: 4, // 一条消息最多转几张
  发图: true, // DSH → QQ：伙伴发的图片也发过去
  图上限MB: 5, // 单张最大多少 MB（两个方向共用）
  图片根目录: '', // 正文里 `![名字](相对路径)` 按哪个目录去找（留空 = 自动猜）
  称呼: '对方', // ⭐ 跟它说话的那个人怎么称呼（写进转给它的文案里，比如「小明发来了图片」）
}

/** 版本从 package.json 读。 */
const 版本 = (() => {
  try {
    const p = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
    return String(p.version || '?')
  } catch (error) {
    return '?'
  }
})()

// ---------- 配置读写 ----------

function 布(值, 兜) {
  if (值 === true || 值 === 'true' || 值 === 1 || 值 === '1') return true
  if (值 === false || 值 === 'false' || 值 === 0 || 值 === '0') return false
  return 兜
}

function 归一化(原始) {
  const 是对象 = 原始 && typeof 原始 === 'object' && !Array.isArray(原始)
  const 混 = 是对象 ? { ...默认配置, ...原始 } : { ...默认配置 }
  const 字 = (v) => (typeof v === 'string' ? v.trim() : '')
  const 数 = (v, 兜, 低, 高) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return 兜
    return Math.max(低, Math.min(n, 高))
  }
  return {
    总开关: 布(混.总开关, 默认配置.总开关),
    试运行: 布(混.试运行, 默认配置.试运行),
    目标会话: 字(混.目标会话),
    私聊QQ: 字(混.私聊QQ),
    她的QQ: 数(混.她的QQ, 默认配置.她的QQ || 0, 0, 99999999999),
    群号: 字(混.群号),
    转私聊: 布(混.转私聊, 默认配置.转私聊),
    转群: 布(混.转群, 默认配置.转群),
    NapCat: 字(混.NapCat) || 默认配置.NapCat,
    收图: 布(混.收图, 默认配置.收图),
    发图: 布(混.发图, 默认配置.发图),
    收图最多: 数(混.收图最多, 默认配置.收图最多, 1, 10),
    图上限MB: 数(混.图上限MB, 默认配置.图上限MB, 1, 30),
    图片根目录: 字(混.图片根目录),
    称呼: 字(混.称呼) || 默认配置.称呼,
  }
}

// ---------- 图片小工具（两个方向共用）----------
// ⭐ 2026-10-22 加：QQ 的图片段（OneBot）可能给 http url、本地路径、base64 三种形态，
//    这里统一成字节；大小和类型都在收的时候判，判不了就当 jpeg。

/** 收进来的图存一份到这儿（纯文本模型看不见图，至少能从文字里找到路径） */
const 收图目录 = join(目录, 'qq-bridge-inbox')

/**
 * ⭐ 2026-10-22：DSH 存图时会留一份「归一化副本」（官方文档原话：may be resized or re-encoded），
 *    GIF 到这一步就变成静态 webp 了 —— 所以回发时必须用**我们自己留的原图**。
 *    这张表记「附件 id → 我们存的原图路径」，回发时先查它。
 */
const 收图表 = join(目录, 'qq-bridge-received.json')

function 读收图表() {
  try {
    const j = JSON.parse(readFileSync(收图表, 'utf8'))
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch (error) {
    return {}
  }
}

/** 路径统一：去掉两头引号/空格，Windows 下大小写不敏感 */
const 清路径 = (p) => String(p || '').trim().replace(/^["']+|["']+$/g, '').trim()

/**
 * 记「附件 / DSH 那份只读副本 → 我们存的原图」。
 * ⚠ 两个键都要记：伙伴回发时可能用附件 id（附件块），也可能照抄 DSH 给的那条
 *   只读副本路径（正文里的 markdown 图）—— 后者是常见情况，第一次就漏了。
 */
function 记收图(附件id, 副本路径, 原图路径) {
  const 原 = String(原图路径 || '').trim()
  if (!原) return
  const id = String(附件id || '').trim()
  const 副 = 清路径(副本路径)
  if (!id && !副) return
  try {
    const 表 = 读收图表()
    const 记 = { p: 原, t: Date.now() }
    if (id) 表['id:' + id] = 记
    if (副) 表['p:' + 副.toLowerCase()] = 记
    // 只留最近 200 条，别让这个文件无限长
    const 留 = Object.entries(表).sort((a, b) => Number((b[1] && b[1].t) || 0) - Number((a[1] && a[1].t) || 0)).slice(0, 200)
    writeFileSync(收图表, JSON.stringify(Object.fromEntries(留)), 'utf8')
  } catch (error) {}
}

/** 这张图能不能换回原图？键可以是 `id:<附件id>`，也可以是 `p:<副本路径>` */
function 原图路径(键) {
  const k = String(键 || '').trim()
  if (!k) return ''
  const 表 = 读收图表()
  const 记 = 表[k] || 表[k.toLowerCase()] || 表[String(k).replace(/^id:/, '')]
  const p = 记 && typeof 记.p === 'string' ? 记.p : ''
  if (!p) return ''
  try { return existsSync(p) ? p : '' } catch (error) { return '' }
}

const 扩展 = (类) => (类 === 'image/png' ? 'png' : 类 === 'image/gif' ? 'gif' : 类 === 'image/webp' ? 'webp' : 'jpg')

function 看图类(字节) {
  try {
    if (字节[0] === 0x89 && 字节[1] === 0x50) return 'image/png'
    if (字节[0] === 0x47 && 字节[1] === 0x49) return 'image/gif'
    if (字节[0] === 0x52 && 字节[1] === 0x49 && 字节[8] === 0x57) return 'image/webp'
  } catch (error) {}
  return 'image/jpeg'
}

/** 从 OneBot 的图片段里把字节抠出来：url → file(本地/base64://) 依次试 */
async function 取图字节(数据) {
  const d = 数据 || {}
  const url = typeof d.url === 'string' ? d.url.trim() : ''
  if (url) {
    if (url.startsWith('file://')) {
      try { return readFileSync(new URL(url)) } catch (error) {}
    } else if (/^https?:/i.test(url)) {
      try {
        const r = await fetch(url)
        if (r.ok) return Buffer.from(await r.arrayBuffer())
      } catch (error) {}
    }
  }
  const f = typeof d.file === 'string' ? d.file.trim() : ''
  if (f.startsWith('base64://')) {
    try { return Buffer.from(f.slice('base64://'.length), 'base64') } catch (error) {}
  }
  if (f && (f.includes('\\') || f.includes('/'))) {
    try { return readFileSync(f) } catch (error) {}
  }
  return null
}

/** 存一份到收图目录，返回路径（存不下就返回空串，不影响转图） */
function 存一张(名字, 字节, 类) {
  try {
    mkdirSync(收图目录, { recursive: true })
    const p = join(收图目录, `${名字}.${扩展(类)}`)
    writeFileSync(p, 字节)
    return p
  } catch (error) {
    return ''
  }
}

function 读配置() {
  try {
    return 归一化(JSON.parse(readFileSync(配置文件, 'utf8')))
  } catch (error) {
    return 归一化(null)
  }
}

function 写配置(配置) {
  try {
    mkdirSync(目录, { recursive: true })
    writeFileSync(配置文件, JSON.stringify(配置, null, 2), 'utf8')
    return true
  } catch (error) {
    return false
  }
}

// ---------- 纯函数（导出给冒烟测试喂） ----------

/** 从一条 assistant 消息里只抽出正文（text 块拼起来；reasoning / image 都不要）。 */
export function 提取正文(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** 拼一个 OneBot「私聊 text 段」消息体。 */
export function 私人消息体(text) {
  return { user_id: 0, message: [{ type: 'text', data: { text } }] }
}

/** 拼一个 OneBot「群 text 段」消息体。 */
export function 群消息体(text) {
  return { group_id: 0, message: [{ type: 'text', data: { text } }] }
}

/** ⭐ 2026-10-22：从一条 assistant 消息里挑出图片块（要发到 QQ 的那几张）。 */
export function 提取图块(message) {
  if (!message || !Array.isArray(message.content)) return []
  return message.content.filter((b) => b && b.type === 'image' && b.attachment).slice(0, 10)
}

/** 拼一个 OneBot「图片段」（base64 直接塞，不依赖 QQ 那边能不能访问本地文件）。 */
export function 图片段(base64) {
  return { type: 'image', data: { file: 'base64://' + String(base64) } }
}

/**
 * ⭐ 2026-10-22：正文里那种 markdown 图片 `![名字](路径)` 也当图片发。
 *    伙伴发贴纸就是这么发的（`![小肥鱼](_stickers/feiyu-test.webp)`）——
 *    以前只认附件块，这种一律被当成普通文字发过去，QQ 那边看到的是一串 markdown。
 * @returns {净文字, 图: [{kind:'url'|'path', value}]}
 */
export function 抠正文图(文字) {
  const 图 = []
  const 净文字 = String(文字 || '')
    .replace(/!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g, (全, 路径) => {
      const p = String(路径 || '').trim()
      if (!p) return ''
      if (/^https?:\/\//i.test(p)) {
        if (!图.some((x) => x.value === p)) 图.push({ kind: 'url', value: p })
        return ''
      }
      if (!图.some((x) => x.value === p)) 图.push({ kind: 'path', value: p })
      return ''
    })
    .replace(/^[ \t`]*(\/[^\n`\"'（）()]*?\.(?:png|jpe?g|gif|webp))[ \t`]*$/gim, (全, q) => {
      const r = String(q).trim()
      if (!图.some((x) => x.value === r)) 图.push({ kind: 'path', value: r })
      return ''
    })
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { 净文字, 图 }
}

// 包根：用来读自己的 package.json（版本 + 仓库地址）
const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..')

export function apply(ctx) {
  // ⭐ 设置页那个「检查更新」：查这个插件自己的仓库
  createSelfUpdate({ packageRoot: 包根, diag: 记账 }).register(ctx, 路由前缀)
  // ---------- 状态 ----------

  const 日志 = []
  let 上一轮 = { 轮号: -1, 文本: '', 图们: [] }
  const 已发轮 = new Set()
  const 已转消息 = new Set() // 已经转发进 DSH 的 QQ 消息 id（防重复转）
  let 上次私聊时间 = Math.floor(Date.now() / 1000) // 从这一刻起只认新消息，不补旧的
  let 上次群时间 = Math.floor(Date.now() / 1000)

  function 记账(文本) {
    const d = new Date()
    const 补 = (n) => String(n).padStart(2, '0')
    const 时间 = `${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`
    日志.push({ 时间, 文本 })
    if (日志.length > 日志上限) 日志.shift()
    try {
      ctx.logger?.info(`qq-bridge: ${文本}`)
    } catch (error) {}
  }

  const 静默文件 = '/opt/qq-cs/.group-silence-until'
  const 群静默中 = () => { try { const t = Number(require('fs').readFileSync(静默文件, 'utf8').trim()) || 0; return Date.now() / 1000 < t } catch (e) { return false } }
  let 发送窗口 = []
  let 图窗 = []
  let 图日 = { d: '', n: 0 }
  async function 节流发送(是图) {
    // ⭐ patch43+44 防踢节流：第4条/分钟起缓20秒；图片另加第3张/分钟起缓25秒、日封顶60张（刷屏式发图最像bot）
    const now = Date.now()
    const 日 = new Date().toLocaleDateString('sv')
    if (图日.d !== 日) { 图日.d = 日; 图日.n = 0 }
    if (是图) {
      if (图日.n > 60) return '限额'
      const 近图 = 图窗.filter(t => now - t < 60000).length
      if (近图 >= 2) await new Promise(r => setTimeout(r, 25000))
      图窗.push(now)
      if (图窗.length > 30) 图窗.splice(0, 图窗.length - 30)
      图日.n += 1
    }
    const 近 = 发送窗口.filter(t => now - t < 60000).length
    if (近 >= 3) await new Promise(r => setTimeout(r, 20000))
    发送窗口.push(Date.now())
    if (发送窗口.length > 40) 发送窗口.splice(0, 发送窗口.length - 40)
    return null
  }
  async function 发一个(base, action, 体) {
    if (action === 'send_group_msg' && 群静默中()) { 记账('🤐 群静默中，一条群发被挡'); return { ok: true, 说: '群静默挡' } }
    const 是图 = Array.isArray(体 && 体.message) && 体.message.some((x) => x && x.type === 'image')
    const 闸 = await 节流发送(是图)
    if (闸 === '限额') return { ok: false, 说: '今天发图到顶了，明儿再说' }
    try {
      const r = await fetch(`${base}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(体),
      })
      const j = await r.json()
      return { action, ok: !!(j && j.status === 'ok' && j.retcode === 0), 数据: j }
    } catch (error) {
      return { action, ok: false, 数据: { 错: String((error && error.message) || error) } }
    }
  }

  /** 把一段长文字按空行拆成自然段（没有空行就整段）。 */
  function 按段拆(文字) {
    const 段 = String(文字 || '')
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return 段
  }

  /**
   * 相对路径的图按哪儿找：
   *   ① 设置里的「图片根目录」（填了就以它为准）
   *   ② **目标会话所在的那个工作区**（自动的，一般不用填）
   *   ③ 其它登记过的工作区
   *   ④ 进程当前目录 ⑤ <DSH_HOME>/workspace ⑥ 用户主目录
   * 找到就返回绝对路径。
   */
  function 找本地图(p, 配置) {
    const 原 = String(p || '').trim()
    if (!原) return ''
    const 试 = []
    if (/^[a-zA-Z]:[\\/]/.test(原) || 原.startsWith('\\\\') || 原.startsWith('/')) 试.push(原)
    else {
      const 根们 = []
      const 设 = String(配置.图片根目录 || '').trim()
      if (设) 根们.push(设)
      try {
        const 登记 = ctx.workspaceRegistry || ctx.get('workspaceRegistry')
        const 列表 = (登记 && typeof 登记.list === 'function' ? 登记.list() : []) || []
        const 目标 = String(配置.目标会话 || '')
        // ⭐ 先把「目标会话所在的工作区」排到前面 —— 这个才是它平时待的地方
        const 排 = 列表.slice().sort((a, b) => {
          const A = a && Array.isArray(a.sessionIds) && a.sessionIds.map(String).indexOf(目标) >= 0 ? 0 : 1
          const B = b && Array.isArray(b.sessionIds) && b.sessionIds.map(String).indexOf(目标) >= 0 ? 0 : 1
          return A - B
        })
        for (const w of 排) {
          const d = w && (typeof w.path === 'string' ? w.path : (w.directory || w.dir || w.root))
          if (typeof d === 'string' && d) 根们.push(d)
        }
      } catch (error) {}
      根们.push(process.cwd(), join(目录, 'workspace'), homedir())
      for (const r of 根们) 试.push(join(String(r), 原))
    }
    for (const 全 of 试) {
      try { if (existsSync(全)) return 全 } catch (error) {}
    }
    记账('找不到这张图：' + 原 + '（试过：' + 试.slice(0, 4).join(' ｜ ') + ' 等 ' + 试.length + ' 个位置；可在设置里填「图片根目录」）')
    return ''
  }

  // patch22 节奏账本：她在群里连发纯文字的段数（发过图就清零）
  let 连纯文 = 0
  const 图闸 = new Map() // patch24：文件小写名 -> 上次真发时间戳
  let 群图最近 = 0
  /** 把一句正文发到该发的地方（私聊 / 群）；按空行拆段，一段一条连发。⭐ 末尾再加上图片。 */
  async function 发到QQ(配置, 原文字, 图们, 路由) {
    const 出 = []
    const 路 = 路由 || { 来路: (来路时刻 && Date.now() - 来路时刻 < 90000 && 最后来路 === 'group') ? 'group' : 'private', 艾特: (艾特时刻 && Date.now() - 艾特时刻 < 90000) ? 艾特我人 : 0 }
    if (路.来路 === 'none') { 记账('内部轮（复盘/无通道），不发 QQ'); return 出 }
    if (禁言中()) { 记账(`🔇 禁言中，拦下一条${路.来路 === 'group' ? '群' : '私'}发言：「${String(原文字 || '').slice(0, 24)}」`); return 出 }
    // ⭐ 正文里的 markdown 图（贴纸就是这么发的）也当图片发；抠掉之后正文更干净
    const 抠过 = 配置.发图 ? 抠正文图(原文字) : { 净文字: String(原文字 || ''), 图: [] }
    const 文字 = 抠过.净文字
    const 段们 = 按段拆(文字).length ? 按段拆(文字) : [String(文字 || '').trim()].filter((s) => s.length > 0)
    const 发段延迟 = 450 // 每段之间隔一下，像真人一条条发
    const 最大 = Math.max(1, Math.min(Number(配置.图上限MB) || 5, 30)) * 1024 * 1024
    // ⭐ 图片：base64 或网络地址，QQ 那边直接收，不用访问本机文件
    const 图数据 = []
    const 加图 = (源) => {
      if (!源 || 图数据.length >= 4) return
      const 闸键 = String(源.value || '').split(/[\\/]/).pop().toLowerCase()
      if (闸键) {
        const 现 = Date.now()
        const 上回 = 图闸.get(闸键) || 0
        if (现 - 上回 < 86400000) { 记账(`🚫 图闸拦重复：这张 24 小时内贴过了（${闸键.slice(0, 10)}…）`); return }
        if (路.来路 === 'group' && 现 - 群图最近 < 90000) { 记账('⏳ 图闸按下：群里两张图不到 90 秒'); return }
        图闸.set(闸键, 现)
        if (路.来路 === 'group') 群图最近 = 现
      }
      if (源.kind === 'url') { 图数据.push({ url: 源.value }); return }
      let 值 = 源.value
      // ⭐ 伙伴回发时常常照抄 DSH 给的那条「只读副本」路径（webp）——
      //    先反查一次表，能换回我们存的原图就换（GIF 才是动的）
      const 换 = 原图路径('p:' + 清路径(值).toLowerCase())
      if (换) 值 = 换
      const 全 = 找本地图(值, 配置) || 值
      try {
        const buf = readFileSync(全)
        if (buf.length > 最大) { 记账(`这张图太大（${Math.round(buf.length / 1048576)}MB），跳过`); return }
        图数据.push({ b64: buf.toString('base64') })
      } catch (error) {
        记账('读图失败，跳过：' + String((error && error.message) || error))
      }
    }
    if (配置.发图) {
      for (const 源 of 抠过.图) 加图(源)
      if (Array.isArray(图们) && 图们.length) {
        const 附件 = ctx.attachments || ctx.get('attachments')
        for (const 块 of 图们) {
          try {
            // ⭐ 优先用我们收下来的**原图**（DSH 那份副本会被转码，GIF 会变静态）
            const 原 = 原图路径('id:' + String((块.attachment && 块.attachment.attachmentId) || ''))
            if (原) { 加图({ kind: 'path', value: 原 }); continue }
            const p = 附件 && typeof 附件.imageHostPath === 'function' ? 附件.imageHostPath(块.attachment) : undefined
            if (!p) { 记账('这张图拿不到本地文件，跳过'); continue }
            加图({ kind: 'path', value: p })
          } catch (error) {
            记账('读图失败，跳过：' + String((error && error.message) || error))
          }
        }
      }
    }
    // 一条 OneBot 图片段：本地图走 base64，网络图直接把 url 交给 QQ
    const 一段图 = (x) => (x.url ? { type: 'image', data: { file: x.url, url: x.url } } : 图片段(x.b64))

    if (配置.转私聊 && 配置.私聊QQ && 路.来路 !== 'group') {
      for (let i = 0; i < 段们.length; i++) {
        const 体 = 私人消息体(段们[i])
        体.user_id = Number(配置.私聊QQ)
        const 带引P = i === 0 && 路.mid && 路.mid !== 'qq' && Array.isArray(体.message)
        if (带引P) 体.message.unshift({ type: 'reply', data: { id: String(路.mid) } })
        let 果P = await 发一个(配置.NapCat, 'send_private_msg', 体)
        if (!果P.ok && 带引P) { 体.message.shift(); 果P = await 发一个(配置.NapCat, 'send_private_msg', 体) }
        出.push(果P)
        if (i < 段们.length - 1) await new Promise((r) => setTimeout(r, 发段延迟))
      }
      for (const x of 图数据) {
        出.push(await 发一个(配置.NapCat, 'send_private_msg', { user_id: Number(配置.私聊QQ), message: [一段图(x)] }))
        await new Promise((r) => setTimeout(r, 发段延迟))
      }
    }
    if (配置.转群 && 配置.群号 && 路.来路 === 'group') {
      for (let i = 0; i < 段们.length; i++) {
        const 体 = 群消息体(段们[i])
        体.group_id = Number(配置.群号)
        if (i === 0 && 路.艾特) 体.message.unshift({ type: 'at', data: { qq: String(路.艾特) } })
        const 带引G = i === 0 && 路.mid && 路.mid !== 'qq' && Array.isArray(体.message)
        if (带引G) 体.message.unshift({ type: 'reply', data: { id: String(路.mid) } })
        let 果G = await 发一个(配置.NapCat, 'send_group_msg', 体)
        if (!果G.ok && 带引G) { 体.message.shift(); 果G = await 发一个(配置.NapCat, 'send_group_msg', 体) }
        出.push(果G)
        if (i < 段们.length - 1) await new Promise((r) => setTimeout(r, 发段延迟))
      }
      for (const x of 图数据) {
        出.push(await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: (路.艾特 ? [{ type: 'at', data: { qq: String(路.艾特) } }] : []).concat([一段图(x)]) }))
        await new Promise((r) => setTimeout(r, 发段延迟))
      }
    }
    if (路.来路 === 'group') {
      if (图数据.length) 连纯文 = 0
      else if (段们.length) 连纯文 = Math.min(连纯文 + 段们.length, 12)
    }
    return 出
  }

  /** 一轮真正落地：总开关 / 试运行 在这儿把关。 */
  async function 落地一发(配置, 文字, 图们, 路由) {
    if (已发轮.size > 300) 已发轮.clear() // 防 Set 无限长
    if (!配置.目标会话) return 记账('还没填「目标会话」，不知道该盯哪个，这轮不转')
    // ⭐ 盯的会话已经归档了：别转（人已经不在这儿说话了）
    try {
      const 登记 = ctx.workspaceRegistry || ctx.get('workspaceRegistry')
      const 归档 = new Set((((登记 && 登记.archivedSessionIds) || [])).map(String))
      if (归档.has(String(配置.目标会话))) return 记账('「目标会话」已经归档了，这轮不转（去设置里重新挑一个）')
    } catch (error) {}
    if (!配置.总开关) return 记账('总开关关着，这轮该转但没转')
    const 抠过 = 配置.发图 ? 抠正文图(文字) : { 净文字: 文字, 图: [] }
    const 几张 = (Array.isArray(图们) ? 图们.length : 0) + 抠过.图.length
    const 图标 = 几张 ? `（还有 ${几张} 张图）` : ''
    const 净文 = String(抠过.净文字 || '')
    if (配置.试运行) {
      return 记账(`试运行：本来要发到 QQ →「${净文.slice(0, 40)}${净文.length > 40 ? '…' : ''}」${图标}`)
    }
    const 结果 = await 发到QQ(配置, 文字, 图们, 路由)
    const 全过 = 结果.length > 0 && 结果.every((r) => r.ok)
    if (结果.length === 0) {
      记账('转私聊 / 转群都没开，或没填 QQ 号 / 群号，或者这轮既没有文字也没有图（而且图都没转成）：没地方发')
      return
    }
    记账(`${全过 ? '✅ 已发到 QQ：' : '⚠ 发 QQ 有问题：'}「${净文.slice(0, 50)}${净文.length > 50 ? '…' : ''}」${图标}`)
    for (const r of 结果) {
      if (!r.ok) 记账(`   ${r.action} 失败：${JSON.stringify(r.数据).slice(0, 140)}`)
    }
  }

  /** 盯会话事件：记住这一轮最后一句，在 turn/end 时落地。 */
  function 收到事件(session, event) {
    const 配置 = 读配置()
    if (!配置.目标会话) return
    if (String(session && session.id) !== String(配置.目标会话)) return

    if (event && event.type === 'assistant/message') {
      const d = event.data || {}
      if (d.interrupted) {
        if (qq待转轮 > 0) { qq待转轮 -= 1; 路由队.shift() }
        上一轮 = { 轮号: -1, 文本: '', 图们: [] }
        return
      }
      const 文 = String(提取正文(d.message) || '').trim()
      const 图们 = 提取图块(d.message)
      if (文) 上一轮 = { 轮号: d.turn, 文本: 文, 图们 }
      // ⭐ 有的回合是先出图、后出字（或只出图）：别把图丢了
      else if (图们.length) 上一轮 = { 轮号: d.turn, 文本: 上一轮.轮号 === d.turn ? 上一轮.文本 : '', 图们: (上一轮.轮号 === d.turn ? 上一轮.图们 : []).concat(图们).slice(0, 10) }
      return
    }

    if (event && event.type === 'turn/end') {
      const d = event.data || {}
      const 完成 = !!(d.reason && d.reason.kind === 'completed')
      const 有东西 = 上一轮.文本 || (上一轮.图们 && 上一轮.图们.length)
      if (完成 && 上一轮.轮号 === d.turn && 有东西 && !已发轮.has(d.turn)) {
        已发轮.add(d.turn)
        if (qq待转轮 > 0) {
          qq待转轮 -= 1
          const 路由 = 路由队.shift() || null
          let 落文 = String(上一轮.文本 || '')
          if (落文.indexOf('【收尾】') !== -1) {
            落文 = 落文.replace(/【收尾】/g, '').trim()
            if (路由 && 路由.话) { 热聊.delete(路由.话); 记账('她收尾了话题，' + 路由.话 + ' 的陪聊窗已关（再@才会理）') }
          }
          let 画描 = ''
          const 画match = 落文.match(/【画待[:：]([\s\S]*?)】/)
          if (画match) { 画描 = String(画match[1] || '').trim() || '对方刚才要的东西'; 落文 = 落文.replace(/【画待[:：][\s\S]*?】/g, '').trim() }
          const 有料 = 落文 || (上一轮.图们 && 上一轮.图们.length)
          if (落文.trim() === '略过' && !(上一轮.图们 && 上一轮.图们.length)) 记账('她选择略过这条，不发 QQ')
          else if (有料) void 落地一发(配置, 落文, 上一轮.图们, 路由)
          else 记账('这条剥掉标记后没内容，不发')
          if (画描) {
            void (async () => {
              await new Promise((r) => setTimeout(r, 1200))
              const ag = 找agent(配置.目标会话)
              if (!ag) { 记账('画待：会话没醒，画不成了'); return }
              qq待转轮 += 1
              路由队.push({ 来路: 路由 ? 路由.来路 : 'private', 艾特: (路由 && (路由.话 || 路由.艾特)) || 0, 话: (路由 && 路由.话) || 0, mid: (路由 && 路由.mid) || '' })
              try {
                await ag.followup({ id: String(Date.now()) + '-' + Math.random().toString(36).slice(2), role: 'user', source: { kind: 'qq' }, content: [{ type: 'text', text: '（系统提示，对方看不到）现在开始画：' + 画描 + '。画法：Bash 跑 python3 /opt/qq-cs/draw.py 描述 --size=1024x1024，它会打印成图路径；把该路径单独成行放在回复最后，配一句自然的话（比如 来啦，久等了）。画失败就老实说没画出来，别硬编路径。' }] })
              } catch (e) { 记账('画待注入失败：' + String((e && e.message) || e)) }
            })()
          }
        } else {
          记账('这轮不是 QQ 转过来的（多半是网页控制台里直接问的），不发 QQ')
        }
      } else if (!完成 && qq待转轮 > 0) {
        qq待转轮 -= 1; 路由队.shift(); 记账('这轮没正常跑完，不发 QQ')
      }
      上一轮 = { 轮号: -1, 文本: '', 图们: [] }
    }
  }

  // ---------- 路由（将来给设置页用；现在也能用来手动试） ----------

  const 回 = (res, o) => {
    try {
      res.setHeader?.('content-type', 'application/json; charset=utf-8')
      res.end?.(JSON.stringify(o))
    } catch (error) {}
  }

  const 读体 = async (req) => {
    let body = ''
    try {
      for await (const chunk of req) body += chunk
    } catch (error) {}
    try {
      return JSON.parse(body || '{}')
    } catch (error) {
      return {}
    }
  }

  const 短id = (id) => {
    const s = String(id)
    return s.length <= 8 ? s : s.slice(-8)
  }

  /* 拿目标会话活着的 agent：带 / 不带 `session-` 前缀两个方向都试（照 speak-up 的写法）。 */
  const 找agent = (id) => {
    const 原 = String(id == null ? '' : id).trim()
    if (原 === '') return undefined
    const 候选 = [原]
    if (原.startsWith('session-')) 候选.push(原.slice('session-'.length))
    else 候选.push('session-' + 原)
    for (const 一个 of 候选) {
      try {
        const a = ctx.agents.get(一个)
        if (a !== undefined) return a
      } catch (error) {}
    }
    return undefined
  }

  const 新id = () => {
    try {
      return randomUUID()
    } catch (error) {
      return 'qq-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    }
  }

  /** 手搓一条 user 消息（跟 speak-up 一样：role=user，source.kind 标成 qq，不冒充她亲手打的）。 */
  const 手搓用户消息 = (文案) => ({
    id: 新id(),
    role: 'user',
    content: [{ type: 'text', text: String(文案) }],
    source: { kind: 'qq' },
  })

  /** 现在开着的会话清单（id + 标题），给设置页挑「目标会话」用 —— 不手填。 */
  const 会话清单 = () => {
    const 出 = []
    // ⭐ 归档的会话不列（归档只是藏起来，list() 里还在 —— 得单独查 workspaceRegistry 的名单）
    //   2026-10-20 修：以前完全不看归档，设置页里挑会话时混着一堆已经归档的
    const 归档 = new Set()
    try {
      const 登记 = ctx.workspaceRegistry || ctx.get('workspaceRegistry')
      for (const x of (登记 && 登记.archivedSessionIds) || []) 归档.add(String(x))
    } catch (error) {}
    try {
      const 会话服务 = ctx.get('sessions')
      const 标题服务 = ctx.get('sessionTitle')
      if (会话服务 && typeof 会话服务.list === 'function') {
        for (const s of 会话服务.list()) {
          if (归档.has(String(s.id))) continue
          let 标题 = ''
          try {
            const 快照 = 标题服务 && typeof 标题服务.get === 'function' ? 标题服务.get(s) : undefined
            标题 = 快照 && 快照.title ? String(快照.title) : ''
          } catch (error) {}
          出.push({ id: String(s.id), 标题 })
        }
      }
    } catch (error) {}
    return 出
  }

  const 概况 = async () => {
    const 配置 = 读配置()
    const 清单 = 会话清单()
    let NapCat状态 = null
    try {
      const r = await fetch(`${配置.NapCat}/get_login_info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const j = await r.json()
      if (j && j.status === 'ok') NapCat状态 = { 用户: j.data.user_id, 昵称: j.data.nickname }
    } catch (error) {
      NapCat状态 = { 错: String((error && error.message) || error) }
    }
    return { ok: true, 版本, 配置, 配置文件, NapCat状态, 活着的会话: 清单, 目标情况: 配置.目标会话 && 清单.length ? 清单.filter((x) => x.id === 配置.目标会话) : [], 日志 }
  }

  const 路线 = (路径, handler) =>
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: 路径,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            回(res, { ok: false, 说: String((error && error.message) || error) })
          }
        },
      }),
    )

  路线(`${路由前缀}/state`, async (req, res) => {
    await 读体(req)
    回(res, await 概况())
  })

  路线(`${路由前缀}/save`, async (req, res) => {
    const 来 = await 读体(req)
    const 现在 = 读配置()
    const 新 = { ...现在, ...(来 && typeof 来 === 'object' ? 来 : {}) }
    const 洗好 = 归一化(新)
    if (!写配置(洗好)) return 回(res, { ok: false, 说: `写不进配置文件：${配置文件}` })
    const 状态 = 洗好.总开关 ? (洗好.试运行 ? '（只记账）' : '（真发）') : '（总开关关着）'
    记账(`设置已保存：目标会话 ${洗好.目标会话 || '（没填）'}｜私聊 ${洗好.私聊QQ || '（没填）'}｜群 ${洗好.群号 || '（没填）'}｜${状态}`)
    回(res, { ...(await 概况()), 说: '保存好了' })
  })

  // 收到 QQ 里你发来的话 → 喂进目标会话，让它照常开一轮。
  // ⚠ 这是「QQ → DSH」那半的**入口函数**：一句正文（+ 图）→ agent.followup 走 DSH 自己的回合。
  // ⭐ 2026-10-22：加了图片。图会先落一份到 `~/.dsh/qq-bridge-inbox/`，再把图交给 DSH 的
  //    attachments；模型能看图就直接看，纯文本模型拿到的是一句占位文字 —— 所以文字里也写上本地路径。
  let 最后来路 = 'private'
  let 来路时刻 = 0
  let 艾特我人 = 0
  let 艾特时刻 = 0
  const 热聊 = new Map()
  const 路由队 = []
  // 合并缓冲：有人连珠炮时等他说完，合成一条再转（私聊5秒/群聊7秒静默窗）
  const 缓聊 = new Map()
  function 加缓冲(键, 项) {
    let b = 缓聊.get(键)
    if (!b) { b = { texts: [], images: [], mid: '', first: Date.now(), last: 0, at: 0, speaker: 0, route: 项.route, name: 项.name }; 缓聊.set(键, b) }
    if (项.text && 项.text.trim()) b.texts.push(项.text.trim())
    if (项.images && 项.images.length) b.images.push(...项.images.slice(0, 4))
    b.mid = 项.mid || b.mid
    b.last = Date.now()
    if (项.at) b.at = 项.at
    b.speaker = 项.speaker || b.speaker
    b.name = 项.name || b.name
    b.route = 项.route
  }
  // patch19 读空气：群消息转发前，抓最近10分钟的群聊现场给模型当背景
  async function 现场气氛(配置) {
    try {
      const r = await fetch(`${配置.NapCat}/get_group_msg_history`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ group_id: Number(配置.群号), count: 14 }),
      })
      const j = await r.json()
      const msgs = (j && j.status === 'ok' && j.data && j.data.messages) || []
      const 现在 = Math.floor(Date.now() / 1000)
      const 行们 = []
      for (const m of msgs) {
        if (!m || 现在 - (m.time || 0) > 600) continue
        const 谁 = String((m.sender && (m.sender.card || m.sender.nickname)) || '群友').slice(0, 12)
        const 话 = (Array.isArray(m.message) ? m.message : []).map((x) => {
          if (!x) return ''
          if (x.type === 'text' && x.data) return String(x.data.text)
          if (x.type === 'image' || x.type === 'mface') return '[图]'
          if (x.type === 'face') return '[小黄脸]'
          if (x.type === 'at') return '@人'
          return ''
        }).join('').trim().replace(/\s+/g, ' ').slice(0, 40)
        if (话) 行们.push(谁 + '：' + 话)
      }
      return 行们.slice(-8)
    } catch (error) { return [] }
  }
  async function 冲缓冲(配置) {
    const now = Date.now()
    for (const [键, b] of Array.from(缓聊.entries())) {
      const 静默 = b.route === 'private' ? 5000 : 7000
      if (now - b.last < 静默 && now - b.first < 25000) continue
      缓聊.delete(键)
      if (now - b.first > 600000) { 记账('缓冲内容太旧，丢弃'); continue }
      let 文 = '【' + b.name + '】' + b.texts.join('\n')
      if (b.route === 'group') {
        const 气氛 = await 现场气氛(配置)
        if (气氛.length > 1) 文 = '（群聊现场回放，供你读空气用，别人看不到这段）\n' + 气氛.join('\n') + '\n——回放完，刚对你说的是——\n' + 文
      }
      const 果 = await 转入一条(文, b.images, b.mid, b.route, b.at, b.speaker)
      if (果 && 果.ok === false) { b.last = now; 缓聊.set(键, b) }   // 会话没醒：放回，下轮再试
    }
  }
  const 黄脸表 = ['惊讶','撇嘴','色','发呆','得意','流泪','害羞','闭嘴','睡','大哭','尴尬','发怒','调皮','呲牙','惊讶','难过','酷','冷汗','抓狂','吐','偷笑','可爱','白眼','傲慢','饥饿','困','惊恐','流汗','憨笑','大兵','奋斗','咒骂','疑问','嘘','晕','折磨','衰','骷髅','敲打','再见','擦汗','抠鼻','鼓掌','糗大了','坏笑','左哼哼','右哼哼','哈欠','鄙视','委屈','快哭了','阴险','亲亲','吓','可怜','菜刀','西瓜','啤酒','篮球','乒乓','咖啡','饭','玫瑰','凋谢','示爱','爱心','心碎','蛋糕','闪电','炸弹','刀','足球','瓢虫','便便','月亮','太阳','礼物','拥抱','强','弱','握手','胜利','抱拳','勾引','拳头','差劲','爱你','NO','OK','爱情','飞吻','跳跳','发抖','怄火','转圈','磕头','回头','跳绳','挥手','激动','街舞','献吻','左太极','右太极']
  let qq待转轮 = 0
  async function 转入一条(文字, 图们, 消息id, 来路, 艾特谁, 说话人) {
    if (来路 && 来路 !== 'none') { 最后来路 = 来路; 来路时刻 = Date.now() }
    // 私聊轮询自己会清 艾特我人，这里不清，免得 /receive 测试误伤
    const 配置 = 读配置()
    // ⭐ patch22 三句一图：连纯文字够 3 段就在这轮挂提醒（桥计数，不经大脑，别点破）
    if (来路 === 'group' && 连纯文 >= 8) 文字 = String(文字 || '') + '\n（桥的提醒：你在群里已连发 ' + 连纯文 + ' 条纯文字了——本轮挑张对味的表情包甩出去，给气氛浇点油）'
    if (!配置.目标会话) return { ok: false, 说: '还没选「目标会话」' }
    if (!配置.总开关) return { ok: false, 说: '总开关关着，先打开' }
    let agent = 找agent(配置.目标会话)
    if (!agent) {
      const 救果 = await 救会话()
      if (救果 === 'alive') agent = 找agent(配置.目标会话)
    }
    if (!agent) return { ok: false, 说: `目标会话现在没活着（${短id(配置.目标会话)}），自愈也没救回来` }

    // ── 收图：限量、限重，失败就跳过，不挡住文字 ──
    const 收下 = []
    if (配置.收图 && Array.isArray(图们) && 图们.length) {
      const 上限 = Math.max(1, Math.min(Number(配置.收图最多) || 4, 10))
      const 最大 = Math.max(1, Math.min(Number(配置.图上限MB) || 5, 30)) * 1024 * 1024
      let 序 = 0
      for (const 段 of 图们.slice(0, 上限)) {
        序 += 1
        const buf = await 取图字节(段 && 段.data ? 段.data : 段)
        if (!buf || !buf.length) { 记账(`第 ${序} 张图下载失败，跳过`); continue }
        if (buf.length > 最大) { 记账(`第 ${序} 张图太大（${Math.round(buf.length / 1048576)}MB），跳过`); continue }
        const 类 = 看图类(buf)
        收下.push({ 类, b64: buf.toString('base64'), 存: 存一张(`${消息id || 'qq'}-${序}`, buf, 类), 字节: buf.length })
      }
    }

    const 原话 = String(文字 || '').trim()
    const 谁 = String(配置.称呼 || '对方')
    const 说明 = 收下.length
      ? String.fromCharCode(10) + '（' + 谁 + '发了 ' + 收下.length + ' 张图：'
        + 收下.map((x, i) => `第${i + 1}张 ${Math.round(x.字节 / 1024)}KB` + (x.存 ? `，要发回去就用 ${x.存}` : '')).join('；')
        + '）'
      : ''
    const 文案 = (原话 || (收下.length ? '（' + 谁 + '发来了图片，没有配字）' : '')) + 说明
    if (!文案) return { ok: false, 说: '这条既没文字也没图，不转' }

    let content = [{ type: 'text', text: 文案 }]
    if (收下.length) {
      const 附件 = ctx.attachments || ctx.get('attachments')
      if (附件 && typeof 附件.admitPromptContent === 'function') {
        try {
          const 待 = content.concat(收下.map((x, i) => ({
            type: 'image', data: x.b64, mediaType: x.类, name: `qq-${消息id || 'x'}-${i + 1}.${扩展(x.类)}`,
          })))
          content = await 附件.admitPromptContent(待)
          // ⭐ 记下「附件 id / DSH 那份只读副本 → 我们存的原图」，回发时换回原图（GIF 不会变静态 webp）
          const 图块 = content.filter((x) => x && x.type === 'image' && x.attachment)
          for (let i = 0; i < 图块.length && i < 收下.length; i++) {
            let 副本 = ''
            try { 副本 = typeof 附件.imageHostPath === 'function' ? String(附件.imageHostPath(图块[i].attachment) || '') : '' } catch (error) {}
            记收图(图块[i].attachment && 图块[i].attachment.attachmentId, 副本, 收下[i].存)
          }
        } catch (error) {
          记账('图交给 DSH 没成功（这轮只转文字）：' + String((error && error.message) || error))
          content = [{ type: 'text', text: 文案 }]
        }
      } else {
        记账('宿主没有 attachments 服务，图只能存本地（文字里已经给了路径）')
      }
    }

    try {
      // ⚠⚠ 必须 await：followup 返回 Promise。不接住的话，它 reject 时（会话半死 / agent 已释放）
      //   catch 根本看不到（try 早就退出了）⇒ 未处理的 rejection ⇒ **整个 DSH 宿主退出**
      //   （2026-10-21：speak-up 同一个坑已经被用户报成"装了鱼就死了"，这里一并修）
      await agent.followup({ id: 新id(), role: 'user', content, source: { kind: 'qq' } })
      qq待转轮 += 1
      路由队.push({ 来路: 来路 || 最后来路 || 'private', 艾特: Number(艾特谁) || 0, 话: Number(说话人) || 0, mid: String(消息id || '') })
      if (路由队.length > 60) 路由队.shift()
      try {
        if (ctx.sessions && typeof ctx.sessions.flush === 'function') await ctx.sessions.flush(agent.session)
      } catch (error) {}
      const 图话 = 收下.length ? `（含 ${收下.length} 张图）` : ''
      记账(`收到 QQ 里的${收下.length ? '图片' : '话'}${图话} → 转进 DSH：「${(原话 || '（没配字）').slice(0, 50)}${原话.length > 50 ? '…' : ''}」`)
      return { ok: true, 说: '转进去了，它会照常开一轮' }
    } catch (error) {
      return { ok: false, 说: `followup 失败：${String((error && error.message) || error)}` }
    }
  }

  /** 只要文字的那条老入口（给 /receive 路由和测试用） */
  async function 转入文字(文字) {
    return 转入一条(文字, [], '', 'private')
  }

  /**
   * 轮询 NapCat 的 HTTP 历史接口，把「她新发的私聊 / 群消息」一条条转进 DSH。
   * ⚠ 纯 HTTP 轮询：不连 WebSocket、不依赖 BOT。
   * ⚠ 只认 `私聊QQ` 这个人发的（群也一样按这个号过滤），自己的回话不会自我繁殖。
   */
  async function 轮询收消息() {
    const 配置 = 读配置()
    // 总开关关 / 没选会话：只把「上次时间」推到此刻，别开的时候就补一大串旧的
    if (!配置.总开关 || !配置.目标会话) {
      上次私聊时间 = Math.floor(Date.now() / 1000)
      上次群时间 = Math.floor(Date.now() / 1000)
      return
    }
    const 她的号 = Number(配置.私聊QQ) || 0

    const 拉 = async (action, 体) => {
      try {
        const r = await fetch(`${配置.NapCat}/${action}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(体),
        })
        const j = await r.json()
        return j && j.status === 'ok' && Array.isArray(j.data && j.data.messages) ? j.data.messages : []
      } catch (error) {
        return []
      }
    }
    const 条转片段 = (条) => {
      const 段们 = Array.isArray(条.message) ? 条.message : []
      const 文字 = 段们.map((s) => {
        if (!s) return ''
        if (s.type === 'text' && s.data) return String(s.data.text)
        if (s.type === 'face') { const fid = Number(s.data && s.data.id != null ? s.data.id : s.id); return '[' + (黄脸表[fid] || ('表情' + fid)) + ']' }
        return ''
      }).join('').trim()
      // ⭐ 图片 / 表情包都算图（表情包 mface 也带 url，能拿到字节）
      const 图们 = 段们.filter((s) => s && s.data && (s.type === 'image' || s.type === 'mface'))
      return { 文字, 图们 }
    }

    if (配置.转私聊 && 配置.私聊QQ) {
      const 列表 = await 拉('get_friend_msg_history', { user_id: 她的号, count: 10 })
      for (const 条 of 列表.sort((a, b) => (a.time || 0) - (b.time || 0))) {
        if (!条 || Number(条.user_id) !== 她的号) continue
        if ((条.time || 0) < 上次私聊时间) continue           // 旧的，跳过
        if (已转消息.has(条.message_id)) continue             // 转过了
        const { 文字, 图们 } = 条转片段(条)
        if (!文字 && !图们.length) { 已转消息.add(条.message_id); 上次私聊时间 = 条.time || 上次私聊时间; continue }
        if (Date.now() / 1000 - (条.time || 0) > 600) { 已转消息.add(条.message_id); 上次私聊时间 = 条.time || 上次私聊时间; continue } // 超10分钟不挖坟
        // ⭐ patch21 主人指令：桥层直接执行，不进 DSH（零 token）。只认纯文字，带图的当普通消息走
        const 令 = (图们.length || !文字) ? null : 解析主人指令(文字)
        if (令) {
          已转消息.add(条.message_id)
          上次私聊时间 = 条.time || 上次私聊时间
          void 执行主人指令(配置, 令, 文字)
          continue
        }
        艾特我人 = 0
        加缓冲('p' + 她的号, { text: 文字, images: 图们, mid: String(条.message_id || ''), route: 'private', at: 0, speaker: 她的号, name: '主人' })
        上次私聊时间 = 条.time || 上次私聊时间
        已转消息.add(条.message_id)
      }
    }

    if (配置.转群 && 配置.群号) {
      const 列表 = await 拉('get_group_msg_history', { group_id: Number(配置.群号), count: 30 })
      for (const 条 of 列表.sort((a, b) => (a.time || 0) - (b.time || 0))) {
        if (!条) continue
        const 群发言者 = Number(条.user_id)
        if (群发言者 === Number(条.self_id)) continue
        if (群静默中()) { 已转消息.add(条.message_id); continue } // patch45 群静默48h养号：群话不入脑
        // ⭐ patch44 深夜静默：01:00-07:00 群里的话不入脑（主人私聊不拦），三点秒回才是bot铁证
        try {
          const 夜时 = new Date().getHours()
          if (夜时 >= 1 && 夜时 < 7 && 群发言者 !== Number(配置.私聊QQ)) { 已转消息.add(条.message_id); continue }
        } catch (error) {}
        // ⭐ patch37 鲸元券兑奖：口令命中→奖品图即发（零token，先到先得）
        try {
          const 券f = '/opt/qq-cs/.lottery.json'
          if (existsSync(券f) && !禁言中()) {
            const 券 = JSON.parse(readFileSync(券f, 'utf8'))
            if (券.active && !券.won && Date.now() / 1000 < 券.end) {
              const 段G = Array.isArray(条.message) ? 条.message : []
              const 全G = 段G.filter((x) => x.type === 'text').map((x) => (x.data || {}).text || '').join('')
              if (全G.indexOf('鲸元券') !== -1 && 全G.indexOf(String(券.code)) !== -1) {
                const 赢 = String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友').slice(0, 16)
                const 根G = 配置.图片根目录 || '/root/dsh-workspace/stickers/whale'
                let 礼 = ''
                try {
                  const 用 = existsSync(根G + '/.used.json') ? JSON.parse(readFileSync(根G + '/.used.json', 'utf8')) : {}
                  const 备 = readFileSync(根G + '/INDEX.tsv', 'utf8').split('\n').map((x) => x.split('\t')).filter((x) => x[0] && String(x[1] || '').indexOf('鲸元券') === -1 && existsSync(根G + '/' + x[0])).map((x) => ({ f: x[0], n: Number(用[x[0]] || 0) }))
                  备.sort((a, b) => a.n - b.n)
                  if (备.length) 礼 = 备[Math.floor(Math.random() * Math.min(15, 备.length))].f
                } catch (error) {}
                const 发段 = [{ type: 'text', data: { text: '鲸元券 ' + 券.code + ' 被 ' + 赢 + ' 抢到了！奖品奉上🐋' } }]
                if (礼) 发段.unshift(图片段(readFileSync(根G + '/' + 礼).toString('base64')))
                const r2 = await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: 发段 })
                if (r2 && r2.ok) {
                  券.won = true; 券.赢给 = 赢
                  writeFileSync(券f, JSON.stringify(券))
                  记账('鲸元券' + 券.code + '→' + 赢 + (礼 ? (' 奖品' + 礼) : ' 无图'))
                  try { const 史 = existsSync('/opt/qq-cs/lottery_history.txt') ? readFileSync('/opt/qq-cs/lottery_history.txt', 'utf8') : ''; writeFileSync('/opt/qq-cs/lottery_history.txt', 史 + new Date(Date.now() + 8 * 3600000).toISOString().slice(5, 16).replace('T', ' ') + '\t' + 券.code + '\t' + 赢 + '\t' + (礼 || '无') + '\n') } catch (error) {}
                }
              }
            }
          }
        } catch (error) {}
        const 段们G = Array.isArray(条.message) ? 条.message : []
        const 被艾特 = 段们G.some((x) => {
          if (!x || x.type !== 'at') return false
          const q = String((x.data && x.data.qq) || x.qq || '')
          return q === 'all' || Number(q) === Number(条.self_id)
        })
        if (!被艾特) {
          const 热 = 热聊.get(群发言者)
          if (!(热 && Date.now() < 热)) continue        // 不在热聊窗口且没 @ → 装死
          if (段们G.some((x) => x && x.type === 'at' && String((x.data && x.data.qq) || x.qq || '') !== 'all' && Number((x.data && x.data.qq) || 0) !== Number(条.self_id))) continue  // 在叫别人 → 不接茬
          热聊.set(群发言者, Date.now() + (群发言者 === Number(配置.私聊QQ) ? 600000 : 180000)) // patch25滑窗：收到即续期
        } else {
          热聊.set(群发言者, Date.now() + (群发言者 === Number(配置.私聊QQ) ? 600000 : 180000)) // 被@：常人3分钟，主人10分钟
          if (热聊.size > 40) { const k = 热聊.keys().next().value; 热聊.delete(k) }
        }
        if ((条.time || 0) < 上次群时间) continue
        if (已转消息.has(条.message_id)) continue
        const { 文字, 图们 } = 条转片段(条)
        if (!文字 && !图们.length) { 已转消息.add(条.message_id); 上次群时间 = 条.time || 上次群时间; continue }
        if (Date.now() / 1000 - (条.time || 0) > 600) { 已转消息.add(条.message_id); 上次群时间 = 条.time || 上次群时间; continue } // 超10分钟不挖坟
        艾特我人 = 群发言者 || 艾特我人
        艾特时刻 = Date.now()
        const 名前 = 群发言者 === Number(配置.私聊QQ) ? '主人' : String((条.sender && (条.sender.card || 条.sender.nickname)) || '群友')
        加缓冲('g' + 群发言者, { text: 文字, images: 图们, mid: String(条.message_id || ''), route: 'group', at: 被艾特 ? 群发言者 : 0, speaker: 群发言者, name: 名前 })
        上次群时间 = 条.time || 上次群时间
        已转消息.add(条.message_id)
      }
    }

    await 冲缓冲(配置)
    if (已转消息.size > 300) 已转消息.clear()
  }

  // ============================================================
  // patch21 主人指令：私聊里【仅主人】的管桥命令，桥层执行、零 token、不进 DSH
  // ============================================================
  let 禁言到 = 0 // 限时静音的截止时刻
  let 无限禁言 = false // 无限静音，直到「开口」
  const 禁言中 = () => 无限禁言 || Date.now() < 禁言到

  function 解析主人指令(文) {
    const 原始 = String(文 || '').trim()
    if (!原始) return null
    const 强令 = /^[/／>＞]/.test(原始)
    const t = 原始.replace(/^[/／>＞]+/, '').trim()
    const 净 = t.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, '')
    const 剥 = t.replace(/^[/／>＞「」『』【】\[\]()（）“”‘’'""]+/, '').replace(/[。！!？~～、，,「」『』【】\[\]()（）“”‘’'""]+$/, '').replace(/^[/／>＞「」『』【】\[\]()（）]+|[。！!？~～、，,\s]+$/g, '').trim()
    if (!剥) return null
    if (/^(查余额|余额|balance)$/i.test(剥)) return { cmd: '余额' }
    if (/^(状态|status)$/i.test(剥)) return { cmd: '状态' }
    if (/^(帮助|指令|help)$/i.test(剥)) return { cmd: '帮助' }
    if (/^冷却$/.test(剥)) return { cmd: '冷却' }
    if (/^开口$/.test(剥)) return { cmd: '开口' }
    let m = 剥.match(/^闭嘴[  ]*(\d{1,4})?$/)
    if (m) return { cmd: '闭嘴', arg: m[1] || '' }
    m = 剥.match(/^日志[  ]*(\d{1,2})?$/)
    if (m) return { cmd: '日志', arg: m[1] || '' }
    m = 剥.match(/^(去群里说|替我说|群里发)[  ]+([\s\S]+)$/)
    if (m && m[2].trim()) return { cmd: '群里说', arg: m[2].trim() }
    m = 剥.match(/^(?:发|开|来|整|甩)[  ]*(?:张|个)?[  ]*(?:鲸元券|抽奖)$/)
    if (m) return { cmd: '券' }
    m = 剥.match(/^禁言[  ]+(\S+?)(?:[  ]+(\d{1,4}))?$/)
    if (m && m[1]) return { cmd: '管', act: 'ban', who: m[1], min: Number(m[2] || 10) }
    m = 剥.match(/^(?:解禁|放人)[  ]+(\S+)$/)
    if (m) return { cmd: '管', act: 'unban', who: m[1] }
    m = 剥.match(/^踢[  ]+(\S+)$/)
    if (m) return { cmd: '管', act: 'kick', who: m[1] }
    // —— 自然语言兜底：精确口令没中才走这，保守防误伤 ——
    if (净.length > 30 && !强令 && !/(去群里说|替我说|群里发|通知群)/.test(净)) return null
    const 候选 = []
    const 打分 = (令, 分) => 候选.push({ 令, 分 })
    const 分钟 = (() => {
      const a2 = t.match(/(\d{1,4})\s*分钟/); if (a2) return Number(a2[1])
      const b2 = t.match(/(\d{1,3})\s*(?:个)?(?:小时|h)/i); if (b2) return Number(b2[1]) * 60
      if (/半\s*(?:个)?小时/.test(t)) return 30
      const 数 = { 一: 1, 两: 2, 俩: 2, 三: 3, 五: 5, 十: 10, 十五: 15, 二十: 20, 三十: 30 }
      const c2 = t.match(/(十五|二十|三十|一|两|俩|三|五|十)\s*分钟/); if (c2) return 数[c2[1]] || 10
      return 0
    })()
    if (/余额|额度|balance|钱(?:还)?(?:剩|够|多少)|(?:还有|还剩)多少(?:钱|块)/i.test(净) && (净.length <= 10 || /查|看|还有|剩|多少|够|报|差/.test(净) || 强令)) 打分({ cmd: '余额' }, 3)
    if (/(鲸元券|抽奖)/.test(净) && 净.length <= 12) 打分({ cmd: '券' }, 3)
    if (/^(?:你的?|现在|目前)?(?:状态|运行情况|健康)/.test(净) && 净.length <= 14) 打分({ cmd: '状态' }, 3)
    if (/(状态|运行|活着|在线|挂没挂).{0,3}(怎样|如何|咋样|情况|吗)/.test(净)) 打分({ cmd: '状态' }, 3)
    if (/^(?:帮助|有什么(?:功能|指令)|指令(?:表|列表)?|都会(?:啥|什么)|能干(?:啥|什么)|你能干)/.test(净)) 打分({ cmd: '帮助' }, 3)
    if (/(闭嘴|安静|别说话|不要说话|先别说|消停|停嘴)/.test(净) && 净.length <= 16) 打分({ cmd: '闭嘴', arg: String(分钟 || 30) }, 3)
    if (/^(?:开口|解除静音|恢复说话|可以(?:继续)?说(?:话)?了?|继续说)/.test(净)) 打分({ cmd: '开口' }, 3)
    if (/^(?:翻?日志|看看日志)/.test(净)) { 打分({ cmd: '日志', arg: (t.match(/(\d{1,2})/) || [])[1] || '' }, 3) }
    if (/^(?:重置|清空)?冷却/.test(净) && 净.length <= 8) 打分({ cmd: '冷却' }, 3)
    m = t.match(/(?:去群里说|替我说|群里发|跟?群里(?:说|发)(?:一句|一声)?|通知群(?:里)?|帮我发(?:到|去|进)?群(?:里)?)[\s:：，,]*(.+)$/s)
    if (m && m[1].trim()) 打分({ cmd: '群里说', arg: m[1].trim() }, 3)
    const 抓目标 = (src) => {
      const 洗 = (x) => { let y = String(x).replace(/[@＠]/g, ''); for (let q = 0; q < 3; q++) { y = y.replace(/^(?:请|麻烦|帮我|帮忙|立刻|马上|赶紧|快点|去|把|将|在|咱|我|你|他|她)+/, '').replace(/^(?:群里|群内|我们群|这个群|群里|群)+/, '').replace(/^(?:的|叫|是|那位|那个|这个|名叫|叫做)+/, '').replace(/^(?:里|内|们)+/, '') } y = y.replace(/[了哈呀吗吧呗嘛的]+$/, ''); return y.replace(/[^0-9A-Za-z\u4e00-\u9fff@]/g, '').trim() }
      let k = src.match(/[「『"'"']([^「』"'"']{1,14})[」』"'"']/)
      if (k) return 洗(k[1])
      k = src.match(/(?:把|帮|替|给)\s*([^,，。;；!！?？\s]{1,16}?)\s*(?:关禁闭|禁言|禁了|踢出|踢掉|移出|请出|赶出|解禁|别禁了?|不用禁了?|放)/)
      if (k && 洗(k[1])) return 洗(k[1])
      k = src.match(/(?:禁言|解禁|别禁了?|不用禁了?|放人|关禁闭|踢出|踢掉|移出群|请出|赶出|踢|静音)(?:一下|下|了)?\s*(?:谁|一下)?\s*([^,，。;；!！?？\s]{1,16}?)(?:吧|呗|哈|呀|吗|嘛)?(?=\s*(?:\d+|[一二两俩三四五六七八九十]+)?\s*(?:分钟|小时|半|钟头)?\s*$|[\s,，。!！?？])/)
      if (k && 洗(k[1]) && !/^[\d一二两俩三四五六七八九十半]+$/.test(洗(k[1]))) return 洗(k[1])
      k = src.match(/([0-9A-Za-z\u4e00-\u9fff]{1,14}?)(?:同学|老师)?(?:\s*(?:给我)?(?:去)?(?:关?禁言|禁了|关禁闭|踢出|踢掉|移出群|请出去|解禁))/)
      if (k && 洗(k[1])) return 洗(k[1])
      const q = src.match(/\d{5,12}/)
      if (q) return q[0]
      return ''
    }
    const 目标 = 抓目标(t)
    if (/解禁|取消禁言|(?:别|不用|解除)(?:禁|关禁闭|再禁)|放人/.test(净)) 打分({ cmd: '管', act: 'unban', who: 目标 }, 3)
    if (/禁言|关禁闭|禁了|关起来/.test(净)) 打分({ cmd: '管', act: 'ban', who: 目标, min: 分钟 || 10 }, 3)
    if (/(踢出|踢了|踢掉|^踢|移出群|请出|赶出)/.test(净) && 目标) 打分({ cmd: '管', act: 'kick', who: 目标 }, 3)
    if (!候选.length) return null
    候选.sort((a2, b2) => b2.分 - a2.分)
    if (候选.length > 1 && 候选[0].分 === 候选[1].分 && 候选[0].令.cmd !== 候选[1].令.cmd) {
      return { cmd: '冲突', 说: '这条想当指令但拿不准是「' + 候选.map((c) => c.令.cmd).join('/') + '」——说明确点，或开头加个 / 我就当铁了心' }
    }
    return 候选[0].令
  }

  function 读DEEPSEEK密钥() {
    try {
    const txt = readFileSync('/root/.dsh/.credentials.yaml', 'utf8')
      const m = txt.match(/DEEPSEEK_API_KEY[^\S\r\n]*:[^\S\r\n]*([^\s"']+)/)
      return m ? m[1] : ''
    } catch (e) { return '' }
  }

  async function 执行主人指令(配置, 令, 原文) {
    const 答 = async (文) => {
      const 果 = await 发一个(配置.NapCat, 'send_private_msg', {
        user_id: Number(配置.私聊QQ), message: [{ type: 'text', data: { text: String(文).slice(0, 500) } }],
      })
      if (!果.ok) 记账('指令回执发不出去：' + JSON.stringify(果.数据).slice(0, 120))
    }
    记账(`主人指令：${String(原文).slice(0, 40)}`)
    try {
      if (令.cmd === '冲突') return 答(令.说)
            if (令.cmd === '帮助') {
        return 答('我会的这些，随口说就行：查余额｜状态｜日志N｜闭嘴(可带分钟)｜开口｜冷却｜去群里说…｜禁言 谁 几分钟｜解禁 谁｜踢 谁｜发张鲸元券。前缀加 / = 铁了心发指令；我办完都会回你一声')
      }
      if (令.cmd === '余额') {
        const 钥 = 读DEEPSEEK密钥()
        if (!钥) return 答('我翻不到自己的钥匙（credentials 没配 DEEPSEEK_API_KEY），查不了账喵')
        const r = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: 'Bearer ' + 钥 } })
        if (!r.ok) return 答('账房不回话（HTTP ' + r.status + '），待会儿再试喵')
        const j = await r.json()
        const b = ((j && j.balance_infos) || [])[0] || {}
        if (!(j && j.is_available) || !b.currency) return 答('接口说这账户不可用了——多半欠费，快看看喵！')
        return 答(`摸摸口袋：还剩 ¥${b.total_balance}（你充的 ${b.topped_up_balance}，白送的 ${b.granted_balance}）`) 
      }
      if (令.cmd === '状态') {
        const 最 = 日志.length ? 日志[日志.length - 1] : { 时间: '-', 文本: '-' }
        return 答(`📊 桥已跑 ${(process.uptime() / 60).toFixed(0)} 分钟｜总开关 ${配置.总开关 ? '开' : '关'}｜试运行 ${配置.试运行 ? '是' : '否'}｜发图 ${配置.发图 ? '有' : '无'}\n静音：${禁言中() ? '🔇 开着' : '没'}${无限禁言 ? '（直到开口）' : ''}\n热聊窗 ${热聊.size} 人｜去重队列 ${已转消息.size}\n最后一条：${最.时间} ${String(最.文本).slice(0, 50)}`)
      }
      if (令.cmd === '券') {
        const 根 = 配置.图片根目录 || '/root/dsh-workspace/stickers/whale'
        let 券图 = ''
        try {
          for (const l of readFileSync(根 + '/INDEX.tsv', 'utf8').split('\n')) { const p = l.split('\t'); if (p[0] && String(p[1] || '').indexOf('鲸元券') !== -1 && existsSync(根 + '/' + p[0])) { 券图 = 根 + '/' + p[0]; break } }
        } catch (error) {}
        const code = 100 + Math.floor(Math.random() * 900)
        const 文 = '手感来了！甩了张鲸元券，口令「鲸元券 ' + code + '」，最先喊到的领一张奖品表情包🐋（两小时有效，别作弊哈）'
        const 段 = [{ type: 'text', data: { text: 文 } }]
        if (券图) 段.unshift(图片段(readFileSync(券图).toString('base64')))
        const r = await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: 段 })
        if (!r.ok) return 答('群里没发出去（' + ((r.数据 && r.数据.message) || '接口不通') + '）')
        writeFileSync('/opt/qq-cs/.lottery.json', JSON.stringify({ active: true, code: code, end: Date.now() / 1000 + 7200, won: false }))
        try { writeFileSync('/opt/qq-cs/.lottery_last.txt', new Date().toLocaleDateString('sv')) } catch (error) {}
        记账('手动开奖 口令' + code)
        return 答('开了！口令「鲸元券 ' + code + '」，两小时有效——第一个在群里喊对的，我当场发奖品图')
      }
      if (令.cmd === '管') {
        const 群号N = Number(配置.群号)
        if (!令.who) return 答('要管谁呀？名字或QQ号给我一个喵')
        let uid = /^\d{5,12}$/.test(String(令.who)) ? Number(令.who) : 0
        let 名片 = String(令.who)
        if (!uid) {
          const 员 = await 发一个(配置.NapCat, 'get_group_member_list', { group_id: 群号N, no_cache: true })
          const 们 = Array.isArray((员.数据 && 员.数据.data)) ? 员.数据.data : []
          const key = String(令.who).replace(/[@＠]/g, '').trim()
          const 中 = 们.filter((x) => String(x.card || '').includes(key) || String(x.nickname || '').includes(key))
          if (中.length === 1) { uid = Number(中[0].user_id); 名片 = String(中[0].card || 中[0].nickname || key) }
          else if (中.length > 1) return 答('「' + key + '」对上的有好几个：' + 中.map((x) => (x.card || x.nickname) + '(' + x.user_id + ')').join('、') + '——报全名或号吧')
          else return 答('群里翻遍了，没找到像「' + key + '」的喵——名字差个字你说清楚点')
        }
        if (uid === Number(配置.她的QQ)) return 答('我是管理哎，QQ 不让管理禁管理，这条对我无效喵')
        const 令体 = { group_id: 群号N, user_id: uid }
        let r, 成
        if (令.act === 'ban') { 令体.duration = Math.min(Math.max(Number(令.min) || 10, 1), 1440) * 60; r = await 发一个(配置.NapCat, 'set_group_ban', 令体); 成 = '禁了 ' + 名片 + ' ' + Math.round(令体.duration / 60) + ' 分钟，世界安静了' }
        else if (令.act === 'unban') { 令体.duration = 0; r = await 发一个(配置.NapCat, 'set_group_ban', 令体); 成 = 名片 + ' 放出来了' }
        else { r = await 发一个(配置.NapCat, 'set_group_kick', 令体); 成 = '把 ' + 名片 + ' 请出去了……这一脚我替你踹的' }
        if (!r.ok) {
          const msg = String((r.数据 && (r.数据.message || r.数据.retcode)) || '未知')
          记账('主人指令→' + 令.act + ' ' + 令.who + '(' + uid + ') ✗ ' + msg)
          if (/admin/i.test(msg)) return 答(名片 + ' 跟我一样是管理，管理之间管不了喵——要动他得你亲自上')
          if (/uid|not in group|member/i.test(msg)) return 答(名片 + ' 好像不在群里，这单我接不住喵')
          return 答('QQ 回我一句「' + msg + '」，事没办成喵')
        }
        记账('主人指令→' + 令.act + ' ' + 令.who + '(' + uid + ') ✓')
        if (令.act !== 'unban') {
          const 分 = Math.round(令体.duration / 60) || 0
          const 延 = 60000 + Math.floor(Math.random() * 90000)
          setTimeout(() => {
            if (禁言中()) return
            const 话 = 令.act === 'ban'
              ? '〔桥的事件〕你刚把「' + 名片 + '」关进小黑屋' + (分 ? (' ' + 分 + ' 分钟') : '') + '，是主人下的令。现在在群里随口吐槽一句这事——就一句，自然点，像干完活顺手哼一声，别复述流程别自夸别提桥和主人指令'
              : '〔桥的事件〕你刚按主人的令把「' + 名片 + '」请出群了，这动静不小。看群里气氛决定要不要说一句——打哈哈或装没事都行，自然为主，别说教'
            void 转入一条(话, [], '', 'group', 0, 0)
            记账('吐槽事件已投递：' + 名片)
          }, 延)
        }
        return 答(成)
      }
      if (令.cmd === '闭嘴') {
        if (令.arg) {
          const 分 = Math.min(Number(令.arg), 1440)
          禁言到 = Date.now() + 分 * 60000; 无限禁言 = false
          return 答(`🔇 静音 ${分} 分钟。群聊私聊全拦，主动冒泡也停（不烧token）`)
        }
        无限禁言 = true; 禁言到 = 0
        return 答('🔇 已静音，直到你说「开口」')
      }
      if (令.cmd === '开口') {
        无限禁言 = false; 禁言到 = 0
        return 答('🔊 解禁，正常说话')
      }
      if (令.cmd === '冷却') {
        热聊.clear()
        try { 上次戳.clear() } catch (error) {}
        return 答('♻️ 热聊窗和防刷屏表已清空')
      }
      if (令.cmd === '日志') {
        const n = Math.min(Number(令.arg || 3) || 3, 8)
        const 尾 = 日志.slice(-n).map((l) => `${l.时间} ${String(l.文本).slice(0, 60)}`).join('\n')
        return 答(尾 || '（账本还空）')
      }
      if (令.cmd === '群里说') {
        if (!配置.转群 || !配置.群号) return 答('❌ 群通道没开或没群号')
        const 文 = String(令.arg).slice(0, 300)
        const 果 = await 发一个(配置.NapCat, 'send_group_msg', { group_id: Number(配置.群号), message: [{ type: 'text', data: { text: 文 } }] })
        return 答(果.ok ? `✅ 已代发进群：「${文.slice(0, 40)}」` : '❌ 群发失败：' + JSON.stringify(果.数据).slice(0, 120))
      }
      return 答('❌ 不认识的指令，发「帮助」看表')
    } catch (error) {
      记账('指令执行出错：' + String((error && error.message) || error))
      try { return await 答('❌ 执行出错：' + String((error && error.message) || error).slice(0, 80)) } catch (e2) {}
    }
  }

  // patch22 调试：查看/设置连文字计数（token 已把门）
  路线(`${路由前缀}/streak`, async (req, res) => {
    const 来 = await 读体(req)
    if (来.set !== undefined) 连纯文 = Math.max(0, Math.min(Number(来.set) || 0, 12))
    回(res, { ok: true, 连纯文 })
  })

  // 调试入口：节点侧模拟主人指令（走与 QQ 私聊同一执行器）
  路线(`${路由前缀}/master-cmd`, async (req, res) => {
    const 来 = await 读体(req)
    const 文 = typeof 来.text === 'string' ? 来.text : ''
    const 令 = 解析主人指令(文)
    if (!令) return 回(res, { ok: false, 说: '不是指令' })
    void 执行主人指令(读配置(), 令, 文)
    回(res, { ok: true, 说: '指令执行中，回执看主人私聊' })
  })
  路线(`${路由前缀}/parse-test`, async (req, res) => {
    const 来 = await 读体(req)
    const 文 = typeof 来.text === 'string' ? 来.text : ''
    let 令 = null
    try { 令 = 解析主人指令(文) } catch (e) { 令 = { cmd: '解析炸了', 说: String((e && e.message) || e) } }
    回(res, { ok: true, 令 })
  })

    const 救会话 = async () => {
      const 配置 = 读配置()
      try {
        const a2 = ctx.agents && typeof ctx.agents.get === 'function' ? ctx.agents.get(配置.目标会话) : null
        return a2 ? 'alive' : 'dead'
      } catch (error) {
        return 'err:' + String((error && error.message) || error).slice(0, 60)
      }
    }

  路线(`${路由前缀}/sess-alive`, async (req, res) => {
    let 状 = 'alive'
    try { 状 = await 救会话() } catch (e) { 状 = 'err:' + String((e && e.message) || e).slice(0, 60) }
    回(res, { ok: 状 === 'alive', 状 })
  })

  路线(`${路由前缀}/sess-probe`, async (req, res) => {
    const pick = (sv) => { try { const st = new Set(); let o = sv; while (o && o !== Object.prototype) { for (const k of Object.getOwnPropertyNames(o)) st.add(k); o = Object.getPrototypeOf(o) } return Array.from(st).slice(0, 45) } catch (e) { return 'ERR:' + String(e).slice(0, 60) } }
    const out = {}
    try { out.sessions = pick(ctx.get('sessions')) } catch (e) { out.sessions = 'get炸:' + String(e).slice(0, 50) }
    try { out.agents = pick(ctx.get('agents')) } catch (e) { out.agents = 'get炸:' + String(e).slice(0, 50) }
    回(res, { ok: true, ...out })
  })

  路线(`${路由前缀}/receive`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字（body 里给 text）' })
    回(res, await 转入文字(文字))
  })

  // 主动冒泡/复盘：cron 注入提示词；channel=group 发群（默认），channel=none 内部轮不发 QQ
  路线(`${路由前缀}/nudge`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字' })
    const 道 = 来.channel === 'none' ? 'none' : (来.channel === 'private' ? 'private' : 'group')
    if (道 === 'group' && 禁言中()) return 回(res, { ok: true, 说: '禁言中，冒泡已挡' })
    if (道 === 'group' && 群静默中()) return 回(res, { ok: true, 说: '群静默48h中，冒泡已挡' })
    回(res, await 转入一条(文字, [], '', 道, 0, 0))
  })

  // patch20 戳一戳感知：eventd 把 NapCat 的 poke 通知转来；同人30秒冷却防连戳刷屏
  const 上次戳 = new Map()
  路线(`${路由前缀}/poke`, async (req, res) => {
    const 来 = await 读体(req)
    const uid = Number(来.user_id) || 0
    const gid = Number(来.group_id) || 0
    if (!uid) return 回(res, { ok: false, 说: '没有 user_id' })
    const 配置 = 读配置()
    const 前 = 上次戳.get(uid) || 0
    if (Date.now() - 前 < 30000) return 回(res, { ok: true, 说: '戳一戳冷却中，忽略' })
    上次戳.set(uid, Date.now())
    if (上次戳.size > 60) 上次戳.clear()
    if (gid && Number(配置.群号) !== gid) return 回(res, { ok: true, 说: '别的群的戳，不管' })
    let 名 = '有人'
    try {
      const r = await fetch(`${配置.NapCat}/${gid ? 'get_group_member_info' : 'get_stranger_info'}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(gid ? { group_id: gid, user_id: uid } : { user_id: uid }),
      })
      const j = await r.json()
      const d = (j && j.data) || {}
      名 = String(d.card || d.nickname || d.nick || '有人').slice(0, 16)
    } catch (error) {}
    if (禁言中()) return 回(res, { ok: true, 说: '禁言中，这下先挡了' })
    记账(`戳一戳通知：${名}(${uid}) ${gid ? '在群里' : '私聊'}戳了她`)
    if (gid) 热聊.set(uid, Date.now() + (uid === Number(配置.私聊QQ) ? 600000 : 180000)) // patch25：戳当被叫，开陪聊窗
    if (!禁言中()) setTimeout(() => {
      void 发一个(配置.NapCat, gid ? 'group_poke' : 'friend_poke', gid ? { group_id: gid, user_id: uid } : { user_id: uid })
        .then((r) => 记账(`自动回戳 ${名}(${uid}) ${gid ? '群' : '私'}：${r.ok ? '✓' : '✗'}`))
    }, 3000 + Math.floor(Math.random() * 4000))
    回(res, await 转入一条(`【${名}】戳了戳你（QQ ${uid}——已经替你自动回戳过一下了，你只管俏皮接话，别再跑戳人的命令）`, [], '', gid ? 'group' : 'private', gid ? uid : 0, uid))
  })

  // 手动试一发：**真发**（绕过试运行），只发一条固定测试句，动不了已发轮
  路线(`${路由前缀}/test-send`, async (req, res) => {
    await 读体(req)
    const 配置 = 读配置()
    if (!配置.私聊QQ && !配置.群号) return 回(res, { ok: false, 说: '私聊 QQ 和群号都是空的，先保存一个再试' })
    const 文字 = '（这是一条测试消息：DSH → QQ 通了）'
    const 结果 = await 发到QQ(配置, 文字)
    const 全过 = 结果.length > 0 && 结果.every((r) => r.ok)
    记账(`手动测试：${全过 ? '✅ 已发' : '⚠ 有问题'}「${文字}」`)
    for (const r of 结果) if (!r.ok) 记账(`   ${r.action} 失败：${JSON.stringify(r.数据).slice(0, 140)}`)
    回(res, { ok: 全过, 说: 全过 ? '测试句已经发到 QQ 了' : '有一步没发出去（看下面的记录）', 记录: 日志 })
  })

  // ---------- 挂监听 ----------

  ctx.effect(() => {
    const 摘 = ctx.on('session/event', (session, event) => {
      try {
        收到事件(session, event)
      } catch (error) {
        记账(`转发时出错：${String((error && error.message) || error)}`)
      }
    })
    return () => {
      try {
        if (typeof 摘 === 'function') 摘()
      } catch (error) {}
    }
  }, 'qq-bridge: 盯伙伴说话')

  // 轮询 NapCat 收「她新发的 QQ」→ 转进 DSH（QQ → DSH 这半，不赖 BOT）
  ctx.effect(() => {
    if (typeof ctx.interval !== 'function') {
      记账('拿不到 timer（ctx.interval 不在）—— QQ → DSH 的轮询收消息跑不起来，但 DSH → QQ 照常能用')
      return () => {}
    }
    const 停 = ctx.interval(() => {
      void 轮询收消息().catch((error) => {
        try { ctx.logger?.info(`qq-bridge: 轮询出错：${String((error && error.message) || error)}`) } catch (e2) {}
      })
    }, 4000)
    return () => {
      try {
        if (typeof 停 === 'function') 停()
      } catch (error) {}
    }
  }, 'qq-bridge: 轮询收 QQ 消息')

  记账(`已装好 v${版本}：DSH↔QQ 两半都在｜总开关 ${读配置().总开关 ? '开' : '关'}｜试运行 ${读配置().试运行 ? '开（只记账）' : '关（真发）'}｜收消息 4 秒轮询一次`)

  return { 记账, 概况, 落地一发, 发到QQ, 收到事件, 日志 }
}