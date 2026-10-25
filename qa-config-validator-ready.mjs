import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expectedValidator, compareExportedValidator, waitForValidator } from './scripts/config-validator-ready.mjs';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'config-validator-ready-'));
const game=path.join(temporary,'game'),tools=path.join(temporary,'tools');
const hash=source=>createHash('sha256').update(source).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:game,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sources={
  'content-schema.js':"import './nested/a.js';\nexport const schema=2;\n",
  'nested/a.js':"export {rule} from './b.js';\n",
  'nested/b.js':"import '../content-schema.js';\nexport const rule=1;\n"
};
function write(file,source){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);}
function exported(expected,{old=false,sourceCommit=expected.sourceCommit}={}){
  fs.rmSync(tools,{recursive:true,force:true});
  const files={};
  for(const [file,source] of Object.entries(sources)){
    const body=old&&file==='nested/b.js'?source.replace('rule=1','rule=0'):source;
    write(path.join(tools,'vendor/game',file),body);files[file]=hash(body);
  }
  write(path.join(tools,'vendor/game/provenance.json'),JSON.stringify({...expected,sourceCommit,files}));
  return tools;
}
try{
  for(const [file,source] of Object.entries(sources))write(path.join(game,'dist',file),source);
  write(path.join(game,'dist/unrelated.js'),"throw new Error('not evaluated');\n");
  git('init','-q');git('config','user.name','Configuration QA');git('config','user.email','qa@example.invalid');git('add','.');git('commit','-qm','validator fixture');
  const expected=expectedValidator(game);
  assert.equal(expected.sourceCommit,git('rev-parse','HEAD'));
  assert.deepEqual(Object.keys(expected.files).sort(),Object.keys(sources).sort(),'static closure includes cycles/reexports, excludes unrelated files');
  for(const [file,source] of Object.entries(sources))assert.equal(expected.files[file],hash(source));
  write(path.join(game,'dist/nested/b.js'),'uncommitted change');
  assert.deepEqual(expectedValidator(game),expected,'comparison uses the intended committed release');
  assert.equal(compareExportedValidator(exported(expected),expected).ready,true);
  assert.equal(compareExportedValidator(exported(expected,{sourceCommit:'f'.repeat(40)}),expected).ready,true,'a different backend source commit with identical validators is ready');
  assert.deepEqual(compareExportedValidator(exported(expected,{old:true}),expected),{ready:false,mismatches:1,sourceCommit:expected.sourceCommit});

  let clock=0,requests=0;const waits=[];
  const ready=await waitForValidator({expected,fetchTools:()=>exported(expected,{old:++requests<3}),now:()=>clock,
    wait:async ms=>{clock+=ms;},timeoutMs:100,intervalMs:20,onWait:state=>waits.push(state)});
  assert.equal(ready.attempts,3);assert.equal(clock,40);assert.equal(waits.length,2);
  clock=0;requests=0;
  await assert.rejects(waitForValidator({expected,fetchTools:()=>{requests++;return exported(expected,{old:true});},now:()=>clock,
    wait:async ms=>{clock+=ms;},timeoutMs:45,intervalMs:20}),/CONFIG_VALIDATOR_NOT_READY/);
  assert.equal(clock,45);assert.equal(requests,3,'a stale rollout stops at the deadline');
  requests=0;
  await assert.rejects(waitForValidator({expected,fetchTools:()=>{requests++;throw Error('SSH_DENIED');},wait:()=>assert.fail('transport failures must not be polled')}),/SSH_DENIED/);
  assert.equal(requests,1);
  exported(expected);write(path.join(tools,'vendor/game/nested/b.js'),'damaged');
  await assert.rejects(waitForValidator({expected,fetchTools:()=>tools,wait:()=>assert.fail('corrupt exports must not be polled')}),/CONFIG_VALIDATOR_EXPORT_INVALID/);
  exported(expected);write(path.join(tools,'vendor/game/provenance.json'),'{bad');
  assert.throws(()=>compareExportedValidator(tools,expected),/CONFIG_VALIDATOR_METADATA_INVALID/);
  console.log('Configuration validator readiness QA passed: committed static closure, content identity, bounded rollout wait and immediate transport/corruption failures.');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
