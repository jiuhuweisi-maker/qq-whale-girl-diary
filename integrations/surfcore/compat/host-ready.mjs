import net from 'node:net';

function probePort(port, host, timeout) {
  return new Promise(resolve => {
    const socket = net.connect({port, host});
    let finished=false;
    const finish=ready=>{if(finished)return;finished=true;socket.destroy();resolve(ready);};
    socket.setTimeout(timeout);
    socket.once('connect',()=>finish(true));
    socket.once('error',()=>finish(false));
    socket.once('timeout',()=>finish(false));
  });
}

// Wait outside plugin activation so the host can finish binding its HTTP server.
export async function waitForDshBind(url, {probe=probePort, now=Date.now,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)), timeoutMs=120000}={}) {
  let parsed;
  try { parsed=new URL(String(url)); } catch { return {ready:false,reason:'missing-host-url'}; }
  const host=parsed.hostname.replace(/^\[|\]$/g,'');
  if (parsed.username||parsed.password||!['http:','https:'].includes(parsed.protocol)||!['127.0.0.1','localhost','::1'].includes(host)) return {ready:false,reason:'non-loopback-host'};
  const port=Number(parsed.port|| (parsed.protocol==='https:'?443:80));
  const deadline=now()+Math.min(120000,Math.max(1,Number(timeoutMs)||120000));
  let attempts=0;
  while(now()<deadline) {
    attempts++;
    if(await probe(port,host,Math.min(500,Math.max(1,deadline-now()))))return{ready:true,attempts};
    const remaining=deadline-now();if(remaining>0)await sleep(Math.min(500,remaining));
  }
  return {ready:false,reason:'host-not-bound',attempts};
}
