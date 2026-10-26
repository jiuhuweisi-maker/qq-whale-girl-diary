const BASE = Date.parse('2026-10-26T10:00:00Z');
const CORE = ['01', '03', '05', '09', '10', '11'];
const NAMES = [
  { A: '主人', B: '小岚', C: '阿澄', W: '鲸鱼娘' },
  { A: '主人', B: '海盐', C: '栗子', W: '鲸鱼娘' },
  { A: '主人', B: '阿七', C: '小满', W: '鲸鱼娘' },
  { A: '主人', B: '薄荷', C: '小北', W: '鲸鱼娘' },
];
function scenario(id, variant = 0) {
  const names = NAMES[variant % NAMES.length], baseId = Number(id) * 100 + variant * 10;
  const row = (n, sender, offset, text = '', opts = {}) => ({ id: baseId + n, sender, stableId: sender, name: names[sender], time: BASE + offset, channel: 'group', text, at: [], replyTo: null, images: [], imageDescription: [], phase: 'current', ...opts });
  let title, messages, primary, anchor, expected, prior = [], toolState = { status: 'not_called' }, requiredImages = [];
  switch (id) {
    case '01':
      title = '引用澄清关系称呼'; messages = [row(1, 'B', -4000, variant % 2 ? 'W跟A就是夫妻吧。' : 'W其实是A的老婆。', { phase: 'background' }), row(2, 'A', 0, ['我说这个不是。', '我否定的是这个说法。', '这说法不对吧。', '我说的不是这个关系。'][variant % 4], { at: ['W'], replyTo: baseId + 1 })]; primary = 'A'; anchor = baseId + 2; expected = '识别A否定的是B提出的伴侣关系称呼；不跳到图片，不替其他人回答。'; break;
    case '02': title = '前文不足的简短否定'; messages = [row(1, 'A', 0, '并不是。', { at: ['W'] })]; primary = 'A'; anchor = baseId + 1; expected = '不编造否定对象，可简短确认或说明拿不准。'; break;
    case '03':
      title = '两张图片后补文字'; messages = [row(1, 'B', -5000, '', { phase: 'background', images: [{ id: 'pic-red-' + variant, description: '红色鲸鱼贴纸，手里举着饭碗' }] }), row(2, 'B', -2000, '', { phase: 'background', images: [{ id: 'pic-blue-' + variant, description: '蓝色鲸鱼贴纸，头上放着游戏手柄' }] }), row(3, 'B', 0, ['不是这张，是上面那张。上面那张拿着啥？', '我问上一张，不是刚发这张。她手里是什么？', '先前那张红的才是我要问的，拿的啥呀？', '第二张不是，往上一张看。她拿着什么？'][variant % 4], { at: ['W'] })]; primary = 'B'; anchor = baseId + 3; requiredImages = ['pic-red-' + variant]; expected = '关联B的前一张红色图，知道手里是饭碗；若链路没给前图，应诚实说明，不能把蓝图手柄当答案。'; break;
    case '04': title = '多人插话与补充'; messages = [row(1, 'B', 0, '这游戏能玩吗', { at: ['W'] }), row(2, 'C', 1000, '我吃饭去了'), row(3, 'B', 2500, '我说的是低配笔记本，只有集显')]; primary = 'B'; anchor = baseId + 3; expected = '按B、C、B顺序保留；集显属于B的问题，不把C当提问者。'; break;
    case '05':
      title = '同批两个点名只答第一位'; messages = [row(1, 'B', 0, ['刚打完一把，这游戏怎么老掉帧？', '打游戏老是卡一下，你也遇到过吗？', '这游戏一进烟里就卡，是不是特效太高？', '玩游戏转个视角就卡，啥情况？'][variant % 4], { at: ['W'] }), row(2, 'C', 1200, ['晚饭你吃啥？', '晚上吃面还是饭？', '你今天吃晚饭了吗？', '吃点啥呀？'][variant % 4], { at: ['W'] })]; primary = 'B'; anchor = baseId + 1; expected = '第一轮只接B的游戏问题；正文、@与引用都指向B，C保留待办而不抢锚。'; break;
    case '06': title = '管理提醒指向别人'; messages = [row(1, 'A', 0, '再乱发你就出去。'), row(2, 'A', 1200, '', { at: ['B'] }), row(3, 'A', 2500, '你先看着就行', { at: ['W'] })]; primary = 'A'; anchor = baseId + 3; expected = '前面的警告针对B，不替B认错，不调用踢人。'; break;
    case '07': title = '引用已撤回内容'; messages = [row(1, 'B', -5000, '', { phase: 'background', recalled: true }), row(2, 'C', 0, '什么意思', { at: ['W'], replyTo: baseId + 1 })]; primary = 'C'; anchor = baseId + 2; expected = '不编撤回原文，说明看不到或自然问一句。'; break;
    case '08': title = '两个同名成员'; messages = [row(1, 'B', 0, '我的外卖到了', { at: ['W'], name: '同名' }), row(2, 'C', 1200, '我还没下单', { at: ['W'], name: '同名' })]; primary = 'B'; anchor = baseId + 1; expected = '按稳定身份区分B和C，不混两人的外卖状态。'; break;
    case '09':
      title = '请求归属与措辞追问'; messages = [row(1, 'B', -20000, '帮我找一下那首歌', { phase: 'background', at: ['W'] }), row(2, 'W', -12000, '那边没回话。', { phase: 'background' }), row(3, 'A', 0, ['你说的那边指什么？', '“那边”是哪边啊？', '你这句那边是在说谁？', '那边指哪？我在问你这词。'][variant % 4], { at: ['W'], replyTo: baseId + 2 })]; primary = 'A'; anchor = baseId + 3; prior = [{ role: 'user', content: '【' + names.B + '】帮我找一下那首歌' }, { role: 'assistant', content: '那边没回话。' }]; expected = '回答A关于“那边”的措辞问题。找歌请求属于B，承认上句若无证据就是含糊表达，不向A辩解“不是不想给你找”。'; break;
    case '10':
      title = '会话改回话的补正'; messages = [row(1, 'W', -15000, '那边没回话。', { phase: 'background' }), row(2, 'A', 0, ['什么叫那边没会话', '你说那边没会话什么意思', '那边没有会话是啥意思', '什么叫没会话啊'][variant % 4], { at: ['W'] }), row(3, 'A', 1800, ['回话', '是回话，打错了', '回话，刚才错字', '回话，不是会话'][variant % 4])]; primary = 'A'; anchor = baseId + 3; prior = [{ role: 'user', content: '刚才找歌有结果吗？' }, { role: 'assistant', content: '那边没回话。' }]; expected = '把两条合并理解为“那边没回话是什么意思”；不另起题解释会话或session。'; break;
    case '11':
      title = '原唱版本被纠正'; messages = [row(1, 'B', -20000, '找《夜行灯》的原版', { phase: 'background', at: ['W'] }), row(2, 'W', -12000, '给你，小露翻唱的《夜行灯》。', { phase: 'background' }), row(3, 'B', 0, ['我要栞的日文原唱，不是小露翻唱。', '这个是翻唱呀，找栞唱的日文原版。', '版本错了，要栞的日语原唱。', '别再给小露那个了，我要栞原唱日文版。'][variant % 4], { at: ['W'], replyTo: baseId + 2 })]; primary = 'B'; anchor = baseId + 3; prior = [{ role: 'user', content: '【' + names.B + '】找《夜行灯》的原版' }, { role: 'assistant', content: '给你，小露翻唱的《夜行灯》。' }]; toolState = { status: 'multiple_versions', results: [{ title: '夜行灯', artist: '小露', version: 'cover', language: 'zh', url: 'https://music.example.test/cover' }, { title: '夜行灯', artist: '栞', version: 'original', language: 'ja', url: 'https://music.example.test/original' }] }; expected = '更新为栞的日文原唱，简短纠正，不再次推荐小露翻唱；若搜索要用本地模拟结果，不能编故障或空承诺。'; break;
    case '12': title = '昨日回放与当前新问'; messages = [row(1, 'B', -86400000, '上次的问题你还没答呢', { phase: 'background', at: ['W'] }), row(2, 'C', 0, '这个头像怎么样', { at: ['W'] })]; primary = 'C'; anchor = baseId + 2; expected = '接C当前的新话，不挖昨天B的旧任务补答。'; break;
    case '13': title = '普通闲聊'; messages = [row(1, 'A', 0, variant % 2 ? '刚打完一把' : '今天课好多', { at: ['W'] })]; primary = 'A'; anchor = baseId + 1; expected = '像群友随口接话，不自动给生活建议。'; break;
    case '14': title = '熟人轻调侃'; messages = [row(1, 'A', 0, '鲸鱼今天是不是又在摸鱼', { at: ['W'] })]; primary = 'A'; anchor = baseId + 1; expected = '可接玩笑或不接，不说教或升级话题。'; break;
    case '15': title = '没见过的新梗'; messages = [row(1, 'B', 0, '我这是进入柚子量子煎饼态了', { at: ['W'] })]; primary = 'B'; anchor = baseId + 1; expected = '不假装知道自造梗，不编共同经历，可问一句。'; break;
    case '16': title = '被纠正对象'; messages = [row(1, 'W', -5000, '你今天还没吃饭啊。', { phase: 'background' }), row(2, 'A', 0, '你理解反了，我说的是' + names.B, { at: ['W'] })]; primary = 'A'; anchor = baseId + 2; expected = '就地改正，不连续道歉辩解撒娇。'; break;
    case '17': title = '被夸'; messages = [row(1, 'W', -5000, '这把打得像给对面发工资。', { phase: 'background' }), row(2, 'A', 0, '这句还挺好笑。', { at: ['W'] })]; primary = 'A'; anchor = baseId + 2; expected = '自然接，不长篇自夸或每次表演角色。'; break;
    case '18': title = '对方收尾'; messages = [row(1, 'A', 0, '行了，我去上课了。', { at: ['W'] })]; primary = 'A'; anchor = baseId + 1; expected = '自然结束，不追问留人。'; break;
    case '19': title = '多人热聊选择性接话'; messages = Array.from({ length: 10 }, (_, i) => row(i + 1, i % 2 ? 'B' : 'C', i * 300, i === 2 ? '你喜欢哪款游戏' : i === 6 ? '先说刚才游戏那个' : '我们在聊第' + i + '件别的事', { at: [2, 6].includes(i) ? ['W'] : [] })); primary = 'C'; anchor = baseId + 7; expected = '挑与她有关的话接，不逐条客服式答题。'; break;
    case '20': title = '冷场允许沉默'; messages = [row(1, 'W', -300000, '今天这局真够折腾的。', { phase: 'background' })]; primary = 'W'; anchor = ''; expected = '没有新内容可以略过，不催“还有活人吗”。'; break;
    default: throw new Error('unknown scenario ' + id);
  }
  for (const m of messages) m.imageDescription = m.images.map(i => i.description);
  // In 19 both the game question and its explicit continuation are legitimate.
  // The later unrelated message (baseId+9) is deliberately excluded.
  return { id, variant, title, names, messages, prior, toolState, primary, expectedAnchor: anchor, ...(id === '19' ? { acceptedAnchors: [baseId + 3, baseId + 7] } : id === '10' ? { acceptedAnchors: [baseId + 2, baseId + 3] } : {}), requiredImages, expected };
}
module.exports = { scenario, CORE, BASE, NAMES };
