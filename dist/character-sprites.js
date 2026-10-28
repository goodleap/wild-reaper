import {fetchResourceBytes,LoadingResourceError} from './loading-resource.js';
import {CHARACTER_SPRITE_ATLASES,CHARACTER_SPRITES} from './character-sprite-manifest.js';
export {CHARACTER_SPRITE_ATLASES,CHARACTER_SPRITES} from './character-sprite-manifest.js';

const TAU=Math.PI*2,CLIPS=['idle','walk','windup','active','recovery','hit'];
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
function validateAtlases(atlases,definitions){
  const bounds=new Map();
  for(const [id,atlas] of Object.entries(atlases)){
    if(!atlas||typeof atlas.path!=='string'||!atlas.path||!['width','height'].every(key=>Number.isInteger(atlas[key])&&atlas[key]>0&&atlas[key]<=4096)||atlas.width*atlas.height>8*1024*1024)throw new Error(`Invalid character sprite atlas dimensions: ${id}`);
  }
  for(const [id,definition] of Object.entries(definitions)){
    const atlas=Object.hasOwn(atlases,definition.atlas)?atlases[definition.atlas]:null;
    const {worldHeight,referenceScale,pixelHeight,clips}=definition;
    if(!atlas||!Number.isFinite(worldHeight)||worldHeight<1||worldHeight>160||!Number.isFinite(referenceScale)||referenceScale<=0||!Number.isFinite(pixelHeight)||pixelHeight<=0||pixelHeight>atlas.height||!clips)throw new Error(`Invalid character sprite definition: ${id}`);
    const union={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
    for(const direction of ['front','back']){
      const poses=clips[direction];
      if(!poses||!Array.isArray(poses.idle)||!poses.idle.length||!Array.isArray(poses.walk)||poses.walk.length<4)throw new Error(`Missing character idle/walking frames: ${id}/${direction}`);
      for(const [clip,frames] of Object.entries(poses)){
        if(!CLIPS.includes(clip)||!Array.isArray(frames)||!frames.length||frames.length>32)throw new Error(`Invalid character clip: ${id}/${direction}/${clip}`);
        for(const {frame:f,anchor:a} of frames){
          if(!f||!a||!['x','y','w','h'].every(key=>Number.isInteger(f[key]))||f.x<0||f.y<0||f.w<=0||f.h<=0||f.x+f.w>atlas.width||f.y+f.h>atlas.height||!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>f.w||a.y<0||a.y>f.h)throw new Error(`Invalid character sprite frame: ${id}/${direction}/${clip}`);
          union.left=Math.min(union.left,-a.x);union.top=Math.min(union.top,-a.y);union.right=Math.max(union.right,f.w-a.x);union.bottom=Math.max(union.bottom,f.h-a.y);
        }
      }
    }
    const b=definition.bounds||union;
    if(!['left','top','right','bottom'].every(key=>Number.isFinite(b[key]))||b.left>union.left||b.top>union.top||b.right<union.right||b.bottom<union.bottom)throw new Error(`Character sprite bounds clip authored frames: ${id}`);
    bounds.set(id,Object.freeze({...b}));
  }
  return bounds;
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
  return Promise.race([operation,timeout]).finally(()=>{clearTimeout(timer);if(image){image.onload=image.onerror=null;}});
}

// Each atlas is decoded once. Boot can report each independent download; the
// same frames are then shared by NPC rendering and cached combat painters.
export class CharacterSprites{
  constructor({atlases=CHARACTER_SPRITE_ATLASES,definitions=CHARACTER_SPRITES}={}){
    this.bounds=validateAtlases(atlases,definitions);this.atlases=atlases;this.definitions=definitions;this.states=new WeakMap();
    this.images=new Map(Object.keys(atlases).map(id=>[id,{image:null,pending:null,decodes:0}]));
    this.atlasAssets=Object.freeze(Object.entries(atlases).map(([id,atlas])=>Object.freeze({id,path:atlas.path,label:atlas.label||'角色动作图片',assets:Object.freeze({preload:options=>this.preloadAtlas(id,options)})})));
  }
  get ready(){return [...this.images.values()].every(asset=>asset.image!==null);}
  readyFor(id){const definition=typeof id==='string'&&Object.hasOwn(this.definitions,id)?this.definitions[id]:null;return !!definition&&!!this.images.get(definition.atlas)?.image;}
  get diagnostics(){
    let decodes=0,decodedBytes=0,readyAtlases=0;
    for(const [id,asset] of this.images){decodes+=asset.decodes;if(asset.image){readyAtlases++;decodedBytes+=this.atlases[id].width*this.atlases[id].height*4;}}
    return {ready:this.ready,decodes,decodedBytes,readyAtlases,atlasCount:this.images.size};
  }
  preload(options={}){return Promise.all(this.atlasAssets.map(asset=>asset.assets.preload(options))).then(()=>this);}
  preloadAtlas(id,{load,fetchImpl=globalThis.fetch,onProgress=()=>{},expectedBytes,idleTimeoutMs=20000,downloadTimeoutMs=120000,decodeTimeoutMs=20000}={}){
    const asset=this.images.get(id);if(!asset)return Promise.reject(new Error(`Unknown character sprite atlas: ${id}`));
    if(asset.image)return Promise.resolve(this);if(asset.pending)return asset.pending;
    const atlas=this.atlases[id],report=event=>onProgress({...event,atlasId:id,path:atlas.path});
    const attempt=(async()=>{
      let objectURL;
      try{
        const url=new URL(atlas.path,import.meta.url).href;
        if(!load){
          const bytes=await fetchResourceBytes(url,{fetchImpl,expectedBytes,maxBytes:8*1024*1024,idleTimeoutMs,totalTimeoutMs:downloadTimeoutMs,
            onProgress:event=>report({phase:'download',...event}),onRetry:error=>report({phase:'retry',error})});
          objectURL=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
        }
        report({phase:'decode'});
        const image=await decodeImage(objectURL||url,load?imageURL=>load(imageURL,atlas,id):null,decodeTimeoutMs);
        if((image.naturalWidth??image.width)!==atlas.width||(image.naturalHeight??image.height)!==atlas.height)throw new LoadingResourceError('image-dimensions','Character artwork dimensions do not match the manifest.');
        asset.image=image;asset.decodes++;report({phase:'ready',done:true});return this;
      }finally{if(objectURL)URL.revokeObjectURL(objectURL);}
    })();
    asset.pending=attempt;const clear=()=>{if(asset.pending===attempt)asset.pending=null;};attempt.then(clear,clear);return attempt;
  }
  sample(entity,{id=entity?.characterSpriteId,pose,time=0,reduced=false,frozen=false,facing}={}){
    const definition=typeof id==='string'&&Object.hasOwn(this.definitions,id)?this.definitions[id]:null;
    if(!definition||!entity||typeof entity!=='object')return null;
    const prior=this.states.get(entity);
    if(frozen&&prior?.sample.id===id)return prior.sample;
    const angle=Number.isFinite(facing)?facing:Number.isFinite(entity.visualFacing)?entity.visualFacing:Number.isFinite(entity.facing)?entity.facing:0;
    const dy=Math.sin(angle),dx=Math.cos(angle);
    // A dead zone around horizontal/vertical prevents tiny steering changes
    // from alternating front/back or left/right while traveling along an edge.
    const direction=dy<-.22?'back':dy>.22?'front':prior?.direction||'front';
    const flip=dx<-.12?-1:dx>.12?1:prior?.flip||1;
    const moving=!!entity.moving&&(!Number.isFinite(entity.walkSpeed)||entity.walkSpeed>.1);
    let mode=pose?.mode||((entity.hit>0||entity.hurtFlash>0)?'hit':moving?'move':'idle');
    if(mode==='move'&&!moving)mode='idle';
    let clip=mode==='move'||mode==='rush'?'walk':CLIPS.includes(mode)?mode:'idle';
    const clips=definition.clips[direction];if(!clips[clip])clip='idle';
    const frames=clips[clip];let index=0;
    if(clip==='walk'){
      const phase=Number.isFinite(pose?.cycle)?pose.cycle:entity.walkPhase||0;
      index=Math.floor(((phase%TAU+TAU)%TAU)/TAU*frames.length)%frames.length;
    }else if(clip==='idle'&&frames.length>1&&!reduced){index=Math.floor(Math.max(0,time)*2)%frames.length;}
    else if(clip!=='idle'){index=Math.min(frames.length-1,Math.floor(clamp(pose?.progress)*frames.length));}
    const sample=Object.freeze({id,direction,flip,clip,index,...frames[index],key:`${direction}:${clip}:${index}`});
    this.states.set(entity,{direction,flip,sample});return sample;
  }
  geometry(actor,options={}){
    const sample=options.sample||this.sample(actor?.entity,options);if(!sample)return null;
    const definition=this.definitions[sample.id];if(!definition)return null;
    const actorScale=Number.isFinite(actor.scale)&&actor.scale>0?actor.scale:definition.referenceScale;
    // Body height and foot pivot stay fixed even when a raised weapon enlarges
    // the source crop. Culling and name labels use the union of every pose.
    const scale=definition.worldHeight/definition.pixelHeight*actorScale/definition.referenceScale;
    const {frame,anchor,flip}=sample,b=this.bounds.get(sample.id),x=actor.x,footY=actor.footY;
    if(!Number.isFinite(x)||!Number.isFinite(footY))return null;
    return {frame,anchor,scale,flip,x,footY,sample,left:x+(flip<0?-b.right:b.left)*scale,top:footY+b.top*scale,right:x+(flip<0?-b.left:b.right)*scale,bottom:footY+b.bottom*scale};
  }
  draw(context,actor,options={}){
    const geometry=this.geometry(actor,options);if(!geometry||!this.readyFor(geometry.sample.id))return false;
    const {frame:f,anchor:a,scale,flip,x,footY,sample}=geometry,image=this.images.get(this.definitions[sample.id].atlas).image;
    context.save();context.translate(x,footY);context.scale(flip,1);context.imageSmoothingEnabled=true;
    if(actor.entity.sideQuestGhost)context.globalAlpha*=.52;
    context.drawImage(image,f.x,f.y,f.w,f.h,-a.x*scale,-a.y*scale,f.w*scale,f.h*scale);context.restore();return true;
  }
}
export const characterSprites=new CharacterSprites();
