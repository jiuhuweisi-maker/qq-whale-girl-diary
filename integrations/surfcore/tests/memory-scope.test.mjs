import assert from 'node:assert/strict';
import { scopeMemoryCard, renderConversationMemory } from '../compat/memory-scope.mjs';
const options={ownerQQ:'1001',allowedGroups:['7001','7002']};
const rows=[
 {id:'public',text:'群里讨论杯子',private:false,conversationKey:'group:7001',groupId:'7001'},
 {id:'other-group',text:'另一个群的内容',private:false,conversationKey:'group:7002'},
 {id:'private',text:'主人私信秘密',private:true,conversationKey:'private:1001'},
 {id:'legacy-private',text:'旧混合档案',source:'legacy-mixed'},
 {id:'private-no-key',text:'没有会话编号的私信',private:true},
 {id:'other-person-private',text:'别人的私信',private:true,conversationKey:'private:1002'},
 {id:'pet',text:'桌面私事',platform:'pet'},
 {id:'shared',text:'可以公开的一般角色偏好',private:false,source:'manual'},
];
const card={records:rows,version:1};let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
const ids=(key)=>scopeMemoryCard(card,{...options,key}).records.map(r=>r.id);
check('group receives only its own public memories and explicitly public general notes',()=>assert.deepEqual(ids('group:7001'),['public','shared']));
check('second group cannot inherit first group memories',()=>assert.deepEqual(ids('group:7002'),['other-group','shared']));
check('owner private chat retains original private and public memories',()=>assert.deepEqual(ids('private:1001'),['public','other-group','private','legacy-private','private-no-key','pet','shared']));
for(const key of ['','private:1002','group:7003','group:07001','group:7001/../../private','group:7001\nprivate:1001','group:7001\n','private:','group:0'])check('invalid or unauthorized context is empty: '+JSON.stringify(key),()=>assert.deepEqual(ids(key),[]));
check('missing allowlist never grants group access',()=>assert.equal(scopeMemoryCard(card,{ownerQQ:'1001',key:'group:7001'}).records.length,0));
check('private flag wins over a public-looking conversation key',()=>assert.equal(scopeMemoryCard({records:[{private:true,conversationKey:'group:7001'}]},{...options,key:'group:7001'}).records.length,0));
check('private conversation key wins over a false private flag',()=>assert.equal(scopeMemoryCard({records:[{private:false,conversationKey:'private:1001'}]},{...options,key:'group:7001'}).records.length,0));
check('mismatched explicit group identity remains excluded',()=>assert.equal(scopeMemoryCard({records:[{conversationKey:'group:7001',groupId:'7002'}]},{...options,key:'group:7001'}).records.length,0));
check('original card is not modified or emptied during scoped rendering',()=>{const before=JSON.stringify(card);scopeMemoryCard(card,{...options,key:'group:7001'});assert.equal(JSON.stringify(card),before);});
check('the real renderer receives an already scoped card',()=>{let seen;const text=renderConversationMemory(card,{...options,key:'group:7001',render:(c,o)=>{seen=c;assert.equal(o.platform,'qq');return c.records.map(r=>r.text).join('|');}});assert.deepEqual(seen.records.map(r=>r.id),['public','shared']);assert(!text.includes('秘密'));});
check('empty private scope never calls a renderer with an unfiltered fallback',()=>assert.equal(renderConversationMemory(card,{...options,key:'private:9999',render:()=>{throw Error('must not render');}}),''));
check('non-object records cannot escape the filter',()=>assert.equal(scopeMemoryCard({records:[null,false,'secret']},{...options,key:'group:7001'}).records.length,0));
check('malformed private source stays private',()=>assert.equal(scopeMemoryCard({records:[{private:false,conversationKey:'private:unknown'}]},{...options,key:'group:7001'}).records.length,0));
console.log('PASS_ALL '+passed);
