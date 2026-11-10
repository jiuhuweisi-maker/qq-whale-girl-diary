import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuotes, parseHistory } from '../src/market.mjs';
test('quote parser uses milliyuan precision and provider timestamps, never local fetch time', () => {
  const fields = Array(40).fill('');
  Object.assign(fields,{2:'159696',3:'2.118',9:'2.117',19:'2.118',30:'20261029140000'});
  const [q] = parseQuotes(`v_sz159696="${fields.join('~')}";`);
  assert.equal(q.priceMills,2118);
  assert.equal(q.bidMills,2117);
  assert.equal(q.timestamp,Date.parse('2026-10-29T14:00:00+08:00'));
  assert.equal(q.premiumRate,null);
  assert.throws(() => parseQuotes('v_sz159696="malformed";'),/BAD_PROVIDER/);
});
test('history rejects adjusted or malformed data instead of mixing incompatible prices', () => {
  const bar = ['2026-10-28','2.100','2.120','2.130','2.080','1000'];
  assert.equal(parseHistory({code:0,data:{sz159696:{day:[bar]}}},'159696.SZ')[0].closeMills,2120);
  assert.throws(() => parseHistory({code:0,data:{sz159696:{qfqday:[bar]}}},'159696.SZ'),/BAD_HISTORY_RESPONSE/);
  assert.throws(() => parseHistory({code:0,data:{sz159696:{day:[['2026-10-28','2.1','2.2','2.0','2.0']]}}},'159696.SZ'),/BAD_HISTORY_OHLC/);
});
