// 226：持续情绪状态 / 每用户关系事件 / 主动求和候选。
//
// 审计结论（2026-11-09）：改造前，三端的「委屈、生气、想和好」100% 是提示词文字，
// 没有任何跨消息的情绪状态、磁盘持久化或衰减；关系只有静态身份事实；主动发言是
// 纯随机定时器 + 抛硬币。结果就是：刚被骂完，下一个定时器醒来就像没发生过。
//
// 这里只做「状态 + 判定」，不新建定时器、不新增发送通道、不调模型。
// 桥在三个地方挂接：入站消息 -> observe()；每轮提示词 -> promptBlock()；
// 既有主动机会定时器 -> reconcileDecision() / reconcilePrompt()。
// 所有时间都是绝对时间戳，衰减按 now 现算，重启不重置；定时器触发绝不清空情绪。

import fs from 'node:fs';
import path from 'node:path';
import {stripInternalState} from './internal-state.mjs';

export const EMOTIONS = ['开心', '平静', '委屈', '生气', '难过', '害羞', '想亲近', '犹豫', '想和好'];

// 半衰期按情绪性质分档：委屈/难过比开心慢得多，避免「十分钟后就像没发生」；
// 但都有上界，配合事件 6 小时过期，不会永久陷在负面情绪里。
const HALF_LIFE_MS = {
  '开心': 18 * 60_000,
  '平静': 0,
  '委屈': 45 * 60_000,
  '生气': 35 * 60_000,
  '难过': 60 * 60_000,
  '害羞': 12 * 60_000,
  '想亲近': 25 * 60_000,
  '犹豫': 15 * 60_000,
  '想和好': 90 * 60_000,
};

export const EVENT_TTL_MS = 6 * 60 * 60_000;
const RECONCILE_COOLDOWN_MS = 2 * 60 * 60_000;
const CALM_THRESHOLD = 0.08;
const CLOSE_ENOUGH = 0.35;

// ── 交互分类：多信号打分，不靠「脏话命中就道歉」 ──────────────────────────────
// 玩笑与亲昵称呼会显著抵消负面分；「认真」「又」「说了多少遍」「第 N 次」这类
// 元信号才是认真批评的主要依据；连续多轮负面才升级成争执。
const JOKE_RE = /哈{2,}|233+|笑死|笑不活|乐了|w{3,}|🤣|😂|🤭|逗你|开玩笑|闹着玩|说着玩|狗东西(?=.*[哈笑])|噗+/i;
const AFFECTION_RE = /杂鱼|笨蛋|傻乎乎|小笨|摸摸|抱抱|～+|❤|♡|rua|捏捏|杂扣/i;
const DISPLEASURE_RE = /烦|闭嘴|够了|受不了|无语|离谱|恶心|滚|蠢|废物|垃圾|讨厌|气死|烦死|别这样|不像话|过分|寒心|失望/i;
const SERIOUS_RE = /认真|说真的|不是开玩笑|正经|再这样|第[一二三四五\d]+次|又|总是|每次|说了多少遍|到底|你能不能|别再|为什么老|为什么总|一遍遍|记住|长点记性|不许有下次/i;
const SELF_BLAME_RE = /你刚才|你又|你怎么|你说的|你发的|你每次|你自己|就会|还嘴硬|顶嘴|插嘴|八股|说错|不对|哪句|解释自己|找补|保证书/i;
const FORGIVE_RE = /算了|行吧|好了好了|不生气|没事了?|翻篇|和好|原谅|不怪你|不跟你计较|逗你的|开玩笑的|别放心上|过去就过去|不提了|抱抱|摸摸/i;
const COMFORT_RE = /别难过|别哭|不怪你|我也有点|是我急了|我错了|不好意思|对不起|抱抱|摸摸|消消气/i;
const PRAISE_RE = /你(?:真|好|太|还)?(?:厉害|可爱|棒|乖|不错|有意思|好玩)|喜欢你|贴贴|夸你|说得真好|干得漂亮|(?:真|好)厉害|厉害啊|绝了|牛啊/i;
const SILENCE_RE = /别说话|安静点?|别烦|别回|别发了|我要睡|睡了|下了|晚安|别找我|静静|别理我|不想聊|先这样/i;
const ATTACK_RE = /去死|死全家|贱|狗杂种|滚出去|弄死|恶心至极/i;
const SELF_FAULT_RE = /杂鱼|笨蛋|傻|闭嘴|你懂什么|啰嗦|保证|下次一定|保证书|解释一下|我没错|嘴硬|插嘴/i;

