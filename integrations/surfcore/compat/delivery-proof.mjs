import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A nearby message is not proof of this send. Require one exact content hash,
// the correct sender and conversation, a bounded time, and a usable receipt.
export function exactDeliveryProof({key,at,hash,selfId,messages}={}) {
  if(!/^(?:group|private):\d+$/.test(String(key))||!Number.isFinite(at)||!/^[a-f0-9]{64}$/.test(String(hash))||!selfId)return null;
  const [kind,target]=key.split(':'),matches=new Map();
  for(const row of Array.isArray(messages)?messages:[]){
    if(!row||String(row.sender?.user_id??row.user_id??'')!==String(selfId)||!Array.isArray(row.message))continue;
    const t=Number(row.time)*1000,id=row.message_id;
    if(!Number.isFinite(t)||Math.abs(t-at)>90000||id==null||!String(id).trim()||String(id)==='0')continue;
    if(row.message_type&&row.message_type!==kind)continue;
    if(kind==='group'&&row.group_id!=null&&String(row.group_id)!==target)continue;
    if(kind==='private'&&(row.group_id!=null||(row.peer_id!=null&&String(row.peer_id)!==target)||(row.target_id!=null&&String(row.target_id)!==target)))continue;
    const canonical=row.message.map(s=>({type:s.type,data:s.type==='text'?{text:String(s.data?.text??'')}:s.type==='at'?{qq:String(s.data?.qq??'')}:s.type==='reply'?{id:String(s.data?.id??'')}:s.data}));
    if(![row.message,canonical].some(message=>digest([key,message])===hash))continue;
    matches.set(String(id),{hash,messageId:String(id),confirmed:true});
  }
  return matches.size===1?[...matches.values()][0]:null;
}
