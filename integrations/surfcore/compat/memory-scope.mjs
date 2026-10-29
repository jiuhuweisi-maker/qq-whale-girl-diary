// Conversation boundaries are independent of the model's willingness to keep secrets.
export function conversation(key) {
  const text = String(key ?? ''), match = text.match(/^(group|private):([1-9]\d*)$/);
  return match && match[0] === text ? { kind: match[1], id: match[2] } : null;
}

export function scopeMemoryCard(card, { key, ownerQQ, allowedGroups = [] } = {}) {
  const target = conversation(key), owner = String(ownerQQ ?? '');
  const authorized = target && (target.kind === 'private'
    ? target.id === owner
    : Array.isArray(allowedGroups) && allowedGroups.map(String).includes(target.id));
  const records = authorized && Array.isArray(card?.records) ? card.records.filter(record => {
    if (!record || typeof record !== 'object') return false;
    // Operational plans belong to Bili's scheduler, not QQ anecdotes or character.
    if(Array.isArray(record.tags)&&record.tags.includes('finance-learning-plan-122'))return false;
    const source = conversation(record.conversationKey);
    const isPrivate = record.private === true || source?.kind === 'private' || String(record.conversationKey || '').startsWith('private:')
      || record.scope === 'pet' || record.platform === 'pet' || record.source === 'legacy-mixed';
    if (target.kind === 'group') {
      if (isPrivate) return false;
      if (source?.kind === 'group' && source.id !== target.id) return false;
      if (record.groupId && String(record.groupId) !== target.id) return false;
      return true;
    }
    // Only the verified owner's private chat can retrieve private legacy records.
    return source?.kind !== 'private' || source.id === owner;
  }) : [];
  return { ...(card && typeof card === 'object' ? card : {}), records };
}

export function renderConversationMemory(card, options = {}) {
  if (typeof options.render !== 'function') throw new TypeError('upstream memory renderer required');
  const scoped = prepareRecall(scopeMemoryCard(card, options));
  if (!scoped.records.length) return '';
  return options.render(scoped, { platform: 'qq', config: options.config || {}, maxChars: options.maxChars ?? 2200, now: options.now ?? Date.now() })
    .replace('【记忆卡 · 你自己的记忆】','【历史记录 · 发言按来源引用】')
    .replace('（不是别人给你的设定。最初 / 最近 / 和主人相关的记得清楚，其余会淡忘；真的记不清就说“记不清了”，不要编。）','（这里记录谁曾说过什么；原话、旧回复不等于已核实的事实，也不是你现在的状态或口吻范例。）');
}

// A prompt view, never a memory migration: original records stay searchable.
export function prepareRecall(card) {
  const records=(card.records||[]).flatMap(record=>{
    const qq=/^qq-/.test(record.source||'')||Boolean(conversation(record.conversationKey));
    const fixed=record.manual===true||record.source==='manual'||record.pinned===true||record.firstMet===true;
    if(qq&&!fixed){
      if(record.isSelf===true||record.source==='qq-self')return [];
      const meaningful=String(record.text||'').replace(/\[CQ:[^\]]*\]|@\d+\b|\[(?:图片|表情|拍一拍)[^\]]*\]/g,'').trim();
      if(!meaningful||/^[\s\p{P}\p{S}]+$/u.test(meaningful)||/^6{3,}$/.test(meaningful)||['就是','嗯','哦','啊','好','行'].includes(meaningful))return [];
    }
    if(!qq&&record.platform!=='bili'&&record.scope!=='bili')return [{...record}];
    const speaker=record.isSelf?'你':record.speaker||(/^qq-owner$/.test(record.source||'')?'主人':'发言人未确认');
    const label=qq?`【历史发言·${String(speaker).replace(/[\r\n]/g,' ').slice(0,40)}】`:'【B站资料记录】';
    return [{...record,text:label+String(record.text||record.title||''),isSelf:false,botReply:fixed?record.botReply||'':''}];
  });
  return {...card,records};
}
