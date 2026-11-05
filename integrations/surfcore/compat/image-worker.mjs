import{parentPort,workerData}from'node:worker_threads';import{createRequire}from'node:module';
// Binary buffers only. No URLs, filesystem inputs, network or model access.
try{
 const signature=Buffer.from(workerData.bytes);
 if(!(signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||signature[0]===255&&signature[1]===216||signature.subarray(0,3).toString()==='GIF'||signature.subarray(0,4).toString()==='RIFF'&&signature.subarray(8,12).toString()==='WEBP'))throw Error('format');
 const sharp=createRequire(import.meta.url)(workerData.sharpPath);sharp.concurrency(1);sharp.cache({memory:16,items:32,files:0});
 const bytes=Buffer.from(workerData.bytes),chat=workerData.chat===true,limit=chat?12288:32768,edge=chat?384:1400;
 const input=sharp(bytes,{failOn:'warning',limitInputPixels:12000000,pages:1,animated:false}),meta=await input.metadata();
 if(!['jpeg','png','gif','webp'].includes(meta.format))throw Error('format');
 if(meta.width*meta.height>12000000)throw Error('pixels');
 const firstFrame=meta.format==='gif'||Number(meta.pages)>1;
 if(!firstFrame&&(!meta.orientation||meta.orientation===1)&&bytes.length<=limit&&(!chat||Math.max(meta.width,meta.height)<=edge)){
  parentPort.postMessage({ok:true,result:{passThrough:true,width:meta.width,height:meta.height}});
 }else{
  let size=Math.min(edge,Math.max(meta.width,meta.height)),result;
  for(let attempt=0;attempt<4;attempt++){
   const image=await input.clone().autoOrient().resize(size,size,{fit:'inside',withoutEnlargement:true,fastShrinkOnLoad:true}).flatten({background:'#ffffff'}).jpeg({quality:chat?54:65,chromaSubsampling:'4:2:0'}).timeout({seconds:3}).toBuffer({resolveWithObject:true});
   if(image.data.length<=limit){result={mimeType:'image/jpeg',data:image.data.toString('base64'),preview:true,width:image.info.width,height:image.info.height,firstFrame};break;}
   size=Math.max(chat?96:160,Math.floor(size*Math.min(.8,Math.sqrt(limit/image.data.length)*.9)));
  }
  if(!result)throw Error('output-limit');parentPort.postMessage({ok:true,result});
 }
}catch(error){parentPort.postMessage({ok:false,code:/pixel|limitInput/i.test(error?.message||'')?'pixel-limit':'preview-failed'});}
