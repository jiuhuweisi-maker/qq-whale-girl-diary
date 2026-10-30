function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Mention anchor drift: ' + before.slice(0,70));
  return source.replace(before, after);
}
export function patchMessageMentions(source) {
  source = once(source, "import { compactModelMessage } from './qq-model-view.js';", "import { compactModelMessage } from './qq-model-view.js';\nimport {extractMentions} from '../whale-compat/message-mentions.mjs';");
  source = once(source, 'userId = null, forwardIds = []) {', 'userId = null, forwardIds = [], mentions = []) {');
  source = once(source, '      tail: truncateTextTail(String(plainContent ?? textContent), 200),', '      tail: truncateTextTail(String(plainContent ?? textContent), 200),\n      mentions,');
  source = once(source, '    const mediaList = extractMediaFromSegments(event.message ?? []);', '    const mentions = await extractMentions(event.message, {selfId:event.self_id,resolveAtName});\n    const mediaList = extractMediaFromSegments(event.message ?? []);');
  source = once(source, 'event.user_id ?? null, extractForwardIds(event.message ?? []));', 'event.user_id ?? null, extractForwardIds(event.message ?? []), mentions);');
  source = once(source, '      tail: truncateTextTail(plain || text || \'\', 200),', '      tail: truncateTextTail(plain || text || \'\', 200),\n      mentions: await extractMentions(segments, {selfId:self}),');
  source = once(source, '        tail: candidate.tail,', '        tail: candidate.tail,\n        mentions: candidate.mentions || [],');
  return source;
}
export function patchStickerCadence(source) {
  source = once(source, '- 频率：普通闲聊不用每条都配；大约每 3~5 轮来一张就够，热闹/玩梗时可以更密，但不要连续刷屏。', '- 频率：看语境和实际冷却，不按固定轮数配图；合适时可以单独回一张，也可以配短话。没合适的就不发，不连发证明活跃。');
  source = once(source, '想说的话先用 qq_send_message / qq_reply 作为单独气泡发出，再单独发表情。', '有话想说才用 qq_send_message / qq_reply 另发气泡，表情本身能接住时不必另配文字。');
  source = once(source, '不要把表情包当回复的唯一内容（偶尔可以，但别让群友觉得你在敷衍）。', '对方有认真问题时别只拿无关表情敷衍；普通接梗可以只回表情。');
  return source;
}
