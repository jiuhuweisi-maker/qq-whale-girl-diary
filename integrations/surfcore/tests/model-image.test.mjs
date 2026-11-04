import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';import{modelImage,chatImagePreview}from'../compat/model-image.mjs';
const dependencies=process.env.WHALE_IMAGE_DEPENDENCIES,require=createRequire(dependencies||import.meta.url);
test('small valid image is passed through without adding another recognition request',async()=>{const image={data:Buffer.from([255,216,255,217]).toString('base64'),mimeType:'image/jpeg'};assert.equal(await modelImage(image),image);});
test('large PNG produces a bounded JPEG preview and leaves original bytes intact',async()=>{
 const {PNG}=require('pngjs'),png=new PNG({width:400,height:300});let n=71;for(let i=0;i<png.data.length;i++){n^=n<<13;n^=n>>>17;n^=n<<5;png.data[i]=i%4===3?255:n>>>24;}
 const original=PNG.sync.write(png),before=Buffer.from(original),result=await modelImage({data:original.toString('base64'),mimeType:'image/png'},{dependencies});
 assert(result.preview);assert.equal(result.mimeType,'image/jpeg');const bytes=Buffer.from(result.data,'base64');assert(bytes.length<=32768);assert.equal(bytes[0],255);assert.deepEqual(original,before);
});
test('an unreadable payload fails explicitly instead of claiming a vision result',async()=>{await assert.rejects(modelImage({data:Buffer.alloc(40000,1).toString('base64'),mimeType:'image/png'},{dependencies}),/尚未看到图/);});
test('chat preview caps dimensions even for a highly compressed large image',async()=>{
 const {PNG}=require('pngjs'),png=new PNG({width:900,height:600});
 png.data.fill(255);
 const bytes=PNG.sync.write(png),original={mimeType:'image/png',data:bytes.toString('base64')};
 assert(bytes.length<12288);
 const preview=chatImagePreview(bytes,{dependencies});
 const actual=require('jpeg-js').decode(Buffer.from(preview.data,'base64'));
 assert.deepEqual([actual.width,actual.height],[384,256]);
 assert(Buffer.from(preview.data,'base64').length<=12288);
 assert.equal(await modelImage(original,{dependencies}),original);
});
test('an already small chat image can stay in its original form',()=>{
 const {PNG}=require('pngjs'),png=new PNG({width:24,height:24});
 assert.equal(chatImagePreview(PNG.sync.write(png),{dependencies}),null);
});
