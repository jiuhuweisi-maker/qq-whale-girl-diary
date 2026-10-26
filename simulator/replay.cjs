// Reuses a saved visible answer only if the entire model context and system
// prompt are byte-identical. No transport is loaded and no inference is made.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runOne}=require('./run.cjs'),{scenario}=require('./cases.cjs'),{environment,CallBudget}=require('./lib/model.cjs');
async function replay({recordPath,candidate,snapshotDir,outputDir,stylePath,personaPath}){
  const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));assert(record.validRun!==false&&!record.pendingToolTurn,'cannot replay an invalid tool turn');
  return runOne({spec:scenario(record.caseId,record.variant),mode:record.mode,snapshotDir,outputDir,candidate,stylePath,personaPath,budget:new CallBudget(0),
    generateFn:async({context,persona,spec})=>{
      assert.equal(context,record.context,'model context changed: a saved answer is not evidence for this input');
      assert.equal(persona+'\n\n'+environment(spec),record.system,'system/persona changed: do not reuse this answer');
      return{text:record.rawOutput,system:record.system,calls:[],toolCalls:record.toolCalls,metadata:record.modelMetadata,replayed:true};
    }});
}
if(require.main===module){
  const [recordPath,candidate,snapshotDir,outputDir,stylePath,personaPath]=process.argv.slice(2);fs.mkdirSync(outputDir,{recursive:true});
  replay({recordPath,candidate,snapshotDir,outputDir,stylePath,personaPath}).then(result=>console.log(JSON.stringify({replayedFrom:recordPath,...result,modelCalls:0}))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={replay};
