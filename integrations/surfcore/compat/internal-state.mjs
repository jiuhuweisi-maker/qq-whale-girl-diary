// 225：把「桥的内部状态」挡在模型和持久化叙事之外。
//
// 2026-11-09 凌晨事故：文字发送撞上 socialV2.send.maxSendPerHour=60，
// 429 结果原样回给模型，模型把「被每小时 60 条上限挡住、约 01:55 恢复」
// 写进 qq_close_conversation 的 summary / nextOpening、qq_report_feedback
// 和两条 qq_memory_append(anchor)，下一轮照着 nextOpening 念，主人以为她坏了。
// 同一串 429 又被 noteSendFailure 当成通道故障，暂停自动唤醒，主人喊了三声没人应。
//
// 这里只做「句子级」过滤：删掉含工程内部状态的那一句，其余聊天内容原样保留。
// 规则文档、代码注释、日志不受影响；只作用于模型写回的收尾/反馈/记忆字段。

// 明确指向桥内部机制的词。不收「恢复」「修复」这类日常词，避免误伤正常聊天。
export const INTERNAL_STATE_RE = new RegExp([
  '限流', '频率超限', '发送频率', '429', 'SEND_RATE_LIMIT', 'rate[- ]?limit',
  '额度', '配额', '上限', '冷却', '每小时', '每分钟', '60\\s*条', 'maxSendPer',
  '发不出去', '没发出去', '发送失败', '发送被', '卡住', '卡死', '挡住', '挡下来', '被挡',
  '只能发', '只剩表情', '甩图', '说不出话', '挤不出来', '话堵在嘴里',
  '会话权限', '新会话', '唤醒', '潜水', 'sleepUntil', 'sleep\\s*Ms', 'pending',
  '回执', '闸门', '令牌', '管理端', '控制台', '部署', '桥接', 'bridge',
  'seq\\d*', 'message_?id', '接口', '工具返回', '调用失败', '报错', '故障', '修复',
  '重试', '稍后再发', '恢复时间', '约\\s*\\d{1,2}:\\d{2}', 'token', 'session',
].join('|'), 'i');

const SENTENCE_SPLIT_RE = /([。！？!?；;\n]+)/;

/**
 * 把模型写回的叙事文本里的「内部状态句」删掉。
 * 返回 {text, removed, hits}；removed=true 表示至少删了一句，调用方可记审计日志。
 * 输入不是字符串时安全返回空文本，不抛错。
 */
export function stripInternalState(value) {
  const raw = typeof value === 'string' ? value : '';
  if (!raw.trim()) return {text: raw, removed: false, hits: []};
  const parts = raw.split(SENTENCE_SPLIT_RE);
  const hits = [];
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] || '';
    const sep = parts[i + 1] || '';
    if (sentence && INTERNAL_STATE_RE.test(sentence)) {
      hits.push(sentence.trim().slice(0, 160));
      continue;
    }
    kept.push(sentence + sep);
  }
  const text = kept.join('').replace(/\n{3,}/g, '\n\n').trim();
  return {text, removed: hits.length > 0, hits};
}

/**
 * 对记忆 extra 这类小对象里的字符串值做同一套句子级过滤。
 * 只处理 plain object / array / string，深度有限，避免递归踩到循环引用。
 */
export function stripObjectStrings(value, depth = 3) {
  if (typeof value === 'string') return stripInternalState(value).text;
  if (depth <= 0 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripObjectStrings(v, depth - 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = stripObjectStrings(v, depth - 1);
  return out;
}

/**
 * 发送限流的对外返回体。管理端的 gate-event 仍记录完整 info，
 * 但给模型的这一份不含设置路径、当前值、上限、重试时间、恢复时刻，
 * 免得被转述成「我被限流了/这会儿发不出去」的台词。
 */
export function publicSendLimitResult() {
  return {
    ok: false,
    code: 'SEND_RATE_LIMIT',
    error: '这一条先收住，接着聊眼前这句就好。',
  };
}

/**
 * 主人私聊的 key。文字/表情发送限流、通道故障的自动唤醒暂停都不该挡住主人。
 */
export function isOwnerPrivateKey(key, ownerQQ) {
  const owner = String(ownerQQ ?? '').trim();
  return owner !== '' && String(key) === 'private:' + owner;
}
