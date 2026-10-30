const fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const {createRuntime,ID}=require('../simulator/lib/production-runtime.cjs');
const sourcePath=path.join(__dirname,'../bridge/host.js');
const headers={authorization:'Bearer '+'offline-test-'.repeat(5)};
test('all former broadcast requests remain ordinary private conversation',async()=>{
  const r=createRuntime({sourcePath});r.setConfig({聊天后端:'surfcore',接管起点:Math.floor(r.clock.now/1000)-1});
  let id=700;
  for(const text of ['去群里说 今晚八点','群里发 今晚八点','帮我发到群里：今晚八点','/群里发 先别发呆了','替我说 晚上好','等我点头以后，去群里说 今晚八点','通知群里 大家晚安']){
    const m=r.add({id:++id,sender:'A',time:r.clock.now,channel:'private',segments:[{type:'text',data:{text}}]});
    const result=await r.requestRoute('surfcore-control',{channel:'private',messageId:String(m.message_id)},headers);
    assert.equal(result.handled,false,text);
  }
  assert.equal(r.deliveries.filter(x=>x.action==='send_group_msg').length,0);
});
test('debug commands cannot resurrect forwarding and help does not advertise it',async()=>{
  const r=createRuntime({sourcePath});r.setConfig({聊天后端:'surfcore'});
  assert.equal((await r.requestRoute('master-cmd',{text:'去群里说 晚安'},headers)).ok,false);
  assert.equal(r.deliveries.length,0);
  const source=fs.readFileSync(sourcePath,'utf8');
  assert(!source.includes("操作票135('group-broadcast')"));
  assert(!source.includes('｜去群里说…'));
});
