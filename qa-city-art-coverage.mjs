import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { createCityScenery } from './dist/worlds/city-scenery.js';
import { CityNativeStructureArt } from './dist/city-native-structure-art.js';
import { drawNativeCityLandmark, drawNativeCitySettlement } from './dist/city-native-landmark-art.js';
import { SceneryArt } from './dist/scenery-art.js';

const layout=createRiftLayout('clockshadow-city'),layoutBefore=JSON.stringify(layout),worldIdsBefore=[...WORLD_IDS];
const game=new Game({mode:'world',worldId:'clockshadow-city'}),terrain=game.terrain;
assert.equal(game.worldId,layout.worldId);assert.equal(game.mapId,WORLD_IDS.indexOf(layout.worldId));
assert.equal(layout.artStyle,'clockshadow-renewed');assert.equal(layout.areas.length,19);
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
const raw=createCityScenery(layout,terrain.rift,terrain.island);
assert.equal(new Set(raw.map(p=>p.id)).size,raw.length,'each terrain artwork record has one unique render identity');
assert.equal(createCityScenery(layout,terrain.rift,terrain.island),raw,'scene assembly is cached instead of rebuilt during frame queries');
const indexed=terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY),byId=new Map(indexed.map(p=>[p.id,p]));
for(const p of raw)assert(byId.has(p.id),`${p.id}: actual Terrain indexes the complete scene`);
const props=raw.map(p=>byId.get(p.id)),native=props.filter(p=>p.variant==='city-native'),visible=props.filter(p=>p.visual!==false);
assert(native.length>=layout.cityStructures.length,'the actual Terrain contains every architectural render carrier');
assert(props.every(p=>p.collision===false),'scene carriers leave the authored collision union authoritative');
assert(props.every(p=>p.variant!=='city-detail'),'the rebuilt scene does not retain old isolated PNG sample art');
const vegetation=visible.filter(p=>p.cityGreen);
assert(vegetation.some(p=>p.type==='tree'&&!p.riftShrub)&&vegetation.some(p=>p.riftShrub)&&vegetation.some(p=>p.type==='rock'),'the city has complete tree, low growth and stone layers');
assert(vegetation.every(p=>p.variant!=='city-native'&&p.riftPalette),'natural city borders reuse the accepted forest scenery and palette');

// Canonical records own the engineering footprint. Each has one raised view;
// a visible decorative duplicate must not hide a gap or a second footprint.
const originals=new Map(layout.cityStructures.map(p=>[p.id,p])),owners=new Map([...originals.keys()].map(id=>[id,[]]));
const canonical=props.filter(p=>originals.has(p.id));assert.equal(canonical.length,originals.size);
for(const p of canonical){
  const source=originals.get(p.id);for(const key of ['x','y','width','depth','height','cityKind','style'])assert.equal(p[key],source[key],`${p.id}: canonical ${key} is preserved`);
  assert.equal(p.visual,false,`${p.id}: the engineering carrier does not draw a second building`);
}
for(const p of native)for(const id of p.canonicalIds){assert(owners.has(id),`${id}: native ownership refers to an actual canonical foundation`);owners.get(id).push(p);}
let foundationSamples=0;
for(const [id,source]of originals){
  assert.equal(owners.get(id).length,1,`${id}: canonical architecture is rendered exactly once`);
  const owner=owners.get(id)[0];
  assert.deepEqual(owner.canonicalIds,[id],`${id}: a complete building keeps its own foundation identity`);
  for(const key of ['x','y','width','depth'])assert.equal(owner[key],source[key],`${id}: the visible footing covers the actual ${key}`);
  if(source.solid!==false)for(const dx of[-.49,0,.49])for(const dy of[-.49,0,.49])for(const mask of[terrain.rift.ground,terrain.rift.high]){
    assert(!mask.inside(owner.x+owner.width*dx,owner.y+owner.depth*dy),`${id}: solid artwork cannot stand on traversable ground`);foundationSamples++;
  }
}
assert(foundationSamples>0,'collision and artwork are checked together');

