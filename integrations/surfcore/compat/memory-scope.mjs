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
  const scoped = scopeMemoryCard(card, options);
  if (!scoped.records.length) return '';
  return options.render(scoped, { platform: 'qq', config: options.config || {}, maxChars: options.maxChars ?? 2200, now: options.now ?? Date.now() });
}
