import { fetchResourceBytes, LoadingResourceError } from '../loading-resource.js';

export const FROSTCROWN_ASSET=Object.freeze({
  path:'../assets/units/frostcrown-0d4e3d938dc5e6e0.png',
  width:1254,height:1254,
  sha256:'0d4e3d938dc5e6e087b53d02638c645d7de7dd384af9785d5551df1b8289b769'
});

function loadImage(url,signal){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.decoding='async';
    const abort=()=>finish(signal.reason??new Error('Frostcrown artwork load aborted.'));
    function finish(error){
      signal.removeEventListener('abort',abort);image.onload=image.onerror=null;
      if(error){image.removeAttribute?.('src');reject(error);}else resolve(image);
    }
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    image.onload=()=>finish();image.onerror=()=>finish(new Error('Frostcrown artwork could not be loaded.'));
    image.src=url;
  });
}

async function timedImagePhase(operation,{timeoutMs,code,detail}){
  const controller=new AbortController();let timer;
  try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
      const error=new LoadingResourceError(code,'Frostcrown artwork phase timed out.',{detail});
      controller.abort(error);reject(error);
    },Math.max(1,timeoutMs));});
    return await Promise.race([operation(controller.signal),timeout]);
  }catch(error){controller.abort(error);throw error;}
  finally{clearTimeout(timer);}
}

// One decoded source shared by the archive and the bounded MonsterArt cache.
// Boot waits for this promise before either surface can cache a first frame.
export class FrostcrownAssets{
  #image=null;
  #download={loaded:0,total:null};
  constructor(){this.pending=null;this.decodes=0;}
  get image(){return this.#image;}
  get ready(){return this.image!==null;}
  get diagnostics(){return {ready:this.ready,decodes:this.decodes,bytes:this.ready?FROSTCROWN_ASSET.width*FROSTCROWN_ASSET.height*4:0};}
  preload({load,fetchImpl=globalThis.fetch,onProgress=()=>{},expectedBytes,timeoutMs,
    idleTimeoutMs=timeoutMs??20000,downloadTimeoutMs=timeoutMs??120000,decodeTimeoutMs=timeoutMs??20000}={}){
    if(this.ready){onProgress({phase:'ready',...this.#download,done:true});return Promise.resolve(this);}
    if(this.pending)return this.pending;
    let finished=false,objectURL;
    let download={loaded:0,total:null};
    const progress=(phase,done,data={})=>{if(!finished)onProgress({phase,...download,done,...data});};
    const attempt=(async()=>{
      try{
        const url=new URL(FROSTCROWN_ASSET.path,import.meta.url).href;
        let loaded;
        progress('download',false);
        if(load){
          // Preserve injected loaders for consumers/tests without letting a late
          // completion from a failed attempt replace the current decoded image.
          loaded=await timedImagePhase(()=>load(url),{timeoutMs:Math.min(idleTimeoutMs,downloadTimeoutMs),
            code:'download-stalled',detail:'图片加载长时间未完成'});
        }else{
          const bytes=await fetchResourceBytes(url,{fetchImpl,expectedBytes,maxBytes:8*1024*1024,
            idleTimeoutMs,totalTimeoutMs:downloadTimeoutMs,onRetry:error=>progress('retry',false,{error}),
            onProgress:({loaded,total,done})=>{download={loaded,total};progress('download',done);}});
          objectURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        }
        progress('decode',false);
        let image;
        try{
          image=await timedImagePhase(async signal=>{
            const image=loaded??await loadImage(objectURL,signal);
            if(signal.aborted)throw signal.reason;
            if(typeof image.decode==='function')await image.decode();
            if(signal.aborted)throw signal.reason;
            if((image.naturalWidth??image.width)!==FROSTCROWN_ASSET.width||(image.naturalHeight??image.height)!==FROSTCROWN_ASSET.height)
              throw new LoadingResourceError('image-dimensions','Frostcrown artwork dimensions do not match.',{detail:'角色图片尺寸不符合版本要求'});
            return image;
          },{timeoutMs:decodeTimeoutMs,code:'decode-timeout',detail:'角色图片解码超时'});
        }catch(error){
          if(error instanceof LoadingResourceError)throw error;
          throw new LoadingResourceError('decode',error.message||'Frostcrown artwork decode failed.',{detail:'角色图片解码失败',cause:error});
        }
        this.#image=image;this.#download=download;this.decodes++;progress('ready',true);return this;
      }finally{
        finished=true;
        if(objectURL)URL.revokeObjectURL(objectURL);
      }
    })();
    this.pending=attempt;
    const clearPending=()=>{if(this.pending===attempt)this.pending=null;};
    attempt.then(clearPending,clearPending);return attempt;
  }
}
export const frostcrownAssets=new FrostcrownAssets();
