import assert from 'node:assert/strict';
import { ABILITY_DEFINITIONS } from './dist/ability-definitions.js';
import { drawAbilityDepthItem, drawAbilityProjectiles, visitAbilityDepthItems } from './dist/ability-art.js';

function context(record=true){
  let state={globalAlpha:1,lineWidth:1},stack=[];const calls=[];
  const target={calls,get depth(){return stack.length;},save(){stack.push({...state});},restore(){assert(stack.length);state=stack.pop();}};
  for(const method of ['createLinearGradient','createRadialGradient'])target[method]=()=>({addColorStop(){}});
  for(const method of ['translate','rotate','scale','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','clip','fill','stroke','fillRect','drawImage'])target[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method}: finite geometry`);
    if(record)calls.push([method,...args.map(value=>typeof value==='object'?'object':value),state.globalAlpha,state.fillStyle,state.strokeStyle]);
  };
  return new Proxy(target,{get:(t,k)=>k in t?t[k]:state[k],set:(_t,k,v)=>{if(k==='globalAlpha')assert(v>=0&&v<=1);state[k]=v;return true;}});
}
const makeCanvas=()=>({width:0,height:0,getContext:()=>context(false)});
const documentBefore=globalThis.document;globalThis.document={createElement:makeCanvas};
const effect=(id,extra={})=>({id:1,abilityId:id,shape:ABILITY_DEFINITIONS[id].shape,parameters:{...ABILITY_DEFINITIONS[id].parameters},
  x:200,y:180,groundOffset:20,sourceX:200,sourceY:180,sourceGroundOffset:20,angle:-Math.PI/2,windup:1,age:1.1,remaining:.5,
  caster:{x:200,y:180,r:18,type:'frostmage',hp:100,facing:Math.PI/2},...extra});
const game=e=>({enemies:[],abilities:{clock:1,effects:[e],visualBursts:[],statuses:new Map()}});
const items=(e,options={})=>{const found=[];visitAbilityDepthItems(game(e),options,item=>found.push(item));return found;};
try{
  // Charge and attached flames follow the attack direction at the authored
  // source, independently of movement-facing or a later caster position.
  for(const angle of [-Math.PI/2,-Math.PI/4,Math.PI/4,Math.PI/2]){
    const e=effect('fireball',{age:.4,angle}),item=items(e)[0],expected=200+Math.sin(angle)*.25;
    assert.equal(item.part,'windup');assert.equal(item.sortY,expected);
    e.caster.y+=150;e.caster.facing=-angle;assert.equal(items(e)[0].sortY,expected);
    e.abilityId='flameStream';e.shape='cone';e.age=1.2;
    assert.equal(items(e)[0].part,'cone');assert.equal(items(e)[0].sortY,expected);
  }
  // Released shots use their current ground projection, not the launch side
  // or an elevated sprite coordinate. Cached descriptors do not touch effects.
  const shot=effect('fireball',{x:200,y:130}),before=structuredClone(shot),first=items(shot)[0];
  assert.equal(first.sortY,149.99);assert.equal(items(shot)[0],first);assert.deepEqual(shot,before);
  shot.y=260;assert.equal(items(shot)[0].sortY,279.99);
  shot.groundY=305;assert.equal(items(shot)[0].sortY,304.99);
  const launching=effect('fireball',{y:180});assert(items(launching)[0].sortY<200,'an upward shot starts behind its caster even at equal ground coordinates');
  launching.angle=Math.PI/2;assert(items(launching)[0].sortY>200,'a downward shot starts in front without moving its origin');
  assert.equal(items(shot,{visible:()=>false}).length,0);
  assert.equal(items(shot,{viewBounds:{minX:5000,minY:5000,maxX:6000,maxY:6000}}).length,0);

  // A thrown rock keeps its existing release time and height. Only its ground
  // depth travels from the source to the landing point; meteors stay aloft.
  const stone=effect('stoneLob',{x:500,y:400,age:.49});assert.equal(items(stone).length,0);
  for(const age of [.5,.75,.999]){
    stone.age=age;const item=items(stone)[0],flight=(age-.5)*2;
    assert.equal(item.part,'stone-lob');assert.equal(item.sortY,199.75+(420-199.75)*flight);
  }
  assert.equal(items(effect('meteor',{age:.75})).length,0);
  assert.equal(items(effect('lightning',{age:1.1})).length,0);

  // The scene pass owns each ordinary air visual exactly once. The fallback
  // API still produces identical authored geometry for single sorted items.
  for(const id of ['fireball','frostbolt','waterBolt','windSlash','swords','flameStream','shortFlame','stoneLob'])for(const age of [.75,1.1]){
    const e=effect(id,{age}),g=game(e),parts=items(e),legacy=context(),sorted=context(),overlay=context();
    drawAbilityProjectiles(legacy,g);for(const item of parts)drawAbilityDepthItem(sorted,item);
    drawAbilityProjectiles(overlay,g,{depthSorted:true});
    if(parts.length){assert.equal(parts.length,1);assert.deepEqual(sorted.calls,legacy.calls,`${id}: geometry and animation unchanged`);assert.equal(overlay.calls.length,0,`${id}: no duplicate overlay`);}
    else assert.deepEqual(overlay.calls,legacy.calls);
    assert.equal(sorted.depth,0);assert.equal(overlay.depth,0);
  }
  // A long ray must visit several depths while retaining a distinct source
  // connection. Horizontal rays require only one body span.
  for(const angle of [-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2]){
    const e=effect('beam',{angle}),snapshot=structuredClone(e),parts=items(e),body=parts.filter(item=>item.part==='beam-body'),mouth=parts.find(item=>item.part==='beam-mouth');
    assert(mouth);assert.equal(mouth.sortY,200+Math.sin(angle)*.25);assert(body.length>=1&&body.length<=32);
    if(angle===0)assert.equal(body.length,1);else assert(body.length>1);
    if(angle<0)assert(body.some(item=>item.sortY<200));if(angle>0)assert(body.some(item=>item.sortY>200));
    const ctx=context();for(const item of parts)drawAbilityDepthItem(ctx,item);assert.equal(ctx.depth,0);assert.deepEqual(e,snapshot);
    const overlay=context();drawAbilityProjectiles(overlay,game(e),{depthSorted:true});assert.equal(overlay.calls.length,0);
  }
  const beam=effect('beam');let localized=false;
  const cutParts=items(beam,{depthCutsFor(minX,maxX,path){
    assert(Math.abs(minX-(beam.x-beam.parameters.radius))<1e-9);assert(Math.abs(maxX-(beam.x+beam.parameters.radius))<1e-9);
    assert.deepEqual(path,{x:beam.x,y:200,x2:beam.x+Math.cos(beam.angle)*beam.parameters.range,y2:200+Math.sin(beam.angle)*beam.parameters.range,radius:beam.parameters.radius+2});
    localized=true;return[123.456,5000];
  }});
  assert(localized);assert.equal(cutParts.length,3,'one overlapping, internal actor foot needs two beam bands and one mouth');
  const cutBody=cutParts.filter(item=>item.part==='beam-body');assert(cutBody[0].sortY<123.456);assert(cutBody[1].sortY>123.456);
  // Landing feedback and statuses remain in the overlay pass, and no renderer
  // may advance execution state or consume combat randomness.
  const oldRandom=Math.random;Math.random=()=>{throw Error('artwork must not consume gameplay randomness');};
  try{
    for(const definition of Object.values(ABILITY_DEFINITIONS).filter(d=>d.shape!=='shield'))for(const age of [.25,.75,1.2])for(const dense of [false,true]){
      const e=effect(definition.id,{age}),g=game(e),snapshot=structuredClone(g),ctx=context(false),options={dense,reduced:dense,depthSorted:true};
      visitAbilityDepthItems(g,options,item=>drawAbilityDepthItem(ctx,item,options));drawAbilityProjectiles(ctx,g,options);
      assert.equal(ctx.depth,0);assert.deepEqual(g,snapshot);
    }
    const g=game(effect('lightning',{age:1.2}));g.abilities.effects=[];
    g.abilities.visualBursts.push({id:8,abilityId:'lightning',kind:'landing',x:200,y:180,groundOffset:20,radius:20,age:.05,life:.3});
    const legacy=context(),overlay=context();drawAbilityProjectiles(legacy,g);drawAbilityProjectiles(overlay,g,{depthSorted:true});
    assert(overlay.calls.length);assert.deepEqual(overlay.calls,legacy.calls);
  }finally{Math.random=oldRandom;}
}finally{if(documentBefore===undefined)delete globalThis.document;else globalThis.document=documentBefore;}
console.log('Ability depth: source direction, moving ground anchors, rock release and trajectory, segmented beams, overlay exclusions, immutable animation geometry, visibility and bounded descriptors passed.');
