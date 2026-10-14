import { bundledConfig,localConfigPath } from './content-defaults.js';
import { validateContentPack,freezeContent } from './content-schema.js';

// All consumers share one immutable revision. A new source can be selected
// before module initialization; a running page never mixes catalogue versions.
const defaults=freezeContent(validateContentPack(bundledConfig));
let active=defaults,consumed=false,pending=null,loadStatus=Object.freeze({source:'bundled',fallback:false});
export function getConfigSection(name) {
  if(!Object.hasOwn(active.sections,name))throw new Error(`Unknown content section: ${name}`);
  consumed=true;return active.sections[name];
}
export function getConfigSnapshot(){return active;}
export function getConfigLoadStatus(){return loadStatus;}

export function loadContentConfig({onProgress=()=>{},fetchImpl=globalThis.fetch,url,timeoutMs=6000}={}) {
  if(consumed){onProgress({completed:3,total:3,stage:'配置已就绪'});return Promise.resolve(active);}
  if(pending)return pending;
  pending=(async()=>{
    let finished=false;
    const progress=(completed,stage)=>{if(!finished)onProgress({completed,total:3,stage});};
    progress(0,'读取游戏配置');
    let timer,controller,source=url?'remote':'site';
    try{
      if(typeof fetchImpl!=='function')throw new Error('Configuration transport unavailable');
      controller=new AbortController();
      const endpoint=url??new URL(localConfigPath,import.meta.url).href;
      const request=(async()=>{
        const response=await fetchImpl(endpoint,{signal:controller.signal,credentials:'same-origin',cache:'default'});
        if(!response.ok)throw new Error(`Configuration response ${response.status}`);
        const size=Number(response.headers?.get?.('content-length')||0);
        if(size>2*1024*1024)throw new Error('Content pack exceeds supported size');
        const text=await response.text();
        if(text.length>2*1024*1024)throw new Error('Content pack exceeds supported size');
        progress(1,'校验游戏内容');
        const candidate=validateContentPack(JSON.parse(text));
        if(!url&&candidate.contentVersion!==defaults.contentVersion)throw new Error('Site content revision does not match code');
        return freezeContent(candidate);
      })();
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Configuration request timed out'));},Math.max(1,timeoutMs));});
      const candidate=await Promise.race([request,timeout]);
      // A concurrent runtime import can pin the bundled catalogue while I/O is
      // pending. In that case the loaded candidate must not replace it.
      if(!consumed){active=candidate;loadStatus=Object.freeze({source,fallback:false});}
    }catch(error){
      if(!consumed){active=defaults;loadStatus=Object.freeze({source:'bundled',fallback:true,reason:error instanceof Error?error.message:'Invalid configuration'});}
    }finally{clearTimeout(timer);}
    progress(2,'确认配置版本');
    // Indexes are built by the subsequent gameplay module import. Pin this
    // validated pack now so another loader cannot replace it during that work.
    consumed=true;progress(3,'配置已就绪');finished=true;return active;
  })();
  return pending;
}
