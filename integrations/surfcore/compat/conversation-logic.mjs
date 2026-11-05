// Keep conversational guidance separate from product tools and generation recovery.
import {personAnchor} from './relationships.mjs';

export function groupActivityView(groups, {now, owner, self, blockedUsers, connected, redact, since = 0}) {
  const observed = groups.map(({key, name, messages}) => {
    const incoming = messages.filter(m => m && !m.isSelf && m.messageId
      && (!self || String(m.userId) !== String(self)) && !blockedUsers.has(String(m.userId ?? '').trim())
      && Number(m.time) > 0 && Number(m.time) <= now)
      .sort((a, b) => Number(b.time) - Number(a.time));
    return {key, name, incoming, lastSeenAt: Number(incoming[0]?.time || 0)};
  }).filter(group => !since || group.lastSeenAt > since)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, 2);
  if (!observed.length) return null;
  const account = m => /^[1-9]\d*$/.test(String(m.userId ?? '')) ? String(m.userId) : '';
  const clean = (value, max) => redact(String(value ?? '')).replace(/\s+/g, ' ').trim().slice(0, max);
  return {
    windowMinutes: 10,
    groups: observed.map(({key, name, incoming, lastSeenAt}) => {
      const fresh = connected ? incoming.filter(m => Number(m.time) > now - 600000) : [];
      const speakerCount = new Set(fresh.map(account).filter(Boolean)).size;
      const status = !connected || !lastSeenAt ? 'unknown' : fresh.length >= 8 && speakerCount >= 3
        ? 'busy' : fresh.length ? 'active' : 'quiet';
      const excerpts = fresh.filter(m => Number(m.time) > since && String(m.plain ?? '').trim())
        .slice(0, 2).reverse().map(m => {
          const id = account(m);
          const speaker = String(m.sender ?? '').trim();
          return {
            at: new Date(Number(m.time)).toISOString(),
            speaker: /^\d+$/.test(speaker) ? '' : clean(speaker, 40),
            person: id ? personAnchor(id) : null,
            role: id ? (id === String(owner) ? 'owner' : 'member') : 'unknown',
            text: clean(m.plain, 90),
          };
        });
      return {group: personAnchor(key).replace('person-', 'group-'), name: clean(name, 60), status,
        messages: connected ? fresh.length : null,
        lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null, excerpts};
    }),
  };
}

function mentionContext(message) {
  if (!Array.isArray(message.mentions) || !message.mentions.length) return '';
  return ' {明确@：' + message.mentions.map(m => {
    const name = String(m.name || '').replace(/[\r\n{}]/g,' ').slice(0,80);
    return m.userId === 'all' ? '全体成员' : `${name ? '@'+name+' ' : ''}[${personAnchor(m.userId)}]${m.isSelf ? '（你自己）' : '（其他人）'}`;
  }).join('、') + '}';
}
export function scopedToolGuide(text,key,owner) {
  return key==='private:'+String(owner)?text:text.split('## 和主人一起看基金')[0].trim();
}
export function qqPersona(text) {
  // This paragraph duplicates CHAT-STYLE and adds Bili-only publishing rules.
  return text.replace(/\n- 【B站同口[^\n]*[\s\S]*?(?=\n- 【查账小本本)/,'\n');
}
export function conversationFocus(messages=[],lastReplyAt=0) {
  const recent=messages.filter(m=>m&&typeof m==='object').slice(-8);
  if(!recent.some(m=>!m.isSelf))return '';
  return '【当前话头】下面按发生顺序保留双方最近说的话；新问题优先，单独问号/催问沿引用和未答问题理解，旧图片不覆盖后来的文字。明确@记录保留了被叫到的真实对象；@你可以只是叫你来听，同句还@别人时，结合正文判断在说谁，不能把另一个人认成你或上一张图。先在心里核对这句是在回答谁、哪件事、事实有无依据；不必把检查过程说出来。\n'+recent.map(m=>`[${m.isSelf?'自己刚说':m.time>lastReplyAt?'新来信':'背景'} #${m.messageId}]${m.userId?' ['+personAnchor(m.userId)+']':''}${mentionContext(m)} ${String(m.text||m.plain||'').slice(0,500)}`).join('\n');
}
export function withConversationFocus(body,lastReplyAt=0) {
  if(!body||!Array.isArray(body.newMessages||body.messages))return body;
  const messages=(body.newMessages||body.messages).filter(m=>m&&typeof m==='object');
  return messages.length?{...body,currentThread:conversationFocus(messages,lastReplyAt)}:body;
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
