const fs=require('fs'),vm=require('vm'),test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../bridge/host.js'),'utf8');
const block=source.split('// patch135: broadcast intent BEGIN')[1].split('// patch135: broadcast intent END')[0];
const parse=vm.runInNewContext(block+';解析群代发135');
test('planning, approval requests and quotations never execute broadcasts',()=>{
  for(const text of ['等我点头以后，去群里说 今晚八点','先拟个文案，群里发 今晚八点','去群里说 今晚八点，先别发','群里发 今晚八点可以吗？','「去群里说 今晚八点」','我刚才让你去群里说什么来着','群里发什么好？'])assert.equal(parse(text),null,text);
});
test('clear direct commands keep the original content',()=>{
  for(const text of ['去群里说 今晚八点','帮我发到群里：今晚八点','群里发 今晚八点']){const result=parse(text);assert.equal(result.cmd,'群里说');assert.equal(result.arg,'今晚八点');}
  assert.equal(parse('/群里发 先别发呆了').arg,'先别发呆了');
});
