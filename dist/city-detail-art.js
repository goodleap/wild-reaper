// One small authored sample uses native transparent artwork. This exact-ID
// manifest is deliberately independent of the collision/map configuration.
// Importing it in Node never constructs an Image or accesses document.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const gateScale=200/693;
export const CITY_DETAIL_MANIFEST=freeze({
  worldId:'clockshadow-city',
  assets:{
    gate:{path:'./assets/city-sample/gate-d9428bdc892ce183.png',width:1482,height:1061,sha256:'d9428bdc892ce183d6d2b7369cdcda443ba5dfc0eba42b9c59bc2220e619bdbe'},
    wall:{path:'./assets/city-sample/wall-d7d437c919e491ab.png',width:1774,height:887,sha256:'d7d437c919e491ab599401252819a100b6f6d13c4d8cf501e4d531ab1a12a12b'},
    ground:{path:'./assets/city-sample/ground-7d1adc4b91009113.png',width:1254,height:1254,sha256:'7d1adc4b91009113e8f05c18636bd96c9b7151ec40d7ffa75871535fe7333b52'},
    foliage:{path:'./assets/city-sample/foliage-690af33db5eae4a3.png',width:1254,height:1254,sha256:'690af33db5eae4a3790103540ecedc13b0dec3099b27136c10c4ca253fa155d6'},
    house:{path:'./assets/city-sample/house-2b4b607fd5e20981.png',width:1254,height:1254,sha256:'2b4b607fd5e20981146c7d5c0141e818a3f5505a462a3d382614ebdeb2adeffc'}
  },
  props:{
    'gate:castle-main':{asset:'gate',variant:'city-structure',width:280,depth:60,drawWidth:1482*gateScale,drawHeight:1061*gateScale,anchorX:741.5*gateScale,anchorY:1040*gateScale-20},
    'castle:南墙西:0:2':{asset:'wall',variant:'city-structure',width:250,depth:40,drawWidth:260,drawHeight:130,anchorX:130,anchorY:806/887*130-20},
    'castle:南墙东:0:0':{asset:'wall',variant:'city-structure',width:250,depth:40,drawWidth:260,drawHeight:130,anchorX:130,anchorY:806/887*130-20},
    'city-sample:foliage:west':{asset:'foliage',variant:'city-detail',width:44,depth:16,height:32,drawWidth:48,drawHeight:44,anchorX:24,anchorY:39},
    'city-sample:foliage:east':{asset:'foliage',variant:'city-detail',width:44,depth:16,height:32,drawWidth:48,drawHeight:44,anchorX:24,anchorY:39},
    'city-sample:foliage:west-front':{asset:'foliage',variant:'city-detail',width:44,depth:16,height:32,drawWidth:48,drawHeight:44,anchorX:24,anchorY:39},
    'city-sample:foliage:east-front':{asset:'foliage',variant:'city-detail',width:44,depth:16,height:32,drawWidth:48,drawHeight:44,anchorX:24,anchorY:39},
    'city-sample:house:west':{asset:'house',variant:'city-detail',width:210,depth:100,height:160,drawWidth:264,drawHeight:264,anchorX:636/1254*264,anchorY:1186/1254*264-50},
    'city-sample:house:east':{asset:'house',variant:'city-detail',width:210,depth:100,height:160,drawWidth:264,drawHeight:264,anchorX:636/1254*264,anchorY:1186/1254*264-50}
  }
});
const assetEntries=Object.entries(CITY_DETAIL_MANIFEST.assets),LIMIT_BYTES=32*1024*1024;
function selected(prop){
  if(!prop||prop.region!==CITY_DETAIL_MANIFEST.worldId)return null;
  const spec=CITY_DETAIL_MANIFEST.props[prop.id];
  return spec&&prop.variant===spec.variant&&prop.width===spec.width&&prop.depth===spec.depth&&Number.isFinite(prop.x)&&Number.isFinite(prop.y)?spec:null;
}

export function cityDetailVisual(prop){
  const spec=selected(prop);if(!spec)return null;
  const left=-spec.anchorX,right=spec.drawWidth-spec.anchorX,top=spec.anchorY,bottom=spec.drawHeight-spec.anchorY;
  const halfWidth=Math.max(-left,right),height=prop.height??spec.height??0;
  return{halfWidth,top,bottom,canopyX:(left+right)/2,canopyY:(bottom-top)/2,canopyRx:(right-left)/2,canopyRy:(bottom+top)/2,
    shadowWidth:prop.width*.43,shadowLength:height*.42+prop.depth*.15,shadowOffset:prop.depth*.25,
    maxBounds:{minX:prop.x+left,minY:prop.y-top,maxX:prop.x+right,maxY:prop.y+bottom},sortY:prop.sortY??prop.y+prop.depth/2};
}

function loadNativeImage(url){
  if(typeof globalThis.Image!=='function')return Promise.reject(new Error('City detail artwork requires an Image loader.'));
  return new Promise((resolve,reject)=>{
    const image=new globalThis.Image();image.decoding='async';
    const done=(error)=>{image.onload=null;image.onerror=null;if(error)reject(error);else resolve(image);};
    image.onload=()=>done();image.onerror=()=>done(new Error(`Failed to load city detail artwork: ${url}`));image.src=url;
  });
}
function makeMaskCanvas(){return typeof globalThis.document?.createElement==='function'?globalThis.document.createElement('canvas'):null;}

