p = "/root/.dsh/profiles/web/node_modules/dsh-qq-bridge/lib/host.js"
s = open(p, encoding="utf-8").read()
def rep(old, new, tag):
    global s
    assert old in s, "missing: " + tag
    s = s.replace(old, new, 1)

faces = "'惊讶','撇嘴','色','发呆','得意','流泪','害羞','闭嘴','睡','大哭','尴尬','发怒','调皮','呲牙','惊讶','难过','酷','冷汗','抓狂','吐','偷笑','可爱','白眼','傲慢','饥饿','困','惊恐','流汗','憨笑','大兵','奋斗','咒骂','疑问','嘘','晕','折磨','衰','骷髅','敲打','再见','擦汗','抠鼻','鼓掌','糗大了','坏笑','左哼哼','右哼哼','哈欠','鄙视','委屈','快哭了','阴险','亲亲','吓','可怜','菜刀','西瓜','啤酒','篮球','乒乓','咖啡','饭','玫瑰','凋谢','示爱','爱心','心碎','蛋糕','闪电','炸弹','刀','足球','瓢虫','便便','月亮','太阳','礼物','拥抱','强','弱','握手','胜利','抱拳','勾引','拳头','差劲','爱你','NO','OK','爱情','飞吻','跳跳','发抖','怄火','转圈','磕头','回头','跳绳','挥手','激动','街舞','献吻','左太极','右太极'"
rep("  const 热聊 = new Map()\n  const 路由队 = []", "  const 热聊 = new Map()\n  const 路由队 = []\n  const 黄脸表 = [" + faces + "]", "faces")

rep("""    const 条转片段 = (条) => {
      const 段们 = Array.isArray(条.message) ? 条.message : []
      const 文字 = 段们.map((s) => (s && s.type === 'text' && s.data ? String(s.data.text) : '')).join('').trim()""",
"""    const 条转片段 = (条) => {
      const 段们 = Array.isArray(条.message) ? 条.message : []
      const 文字 = 段们.map((s) => {
        if (!s) return ''
        if (s.type === 'text' && s.data) return String(s.data.text)
        if (s.type === 'face') { const fid = Number(s.data && s.data.id != null ? s.data.id : s.id); return '[' + (黄脸表[fid] || ('表情' + fid)) + ']' }
        return ''
      }).join('').trim()""", "face2text")

rep("""  路线(`${路由前缀}/receive`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字（body 里给 text）' })
    回(res, await 转入文字(文字))
  })""",
"""  路线(`${路由前缀}/receive`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字（body 里给 text）' })
    回(res, await 转入文字(文字))
  })

  // 主动冒泡：cron 注入一条群通道提示词，她的回复会发到群里
  路线(`${路由前缀}/nudge`, async (req, res) => {
    const 来 = await 读体(req)
    const 文字 = typeof 来.text === 'string' ? 来.text.trim() : ''
    if (!文字) return 回(res, { ok: false, 说: '没有文字' })
    回(res, await 转入一条(文字, [], '', 'group', 0, 0))
  })""", "nudge")
open(p, "w", encoding="utf-8").write(s)
print("patched15 ok", len(s))