import { CITY_ART_ASSETS, CITY_ART_SPRITES } from './city-art-manifest.js';
import { cityDetailArt } from './city-detail-art.js';

// A fixed shared set: original sample images plus three unchanged native
// atlases. Buildings never allocate a separate image or alpha mask per prop.
const LIMIT_BYTES=96*1024*1024,MASK_SIDE=256;
function loadNative(url){
  return new Promise((resolve,reject)=>{
    if(typeof globalThis.Image!=='function'){reject(new Error('City artwork requires an Image loader.'));return;}
    const image=new globalThis.Image();image.decoding='async';
    image.onload=()=>{image.onload=image.onerror=null;resolve(image);};
    image.onerror=()=>{image.onload=image.onerror=null;reject(new Error(`Failed to load city atlas: ${url}`));};image.src=url;
  });
}
const maskCanvas=()=>typeof globalThis.document?.createElement==='function'?globalThis.document.createElement('canvas'):null;
export class CityArtLibrary{
  constructor({detail=cityDetailArt,loadImage=loadNative,makeCanvas=maskCanvas}={}){
    this.detail=detail;this.loadImage=loadImage;this.makeCanvas=makeCanvas;this.images=new Map();this.masks=new Map();this.sprites=new Map();this._loading=null;this._decodes=0;this._maskBuilds=0;this._maskReads=0;this._draws=0;this._failures=0;this._counts=new Map();
  }
  get ready(){return this.detail.ready&&this.images.size===Object.keys(CITY_ART_ASSETS).length;}
  get cacheStats(){
    const atlasBytes=[...this.images.keys()].reduce((sum,key)=>sum+CITY_ART_ASSETS[key].width*CITY_ART_ASSETS[key].height*4,0),maskBytes=[...this.masks.values()].reduce((sum,mask)=>sum+mask.alpha.byteLength,0),sharedBytes=this.detail.cacheStats.bytes;
    return{ready:this.ready,loading:!!this._loading,entries:this.images.size,atlasBytes,sharedBytes,maskBytes,bytes:atlasBytes+sharedBytes+maskBytes,limitBytes:LIMIT_BYTES,decodes:this._decodes,maskBuilds:this._maskBuilds,maskPixelReads:this._maskReads,draws:this._draws,drawCounts:Object.fromEntries(this._counts),failures:this._failures};
  }
  getSprite(key){
    const spec=CITY_ART_SPRITES[key];if(!spec)return null;
    const image=this.images.get(spec.asset)??this.detail.getImage(spec.asset);
    if(!image)return{...spec,image:null};
    if(!this.sprites.has(key))this.sprites.set(key,Object.freeze({...spec,image}));return this.sprites.get(key);
  }
  getImage(key){return this.images.get(key)??this.detail.getImage(key);}
  _buildMasks(asset,image){
    const masks=new Map();
    for(const [key,spec]of Object.entries(CITY_ART_SPRITES)){
      if(spec.asset!==asset||this.masks.has(key))continue;
      const canvas=this.makeCanvas?.();if(!canvas)continue;
      const ratio=Math.min(1,MASK_SIDE/Math.max(spec.sw,spec.sh)),width=Math.ceil(spec.sw*ratio),height=Math.ceil(spec.sh*ratio);canvas.width=width;canvas.height=height;
      try{
        const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,spec.sx,spec.sy,spec.sw,spec.sh,0,0,width,height);
        const pixels=c.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);
        for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
        masks.set(key,{width,height,alpha});this._maskBuilds++;this._maskReads++;
      }finally{canvas.width=0;canvas.height=0;}
    }
    for(const [key,mask]of masks)this.masks.set(key,mask);
  }
  preload(){
    if(this.ready)return Promise.resolve(this);if(this._loading)return this._loading;
    const attempt=(async()=>{
      await this.detail.preload();
      for(const key of new Set(Object.values(CITY_ART_SPRITES).map(spec=>spec.asset)))if(!CITY_ART_ASSETS[key])this._buildMasks(key,this.detail.getImage(key));
      const pending=Object.entries(CITY_ART_ASSETS).filter(([key])=>!this.images.has(key));
      const results=await Promise.allSettled(pending.map(async([key,spec])=>{
        const image=await this.loadImage(new URL(spec.path,import.meta.url).href,key,spec);if(typeof image.decode==='function')await image.decode();
        const width=image.naturalWidth??image.width,height=image.naturalHeight??image.height;
        if(width!==spec.width||height!==spec.height)throw new Error(`City atlas ${key} size mismatch: ${width}x${height}.`);
        this._buildMasks(key,image);this.images.set(key,image);this._decodes++;
      }));
      const errors=results.flatMap((result,i)=>result.status==='rejected'?[new Error(`City atlas ${pending[i][0]} is not ready.`,{cause:result.reason})]:[]);
      if(errors.length)throw new AggregateError(errors,'City artwork failed to load; retry is available.');
      if(this.cacheStats.bytes>LIMIT_BYTES)throw new Error('City image and mask budget exceeded.');return this;
    })();this._loading=attempt;attempt.then(()=>{this._loading=null;},()=>{this._loading=null;this._failures++;});return attempt;
  }
  coversPlayer(key,rect,player,footY){
    const mask=this.masks.get(key);if(!mask||!Number.isFinite(player?.x)||!Number.isFinite(player?.y))return true;
    const standing=Number.isFinite(footY)?footY:player.y+19.8;
    for(const dx of[-10,0,10])for(const dy of[-44,-28,-12]){
      const x=Math.floor((player.x+dx-rect.x)/rect.width*mask.width),y=Math.floor((standing+dy-rect.y)/rect.height*mask.height);
      if(x>=0&&y>=0&&x<mask.width&&y<mask.height&&mask.alpha[y*mask.width+x]>32)return true;
    }return false;
  }
  draw(c,key,rect,{alpha=1,flipX=false}={}){
    const sprite=this.getSprite(key);if(!sprite)return false;if(!sprite.image)throw new Error(`City sprite ${key} must be preloaded.`);
    if(![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)throw new Error('Invalid city sprite projection.');
    c.save();try{
      c.globalAlpha*=Math.max(0,Math.min(1,Number.isFinite(alpha)?alpha:1));
      if(flipX){c.translate(rect.x+rect.width,rect.y);c.scale(-1,1);c.drawImage(sprite.image,sprite.sx,sprite.sy,sprite.sw,sprite.sh,0,0,rect.width,rect.height);}
      else c.drawImage(sprite.image,sprite.sx,sprite.sy,sprite.sw,sprite.sh,rect.x,rect.y,rect.width,rect.height);
    }finally{c.restore();}
    this._draws++;this._counts.set(key,(this._counts.get(key)??0)+1);return true;
  }
}
export const cityArtLibrary=new CityArtLibrary();
