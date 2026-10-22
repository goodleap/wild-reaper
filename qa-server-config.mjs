import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundledConfig } from './dist/content-defaults.js';
import { getServerConfigOptions } from './dist/config-source.js';
import { loadServerConfig } from './dist/server-config.js';
import { createConfigCache } from './dist/config-cache.js';

const origin='https://api.wild.example.com',clientVersion='v0.0.133';
const pack=structuredClone(bundledConfig);
pack.sections.heroes.definitions[0].name='配置服务校验角色';
pack.contentVersion=createHash('sha256').update(JSON.stringify({schemaVersion:pack.schemaVersion,sections:pack.sections})).digest('hex').slice(0,20);
const text=JSON.stringify(pack)+'\n';
const manifest={releaseId:1,schemaVersion:2,contentVersion:pack.contentVersion,bytes:Buffer.byteLength(text),
  sha256:createHash('sha256').update(text).digest('hex'),clientMinVersion:clientVersion,clientMaxVersion:clientVersion,
  url:`/api/config/${pack.contentVersion}`,sourceCommit:'1'.repeat(40),publishedAt:'2026-10-20T00:00:00.000Z'};
const memory=()=>{
  const entries=new Map();
  return {entries,get:async key=>entries.get(key)??null,put:async(key,value)=>{entries.set(key,value);}};
};
const endpoint=handler=>async(url,options)=>{
  assert.equal(options.credentials,'omit','API requests never carry website credentials');
  assert.equal(options.redirect,'error');
  return handler(new URL(url),options);
};
const transport=endpoint(url=>new Response(url.pathname==='/api/config/manifest'?JSON.stringify(manifest):text));
const options={origin,clientVersion,fetchImpl:transport,cache:memory()};
let serial=0;
const fresh=()=>import(`./dist/content-config.js?server-qa=${++serial}`);

{
  const padded=text+' '.repeat(4*1024*1024-Buffer.byteLength(text));
  const boundary={...manifest,bytes:Buffer.byteLength(padded),sha256:createHash('sha256').update(padded).digest('hex')};
  const loaded=await loadServerConfig({...options,cache:memory(),fetchImpl:endpoint(url=>new Response(url.pathname==='/api/config/manifest'?JSON.stringify(boundary):padded))});
  assert.equal(loaded.status.source,'server','a complete valid configuration at the 4 MiB boundary loads remotely');
  assert.equal(loaded.pack.contentVersion,pack.contentVersion);
}

assert.equal(getServerConfigOptions({enabled:false,location:null}),null);
for(const hostname of ['example.com','www.example.com','wild.example.com','tower.example.com','wild.example.com.cn']){
  assert.deepEqual(getServerConfigOptions({enabled:true,location:{hostname},clientVersion}),{origin:`https://api.${hostname}`,clientVersion});
}
assert.throws(()=>getServerConfigOptions({enabled:true,location:{hostname:'localhost'}}),/local development/);
assert.equal(getServerConfigOptions({enabled:true,originOverride:'http://127.0.0.1:8787',clientVersion}).origin,'http://127.0.0.1:8787');
assert.throws(()=>getServerConfigOptions({enabled:true,originOverride:'http://api.example.com',clientVersion}),/HTTPS/);
assert.throws(()=>getServerConfigOptions({enabled:true,originOverride:'https://api.example.com/other',clientVersion}),/origin/);

