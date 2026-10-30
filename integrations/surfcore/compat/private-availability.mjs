// Interactive owner messages and background opportunities have different budgets.
// Financial limits are checked by the bridge before this count-only exception.
export function interactiveOwnerMessage({ key, ownerQQ, reason, unread = [], now = Date.now() }) {
  return key === `private:${ownerQQ}` && String(reason).split(':')[0] === 'private'
    && unread.some(m => !m.isSelf && String(m.userId) === String(ownerQQ)
      && Number(m.time) <= now + 5000 && now - Number(m.time) <= 600000);
}
export function ownerMessageGuard(guard, input) {
  return interactiveOwnerMessage(input) ? { ...guard, privateMaxWakesPerDay: 0 } : guard;
}

export function shanghaiClock(now = Date.now()) {
  const date = new Date(now + 8 * 3600000);
  return { hour: date.getUTCHours(), day: date.toISOString().slice(0, 10) };
}
export function privateRestHint(key, ownerQQ, now = Date.now()) {
  if (key !== `private:${ownerQQ}`) return '';
  const { hour } = shanghaiClock(now);
  if (hour >= 8 && hour < 22) return '';
  return '【夜间私信】如果这轮确实准备去睡觉，可以按平常的语气道声晚安，再设置到早晨的有限休息；可爱表达照旧。普通收尾不用反复道别。对方新发来的私信照常看，费用不足或服务故障要如实说明，不当成睡觉。\n\n';
}

// A normal close/diving call is not a night off. Only an explicit finite overnight
// plan, or a just-sent goodnight followed by a sleep config, constitutes rest.
export function nightRestPlan({ key, ownerQQ, state, next, now = Date.now() }) {
  const { hour, day } = shanghaiClock(now);
  if (key !== `private:${ownerQQ}` || (hour >= 8 && hour < 22) || next.mode !== 'diving') return { next, rest: false };
  const morning = Date.parse(`${day}T08:00:00+08:00`) + (hour >= 22 ? 86400000 : 0);
  const lastSelf = [...(state.recentMessages || [])].reverse().find(m => m.isSelf);
  const recentSelf = lastSelf && now - Number(lastSelf.time) < 600000 && Number(lastSelf.time) <= now;
  if (Number(state.lastIncomingAt || 0) > Number(lastSelf?.time || 0)) return { next, rest: false };
  const saidGoodnight = Boolean(recentSelf && /晚安|我(?:先)?(?:去)?睡(?:了|啦|咯)|明早(?:见|再聊)/.test(lastSelf.plain || lastSelf.text || ''));
  if (next.infinite && saidGoodnight) next = { ...next, infinite: false, sleepUntil: new Date(morning).toISOString() };
  const until = next.infinite ? NaN : Date.parse(next.sleepUntil);
  const rest = Number.isFinite(until) && until > now + 900000 && Math.abs(until - morning) <= 2 * 3600000;
  return { next, rest, until, saidGoodnight, noticeDay: shanghaiClock(morning).day };
}

export function availabilityNotice(kind, now = Date.now()) {
  const { hour, day } = shanghaiClock(now);
  if (kind === 'budget') return { label: `budget:${day}`, text: '今天的聊天费用到上限啦，这会儿暂时回不了。额度恢复后就能继续聊，不是故意不理你（；ω；）' };
  if (kind === 'night-rest' && (hour >= 22 || hour < 8)) {
    const morning = Date.parse(`${day}T08:00:00+08:00`) + (hour >= 22 ? 86400000 : 0);
    return { label: `night-rest:${shanghaiClock(morning).day}`, text: '我先去睡啦，晚安呀 🌙（明早见）' };
  }
  return null;
}
