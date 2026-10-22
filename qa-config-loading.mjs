import assert from 'node:assert/strict';
import { bundledConfig } from './dist/content-defaults.js';
import { validateContentPack } from './dist/content-schema.js';

const clone=()=>structuredClone(bundledConfig);
const response=pack=>({ok:true,status:200,text:async()=>JSON.stringify(pack)});
let serial=0;
const fresh=()=>import(`./dist/content-config.js?qa-loader=${++serial}`);
const changed=()=>{const pack=clone();pack.contentVersion='qa-content-revision';pack.sections.heroes.definitions[0].name='QA role';return pack;};

{
  const api=await fresh(),pack=changed(),progress=[];let calls=0,release;
  const fetchImpl=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const a=api.loadContentConfig({url:'https://configuration.invalid/content',fetchImpl,onProgress:event=>progress.push(event)});
  const b=api.loadContentConfig({url:'https://configuration.invalid/other',fetchImpl});
  assert.equal(a,b,'concurrent startup shares one loader');assert.equal(calls,1);
  release(response(pack));const loaded=await a;
  assert.equal(api.getConfigSnapshot(),loaded);assert.equal(loaded.contentVersion,pack.contentVersion);
  assert.equal(api.getConfigSection('heroes').definitions[0].name,'QA role');
  assert.deepEqual(api.getConfigLoadStatus(),{source:'remote',fallback:false});
  assert.deepEqual(progress.map(item=>item.completed),[0,1,2,3]);assert(progress.every(item=>item.total===3));
  assert(Object.isFrozen(loaded)&&Object.isFrozen(loaded.sections.heroes.definitions[0].statModifiers.maxHealth));
  assert.throws(()=>{loaded.sections.heroes.definitions[0].name='mutation';},TypeError);
  await api.loadContentConfig({url:'https://configuration.invalid/new',fetchImpl:()=>{throw Error('should not refetch');}});
  assert.equal(api.getConfigSnapshot(),loaded,'the page retains its exact validated snapshot');
  assert.throws(()=>api.getConfigSection('unknown'),/Unknown content section/);
}

