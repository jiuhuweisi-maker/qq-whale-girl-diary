// Observe image result serialization/pipe drain. Never log content or RPC IDs.
export function instrumentImageTransport(transport,{log=()=>{},now=Date.now}={}) {
 const send=transport.send;let sequence=0;
 transport.send=async function(message,...args){
  const images=message?.result?.content?.filter?.(p=>p?.type==='image')||[];
  if(!images.length)return send.call(this,message,...args);
  const trace=++sequence,started=now(),bytes=images.reduce((n,i)=>n+Buffer.byteLength(i.data||'','base64'),0);
  log({stage:'start',trace,at:started,count:images.length,bytes});
  try{const result=await send.call(this,message,...args);log({stage:'flushed',trace,at:now(),elapsedMs:now()-started,count:images.length,bytes});return result;}
  catch(error){log({stage:'failed',trace,at:now(),elapsedMs:now()-started});throw error;}
 };return transport;
}