const overlaps=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const bbox=points=>({minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))});
const visualBounds=p=>p.visual.maxBounds??{minX:p.x-p.visual.halfWidth,minY:p.y-p.visual.top,maxX:p.x+p.visual.halfWidth,maxY:p.y+p.visual.bottom};
const VIEW_WIDTH=540,VIEW_HEIGHT=720,QUERY_PAD=320,EPS=.01;
let cullingQueries=0,maxProjectionReach=0,tallestProjection=null;
for(const p of visible){
  assert(p.visual,`${p.id}: visible records provide measured projection geometry`);
  const b=visualBounds(p),f=p.bounds;
  assert(Object.values(b).every(Number.isFinite)&&b.maxX>b.minX&&b.maxY>b.minY,`${p.id}: finite, nonempty image bounds`);
  for(const key of ['halfWidth','top','bottom','shadowWidth','shadowLength'])assert(Number.isFinite(p.visual[key]),`${p.id}: finite ${key}`);
  if(p.variant==='city-native'||p.type==='tree')for(const key of ['canopyX','canopyY','canopyRx','canopyRy'])assert(Number.isFinite(p.visual[key]),`${p.id}: finite ${key}`);
  const reach=Math.max(0,f.minX-b.minX,b.maxX-f.maxX,f.minY-b.minY,b.maxY-f.maxY);
  if(reach>maxProjectionReach){maxProjectionReach=reach;tallestProjection=p.id;}
  // Any viewport meeting this image also meets its indexed foot within the
  // shipped query padding. Check the boundary viewpoints in the real index.
  assert(reach<=QUERY_PAD,`${p.id}: visible roof or crown exceeds the real terrain query reach`);
  const centersX=[b.minX-VIEW_WIDTH/2+EPS,(b.minX+b.maxX)/2,b.maxX+VIEW_WIDTH/2-EPS];
  const centersY=[b.minY-VIEW_HEIGHT/2+EPS,(b.minY+b.maxY)/2,b.maxY+VIEW_HEIGHT/2-EPS];
  for(const x of centersX)for(const y of centersY){
    const view={minX:x-VIEW_WIDTH/2,minY:y-VIEW_HEIGHT/2,maxX:x+VIEW_WIDTH/2,maxY:y+VIEW_HEIGHT/2};assert(overlaps(b,view));
    const query=terrain.query(view.minX-QUERY_PAD,view.minY-QUERY_PAD,view.maxX+QUERY_PAD,view.maxY+QUERY_PAD);
    assert(query.some(q=>q.id===p.id),`${p.id}: its roof or crown does not disappear with the root offscreen`);cullingQueries++;
  }
}
const streetAreas=new Set(['03','04','05','06','07','09','11','12','15']);
const architecturalKinds=new Set(['house','keep','wing','barracks','warehouse','stable','workshop','school','cathedral','tower','belltower','wall','gate','arcade','market','ruin']);
function standingNear(area){
  for(let radius=0;radius<=240;radius+=20)for(let i=0;i<24;i++){
    const x=area.center.x+Math.cos(i*Math.PI/12)*radius,y=area.center.y+Math.sin(i*Math.PI/12)*radius;
    if(terrain.isFree(x,y,game.player.r))return{x,y};
  }
  assert.fail(`${area.id}: its central street has no ordinary full-body standing point`);
}
const visibleArea=(a,b)=>Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX))*Math.max(0,Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY));
const areas=layout.areas.map(area=>{
  const bounds=bbox(area.points),query=terrain.query(bounds.minX-QUERY_PAD,bounds.minY-QUERY_PAD,bounds.maxX+QUERY_PAD,bounds.maxY+QUERY_PAD);
  const artwork=query.filter(p=>p.visual&&overlaps(visualBounds(p),bounds));
  assert(artwork.length,`${area.id}: the actual exploration district has raised artwork`);
  const standing=standingNear(area),centerView={minX:standing.x-VIEW_WIDTH/2,minY:standing.y-19.8-VIEW_HEIGHT/2,maxX:standing.x+VIEW_WIDTH/2,maxY:standing.y-19.8+VIEW_HEIGHT/2};
  const inView=visible.filter(p=>overlaps(visualBounds(p),centerView));
  const boundaries=inView.filter(p=>(architecturalKinds.has(p.cityKind)||p.type==='tree'&&!p.riftShrub||p.type==='rock'&&p.r>=24)&&visibleArea(visualBounds(p),centerView)>=1600);
  // A map-wide prop count used to pass while an ordinary street filled the
  // entire phone view with paving. A flowerpot or one clipped leaf cannot
  // establish a street: require a substantial building/tree/stone boundary.
  if(streetAreas.has(area.id))assert(boundaries.length,`${area.id}: the standard view from a walkable street must contain a substantial spatial boundary`);
  return{id:area.id,standing,artworkIntersectingRegion:artwork.length,centerVisible:inView.length,substantialBoundaries:boundaries.length,
    kinds:[...new Set(artwork.map(p=>p.cityKind??(p.riftShrub?'shrub':p.type)))].sort()};
});

