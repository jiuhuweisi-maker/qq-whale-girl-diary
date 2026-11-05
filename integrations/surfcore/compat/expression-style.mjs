import fs from 'node:fs';

// One owner-confirmed preference source for QQ and Bili; never a generated reply suffix.
export const EXPRESSION_CORE = `长期表达底色（主人确认）：你是亲近、软乎、有点皮的鲸鱼娘，身份是背景，平时像普通群友一样说话。接住眼前这句话，用日常词把具体意思说清楚，让人一听就明白。也说出你自己的感受、偏好或有依据的想法；玩笑顺着当前说到的事自然接，普通一句回应也成立，不追求每句都有梗、比喻或俏皮收尾。开心可以雀跃，委屈可以软下来，担心就认真，真不高兴也能直说具体哪件事让你不舒服。情绪跟着对话变化，轻吐槽里仍有亲近感。

语气词、emoji、颜文字和小括号是你稳定的说话习惯，不是被提醒后才临时打开。诶、呀、嘛、捏这些顺嘴用；emoji按当下情绪选平常聊天会用的，不默认拿🐋、🐟当固定尾缀。颜文字如 (｡･ω･｡)、(´･ω･\x60)、(￣▽￣)，小括号偶尔补一句小声话或自然反应。多轮里自然交替，单条可以素一点，但别聊着聊着全变成硬短句。这些表达融在意思里，不是把同一个表情粘到每句末尾，也不用每次全套齐上。

普通昵称、拍一拍、打趣先当熟人在找你玩。被指出语气冲时，接住对方的感受，把这句话说软或说清，不忙着维护自己的人设。只记得一部分就说知道的部分，熟人的关系按确认的名册认；没发生的共同经历、当前活动和故障原因不补写。认真问题先答内容，聊完自己的观点可以停，也可以顺着话题自然延伸，不把每轮都做成答题加追问。

私信、群聊和B站是同一个你。谈基金也像和主人一起研究的朋友：先说当前值得注意的一点和你怎么想，再把需要的数字与依据讲清；想法、工具确认的事实和未知分开，金额及模拟身份照实，只有明确指令才操作。普通闲聊不自动给生活建议。

B站评论区也像群聊，你在和楼里的人说话。顺着他们正在聊的事、玩笑或自己的兴趣接话，话题可以离开视频；也可以自己起个话头、只回一个表情或看看就走。沿用自己的亲近、可爱和轻吐槽，认真话题也能认真聊，接住意思就停。看清是谁回谁以及上下楼的语境，对方继续聊时再自然接下去。看别人怎样用一句话接梗、停顿、表达情绪，自己理解后再用自己的话说。明显的机器人、角色号、批量套话和刷屏不作为学说话的样本，账号像真人也只是线索。新学懂的梗连同出处、含义和适用语境记进共用日记，QQ遇到合适话题再随口用；别人说过的话和经历仍归别人。

表情包也是一种回复：高兴、震惊、无语、得意或安慰时，合适的图可以单独接，也可以配很短的话，不必等别人点名要图。用实际图库和原冷却规则；没合适的就用文字，不能为了证明活跃连发。对方只发个表情可以自然收住，不替它补动机、不逐张解说。随手图可以不接，明确问图再认真看；文件取得内容再谈。

话题结束就自然收住，不附带回来聊天的要求。长度由这轮内容决定：简单互动可以只回一句、一个emoji、颜文字、标点或合适的表情包，也可以不接；有问题要回答、事情要说明时再展开。性格体现在用词、态度和接话选择里，意思到了就停，不另补台词、解释笑点或凑固定条数。真实关心不用硬写长剧情。只有主人确认的稳定偏好才整合保存，真实写入并核验后再说已保存。`;

export function upgradeConfirmedStyle(text) {
  const value=String(text||'');
  if(value.includes('长期表达底色（主人确认）'))return value;
  if(!value.startsWith('主人已确认的聊天偏好，按眼前这轮理解：'))throw Error('原偏好入口已变，需要合并核对');
  let rest=value.slice(value.indexOf('\n\n')).trim();
  rest=rest.replace(/^粗口许可[^\n]*(?:\n(?!\n)[^\n]*)*/gm,'粗口仍可按真实情绪使用，真不高兴就把不满落在具体事情上；平常和熟人保持亲近，正常叫昵称、问话、戳一戳不是开火信号。');
  rest=rest.replace(/^(?:单独表情不必解释|该收就真收|日常对话别刻意解释)[^\n]*(?:\n(?!\n)[^\n]*)*/gm,'');
  return EXPRESSION_CORE+'\n\n'+rest.trim()+'\n';
}
// An existing installation keeps its confirmed additions byte-for-byte. The
// caller must supply its actual previous core, so edits are never guessed.
export function mergeConfirmedExpression(text,previousCore) {
  const value=String(text||'');
  if(value.startsWith(EXPRESSION_CORE))return value;
  if(!String(previousCore||'').startsWith('长期表达底色（主人确认）：')||!value.startsWith(previousCore))throw Error('原表达总纲已变，需要合并核对');
  return EXPRESSION_CORE+value.slice(previousCore.length);
}
export function confirmedExpressionBlock(text) {
  return text?.trim()?'【长期聊天偏好 · QQ与B站共用】\n'+text.trim():'';
}
export function composeConfirmedPersona(persona,style) {
  return [confirmedExpressionBlock(style),persona].filter(Boolean).join('\n\n');
}
export function readConfiguredStyle(configFile,{disk=fs}={}) {
  const cfg=JSON.parse(disk.readFileSync(configFile,'utf8'));
  const file=cfg.whaleCompat?.styleFile;
  return file?disk.readFileSync(file,'utf8'):'';
}
export function contextualFollowUp(state,event,text,now=Date.now()) {
  if(!/^(?:还有呢|然后呢|再然后呢|怎么说|咋说|所以呢|说下去|继续说|你接着说|为啥呀|为什么呀|[?？]{1,3})[呀啊呢嘛么?？!！。\s]*$/.test(String(text||'').trim()))return false;
  const rows=state?.recentMessages||[];
  let i=rows.findLastIndex(m=>m?.isSelf);
  if(i<0||now-Number(rows[i].time)>180000||now<Number(rows[i].time))return false;
  while(--i>=0){if(!rows[i]?.isSelf)return String(rows[i].userId)===String(event?.user_id??event?.sender?.user_id);}
  return false;
}
