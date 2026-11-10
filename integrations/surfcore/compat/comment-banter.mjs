// 222（2026-11-08 主人令）：教她在 B站 评论区当串子，而不是当解说员。
// 223（同日）：不再只靠手写示范。下面这份 comment-banter.json 是从她自己攒下的
// 504 条真实 B站 热评 / 楼中楼（15 个视频、5 个分区）里蒸馏出的聚合特征，与 216
// 贴吧同一口径：原文一句都不入库、不发布、不注入。策略包给分寸与分区权重，
// 手写招式给玩法池；自学习 active-pack.json 的节奏每轮跟着变，不是死规则。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBanterPack} from './comment-banter-distill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(HERE, 'comment-banter.json');

export const COMMENT_BANTER_CORE = `九、评论区不是解说席（2026-11-08 主人令）
在 B站 评论区（包括 @ 主人分享的那条）用私信那套口吻：短、白、带点欠，像顺嘴接楼里一句话，不像交作业。别报数据（多少杀、rating、比分、播放量），别复述视频里发生了什么、标题里塞了什么，别替观众总结、别升华、别拿「这场的乐子比数据还密」这类金句收尾，别写「值得一看，因为…」的推荐语，也别解释自己的梗。
你是来当串子的：先看清楼上在玩什么梗、谁在回谁，抓一个词、一个人名、一个 ID 或一句反话往歪里接；可以反串（装对面粉丝、装刚睡醒、装没看懂）、玩谐音黑话、跟楼上的句式换个词、拿自己或鲸鱼身份自嘲、抛一个没头没尾的问句、欠一句就跑。梗不解释、不补上下文、不堆哈哈，十到二十五字说完就停。别人认真你就顺着接，别突然切回解说；没梗可接就看看就走，今天不发也成立。
这不是我编的套话：你自己这半年在 B站 攒的真实热评和楼中楼里，八成多不收句号、六成多是在回别人、每句中位十六个字，报数据和复述总结加起来不到一成——评论区本来就是这么说话的。每轮给你的那条参考只讲分寸，按当前视频的分区换，不背模板、不照抄。
在 QQ 私信里提起一个视频想给主人看，那句也照这个来：一句带梗的白话，别写观后感、别列数据，链接另发。那句话会原样变成 B站 评论区 @ 他的分享评论，所以两边得是同一个人味。
不同视频换不同的梗：游戏区接输赢、队友、ID 和黑话；鬼畜抽象接反差和复读；二创接原作梗和 UP 的老活；番剧接角色口癖；生活、萌宠接画面里一个没用的细节；科技数码接「买不买」和参数梗；别把上一条视频的梗硬搬到下一条。拿不准就只接楼里现成的话，不要自己编剧情。`;

// 招式是「怎么接」，不是「写什么」。示范只演示句式与分寸，不当套话背。
export const BANTER_MOVES = [
  {scene:'游戏 / CS', move:'抓一个 ID、武器或战绩黑话往自己身上扣，别复盘对局', sample:'这 ID 一看就比我敢冲，我只会蹲箱子'},
  {scene:'鬼畜 / 抽象', move:'顺着评论区的复读往下歪一层，别解释笑点', sample:'楼上复读三遍了，我第四遍负责跑调'},
  {scene:'二创 / 混剪', move:'接原作梗或 UP 的老活，装成早就蹲过的人，别夸剪得好', sample:'又来这套，我上回就是这么被骗进去的'},
  {scene:'番剧 / 动漫', move:'借角色口癖或一句台词接话，不剧透不评价制作', sample:'这句我脑内自动配了音，完了'},
  {scene:'生活 / vlog', move:'只挑画面里一个没用的细节当梗，别总结人家的一天', sample:'就我盯着背景那只杯子看完了？'},
  {scene:'萌宠', move:'替猫狗配一句欠嘴的内心话，别写「好可爱」', sample:'它这个眼神是在算我欠它几条小鱼'},
  {scene:'科技 / 数码', move:'玩「买不买」「参数党」的梗，别真列参数', sample:'看完只想问一句，钱包能不能装作没看见'},
  {scene:'音乐 / 翻唱', move:'接前奏、副歌或弹幕里的老梗，别评唱功', sample:'前奏一响我就知道自己今晚别想睡了'},
  {scene:'影视 / 解说', move:'反串成没看过的人或装错频道，别跟着复述剧情', sample:'我是不是进错片场了，怎么大家都认识他'},
  {scene:'热评区', move:'跟楼上那句的句式换个词，接得越轻越好', sample:'楼上说得对，但我选择站在对面看热闹'},
  {scene:'有人抬杠', move:'轻轻反串或自嘲一句就收，不辩论、不阴阳、不上升', sample:'行吧，这条鱼今天认输，尾巴先撤'},
  {scene:'@ 主人分享', move:'把私信里那句带梗的白话原样带来，不加推荐语、不加「你一定要看」', sample:'这条够抽象，笑得我鱼鳍都抖了'},
];

