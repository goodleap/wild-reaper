import {fetchResourceBytes,LoadingResourceError} from './loading-resource.js';
import {CHARACTER_SPRITE_ATLAS,CHARACTER_SPRITES} from './character-sprite-manifest.js';
export {CHARACTER_SPRITE_ATLAS,CHARACTER_SPRITES} from './character-sprite-manifest.js';

function validateAtlas(atlas,definitions){
  if(!atlas||typeof atlas.path!=='string'||!['width','height'].every(key=>Number.isInteger(atlas[key])&&atlas[key]>0&&atlas[key]<=4096)||atlas.width*atlas.height>8*1024*1024)throw new Error('Invalid character sprite atlas dimensions.');
  for(const [id,definition] of Object.entries(definitions)){
    const {frame:f,anchor:a,worldHeight,referenceScale}=definition;
    if(!f||!a||!['x','y','w','h'].every(key=>Number.isInteger(f[key]))||f.x<0||f.y<0||f.w<=0||f.h<=0||f.x+f.w>atlas.width||f.y+f.h>atlas.height||!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>f.w||a.y<0||a.y>f.h||!Number.isFinite(worldHeight)||worldHeight<1||worldHeight>160||!Number.isFinite(referenceScale)||referenceScale<=0)throw new Error(`Invalid character sprite frame: ${id}`);
  }
}
function decodeImage(url,load,timeoutMs){
  let image,timer;
  const operation=(async()=>{
    image=load?await load(url):await new Promise((resolve,reject)=>{
      const element=new Image();image=element;element.decoding='async';
      element.onload=()=>resolve(element);element.onerror=()=>reject(new LoadingResourceError('decode','Character artwork could not be decoded.'));
      element.src=url;
    });
    if(typeof image.decode==='function')await image.decode();return image;
  })();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new LoadingResourceError('decode-timeout','Character artwork decode timed out.')),Math.max(1,timeoutMs));});
  return Promise.race([operation,timeout]).finally(()=>{
    clearTimeout(timer);if(image){image.onload=image.onerror=null;}
  });
}

// Boot owns loading. Importing this shared renderer has no side effects; both
// quest actors and cached combat painters use the same decoded image.
export class CharacterSprites{
  constructor({atlas=CHARACTER_SPRITE_ATLAS,definitions=CHARACTER_SPRITES}={}){
    validateAtlas(atlas,definitions);this.atlas=atlas;this.definitions=definitions;this.image=null;this.pending=null;this.decodes=0;
  }
  get ready(){return this.image!==null;}
  get diagnostics(){return {ready:this.ready,decodes:this.decodes,decodedBytes:this.ready?this.atlas.width*this.atlas.height*4:0};}
  preload({load,fetchImpl=globalThis.fetch,onProgress=()=>{},expectedBytes,idleTimeoutMs=20000,downloadTimeoutMs=120000,decodeTimeoutMs=20000}={}){
    if(this.ready)return Promise.resolve(this);
    if(this.pending)return this.pending;
    const attempt=(async()=>{
      let objectURL;
      try{
        const url=new URL(this.atlas.path,import.meta.url).href;
        if(!load){
          const bytes=await fetchResourceBytes(url,{fetchImpl,expectedBytes,maxBytes:8*1024*1024,idleTimeoutMs,totalTimeoutMs:downloadTimeoutMs,
            onProgress:event=>onProgress({phase:'download',...event}),onRetry:error=>onProgress({phase:'retry',error})});
          objectURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        }
        onProgress({phase:'decode'});
        const image=await decodeImage(objectURL||url,load,decodeTimeoutMs);
        if((image.naturalWidth??image.width)!==this.atlas.width||(image.naturalHeight??image.height)!==this.atlas.height)throw new LoadingResourceError('image-dimensions','Character artwork dimensions do not match the manifest.');
        this.image=image;this.decodes++;onProgress({phase:'ready',done:true});return this;
      }finally{if(objectURL)URL.revokeObjectURL(objectURL);}
    })();
    this.pending=attempt;const clear=()=>{if(this.pending===attempt)this.pending=null;};attempt.then(clear,clear);return attempt;
  }
  geometry(actor){
    const id=actor?.entity?.characterSpriteId,definition=typeof id==='string'&&Object.hasOwn(this.definitions,id)?this.definitions[id]:null;if(!definition)return null;
    const {frame,anchor,worldHeight,referenceScale}=definition;
    const actorScale=Number.isFinite(actor.scale)&&actor.scale>0?actor.scale:referenceScale;
    const scale=worldHeight/frame.h*actorScale/referenceScale;
    const facing=Number.isFinite(actor.entity.visualFacing)?actor.entity.visualFacing:actor.entity.facing||0,flip=Math.cos(facing)<-.1?-1:1;
    const x=actor.x,footY=actor.footY;if(!Number.isFinite(x)||!Number.isFinite(footY))return null;
    const left=x-(flip<0?frame.w-anchor.x:anchor.x)*scale,top=footY-anchor.y*scale;
    return {frame,anchor,scale,flip,x,footY,left,top,right:left+frame.w*scale,bottom:top+frame.h*scale};
  }
  draw(context,actor,{pose}={}){
    if(!this.ready)return false;const geometry=this.geometry(actor);if(!geometry)return false;
    const {frame:f,anchor:a,scale,flip,x,footY}=geometry;
    context.save();context.translate(x,footY);context.scale(flip,1);context.imageSmoothingEnabled=true;
    // A single authored silhouette supports modest planted-foot body motion.
    // Use actual locomotion or the shared combat pose, never an idle timer;
    // this does not pretend to provide independent weapon or direction frames.
    const e=actor.entity,p=pose||{mode:e.moving&&e.walkSpeed>.1?'move':'idle',cycle:e.walkPhase||0};
    const progress=Math.max(0,Math.min(1,p.progress||0)),smooth=progress*progress*(3-2*progress);
    const step=p.mode==='move'?Math.sin(p.cycle||0):0;
    const lean=p.mode==='windup'?-.045*smooth:p.mode==='active'?.055:p.mode==='recovery'?.055*(1-smooth):step*.012;
    const squash=1-Math.abs(step)*.014-(p.mode==='windup'?.018*smooth:0);
    if(lean||squash!==1)context.transform(1+(1-squash)*.35,0,lean,squash,0,0);
    if(actor.entity.sideQuestGhost)context.globalAlpha*=.52;
    context.drawImage(this.image,f.x,f.y,f.w,f.h,-a.x*scale,-a.y*scale,f.w*scale,f.h*scale);context.restore();return true;
  }
}
export const characterSprites=new CharacterSprites();
