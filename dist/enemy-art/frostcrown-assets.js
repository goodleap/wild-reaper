import { readResponseBytes } from '../loading-resource.js';

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

// One decoded source shared by the archive and the bounded MonsterArt cache.
// Boot waits for this promise before either surface can cache a first frame.
export class FrostcrownAssets{
  #image=null;
  #download={loaded:0,total:null};
  constructor(){this.pending=null;this.decodes=0;}
  get image(){return this.#image;}
  get ready(){return this.image!==null;}
  get diagnostics(){return {ready:this.ready,decodes:this.decodes,bytes:this.ready?FROSTCROWN_ASSET.width*FROSTCROWN_ASSET.height*4:0};}
  preload({load,fetchImpl=globalThis.fetch,onProgress=()=>{},expectedBytes,timeoutMs=12000}={}){
    if(this.ready){onProgress({phase:'ready',...this.#download,done:true});return Promise.resolve(this);}
    if(this.pending)return this.pending;
    const controller=new AbortController();let finished=false,timer,objectURL;
    let download={loaded:0,total:null};
    const progress=(phase,done)=>{if(!finished&&!controller.signal.aborted)onProgress({phase,...download,done});};
    const attempt=(async()=>{
      try{
        const request=(async()=>{
          const url=new URL(FROSTCROWN_ASSET.path,import.meta.url).href;
          let image;
          if(load){
            progress('download',false);image=await load(url);
          }else{
            if(typeof fetchImpl!=='function')throw new Error('Frostcrown artwork transport unavailable.');
            const response=await fetchImpl(url,{signal:controller.signal,credentials:'same-origin',cache:'default'});
            if(!response.ok)throw new Error(`Frostcrown artwork response ${response.status}.`);
            const bytes=await readResponseBytes(response,{expectedBytes,signal:controller.signal,maxBytes:8*1024*1024,
              onProgress:({loaded,total,done})=>{download={loaded,total};progress('download',done);}});
            if(controller.signal.aborted)throw controller.signal.reason;
            progress('decode',false);
            objectURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
            image=await loadImage(objectURL,controller.signal);
          }
          if(controller.signal.aborted)throw controller.signal.reason;
          if(load)progress('decode',false);
          if(typeof image.decode==='function')await image.decode();
          if(controller.signal.aborted)throw controller.signal.reason;
          if((image.naturalWidth??image.width)!==FROSTCROWN_ASSET.width||(image.naturalHeight??image.height)!==FROSTCROWN_ASSET.height)
            throw new Error('Frostcrown artwork dimensions do not match.');
          return image;
        })();
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
          const error=new Error('Frostcrown artwork load timed out.');controller.abort(error);reject(error);
        },Math.max(1,timeoutMs));});
        const image=await Promise.race([request,timeout]);
        this.#image=image;this.#download=download;this.decodes++;progress('ready',true);return this;
      }catch(error){controller.abort(error);throw error;}
      finally{
        finished=true;clearTimeout(timer);
        if(objectURL)URL.revokeObjectURL(objectURL);
      }
    })();
    this.pending=attempt;
    const clearPending=()=>{if(this.pending===attempt)this.pending=null;};
    attempt.then(clearPending,clearPending);return attempt;
  }
}
export const frostcrownAssets=new FrostcrownAssets();