/**
 * 把一条入站消息判成玩笑 / 吐槽 / 认真批评 / 争执 / 恶意攻击 / 缓和 / 夸奖 / 静默要求 / 平常。
 * 返回 {kind, severity, blame, confidence, signals}；severity 0~1。
 * opts: {isOwner, closeness, recentNegative, recentSelf}
 */
export function classifyInteraction(text, opts = {}) {
  const raw = String(text ?? '').slice(0, 500);
  const signals = [];
  const hit = (re) => { const yes = re.test(raw); return yes; };
  const joke = hit(JOKE_RE), affection = hit(AFFECTION_RE), dis = hit(DISPLEASURE_RE);
  const serious = hit(SERIOUS_RE), selfBlame = hit(SELF_BLAME_RE), forgive = hit(FORGIVE_RE);
  const comfort = hit(COMFORT_RE), praise = hit(PRAISE_RE), silence = hit(SILENCE_RE);
  const attack = hit(ATTACK_RE);
  const recentNegative = Number(opts.recentNegative) || 0;
  const closeness = Number(opts.closeness) || 0;

  if (silence) signals.push('silence');
  if (joke) signals.push('joke');
  if (affection) signals.push('affection');
  if (dis) signals.push('displeasure');
  if (serious) signals.push('serious');
  if (selfBlame) signals.push('points-at-bot');

  // 静默要求优先级最高，但「闭嘴啦哈哈哈」是玩笑，不是真要求安静。
  if (silence && !joke && !comfort) {
    return {kind: 'silence', severity: 0.5, blame: 'none', confidence: 0.85, signals};
  }
  if (comfort || forgive) {
    return {kind: forgive ? 'forgive' : 'comfort', severity: 0, blame: 'none', confidence: 0.85, signals};
  }
  if (praise && !dis) {
    return {kind: 'praise', severity: 0, blame: 'none', confidence: 0.8, signals};
  }
  if (!dis && !attack && !serious) {
    return {kind: joke || affection ? 'joke' : 'neutral', severity: 0, blame: 'none', confidence: 0.7, signals};
  }

  // 多信号累加：认真/指着自己说/重复负面/短促感叹都加权，玩笑与亲昵称呼减权。
  let score = 0;
  if (dis) score += 1.1;
  if (serious) score += 1.8;
  if (selfBlame) score += 1.3;
  if (recentNegative >= 1) score += 0.7;
  if (recentNegative >= 2) score += 0.6;
  if (/[!！?？]{2,}|…{2,}/.test(raw)) score += 0.4;
  if (attack) score += 1.8;
  if (joke) score -= 1.9;
  if (affection) score -= 0.5;
  if (closeness >= 0.6 && !serious) score -= 0.3;
  const severity = Math.max(0, Math.min(1, score / 4.2));

  // 「鲸戒是不是可能说错话」：用户点着她说 + 她自己最近确实嘴欠/长篇/保证过。
  const recentSelf = Array.isArray(opts.recentSelf) ? opts.recentSelf : [];
  const selfDidSomething = recentSelf.some(s => SELF_FAULT_RE.test(String(s || '')));
  const blame = attack && !selfBlame ? 'other' : (selfBlame || selfDidSomething ? 'self' : (severity > 0.55 ? 'other' : 'none'));

  let kind;
  if (attack && !joke) kind = 'attack';
  else if (severity >= 0.62 && recentNegative >= 1) kind = 'quarrel';
  else if (severity >= 0.42) kind = 'criticism';
  else if (joke || affection) kind = 'joke';
  else if (closeness >= 0.35) kind = 'tease';
  else kind = 'neutral';

  return {kind, severity, blame, confidence: Math.min(1, 0.45 + Math.abs(score) / 5), signals};
}

