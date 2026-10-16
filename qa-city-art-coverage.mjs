import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { createCityScenery } from './dist/worlds/city-scenery.js';
import { CITY_SAMPLE_FOLIAGE, CITY_SAMPLE_HOUSES } from './dist/worlds/city-sample-scene.js';
import { CITY_DETAIL_MANIFEST } from './dist/city-detail-art.js';
import { CITY_ART_SPRITES } from './dist/city-art-manifest.js';
import { CITY_NATIVE_PRESERVED_IDS, CityNativeStructureArt } from './dist/city-native-structure-art.js';
import { drawNativeCityLandmark, drawNativeCitySettlement } from './dist/city-native-landmark-art.js';

const layout=createRiftLayout('clockshadow-city'),layoutBefore=JSON.stringify(layout),worldIdsBefore=[...WORLD_IDS];
const game=new Game({mode:'world',worldId:'clockshadow-city'}),terrain=game.terrain;
assert.equal(game.worldId,layout.worldId);assert.equal(game.mapId,WORLD_IDS.indexOf(layout.worldId));
assert.equal(layout.areas.length,19);assert.equal(layout.cityStructures.length,377);
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
const raw=createCityScenery(layout,terrain.rift,terrain.island);
assert.equal(new Set(raw.map(p=>p.id)).size,raw.length,'each terrain artwork record has one unique render identity');
const indexed=terrain.query(layout.bounds.minX,layout.bounds.minY,layout.bounds.maxX,layout.bounds.maxY),byId=new Map(indexed.map(p=>[p.id,p]));
for(const p of raw)assert(byId.has(p.id),`${p.id}: actual Terrain indexes the complete scene`);
const props=raw.map(p=>byId.get(p.id)),native=props.filter(p=>p.variant==='city-native'),visible=props.filter(p=>p.visual!==false);
assert(native.length>2000,'complete architecture and vegetation reach the actual Terrain, not only an isolated art preview');
assert(props.every(p=>p.collision===false),'native scene carriers keep the original collision union authoritative');
assert(visible.every(p=>p.visual?.maxBounds),'every raised city object has real projection bounds');

// Original records remain the canonical engineering identities. Their legacy
// pictures are hidden when one native carrier (or an aggregate) replaces them.
const originals=new Map(layout.cityStructures.map(p=>[p.id,p])),owners=new Map([...originals.keys()].map(id=>[id,[]]));
const canonical=props.filter(p=>originals.has(p.id));assert.equal(canonical.length,originals.size);
for(const p of canonical){
  const source=originals.get(p.id);for(const key of ['x','y','width','depth','height','cityKind','style'])assert.equal(p[key],source[key],`${p.id}: canonical ${key} is preserved`);
  if(p.visual!==false)owners.get(p.id).push(p);
}
for(const p of native)for(const id of p.canonicalIds){assert(owners.has(id),`${id}: native ownership refers to an actual canonical foundation`);owners.get(id).push(p);}
const openGateIds=[];
for(const [id,source]of originals){
  if(source.cityKind==='gate'&&!CITY_NATIVE_PRESERVED_IDS.includes(id)){
    assert(owners.get(id).length<=1,'an open architectural gap cannot receive duplicate gate artwork');
    if(!owners.get(id).length)openGateIds.push(id);
  }else assert.equal(owners.get(id).length,1,`${id}: canonical architecture is rendered exactly once`);
}
const visibleCanonical=canonical.filter(p=>p.visual!==false).map(p=>p.id).sort();
assert.deepEqual(visibleCanonical,[...CITY_NATIVE_PRESERVED_IDS].sort(),'the three accepted sample architecture pieces keep their original native renderer');
for(const expected of [...CITY_SAMPLE_FOLIAGE,...CITY_SAMPLE_HOUSES]){
  const p=byId.get(expected.id);assert(p);assert.equal(p.variant,'city-detail');assert(CITY_DETAIL_MANIFEST.props[p.id]);
  for(const key of ['x','y','width','depth','height','sortY'])assert.equal(p[key],expected[key],`${p.id}: the approved sample retains its exact ${key}`);
}

const keepParts=layout.cityStructures.filter(p=>p.id.startsWith('castle:主堡:'));
assert.equal(keepParts.length,4);const keep=owners.get(keepParts[0].id)[0];
assert(keepParts.every(p=>owners.get(p.id)[0]===keep),'all four keep foundations share one complete image');
assert.equal(keep.width,700);assert.equal(keep.depth,400);assert.equal(keep.cityArt.layers.length,1);
const cathedralParts=layout.cityStructures.filter(p=>p.id.startsWith('cathedral:'));
assert.equal(cathedralParts.length,5,'the cathedral remains a five-part complex around its open court');
const cathedral=cathedralParts.map(p=>owners.get(p.id)[0]);assert.equal(new Set(cathedral).size,5);
for(const p of cathedralParts){const rendered=owners.get(p.id)[0];assert.equal(rendered.width,p.width);assert.equal(rendered.depth,p.depth);}
assert(cathedral.some(p=>p.cityArt.sprite==='church'),'the complex contains a real chapel silhouette');
assert(cathedral.some(p=>p.cityArt.sprite==='belltower'),'the flanking towers retain their own native silhouettes');

