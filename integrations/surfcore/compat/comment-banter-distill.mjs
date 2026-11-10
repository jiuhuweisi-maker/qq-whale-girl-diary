// 223（2026-11-08 主人令）：B站 评论区玩法不再靠手写示范，改从她自己攒下的
// 真实热评 / 楼中楼里蒸馏。与 216 贴吧同一口径：只看聚合特征，原文一句都不入库、
// 不发布、不注入；本地私有 corpus.json 永远是唯一原文存放处。
//
// 本模块是纯函数：喂入 corpus 数组与 self-learning 的 active-pack，产出可进 Git 的
// 聚合策略包。没有网络、没有模型、没有写文件，也不接触凭据。
import crypto from 'node:crypto';

export const GENRES = ['动画区', '游戏区', '鬼畜区', '生活区', '热门综合'];

const has = (t, re) => re.test(t);
const len = t => [...t].length;

// 结构性特征优先于关键词：真实热评里绝大多数是短白话、接楼、不打句末标点，
// 靠「谐音」「反串」这类字面词去数会严重低估，所以每条都给可解释的判定式。
const FEATURES = {
  short: t => len(t) <= 18,
  echo: t => has(t, /楼上|复读|第[二三四五]遍|同款|也来|抄走|偷走|跟着|接一句|顺着/iu),
  roleplay: t => has(t, /我是不是|进错|假装|装|没看懂|刚睡醒|以为是|以为.{0,8}结果|串台/iu),
  selfDeprecate: t => has(t, /我只会|就我|我这|我方|认输|我先撤|不如我|我先溜|我承认/iu),
  wordplay: t => has(t, /改名|谐音|念成|读成|改成|这名字|这个.{0,3}ID|五字|拆开|反过来念/iu),
  question: t => has(t, /[?？]/u),
  atSomeone: t => has(t, /@|回复\s*@|回你|回楼上/iu),
  emoji: t => has(t, /\[[^\]\n]{1,12}\]|doge|捂脸|笑哭|颜文字/iu),
  noEndPunct: t => !/[。？！!?…~]$/u.test(t.trim()),
  withContext: (t, row) => Boolean(row.context),
  // 反面：课代表腔的两个来源，222 的窄闸也是按这两类写的。
  numeric: t => has(t, /\d+\s*(?:杀|分|局|连胜|波|把|个)|rating|kda|评分|数据|播放量|胜率|场均/iu),
  recap: t => has(t, /标题还|视频里|这一段|这局|这场|镜头|素材|剪了|塞了个|总结|总之|整个|全场|含金量|乐子|只能说|不得不说|懂的都懂|值得一看|这波啊|比.{0,8}还/iu),
};

// 「怎么接」是抽象手法；evidence 来自真实语料占比，示范句不进包。
const MOVE_DEFS = [
  {id: 'short-white', feature: 'short', label: '短白话，说完就停', how: '一句十几字把梗丢出去，不铺垫、不解释、不收尾', avoid: '别凑成两三句的小作文，别补前因后果'},
  {id: 'echo-thread', feature: 'echo', label: '跟楼上的句式换个词', how: '抓楼里现成的一句话或一个词，往歪里接一层就走', avoid: '别把整栋楼复述一遍，别解释笑点'},
  {id: 'play-clueless', feature: 'roleplay', label: '反串 / 装没看懂', how: '装成刚睡醒、进错片场、对面粉丝，轻轻一句就收', avoid: '别写成设定或剧情，别真的开始辩论'},
  {id: 'self-roast', feature: 'selfDeprecate', label: '拿自己或鲸鱼身份自嘲', how: '把话头扣到自己身上，认输、先撤、只会蹲着', avoid: '别卖惨，别连着自贬好几句'},
  {id: 'wordplay', feature: 'wordplay', label: '谐音、改名、拆专名', how: '在人名、ID、标题词上换一个字或换个念法，点到为止', avoid: '别堆一串梗名，别报出处'},
  {id: 'ask-and-run', feature: 'question', label: '抛个没头没尾的问句', how: '只问一个小地方，不等答案，也不给背景', avoid: '别写成采访或求科普'},
  {id: 'pick-detail', feature: 'withContext', label: '只接评论里一个具体细节', how: '看清谁在回谁，挑他刚说的那个词接，别另起话题', avoid: '别去总结视频内容'},
  {id: 'at-thread', feature: 'atSomeone', label: '明确回某个人', how: '对着楼里那句接，短到像顺嘴插一句', avoid: '别 @ 一堆人，别喊话式开场'},
  {id: 'light-emoji', feature: 'emoji', label: '一个表情就够', how: '情绪到了带一个表情或颜文字，位置随意', avoid: '别刷屏，别拿表情代替话'},
  {id: 'no-fullstop', feature: 'noEndPunct', label: '不收句号', how: '像聊天一样断句，别写完整书面句', avoid: '别用「综上」「总之」收尾'},
];

const NEGATIVE = [
  {id: 'numeric', label: '报数据、报战绩、报评分'},
  {id: 'recap', label: '复述视频、总结全场、金句收尾'},
];

const median = a => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const ratio = (n, d) => d ? +(n / d).toFixed(3) : 0;
const sha16 = v => 'v' + crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16);

