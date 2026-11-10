import fs from 'node:fs';
import crypto from 'node:crypto';
import {conversation} from './memory-scope.mjs';
export const personAnchor=id=>'person-'+crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,12);
export function inspectRelationships(file,{disk=fs}={}) {
  if(!file)return {status:'unconfigured',people:[]};
  try{
    if(disk.statSync(file).size>64000)return {status:'oversize',people:[]};
    const data=JSON.parse(disk.readFileSync(file,'utf8'));
    if(data.version!==1||!Array.isArray(data.people))return {status:'invalid',people:[]};
    return {status:'loaded',people:data.people.filter(p=>p.confirmed===true&&/^\d+$/.test(String(p.userId))&&Array.isArray(p.names)&&p.names.length&&p.source?.kind==='owner-confirmed')};
  }catch(error){return {status:error.code==='ENOENT'?'missing':'error',people:[]};}
}
export function includesParticipantAccount(text,config,disk=fs) {
  let ids=[config.ownerQQ];
  try{if(config.whaleCompat?.relationshipFile)ids.push(...JSON.parse(disk.readFileSync(config.whaleCompat.relationshipFile,'utf8')).people.map(p=>p.userId));}catch{}
  return ids.map(String).filter(id=>/^\d{8,12}$/.test(id)).some(id=>new RegExp('(?<!\\d)'+id+'(?!\\d)').test(String(text)));
}
// Owner-confirmed facts are a separate, non-decaying store, never model impressions.
export function relationshipBlock(file,{key,ownerQQ,allowedGroups=[],messages=[],disk=fs,platform,internal=false,query=''}={}) {
  const target=conversation(key);
  const internalBili=platform==='bili'&&internal===true;
  if(!file||(!internalBili&&(!target||(target.kind==='private'?target.id!==String(ownerQQ):!allowedGroups.map(String).includes(target.id)))))return '';
  const needle=String(query).trim().toLowerCase();
  const visible=inspectRelationships(file,{disk}).people.filter(p=>(internalBili||target.kind==='private'||p.groups?.map(String).includes(target.id))&&(!needle||[personAnchor(p.userId),...p.names,p.fact||''].some(s=>String(s).toLowerCase().includes(needle))));
  const priority=new Map(),recent=messages.slice(-16),byMessage=new Map(messages.map(m=>[String(m.messageId),m]));
  const mark=(id,n)=>{if(/^\d+$/.test(String(id)))priority.set(String(id),Math.max(priority.get(String(id))||0,n));};
  recent.forEach((m,i)=>{if(m.isSelf)return;const rank=(i+1)*10;mark(m.userId,rank+3);for(const mention of m.mentions||[])mark(mention.userId,rank+2);const quoted=byMessage.get(String(m.replyToMessageId??''));if(quoted&&!quoted.isSelf)mark(quoted.userId,rank+1);});
  visible.sort((a,b)=>(priority.get(String(b.userId))||0)-(priority.get(String(a.userId))||0));
  if(!visible.length)return '';
  const rows=visible.slice(0,12).map(p=>`[${personAnchor(p.userId)}] ${p.names.slice(0,8).map(n=>String(n).replace(/[\r\n]/g,' ').slice(0,40)).join(' / ')}是同一人；${String(p.fact||'').replace(/[\r\n]/g,' ').slice(0,160)}`);
  const scope=internalBili?'【内部回想·非公开素材】下面是QQ里的已确认人物关系，按场合和隐私判断公开说什么；不得整表转述。B站当前说话者的身份只按已确认的跨平台对齐表识别，不凭同名认作这些QQ群友。\n':'';
  const more=visible.length>12?`\n还有${visible.length-12}条确认关系未在本轮展开，需要时按昵称或person标记检索确认关系；未展开不等于不认识。`:'';
  return scope+'【重要人物关系·主人确认】这些关系按账号保存，不因换会话、改名或记忆衰减而失效。person标记仅供内部对照，聊天只用昵称。昵称可能重名，不能仅凭名字把两个账号合并。未记住某次闲聊，不等于不认识这个人。\n'+rows.join('\n')+more;
}
// Called only by the local, trusted Bili scheduler, never a public lookup route.
export function configuredBiliRelationships(configFile,{disk=fs,query=''}={}) {
  const cfg=JSON.parse(disk.readFileSync(configFile,'utf8'));
  return relationshipBlock(cfg.whaleCompat?.relationshipFile,{platform:'bili',internal:true,disk,query});
}