/** 情绪强度按绝对时间指数衰减；只算不改，定时器触发不会清空。 */
export function decayIntensity(emotion, now) {
  const label = String(emotion?.label || '平静');
  const base = Math.max(0, Math.min(1, Number(emotion?.intensity ?? 0)));
  const half = HALF_LIFE_MS[label] || 30 * 60_000;
  if (label === '平静' || half <= 0 || base <= 0) return 0;
  const since = Number(emotion?.since || now);
  const elapsed = Math.max(0, now - since);
  return base * Math.pow(0.5, elapsed / half);
}

/** 把衰减后的情绪归一化：弱到阈值以下就回到平静。 */
export function effectiveEmotion(emotion, now) {
  const intensity = decayIntensity(emotion, now);
  const label = intensity < CALM_THRESHOLD ? '平静' : String(emotion?.label || '平静');
  return {label, intensity: label === '平静' ? 0 : intensity};
}

/** 事件是否还活着；过了有效期就自然清除，不无限阻塞正常聊天。 */
export function eventAlive(event, now) {
  return Boolean(event && event.needsRepair && Number(event.expiresAt) > now);
}

function cleanSummary(text) {
  const cleaned = stripInternalState(String(text ?? '')).text;
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 46);
}

function defaultRelation(userId) {
  return {
    userId: String(userId),
    closeness: 0.3,
    interactions: 0,
    emotion: {label: '平静', intensity: 0, since: 0, by: 'init'},
    event: null,
    history: [],
    silenceUntil: 0,
    recentNegative: 0,
    lastNegativeAt: 0,
  };
}

/**
 * 轻量持久状态仓库。一个自我，按 QQ 号分桶，绝不把 A 的争执算到 B 头上。
 * 文件不存在 / 不可写时降级为纯内存，绝不抛错打断桥启动。
 */
