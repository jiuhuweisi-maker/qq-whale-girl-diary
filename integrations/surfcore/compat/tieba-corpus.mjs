// Offline Tieba corpus cleaning and aggregation. Read-only input, no network.
// Raw public text stays outside Git; only aggregate counts may be published.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import rules from './fishtalk-rules.cjs';

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

// Dataset descriptors are metadata only. The files themselves are never bundled.
export const SOURCES = {
  'tieba-kangya': {bar: '抗压背锅', license: 'MIT', dataset: 'Orphanage/Baidu_Tieba_KangYaBeiGuo'},
  'tieba-sunxiaochuan': {bar: '孙笑川', license: 'CC-BY-4.0', dataset: 'Orphanage/Baidu_Tieba_SunXiaochuan'},
};

// Thread-level topics are dropped before any reply is considered. A reply only
// makes sense with its thread, so a sensitive title removes the whole thread.
const THREAD_BLOCK = /(?:女|男|婚|彩礼|嫁|娶|怀孕|子宫|堕胎|性|裸|嫖|卖淫|约炮|开房|政治|政府|主席|总统|台湾|香港|新疆|西藏|法轮|六四|民主|专制|选举|体制|警察|法院|判刑|坐牢|自杀|抑郁|癌症|艾滋|绝症|去世|死了|葬礼|赌博|毒品|贷款|诈骗|传销|活动|公告|招募|吧务|水楼|专贴|举报楼|更新|口令|抽奖|福利|兼职|招聘|求职|广告|互粉|涨粉)/u;
// Reply-level attacks, slurs, sexual content, promotion and self-harm.
const REPLY_BLOCK = /(?:傻[逼屄比]|煞笔|沙比|脑残|智障|低能|弱智|废物|垃圾东西|畜生|贱人|婊|骚货|浪货|母狗|公狗|狗东西|狗叫|疯狗|杂种|野种|你妈|你🐴|你🐎|nmsl|死妈|死全家|全家死|滚出去|去死|杀了你|砍死|强奸|轮奸|操你|干你|日你|尼玛|妈的|他妈|集美|小仙女|xxn|幕刃|飞竹|坦克|女拳|拳师|打拳|龟男|舔狗|鼠鼠|吧友|吧宠|孙吧|孙8|贴吧|楼主|太监|下头|普信|唐氏|糖狗|艾滋|癌症|棺材|骨灰|坟头|嫖|卖淫|色情|裸|脱裤|裤衩|胸|奶子|屁股|约炮|开房|子宫|怀孕|彩礼|加群|私聊|代练|外挂|脚本|充钱|氪金|优惠|返利|博彩|举报|封号|狗屎|鸡毛|一坨|÷|➗)/iu;
const PRIVACY = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)\d{7,}(?!\d)|(?:QQ|微信|vx|VX|手机|电话|地址)\s*[:：]?\s*[\w-]{4,})/iu;
const PROMO = /(?:私我|私信我|日结|一单|接单|招.{0,4}(?:助理|人|兼职)|代充|租号|出租|零花钱|包月|加[Vv微薇]|刷单|返现)/u;
const META = /(?:^\s*\d+[.、]|^\s*回复\s*@|网友.{1,12}[:：]|\d{4}-\d{1,2}-\d{1,2}|我也说一句|来自Android|来自iPhone)/u;
const PURE_NOISE = /^[\s\p{P}\p{S}0-9a-zA-Z]{0,}$|^(?:哈|呵|嘿|草|6|啊|？|\?|。|\.|！|!)+$/u;

export function cleanReply(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]\n]{1,12}\]/g, '')
    .replace(/回复\s*@[^:：\n]{1,40}[:：]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterReply({text, title = ''}, {seen = new Set(), maxChars = 60, minChars = 4} = {}) {
  const clean = cleanReply(text);
  if (!clean) return {ok: false, reason: 'empty'};
  if (THREAD_BLOCK.test(String(title))) return {ok: false, reason: 'thread-topic'};
  if (clean.length < minChars || clean.length > maxChars) return {ok: false, reason: 'length'};
  if (REPLY_BLOCK.test(clean)) return {ok: false, reason: 'unsafe'};
  if (PRIVACY.test(clean) || PROMO.test(clean)) return {ok: false, reason: 'privacy'};
  if (META.test(clean) || PURE_NOISE.test(clean)) return {ok: false, reason: 'meta-or-noise'};
  const chinese = (clean.match(/[\u4e00-\u9fff]/gu) || []).length;
  if (chinese < 3) return {ok: false, reason: 'non-chinese'};
  if (/(.)\1{3,}/u.test(clean)) return {ok: false, reason: 'spam'};
  const key = rules.normalize(clean).replace(/[\s\p{P}\p{S}]+/gu, '');
  if (!key || seen.has(key)) return {ok: false, reason: 'duplicate'};
  seen.add(key);
  return {ok: true, text: clean, key};
}

const GAME = /(?:版本|英雄|选手|战队|比赛|打野|中单|上单|下路|辅助|adc|阵容|对线|团战|排位|上分|抽卡|出货|原神|王者|联盟|lpl|lck|t1|faker|ig|blg|tes|wbg|nip|jdg|rng|edg|星穹|深渊|配队|圣遗物)/iu;
const ANIME = /(?:番剧|动画|动漫|漫画|声优|二次元|手办|cos|剧场版|oped|新番|连载)/iu;
const FUN = /(?:笑死|哈哈|绷不住|太乐|好活|逆天|离谱|抽象|整活|发癫|神人|什么鬼|节目效果|搞笑|段子)/u;
const COMPLAIN = /(?:无语|服了|受不了|醉了|血压|崩溃|气死|麻了|糟心|离谱)/u;
const COMFORT = /(?:加油|挺住|别难过|会好的|抱抱|辛苦了|不容易|焦虑|迷茫|难受|想哭|痛苦)/u;
const DAILY = /(?:今天|昨天|明天|上班|下班|吃饭|睡觉|起床|生活|学校|大学|宿舍|室友|老师|同学|考试|作业|兼职|工作|天气|房租|地铁|外卖|快递|猫|狗|游戏机|朋友|恋爱|喜欢|分手|心情|家里|爸妈|买|穿|玩|烦|累|开心|难过)/u;

export function classify({title = '', text = ''}) {
  const all = title + ' ' + text;
  if (GAME.test(all)) return '游戏';
  if (ANIME.test(all)) return '动漫二次元';
  if (FUN.test(all)) return '搞笑';
  if (COMFORT.test(all)) return '安慰别人';
  if (COMPLAIN.test(all)) return '吐槽';
  if (DAILY.test(all)) return '生活分享';
  return '其他';
}

export function threadsFrom(value) {
  const out = [];
  const list = Array.isArray(value) ? value : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const title = String(row['标题'] ?? row.title ?? '').trim();
    const replies = row['回复列表'] ?? row.replies ?? [];
    if (!Array.isArray(replies) || !replies.length) continue;
    out.push({title, replies: replies.filter(x => typeof x === 'string')});
  }
  return out;
}

