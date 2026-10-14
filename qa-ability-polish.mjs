import assert from 'node:assert/strict';
import { AbilityVisuals } from './dist/ability-visuals.js';
import { ABILITY_DEFINITIONS } from './dist/ability-definitions.js';
import { drawAbilityGround, drawAbilityProjectiles, abilityArtDiagnostics } from './dist/ability-art.js';

function recordingContext(record=true){
  let state={globalAlpha:1,lineWidth:1,shadowBlur:0},stack=[];const calls=[];
  const target={calls,get depth(){return stack.length;},save(){stack.push({...state});},restore(){assert(stack.length,'balanced Canvas state');state=stack.pop();}};
  for(const method of ['createLinearGradient','createRadialGradient'])target[method]=(...args)=>{args.forEach(n=>assert(Number.isFinite(n)));if(record)calls.push([method]);return{addColorStop(t,color){assert(t>=0&&t<=1);assert.equal(typeof color,'string');}};};
  for(const method of ['translate','rotate','scale','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','clip','fill','stroke','fillRect','drawImage'])target[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method} received ${value}`);
    if(method==='arc')assert(args[2]>=0);if(method==='ellipse')assert(args[2]>=0&&args[3]>=0);
    if(record)calls.push([method,...args.map(v=>typeof v==='object'?'object':v),state.globalAlpha,state.fillStyle,state.strokeStyle]);
  };
  return new Proxy(target,{get:(t,k)=>k in t?t[k]:state[k],set:(_t,k,v)=>{
    if(k==='globalAlpha')assert(Number.isFinite(v)&&v>=0&&v<=1,`alpha ${v}`);
    if(k==='lineWidth')assert(Number.isFinite(v)&&v>0,`line width ${v}`);
    if(k==='shadowBlur')assert.equal(v,0,'runtime drawing does not use expensive blur');
    state[k]=v;return true;
  }});
}
const makeCanvas=()=>({width:0,height:0,getContext:()=>recordingContext(false)});
const documentBefore=globalThis.document;globalThis.document={createElement:makeCanvas};
const randomBefore=Math.random;Math.random=()=>{throw Error('Artwork must not consume gameplay randomness');};
try{
  const art=new AbilityVisuals({makeCanvas}),base={id:1,x:230,y:190,sourceX:80,sourceY:100,sourceGroundOffset:22,origin:{x:80,y:100},groundOffset:20,angle:.35,hostile:true,windup:1,remaining:1,age:.4,caster:{type:'boss',r:49},casterKind:'furnace'};
  const effects=Object.values(ABILITY_DEFINITIONS).filter(d=>d.shape!=='shield').map((d,i)=>({...base,id:i+1,abilityId:d.id,shape:d.shape,parameters:{...d.parameters}}));
  const web={...effects.find(e=>e.abilityId==='domain'),id:300,visualVariant:'web',casterKind:'broodmother'};effects.push(web);
  for(const abilityId of ['iceShatter','heatEruption','spiderHatch','iceThaw'])for(const dense of [false,true]){
    const ctx=recordingContext(),burst={id:710,abilityId,x:200,y:180,radius:65,age:.1,life:.45,kind:abilityId==='iceThaw'?'hit':'landing'},before=structuredClone(burst);
    art.drawBurst(ctx,burst,{dense});assert(ctx.calls.length>0);assert.equal(ctx.depth,0);assert.deepEqual(burst,before);
  }
  for(const reduced of [false,true])for(const dense of [false,true])for(const phase of [0,.49,.5,.85,.999,1.01,1.3]){
    const ctx=recordingContext(),options={reduced,dense,hasBurstsRuntime:true};
    for(const original of effects){
      const e={...original,age:phase,remaining:original.parameters.duration*.8},snapshot=structuredClone(e);
      if(phase<1)art.drawWindupAir(ctx,e,options);else{art.drawGround(ctx,e,options);art.drawActiveAir(ctx,e,options);}
      assert.deepEqual(e,snapshot,'drawing must preserve gameplay fields');
      for(const kind of ['hit','landing']){const burst={id:e.id,abilityId:e.abilityId,x:e.x,y:e.y,radius:e.parameters.radius,groundOffset:e.groundOffset,age:.08,life:.5,angle:e.angle,visualVariant:e.visualVariant,kind},before=structuredClone(burst);art.drawBurst(ctx,burst,options);assert.deepEqual(burst,before);}
    }
    assert.equal(ctx.depth,0);
    assert(!ctx.calls.some(c=>c[0].startsWith('create')),'no per-frame gradients on the live canvas');
  }
  // A paused simulation must draw exactly the same frame, even with two
  // simultaneous states, and a just-depleted shield still has hit feedback.
  const entity={id:8,type:'frostmage',x:60,y:70,r:18,hp:20},status={slowUntil:4,frozenUntil:3,burn:{until:4},shieldUntil:5,shield:0,shieldHitAt:1,shieldHitAngle:Math.PI/2};
  const game={enemies:[],abilities:{clock:1.05,statuses:new Map([[entity,status]]),effects:[],visualBursts:[]}},before=structuredClone(game);
  const statusCtx=recordingContext(),repeat=recordingContext();art.drawStatuses(statusCtx,game);art.drawStatuses(repeat,game);assert.deepEqual(statusCtx.calls,repeat.calls);assert.deepEqual(game,before);assert.equal(statusCtx.depth,0);
  assert(statusCtx.calls.some(c=>c.at(-2)==='#e87947'),'burn remains visible alongside frozen');
  assert(statusCtx.calls.some(c=>c[0]==='arc'&&Math.abs(c[4]-(Math.PI/2-.42))<1e-9),'shield hit arc retains the actual impact direction');
  // Thorns and a web can share an identical damage footprint without sharing
  // their artwork. All field paint is clipped to that footprint.
  const domain=effects.find(e=>e.abilityId==='domain'),rootCtx=recordingContext(),webCtx=recordingContext();
  art.drawGround(rootCtx,{...domain,age:1.2});art.drawGround(webCtx,{...web,age:1.2});assert.notDeepEqual(rootCtx.calls,webCtx.calls);
  for(const ctx of [rootCtx,webCtx])assert(ctx.calls.some(c=>c[0]==='clip'));
  // Both water strips end at their true radius, leaving the space between
  // them untouched regardless of the decoration budget.
  const wave={...effects.find(e=>e.abilityId==='tidalWave'),age:1.3,angle:0};
  for(const dense of [false,true]){const ctx=recordingContext();art.drawGround(ctx,wave,{dense});assert(ctx.calls.some(c=>c[0]==='rect'&&c[2]===-wave.parameters.radius&&c[4]===wave.parameters.radius*2));assert(ctx.calls.some(c=>c[0]==='clip'));}
  // Flight cannot leave the throwing hand before the actor's authored release.
  const stone={...effects.find(e=>e.abilityId==='stoneLob'),casterKind:'stoneape',caster:{type:'stoneape',r:22},age:.49};
  const held=recordingContext(),released=recordingContext();art.drawWindupAir(held,stone);stone.age=.5;art.drawWindupAir(released,stone);assert.equal(held.calls.length,0);assert(released.calls.length>0);assert(released.calls.some(c=>c[0]==='translate'&&c[1]===stone.sourceX+8&&c[2]===stone.sourceY-28));
  // Rendering phase must be driven by simulation age, not wall-clock time.
  const steady={...effects.find(e=>e.abilityId==='flameStream'),age:1.4},a=recordingContext(),b=recordingContext();art.drawGround(a,steady,{time:1});art.drawGround(b,steady,{time:999});assert.deepEqual(a.calls,b.calls);
  // Lower-detail mode reduces decoration without erasing the effect silhouette.
  const high=recordingContext(),low=recordingContext();art.drawGround(high,wave,{});art.drawGround(low,wave,{dense:true,reduced:true});assert(low.calls.length<high.calls.length);assert(low.calls.some(c=>c[0]==='stroke'));
  // Repeated effects reuse finite variants and bounded bitmap resources.
  const warmed=art.diagnostics;
  for(let frame=0;frame<100;frame++)for(const original of effects){const e=original;e.age=1.2+(frame%5)*.01;art.drawGround(recordingContext(false),e,{dense:true});if(e.abilityId==='meteor'){e.age=.8;art.drawWindupAir(recordingContext(false),e);}}
  assert(art.diagnostics.fieldEntries<=9);assert(art.diagnostics.super.bytes<=art.diagnostics.super.limitBytes);assert.equal(art.diagnostics.super.builds,warmed.super.builds,'warmed reusable meteor images do not rebuild');
  // Public rendering entry points honor scene visibility and viewport culling.
  const mixed={enemies:[],abilities:{clock:2,statuses:new Map(),visualBursts:[],effects:effects.map(e=>({...e,age:1.1}))}},out=recordingContext();drawAbilityGround(out,mixed,{visible:()=>false});drawAbilityProjectiles(out,mixed,{visible:()=>false});assert.equal(out.calls.length,0);assert.equal(out.depth,0);
  const all=recordingContext();drawAbilityGround(all,mixed,{viewBounds:{minX:0,minY:0,maxX:900,maxY:900}});drawAbilityProjectiles(all,mixed,{viewBounds:{minX:0,minY:0,maxX:900,maxY:900}});assert.equal(all.depth,0);assert(abilityArtDiagnostics().fieldEntries<=9);
}finally{Math.random=randomBefore;if(documentBefore===undefined)delete globalThis.document;else globalThis.document=documentBefore;}
console.log('Ability polish: distinct elemental and web visuals, exact release timing, simultaneous statuses, shield direction, preserved wave gaps, pause stability, dense/reduced readability, bounded cache, visibility and immutable simulation passed.');