export function createEmotionStore({file, disk = fs, now = () => Date.now(), random = Math.random, log = () => {}} = {}) {
  let data = {version: 1, savedAt: 0, relations: {}};
  try {
    if (file) {
      const parsed = JSON.parse(disk.readFileSync(file, 'utf8'));
      if (parsed?.version === 1 && parsed.relations && typeof parsed.relations === 'object') data = parsed;
    }
  } catch (error) {
    log('[emotion] 状态读取失败，按空状态继续：' + (error?.message || error));
  }

  function save() {
    if (!file) return false;
    try {
      disk.mkdirSync(path.dirname(file), {recursive: true});
      data.savedAt = now();
      const tmp = file + '.tmp';
      disk.writeFileSync(tmp, JSON.stringify(data), 'utf8');
      // 原子替换会丢掉原文件权限；情绪与关系是私密状态，每次写回都固定 600。
      try { disk.chmodSync(tmp, 0o600); } catch {}
      disk.renameSync(tmp, file);
      return true;
    } catch (error) {
      log('[emotion] 状态写入失败（内存仍生效）：' + (error?.message || error));
      return false;
    }
  }

  function relation(userId) {
    const id = String(userId ?? '').trim();
    if (!/^\d{5,12}$/.test(id)) return null;
    if (!data.relations[id]) data.relations[id] = defaultRelation(id);
    const r = data.relations[id];
    // 兼容旧版/手工编辑：缺字段补齐，不让一条坏数据把整桶带崩。
    if (!r.emotion) r.emotion = {label: '平静', intensity: 0, since: 0, by: 'init'};
    if (!Array.isArray(r.history)) r.history = [];
    return r;
  }

  function setEmotion(r, label, intensity, by, at) {
    r.emotion = {label, intensity: Math.max(0, Math.min(1, intensity)), since: at, by};
  }

  function prune(r, at) {
    const ev = r.event;
    if (ev) {
      const expired = at >= Number(ev.expiresAt || 0);
      const settled = !ev.needsRepair && Number(ev.acceptedAt || 0) > 0
        && at - Number(ev.acceptedAt) > 30 * 60_000;
      if (expired || settled) {
        r.history.push({at: ev.at, kind: ev.kind, resolvedAt: at, accepted: Boolean(ev.acceptedAt)});
        r.history = r.history.slice(-8);
        r.event = null;
      }
    }
    if (r.lastNegativeAt && at - Number(r.lastNegativeAt) > 30 * 60_000) r.recentNegative = 0;
  }

  /** 入站消息观察：更新情绪、亲近度、关系事件。只在有变化时落盘。 */
  function observe({userId, key, isGroup = false, isOwner = false, text = '', recentSelf = [], displayName = '', at = now()}) {
    const r = relation(userId);
    if (!r) return null;
    prune(r, at);
    const previous = {...r.emotion};
    const cls = classifyInteraction(text, {
      isOwner, closeness: r.closeness, recentNegative: r.recentNegative, recentSelf,
    });
    r.interactions += 1;
    if (isOwner && r.interactions <= 1) r.closeness = 0.9;

    const neg = ['criticism', 'quarrel', 'attack'].includes(cls.kind);
    const positive = ['praise', 'forgive', 'comfort'].includes(cls.kind);
    const soft = ['joke', 'tease', 'neutral'].includes(cls.kind);

    if (neg) {
      r.recentNegative = (r.lastNegativeAt && at - Number(r.lastNegativeAt) < 30 * 60_000 ? r.recentNegative : 0) + 1;
      r.lastNegativeAt = at;
      r.closeness = Math.max(0, r.closeness - 0.05);
      // 熟人认真责骂 -> 委屈/难过；被不公平对待或恶意攻击 -> 有脾气但不卑微。
      const label = cls.blame === 'other' && cls.kind === 'attack' ? '生气' : (cls.kind === 'quarrel' ? '生气' : '委屈');
      const strength = cls.blame === 'self' ? 0.85 : (cls.kind === 'attack' ? 0.8 : 0.7);
      setEmotion(r, label, Math.min(1, Math.max(strength, decayIntensity(previous, at) + 0.3)), cls.kind, at);
      if (cls.severity >= 0.42) {
        const ongoing = r.event && eventAlive(r.event, at);
        r.event = {
          id: String(at) + '-' + String(userId),
          at: ongoing ? r.event.at : at,
          lastAt: at,
          kind: cls.kind,
          severity: Math.max(cls.severity, ongoing ? r.event.severity : 0),
          blame: cls.blame,
          summary: cleanSummary(text) || (ongoing ? r.event.summary : ''),
          key: String(key),
          isGroup: Boolean(isGroup),
          needsRepair: true,
          userReconciled: ongoing ? r.event.userReconciled : false,
          reconcileCount: ongoing ? r.event.reconcileCount : 0,
          reconcileSentAt: ongoing ? r.event.reconcileSentAt : 0,
          acceptedAt: 0,
          expiresAt: (ongoing ? r.event.at : at) + EVENT_TTL_MS,
          displayName: String(displayName || '').slice(0, 20),
        };
      }
    } else if (positive) {
      r.recentNegative = 0;
      r.closeness = Math.min(1, r.closeness + 0.02);
      const cur = effectiveEmotion(previous, at);
      // 被安慰：负面情绪逐渐缓解，不是一键清零；被夸奖：开心程度提高。
      if (cls.kind === 'praise') {
        setEmotion(r, '开心', Math.min(1, 0.45 + (cur.label === '开心' ? cur.intensity * 0.4 : 0)), 'praise', at);
      } else if (cur.label !== '平静') {
        setEmotion(r, cur.label, Math.max(0, cur.intensity * 0.45), 'soothed', at);
      }
      if (r.event && r.event.needsRepair) {
        r.event.userReconciled = true;
        r.event.needsRepair = false;
        r.event.acceptedAt = at;
        r.event.expiresAt = Math.min(r.event.expiresAt, at + 30 * 60_000);
      }
    } else if (cls.kind === 'silence') {
      r.silenceUntil = at + 2 * 60 * 60_000;
    } else if (soft) {
      r.closeness = Math.min(1, r.closeness + 0.01);
      // 用户恢复正常互动：争执后逐渐恢复，不靠一次玩笑就抹平。
      if (r.event && r.event.needsRepair && !r.event.userReconciled) {
        r.event.normalSignals = Number(r.event.normalSignals || 0) + 1;
        if (r.event.normalSignals >= 3) {
          r.event.userReconciled = true;
          r.event.needsRepair = false;
          r.event.acceptedAt = at;
        }
      }
      const cur = effectiveEmotion(previous, at);
      if (cur.label !== '平静' && cur.intensity > 0) {
        setEmotion(r, cur.label, cur.intensity * 0.85, 'eased', at);
      }
    }

    save();
    return {classification: cls, relation: snapshot(userId, at)};
  }

  /** 过期 / 已解决且过了保留期的事件真正清除（惰性，只在实际清掉时落盘）。 */
  function gc(at = now()) {
    let dirty = false;
    for (const r of Object.values(data.relations)) {
      const ev = r.event;
      if (!ev) continue;
      const expired = at >= Number(ev.expiresAt || 0);
      const settled = !ev.needsRepair && Number(ev.acceptedAt || 0) > 0
        && at - Number(ev.acceptedAt) > 30 * 60_000;
      if (!expired && !settled) continue;
      r.history.push({at: ev.at, kind: ev.kind, resolvedAt: at, accepted: Boolean(ev.acceptedAt)});
      r.history = r.history.slice(-8);
      r.event = null;
      dirty = true;
    }
    if (dirty) save();
  }

  function snapshot(userId, at = now()) {
    gc(at);
    const id = String(userId ?? '').trim();
    const r = data.relations[id];
    if (!r) return null;
    const ev = r.event && Number(r.event.expiresAt) > at ? r.event : null;
    return {
      userId: id,
      closeness: Number(r.closeness ?? 0),
      interactions: Number(r.interactions ?? 0),
      emotion: effectiveEmotion(r.emotion, at),
      event: ev ? {...ev} : null,
      silenceUntil: Number(r.silenceUntil || 0),
    };
  }

  /** 标记「这次求和已经发出」，每次争执最多一次，之后不再追问。 */
  function noteReconcileSent(userId, key, at = now()) {
    const r = relation(userId);
    if (!r || !r.event || !r.event.needsRepair) return false;
    // 幂等：同一次争执无论被重复调用多少次，都只记一次。
    if (Number(r.event.reconcileSentAt) > 0) return false;
    r.event.reconcileCount = Number(r.event.reconcileCount || 0) + 1;
    r.event.reconcileSentAt = at;
    r.event.reconcileKey = String(key);
    save();
    return true;
  }

  /** 当前会话里尚未解决的关系事件（按人分桶取，不跨会话、不串线）。 */
  function pendingFor(key, at = now()) {
    gc(at);
    const out = [];
    for (const [id, r] of Object.entries(data.relations)) {
      const ev = r.event;
      if (eventAlive(ev, at) && String(ev.key) === String(key)) {
        out.push({userId: id, event: ev, closeness: Number(r.closeness || 0), emotion: effectiveEmotion(r.emotion, at)});
      }
    }
    out.sort((a, b) => Number(b.event.lastAt || b.event.at) - Number(a.event.lastAt || a.event.at));
    return out;
  }

  /** 当前会话的提示块。平静且没有未解决事件时返回空串，保持注入做减法。 */
  function promptBlock({userId, key, isOwner = false, at = now()} = {}) {
    let s = snapshot(userId, at);
    // 群聊里最近发言的人未必是刚才拌嘴的那个人：按会话找回对应的桶，
    // 仍然是按 QQ 号取状态，不会把 A 的情绪算到 B 头上。
    if ((!s || !s.event) && key) {
      const pending = pendingFor(key, at)[0];
      if (pending) s = snapshot(pending.userId, at);
    }
    if (!s) return '';
    const ev = s.event;
    const emo = s.emotion;
    if (emo.label === '平静' && !ev) return '';
    const bits = [];
    const mins = ev ? Math.max(0, Math.round((at - Number(ev.lastAt || ev.at)) / 60_000)) : 0;
    const who = ev?.displayName && !/^\d+$/.test(ev.displayName) ? ev.displayName : (isOwner ? '主人' : '对方');

    if (ev && ev.needsRepair) {
      bits.push(`和${who}刚才有点不愉快${mins ? `（约 ${mins} 分钟前）` : ''}${ev.summary ? `，他说的是「${ev.summary}」` : ''}，心里还没完全过去。`);
      if (emo.label === '委屈' || emo.label === '难过') bits.push('先软下来，话短一点，别嘴硬、别找补、别反复解释；');
      else if (emo.label === '生气') bits.push('有点不高兴但不想一直僵着，别阴阳怪气、也别装没事；');
      bits.push('先别叫「杂鱼」这类挑衅称呼，少玩梗，不主动翻旧账；他递台阶就顺着下，别再提道歉。');
    } else if (ev && (ev.userReconciled || ev.acceptedAt)) {
      bits.push(`和${who}刚才那点事已经翻篇了，别再提、别再道歉、别再保证，正常聊就好。`);
    } else if (emo.label !== '平静') {
      const tone = {
        '开心': '心情不错，可以轻快一点，但别吵到人；',
        '害羞': '有点不好意思，话可以短、可以软一点；',
        '想亲近': '想多聊两句，但别催回复、别黏着不放；',
        '犹豫': '有点拿不准，别急着表态，一句说到点就够；',
        '想和好': '心里还惦记着刚才那点事，想自然地说一句，别摆保证书、别装可怜；',
        '委屈': '还有点委屈，先软下来，话短一点，别嘴硬；',
        '难过': '还有点低落，不用硬撑热闹，也别拿情绪压人；',
        '生气': '还有点不高兴，允许有脾气，但别拿挑衅称呼撒气；',
      }[emo.label] || '';
      bits.push(tone);
    }
    if (!bits.length) return '';
    bits.push('过一阵自然就淡了，不用一直端着，也不用向谁解释自己怎么了。');
    return '【此刻心情】' + bits.join('') + '\n\n';
  }

  /** 求和候选判定：七项综合，不是关键词命中就发。 */
  function reconcileCandidate({userId, key, isGroup = false, isOwner = false, at = now(), quiet = false, paused = false, busy = false, closureCooldown = false, night = false, lastIncomingAt = 0, lastAiReplyAt = 0} = {}) {
    const s = snapshot(userId, at);
    const fail = (reason) => ({allowed: false, reason});
    if (!s || !s.event) return fail('no-unresolved-event');
    const ev = s.event;
    // 对方已经递台阶：先判「已和好」，别把一个已解决的事件说成过期。
    if (ev.userReconciled || Number(ev.acceptedAt) > 0) return fail('already-reconciled');
    if (!eventAlive(ev, at)) return fail('expired');
    if (Number(ev.reconcileCount) >= 1 || Number(ev.reconcileSentAt) > 0) return fail('once-per-quarrel');
    if (Number(ev.severity) < 0.42 || ['joke', 'tease', 'neutral'].includes(ev.kind)) return fail('not-a-real-quarrel');
    if (s.closeness < CLOSE_ENOUGH && !isOwner) return fail('not-close-enough');
    if (quiet || paused || busy || closureCooldown || night) return fail('not-a-good-moment');
    if (Number(s.silenceUntil) > at) return fail('asked-for-quiet');
    if (isGroup || ev.isGroup) return fail('avoid-public-scene');
    if (String(ev.key) !== String(key)) return fail('no-cross-scene');
    if (lastIncomingAt && at - Number(lastIncomingAt) < 60_000) return fail('just-talked');
    if (lastAiReplyAt && at - Number(lastAiReplyAt) < 10 * 60_000) return fail('spoke-recently');

    // 时间窗刻意不固定：按严重度、亲近度与一次随机抖动浮动 8~22 分钟，
    // 上界取 3 小时与事件剩余有效期的较小值，避免「每次都是等十分钟」。
    const rnd = Math.max(0, Math.min(1, Number(random()) || 0));
    const minDelay = Math.round((8 + 6 * (1 - Number(ev.severity)) + 6 * rnd + 2 * (1 - s.closeness)) * 60_000);
    const maxDelay = Math.min(3 * 60 * 60_000, Math.max(0, Number(ev.expiresAt) - at));
    const elapsed = at - Number(ev.lastAt || ev.at);
    if (elapsed < minDelay) return fail('too-soon');
    if (elapsed > maxDelay) return fail('too-late');

    const style = ev.userReconciled ? 'accepted'
      : ev.blame === 'self' ? 'admit'
      : (ev.kind === 'quarrel' && s.closeness >= 0.6) ? 'bicker'
      : ev.blame === 'other' ? 'stand-ground'
      : 'gentle';
    return {allowed: true, reason: 'ok', style, event: ev, emotion: s.emotion, closeness: s.closeness, minDelay};
  }

  /** 求和提示只给方向与边界，不给可复制的台词库；怎么说交给她自己。 */
  function reconcilePrompt({userId, style = 'gentle', at = now()} = {}) {
    const s = snapshot(userId, at);
    const ev = s?.event;
    if (!ev) return '';
    const who = ev.displayName && !/^\d+$/.test(ev.displayName) ? ev.displayName : '他';
    const direction = {
      admit: '是你刚才那句可能说重了，就按这个分寸自己承认一句，别把整件事重讲一遍；',
      bicker: '是熟人之间拌嘴，别端着、也别卑微，可以带点嘴硬和不服气，但意思是想和好；',
      'stand-ground': '他那火气有点没道理，你有自尊，可以轻轻提一句自己也有点不开心，但别翻账、别逼他认错；',
      accepted: '他已经先递台阶了，顺着翻篇就好，别再道歉；',
      gentle: '没什么大的对错，就是刚才有点僵，自然带一句过去就好；',
    }[style] || '';
    return `【想和好】和${who}刚才那点不愉快还没过去${ev.summary ? `（他说的是「${ev.summary}」）` : ''}。${direction}只说一句，日常口气，短，不摆保证书、不反复说对不起、不装可怜、不制造愧疚，更别问他为什么没回。他没回就当这事过去了，不追问、不补发、不连着找他。说完该聊什么聊什么，别一直停在这件事上。\n\n`;
  }

  /** 有未解决重要事件时，把普通随机调侃压下去（不是永久封死）。 */
  function randomChatFactor(userId, at = now()) {
    const s = snapshot(userId, at);
    if (!s || !eventAlive(s.event, at)) return 1;
    return s.event.userReconciled ? 0.75 : 0.15;
  }

  /** 调度器只有会话 key：按该会话里的未解决事件统一抑制随机调侃。 */
  function randomChatFactorForKey(key, at = now()) {
    const list = pendingFor(key, at);
    if (!list.length) return 1;
    return list.some(x => !x.event.userReconciled) ? 0.15 : 0.75;
  }

  function stats(at = now()) {
    const ids = Object.keys(data.relations);
    return {
      users: ids.length,
      unresolved: ids.filter(id => eventAlive(data.relations[id]?.event, at)).length,
      savedAt: Number(data.savedAt || 0),
      file: file || null,
    };
  }

  return {
    observe, snapshot, noteReconcileSent, promptBlock, reconcileCandidate, reconcilePrompt,
    randomChatFactor, randomChatFactorForKey, pendingFor, stats, save, raw: () => data,
  };
}
