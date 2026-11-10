import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beginComment,finishComment,observeCommentRows,operationSnapshot} from '../compat/bili-operations.mjs';
import {verifyComment} from '../compat/bili-verification.mjs';
const at=Date.parse('2026-11-06T02:00:00Z');
const request={account:'123',oid:'456',message:'这是一条实际评论',now:at};
const row={rpid_str:'789',mid:'123',root:0,parent:0,ctime:at/1000,content:{message:request.message}};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-operation-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'operations.json');}
test('pre-POST reservation survives a crash and cannot be reposted by another process',t=>{
 const f=fixture(t),lease=beginComment(f,request);assert.equal(operationSnapshot(f).counts.sending,1);
 assert.throws(()=>beginComment(f,request),/DUPLICATE/);finishComment(f,lease,{error:true,now:at});assert.equal(operationSnapshot(f).counts.uncertain,1);
 assert.throws(()=>beginComment(f,{...request,now:at+7200000}),/DUPLICATE/);
});
test('API acceptance is separate from exact authenticated and anonymous readback',t=>{
 const f=fixture(t),lease=beginComment(f,request);finishComment(f,lease,{code:0,http:200,rpid:'789',now:at});assert.equal(operationSnapshot(f).counts.accepted,1);assert.equal(operationSnapshot(f).recent[0].visibility,'unknown');
 for(const r of [{...row,mid:'999'},{...row,content:{message:'别人的文本'}},{...row,parent:2},{...row,rpid_str:'788'}])assert.equal(observeCommentRows(f,{oid:'456',rows:[r]}).verified,0);
 assert.equal(observeCommentRows(f,{oid:'456',rows:[row],anonymous:false}).verified,1);assert.equal(operationSnapshot(f).recent[0].visibility,'unknown');
 observeCommentRows(f,{oid:'456',rows:[row]});assert.equal(operationSnapshot(f).recent[0].visibility,'anonymous_seen');
});
test('uncertain send without receipt requires unique exact author, time, nesting and text',t=>{
 const f=fixture(t);beginComment(f,request);assert.equal(observeCommentRows(f,{oid:'456',rows:[row,{...row,rpid_str:'790'}]}).verified,0);
 assert.equal(observeCommentRows(f,{oid:'456',rows:[{...row,ctime:at/1000+1000}]}).verified,0);
 assert.equal(observeCommentRows(f,{oid:'456',rows:[row]}).verified,1);
});
test('risk and transport errors cool down other writes; corrupt state is never replaced',t=>{
 const f=fixture(t),lease=beginComment(f,request);finishComment(f,lease,{code:-509,http:200,now:at});assert.equal(operationSnapshot(f).lastFailure.category,'risk');assert.throws(()=>beginComment(f,{...request,message:'另一个评论',now:at+1}),/COOLDOWN/);
 fs.writeFileSync(f,'broken');assert.throws(()=>beginComment(f,request));assert.equal(fs.readFileSync(f,'utf8'),'broken');
});
test('readback is GET-only, exact matches update the same durable receipt, no match stays unknown',async t=>{
 const f=fixture(t),lease=beginComment(f,request);finishComment(f,lease,{code:0,http:200,rpid:'789',now:at});
 let n=0;const fetchImpl=async(url,opts)=>{n++;assert(!opts.method||opts.method==='GET');assert(!opts.headers.cookie);return new Response(JSON.stringify({code:0,data:{replies:[row]}}));};
 const r=await verifyComment({file:f,oid:'456',rpid:'789',fetchImpl});assert(r.publicSeen);assert(r.ledgerVerified);assert.equal(n,1);
 const unknown=await verifyComment({file:f,oid:'456',rpid:'790',fetchImpl:async()=>new Response(JSON.stringify({code:0,data:{replies:[]}}))});assert.equal(unknown.visibility,'unknown');assert.equal(unknown.resendAllowed,false);
});
test('thread replies use their real root and authenticated-only visibility remains uncertain',async t=>{
 const f=fixture(t),lease=beginComment(f,{...request,root:'600',parent:'601'});finishComment(f,lease,{code:0,http:200,rpid:'789',now:at});
 const r=await verifyComment({file:f,oid:'456',rpid:'789',root:'600',cookie:'fixture',fetchImpl:async(url,opts)=>{
  assert(url.includes('root=600'));return new Response(JSON.stringify({code:0,data:{replies:opts.headers.cookie?[{...row,root:600,parent:601}]:[]}}));}});
 assert.equal(r.visibility,'account_seen_public_unknown');assert.equal(operationSnapshot(f).counts.verified,1);assert.equal(operationSnapshot(f).recent[0].visibility,'unknown');
});
test('412 ends readback without retry, authentication fallback or write',async t=>{
 const f=fixture(t);let n=0;const r=await verifyComment({file:f,oid:'456',rpid:'789',cookie:'fixture',fetchImpl:async()=>{n++;return new Response('{}',{status:412});}});assert.equal(n,1);assert(r.blocked);assert.equal(r.visibility,'unknown');
});
