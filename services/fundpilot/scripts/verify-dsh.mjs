import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '/opt/fundpilot');
const sdkPath = process.env.DSH_TOOLS_MODULE || '/opt/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
const { validateJsonSchemaValue, ToolRuntime } = await import(pathToFileURL(sdkPath));
const { Context } = await import(pathToFileURL(path.resolve(path.dirname(sdkPath),'../../cordis/lib/index.js')));
const { apply, inject } = await import(pathToFileURL(path.join(root,'dsh-plugin/index.mjs')));
assert.deepEqual(inject,['tools']);
const context = new Context();
context.provide('systemPrompt',{ tools() { return () => {}; } });
const runtime = new ToolRuntime(context);
apply(context);
const nativeSchemas = await runtime.wireSchemas();
assert.equal(nativeSchemas.schemas.length,5);
assert.deepEqual([...nativeSchemas.knownNames].sort(),['fundpilot_status','fundpilot_market','fundpilot_journal','fundpilot_paper_cycle','fundpilot_paper_halt'].sort());
const tools = new Map();
apply({ tools: { register(tool) { assert.equal(tools.has(tool.name),false); tools.set(tool.name,tool); } } });
assert.equal(tools.size,5);
for (const [name,tool] of tools) {
  assert.ok(!/live|buy|sell|resume|config/.test(name));
  assert.equal(validateJsonSchemaValue(tool.parameters, {}, '').length,0);
  assert.equal(tool.parameters.type,'object');
  await assert.rejects(() => tool.execute({mode:'live'},{}));
}
for (const name of ['fundpilot_status','fundpilot_market','fundpilot_journal']) {
  const tool = tools.get(name), result = await tool.execute({},{});
  assert.equal(validateJsonSchemaValue(tool.output.schema,result,'').length,0);
  const data = JSON.parse(result.text);
  assert.equal(data.mode,'paper');
  if (name === 'fundpilot_status') { assert.equal(data.liveTrading,false); assert.equal(data.brokerConnection,'not_connected'); }
}
console.log(JSON.stringify({ok:true,dshNativeSdk:true,nativeToolRuntime:true,toolCount:tools.size,readToolsExecuted:3,modelCalls:0,liveOrders:0}));
