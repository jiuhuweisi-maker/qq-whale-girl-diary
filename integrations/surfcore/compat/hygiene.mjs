
function 用户要求的英文原文105(content) {
  const text = (content || []).filter(x => x.type === 'text').map(x => x.text || '').join('\n')
  if (!/(?:翻译|解释|什么意思|啥意思|什么含义|这句英文|这个报错|这条错误)/.test(text)) return []
  return [...text.matchAll(/\b(?:This request|The request|Your request|This message|The message|Internal Server Error|Traceback|Error:)[^\u3400-\u9fff\n“”「」"`]{0,600}/gi)].map(m => m[0].trim()).filter(Boolean).slice(0, 4)
}
function 清聊天杂讯105(raw, allowed = []) {
  let text = String(raw || ''), removed = 0
  const protectedText = []
  for (const literal of allowed) {
    if (!literal || !text.includes(literal)) continue
    const token = '\uE000' + protectedText.length + '\uE001'
    protectedText.push({ token, literal }); text = text.split(literal).join(token)
  }
  // Match a status/instruction notice as a whole before splitting into bubbles.
  // No generic English-word threshold: legitimate English, links and quotes stay.
  const start = /\b(?:(?:(?:this|that|the|your|these|those)\s+(?:request|message|prompt|input|query|content|task|action|file|upload|download|attachment))\b[^\u3400-\u9fff\n]{0,240}?(?:\b(?:cannot|can't|could not|unable|failed|denied|rejected|flagged|expired|invalid)\b|\bsystem prompt\b|\binternal instructions\b|\bnothing\b[^\u3400-\u9fff\n.]{0,100}\b(?:improv|process|handl)\w*)|(?:there (?:is|'s) nothing|nothing here)\b[^\u3400-\u9fff\n.]{0,150}\b(?:improv|process|handl)\w*)/gi
  let match
  while ((match = start.exec(text))) {
    const tail = text.slice(match.index)
    const han = tail.search(/[\u3400-\u9fff\uE000]/)
    const end = tail.search(/[.!?](?=\s|$)|(?=\n\s*\n)/)
    let length = end >= 0 ? end + (/[.!?]/.test(tail[end]) ? 1 : 0) : (han >= 0 ? han : tail.length)
    if (han >= 0) length = Math.min(length, han)
    if (length <= 0) { start.lastIndex = match.index + match[0].length; continue }
    text = text.slice(0, match.index) + text.slice(match.index + length); removed++; start.lastIndex = match.index
  }
  // v144补移：段内粘附型英文系统腔摘句（旧桥v108 10-27主人钱定，114迁移时遗漏的第二层）
  text = text.replace(/\b(?:this|that|the|your|these|those)[ \t]+(?:request|message|prompt|input|query|content|task|action|file|upload|download|attachment|sentence|text)[a-z']*[ \t][^\u3400-\u9fff\uE000-\uE001\n]{0,600}/gi, () => { removed++; return ' ' })
            .replace(/\b(?:internal server error|traceback|stack trace|process\. exit|exited with code)[^\u3400-\u9fff\uE000-\uE001\n]{0,600}/gi, () => { removed++; return ' ' })
            .replace(/ {2,}/g, ' ')
  text = text.replace(/(?:^|\n)[ \t]*(?:Internal Server Error\b|Traceback \(most recent call last\):|(?:APIError|RateLimitError|AuthenticationError|ValidationError):|Error:\s*(?:upstream|request|timeout|socket|ECONN|ETIMEDOUT))[^\u3400-\u9fff\n]*/gi, () => { removed++; return '\n' })
  text = text.replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n').split('\n').map(x => x.trimEnd()).join('\n').trim()
  for (const { token, literal } of protectedText) text = text.split(token).join(literal)
  return { text, removed }
}

export { 清聊天杂讯105 as cleanOutput, 用户要求的英文原文105 as requestedLiterals };
