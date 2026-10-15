import assert from 'node:assert/strict';
import { SceneryArt } from './dist/scenery-art.js';
import { RiftArt } from './dist/worlds/rift-art.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';

function context(){
  const state={globalAlpha:.72},stack=[],geometry=[],colors=[],images=[],filters=[];
  const c=new Proxy(state,{
    set(target,key,value){if((key==='fillStyle'||key==='strokeStyle')&&typeof value==='string')colors.push(value);if(key==='filter')filters.push(value);target[key]=value;return true;},
    get(target,key){
      if(key in target)return target[key];
      if(key==='save')return()=>stack.push({...target});
      if(key==='restore')return()=>{assert(stack.length,'context state must balance');const previous=stack.pop();for(const key of Object.keys(target))delete target[key];Object.assign(target,previous);};
      if(key==='drawImage')return(...args)=>images.push(args);
      if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{geometry.push([key,...args]);return {addColorStop(position,color){colors.push(color);}};};
      return(...args)=>{for(const value of args)if(typeof value==='number')assert(Number.isFinite(value));geometry.push([key,...args]);};
    }
  });
  return {c,stack,geometry,colors,images,filters};
}
const factory=()=>{const recording=context();return {width:0,height:0,recording,getContext:()=>recording.c};};
const art=new SceneryArt(factory),target=context(),prop=Object.freeze({type:'tree',x:130,y:150,treeForm:0,scale:.85,r:15,seed:.34});
art.drawTree(target.c,prop,.35);
const [trunk,normalCrown]=target.images.slice(-2).map(([canvas])=>canvas),normalGeometry=structuredClone(normalCrown.recording.geometry);
art.drawTree(target.c,{...prop,riftPalette:true},.35);
const [sameTrunk,filteredCrown]=target.images.slice(-2).map(([canvas])=>canvas),greenCrown=filteredCrown.recording.images[0][0];
assert.equal(trunk,sameTrunk,'a palette change does not recolor or rebuild the trunk');
assert.notEqual(normalCrown,greenCrown,'regular and authored crowns cannot share a tinted cache entry');
assert.deepEqual(greenCrown.recording.geometry,normalGeometry,'palette A preserves all crown outlines, leaf geometry and texture positions');
assert(normalCrown.recording.colors.includes('#365c39'),'the regular world retains its original green midtone');
assert(!normalCrown.recording.colors.includes('#456d43'),'the authored palette cannot leak into legacy crowns');
assert(greenCrown.recording.colors.includes('#456d43'),'the authored world uses the approved brighter midtone');
assert(greenCrown.recording.colors.includes('#1b3d2b65'),'leaf mass self-shade retains its alpha');
assert(filteredCrown.recording.filters.includes('saturate(.7) brightness(1.16)'),'the existing authored crown filter is unchanged');
art.drawTree(target.c,prop,.35);assert.equal(target.images.at(-1)[0],normalCrown,'returning from an authored world reuses the original unmodified sprite');
const shrub={...prop,riftShrub:true};
art.drawTree(target.c,shrub,.35);const normalShrub=target.images.at(-1)[0];
art.drawTree(target.c,{...shrub,riftPalette:true},.35);const greenShrub=target.images.at(-1)[0];
assert.notEqual(normalShrub,greenShrub);assert.deepEqual(normalShrub.recording.geometry,greenShrub.recording.geometry,'low plant footprints and frond paths do not change');
assert(normalShrub.recording.colors.includes('#45613b'));assert(greenShrub.recording.colors.includes('#527246'));
art.drawTree(target.c,shrub,.35);assert.equal(target.images.at(-1)[0],normalShrub);
const warmed=art.cacheStats.builds;
for(let i=0;i<30;i++)for(const riftPalette of [false,true]){art.drawTree(target.c,{...prop,riftPalette},.35);art.drawTree(target.c,{...shrub,riftPalette},.35);}
assert.equal(art.cacheStats.builds,warmed,'alternating palettes warm independently without rebuilding sprites');
assert(art.cacheStats.bytes<=art.cacheStats.limitBytes);assert.equal(target.c.globalAlpha,.72);assert.equal(target.stack.length,0);

// Reusing the original area's numeric ID in a new world must not turn a grove
// into rocks; explicit material can still dress a wooded area as a quarry.
function backgroundMaterials({id='new-world',kind='grove',material,areaId='09'}={}){
  const source=createRiftLayout(),layout={...source,id,areas:source.areas.map(area=>({...area,id:areaId,kind,...(material?{material}:{})}))};
  const calls={rock:0,deepRock:0,canopy:0,shrub:0},art=new RiftArt(factory);
  art.scenery={drawRock(c,prop){calls.rock++;if(prop.r>=36)calls.deepRock++;},drawCanopy(){calls.canopy++;},drawShrub(){calls.shrub++;}};
  art.drawGround(context().c,{region:'forest',layout},{camX:-2700,camY:870,width:540,height:450});
  return calls;
}
const grove=backgroundMaterials(),rock=backgroundMaterials({kind:'quarry'}),override=backgroundMaterials({kind:'grove',material:'rock'}),forest=backgroundMaterials({kind:'quarry',material:'forest'});
assert.equal(grove.rock,0,'a new grove named 09 stays a forest');assert(grove.canopy>0);
assert(rock.rock>0);assert(override.rock>0,'explicit rock material overrides the semantic area kind');assert.equal(forest.rock,0);
const originalRock=backgroundMaterials({id:'rift-forest:1',areaId:'09'}),originalRavine=backgroundMaterials({id:'rift-forest:1',areaId:'10',kind:'ravine'});
assert(originalRock.rock>0,'the original map keeps its hand-authored rocky grove');assert.equal(originalRavine.deepRock,0,'the original deep ravine keeps its original forest backdrop');
console.log('Scenery palette QA passed: approved authored colors, unchanged legacy colors/geometry/alpha, isolated warm caches, bounded memory and semantic new-world materials.');
