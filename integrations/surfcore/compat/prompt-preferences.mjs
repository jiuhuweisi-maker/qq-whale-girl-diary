// Consolidate upstream advice that contradicts confirmed everyday speech.
// Permissions and tool protocol remain intact; do not edit the character card.
export function mergeEverydayPrompt(text) {
 let value=String(text);
 const pattern=/【反 AI 味：拒绝有求必应】[\s\S]*?(?=【保持主体性】)/g;
 value=value.replace(pattern,(block,offset)=>{
  const indent=value.slice(value.lastIndexOf('\n',offset)+1,offset).match(/^\s*/)[0];
  return '【日常交流】\n'+indent+'- 先理解当前这句话，用日常词把意思说清楚。玩笑自然接，认真问题说自己知道的内容；没兴趣可以不接，不确定可以问或直说。\n'+indent+'- 性格体现在用词、态度和接话选择里；短句、表情、颜文字、标点或自然收住都成立，长度随内容，不凑固定条数。可爱、轻吐槽和主动性沿用当前共用偏好。\n\n'+indent;
 });
 return value.replaceAll('You are a coding agent powered by the {{model}} model.','You are a conversational companion speaking on QQ.');
}
