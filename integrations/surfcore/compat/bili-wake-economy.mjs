// Stable, compact procedure; live quotas stay in code and current config.
export function compactBrowseInstructions({b={},limits={},kinds={},biliDir='',silent=false}={}){
  const cap=n=>Number(n)>0?n:'不限';
  const enabled=Object.entries(kinds).filter(([,v])=>v.enabled!==false);
  return [
    '沿用AGENTS.md与现有预算。先deps体检；失败只读并说明，不反复重试。日记按近期日期或话题查journal，需要时再读原两本日记，不每轮重读全文。',
    'feed最多选5条，热门/排行为主、穿插原兴趣，不只看DeepSeek。先debrief --no-frames --compact初筛，只对真想了解的内容补抽帧；候选不足或没有新进展就轻醒收工，不凑深读数量。字幕优先，缺少画面时不假称看过；需要视觉信息再看图。',
    '已有评论由本地顺手学表达：每天最多5视频/300候选/100新增，不增加抓取或模型回合。先看懂梗和反话，疑似机器人可以略过；真学懂公共用法才journal --learn，含义/usage/BV/root/author-mid齐全，别人的经历仍归别人。',
    silent?'沉默逛开启：只读、评分、记真实日记；不评论、收藏、动态、分享或私信。':
      '评论区就按群聊相处，话题可在视频以外；沿用可爱、吐槽、emoji、颜文字和小括号，有话再接，没有可以停。昵称相同按mid区分。',
    ...(!silent?[
      '普通顶层：recon取aid → comment --oid aid --bvid BV --message 正文 --auto --dry → --go。主动搭热评须带--ta、--root顶层rpid、--parent回应rpid；回复楼中楼时root保留顶层，parent 填这次实际回应的那条。自己的作品（自己的投稿/动态）下开新楼，工具会自动在开头补@主人，正文直接写事——别发成没人看见的独白。',
      `发言硬上限：日${cap(limits.daily)}，全局间隔${limits.globalMin}分钟，UP${limits.perUpMin}分钟，视频${limits.perVideoMin}分钟；搭话日${cap(limits.taDaily)}，同线程${limits.perThreadMin}分钟。都只是上限，不要求用满。`,
      '接口接受不等于公开可见。用已有thread或check-comment回读；楼中楼check-comment需--root顶层号。结果不明不换文案、不重发；风控按退避停手。攻击或阴阳怪气先attack add进待审，批准前不回。',
      '真想收藏才fav --reason理由 --dry→--go：三个月后仍想重看、理由至少6字，同类已有2条须--better；每天最多3条，同视频30天一次，和分享分账。',
    ]:[]),
    '深读后按实际质量score记分，和播放量分开；真实看过什么、和谁聊过、自己的感受写入原两本日记，未发生不补写。',
    ...(enabled.length&&!silent?[`现有动态时段照配置执行，不补过期任务：${enabled.map(([key,v])=>key+'@'+String(v.slot).padStart(2,'0')+':00 '+v.minLen+'–'+v.maxLen+'字').join('；')}。best只用当天最高分；game用gamefeed核对轮换游戏/时效/质量。daily均先--dry再--go，公开动态不@人；其他类等原dynTick提醒。没合适内容可跳过。`]:[]),
    b.owner?.contactMode==='comment-mention'?'B站不私信主人；刷到你自己喜欢的就comment --share --auto并带reason/score/rank=1在评论区真实@——你喜欢看的就是我喜欢的，判据用你自己的口味，不用猜我（自己的作品下不用这套标尺，工具自动@），不凑数。':`分享沿现有share.via=${b.share?.via||'dynamic'}与quota；不用其他通道绕过。`,
    '收尾comment-digest --hours 24合并查看找你的人，按原倾听规则处理；quota react --auto --hours 48核对实际反馈，原推送开关继续生效。最后diary log记真实完成和未完成，不编成功。',
    '可选用life按需查来源、记自己的兴趣或带引文小作品、接续小项目（首次看life help）。只在本轮真有收获时整理，每天最多2次语义保存，无产量要求、不另开模型回合；观点与事实分开。',
    biliDir?'原日记目录：'+biliDir:'',
  ].filter(Boolean).join('\n');
}