export function readThreads(file) {
  return threadsFrom(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function buildCorpus(threads, {maxPerThread = 40, minChars = 4, maxChars = 60} = {}) {
  const seen = new Set();
  const rows = [];
  const reasons = {};
  let candidates = 0;
  for (const thread of threads) {
    const key = sha(thread.title).slice(0, 12);
    // The thread title carries the shared topic; a bare reply often has none.
    const threadScene = classify({title: thread.title, text: ''});
    let kept = 0;
    for (const [seq, reply] of thread.replies.entries()) {
      if (kept >= maxPerThread) break;
      candidates++;
      const verdict = filterReply({text: reply, title: thread.title}, {seen, minChars, maxChars});
      if (!verdict.ok) {reasons[verdict.reason] = (reasons[verdict.reason] || 0) + 1; continue;}
      const scene = classify({title: thread.title, text: verdict.text});
      const resolved = scene === '其他' ? threadScene : scene;
      if (resolved === '其他') {reasons['unclassified'] = (reasons['unclassified'] || 0) + 1; continue;}
      kept++;
      rows.push({
        id: sha(key + ':' + seq).slice(0, 16),
        thread: key,
        seq,
        text: verdict.text,
        scene: resolved,
        // Order is preserved; parent linkage is unknown, so none is invented.
        contextRelation: seq === 0 ? 'thread-reply' : 'thread-followup',
      });
    }
  }
  return {rows, stats: {threads: threads.length, candidates, retained: rows.length, reasons}};
}

const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function summarize(rows) {
  const byScene = {};
  for (const row of rows) byScene[row.scene] = (byScene[row.scene] || 0) + 1;
  const chars = rows.map(row => [...row.text].length);
  const ratio = test => rows.length ? +(rows.filter(row => test(row.text)).length / rows.length).toFixed(3) : 0;
  const particles = ['啊', '吧', '呢', '吗', '哈', '确实', '不是', '真', '服'];
  return {
    retained: rows.length,
    threads: new Set(rows.map(row => row.thread)).size,
    medianChars: median(chars),
    under30Ratio: +(rows.filter(row => [...row.text].length <= 30).length / Math.max(1, rows.length)).toFixed(3),
    questionRatio: ratio(text => /[?？]/.test(text)),
    noEndPunctRatio: ratio(text => !/[。？！!?]$/.test(text)),
    particleRates: Object.fromEntries(particles.map(p => [p, ratio(text => text.includes(p))])),
    scenes: Object.entries(byScene).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({name, count})),
  };
}

// Never publish rows; fingerprinting is only a local guard against re-import.
export function fingerprint(text) {
  return sha(rules.normalize(text)).slice(0, 16);
}

function argOf(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && /tieba-corpus\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const input = argOf('--input', '');
  const out = argOf('--out', '');
  const limit = Number(argOf('--max', '0')) || Infinity;
  if (!input || !out) {
    console.error('Usage: node tieba-corpus.mjs --input <dir> --out <dir> [--max N]');
    process.exit(2);
  }
  const files = fs.readdirSync(input).filter(name => name.endsWith('.json')).sort();
  const threads = [];
  const datasets = [];
  for (const file of files) {
    const full = path.join(input, file);
    let value;
    try { value = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    const found = threadsFrom(value);
    if (!found.length) continue;
    // Hanversion-style question/answer sets are generated, not human threads.
    if (found.every(x => x.title === '')) continue;
    threads.push(...found);
    datasets.push({file, threads: found.length, sha256: sha(fs.readFileSync(full)).slice(0, 16)});
  }
  const built = buildCorpus(threads);
  const rows = built.rows.slice(0, limit);
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'corpus.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n', {mode: 0o600});
  const stats = {...built.stats, ...summarize(rows), datasets};
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({ok: true, out, retained: rows.length, stats}));
}
