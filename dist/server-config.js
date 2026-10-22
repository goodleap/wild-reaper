import { CONTENT_SCHEMA_VERSION,validateContentPack } from './content-schema.js';
import { fetchResourceBytes } from './loading-resource.js';
import { createConfigCache } from './config-cache.js';

const MAX_BYTES=4*1024*1024;
const revision=value=>{
  if(typeof value!=='string'||!/^v0\.0\.[1-9]\d*$/.test(value))throw new Error('Invalid client version');
  const n=Number(value.slice(5));if(!Number.isSafeInteger(n))throw new Error('Invalid client version');return n;
};
const reason=error=>error?.detail||error?.message||'Configuration API unavailable';
const bounded=(promise,fallback,ms=500)=>new Promise(resolve=>{
  let settled=false;
  const done=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
  const timer=setTimeout(()=>done(fallback),ms);
  Promise.resolve(promise).then(done,()=>done(fallback));
});

function validateManifest(manifest,clientVersion){
  if(!manifest||manifest.schemaVersion!==CONTENT_SCHEMA_VERSION||
    !/^[a-f0-9]{20}$/.test(manifest.contentVersion)||!/^[a-f0-9]{64}$/.test(manifest.sha256)||
    !Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>MAX_BYTES||
    manifest.url!==`/api/config/${manifest.contentVersion}`)throw new Error('Invalid configuration manifest');
  const client=revision(clientVersion),min=revision(manifest.clientMinVersion),max=revision(manifest.clientMaxVersion);
  if(min>max||client<min||client>max)throw new Error('Configuration is incompatible with this client');
  return manifest;
}

async function verify(manifest,bytes,clientVersion){
  validateManifest(manifest,clientVersion);
  if(bytes.length!==manifest.bytes)throw new Error('Configuration size mismatch');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==manifest.sha256)throw new Error('Configuration checksum mismatch');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const pack=validateContentPack(JSON.parse(text));
  if(pack.contentVersion!==manifest.contentVersion)throw new Error('Configuration revision mismatch');
  return {pack,text};
}

export async function loadServerConfig({origin,clientVersion,fetchImpl=globalThis.fetch,
  cache=createConfigCache(),onDownloadProgress=()=>{},onValidate=()=>{},
  manifestTimeoutMs=6000,idleTimeoutMs=20000,totalTimeoutMs=60000}={}){
  const api=new URL(origin);
  const local=['localhost','127.0.0.1','[::1]'].includes(api.hostname);
  if(api.protocol!=='https:'&&!(api.protocol==='http:'&&local))throw new Error('Configuration API requires HTTPS');
  if(api.origin!==origin||api.username||api.password)throw new Error('Invalid configuration API origin');
  revision(clientVersion);
  const key=`${origin}|${clientVersion}|${CONTENT_SCHEMA_VERSION}`;
  let cached=null,cachePromise;
  try{cachePromise=bounded(cache.get(key),null);}catch{cachePromise=Promise.resolve(null);}
  const readCached=async()=>{
    cached=await cachePromise;
    if(typeof cached?.text!=='string'||cached.text.length>MAX_BYTES)throw new Error('No valid cached configuration');
    return verify(cached.manifest,new TextEncoder().encode(cached.text),clientVersion);
  };
  const download=(url,options)=>fetchResourceBytes(url,{...options,
    fetchImpl:(address,request)=>fetchImpl(address,{...request,credentials:'omit',redirect:'error',
      cache:options.manifest?'no-cache':'default'})});
  try{
    const url=new URL('/api/config/manifest',origin);
    url.searchParams.set('clientVersion',clientVersion);url.searchParams.set('schemaVersion',String(CONTENT_SCHEMA_VERSION));
    const raw=await download(url.href,{manifest:true,maxBytes:16*1024,idleTimeoutMs:manifestTimeoutMs,totalTimeoutMs:manifestTimeoutMs});
    const manifest=validateManifest(JSON.parse(new TextDecoder().decode(raw)),clientVersion);
    cached=await cachePromise;
    if(cached?.manifest?.sha256===manifest.sha256&&cached.manifest.contentVersion===manifest.contentVersion){
      try{
        const {pack}=await readCached();onValidate();
        return {pack,status:{source:'server-cache',fallback:false,origin,releaseId:manifest.releaseId}};
      }catch{/* A corrupted or incompatible cache is replaced by a fresh download. */}
    }
    const bytes=await download(new URL(manifest.url,origin).href,{expectedBytes:manifest.bytes,maxBytes:MAX_BYTES,
      idleTimeoutMs,totalTimeoutMs,onProgress:onDownloadProgress});
    onValidate();
    const {pack,text}=await verify(manifest,bytes,clientVersion);
    // Cache failure is not a failure to load an already verified configuration.
    try{await bounded(cache.put(key,{manifest,text}),null);}catch{}
    return {pack,status:{source:'server',fallback:false,origin,releaseId:manifest.releaseId}};
  }catch(error){
    try{
      const {pack}=await readCached();onValidate();
      return {pack,status:{source:'server-cache',fallback:true,origin,reason:reason(error),releaseId:cached.manifest.releaseId}};
    }catch{throw new Error(reason(error),{cause:error});}
  }
}