export class CityDetailArt{
  constructor({loadImage=loadNativeImage,makeCanvas=makeMaskCanvas}={}){
    this.loadImage=loadImage;this.makeCanvas=makeCanvas;this.images=new Map();this._loading=null;this._decodes=0;this._failures=0;this._draws=0;this._drawCounts=new Map();this._lastOpacity=new Map();this._sizes=new Map();this._masks=new Map();this._maskBuilds=0;this._maskReads=0;
  }
  get ready(){return this.images.size===assetEntries.length;}
  get cacheStats(){
    const pixels=[...this._sizes.values()].reduce((sum,size)=>sum+size.width*size.height,0);
    const maskBytes=[...this._masks.values()].reduce((sum,mask)=>sum+mask.alpha.byteLength,0);
    return{ready:this.ready,loading:!!this._loading,entries:this.images.size,pixels,imageBytes:pixels*4,maskBytes,bytes:pixels*4+maskBytes,limitBytes:LIMIT_BYTES,draws:this._draws,drawCounts:Object.fromEntries(this._drawCounts),lastAppliedOpacity:Object.fromEntries(this._lastOpacity),decodes:this._decodes,failures:this._failures,maskBuilds:this._maskBuilds,maskPixelReads:this._maskReads,decodeNaturalSizes:Object.fromEntries([...this._sizes].map(([key,value])=>[key,{...value}]))};
  }
  _buildMask(key,image){
    const spec=Object.values(CITY_DETAIL_MANIFEST.props).find(prop=>prop.asset===key);if(!spec)return null;
    const canvas=this.makeCanvas?.();if(!canvas)return null;
    const width=Math.ceil(spec.drawWidth),height=Math.ceil(spec.drawHeight);canvas.width=width;canvas.height=height;
    try{
      const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,width,height);
      const rgba=c.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);
      for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      this._maskBuilds++;this._maskReads++;return{width,height,alpha};
    }finally{
      // Retain only the compact one-byte mask; release the temporary RGBA
      // canvas instead of keeping another full-size image copy for gameplay.
      canvas.width=0;canvas.height=0;
    }
  }
  _coversPlayer(spec,prop,player,standingY){
    const mask=this._masks.get(spec.asset);if(!mask||!Number.isFinite(player?.x)||!Number.isFinite(player?.y))return true;
    const footY=Number.isFinite(standingY)?standingY:player.y+(Number.isFinite(player.groundOffset)?player.groundOffset:19.8),left=prop.x-spec.anchorX,top=prop.y-spec.anchorY;
    for(const dx of[-10,0,10])for(const dy of[-44,-28,-12]){
      const x=Math.floor((player.x+dx-left)/spec.drawWidth*mask.width),y=Math.floor((footY+dy-top)/spec.drawHeight*mask.height);
      if(x>=0&&y>=0&&x<mask.width&&y<mask.height&&mask.alpha[y*mask.width+x]>32)return true;
    }return false;
  }
  preload(){
    if(this.ready)return Promise.resolve(this);
    if(this._loading)return this._loading;
    const attempt=(async()=>{
      const pending=assetEntries.filter(([key])=>!this.images.has(key));
      const results=await Promise.allSettled(pending.map(async([key,spec])=>{
        const image=await this.loadImage(new URL(spec.path,import.meta.url).href,key,spec);
        if(typeof image?.decode==='function')await image.decode();
        const width=image?.naturalWidth??image?.width,height=image?.naturalHeight??image?.height;
        if(width!==spec.width||height!==spec.height)throw new Error(`City detail ${key} size mismatch: ${width}x${height}; expected ${spec.width}x${spec.height}.`);
        const mask=this._buildMask(key,image);if(mask)this._masks.set(key,mask);
        this.images.set(key,image);this._sizes.set(key,{width,height});this._decodes++;
      }));
      const errors=results.flatMap((result,i)=>result.status==='rejected'?[new Error(`City detail ${pending[i][0]} is not ready.`,{cause:result.reason})]:[]);
      if(errors.length)throw new AggregateError(errors,'City detail artwork failed to load; retry is available.');
      return this;
    })();
    this._loading=attempt;
    attempt.then(()=>{this._loading=null;},()=>{this._loading=null;this._failures++;});
    return attempt;
  }
  getImage(key){return this.images.get(key)??null;}
  drawProp(c,prop,{canopyAlpha=1,player=null,footY}={}){
    const spec=selected(prop);if(!spec)return false;
    const image=this.images.get(spec.asset);if(!image)throw new Error(`City detail ${spec.asset} must be preloaded before the scene starts.`);
    const requested=Math.max(0,Math.min(1,Number.isFinite(canopyAlpha)?canopyAlpha:1)),opacity=player&&requested<1&&!this._coversPlayer(spec,prop,player,footY)?1:requested;
    c.save();try{
      c.globalAlpha*=opacity;
      c.drawImage(image,prop.x-spec.anchorX,prop.y-spec.anchorY,spec.drawWidth,spec.drawHeight);
    }finally{c.restore();}
    this._draws++;this._drawCounts.set(prop.id,(this._drawCounts.get(prop.id)??0)+1);this._lastOpacity.set(prop.id,opacity);return true;
  }
}

export const cityDetailArt=new CityDetailArt();