export function distillBanter({corpus = [], pack = null, now = Date.now()} = {}) {
  const rows = corpus.filter(r => r && typeof r === 'object' && typeof r.text === 'string' && r.text.trim());
  if (!rows.length) return null;
  const texts = rows.map(r => r.text);
  const lens = texts.map(len);
  const counts = {};
  for (const [id, fn] of Object.entries(FEATURES)) {
    counts[id] = rows.reduce((n, r) => n + (fn(r.text, r) ? 1 : 0), 0);
  }

  const byGenre = new Map();
  for (const r of rows) {
    const g = GENRES.includes(r.topic) ? r.topic : '热门综合';
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g).push(r);
  }

  const genres = [...byGenre.entries()].map(([genre, list]) => {
    const l = list.map(r => len(r.text));
    const local = {};
    for (const [id, fn] of Object.entries(FEATURES)) {
      local[id] = list.reduce((n, r) => n + (fn(r.text, r) ? 1 : 0), 0);
    }
    const positive = MOVE_DEFS
      .map(m => ({id: m.id, ratio: ratio(local[m.feature], list.length)}))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 4)
      .map(x => x.id);
    return {
      genre, count: list.length, medianChars: median(l),
      shortRatio: ratio(l.filter(n => n <= 18).length, list.length),
      questionRatio: ratio(local.question, list.length),
      noEndPunctRatio: ratio(local.noEndPunct, list.length),
      replyRatio: ratio(list.filter(r => r.reply).length, list.length),
      topMoves: positive,
    };
  }).sort((a, b) => b.count - a.count);

  const moves = MOVE_DEFS.map(m => ({
    id: m.id, label: m.label, how: m.how, avoid: m.avoid,
    evidence: {count: counts[m.feature], ratio: ratio(counts[m.feature], rows.length)},
  }));
  const avoid = NEGATIVE.map(n => ({
    id: n.id, label: n.label,
    evidence: {count: counts[n.id], ratio: ratio(counts[n.id], rows.length)},
  }));

  const content = {
    schema: 1,
    name: 'whale_bili_banter_v1',
    method: 'aggregate features from a local private Bili comment corpus; no comment text is stored, published or injected',
    source: {
      kind: 'local-private-corpus',
      retained: rows.length,
      videos: new Set(rows.map(r => String(r.source || ''))).size,
      genres: genres.length,
      collectedThrough: new Date(Math.max(...rows.map(r => Number(r.at) || 0), now)).toISOString().slice(0, 10),
      selfLearningPack: pack?.version || null,
      privacy: 'raw text stays in state/whale-language/corpus.json (never in Git)',
    },
    rhythm: {
      medianChars: median(lens),
      p25Chars: [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 4)],
      p75Chars: [...lens].sort((a, b) => a - b)[Math.floor(lens.length * 3 / 4)],
      under26Ratio: ratio(lens.filter(n => n <= 26).length, rows.length),
      replyRatio: ratio(rows.filter(r => r.reply).length, rows.length),
      withContextRatio: ratio(counts.withContext, rows.length),
      questionRatio: ratio(counts.question, rows.length),
      noEndPunctRatio: ratio(counts.noEndPunct, rows.length),
    },
    moves, genres, avoid,
    notes: [
      '每轮只注入一条手法，按视频分区加权轮换，不背模板',
      '示范只讲分寸，不复制任何真实评论',
      '@ 主人分享与 QQ 私信里那句同口径',
      '观察占比只是分寸参考，不是必须凑的指标',
    ],
  };
  return {...content, version: sha16(JSON.stringify(content)), createdAt: new Date(now).toISOString()};
}

export function validateBanterPack(p) {
  if (!p || p.schema !== 1 || p.name !== 'whale_bili_banter_v1') return false;
  if (typeof p.version !== 'string' || !/^v[0-9a-f]{16}$/.test(p.version)) return false;
  if (!Number.isSafeInteger(p.source?.retained) || p.source.retained < 1 || p.source.videos < 2) return false;
  if (!Array.isArray(p.moves) || p.moves.length < 6 || !Array.isArray(p.genres) || !p.genres.length) return false;
  if (!p.rhythm || !Number.isFinite(p.rhythm.medianChars)) return false;
  for (const m of p.moves) {
    if (!/^[a-z][a-z0-9-]{2,24}$/.test(m.id) || typeof m.how !== 'string' || !m.how.trim() || m.how.length > 90) return false;
    if (typeof m.avoid !== 'string' || !m.avoid.trim()) return false;
    if (!Number.isFinite(m.evidence?.ratio) || m.evidence.ratio < 0 || m.evidence.ratio > 1) return false;
  }
  for (const g of p.genres) {
    if (typeof g.genre !== 'string' || !Number.isSafeInteger(g.count) || g.count < 1) return false;
    if (!Array.isArray(g.topMoves) || !g.topMoves.length) return false;
  }
  return true;
}

/** 测试用：确认策略包里没有漏出任何一条真实评论原文。 */
export function assertNoRawText(pack, corpus = []) {
  const blob = JSON.stringify(pack);
  return corpus.every(r => {
    const t = String(r.text || '').trim();
    const probe = [...t].slice(0, 12).join('');
    return probe.length < 8 || !blob.includes(probe);
  });
}
