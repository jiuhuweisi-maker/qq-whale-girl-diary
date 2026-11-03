import test from'node:test';import assert from'node:assert/strict';import{summarizeSession}from'../analyze-session-timing.mjs';
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
 assert.deepEqual(r.usageCounters,{inputTokens:120,outputTokens:8,cacheReadTokens:90,cacheWriteTokens:8,totalTokens:128});assert.equal(r.usageSamples,3);assert(!('cost'in r));
});
