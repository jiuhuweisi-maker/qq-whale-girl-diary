import test from'node:test';import assert from'node:assert/strict';import{summarizeSession,summarizeLedger}from'../analyze-session-timing.mjs';
const e=(type,time,data={})=>({type,time,data});
test('provider delay, first send and post-send waiting are reported separately',()=>{
 const [r]=summarizeSession([e('turn/start',0),e('step/start',10,{step:1}),e('llm/retry',20,{failure:{status:503}}),e('assistant/message',100,{step:1}),e('tool/call',110,{callId:'a',name:'mcp__qq_send_message'}),e('tool/result',120,{message:{toolCallId:'a'}}),e('tool/call',130,{callId:'b',name:'qq_wait_for_messages'}),e('tool/result',430,{message:{toolCallId:'b'}}),e('turn/end',450)]);
 assert.equal(r.firstSendAttemptMs,110);assert.equal(r.waitingToolMs,300);assert.equal(r.modelIncludingRetriesMs,90);assert.equal(r.providerErrors['503'],1);assert.equal(r.totalMs,450);
});
test('unfinished work is not counted as successful delivery or completed turn',()=>{
 const[r]=summarizeSession([e('turn/start',0),e('step/start',1,{step:1}),e('tool/call',2,{callId:'a',name:'qq_send_message'})]);assert.equal(r.complete,false);assert.equal(r.totalMs,null);assert.equal(r.otherToolsMs,0);assert.equal(r.firstSendAttemptMs,2);
});
test('usage is reported as raw finite numeric counters, never inferred billing',()=>{
 const[r]=summarizeSession([e('turn/start',0),e('assistant/message',1,{usage:{inputTokens:100,outputTokens:5,cacheReadTokens:90,totalTokens:105}}),e('assistant/message',2,{usage:{inputTokens:20,outputTokens:3,cacheWriteTokens:8,totalTokens:23}}),e('assistant/message',3,{usage:{inputTokens:'999',outputTokens:NaN,totalTokens:Infinity}}),e('turn/end',4)]);
 assert.deepEqual(r.usageCounters,{inputTokens:120,outputTokens:8,cacheReadTokens:90,cacheWriteTokens:8,totalTokens:128});assert.equal(r.usageSamples,2);assert(!('cost'in r));
});
test('image time and post-send waits stay separate from time before first send',()=>{
 const[r]=summarizeSession([e('turn/start',0),e('tool/call',2,{callId:'i',name:'qq_get_message_images'}),e('tool/result',42,{callId:'i'}),e('tool/call',50,{callId:'s',name:'qq_send_private_message'}),e('tool/result',60,{callId:'s'}),e('tool/call',70,{callId:'w',name:'qq_wait_for_messages'}),e('tool/result',370,{callId:'w'}),e('turn/end',400)]);
 assert.equal(r.imageToolsMs,40);assert.equal(r.otherToolsMs,10);assert.equal(r.beforeFirstSend.imageMs,40);assert.equal(r.beforeFirstSend.waitingMs,0);assert.equal(r.waitingToolMs,300);
});
test('stream snapshots replace the same attempt; reconnect replay does not double count; retries remain separate',()=>{
 const events=[e('turn/start',0),e('step/start',1,{step:1}),e('assistant/attempt',2,{step:1,stream:[{usage:{inputTokens:10}}]}),e('assistant/message',3,{step:1,usage:{inputTokens:20}}),e('llm/retry-started',4,{step:1,retry:1}),e('assistant/message',5,{step:1,usage:{inputTokens:5}}),e('turn/end',6)].map((r,i)=>({...r,seq:i}));
 const[r]=summarizeSession([...events,events[3]]);assert.equal(r.usageCounters.inputTokens,25);assert.equal(r.usageSamples,2);
});
test('ledger costs use deduplicated production buckets, never equate cache misses with new text',()=>{
 const row={k:'turn',sid:'private-secret',key:'private:1001',turn:1,step:1,retry:0,t:100,seq:1,b:{cacheMiss:2,cacheHit:10,output:1}},price=b=>({rates:{currency:'CNY'},cost:{cacheHit:b.cacheHit,cacheMiss:b.cacheMiss,cacheWrite:0,output:b.output,total:b.cacheHit+b.cacheMiss+b.output}});
 const r=summarizeLedger([row,{...row,seq:2,b:{cacheMiss:3,cacheHit:10,output:1}},row],{price});
 assert.equal(r.groups.private.steps,1);assert.equal(r.groups.private.estimatedCost.total,14);assert.equal(r.historyVsNewText,null);assert(!JSON.stringify(r).includes('private-secret'));assert.equal(summarizeLedger([row]).groups.private.estimatedCost,null);
});
