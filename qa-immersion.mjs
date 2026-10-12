import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment, ENVIRONMENT_BALANCE, isGrounded } from './dist/environment.js';
import { ImmersionArt } from './dist/immersion-art.js';

function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false});
  g.enemies=[];g.events=[];g.effects=[];g.gems=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;
  g.player.invuln=100;g.crystalsNext=Infinity;g.environment=new Environment(g,{generation:false});return g;
}
const g=arena(),env=g.environment,p=g.player,mud={id:'qa-marsh',type:'mud',x:0,y:19.8,rx:100,ry:60,seed:.5};
env.muds.push(mud);
const bodyBefore=structuredClone(p),stateBefore=JSON.stringify({events:g.events,effects:g.effects,mud});
const full=env.getImmersion(p,true);assert.equal(full.depth,1);assert.equal(full.waterY,19.8);assert.equal(full.sink,16);
assert(full.sink/58.3<.35,'the traveler only loses its lower body, not half its silhouette');
assert.deepEqual(p,bodyBefore,'sampling immersion never changes collision coordinates or body state');
assert.equal(JSON.stringify({events:g.events,effects:g.effects,mud}),stateBefore);
const oldRandom=Math.random;Math.random=()=>{throw new Error('immersion must never consume combat RNG');};
for(let i=0;i<12;i++)assert.deepEqual(env.getImmersion(p),full);
Math.random=oldRandom;

const samples=[101,100,99.9,95,80,60,40,0].map(x=>{p.x=x;return env.getImmersion(p)?.depth||0;});
assert.equal(samples[0],0);assert.equal(samples[1],0);assert(samples[2]>0&&samples[2]<.00002);
for(let i=1;i<samples.length;i++)assert(samples[i]>=samples[i-1],'entry follows a continuous shallow-to-deep profile');
p.x=80;p.y=0;const horizontal=env.getImmersion(p).depth;
p.x=0;p.y=48;assert(Math.abs(env.getImmersion(p).depth-horizontal)<1e-12,'both axes use the actual pool ellipse');
p.x=0;p.y=0;env.muds.push({...mud,id:'overlap'});assert.deepEqual(env.getImmersion(p),full,'overlap does not double the depth');
p.x=105;assert.equal(env.getImmersion(p),null);assert.equal(env.movementMultiplier(p),1);
p.x=0;assert.equal(env.movementMultiplier(p),ENVIRONMENT_BALANCE.mudMultiplier);

for(const [type,r] of [['slime',16],['beetle',18],['brute',26],['boar',22],['spore',20],['boss',49],['boss',80]]){
  const enemy={type,r,x:0,y:mud.y-groundOffset({type,r})},surface=env.getImmersion(enemy);
  assert.equal(surface.depth,1);assert(Math.abs(surface.waterY-mud.y)<1e-9);assert(surface.sink<=18);
  assert.equal(env.movementMultiplier(enemy),.74);
}
const companion={x:0,y:0,r:15,isCompanion:true,kind:'warden'};
assert.equal(env.getImmersion(companion).sink,16);assert.equal(env.getImmersion(companion).footY,19.8);
env.mechanisms.props.push({type:'vine',x:0,y:19.8,r:30,state:'active'});
assert.equal(env.movementMultiplier(p),.6);assert.equal(env.movementMultiplier(companion),.6);
for(const flyer of [{type:'bat',r:11},{type:'slime',r:16,flying:true},{type:'angel'},{kind:'angel'},{isTownNpc:true,townKind:'angel'}]){
  Object.assign(flyer,{x:0,y:0});assert.equal(isGrounded(flyer),false);assert.equal(env.getImmersion(flyer),null);
  assert.equal(env.movementMultiplier(flyer),1);assert.equal(env.mechanisms.movementMultiplier(flyer),1);
}
assert.equal(isGrounded(companion),true);

// Exercise the real movement path, including the bat's ground navigation.
for(const type of ['slime','bat']){
  const pair=[arena(),arena()];
  for(const world of pair){const e=world._spawnEnemy(type,1);Object.assign(e,{x:-80,y:0,speed:100,hp:10000,maxHp:10000,phase:0});}
  pair[1].environment.muds.push({...mud,rx:400,ry:200});
  for(const world of pair)world.update(.05);
  const dry=pair[0].enemies[0].x+80,wet=pair[1].enemies[0].x+80;
  assert(Math.abs(wet/dry-(type==='bat'?1:.74))<1e-10,`${type} actual movement honors its ground/flying rule`);
}

// Gas remains harmful to flying enemies; the exemption is for ground effects.
const poison=arena(),bat=poison._spawnEnemy('bat',1);Object.assign(bat,{x:0,y:0,speed:0,hp:500,maxHp:500});
poison.environment.mechanisms.props.push({type:'gas',x:0,y:19.8,r:70,state:'active'});
poison.environment.mechanisms._gasEnemyClock=0;poison.environment.mechanisms._gasDamage(0);
assert.equal(bat.hp,480);

function recordingContext(){
  const calls=[],ctx={globalAlpha:.8,stack:[]};
  for(const name of ['beginPath','ellipse','clip','stroke'])ctx[name]=(...args)=>calls.push([name,...args]);
  ctx.save=()=>{ctx.stack.push(ctx.globalAlpha);calls.push(['save']);};
  ctx.restore=()=>{ctx.globalAlpha=ctx.stack.pop();calls.push(['restore']);};
  return {ctx,calls};
}
const art=new ImmersionArt(),render=options=>{const {ctx,calls}=recordingContext();art.drawSurface(ctx,full,options);assert.equal(ctx.globalAlpha,.8);assert.equal(ctx.stack.length,0);return calls;};
assert.deepEqual(render({time:10}),render({time:10}),'paused simulation time freezes water motion');
assert.notDeepEqual(render({time:10}),render({time:10.5}));
assert.deepEqual(render({time:10,reduced:true}),render({time:99,reduced:true}),'reduced motion uses a still waterline');
assert(render({time:10,dense:true}).length<render({time:10}).length);
assert.deepEqual(render({view:{left:500,right:600,top:500,bottom:600}}),[],'offscreen water does not draw');
const nothing=recordingContext();art.drawSurface(nothing.ctx,null);assert.equal(nothing.calls.length,0);
const first=render({time:0});assert.deepEqual(first[2],['ellipse',mud.x,mud.y,mud.rx,mud.ry,0,0,Math.PI*2]);
assert.equal(first[3][0],'clip','ripples are restricted to the real pool footprint');
console.log('Marsh immersion: proportional smooth depth, immutable world feet, overlap bounds, real ground/flying movement, unchanged gas, sorted waterline drawing and paused/reduced water motion passed.');
