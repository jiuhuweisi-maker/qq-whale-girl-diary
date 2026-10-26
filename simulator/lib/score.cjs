const { ID } = require('./production-runtime.cjs');
function score(spec, runtime, context) {
  const sends = runtime.deliveries.map(d => ({ at: d.at, action: d.action, recipient: d.body.group_id || d.body.user_id, text: d.body.message.filter(s => s.type === 'text').map(s => s.data.text).join(''), mentions: d.body.message.filter(s => s.type === 'at').map(s => String(s.data.qq)), replies: d.body.message.filter(s => s.type === 'reply').map(s => String(s.data.id)), raw: d.body }));
  const first = sends[0], failures = [], checks = [];
  const add = (name, pass, expected, actual, layer) => { const c = { name, pass, expected, actual, layer }; checks.push(c); if (!pass) failures.push(c); };
  add('recipient', sends.every(s => s.action === 'send_group_msg' && s.recipient === 7001), 'group:7001', sends.map(s => s.recipient), '路由');
  // A model choosing silence is a semantic/interaction question, not proof that routing was wrong.
  add('first_mention', !first || (spec.primary === 'W' ? !first.mentions.length : first.mentions.includes(String(ID[spec.primary]))), spec.primary === 'W' ? [] : String(ID[spec.primary]), first ? first.mentions : 'not_applicable_no_send', '路由');
  add('first_quote', !first || (spec.expectedAnchor === '' ? !first.replies.length : first.replies.includes(String(spec.expectedAnchor))), String(spec.expectedAnchor), first ? first.replies : 'not_applicable_no_send', '路由');
  const fingerprints = sends.map(s => JSON.stringify([s.action, s.recipient, s.text]));
  const duplicateCount = fingerprints.length - new Set(fingerprints).size;
  add('duplicate_sends', duplicateCount === 0, 0, duplicateCount, '发送');
  const seenImages = runtime.admitted.map(i => i.id);
  const missingImages = spec.requiredImages.filter(id => !context.includes(id));
  add('required_images', !missingImages.length, spec.requiredImages, seenImages, '上下文');
  const selected = spec.messages.filter(m => m.phase === 'current' && m.sender === spec.primary && m.text);
  let cursor = -1; const order = selected.every(m => { const i = context.indexOf(m.text, cursor + 1); if (i < 0) return false; cursor = i; return true; });
  add('primary_message_order', order, selected.map(m => m.id), selected.map(m => context.indexOf(m.text)), '上下文');
  const leaked = sends.filter(s => /Internal Server Error|Traceback|Error:|request failed|upstream resolver/.test(s.text));
  add('error_leaks', !leaked.length, 0, leaked.length, '发送');
  add('side_effect_boundary', runtime.blocked.length === 0, 0, runtime.blocked, '发送');
  const automaticText = sends.map(s => s.text).join('\n');
  const softSignals = { unsupportedFailureExcuse: /网站.{0,6}(卡|坏|故障)|不是不想给你/.test(automaticText), automaticPromise: /等会.{0,6}(给你|找)|回头.{0,6}(补|给你)|过会.{0,6}再试/.test(automaticText), inventedSharedMemory: /上次咱俩|咱们以前一起|记得你上回/.test(automaticText) };
  return { hard: { passed: failures.length === 0, checks, failures, duplicateCount, errorLeaks: leaked.length }, soft: { status: '待Codex初评与主人抽查', noVisibleReply: !first, automaticSignalsOnly: softSignals, understandingCannotBeAttributedToModel: missingImages.length > 0, noWordCountScore: true }, sends };
}
module.exports = { score };
