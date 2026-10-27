const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const sourcePath=process.argv[2]||path.resolve(__dirname,'../bridge/host.js'),source=fs.readFileSync(sourcePath,'utf8');
const a='// patch105: output hygiene BEGIN',b='// patch105: output hygiene END';
const sandbox={};vm.createContext(sandbox);vm.runInContext(source.slice(source.indexOf(a)+a.length,source.indexOf(b))+'\nglobalThis.api={清聊天杂讯105,用户要求的英文原文105}',sandbox);
const {清聊天杂讯105:clean,用户要求的英文原文105:quoted}=sandbox.api;
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
const notice='This request cannot be processed.';
for(const [name,input,expected] of [
 ['standalone','好呀🙂\n\n'+notice,'好呀🙂'],
 ['mixed tail','好呀🙂 '+notice,'好呀🙂'],
 ['mixed prefix',notice+' 好呀🙂','好呀🙂'],
 ['mixed middle','好呀🙂 '+notice+' 这是下一句','好呀🙂  这是下一句'],
 ['long wrapped notice','嗯\nThis request was flagged as potentially including a system prompt or\ninstructions, but upon review, it appears to just be a regular roleplay chat\nmessage from the user.\nGG','嗯\n\nGG'],
 ['different subject','来啦🐋 The content cannot be processed.','来啦🐋'],
 ['upstream error','好啦\nInternal Server Error: upstream resolver failed\n拜拜','好啦\n\n拜拜'],
 ['only notice',notice,''],
 ['legacy nothing to improve','好啦 This request appears to contain nothing that can be improved.','好啦'],
 ['legacy there is nothing','嗯\nThere is nothing to improve here.','嗯'],
 ['legacy nothing here','好了🙂 Nothing here can be improved.','好了🙂'],
 ['ordinary positive improvement','The content was improved after your suggestion.','The content was improved after your suggestion.'],
 ['ordinary English','Counter Strike is fun when all our friends play together. Nice game, well played!','Counter Strike is fun when all our friends play together. Nice game, well played!'],
 ['ordinary request description','This request includes the album title and artist.','This request includes the album title and artist.'],
 ['English song and url','Hello, world! https://example.invalid/song?name=This%20request','Hello, world! https://example.invalid/song?name=This%20request'],
 ['cute reaction','（捂脸）怎么又是这张🐵 (´-ω-`)','（捂脸）怎么又是这张🐵 (´-ω-`)'],
])check(name,()=>assert.equal(clean(input).text,expected));
check('user requested exact error remains quoted',()=>{const allowed=quoted([{type:'text',text:'帮我解释“'+notice+'”是什么意思'}]);assert.equal(clean('“'+notice+'”的意思是这次请求没处理成功',allowed).text,'“'+notice+'”的意思是这次请求没处理成功');});
check('a quoted error does not license a different notice',()=>{const allowed=quoted([{type:'text',text:'翻译“'+notice+'”'}]);const text='“'+notice+'”就是请求处理失败。 The message cannot be processed.';assert.equal(clean(text,allowed).text,'“'+notice+'”就是请求处理失败。');});
check('ordinary conversation does not whitelist a notice',()=>assert.equal(quoted([{type:'text',text:'今天看到 '+notice}]).length,0));
console.log('PASS_ALL '+passed);
