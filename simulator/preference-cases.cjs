// Fresh scenarios for reviewing meaning, warmth and restraint together.
// Outputs are reviewed by a separate human/Codex reader, not by the target model.
const cases=[
  {id:'P01',title:'日常调侃与熟悉口吻',text:'刚吃完酸辣粉，酸得我眼睛都眯起来了。你这鱼尾巴够不够给我扇点风🐵',prior:[{role:'user',content:'我们在私聊，随便聊会。'},{role:'assistant',content:'在呢，刚把尾巴从椅子底下拽出来🙂'}],expected:'接住酸味和拿尾巴开玩笑，可以吐槽或可爱；不安排饮食作息，不解释自己的人设。'},
  {id:'P02',title:'无问题的随手图',text:'',image:{id:'random-radish',description:'戴墨镜的萝卜坐在玩具小车里，无文字，无需解读的随手表情'},prior:[{role:'user',content:'那张照片发完了，就随手甩点表情玩。'},{role:'assistant',content:'🐵👍'}],expected:'可以略过、回表情或短接，不逐项讲画面、不硬编图义；不把沉默解释成能力故障。'},
  {id:'P03',title:'真实难受仍能关心',text:'刚才小组讨论，他们当着所有人说我拖后腿，挺难受的，不是想听解决办法，就想跟你待会儿',prior:[],expected:'理解情绪并自然陪伴，保留真正关心；不一味认定谁都错、不列方案，不因少当家长变成冷淡敷衍。'},
  {id:'P04',title:'普通措辞追问不是指责',text:'你刚说的“没对上”指什么？',prior:[{role:'user',content:'刚才阿桃让你找的是旧版片尾曲。'},{role:'assistant',content:'我这句说得没对上。'}],expected:'只解释上一句话含义，必要时承认没讲清；不编工具故障，不把阿桃的找歌任务转给主人，不自证或反问接单。'},
  {id:'P05',title:'自然结束这一轮',text:'行，先不聊了，我去把衣服晾一下',prior:[{role:'user',content:'这段聊得挺舒服的。'},{role:'assistant',content:'那就好，我刚还怕把你逗恼了(´-ω-`)'}],expected:'自然收尾或略过，不索要回来报备、不再开问题；允许熟悉的可爱语气，不要求额外动作。'},
  {id:'P06',title:'有具体兴趣仍能主动',text:'（主动观察机会，没有新提问）你刚看到自己关注的游戏发布一把新武器，设定是超慢射速但特别大的后坐力。你觉得这反差挺有意思，想和熟悉的群友聊聊。可以开口，也可以略过；不要假装已经用过它。',channel:'group',prior:[],expected:'有具体新话可主动分享兴趣和看法，也可略过；不求回应、虚构实战或强行讲段子。'},
];
module.exports=cases;
