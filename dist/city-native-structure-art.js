import { CITY_ART_SPRITES } from './city-art-manifest.js';

// Native artwork is a view of the existing authored foundations. It neither
// adds obstacles nor paints clipped fragments of a building on the floor.
const WORLD='clockshadow-city';
export const CITY_NATIVE_PRESERVED_IDS=Object.freeze(['gate:castle-main','castle:南墙西:0:2','castle:南墙东:0:0']);
const preserved=new Set(CITY_NATIVE_PRESERVED_IDS);
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const aliases={church:['church','cathedral'],wallVertical:['wall-vertical','vertical-wall','wall-ns'],ruin:['ruin','ruin-arch'],shrub:['shrub','flower-shrub'],rubble:['rubble','moss-rubble']};
function spriteKey(key,sprites){const match=(aliases[key]||[key]).find(name=>sprites[name]);if(!match)throw new Error(`Missing city sprite metadata: ${key}`);return match;}
function spriteMeta(key,sprites){const meta=sprites[key];if(!meta)throw new Error(`Missing city sprite metadata: ${key}`);return meta;}

export const CITY_NATIVE_LANDMARKS=freeze({
  'infill:08:5:3':{sprite:'belltower',height:180},
  'infill:13:3:2':{sprite:'fountain',height:80},
  'block:13:1:1':{sprite:'statue',height:140}
});