const overlaps=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const bbox=points=>({minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))});
const VIEW_WIDTH=540,VIEW_HEIGHT=720,QUERY_PAD=320,EPS=.01;
let cullingQueries=0,maxProjectionReach=0,tallestProjection=null;
for(const p of visible){
  const b=p.visual.maxBounds,f=p.bounds;
  assert(Object.values(b).every(Number.isFinite)&&b.maxX>b.minX&&b.maxY>b.minY,`${p.id}: the full source image has finite, nonempty bounds`);
  for(const key of ['halfWidth','top','bottom','canopyX','canopyY','canopyRx','canopyRy','shadowWidth','shadowLength','shadowOffset'])assert(Number.isFinite(p.visual[key]),`${p.id}: finite ${key}`);
  const reach=Math.max(0,f.minX-b.minX,b.maxX-f.maxX,f.minY-b.minY,b.maxY-f.maxY);
  if(reach>maxProjectionReach){maxProjectionReach=reach;tallestProjection=p.id;}
  // This inequality proves that *any* viewport intersecting the source AABB
  // also intersects its indexed foot within the existing 320-unit query pad.
  // Transparent source margins are included, making this conservative.
  assert(reach<=QUERY_PAD,`${p.id}: a visible roof exceeds the real city's terrain query reach`);
  const centersX=[b.minX-VIEW_WIDTH/2+EPS,(b.minX+b.maxX)/2,b.maxX+VIEW_WIDTH/2-EPS];
  const centersY=[b.minY-VIEW_HEIGHT/2+EPS,(b.minY+b.maxY)/2,b.maxY+VIEW_HEIGHT/2-EPS];
  for(const x of centersX)for(const y of centersY){
    const view={minX:x-VIEW_WIDTH/2,minY:y-VIEW_HEIGHT/2,maxX:x+VIEW_WIDTH/2,maxY:y+VIEW_HEIGHT/2};
    assert(overlaps(b,view));
    const query=terrain.query(view.minX-QUERY_PAD,view.minY-QUERY_PAD,view.maxX+QUERY_PAD,view.maxY+QUERY_PAD);
    assert(query.some(q=>q.id===p.id),`${p.id}: its visible image must not disappear when the root is offscreen`);cullingQueries++;
  }
}
const areas=layout.areas.map(area=>{
  const bounds=bbox(area.points),query=terrain.query(bounds.minX-QUERY_PAD,bounds.minY-QUERY_PAD,bounds.maxX+QUERY_PAD,bounds.maxY+QUERY_PAD);
  const artwork=query.filter(p=>p.variant==='city-native'&&p.visual!==false&&overlaps(p.visual.maxBounds,bounds));
  assert(artwork.length,`${area.id}: native city art covers the actual exploration region`);
  const centerView={minX:area.center.x-VIEW_WIDTH/2,minY:area.center.y-VIEW_HEIGHT/2,maxX:area.center.x+VIEW_WIDTH/2,maxY:area.center.y+VIEW_HEIGHT/2};
  return{id:area.id,nativeIntersectingRegion:artwork.length,centerVisible:visible.filter(p=>overlaps(p.visual.maxBounds,centerView)).length,
    sprites:[...new Set(artwork.flatMap(p=>p.cityArt.layers.map(l=>l.sprite)))].sort()};
});

// Exercise the shipped native draw API using a recording library. Image byte,
// decoding and memory checks belong to the separate asset QA. This verifies
// that manifest entries are selected by real Terrain and runtime entrances.
const used=new Set(),drawCounts=new Map(),state={globalAlpha:.72},stack=[];
const c=new Proxy(state,{get(target,key){if(key in target)return target[key];if(key==='save')return()=>stack.push({...target});if(key==='restore')return()=>{assert(stack.length);const previous=stack.pop();for(const k of Object.keys(target))delete target[k];Object.assign(target,previous);};return()=>{};}});
const library={coversPlayer(){return false;},draw(ctx,key,rect){assert(CITY_ART_SPRITES[key],`${key}: drawing uses current sprite metadata`);assert([rect.x,rect.y,rect.width,rect.height].every(Number.isFinite));assert(rect.width>0&&rect.height>0);used.add(key);drawCounts.set(key,(drawCounts.get(key)||0)+1);return true;}};
const art=new CityNativeStructureArt({library});for(const p of native)assert(art.drawProp(c,p));
const terrainSpriteKeys=[...used].sort();
const sewerSites=game.riftExploration.sites.filter(site=>site.kind==='cave');assert.equal(sewerSites.length,layout.interactions.caves.length);
for(const site of sewerSites)assert(drawNativeCityLandmark(c,{...site,type:site.kind,isRiftLandmark:true,sortY:site.y},{library}),'actual city cave sites receive their native entrance');
let nativeSettlements=0;
for(const site of game.settlements.sites)if(site.featureId==='belltower'||['supply','occupied'].includes(site.type)){
  assert(drawNativeCitySettlement(c,site,{library}));nativeSettlements++;
}
for(const key of Object.keys(CITY_ART_SPRITES))assert(used.has(key),`${key}: registered artwork must have an actual scene or interaction consumer`);
assert.equal(c.globalAlpha,.72);assert.equal(stack.length,0);
assert.equal(JSON.stringify(layout),layoutBefore,'render assembly and coverage queries cannot edit the world');
assert.deepEqual(WORLD_IDS,worldIdsBefore,'saved world identities remain unchanged');
console.log(JSON.stringify({cityArtCoverage:'passed',world:game.worldId,dimensions:[14400,10800],canonicalFoundations:originals.size,
  terrainRecords:raw.length,extraRuntimeStructures:indexed.length-raw.length,nativeCarriers:native.length,visibleRaisedObjects:visible.length,
  preservedArchitecture:visibleCanonical,keep:[keep.width,keep.depth],cathedralParts:cathedral.length,openGateIds,areas,
  view:[VIEW_WIDTH,VIEW_HEIGHT],queryPad:QUERY_PAD,cullingQueries,maxProjectionReach:Math.round(maxProjectionReach*1000)/1000,tallestProjection,
  terrainSpriteKeys,runtimeSewerEntrances:sewerSites.length,nativeSettlements,usedSpriteKeys:[...used].sort(),spriteDrawCounts:Object.fromEntries(drawCounts)}));
