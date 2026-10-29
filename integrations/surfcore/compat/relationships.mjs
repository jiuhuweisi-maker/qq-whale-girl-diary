import fs from 'node:fs';
import crypto from 'node:crypto';
import {conversation} from './memory-scope.mjs';
export const personAnchor=id=>'person-'+crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,12);
export function includesParticipantAccount(text,config,disk=fs) {
  let ids=[config.ownerQQ];
  try{if(config.whaleCompat?.relationshipFile)ids.push(...JSON.parse(disk.readFileSync(config.whaleCompat.relationshipFile,'utf8')).people.map(p=>p.userId));}catch{}
  return ids.map(String).filter(id=>/^\d{8,12}$/.test(id)).some(id=>new RegExp('(?<!\\d)'+id+'(?!\\d)').test(String(text)));
}
// Owner-confirmed facts are a separate, non-decaying store, never model impressions.
export function relationshipBlock(file,{key,ownerQQ,allowedGroups=[],messages=[],disk=fs}={}) {
  const target=conversation(key);
  if(!file||!target||(target.kind==='private'?target.id!==String(ownerQQ):!allowedGroups.map(String).includes(target.id)))return '';
  let data;try{if(disk.statSync(file).size>64000)return '';data=JSON.parse(disk.readFileSync(file,'utf8'));}catch{return '';}
  if(data.version!==1||!Array.isArray(data.people))return '';
  const visible=data.people.filter(p=>p.confirmed===true&&/^\d+$/.test(String(p.userId))&&Array.isArray(p.names)&&p.names.length&&p.source?.kind==='owner-confirmed'&&(target.kind==='private'||p.groups?.map(String).includes(target.id)));
  const recent=new Set(messages.filter(m=>!m.isSelf).map(m=>String(m.userId)));
  visible.sort((a,b)=>Number(recent.has(String(b.userId)))-Number(recent.has(String(a.userId))));
  if(!visible.length)return '';
  const rows=visible.slice(0,12).map(p=>`[${personAnchor(p.userId)}] ${p.names.slice(0,8).map(n=>String(n).replace(/[\r\n]/g,' ').slice(0,40)).join(' / ')}是同一人；${String(p.fact||'').replace(/[\r\n]/g,' ').slice(0,160)}`);
  return '【重要人物关系·主人确认】这些关系按账号保存，不因换会话、改名或记忆衰减而失效。person标记仅供内部对照，聊天只用昵称。昵称可能重名，不能仅凭名字把两个账号合并。未记住某次闲聊，不等于不认识这个人。\n'+rows.join('\n');
}