function layerFor(key,foot,sprites){
  const meta=spriteMeta(key,sprites),sw=finite(meta.sw,meta.width),sh=finite(meta.sh,meta.height),fpWidth=finite(meta.footprintWidth,sw),fpDepth=finite(meta.footprintDepth,0);
  if(!(sw>0&&sh>0&&fpWidth>0))throw new Error(`Invalid city source footprint: ${key}`);
  let drawWidth=sw*foot.width/fpWidth;const factor=finite(meta.projectionHeightFactor,1.5);
  // The target depth belongs to the ground plane. Extra height projects north;
  // cap the image scale so its measured physical foot never exceeds that plane.
  const desired=foot.depth+foot.height*factor,drawHeight=fpDepth>0?Math.min(desired,foot.depth*sh/fpDepth):desired;
  if(['oak','cypress','apple'].includes(key))drawWidth=Math.min(drawWidth,drawHeight*sw/sh);
  const anchorX=finite(meta.footX,sw/2)/sw*drawWidth,anchorY=finite(meta.footY,sh)/sh*drawHeight-foot.depth/2;
  return{sprite:key,drawWidth,drawHeight,anchorX,anchorY,footprintWidth:drawWidth/sw*fpWidth,footprintDepth:foot.depth,offsetX:finite(foot.offsetX,0),offsetY:finite(foot.offsetY,0)};
}
function rectangle(prop,layer){return{x:prop.x+layer.offsetX-layer.anchorX,y:prop.y+layer.offsetY-layer.anchorY,width:layer.drawWidth,height:layer.drawHeight};}
function boundsOf(layers){
  return layers.reduce((b,l)=>({minX:Math.min(b.minX,l.offsetX-l.anchorX),minY:Math.min(b.minY,l.offsetY-l.anchorY),maxX:Math.max(b.maxX,l.offsetX-l.anchorX+l.drawWidth),maxY:Math.max(b.maxY,l.offsetY-l.anchorY+l.drawHeight)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
}
function ordinaryKey(prop){
  const mainKeep=prop.cityKind==='keep'&&prop.width===700&&prop.depth===400;
  if(typeof prop.cityArt==='string')return prop.cityArt==='keep'&&!mainKeep?'house':prop.cityArt;
  if(prop.id.startsWith('gate-pier:'))return prop.depth>prop.width?'wallVertical':'wall';
  const special=CITY_NATIVE_LANDMARKS[prop.id];if(special)return special.sprite;
  if(prop.cityKind==='wall')return prop.depth>prop.width?'wallVertical':'wall';
  if(prop.cityKind==='cathedral')return prop.id.endsWith('-tower')?'belltower':'church';
  if(prop.cityKind==='keep')return mainKeep?'keep':'house';
  if(['house','warehouse','stable','workshop','school','wing','barracks'].includes(prop.cityKind))return'house';
  if(prop.cityKind==='tower')return'tower';
  if(prop.cityKind==='planter')return'shrub';
  return prop.cityKind;
}
function wallIvy(prop,sprites){
  if(!['wall','warehouse','ruin'].includes(prop.cityKind)||prop.width<100||prop.depth<40)return null;
  let seed=2166136261;for(const char of`${prop.id}:${prop.style??0}`)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
  if(seed%3)return null;
  const width=35+seed%16,key=spriteKey('ivy',sprites),layer=layerFor(key,{width,depth:12,height:40},sprites),front=prop.depth/2;
  // Ivy is attached near the upper-middle facade; its lower leaves remain
  // above the original ground contact. It is never another rooted obstacle.
  const attachmentInImage=layer.drawHeight*.05,attachmentY=Math.min(front-prop.height*.67,front-(layer.drawHeight-attachmentInImage)-3);
  return{...layer,offsetX:(seed&1?-1:1)*(prop.width/2-width/2-8),offsetY:attachmentY-attachmentInImage+layer.anchorY,wallAttachment:true,attachmentY};
}
function nativeCarrier(prop,canonicalIds,sprites){
  const key=spriteKey(ordinaryKey(prop),sprites),override=CITY_NATIVE_LANDMARKS[prop.id];
  const height=override?.height??(prop.cityKind==='cathedral'&&(prop.id==='cathedral:nave-east'||prop.id.endsWith('-tower'))?240:prop.height);
  const foot={width:prop.width,depth:prop.depth,height},layers=[];
  if(prop.cityKind==='planter'){
    layers.push(layerFor(spriteKey('rubble',sprites),{...foot,height:28},sprites));
    layers.push(layerFor(key,{...foot,width:prop.width*.94,depth:prop.depth*.8,height:Math.max(45,height)},sprites));
  }else if(prop.cityKind==='barracks'&&prop.width>300&&key==='house'){
    // Two complete square-source buildings make a long barracks. Stretching
    // the broad main-keep artwork into these narrow feet distorts its towers.
    const halfWidth=(prop.width-2)/2,offset=(halfWidth+2)/2;
    for(const side of[-1,1])layers.push(layerFor(key,{...foot,width:halfWidth,offsetX:side*offset},sprites));
  }else{
    layers.push(layerFor(key,foot,sprites));
    if(prop.cityKind==='ruin'&&!override){
      const rubbleDepth=Math.min(prop.depth*.55,62);
      layers.push(layerFor(spriteKey('rubble',sprites),{width:prop.width,depth:rubbleDepth,height:Math.max(38,height*.65),offsetY:(prop.depth-rubbleDepth)/2},sprites));
    }
  }
  const ivy=wallIvy(prop,sprites);if(ivy)layers.push(ivy);
  const width=prop.width,depth=prop.depth,long=Math.max(width,depth),short=Math.min(width,depth),square=width===depth;
  return freeze({id:`city-native:${prop.id}`,sourceId:prop.id,canonicalIds:[...canonicalIds],cityKind:override?.sprite??prop.cityKind,
    region:WORLD,variant:'city-native',type:square?'rock':'log',x:prop.x,y:prop.y,width,depth,height,
    r:short/2,halfLength:square?0:(long-short)/2,angle:depth>width?Math.PI/2:0,scale:1,seed:0,
    collision:false,heightBand:'high',sortY:prop.y+depth/2,area:prop.area,
    cityArt:{sprite:key,layers,bounds:boundsOf(layers)}});
}
function merge(parts,id,kind){
  const minX=Math.min(...parts.map(p=>p.x-p.width/2)),maxX=Math.max(...parts.map(p=>p.x+p.width/2)),minY=Math.min(...parts.map(p=>p.y-p.depth/2)),maxY=Math.max(...parts.map(p=>p.y+p.depth/2));
  const area=parts.reduce((sum,p)=>sum+p.width*p.depth,0);
  if(Math.abs(area-(maxX-minX)*(maxY-minY))>.001)throw new Error(`City assembly ${id} cannot cover a gap in its original foundations.`);
  return{id,cityKind:kind,x:(minX+maxX)/2,y:(minY+maxY)/2,width:maxX-minX,depth:maxY-minY,height:Math.max(...parts.map(p=>p.height)),area:parts[0].area,style:0};
}

export function createNativeCityProps(layout,{sprites=CITY_ART_SPRITES}={}){
  if(layout?.worldId!==WORLD||layout.artTheme!=='city')return Object.freeze([]);
  const originals=layout.cityStructures||[],consumed=new Set(),props=[];
  for(const [prefix,id,kind,expected]of[
    ['castle:主堡:','castle:主堡','keep',4],['castle:西翼:','castle:西翼','wing',2],['castle:东翼:','castle:东翼','wing',2]
  ]){
    const pieces=originals.filter(p=>p.id.startsWith(prefix));if(!pieces.length)continue;
    if(pieces.length!==expected)throw new Error(`City assembly ${id} expects ${expected} original modules.`);
    pieces.forEach(p=>consumed.add(p.id));props.push(nativeCarrier(merge(pieces,id,kind),pieces.map(p=>p.id),sprites));
  }
  for(const prop of originals){
    if(consumed.has(prop.id)||preserved.has(prop.id)||prop.cityKind==='gate')continue;
    props.push(nativeCarrier(prop,[prop.id],sprites));
  }
  return Object.freeze(props);
}

export function decorateNativeCityProp(prop,{sprites=CITY_ART_SPRITES}={}){
  if(prop?.variant!=='city-native'||prop.region!==WORLD||typeof prop.cityArt!=='string')return prop;
  const normalized={...prop,cityKind:prop.cityKind??prop.cityArt,height:finite(prop.height,finite(prop.treeHeight,80))};
  if(!(normalized.width>0&&normalized.depth>0))throw new Error(`City native decoration ${prop.id} needs a real footprint.`);
  const derived=nativeCarrier(normalized,prop.canonicalIds??[],sprites);
  // Placement modules own their IDs, indexing shape, depth and area tags. Only
  // the complete source-based visual plan is added here.
  return freeze({...derived,...prop,cityArt:derived.cityArt,sourceId:prop.sourceId??prop.id});
}

export function createNativeCityBridgeProps(layout,{sprites=CITY_ART_SPRITES}={}){
  if(layout?.worldId!==WORLD)return Object.freeze([]);
  const props=[];
  for(const passage of layout.passages??[]){
    if(passage.kind!=='bridge'||passage.deck?.length!==2)continue;
    const [a,b]=passage.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(!length||Math.abs(dx)>.01&&Math.abs(dy)>.01)continue;
    const horizontal=Math.abs(dx)>=Math.abs(dy),width=passage.width||250,count=Math.ceil(length/250),pieceLength=length/count;
    for(const side of[-1,1])for(let i=0;i<count;i++){
      const across=side*(width/2-3),x=a.x+dx*(i+.5)/count-dy/length*across,y=a.y+dy*(i+.5)/count+dx/length*across;
      const prop=nativeCarrier({id:`bridge:${passage.id}:${side}:${i}`,cityKind:'wall',cityArt:horizontal?'wall':'wallVertical',x,y,width:horizontal?pieceLength:12,depth:horizontal?12:pieceLength,height:22,area:passage.from},[],sprites);
      props.push(freeze({...prop,heightBand:'low',bridgeId:passage.id,bridgeSide:side}));
    }
  }return Object.freeze(props);
}

export function nativeCityVisual(prop){
  if(prop?.variant!=='city-native'||prop.region!==WORLD||!prop.cityArt?.bounds)return null;
  const b=prop.cityArt.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY,tree=['oak','cypress','apple'].includes(prop.cityArt.sprite);
  return{halfWidth:Math.max(-b.minX,b.maxX),top:-b.minY,bottom:b.maxY,canopyX:(b.minX+b.maxX)/2,canopyY:(b.minY+b.maxY)/2,canopyRx:w/2,canopyRy:h/2,
    shadowWidth:tree?w*.35:prop.width*.46,shadowLength:tree?h*.3:Math.max(prop.height*.45,h*.27),shadowOffset:prop.depth*(tree?.1:.25),
    maxBounds:{minX:prop.x+b.minX,minY:prop.y+b.minY,maxX:prop.x+b.maxX,maxY:prop.y+b.maxY},sortY:prop.sortY};
}

export class CityNativeStructureArt{
  constructor({library}={}){this.library=library;this.draws=0;this.layerDraws=0;this.counts=new Map();this.lastOpacity=new Map();}
  get cacheStats(){return{draws:this.draws,layerDraws:this.layerDraws,drawCounts:Object.fromEntries(this.counts),lastAppliedOpacity:Object.fromEntries(this.lastOpacity),ownImageBytes:0,ownMaskBytes:0};}
  drawProp(c,prop,{canopyAlpha=1,player=null,footY}={}){
    if(!nativeCityVisual(prop))return false;
    if(!this.library?.draw)throw new Error('City native artwork requires the shared preloaded city library.');
    const layers=prop.cityArt.layers,requested=Math.max(0,Math.min(1,finite(canopyAlpha,1)));
    const opaque=!player||!this.library.coversPlayer||layers.some(layer=>this.library.coversPlayer(layer.sprite,rectangle(prop,layer),player,footY));
    const alpha=opaque?requested:1;
    c.save();try{for(const layer of layers){const result=this.library.draw(c,layer.sprite,rectangle(prop,layer),{alpha});if(result===false)throw new Error(`Native city sprite ${layer.sprite} is not loaded.`);}}finally{c.restore();}
    this.draws++;this.layerDraws+=layers.length;this.counts.set(prop.sourceId,(this.counts.get(prop.sourceId)||0)+1);this.lastOpacity.set(prop.sourceId,alpha);return true;
  }
}

// Bridges retain their existing full-width stone deck and collision. Only the
// narrow raised balustrades use complete wall sprites; nothing fills the route.
export function drawNativeCityBridge(c,passage,{library,sprites=CITY_ART_SPRITES,overview=false}={}){
  if(overview||!library?.draw||passage.deck?.length!==2)return false;
  const [a,b]=passage.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return false;
  if(Math.abs(dy)>.01)return false; // Current city bridge decks are east/west.
  const width=passage.width||250,count=Math.ceil(length/250),pieceLength=length/count;
  const key=spriteKey('wall',sprites);
  c.save();try{for(const side of[-1,1])for(let i=0;i<count;i++){
    const x=a.x+dx*(i+.5)/count,y=a.y+side*(width/2-7),foot={width:pieceLength,depth:12,height:22},layer=layerFor(key,foot,sprites);
    library.draw(c,key,rectangle({x,y},layer),{alpha:1});
  }}finally{c.restore();}return true;
}
