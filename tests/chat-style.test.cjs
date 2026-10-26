const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../bridge/host.js'),'utf8');
const a='// patch101: style helper BEGIN',b='// patch101: style helper END';
assert(source.includes(a)&&source.includes(b));
const helper=source.slice(source.indexOf(a)+a.length,source.indexOf(b));
const fa='// patch102: file helpers BEGIN',fb='// patch102: file helpers END';
const files=source.slice(source.indexOf(fa)+fa.length,source.indexOf(fb));
const transfer=source.slice(source.indexOf('  async function 转入一条('),source.indexOf('  /** 只要文字的那条老入口'));
function runtime(){
  let style='平常接话，不用给每张表情包配台词。';let error=null;const calls=[],logs=[];
  const sandbox={Number,String,Array,Math,JSON,Buffer,Date,Map,URL,TextDecoder,AbortController,setTimeout,clearTimeout,readFileSync:()=>{if(error)throw error;return style;},记账:x=>logs.push(x),
    最后来路:'private',来路时刻:0,读配置:()=>({目标会话:'existing',总开关:true,收图:true,收图最多:4,图上限MB:5,称呼:'对方'}),找agent:()=>({}),救会话:async()=>{},短id:()=>'',
    取图字节:async()=>Buffer.from([0x89,0x50,0x4e,0x47]),看图类:()=> 'image/png',存一张:()=>'/tmp/mock.png',扩展:()=> 'png',记收图:()=>{},ctx:{},
    跟进并记路由:async(agent,content,route)=>calls.push({content,route})};
  vm.createContext(sandbox);vm.runInContext(files+'\n'+helper+'\n'+transfer+'\nglobalThis.api={读日常口吻101,带日常口吻101,转入一条};',sandbox);
  return {api:sandbox.api,sandbox,calls,logs,setStyle:x=>style=x,fail:x=>error=x};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
 await check('live preference reloads without a session replacement',()=>{const r=runtime();const one=r.api.带日常口吻101('原话','group');r.setStyle('新偏好');const two=r.api.带日常口吻101('原话','group');assert(one.includes('平常接话'));assert(two.includes('新偏好'));assert(!two.includes('平常接话'));});
 await check('missing style falls back without losing the user message or leaking exception',()=>{const r=runtime();r.fail(new Error('secret-value-not-for-log'));assert.equal(r.api.带日常口吻101('用户内容','group'),'用户内容');r.api.读日常口吻101();assert.equal(r.logs.length,1);assert(!r.logs.join('').includes('secret-value'));r.fail(null);assert(r.api.读日常口吻101());});
 await check('internal maintenance round does not acquire a chat performance task',()=>{const r=runtime();r.fail(new Error('must not read'));assert.equal(r.api.带日常口吻101('内部任务','none'),'内部任务');assert.equal(r.logs.length,0);});
 await check('empty style and overlong file are handled safely',()=>{const r=runtime();r.setStyle('   ');assert.equal(r.api.读日常口吻101(),'');r.setStyle('字'.repeat(1500));assert.equal(r.api.读日常口吻101().length,1200);});
 await check('actual text transfer preserves quote and route while adding preference',async()=>{const r=runtime();const question='（引用原话）这句什么意思？';const out=await r.api.转入一条(question,[],'msg-1','group',100,100);assert(out.ok);assert(r.calls[0].content[0].text.endsWith(question));assert.equal(r.calls[0].route.mid,'msg-1');assert.equal(r.calls[0].route.艾特,100);});
 await check('explicit picture request remains an image-bearing turn',async()=>{const r=runtime();r.sandbox.ctx.attachments={admitPromptContent:async x=>x};await r.api.转入一条('帮我看这张报错',[{data:{}}],'msg-2','private',0,100);assert(r.calls[0].content.some(x=>x.type==='image'));assert(r.calls[0].content[0].text.includes('帮我看这张报错'));});
 await check('image admission failure does not silently strip the active preference',async()=>{const r=runtime();r.sandbox.ctx.attachments={admitPromptContent:async()=>{throw Error('test');}};await r.api.转入一条('这张图',[{data:{}}],'msg-3','group',100,100);assert(r.calls[0].content[0].text.includes('平常接话'));assert(r.calls[0].content[0].text.includes('这张图'));});
 await check('preference does not manufacture a turn for empty input',async()=>{const r=runtime();const out=await r.api.转入一条('',[],'msg-4','group',100,100);assert.equal(out.ok,false);assert.equal(r.calls.length,0);});
 console.log('PASS_ALL '+passed);
})().catch(e=>{console.error(e);process.exitCode=1;});
