import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';import{Worker}from'node:worker_threads';import{modelImage,chatImagePreview,createImagePreviewer}from'../compat/model-image.mjs';
const base=process.env.WHALE_NATIVE_IMAGE_DEPENDENCIES||new URL('../live-mirror/whale-native-images/package.json',import.meta.url),require=createRequire(base),sharp=require('sharp'),options={nativeDependencies:base};
const solid=(width,height)=>sharp({create:{width,height,channels:4,background:'#ffffff'}}).png().toBuffer();
test('small valid image is passed through without adding another recognition request',async()=>{const bytes=await solid(24,24),image={data:bytes.toString('base64'),mimeType:'image/png'};assert.equal(await modelImage(image,options),image);});
test('large PNG produces a bounded JPEG preview and leaves original bytes intact',async()=>{
 const raw=Buffer.alloc(400*300*4);let n=71;for(let i=0;i<raw.length;i++){n^=n<<13;n^=n>>>17;n^=n<<5;raw[i]=i%4===3?255:n>>>24;}
 const original=await sharp(raw,{raw:{width:400,height:300,channels:4}}).png().toBuffer(),before=Buffer.from(original),result=await modelImage({data:original.toString('base64'),mimeType:'image/png'},options);
 assert(result.preview);assert.equal(result.mimeType,'image/jpeg');const bytes=Buffer.from(result.data,'base64');assert(bytes.length<=32768);assert.equal(bytes[0],255);assert.deepEqual(original,before);
});
test('an unreadable payload fails explicitly instead of claiming a vision result',async()=>{await assert.rejects(modelImage({data:Buffer.alloc(40000,1).toString('base64'),mimeType:'image/png'},options),/尚未看到图/);});
test('chat preview caps dimensions even for a highly compressed large image',async()=>{
 const bytes=await solid(900,600),original={mimeType:'image/png',data:bytes.toString('base64')};
 assert(bytes.length<12288);
 const preview=await chatImagePreview(bytes,options);
 const actual=await sharp(Buffer.from(preview.data,'base64')).metadata();
 assert.deepEqual([actual.width,actual.height],[384,256]);
 assert(Buffer.from(preview.data,'base64').length<=12288);
 assert.equal(await modelImage(original,options),original);
});
test('an already small chat image can stay in its original form',async()=>{
 assert.equal(await chatImagePreview(await solid(24,24),options),null);
});
test('same content coalesces work and uses bounded cache without reusing caller metadata',async()=>{
 let count=0;const p=createImagePreviewer({workerFactory:opts=>{count++;return new Worker(new URL('../compat/image-worker.mjs',import.meta.url),opts)}}),bytes=await solid(800,600),metrics=[];
 await Promise.all([p.render(bytes,{...options,chat:true}),p.render(bytes,{...options,chat:true})]);assert.equal(count,1);
 await p.render(bytes,{...options,chat:true,trace:m=>metrics.push(m)});assert(metrics[0].cacheHit);assert.equal(count,1);
 const input={data:bytes.toString('base64'),mimeType:'image/png',index:8};assert.equal((await modelImage(input,{...options,chat:true})).index,8);
 await p.render(bytes,{...options,chat:false});assert.equal(count,2);
});
test('timeout terminates work, never caches failures and allows a later real retry',async()=>{
 const p=createImagePreviewer(),bytes=await solid(2000,1400);await assert.rejects(p.render(bytes,{...options,chat:true,timeoutMs:1}),/尚未看到图/);assert.equal(p.status().cached,0);const r=await p.render(bytes,{...options,chat:true});assert(r.preview);assert.equal(p.status().pending,0);
});
test('cancelling one coalesced reader does not cancel another reader',async()=>{
 const p=createImagePreviewer(),bytes=await solid(1500,1000),controller=new AbortController(),a=p.render(bytes,{...options,chat:true,signal:controller.signal}),b=p.render(bytes,{...options,chat:true});controller.abort();await assert.rejects(a);assert((await b).preview);
});
test('oversize and non-raster payloads fail safely; invalid content never enters cache',async()=>{
 const p=createImagePreviewer();await assert.rejects(p.render(Buffer.alloc(21*1024*1024),options));await assert.rejects(p.render(Buffer.from('<svg width="40" height="40"></svg>'),options));assert.equal(p.status().cached,0);
 const bomb=await solid(4000,4000);await assert.rejects(p.render(bomb,options));
});
test('LRU size and TTL bounds drop old previews without retaining original image bytes',async()=>{
 let offset=0;const p=createImagePreviewer({maxEntries:1,ttlMs:1000,now:()=>Date.now()+offset}),a=await solid(400,300),b=await solid(450,300);await p.render(a,{...options,chat:true});await p.render(b,{...options,chat:true});assert.equal(p.status().cached,1);offset+=5000;let metric;await p.render(a,{...options,chat:true,trace:m=>metric=m});assert.equal(metric.cacheHit,false);assert(p.status().bytesCached<12288);
});