{
  const api=await fresh(),downloads=[];
  await api.loadContentConfig({serverOptions:{origin,clientVersion},serverCache:options.cache,fetchImpl:transport,
    onDownloadProgress:event=>downloads.push(event)});
  assert.equal(api.getConfigSnapshot().contentVersion,pack.contentVersion);
  assert.equal(api.getConfigLoadStatus().source,'server');
  assert.equal(api.getConfigSection('heroes').definitions[0].name,'配置服务校验角色');
  assert.equal(downloads.at(-1).total,manifest.bytes);
  assert(Object.isFrozen(api.getConfigSnapshot().sections.heroes));
  await api.loadContentConfig({serverOptions:null,fetchImpl:()=>{throw Error('must stay pinned');}});
  assert.equal(api.getConfigSnapshot().contentVersion,pack.contentVersion);
}
{
  let downloads=0;
  const result=await loadServerConfig({...options,fetchImpl:endpoint(url=>{
    assert.equal(url.pathname,'/api/config/manifest','unchanged configuration reuses its verified cache');
    assert.equal(url.searchParams.get('clientVersion'),clientVersion);downloads++;return new Response(JSON.stringify(manifest));
  })});
  assert.equal(downloads,1);assert.equal(result.status.source,'server-cache');assert.equal(result.status.fallback,false);
}
{
  const offline=()=>{throw Error('offline');};
  const result=await loadServerConfig({...options,fetchImpl:offline});
  assert.equal(result.status.source,'server-cache');assert.equal(result.status.fallback,true);
  for(const isolated of [{origin:'https://api.tower.example.com'},{clientVersion:'v0.0.134'}]){
    await assert.rejects(loadServerConfig({...options,...isolated,fetchImpl:offline}),/网络|offline/);
  }
  const api=await fresh();let calls=0;
  await api.loadContentConfig({serverOptions:null,serverCache:{get(){throw Error('local mode must ignore API cache');}},
    fetchImpl:url=>{calls++;assert(!String(url).includes('api.wild'));return new Response(JSON.stringify(bundledConfig));}});
  assert.equal(calls,1);assert.equal(api.getConfigSnapshot().contentVersion,bundledConfig.contentVersion);
  assert.equal(api.getConfigLoadStatus().source,'site');
}
for(const [label,invalid] of [
  ['checksum',{...manifest,sha256:'0'.repeat(64)}],
  ['size',{...manifest,bytes:manifest.bytes-1}],
  ['size limit',{...manifest,bytes:4*1024*1024+1}],
  ['compatibility',{...manifest,clientMinVersion:'v0.0.134',clientMaxVersion:'v0.0.135'}],
  ['schema',{...manifest,schemaVersion:999}],
  ['external URL',{...manifest,url:'https://untrusted.invalid/config'}],
]){
  const api=await fresh();
  await api.loadContentConfig({serverOptions:{origin,clientVersion},serverCache:memory(),
    fetchImpl:endpoint(url=>new Response(url.pathname==='/api/config/manifest'?JSON.stringify(invalid):text))});
  assert.equal(api.getConfigLoadStatus().source,'bundled',label);
  assert.equal(api.getConfigLoadStatus().fallback,true,label);
}
{
  const cache=memory(),key=`${origin}|${clientVersion}|2`;
  cache.entries.set(key,{manifest,text:'broken'});
  const loaded=await loadServerConfig({...options,cache});
  assert.equal(loaded.status.source,'server','damaged cache is downloaded again');
  assert.equal(cache.entries.get(key).text,text);
}
{
  const api=await fresh();let signal;
  await api.loadContentConfig({serverOptions:{origin,clientVersion},serverCache:memory(),timeoutMs:5,
    fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  assert(signal.aborted);assert.equal(api.getConfigLoadStatus().source,'bundled');
}
{
  const loaded=await loadServerConfig({...options,cache:{get:async()=>{throw Error('blocked');},put:async()=>{throw Error('full');}}});
  assert.equal(loaded.status.source,'server','storage failures do not discard verified downloads');
  const cache=createConfigCache(null);assert.equal(await cache.get('none'),null);
}
{
  const api=await fresh();let release;
  const pending=api.loadContentConfig({serverOptions:{origin,clientVersion},serverCache:memory(),
    fetchImpl:()=>new Promise(resolve=>{release=resolve;})});
  const previous=api.getConfigSection('heroes');
  release(new Response(JSON.stringify(manifest)));
  // A second response supplies the pack; the catalogue was already pinned by a consumer.
  await new Promise(resolve=>setTimeout(resolve,0));release(new Response(text));
  await pending;
  assert.equal(api.getConfigSection('heroes'),previous);
  assert.equal(api.getConfigSnapshot().contentVersion,bundledConfig.contentVersion);
}
console.log('Configuration API: full-host origin, compatibility, integrity, immutable startup, cache reuse/isolation, local switch, outage and storage fallback passed.');