const badCases=[
  ['network',()=>{throw Error('offline');}],
  ['http',()=>({ok:false,status:503,text:async()=>''})],
  ['malformed',()=>({ok:true,text:async()=>'{broken'})],
  ['schema',()=>{const pack=changed();pack.schemaVersion=3;return response(pack);}],
  ['missing-section',()=>{const pack=changed();delete pack.sections.economy;return response(pack);}],
  ['world-reference',()=>{const pack=changed();pack.sections.stages.definitions[0].themeId='missing-world';return response(pack);}],
  ['behavior-reference',()=>{const pack=changed();pack.sections.enemies.definitions.slime.behavior='unknown-behavior';return response(pack);}],
  ['css-color',()=>{const pack=changed();pack.sections.heroes.definitions[0].color='red;background:url(https://invalid.example/a)';return response(pack);}],
  ['palette-color',()=>{const pack=changed();pack.sections.worlds.definitions[0].art.light.rgb='999,0,0';return response(pack);}],
  ['milestone-progress',()=>{const pack=changed();pack.sections.codex.milestones[0].progressKey='execute';return response(pack);}],
  ['milestone-target',()=>{const pack=changed();pack.sections.codex.milestones[0].target=0;return response(pack);}],
  ['milestone-duplicate',()=>{const pack=changed();pack.sections.codex.milestones[1].id=pack.sections.codex.milestones[0].id;return response(pack);}],
  ['large-response',()=>({ok:true,headers:{get:name=>name==='content-length'?String(4*1024*1024+1):null},text:async()=>{throw Error('body must not be read');}})],
  ['prototype-key',()=>({ok:true,text:async()=>JSON.stringify(changed()).replace('"schemaVersion":2','"__proto__":{},"schemaVersion":2')})]
];
for(const [label,fetchImpl] of badCases){
  const api=await fresh(),loaded=await api.loadContentConfig({url:'https://configuration.invalid/content',fetchImpl});
  assert.equal(loaded.contentVersion,bundledConfig.contentVersion,label);
  assert.deepEqual(loaded.sections,bundledConfig.sections,`${label}: entire known-good snapshot replaces rejected candidate`);
  assert.equal(api.getConfigLoadStatus().source,'bundled');assert.equal(api.getConfigLoadStatus().fallback,true,label);
  assert(api.getConfigLoadStatus().reason);
  if(label==='large-response')assert.match(api.getConfigLoadStatus().reason,/exceeds supported size/,'oversized response is rejected before its body is read');
}
{
  const api=await fresh();let signal;
  await api.loadContentConfig({serverOptions:null,timeoutMs:5,fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  assert(signal.aborted,'timeout aborts the pending transport');
  assert.equal(api.getConfigLoadStatus().fallback,true);assert.match(api.getConfigLoadStatus().reason,/timed out/);
}
{
  const api=await fresh(),pack=changed(),bytes=new TextEncoder().encode(JSON.stringify(pack)),downloads=[],progress=[];let calls=0;
  await api.loadContentConfig({url:'https://configuration.invalid/content',expectedBytes:bytes.length,
    fetchImpl:()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,15));controller.enqueue(bytes.slice(15));controller.close();}}),{headers:{'content-length':'12','content-encoding':'gzip'}});},
    onDownloadProgress:event=>downloads.push(event),onProgress:event=>progress.push(event)});
  assert.equal(calls,1);assert.equal(api.getConfigSnapshot().contentVersion,pack.contentVersion);
  assert.deepEqual(downloads.find(event=>event.loaded===15),{loaded:15,total:bytes.length,done:false});
  assert.deepEqual(downloads.at(-1),{loaded:bytes.length,total:bytes.length,done:true});
  assert.deepEqual(progress.map(event=>event.completed),[0,1,2,3],'byte progress preserves the existing stage API');
}
{
  const api=await fresh(),downloads=[],progress=[];let release,signal;
  await api.loadContentConfig({serverOptions:null,timeoutMs:5,onDownloadProgress:event=>downloads.push(event),onProgress:event=>progress.push(event),
    fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(resolve=>{release=resolve;});}});
  const count=downloads.length;release(response(changed()));await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert(signal.aborted);assert.equal(downloads.length,count,'late responses cannot move the finished loading UI');
  assert.deepEqual(progress.map(event=>event.completed),[0,2,3]);assert.equal(api.getConfigSnapshot().contentVersion,bundledConfig.contentVersion);
}
{
  const api=await fresh(),downloads=[];let signal,cancelled=false;
  await api.loadContentConfig({serverOptions:null,timeoutMs:5,onDownloadProgress:event=>downloads.push(event),fetchImpl:(_url,options)=>{
    signal=options.signal;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}}));
  }});
  assert(signal.aborted&&cancelled);assert(downloads.some(event=>event.loaded===1));assert(downloads.every(event=>!event.done));
  assert.equal(api.getConfigLoadStatus().fallback,true,'a body timeout falls back coherently');
}
{
  const api=await fresh(),pack=changed();
  await api.loadContentConfig({serverOptions:null,fetchImpl:()=>response(pack)});
  assert.equal(api.getConfigLoadStatus().fallback,true,'a mismatched same-site pack never mixes deployments');
  assert.equal(api.getConfigSnapshot().contentVersion,bundledConfig.contentVersion);
}
{
  const api=await fresh();let release;
  const load=api.loadContentConfig({url:'https://configuration.invalid/content',fetchImpl:()=>new Promise(resolve=>{release=resolve;})});
  const heroSection=api.getConfigSection('heroes');release(response(changed()));await load;
  assert.equal(api.getConfigSection('heroes'),heroSection,'an early runtime consumer pins defaults during a pending request');
  assert.equal(api.getConfigSnapshot().contentVersion,bundledConfig.contentVersion);
}
{
  const pack=clone();pack.sections.heroes.definitions[0].hook=()=>0;
  assert.throws(()=>validateContentPack(pack),/JSON data/,'data configuration never accepts executable functions');
  const finite=clone();finite.sections.heroes.defaults.baseHealth=Infinity;
  assert.throws(()=>validateContentPack(finite),/Non-finite/);
}
console.log('Content loader: shared async transport, coherent fallback, timeout/abort, schema and reference rejection, no code/functions, frozen snapshot, deployment match and in-flight consumer pinning passed.');
