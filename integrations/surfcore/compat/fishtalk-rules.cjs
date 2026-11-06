'use strict';

/**
 * 鱼识别规则，两档：
 *   硬证据：鱼八股原句，不在引号/引用/嘲讽/编号长列表里；命中一条即鱼。
 *   软信号：AI 腔、对仗、自指；clean 模式不判鱼，check 模式两条以上
 *          或一条软信号 + 跨来源重复才判鱼。
 *
 * score(item, ctx) 返回 { fish, reasons, hard, soft, repeats }。
 * 默认 clean；ctx.forCheck=true 或 ctx.mode='check' 才启用软信号判鱼。
 */

const HARD_PHRASES = [
  '这条我认',
  '我记下了',
  '这是本鱼最喜欢的一句话',
  '收到主人',
  '本鱼记下了',
];

// 兼容旧导出：这是硬证据原句，不是全部黑名单。
const BLACKLIST = HARD_PHRASES;

const SOFT_PATTERNS = [
  { code: 'not-a-but-b', re: /不是.{0,20}(而是|，?是)/ },
  { code: 'root', re: /说到(了)?根上/ },
  { code: 'itself', re: /这本身|本质上|归根结底/ },
  { code: 'contrast', re: /与其.{0,20}不如|看似.{0,20}实则|不仅.{0,20}而且/ },
  { code: 'summary', re: /^(总之|所以说|由此可见|总的来说)/ },
  { code: 'self-fish', re: /^(本鱼|鱼鱼|小的)/ },
  { code: 'fish-meme', re: /鱼门|本鱼/ },
  { code: 'self-as-fish', re: /^作为(一条|一只|一个).{0,8}(鱼|ai|助手)/ },
  { code: 'owner', re: /主人(别|不要|我|您|请)/ },
  { code: 'finished', re: /^(已阅|看完了)/ },
  { code: 'as-ai', re: /作为一(个|名)(ai|人工智能)/ },
  { code: 'report', re: /值得一提的是|希望对你有帮助|让我们一起/ },
  // 「这活整得有点大」这类套话收尾：软信号，单条只提醒。
  // 正常夸「这活干得漂亮」不进来（只收「整得…」的漂亮/好/明白）。
  { code: 'work-cliche', re: /这活(?:整|干)得(?:有点|挺|真)?大(?!病)|这活整得(?:有点|挺|真)?(?:漂亮|好|明白)/ },
];

const TEMPLATES = SOFT_PATTERNS;

const DEFAULT_SIMILARITY = 0.8;
const DEFAULT_REPEAT_COUNT = 3;
const DEFAULT_REPEAT_LEN = 10;

function normalize(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\[[^\]]{1,16}\]/g, '')
    .replace(/回复\s*@[^:：]+[:：]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function bigrams(text) {
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) out.push(text.slice(i, i + 2));
  return out;
}

