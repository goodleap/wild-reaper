import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const work=process.env.GITHUB_WORKSPACE||process.cwd();
const temp=path.join(process.env.RUNNER_TEMP||os.tmpdir(),'wild-reaper-config');
fs.mkdirSync(temp,{recursive:true,mode:0o700});
const log=fs.openSync(path.join(temp,'deployment.log'),'a',0o600);
function run(command,args,options={}) {
 const result=spawnSync(command,args,{cwd:work,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe',log],...options});
 if(result.stdout && options.encoding!==null)fs.writeSync(log,result.stdout);
 if(result.error||result.status!==0)throw new Error('DEPLOYMENT_STEP_FAILED');
 return result.stdout||'';
}
const connection=()=>JSON.parse(fs.readFileSync(path.join(temp,'connection.json'),'utf8'));
function ssh(command,options={}) {const c=connection();return run('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-p',String(c.port),c.user+'@wild-reaper-config',command],options);}
function digest(value) {if(!/^[a-f0-9]{40}$/.test(value))throw new Error('INVALID_SOURCE_REVISION');return value;}
try {
 const operation=process.argv[2]||'publish';
 if(operation==='setup') {
  const host=process.env.CONFIG_SSH_HOST||'',user=process.env.CONFIG_SSH_USER||'',port=Number(process.env.CONFIG_SSH_PORT||'22'),key=process.env.CONFIG_SSH_PRIVATE_KEY||'',hosts=process.env.CONFIG_SSH_KNOWN_HOSTS||'';
  if(!/^[A-Za-z0-9.-]+$/.test(host)||!/^[a-z_][a-z0-9_-]*$/.test(user)||!Number.isInteger(port)||port<1||port>65535||!key.includes('PRIVATE KEY')||!hosts.trim())throw new Error('SSH_SECRETS_MISSING_OR_INVALID');
  const identity=path.join(temp,'identity'),knownHosts=path.join(temp,'known_hosts');
  fs.writeFileSync(identity,key.trim()+'\n',{mode:0o600});fs.writeFileSync(knownHosts,hosts.trim()+'\n',{mode:0o600});
  const sshDir=path.join(os.homedir(),'.ssh');fs.mkdirSync(sshDir,{recursive:true,mode:0o700});
  const stanza=['Host wild-reaper-config','  HostName '+host,'  User '+user,'  Port '+port,'  IdentityFile '+identity,'  IdentitiesOnly yes','  BatchMode yes','  StrictHostKeyChecking yes','  UserKnownHostsFile '+knownHosts,''].join('\n');
  fs.appendFileSync(path.join(sshDir,'config'),'\n'+stanza,{mode:0o600});fs.writeFileSync(path.join(temp,'connection.json'),JSON.stringify({user,port}),{mode:0o600});
  console.log('CONFIG_SSH_SETUP=READY');
 } else if(operation==='publish') {
  const policy=JSON.parse(fs.readFileSync(path.join(work,'config-compatibility.json'),'utf8'));
  function number(value){const m=/^v0\.0\.(0|[1-9]\d*)$/.exec(value);if(!m||!Number.isSafeInteger(Number(m[1])))throw new Error('INVALID_COMPATIBILITY_POLICY');return Number(m[1]);}
  if(number(policy.clientMinVersion)>number(policy.clientMaxVersion))throw new Error('INVALID_COMPATIBILITY_INTERVAL');
  const tools=path.join(temp,'tools'),archive=path.join(temp,'tools.tar.gz');fs.mkdirSync(tools,{recursive:true});
  fs.writeFileSync(archive,ssh('config-tools',{encoding:null}),{mode:0o600});run('tar',['-xzf',archive,'-C',tools]);
  const prepared=path.join(temp,'prepared.json');
  run(process.execPath,[path.join(tools,'scripts/prepare-config.mjs'),'--game-dir',work,'--client-version','v0.0.'+run('git',['rev-list','--count','HEAD']).trim(),'--out',prepared,'--client-min',policy.clientMinVersion,'--client-max',policy.clientMaxVersion],{cwd:tools});
  const source=digest(process.env.GITHUB_SHA||run('git',['rev-parse','HEAD']).trim()),tree=digest(run('git',['rev-parse',source+':dist/config']).trim()),compatibility=digest(run('git',['rev-parse',source+':config-compatibility.json']).trim()),c=connection();
  const output=run(process.execPath,[path.join(tools,'scripts/publish-config.mjs'),'--bundle',prepared,'--target',c.user+'@wild-reaper-config','--server-dir','/opt/wild-reaper-server/current','--db','/var/lib/wild-reaper-server/app.sqlite','--port',String(c.port)],{cwd:tools,env:{...process.env,WILD_REAPER_CONFIG_RESTRICTED:'1',WILD_REAPER_CONFIG_SOURCE_COMMIT:source,WILD_REAPER_CONFIG_SOURCE_TREE:tree,WILD_REAPER_CONFIG_POLICY_BLOB:compatibility}});
  const id=/PUBLISHED_CONFIG_ID=(\d+)/.exec(output);if(!id)throw new Error('PUBLISH_RECEIPT_MISSING');
  fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify({revisionId:Number(id[1]),source}),{mode:0o600});console.log('CONFIG_PUBLICATION=SUCCESS');console.log('PUBLISHED_CONFIG_ID='+id[1]);
 } else if(operation==='rollback') {
  const id=process.env.CONFIG_REVISION_ID||'';if(!/^[1-9]\d{0,14}$/.test(id))throw new Error('ROLLBACK_REVISION_REQUIRED');
  if(!ssh('rollback-config '+id).includes('CONFIG_ROLLBACK=SUCCESS'))throw new Error('ROLLBACK_RECEIPT_MISSING');console.log('CONFIG_ROLLBACK=SUCCESS');console.log('ACTIVE_CONFIG_ID='+id);
 } else if(operation==='history') {
  for(const line of ssh('history-config').split(/\r?\n/))if(/^CONFIG_HISTORY=/.test(line))console.log(line);
 } else if(operation==='cleanup') {
  for(const name of ['identity','known_hosts','tools.tar.gz','prepared.json'])fs.rmSync(path.join(temp,name),{force:true});fs.rmSync(path.join(temp,'tools'),{recursive:true,force:true});console.log('CONFIG_CREDENTIAL_CLEANUP=COMPLETE');
 } else throw new Error('UNSUPPORTED_OPERATION');
} catch(error) {console.error('CONFIG_AUTOMATION=FAILED');console.error('REASON='+(/^[A-Z_]+$/.test(error.message)?error.message:'CLOUD_DEPLOYMENT_ERROR'));process.exitCode=1;} finally {fs.closeSync(log);}
