function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Availability anchor drift: ' + before.slice(0, 70));
  return source.replace(before, after);
}
export function patchAvailabilityBridge(source) {
  source = once(source, "import {proactiveDelay} from '../whale-compat/proactive-clock.mjs';", "import {proactiveDelay} from '../whale-compat/proactive-clock.mjs';\nimport {interactiveOwnerMessage,ownerMessageGuard,privateRestHint,nightRestPlan} from '../whale-compat/private-availability.mjs';");
  source = once(source, 'function tokenGuardWakeBlock(key, st, { direct = false } = {}) {', 'function tokenGuardWakeBlock(key, st, { direct = false, reason = \'\' } = {}) {');
  source = once(source, 'guard: g, cost: null, direct });', 'guard: ownerMessageGuard(g, {key,ownerQQ:cfg.ownerQQ,reason,unread:st?.unread}), cost: null, direct });');
  source = once(source, 'const tokenWake = tokenGuardWakeBlock(key, st, { direct: directWake });', 'const tokenWake = tokenGuardWakeBlock(key, st, { direct: directWake, reason });');
  source = once(source, '被 @/引用/叫到/拍一拍会立即唤醒，但每日唤醒次数和当日 token 额度（QQ / SurfCore 总额）仍然生效；超过后消息会保留在未读，下一轮再看，不烧这一轮。', '${Number(key.startsWith("private:") ? tg.privateMaxWakesPerDay : tg.maxWakesPerDay) > 0 ? "本会话后台机会仍受已配置的每日次数限制。" : "本会话不设每日唤醒次数上限。"}主人当前新私信不按后台次数截断，仍受当日实际费用与 Token 额度限制。额度或服务异常要如实区分，不当成睡觉。');
  source = once(source, '    if (tokenWake) {\n      log(', `    if (tokenWake) {
      if (tokenWake.reason === 'budget' && interactiveOwnerMessage({key,ownerQQ:cfg.ownerQQ,reason,unread:st.unread})) {
        await ownerAvailabilityNotice137(key, 'budget');
      }
      log(`);
  source = once(source, '  async function sendWakePromptV2(key, reason) {', `  async function ownerAvailabilityNotice137(key, kind) {
    if(key !== 'private:' + cfg.ownerQQ) return {skipped:'scope'};
    try {
      return await whale.ownerNotice(kind, async (params, deliveryId, assertCurrent) => {
        assertCurrent();
        const response = await fetch(String(cfg.snowluma.httpUrl).replace(/\\/+$/, '') + '/send_private_msg', {
          method:'POST',headers:{'content-type':'application/json','x-whale-delivery-id':deliveryId,'x-whale-origin':'surfcore',...(cfg.snowluma.accessToken ? {authorization:'Bearer '+cfg.snowluma.accessToken} : {})},
          body:JSON.stringify(params),signal:AbortSignal.timeout(20000)
        });
        const result=await response.json();
        if(!response.ok || result.retcode!==0) throw Error('owner_notice_not_confirmed');
        return result.data;
      });
    } catch { log('[availability] owner notice unconfirmed; no automatic resend'); return {uncertain:true}; }
  }
  async function sendWakePromptV2(key, reason) {`);
  source = once(source, "const base = currentRoleHintV2(key) + '\\n\\n' + roleLine", "const base = privateRestHint(key,cfg.ownerQQ,Date.now()) + currentRoleHintV2(key) + '\\n\\n' + roleLine");
  source = once(source, '          st.wakeConfig = next;\n          st.wakeConfig.lastWakeAt', `          const rest137 = nightRestPlan({key,ownerQQ:cfg.ownerQQ,state:st,next,now:Date.now()});
          Object.assign(next,rest137.next);
          st.wakeConfig = next;
          st.wakeConfig.lastWakeAt`);
  source = once(source, '          wakeConfigUpdatedKeys.add(key);', "          if(rest137.rest && !rest137.saidGoodnight) await ownerAvailabilityNotice137(key,'night-rest');\n          wakeConfigUpdatedKeys.add(key);");
  return source;
}

export function patchNativeStickerTransport(source) {
  const start=source.indexOf('  async function sendStickerV2('),end=source.indexOf('  // 更新本地 AI 认知',start);
  if(start<0||end<0)throw Error('Native sticker boundary drift');
  let section=source.slice(start,end);
  const begin=section.indexOf('        const res = await fetch(`${httpUrl}/${action}`, {'),finish=section.indexOf('        sendResolve(body.data);',begin);
  if(begin<0||finish<0)throw Error('Native sticker transport drift');
  section=section.slice(0,begin)+'        const receipt = await onebotSendSegments(kind, id, segments);\n        sendResolve(receipt);'+section.slice(finish+'        sendResolve(body.data);'.length);
  const unused=section.indexOf("    const action = kind === 'private' ? 'send_private_msg' : 'send_group_msg';"),comment=section.indexOf('    // 与文本发送共用 sendChain',unused);
  if(unused<0||comment<0)throw Error('Native sticker request boundary drift');
  section=section.slice(0,unused)+section.slice(comment);
  return source.slice(0,start)+section+source.slice(end);
}
