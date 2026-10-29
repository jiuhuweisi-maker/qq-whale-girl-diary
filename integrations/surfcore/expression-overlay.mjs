function once(source,before,after){if(source.split(before).length!==2)throw Error('Expression overlay anchor drift: '+before.slice(0,60));return source.replace(before,after);}
export function patchExpressionBridge(source){
  source=once(source,"import {relationshipBlock} from '../whale-compat/relationships.mjs';","import {relationshipBlock} from '../whale-compat/relationships.mjs';\nimport {composeConfirmedPersona,contextualFollowUp} from '../whale-compat/expression-style.mjs';\nimport {proactiveDelay} from '../whale-compat/proactive-clock.mjs';");
  source=once(source,"return [qqPersona(fs.readFileSync(cfg.whaleCompat.personaFile, 'utf8')), fs.readFileSync(cfg.whaleCompat.styleFile, 'utf8')].join('\\n\\n');","return composeConfirmedPersona(qqPersona(fs.readFileSync(cfg.whaleCompat.personaFile, 'utf8')), fs.readFileSync(cfg.whaleCompat.styleFile, 'utf8'));");
  source=once(source,"    if (tr.question && isDirectedAtAi(plainContent)) return 'question';","    if (tr.question && (isDirectedAtAi(plainContent) || contextualFollowUp(st,event,plainContent))) return 'question';");
  source=once(source,'    const delay = Math.floor(min + Math.random() * (max - min));\n    st.proactiveTimer = setTimeout(() => {',"    const delay = proactiveDelay(whale.ledger,key,{min,max});\n    if(delay===null)return;\n    st.proactiveTimer = setTimeout(() => {");
  source=once(source,'      st.proactiveTimer = null;\n      ensureWakeableV2(st, { key });',"      st.proactiveTimer = null;\n      if(proactiveDelay(whale.ledger,key,{min,max,advance:true})===null)return;\n      ensureWakeableV2(st, { key });");
  const oldProactive=source.split('\n').find(l=>l.startsWith("    const proactiveLine = '【积极性】不要习惯性潜水："));
  if(!oldProactive)throw Error('Proactive wording drift');
  source=once(source,oldProactive,"    const proactiveLine = '【积极性】可以带着自己的新见闻、好奇或一个想法来找人聊，不必等对方出题。看到主人或熟人喜欢的东西，可以想想要不要分享；和当前关系、话题有关才接，不把主动聊天做成催回复、固定问候或资产播报。情绪和表情包沿用长期偏好。话题自然结束时可以安静收尾，下次再自然找来；没新东西也不凑话。\\n\\n';");
  // Keep the original quiet hours, cooldowns, probabilities and budgets.
  return source;
}
export function patchExpressionBili(source){
  source=once(source,"import { resolvePersonaFile } from './persona.js'","import { resolvePersonaFile } from './persona.js'\nimport {confirmedExpressionBlock,readConfiguredStyle} from '../../../whale-compat/expression-style.mjs'\nimport {qqPersona} from '../../../whale-compat/conversation-logic.mjs'");
  source=once(source,"  const safeCard = sanitizePersonaForBili(card)","  const safeCard = sanitizePersonaForBili(qqPersona(card))");
  source=once(source,"    '［统一人设卡 · QQ 和 B站是同一个人］',","    confirmedExpressionBlock(sanitizePersonaForBili(readConfiguredStyle(path.resolve(QQ_STATE_DIR,'..','config.json')))),\n    '［统一人设卡 · QQ 和 B站是同一个人］',");
  return source;
}
