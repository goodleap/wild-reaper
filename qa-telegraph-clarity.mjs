import assert from 'node:assert/strict';
import { ABILITY_DEFINITIONS } from './dist/ability-definitions.js';
import { drawAbilityGround, drawAbilityProjectiles } from './dist/ability-art.js';
import { SuperArt } from './dist/super-art.js';
import { ground as ancientGround } from './dist/enemy-art/ancient.js';
import { ground as bloomGround } from './dist/enemy-art/bloom.js';
import { telegraph as boarTelegraph } from './dist/enemy-art/boar.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DungeonVision } from './dist/dungeon-vision.js';
import { sceneEntityVisible } from './dist/scene-rendering.js';

function recorder(){
  const calls=[],stack=[];let state={globalAlpha:1,lineWidth:1,shadowBlur:0},path=[];
  const target={calls,get depth(){return stack.length;},save(){stack.push({...state});},restore(){assert(stack.length);state=stack.pop();},beginPath(){path=[];}};
  for(const name of ['translate','rotate','scale','fillRect','drawImage'])target[name]=(...args)=>{args.forEach(v=>{if(typeof v==='number')assert(Number.isFinite(v));});calls.push({name,args,state:{...state}});};
  for(const name of ['arc','ellipse','rect','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','closePath'])target[name]=(...args)=>{args.forEach(v=>{if(typeof v==='number')assert(Number.isFinite(v));});path.push({name,args});};
  for(const name of ['fill','stroke','clip'])target[name]=()=>calls.push({name,path:structuredClone(path),state:{...state}});
  for(const name of ['createRadialGradient','createLinearGradient'])target[name]=()=>({addColorStop(){}});
  return new Proxy(target,{get:(t,k)=>k in t?t[k]:state[k],set:(_t,k,v)=>{if(k==='globalAlpha')assert(v>=0&&v<=1);state[k]=v;return true;}});
}
const makeCanvas=()=>({width:0,height:0,getContext:()=>recorder()}),priorDocument=globalThis.document;
globalThis.document={createElement:makeCanvas};
const effect=(id,age=0)=>{const d=ABILITY_DEFINITIONS[id];return{id:1,abilityId:id,shape:d.shape,parameters:{...d.parameters},x:100,y:120,sourceX:50,sourceY:60,origin:{x:50,y:60},caster:{type:'frostmage',r:18},casterKind:'frostmage',angle:0,hostile:true,age,windup:1,remaining:d.parameters.duration,groundOffset:12};};
const game=effects=>({enemies:[],abilities:{effects,clock:0,statuses:new Map(),visualBursts:[]}});
const strokes=ctx=>ctx.calls.filter(c=>c.name==='stroke');
const draw=(g,options={})=>{const c=recorder(),before=structuredClone(g);drawAbilityGround(c,g,options);assert.deepEqual(g,before,'telegraphs cannot change combat state');assert.equal(c.depth,0);return c;};
try{
  for(const id of ['fireball','frostbolt','waterBolt','windSlash']){
    const e=effect(id,.3),g=game([e]);
    assert.equal(draw(g).calls.length,0,`${id} must not paint a false ground lane`);
    const air=recorder();drawAbilityProjectiles(air,g);assert(air.calls.length>0,`${id} retains its body windup cue`);
    e.age=1.2;const flight=recorder();drawAbilityProjectiles(flight,g);assert(flight.calls.length>0,`${id} retains its traveling projectile`);assert.equal(flight.depth,0);
  }
  // Threats retain one complete footprint throughout anticipation, including
  // the first frame, and reduced/dense modes never discard that footprint.
  for(const id of ['beam','flameStream','shortFlame','lightning','storm','meteor','stoneLob','domain','vineTrap','vortex','frostRing','tidalWave']){
    let previousAlpha=0;
    for(const age of [0,.5,.99]){
      const e=effect(id,age),g=game([e]),normal=draw(g),s=strokes(normal);
      assert.equal(s.length,1,`${id} has exactly one warning boundary`);
      assert(s[0].state.globalAlpha>=.5&&s[0].state.globalAlpha>=previousAlpha,`${id} is clear from onset and strengthens toward release`);previousAlpha=s[0].state.globalAlpha;
      assert.deepEqual(strokes(draw(g,{dense:true,reduced:true})),s,`${id} keeps the same hazard geometry at high density`);
      const path=s[0].path;
      if(['zone','field','ring'].includes(e.shape))assert.deepEqual(path,[{name:'arc',args:[e.x,e.y+e.groundOffset,e.parameters.radius,0,Math.PI*2]}],`${id} shows its exact radius with no countdown arcs or ticks`);
      if(e.shape==='beam'){
        const caps=path.filter(p=>p.name==='arc');assert.equal(caps.length,2,'beam warning has two rounded ends');
        assert.deepEqual(caps.map(p=>p.args.slice(0,3)),[[100+e.parameters.range-e.parameters.radius,132,e.parameters.radius],[100+e.parameters.radius,132,e.parameters.radius]]);
      }
      if(e.shape==='cone'){const arc=path.find(p=>p.name==='arc');assert.deepEqual(arc.args,[100,132,e.parameters.range,-e.parameters.spread,e.parameters.spread]);}
    }
  }
  // The two independent tide strips never paint their central safe lane.
  const left=effect('tidalWave'),right=effect('tidalWave');left.y=-100;right.y=100;left.groundOffset=right.groundOffset=0;left.parameters.radius=right.parameters.radius=60;
  const waveStrokes=strokes(draw(game([left,right])));assert.equal(waveStrokes.length,2);assert(waveStrokes.every(s=>s.path.every(p=>Math.abs(p.args[1])>=40)));
  for(const paint of [ancientGround,bloomGround]){
    const c=recorder(),area={x:100,y:120,r:91,life:1,maxLife:1};paint(c,{slam:area,bloomAttack:{kind:'burst',life:1,maxLife:1,circles:[area]}},{});
    assert.equal(strokes(c).length,1);assert.deepEqual(strokes(c)[0].path,[{name:'arc',args:[100,120,91,0,Math.PI*2]}]);assert(strokes(c)[0].state.globalAlpha>=.5);
  }
  const boar=recorder();boarTelegraph(boar,{r:20,charge:{phase:'windup',life:1,maxLife:1,length:240,startX:0,startY:0,dx:1,dy:0}},{capsulePath:(c,half,r)=>c.rect(-half,-r,half*2,r*2)});assert.equal(strokes(boar).length,1);assert.equal(boar.depth,0);assert.deepEqual(strokes(boar)[0].path,[{name:'rect',args:[-120,-20,240,40]}]);
  for(const kind of ['leap','tentacles']){
    const enemy={hp:100,bossKind:kind==='leap'?'broodmother':'ancient',specialAttack:{kind,phase:'windup',life:1,maxLife:1,x:0,y:0,circles:[{x:180,y:200,r:65}]}};
    const s=strokes(draw({enemies:[enemy]}));assert.equal(s.length,1);assert.deepEqual(s[0].path,[{name:'arc',args:[180,200,65,0,Math.PI*2]}]);
  }
  const charge={hp:100,r:40,specialAttack:{kind:'frostCharge',phase:'windup',life:1,maxLife:1,x:0,y:0,angle:0,length:300,r:40}};assert.equal(strokes(draw({enemies:[charge]})).length,1,'boss charge retains its complete path');
  const marks={hp:100,specialMarks:[{kind:'ice',x:100,y:100,r:30,life:2,delay:1,maxDelay:1}]},markCtx=draw({enemies:[marks]});
  const outer=strokes(markCtx).filter(s=>s.path.length===1&&s.path[0].name==='arc');assert.equal(outer.length,1,'delayed ice detonation has one boundary, no clock');assert(outer[0].state.globalAlpha>=.5);
  // A committed attack can remain in the visible room after its caster has
  // moved behind a wall. Use the real dungeon LOS callback used by the app.
  const terrain=new Terrain({obstacles:[{id:'hazard-wall',type:'log',variant:'castle-wall',x:0,y:0,r:14,halfLength:300,angle:Math.PI/2}]});
  const dungeon={active:{terrain,bounds:{minX:-300,minY:-300,maxX:300,maxY:300}},game:{player:{x:-150,y:-19.8},viewWidth:540,viewHeight:700},_playerFoot:()=>({x:-150,y:0})};
  const vision=new DungeonVision(dungeon);vision.update();
  const owner={hp:100,type:'boss',bossKind:'frostcrown',r:49,x:130,y:0};owner.y=-groundOffset(owner);
  const visibleHazard={x:-110,y:0,r:30},hiddenHazard={x:110,y:0,r:30},options={visible:e=>sceneEntityVisible(e,vision),viewBounds:vision.view};
  assert.equal(options.visible(owner),false);assert.equal(options.visible(visibleHazard),true);assert.equal(options.visible(hiddenHazard),false);
  for(const kind of ['ice','heat']){
    owner.specialMarks=[{...visibleHazard,kind,life:2,delay:1,maxDelay:1},{...hiddenHazard,kind,life:2,delay:1,maxDelay:1}];
    const boundaries=strokes(draw({enemies:[owner]},options)).filter(s=>s.path.length===1&&s.path[0].name==='arc');
    assert.equal(boundaries.length,1,`${kind} keeps the visible committed mark when its owner is behind a wall`);
    assert.deepEqual(boundaries[0].path[0].args.slice(0,3),[-110,0,30]);
  }
  owner.specialMarks=[];
  for(const kind of ['leap','tentacles']){
    owner.specialAttack={kind,phase:'windup',life:1,maxLife:1,x:owner.x,y:0,circles:[visibleHazard,hiddenHazard]};
    const boundaries=strokes(draw({enemies:[owner]},options));assert.equal(boundaries.length,1,`${kind} retains its visible locked warning independently of caster LOS`);
    assert.deepEqual(boundaries[0].path[0].args.slice(0,3),[-110,0,30]);
  }
  owner.specialAttack=null;owner.specialMarks=[{...visibleHazard,kind:'ice',life:2,delay:1,maxDelay:1}];
  assert(draw({enemies:[owner]},{visible:()=>true,viewBounds:{minX:-200,minY:-100,maxX:-50,maxY:100}}).calls.length>0,'outdoor camera culling keeps visible marks from an offscreen caster');
  assert.equal(draw({enemies:[owner]},{visible:()=>false,viewBounds:vision.view}).calls.length,0,'unseen marks remain hidden');
  const superArt=new SuperArt(makeCanvas),meteor={kind:'meteor',id:1,x:100,y:100,r:90,life:.5,maxLife:1},shadow=recorder(),air=recorder();
  superArt.drawField(shadow,meteor);assert.equal(strokes(shadow).length,0,'friendly meteor only casts a landing shadow');assert(shadow.calls.some(c=>c.name==='fill'),'friendly landing remains visible');superArt.drawFieldAir(air,meteor);assert(air.calls.some(c=>c.name==='drawImage'),'falling meteor is preserved');
  const mist=recorder();superArt.drawField(mist,{...meteor,kind:'miasma'});assert.equal(strokes(mist).length,0,'erosion cloud has no UI ticks');assert(mist.calls.some(c=>c.name==='drawImage'),'erosion mist remains');
  for(const kind of ['thorns','vortex']){const c=recorder();superArt.drawField(c,{...meteor,kind});assert(c.calls.length>8,`${kind} retains its skill artwork`);}
}finally{if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;}
console.log('Telegraph clarity: no projectile ground boxes; complete single danger boundaries from onset; dense/reduced hazard preservation; exact charge, cone and wave gaps; friendly meteor and erosion simplification; immutable simulation passed.');