function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 4 || y.length < 4) return 0;
  const A = new Set(bigrams(x));
  const B = new Set(bigrams(y));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const g of A) if (B.has(g)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function asTexts(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return [String(value)];
  return value
    .map((item) => (typeof item === 'string' ? item : item && item.text))
    .filter((item) => typeof item === 'string' && item.trim());
}

function bestMatch(text, candidates, threshold) {
  let best = null;
  for (const candidate of asTexts(candidates)) {
    const score = similarity(text, candidate);
    if (score >= threshold && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}

// 把「」『』“”‘’"" 和 > 引用行替换成空格，保留长度/换行，
// 这样硬证据不会命中「我记下了」这种被引用的句子。
function maskQuoted(text) {
  let out = String(text == null ? '' : text);
  const pairs = [
    [/「[^」]*」/g, (m) => ' '.repeat(m.length)],
    [/『[^』]*』/g, (m) => ' '.repeat(m.length)],
    [/“[^”]*”/g, (m) => ' '.repeat(m.length)],
    [/‘[^’]*’/g, (m) => ' '.repeat(m.length)],
    [/"[^"\n]*"/g, (m) => ' '.repeat(m.length)],
    [/'[^'\n]*'/g, (m) => ' '.repeat(m.length)],
  ];
  for (const [re, fn] of pairs) out = out.replace(re, fn);
  out = out.replace(/(^|\n)(\s*>.*)(?=\n|$)/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
  return out;
}

function isListLike(text) {
  const numbered = (String(text).match(/(^|\n)\s*\d{1,2}[.、]/g) || []).length;
  const lines = (String(text).match(/\n/g) || []).length;
  return numbered >= 3 || (String(text).length > 500 && lines >= 5);
}

function hasQuoteContext(text, phrase) {
  const idx = String(text).indexOf(phrase);
  if (idx < 0) return false;
  const around = String(text).slice(Math.max(0, idx - 80), idx + phrase.length + 80);
  return /引用|引述|复读|复制|刷|别人|有人|他说|她说|原话|这句|这种话|所谓|嘲讽|笑死|照抄|模仿|玩梗|烂梗/.test(around);
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

/**
 * @param {string|{text:string,where?:string}} item
 * @param {object} [ctx]
 * @param {boolean} [ctx.forCheck] 软信号参与判鱼
 * @param {'clean'|'check'} [ctx.mode]
 * @param {Array} [ctx.knownFish]
 * @param {Array} [ctx.own]
 * @param {Array} [ctx.others]
 * @param {Array} [ctx.corpus]
 * @returns {{fish:boolean,reasons:string[],hard:string[],soft:string[],repeats:string[]}}
 */
function score(item, ctx = {}) {
  const text = typeof item === 'string' ? item : item && item.text;
  const raw = String(text == null ? '' : text).trim();
  if (!raw) {
    return { fish: false, reasons: ['empty'], hard: [], soft: [], repeats: [] };
  }

  const hard = [];
  const soft = [];
  const repeats = [];
  const masked = maskQuoted(raw);
  const listLike = isListLike(raw);

  for (const phrase of HARD_PHRASES) {
    if (!masked.includes(phrase)) continue;
    if (listLike || hasQuoteContext(raw, phrase)) continue;
    addUnique(hard, `hard:${phrase}`);
  }

  const softText = normalize(masked);
  for (const rule of SOFT_PATTERNS) {
    if (rule.re.test(softText)) addUnique(soft, `soft:${rule.code}`);
  }

  const threshold = Number.isFinite(ctx.similarityThreshold)
    ? ctx.similarityThreshold
    : DEFAULT_SIMILARITY;

  const known = ctx.knownFish || ctx.fish || [];
  if (bestMatch(raw, known, threshold)) addUnique(repeats, 'repeat:known_fish');

  const own = ctx.own || ctx.previous || [];
  if (bestMatch(raw, own, threshold)) addUnique(repeats, 'repeat:own');

  const corpus = asTexts(ctx.corpus);
  if (corpus.length && normalize(raw).length >= (ctx.repeatMinLen || DEFAULT_REPEAT_LEN)) {
    const count = corpus.filter((candidate) => normalize(candidate) === normalize(raw)).length;
    if (count >= (ctx.repeatMinCount || DEFAULT_REPEAT_COUNT)) addUnique(repeats, 'repeat:corpus');
  }

  if (Array.isArray(ctx.others) && normalize(raw).length >= 8) {
    const itemWhere = item && typeof item === 'object' ? item.where : '';
    for (const other of ctx.others) {
      if (!other || typeof other.text !== 'string') continue;
      if (itemWhere && other.where === itemWhere) continue;
      if (similarity(raw, other.text) >= (ctx.othersThreshold || 0.75)) {
        addUnique(repeats, 'repeat:other_source');
        break;
      }
    }
  }

  const checkMode = ctx.mode === 'check' || ctx.forCheck === true;
  const fish = hard.length > 0
    || (checkMode && (soft.length >= 2 || (soft.length >= 1 && repeats.length >= 1)));

  return {
    fish,
    reasons: [...hard, ...soft, ...repeats],
    hard,
    soft,
    repeats,
  };
}

function isFish(item, ctx) {
  return score(item, ctx).fish;
}

module.exports = {
  score,
  isFish,
  normalize,
  similarity,
  maskQuoted,
  HARD_PHRASES,
  SOFT_PATTERNS,
  BLACKLIST,
  TEMPLATES,
};
