import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const repository='goodleap/wild-reaper',entry='content-schema.js';
const fail=code=>{throw new Error(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validPath=value=>typeof value==='string'&&/^[a-zA-Z0-9_./-]+\.js$/.test(value)&&!value.startsWith('/')&&!value.split('/').includes('..');

// Match sync-validator.mjs exactly: parse the committed dependency closure,
// never evaluate configuration or silently use uncommitted validator changes.
export function expectedValidator(gameDir){
  const script=`
    import {execFileSync} from 'node:child_process';
    import {createHash} from 'node:crypto';
    import {posix} from 'node:path';
    import {SourceTextModule} from 'node:vm';
    const cwd=process.argv[1],git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
    const sourceCommit=git('rev-parse','HEAD'),files={};
    function visit(file){
      if(Object.hasOwn(files,file))return;
      if(!/^[a-zA-Z0-9_./-]+\\.js$/.test(file)||file.startsWith('/')||file.split('/').includes('..'))throw Error('INVALID_VALIDATOR_PATH');
      const source=git('show',sourceCommit+':dist/'+file)+'\\n';
      if(/\\bimport\\s*\\(/.test(source))throw Error('DYNAMIC_VALIDATOR_IMPORT');
      files[file]=createHash('sha256').update(source).digest('hex');
      for(const specifier of new SourceTextModule(source,{identifier:file}).dependencySpecifiers){
        if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw Error('EXTERNAL_VALIDATOR_IMPORT');
        visit(posix.normalize(posix.join(posix.dirname(file),specifier)));
      }
    }
    visit('content-schema.js');
    process.stdout.write(JSON.stringify({sourceRepository:'goodleap/wild-reaper',sourceCommit,entry:'content-schema.js',files}));
  `;
  return JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules','--no-warnings','--input-type=module','-e',script,path.resolve(gameDir)],
    {encoding:'utf8',maxBuffer:128*1024,timeout:30000}));
}

export function compareExportedValidator(tools,expected){
  const directory=path.join(tools,'vendor/game'),metadata=path.join(directory,'provenance.json');
  let current;
  try{
    if(fs.statSync(metadata).size>128*1024)fail('CONFIG_VALIDATOR_METADATA_INVALID');
    current=JSON.parse(fs.readFileSync(metadata,'utf8'));
  }catch{fail('CONFIG_VALIDATOR_METADATA_INVALID');}
  if(current?.sourceRepository!==repository||current.entry!==entry||!/^[a-f0-9]{40}$/.test(current.sourceCommit)||
    !current.files||typeof current.files!=='object'||Array.isArray(current.files))fail('CONFIG_VALIDATOR_METADATA_INVALID');
  const files=Object.entries(current.files);
  if(!files.length||files.length>128||!Object.hasOwn(current.files,entry)||files.some(([file,digest])=>!validPath(file)||!/^[a-f0-9]{64}$/.test(digest)))
    fail('CONFIG_VALIDATOR_METADATA_INVALID');
  // A corrupt archive is an error, not an older deployment to keep polling.
  for(const [file,digest] of files){
    try{
      const target=path.join(directory,file),stat=fs.lstatSync(target);
      if(!stat.isFile()||stat.size>2*1024*1024||hash(fs.readFileSync(target))!==digest)fail('CONFIG_VALIDATOR_EXPORT_INVALID');
    }catch{fail('CONFIG_VALIDATOR_EXPORT_INVALID');}
  }
  const paths=new Set([...Object.keys(expected.files),...Object.keys(current.files)]);
  const mismatches=[...paths].filter(file=>expected.files[file]!==current.files[file]);
  return {ready:mismatches.length===0,mismatches:mismatches.length,sourceCommit:current.sourceCommit};
}

export async function waitForValidator({expected,fetchTools,inspect=compareExportedValidator,
  now=Date.now,wait=sleep,timeoutMs=6*60*1000,intervalMs=15000,onWait=()=>{}}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<0||!Number.isFinite(intervalMs)||intervalMs<=0)fail('CONFIG_VALIDATOR_WAIT_INVALID');
  const deadline=now()+timeoutMs;
  let attempts=0;
  while(true){
    // Transport/authentication errors propagate immediately; only a verified
    // older validator is evidence that the backend rollout needs more time.
    const tools=await fetchTools(),state=inspect(tools,expected);attempts++;
    if(state.ready)return {tools,attempts,sourceCommit:state.sourceCommit};
    const remaining=deadline-now();
    if(remaining<=0)fail('CONFIG_VALIDATOR_NOT_READY');
    onWait({attempt:attempts,mismatches:state.mismatches,remainingSeconds:Math.ceil(remaining/1000)});
    await wait(Math.min(intervalMs,remaining));
    if(now()>=deadline)fail('CONFIG_VALIDATOR_NOT_READY');
  }
}
