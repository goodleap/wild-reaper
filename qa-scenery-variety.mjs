import assert from 'node:assert/strict';
import {Terrain,TREE_PROFILES,sceneryVisual} from './dist/terrain.js';
import {SceneryArt} from './dist/scenery-art.js';
import {RegionalArt} from './dist/regional-art.js';

const forms={forest:{trees:new Set(),rocks:new Set()},marsh:{trees:new Set(),rocks:new Set()},ruins:{trees:new Set(),rocks:new Set()}},sizes={tree:[],rock:[],log:[]};let propsChecked=0;
for(const region of ['forest','marsh','ruins'])for(let seed=0;seed<24;seed++){
  const terrain=new Terrain({region,seed,cacheLimit:24}),props=terrain.query(-1600,-1600,1600,1600);
  assert(terrain.isFree(0,0,185),'the spawning clearing stays dry of solid obstacles');
  for(const a of props){
    propsChecked++;assert(a.visual&&Object.values(a.visual).every(Number.isFinite),'every procedural prop carries finite rendering bounds');
    assert(a.visual.top<260&&a.visual.halfWidth<150,'viewport padding covers the largest silhouette');
    if(a.type==='tree'||a.variant==='pillar')forms[region].trees.add(a.treeForm);
    if(a.type==='rock'&&a.variant!=='pillar')forms[region].rocks.add(a.rockForm);
    if(region==='forest')sizes[a.type].push(a.type==='log'?a.halfLength:a.scale);
    const half=a.type==='log'?a.halfLength:0;
    for(const t of [-1,0,1]){
      const x=a.x+Math.cos(a.angle)*half*t,y=a.y+Math.sin(a.angle)*half*t;
      for(const b of props){if(b===a)continue;const q=terrain.closestPoint(b,x,y);assert(Math.hypot(x-q.x,y-q.y)>a.r+b.r+98,'large variants must preserve a boss-width route');}
    }
  }
  const compact=props.map(o=>[o.id,o.treeForm,o.rockForm,o.scale,o.r,o.halfLength,o.visual]);
  for(let i=0;i<30;i++)terrain.query(i*9000,-i*7000,i*9000+400,-i*7000+400);
  assert(terrain.cacheSize<=24);assert.deepEqual(terrain.query(-1600,-1600,1600,1600).map(o=>[o.id,o.treeForm,o.rockForm,o.scale,o.r,o.halfLength,o.visual]),compact,'eviction and visit order cannot reroll outlines or sizes');
}
for(const coverage of Object.values(forms)){assert.equal(coverage.trees.size,5);assert.equal(coverage.rocks.size,5);}
assert(Math.min(...sizes.tree)<.75&&Math.max(...sizes.tree)>1.4);assert(Math.min(...sizes.rock)<.65&&Math.max(...sizes.rock)>1.7);assert(Math.min(...sizes.log)<38&&Math.max(...sizes.log)>75);
assert(sizes.rock.filter(s=>s>1.45).length/sizes.rock.length<.15,'giant rocks remain occasional accents');
assert.equal(TREE_PROFILES.length,5);

function context(){const stack=[],calls=[];const c={globalAlpha:1};for(const name of ['beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','fill','stroke','clip','fillRect','ellipse','arc','translate','scale','rotate','setTransform','drawImage'])c[name]=(...args)=>calls.push([name,...args]);c.save=()=>stack.push(c.globalAlpha);c.restore=()=>{assert(stack.length);c.globalAlpha=stack.pop();};for(const name of ['createLinearGradient','createRadialGradient'])c[name]=()=>({addColorStop(){}});return {c,calls,stack};}
const images=[],makeCanvas=()=>{const recording=context(),image={width:0,height:0,getContext:()=>recording.c,recording};images.push(image);return image;},art=new SceneryArt(makeCanvas),regional=new RegionalArt(makeCanvas);
const renderAll=()=>{for(let v=0;v<5;v++)for(const s of [.7,1,1.5]){
  const {c,stack}=context(),prop={x:120,y:160,treeForm:v,rockForm:v,logForm:v%3,seed:.12+v*.13,scale:s,r:36*s,halfLength:42+s*20,angle:1};
  art.drawTree(c,prop,.35);art.drawRock(c,prop);art.drawLog(c,prop);regional.drawDeadTree(c,prop,.35);regional.drawRuinsStone(c,{...prop,variant:'pillar'});regional.drawRuinsStone(c,{...prop,variant:'slab'});
  assert.equal(c.globalAlpha,1,'fading must not leak into the next prop');assert.equal(stack.length,0);
}};
const originalRandom=Math.random;
try{Math.random=()=>{throw new Error('painting scenery must never advance gameplay randomness');};renderAll();const warmed={normal:art.cacheStats.builds,regional:regional.cacheStats.builds};renderAll();assert.equal(art.cacheStats.builds,warmed.normal,'sizes reuse source sprites');assert.equal(regional.cacheStats.builds,warmed.regional,'region variants remain a bounded reusable set');}finally{Math.random=originalRandom;}
for(const atlas of [art,regional])assert(atlas.cacheStats.bytes<=atlas.cacheStats.limitBytes);
for(const prefix of ['canopy:','rock:']){const samples=[...art.cache.entries()].filter(([key])=>key.startsWith(prefix));assert.equal(samples.length,5);const silhouettes=new Set(samples.map(([,im])=>JSON.stringify(im.canvas.recording.calls.filter(([name])=>name==='moveTo'||name==='lineTo'))));assert.equal(silhouettes.size,5,'each requested form changes geometry, not only texture');}
for(const v of [0,1,2,3,4]){const visual=sceneryVisual({type:'tree',scale:1.5,treeForm:v,variant:'dead-tree'});assert(visual.canopyRx>0&&visual.canopyRy>0);}
console.log(JSON.stringify({sceneryVariety:'passed',regions:3,seedsPerRegion:24,propsChecked,treeForms:5,rockForms:5,normalBytes:art.cacheStats.bytes,regionalBytes:regional.cacheStats.bytes}));
