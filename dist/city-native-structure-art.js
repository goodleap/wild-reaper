import { ClockshadowBuildingArt, clockshadowBuildingArt, clockshadowBuildingVisual } from './clockshadow-building-art.js';

const WORLD='clockshadow-city';
export const CITY_NATIVE_PRESERVED_IDS=Object.freeze([]);
export const CITY_NATIVE_LANDMARKS=Object.freeze({});
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function nativeCarrier(source){
  const {width,depth}=source,long=Math.max(width,depth),short=Math.min(width,depth),square=width===depth;
  const kind=source.cityKind||source.cityArt||'house',prop={...source,id:`city-native:${source.id}`,sourceId:source.id,canonicalIds:[source.id],cityKind:kind,
    region:WORLD,variant:'city-native',artStyle:'clockshadow-renewed',type:square?'rock':'log',r:short/2,halfLength:square?0:(long-short)/2,angle:depth>width?Math.PI/2:0,scale:1,seed:0,
    collision:false,heightBand:'high',sortY:source.y+depth/2};
  const visual=clockshadowBuildingVisual(prop);prop.cityArt={sprite:kind,style:source.style??source.area??0,layers:[],bounds:{minX:-visual.halfWidth,minY:-visual.top,maxX:visual.halfWidth,maxY:visual.bottom}};
  return freeze(prop);
}
export function createNativeCityProps(layout){
  if(layout?.worldId!==WORLD||layout.artTheme!=='city')return Object.freeze([]);
  // Each complete building is authored as one real footprint. A gate's open
  // span stays open; there is no image assembly based on legacy location IDs.
  return Object.freeze((layout.cityStructures||[]).map(nativeCarrier));
}
export function decorateNativeCityProp(prop){
  if(prop?.variant!=='city-native'||prop.region!==WORLD||typeof prop.cityArt!=='string')return prop;
  const normalized={...prop,cityKind:prop.cityArt,height:finite(prop.height,finite(prop.treeHeight,50))};
  if(!(normalized.width>0&&normalized.depth>0))throw new Error(`City decoration ${prop.id} needs a real footprint.`);
  const derived=nativeCarrier(normalized);return freeze({...derived,...prop,cityKind:derived.cityKind,artStyle:'clockshadow-renewed',cityArt:derived.cityArt,sourceId:prop.sourceId??prop.id,canonicalIds:prop.canonicalIds??[]});
}
export function createNativeCityBridgeProps(layout){
  if(layout?.worldId!==WORLD)return Object.freeze([]);const props=[];
  for(const passage of layout.passages??[]){
    if(passage.kind!=='bridge'||passage.deck?.length!==2)continue;
    const[a,b]=passage.deck,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length||Math.abs(dx)>.01&&Math.abs(dy)>.01)continue;
    const horizontal=Math.abs(dx)>=Math.abs(dy),width=passage.width||250,count=Math.ceil(length/250),pieceLength=length/count;
    for(const side of[-1,1])for(let i=0;i<count;i++){
      const across=side*(width/2-3),x=a.x+dx*(i+.5)/count-dy/length*across,y=a.y+dy*(i+.5)/count+dx/length*across;
      const prop=nativeCarrier({id:`bridge:${passage.id}:${side}:${i}`,cityKind:'wall',x,y,width:horizontal?pieceLength:12,depth:horizontal?12:pieceLength,height:22,area:passage.from,style:2});
      props.push(freeze({...prop,canonicalIds:[],heightBand:'low',bridgeId:passage.id,bridgeSide:side}));
    }
  }return Object.freeze(props);
}
export function nativeCityVisual(prop){
  if(prop?.variant!=='city-native'||prop.region!==WORLD||!prop.cityArt?.bounds)return null;return clockshadowBuildingVisual(prop);
}
export class CityNativeStructureArt{
  constructor({painter,makeCanvas}={}){this.painter=painter||(makeCanvas?new ClockshadowBuildingArt({makeCanvas}):clockshadowBuildingArt);this.draws=0;this.counts=new Map();this.lastOpacity=new Map();}
  get cacheStats(){return{...this.painter.cacheStats,draws:this.draws,layerDraws:this.draws,drawCounts:Object.fromEntries(this.counts),lastAppliedOpacity:Object.fromEntries(this.lastOpacity)};}
  drawProp(c,prop,options={}){
    if(prop?.variant!=='city-native'||prop.region!==WORLD||!prop.cityArt?.bounds)return false;const alpha=this.painter.draw(c,prop,options);this.draws++;this.counts.set(prop.sourceId,(this.counts.get(prop.sourceId)||0)+1);this.lastOpacity.set(prop.sourceId,alpha);return true;
  }
}
export function drawNativeCityBridge(c,passage,{overview=false,painter=clockshadowBuildingArt}={}){
  if(overview||passage.deck?.length!==2)return false;
  const props=createNativeCityBridgeProps({worldId:WORLD,passages:[passage]});if(!props.length)return false;for(const prop of props)painter.draw(c,prop);return true;
}
