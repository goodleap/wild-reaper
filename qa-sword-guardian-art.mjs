import assert from 'node:assert/strict';
import {drawSwordSlash,swordSlashPose} from './dist/sword-art.js';
import {drawSwordEnergy} from './dist/sword-energy-art.js';
import {drawGuardianBarrier,drawBarrierEffect} from './dist/guardian-art.js';

function recorder(){
  const calls=[],stack=[];let state={globalAlpha:1,lineWidth:1,shadowBlur:0,fillStyle:'#000',strokeStyle:'#000',lineCap:'butt',lineJoin:'miter'};
  const ctx={calls,save(){stack.push({...state});calls.push(['save']);},restore(){assert(stack.length);state=stack.pop();calls.push(['restore']);},get depth(){return stack.length;}};
  for(const name of ['translate','rotate','scale','beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','fill','stroke'])ctx[name]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${name} must use finite coordinates`);
    if(name==='arc')assert(args[2]>=0);calls.push([name,...args,{...state}]);
  };
  return new Proxy(ctx,{get:(obj,key)=>key in obj?obj[key]:state[key],set:(obj,key,value)=>{
    if(key==='globalAlpha')assert(value>=0&&value<=1&&Number.isFinite(value));
    if(key==='lineWidth')assert(value>0&&Number.isFinite(value));if(key==='shadowBlur')assert.equal(value,0,'no runtime blur');state[key]=value;return true;
  }});
}
const source={type:'swordSlash',x:18,y:-41,r:88,angle:.44,arc:1.8,windup:.085,maxLife:.38,life:.2,seed:14};
const player=Object.freeze({x:18,y:-41}),game={player,_clock:3};
const oldRandom=Math.random;Math.random=()=>{throw Error('art cannot consume gameplay randomness');};
try{
  for(const reduced of [false,true])for(const dense of [false,true])for(const branch of [undefined,'sweep','heavy'])for(const energyRank of [0,1,3])for(const fraction of [1,.97,.78,.65,.4,.18,.001]){
    const e=Object.freeze({...source,life:source.maxLife*fraction,branch,energyRank}),ctx=recorder();
    assert(drawSwordSlash(ctx,e,game,{reduced,dense}));assert.equal(ctx.depth,0);assert.equal(ctx.globalAlpha,1);
    assert(ctx.calls.some(call=>call[0]==='fill'),'physical blade stays visible across the attack');
    assert(ctx.calls.length<230,'one attack uses a bounded amount of geometry');
    const replay=recorder();drawSwordSlash(replay,e,{_clock:9000},{reduced,dense});assert.deepEqual(replay.calls,ctx.calls,'sword poses age only with simulation life');
    for(const call of ctx.calls)if(call[0]==='arc')assert(call[3]<=e.r,'wake stays inside the weapon reach');
  }
  const shape={halfWidth:29,top:35,foot:18},owner={x:42,y:63},actor={entity:owner,scale:1.1,shape,footY:82.8};
  const attack={...source,x:0,y:0,followOwner:true,owner,attackAge:.115,hitTime:.115,windup:.065,maxLife:.28,life:.17,meleeRange:92,r:92,energyRank:0};
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const e={...attack,angle},pose=swordSlashPose(e,{player:owner},{actor});
    assert(Math.abs(pose.angle-angle)<1e-9,'the blade meets the locked direction exactly at damage time');
    assert(pose.grip>=12&&pose.grip<=23,'the hilt remains near the body without a distant orbit');
    assert(pose.tip>=70&&pose.tip<=84,'shorter physical sword retains the near-body pivot');
    assert(Math.abs(pose.length-92*.74*.88)<1e-9,'the physical blade is shortened by twelve percent');
    assert.equal(pose.x,owner.x);assert.equal(pose.y,owner.y);
    if(Math.sin(angle)<-.5)assert(pose.sortY<actor.footY,'upward sword is behind its owner');
    if(Math.sin(angle)>.5)assert(pose.sortY>actor.footY,'downward sword is in front of its owner');
    const translated={...actor,entity:{...owner,x:owner.x+14,y:owner.y-5},footY:actor.footY-5};
    const moved=swordSlashPose(e,{}, {actor:translated});assert.equal(moved.x-pose.x,14);assert.equal(moved.y-pose.y,-5);assert.equal(moved.angle,pose.angle);
    const wet=swordSlashPose(e,{}, {actor:{...actor,immersion:{sink:9}},bodyY:-1.2});assert(Math.abs(wet.y-pose.y-7.8)<1e-9,'sword follows the same sinking and stride offset as the actor');
    assert.equal(wet.sortY,pose.sortY,'immersion never changes ground depth ordering');
    const base=recorder();drawSwordSlash(base,e,{}, {actor,pose});
    assert(!base.calls.some(c=>c.at(-1)?.fillStyle==='#bfeaf0'),'a starting sword has no energy crescent');
    const enhanced={...e,r:124,energyRank:2},energyPose=swordSlashPose(enhanced,{}, {actor});
    assert.equal(energyPose.length,pose.length);assert.equal(energyPose.grip,pose.grip,'energy upgrades retain the same physical blade');
    const energy=recorder();drawSwordSlash(energy,enhanced,{}, {actor,pose:energyPose});
    assert.deepEqual(energy.calls,base.calls,'an acquired upgrade no longer attaches energy to the physical sword');
    assert(energy.calls.length<230,'steel uses a fixed small geometry budget');
  }
  const currentPose=swordSlashPose(attack,{}, {actor}),previousPose=swordSlashPose({...attack,attackAge:attack.attackAge-1/60},{}, {actor});
  const moving=recorder();drawSwordSlash(moving,attack,{}, {actor,pose:currentPose});
  const sweepArcs=moving.calls.filter(c=>c[0]==='arc');
  assert(sweepArcs.some(c=>c[4]<=previousPose.angle&&c[5]>=previousPose.angle),'the recent-time steel trail bridges the previous 60 FPS blade position');
  assert(sweepArcs.some(c=>Math.abs(c[5]-currentPose.angle)<1e-9),'steel sweep meets the current blade');
  for(const reduced of [false,true])for(const dense of [false,true])for(const branch of [undefined,'heavy'])for(const age of [.001,.04,.18,.319]){
    const wave=Object.freeze({type:'swordEnergy',x:120,y:90,angle:.3,r:20,age,life:.32-age,maxLife:.32,branch}),ctx=recorder();
    assert(drawSwordEnergy(ctx,wave,{reduced,dense}));assert.equal(ctx.depth,0);assert.equal(ctx.globalAlpha,1);
    assert(ctx.calls.length<70,'independent energy uses a bounded number of vector paths');
    assert(ctx.calls.some(c=>c[0]==='fill'&&c.at(-1)?.fillStyle===(branch==='heavy'?'#f6dba4':'#cbefed')),'traveling energy has a clear thick body');
    const repeated=recorder();drawSwordEnergy(repeated,wave,{reduced,dense});assert.deepEqual(repeated.calls,ctx.calls,'energy draw is deterministic and preserves simulation data');
  }
  for(const wave of [{delay:.03,life:.3,maxLife:.3},{done:true,life:.3,maxLife:.3},{life:0,maxLife:.3}]){
    const ctx=recorder();assert(drawSwordEnergy(ctx,wave));assert.equal(ctx.calls.length,0,'delayed and ended projectiles are not painted');
  }
  const explicitAge=recorder(),differentLife=recorder();
  drawSwordSlash(explicitAge,attack,{}, {actor});drawSwordSlash(differentLife,{...attack,life:.13},{}, {actor});
  assert.deepEqual(explicitAge.calls,differentLife.calls,'runtime attack age keeps the picture aligned with the damage clock');
  for(const ready of [false,true])for(const active of [false,true])for(const remaining of [0,3,30])for(const life of [.001,.2,2]){
    const barrier=Object.freeze({ready,active,remaining,capacity:30,life,cooldown:0}),snapshot=JSON.stringify(barrier),ctx=recorder();
    drawGuardianBarrier(ctx,{...game,barrier},player);assert.equal(ctx.depth,0);assert.equal(ctx.globalAlpha,1);assert.equal(JSON.stringify(barrier),snapshot);
    assert(ctx.calls.length<110,'only a player-sized shell with fixed facets');if(!active)assert.equal(ctx.calls.length,0,'a ready barrier adds no floating decoration');
  }
  for(const type of ['barrierTrigger','barrierBreak'])for(const reduced of [false,true])for(const dense of [false,true])for(const progress of [0,.2,.7,.999]){
    const e=Object.freeze({type,x:18,y:-41,maxLife:.3,life:.3*(1-progress)}),ctx=recorder();
    assert(drawBarrierEffect(ctx,e,game,{reduced,dense}));assert.equal(ctx.depth,0);assert(ctx.calls.length<150);
    const again=recorder();drawBarrierEffect(again,e,{_clock:9000},{reduced,dense});assert.deepEqual(ctx.calls,again.calls);
  }
  const idle={...game,barrier:{ready:true}},a=recorder(),b=recorder();drawGuardianBarrier(a,idle,player,{reduced:true});drawGuardianBarrier(b,{...idle,_clock:100},player,{reduced:true});assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[],'standby remains visually clear at any clock');
  for(const render of [drawSwordSlash,drawBarrierEffect]){
    const unknown=recorder();assert.equal(render(unknown,{type:'meteor'}),false);assert.equal(unknown.calls.length,0);
    for(const life of [0,-1,NaN])for(const type of render===drawSwordSlash?['swordSlash']:['barrierTrigger','barrierBreak']){
      const ctx=recorder();assert(render(ctx,{...source,type,life}));assert.equal(ctx.calls.length,0,'expired effects issue no draw work');
    }
  }
}finally{Math.random=oldRandom;}
console.log('Sword / guardian artwork: bounded finite geometry, near-body directional blades, independent traveling energy, continuous steel sweep, actor-relative sinking, depth sorting, attack-clock pause stability, isolated state and reduced-motion shells passed.');
