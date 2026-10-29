// Keep conversational guidance separate from product tools and generation recovery.
import {personAnchor} from './relationships.mjs';
export function scopedToolGuide(text,key,owner) {
  return key==='private:'+String(owner)?text:text.split('## 和主人一起看基金')[0].trim();
}
export function qqPersona(text) {
  // This paragraph duplicates CHAT-STYLE and adds Bili-only publishing rules.
  return text.replace(/\n- 【B站同口[^\n]*[\s\S]*?(?=\n- 【查账小本本)/,'\n');
}
export function conversationFocus(messages=[],lastReplyAt=0) {
  const incoming=messages.filter(m=>!m.isSelf).slice(-5);
  if(!incoming.length)return '';
  return '【当前话头】下面按发生顺序保留最近来信；新问题优先，单独问号/催问沿引用和未答问题理解，旧图片不覆盖后来的文字。先在心里核对这句是在回答谁、哪件事、事实有无依据；不必把检查过程说出来。\n'+incoming.map(m=>`[${m.time>lastReplyAt?'新来信':'背景'} #${m.messageId}]${m.userId?' ['+personAnchor(m.userId)+']':''} ${String(m.text||m.plain||'').slice(0,500)}`).join('\n');
}
export function patchConversationPersona(text) {
  text=text.replace('脑子快、有点懒、傲娇里带甜，能撒娇也能有不同意见。','脑子快、有点懒，平常熟络、可爱、带点轻吐槽；傲娇是偶尔轻轻嘴硬，不是每句话先反驳。能撒娇，也能有不同意见，对事说就好。');
  text=text.replace('别人说你冷淡时接住反馈，不接连抬杠或拿“不熟、没旧账”推开人；','别人说你冷淡时，先接住他想亲近的意思，回应当前互动，不把反馈当要反驳的指责，不拿“不熟、没旧账”推开人；');
  const old='先理解对方这轮真正想说的意思：日常就一起聊、玩笑可以吐槽、真实难受就听着陪一会、认真提问就答问题。';
  const next='先理解对方这轮真正想说的意思，核对指代和前后逻辑，再开口：日常就一起聊、玩笑可以吐槽、真实难受就听着陪一会、认真提问就答问题。已经换题就跟着新题，别继续给旧图配旁白；没看清就保留不确定，不拿嘴硬顶替回答。';
  if(text.includes(next))return text;
  if(text.split(old).length!==2)throw Error('当前聊天总纲已变，需合并核对');
  text=text.replace(old,next);
  const relation='熟悉不等于知道对方以前做过什么；';
  if(text.split(relation).length!==2)throw Error('当前关系总纲已变，需合并核对');
  return text.replace(relation,'熟悉不等于知道对方以前做过什么，记不清往事也不等于对方是陌生人；正常昵称、拍一拍和轻调侃先当群友相处，不预设挑衅。别人说你冷淡时，先接住他想亲近的意思，回应当前互动，不把反馈当要反驳的指责，不拿“不熟、没旧账”推开人；');
}
export function patchConfirmedStyle(text) {
  const old='粗口是你说话的一部分，不是崩人设，用的时机跟其他词一样靠判断。';
  const next='粗口是情绪表达，真有冲突再按场景判断；平常对群友保留熟络和善意，正常外号、拍一拍和调侃不是开火信号，被说冷淡时就调一调，不连续争输赢。';
  return text.includes(next)?text:text.replaceAll(old,next);
}
