import assert from 'node:assert/strict';
import { BOSS_SPECIALIST_ART, drawSpecialistBossGround } from './dist/enemy-art/specialist-bosses.js';
import { frostcrownAssets } from './dist/enemy-art/frostcrown-assets.js';

await frostcrownAssets.preload({load:async()=>({width:1254,height:1254})});

function recorder(){
  const calls=[],ctx={};let depth=0;
  for(const method of ['beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','translate','rotate','scale','clip','transform','drawImage'])ctx[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method} receives finite coordinates`);
    if(method==='ellipse')assert(args[2]>=0&&args[3]>=0,'ellipse radii remain nonnegative');
    calls.push([method,...args]);
  };
  ctx.save=()=>{depth++;};ctx.restore=()=>{assert(depth>0);depth--;};
  ctx.createLinearGradient=(...args)=>{assert(args.every(Number.isFinite));return{addColorStop(){}};};
  return{ctx,calls,get depth(){return depth;}};
}
function trace(art,pose){const r=recorder();art.paint(r.ctx,Math.sin(pose.cycle||0),1,pose);assert.equal(r.depth,0);return JSON.stringify(r.calls);}
const actions={broodmother:['domain','summon','leap'],deepcaller:['tentacles','vortex','tidalWave'],frostcrown:['frostbolt','frostCharge','shatter','frostRing'],furnace:['furnaceMarch','eruption','fireball','flameStream']};
const originalRandom=Math.random;Math.random=()=>{throw new Error('Boss painting must not consume gameplay randomness');};
try{
  for(const [id,art] of Object.entries(BOSS_SPECIALIST_ART)){
    assert.equal(art.animated,true);
    const idle=trace(art,{mode:'idle',moving:false}),walking=new Set();
    for(const cycle of [0,Math.PI*.5,Math.PI,Math.PI*1.5])walking.add(trace(art,{mode:'move',moving:true,cycle}));
    assert(walking.size>=3,`${id} has alternating, nonsymmetric support poses`);
    for(const mode of ['windup','active','recovery','rush','air','hit'])for(const action of actions[id])for(const progress of [0,.5,1]){
      const r=recorder();art.paint(r.ctx,.5,-1,{mode,action,progress,cycle:Math.PI*.5,moving:mode==='rush'});assert.equal(r.depth,0);
    }
    for(const action of actions[id]){
      const prepared=trace(art,{mode:'windup',action,progress:1,moving:false});
      assert.notEqual(prepared,idle,`${id}/${action} has visible anticipation`);
    }
    const backward=recorder();art.paint(backward.ctx,-1,-1);assert.equal(backward.depth,0,'Legacy painter calls remain supported');
    const e={bossKind:id,specialAttack:{kind:'frostCharge',phase:'windup'}};
    assert.match(art.phaseLabel(e),/霜径冲锋.*蓄力/);assert(art.windingUp(e));
    e.specialAttack=null;e.specialRecovery=1;e.specialPose='tidalWave';assert.equal(art.phaseLabel(e),'潮汐波');assert(!art.windingUp(e));
    e._visualCast={abilityId:'frostbolt',phase:'windup',progress:.5,angle:0};
    assert(art.windingUp(e),'Shared ability windups participate in Boss presentation');assert.match(art.phaseLabel(e),/冰霜术.*蓄力/);
    const accent=recorder();art.overlay(accent.ctx,e,{});assert.equal(accent.depth,0);
  }
  assert.equal(BOSS_SPECIALIST_ART.broodmother.phaseLabel({bossKind:'broodmother',_visualCast:{abilityId:'domain',phase:'windup',progress:.5}}),'织网 · 蓄力');
  const e={hp:100,bossKind:'deepcaller',x:10,y:20,specialAttack:{kind:'tentacles',phase:'strikes',circles:[
    {x:160,y:200,delay:0,maxDelay:0,done:true,visualAge:0},
    {x:285,y:200,delay:.2,maxDelay:.4,done:false}
  ]}};
  const snapshot=JSON.stringify(e),impact=recorder();drawSpecialistBossGround(impact.ctx,{enemies:[e]});
  assert.equal(impact.depth,0);assert.equal(JSON.stringify(e),snapshot,'Rendering never advances strike state');
  assert(impact.calls.some(call=>call[0]==='lineTo'&&call[1]===160&&call[2]===200),'The striking tentacle ends at the actual captured damage point');
  assert(!impact.calls.some(call=>call[0]==='lineTo'&&call[1]===285&&call[2]===200),'A pending strike is visibly raised above its future impact');
  const hidden=recorder();drawSpecialistBossGround(hidden.ctx,{enemies:[e]},{visible:()=>false});assert.equal(hidden.calls.length,0);assert.equal(hidden.depth,0);
  const hiddenOwner=recorder();drawSpecialistBossGround(hiddenOwner.ctx,{enemies:[e]},{visible:item=>item!==e&&item.x===160,viewBounds:{minX:100,minY:100,maxX:220,maxY:240}});
  assert(hiddenOwner.calls.some(call=>call[0]==='lineTo'&&call[1]===160&&call[2]===200),'a visible committed strike retains its limb when the caster is hidden');
  assert(!hiddenOwner.calls.some(call=>call[0]==='lineTo'&&call[1]===285),'an unseen second strike is not disclosed');
  const outside=recorder();drawSpecialistBossGround(outside.ctx,{enemies:[e]},{visible:()=>true,viewBounds:{minX:1000,minY:1000,maxX:1200,maxY:1200}});assert.equal(outside.calls.length,0,'tentacles outside the camera remain culled');
  const after={...e,specialAttack:null,specialVisualStrikes:{life:.175,maxLife:.35,circles:e.specialAttack.circles}};
  const recovery=recorder();drawSpecialistBossGround(recovery.ctx,{enemies:[after]},{dense:true,reduced:true});assert.equal(recovery.depth,0);assert(recovery.calls.length>0,'The last strike retains a retracting arm during recovery');
}finally{Math.random=originalRandom;}
console.log('Boss animation art: alternating support, authored anticipation, finite balanced poses, legacy labels, exact strike targets and read-only recovery drawing passed.');
