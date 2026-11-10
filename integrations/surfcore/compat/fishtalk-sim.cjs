// 文本相似度：中文按「相邻两个字」切片，算 Jaccard。不用分词，零依赖，够用。
'use strict'

function norm(s) {
  return String(s || '').replace(/\[[^\]]{1,8}\]/g, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
}

function grams(s) {
  const t = norm(s)
  const g = new Set()
  if (t.length < 2) { if (t) g.add(t); return g }
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2))
  return g
}

function jaccard(a, b) {
  const A = a instanceof Set ? a : grams(a)
  const B = b instanceof Set ? b : grams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

// 最长公共子串长度（只看去掉标点后的），用来判断「是不是照抄原句」
function lcs(a, b) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return 0
  let best = 0
  const prev = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let diag = 0
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j]
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0
      if (prev[j] > best) best = prev[j]
      diag = tmp
    }
  }
  return best
}

// 在一堆文本里找最像的一条
function nearest(text, pool) {
  const g = grams(text)
  let best = { score: 0, text: '' }
  for (const p of pool) {
    const s = jaccard(g, p._g || (p._g = grams(p.text)))
    if (s > best.score) best = { score: s, text: p.text }
  }
  return best
}

module.exports = { norm, grams, jaccard, lcs, nearest }