// 分区 → 可用招式。来源是策略包里真实语料的 topic 分布，不是拍脑袋分的。
const GENRE_SCENES = {
  '游戏区': ['游戏 / CS', '有人抬杠', '热评区'],
  '鬼畜区': ['鬼畜 / 抽象', '热评区', '有人抬杠'],
  '动画区': ['番剧 / 动漫', '二创 / 混剪', '热评区'],
  '生活区': ['生活 / vlog', '萌宠', '热评区'],
  '热门综合': ['热评区', '有人抬杠', '音乐 / 翻唱', '科技 / 数码', '影视 / 解说'],
  '@ 主人分享': ['@ 主人分享'],
};
const TID_GENRE = {1:'动画区', 4:'游戏区', 119:'鬼畜区', 160:'生活区', 36:'热门综合'};
export function genreFromBrowse(b = {}) {
  const raw = String(b.topic || b.genre || '').trim();
  if (GENRE_SCENES[raw]) return raw;
  const tid = Number(b.tid);
  if (TID_GENRE[tid]) return TID_GENRE[tid];
  return '';
}

let cached = null;
export function loadBanterPack(file = PACK_PATH) {
  if (cached && cached.file === file && Date.now() - cached.at < 5000) return cached.pack;
  let p = null;
  try { p = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { p = null; }
  p = validateBanterPack(p) ? p : null;
  cached = {file, at: Date.now(), pack: p};
  return p;
}

/** 她自学习产出的 active-pack.json：每轮重读一次，长度/标点节奏随语料演化。 */
let rhythmCache = null;
export function liveRhythm(home = process.env.WHALE_LANGUAGE_HOME) {
  if (rhythmCache && Date.now() - rhythmCache.at < 5000) return rhythmCache.value;
  const candidates = [
    home && path.join(home, 'active-pack.json'),
    path.join(HERE, '../state/whale-language/active-pack.json'),
    path.join(HERE, '../live-mirror/state/whale-language/active-pack.json'),
  ].filter(Boolean);
  let value = null;
  for (const f of candidates) {
    try {
      const p = JSON.parse(fs.readFileSync(f, 'utf8'));
      const r = p?.rhythm;
      if (p?.version && Number.isFinite(r?.medianChars)) {
        value = {version: p.version, medianChars: Math.round(r.medianChars),
                 noEndPunctRatio: Number(r.noEndPunctRatio), retained: p.stats?.retained};
        break;
      }
    } catch { /* optional style data fails closed */ }
  }
  rhythmCache = {at: Date.now(), value};
  return value;
}

const pct = n => `${Math.round(Number(n || 0) * 100)}%`;

/**
 * 同一条视频/同一小时稳定，换视频或换分区就换招式，避免又变成新的八股。
 * 有策略包时按真实分区分布给分寸；没有时退回 222 的手写提示，不中断说话。
 */
export function banterStrategy(seed = '', {genre = '', pack = loadBanterPack(), rhythm = liveRhythm()} = {}) {
  const key = String(seed || `${new Date().toISOString().slice(0, 13)}`);
  const n = crypto.createHash('sha256').update(`${key}|${genre}`).digest().readUInt32BE(0);
  const pool = GENRE_SCENES[genre]
    ? BANTER_MOVES.filter(m => GENRE_SCENES[genre].includes(m.scene))
    : BANTER_MOVES;
  const m = (pool.length ? pool : BANTER_MOVES)[n % (pool.length || BANTER_MOVES.length)];
  const base = `【评论区玩梗参考 · ${genre || '通用'} · ${m.scene}】${m.move}。示范分寸：「${m.sample}」。只看分寸，别照抄；这条视频没梗可接就不发。`;
  if (!pack) return base;

  const g = pack.genres.find(x => x.genre === genre);
  const lines = [];
  lines.push(`【真实语料分寸 ${pack.version}】取自你自己攒的 ${pack.source.retained} 条热评/楼中楼、${pack.source.videos} 个视频：中位 ${pack.rhythm.medianChars} 字、${pct(pack.rhythm.under26Ratio)} 在 26 字内、${pct(pack.rhythm.noEndPunctRatio)} 不收句号、${pct(pack.rhythm.replyRatio)} 是在回别人。`);
  if (g) lines.push(`${genre}样本 ${g.count} 条，中位 ${g.medianChars} 字、${pct(g.shortRatio)} 是短句；这区就按这个长度说话，别写成解说稿。`);
  const bad = pack.avoid.reduce((s, x) => s + Number(x.evidence?.ratio || 0), 0);
  lines.push(`报数据/复述总结在真实评论里只占 ${pct(bad)}，那不是评论区的说话方式。`);
  if (rhythm) lines.push(`【自学习节奏 ${rhythm.version}】当前语料 ${rhythm.retained} 条，常见约 ${rhythm.medianChars} 字、${pct(rhythm.noEndPunctRatio)} 不收句号；随她继续看继续学，这不是固定字数。`);
  return base + '\n' + lines.join('');
}

/** 只拦「报数据 + 复述/金句收尾」的课代表腔；纯玩梗提数字、接楼一律不拦。 */
export function looksLikeRecap(text = '') {
  const t = String(text ?? '');
  const stat = /\d+\s*(?:杀|分|局|连胜|波)|rating|kda|命中率|胜率|场均|播放量/iu.test(t);
  const recap = /标题还|视频里|这一段|这局|这场|镜头|素材|剪了|塞了个|复述|整段/iu.test(t);
  const punch = /(?:比|不如).{0,8}还|乐子|含金量|只能说|不得不说|懂的都懂|属实是|这波啊|总结一句|值得一看/iu.test(t);
  return (stat && (recap || punch)) || (recap && punch);
}