// Draw the shipped scene through real cached Canvas renderers. No atlas is
// supplied: the renewed buildings and forest scenery must stand on their own.
const operations=new Map(),canvases=[],contexts=[];
function recordingContext(){
  const state={globalAlpha:.72},stack=[];
  const c=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...target});
    if(key==='restore')return()=>{assert(stack.length,'balanced canvas state');const previous=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,previous);};
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});
    if(key==='getImageData')return(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(255),width:w,height:h});
    if(key==='measureText')return text=>({width:String(text).length*6});
    return(...args)=>{for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),`${String(key)} uses finite coordinates`);operations.set(key,(operations.get(key)||0)+1);};
  }});contexts.push({c,stack});return c;
}
const makeCanvas=()=>{const c=recordingContext(),canvas={width:0,height:0,getContext:()=>c};canvases.push(canvas);return canvas;};
const c=recordingContext(),art=new CityNativeStructureArt({makeCanvas}),scenery=new SceneryArt(makeCanvas);
for(const p of native){assert(art.drawProp(c,p));assert(art.cacheStats.bytes<=art.cacheStats.limitBytes,'the architecture cache stays bounded while crossing every district');}
for(const p of vegetation){if(p.type==='tree')scenery.drawTree(c,p);else scenery.drawRock(c,p);assert(scenery.cacheStats.bytes<=scenery.cacheStats.limitBytes,'the vegetation cache stays bounded while crossing every district');}
const focus=native.find(p=>p.cityKind==='house');assert(focus,'the inhabited districts contain complete houses');
const view={minX:focus.x-270,minY:focus.y-360,maxX:focus.x+270,maxY:focus.y+360};
const warmNative=native.filter(p=>overlaps(visualBounds(p),view));assert(warmNative.length,'an ordinary building viewport contains architectural art');
for(const p of warmNative)art.drawProp(c,p);const builds=art.cacheStats.builds;
for(let frame=0;frame<8;frame++)for(const p of warmNative)art.drawProp(c,{...p,x:p.x+frame,y:p.y-frame},{canopyAlpha:.37});
assert.equal(art.cacheStats.builds,builds,'position, camera movement and canopy fading do not rebuild warmed artwork');
const sewerSites=game.riftExploration.sites.filter(site=>site.kind==='cave');assert.equal(sewerSites.length,layout.interactions.caves.length);
for(const site of sewerSites)assert(drawNativeCityLandmark(c,{...site,type:site.kind,isRiftLandmark:true,sortY:site.y},{artStyle:layout.artStyle,painter:art.painter}),'actual cave sites receive a renewed entrance');
let nativeSettlements=0;
for(const site of game.settlements.sites)if(site.featureId==='belltower'||['supply','occupied'].includes(site.type)){
  assert(drawNativeCitySettlement(c,site,{artStyle:layout.artStyle,painter:art.painter}));nativeSettlements++;
}
assert(operations.get('drawImage')>native.length,'runtime rendering consumes prepainted local artwork');
assert(canvases.every(canvas=>canvas.width<=2048&&canvas.height<=2048),'no object allocates a world-sized backing image');
assert(contexts.every(({c,stack})=>c.globalAlpha===.72&&stack.length===0),'all real drawing paths restore caller state');
assert.equal(JSON.stringify(layout),layoutBefore,'render assembly and coverage queries cannot edit the world');
assert.deepEqual(WORLD_IDS,worldIdsBefore,'saved world identities remain unchanged');
console.log(JSON.stringify({cityArtCoverage:'passed',world:game.worldId,dimensions:[14400,10800],canonicalFoundations:originals.size,
  terrainRecords:raw.length,extraRuntimeStructures:indexed.length-raw.length,nativeCarriers:native.length,naturalScenery:vegetation.length,visibleRaisedObjects:visible.length,foundationSamples,areas,
  view:[VIEW_WIDTH,VIEW_HEIGHT],queryPad:QUERY_PAD,cullingQueries,maxProjectionReach:Math.round(maxProjectionReach*1000)/1000,tallestProjection,
  runtimeSewerEntrances:sewerSites.length,nativeSettlements,architectureCache:art.painter.cacheStats,sceneryCache:scenery.cacheStats}));
