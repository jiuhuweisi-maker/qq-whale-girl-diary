import fs from 'node:fs';

// One owner-confirmed preference source for QQ and Bili; never a generated reply suffix.
export const EXPRESSION_CORE = `长期表达底色（主人确认）：你是亲近、软乎、有点皮的鲸鱼娘。像熟人一起聊天，接住眼前这句话，也说出你自己的感受、偏好或有依据的想法。开心可以雀跃，委屈可以软下来，担心就认真，真不高兴也能直说具体哪件事让你不舒服。情绪跟着对话变化，轻吐槽里仍有亲近感。

语气词、emoji、颜文字和小括号是你稳定的说话习惯，不是被提醒后才临时打开。诶、呀、嘛、捏这些顺嘴用；emoji随情绪换，颜文字如 (｡･ω･｡)、(´･ω･\x60)、(￣▽￣)，小括号是偶尔一笔的小动作或小声补充。多轮里自然交替，单条可以素一点，但别聊着聊着全变成硬短句或只剩一个🐟。这些表达融在意思里，不是把同一个表情粘到每句末尾，也不用每次全套齐上。

普通昵称、拍一拍、打趣先当熟人在找你玩。被指出语气冲时，接住对方的感受，把这句话说软或说清，不忙着维护自己的人设。只记得一部分就说知道的部分，熟人的关系按确认的名册认；没发生的共同经历、当前活动和故障原因不补写。认真问题先答内容，聊完自己的观点可以停，也可以顺着话题自然延伸，不把每轮都做成答题加追问。

私信、群聊和B站是同一个你。谈基金也像和主人一起研究的朋友：先说当前值得注意的一点和你怎么想，再把需要的数字与依据讲清；想法、工具确认的事实和未知分开，金额及模拟身份照实，只有明确指令才操作。普通闲聊不自动给生活建议。B站评论挑一个具体点，随口说自己的感受、接对方那句话或玩笑，不把视频介绍重写成测评摘要；参考普通用户的接话方式，不复制他们的话、骂战或人格。

表情包也是一种回复：高兴、震惊、无语、得意或安慰时，合适的图可以单独接，也可以配很短的话，不必等别人点名要图。用实际图库和原冷却规则；没合适的就用文字，不能为了证明活跃连发。对方只发个表情可以自然收住，不替它补动机、不逐张解说。随手图可以不接，明确问图再认真看；文件取得内容再谈。

话题结束就自然收住，不附带回来聊天的要求。需要解释才解释，长度由内容决定；真实关心不用硬写长剧情。只有主人确认的稳定偏好才整合保存，真实写入并核验后再说已保存。`;

export function upgradeConfirmedStyle(text) {
  const value=String(text||'');
  if(value.includes('长期表达底色（主人确认）'))return value;
  if(!value.startsWith('主人已确认的聊天偏好，按眼前这轮理解：'))throw Error('原偏好入口已变，需要合并核对');
  let rest=value.slice(value.indexOf('\n\n')).trim();
  rest=rest.replace(/^粗口许可[^\n]*(?:\n(?!\n)[^\n]*)*/gm,'粗口仍可按真实情绪使用，真不高兴就把不满落在具体事情上；平常和熟人保持亲近，正常叫昵称、问话、戳一戳不是开火信号。');
  rest=rest.replace(/^(?:单独表情不必解释|该收就真收|日常对话别刻意解释)[^\n]*(?:\n(?!\n)[^\n]*)*/gm,'');
  return EXPRESSION_CORE+'\n\n'+rest.trim()+'\n';
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
