import{createRequire}from'node:module';import{createHash}from'node:crypto';import{Worker}from'node:worker_threads';
const failure=()=>Error('这次未能及时生成可读图片预览，原图仍保留；尚未看到图，不能判断内容或归因于用户的格式。');
function resolveSharp(options) {
 for(const base of [options.nativeDependencies,process.env.WHALE_NATIVE_IMAGE_DEPENDENCIES,new URL('../whale-native-images/package.json',import.meta.url),new URL('../live-mirror/whale-native-images/package.json',import.meta.url),options.dependencies,import.meta.url]){
  if(!base)continue;try{return createRequire(base).resolve('sharp');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
 }
 throw Error('图片预览运行依赖未就绪，原图保留，尚未看到图。');
}
// Content-only, bounded, process-local cache. Authorization stays at each caller.
export function createImagePreviewer({now=Date.now,maxEntries=64,maxBytes=3*1024*1024,ttlMs=1800000,workerFactory=opts=>new Worker(new URL('./image-worker.mjs',import.meta.url),opts)}={}) {
 const cache=new Map(),pending=new Map(),queue=[];let bytesCached=0,active=0,queuedBytes=0;
 const evict=()=>{for(const[k,r]of cache)if(now()-r.at>ttlMs){cache.delete(k);bytesCached-=r.size;}while(cache.size>maxEntries||bytesCached>maxBytes){const[k,r]=cache.entries().next().value;cache.delete(k);bytesCached-=r.size;}};
 function pump(){while(active<1&&queue.length){const job=queue.shift();queuedBytes-=job.bytes.length;if(job.done)continue;active++;job.started=now();job.active=true;
  try{job.worker=workerFactory({workerData:{sharpPath:job.sharpPath,bytes:job.bytes,chat:job.chat},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});job.bytes=null;
   job.worker.once('message',r=>job.finish(r.ok?null:failure(),r.result));job.worker.once('error',()=>job.finish(failure()));job.worker.once('exit',()=>{if(!job.done)job.finish(failure())});
  }catch{job.finish(failure());}
 }}
 async function render(bytes,options={}) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024)throw failure();
  if(options.signal?.aborted)throw failure();
  const sharpPath=resolveSharp(options),chat=options.chat===true,key=createHash('sha256').update(bytes).update(chat?'chat207':'detail207').update(sharpPath).digest('hex'),start=now();evict();
  if(cache.has(key)){const row=cache.get(key);cache.delete(key);cache.set(key,row);options.trace?.({cacheHit:true,coalesced:false,queueMs:0,convertMs:0,totalMs:now()-start,inputBytes:bytes.length,outputBytes:row.result.data?Buffer.byteLength(row.result.data,'base64'):bytes.length});return row.result;}
  let job=pending.get(key);const coalesced=!!job;
  if(!job){if(pending.size>=4||queuedBytes+bytes.length>32*1024*1024)throw failure();
   let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});job={key,bytes,sharpPath,chat,promise,refs:0,done:false,created:now()};
   job.finish=(error,result)=>{if(job.done)return;job.done=true;clearTimeout(job.timer);pending.delete(key);
    const at=queue.indexOf(job);if(at>=0){queue.splice(at,1);queuedBytes-=job.bytes.length;}
    const release=()=>{if(job.active){active--;job.active=false;}pump();};job.bytes=null;
    if(job.worker)void job.worker.terminate().then(release,release);else release();
    if(error)reject(error);else{const size=result.data?Buffer.byteLength(result.data,'base64'):64;cache.set(key,{result,size,at:now()});bytesCached+=size;evict();resolve(result);}};
   job.timer=setTimeout(()=>job.finish(failure()),Math.max(1,Math.min(6000,options.timeoutMs||6000)));
   pending.set(key,job);queue.push(job);queuedBytes+=bytes.length;pump();
  }
  job.refs++;
  try{
   const result=await new Promise((resolve,reject)=>{const abort=()=>reject(failure());options.signal?.addEventListener('abort',abort,{once:true});job.promise.then(v=>{options.signal?.removeEventListener('abort',abort);resolve(v)},e=>{options.signal?.removeEventListener('abort',abort);reject(e)});if(options.signal?.aborted)abort();});
   options.trace?.({cacheHit:false,coalesced,queueMs:Math.max(0,(job.started||now())-job.created),convertMs:Math.max(0,now()-(job.started||now())),totalMs:now()-start,inputBytes:bytes.length,outputBytes:result.data?Buffer.byteLength(result.data,'base64'):bytes.length});return result;
  }finally{job.refs--;if(!job.refs&&!job.done)job.finish(failure());}
 }
 return {render,status:()=>({cached:cache.size,bytesCached,pending:pending.size,active})};
}
const previews=createImagePreviewer();
export async function modelImage(image,options={}) {
 const bytes=Buffer.from(image.data,'base64'),result=await previews.render(bytes,options);
 return result.passThrough?image:{...image,...result};
}
export async function chatImagePreview(bytes,options={}) {
 const result=await previews.render(bytes,{...options,chat:true});return result.passThrough?null:result;
}
