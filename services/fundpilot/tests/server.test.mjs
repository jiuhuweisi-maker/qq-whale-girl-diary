import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperEngine } from '../src/engine.mjs';
import { createServer } from '../src/server.mjs';

test('HTTP denies unauthenticated, browser-origin, real-trade and quote-injection requests', async t => {
  const engine = new PaperEngine(':memory:');
  const token = 'a'.repeat(64), server = createServer(engine, token, { status:'test' });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); engine.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const authorized = { Authorization:'Bearer '+token };
  assert.equal((await fetch(base+'/health')).status, 200);
  assert.equal((await fetch(base+'/status')).status, 401);
  assert.equal((await fetch(base+'/status',{headers:{...authorized,Origin:'https://example.com'}})).status, 403);
  assert.equal((await fetch(base+'/status',{headers:authorized})).status, 200);
  for (const route of ['/live/order','/config','/quotes','/paper/resume']) {
    assert.equal((await fetch(base+route,{method:'POST',headers:{...authorized,'Content-Type':'application/json'},body:'{}'})).status, 404);
  }
  const live = await fetch(base+'/paper/order',{method:'POST',headers:{...authorized,'Content-Type':'application/json'},body:JSON.stringify({mode:'live',requestId:'x',symbol:'159696.SZ',side:'buy',quantity:100})});
  assert.equal((await live.json()).error, 'LIVE_TRADING_NOT_IMPLEMENTED');
  assert.equal((await fetch(base+'/paper/cycle',{method:'POST',headers:{...authorized,'Content-Type':'text/plain'},body:'{}'})).status, 415);
  assert.equal((await fetch(base+'/paper/halt',{method:'POST',headers:{...authorized,'Content-Type':'application/json'},body:'{}'})).status, 200);
  assert.equal(engine.snapshot().halted,true);
});
