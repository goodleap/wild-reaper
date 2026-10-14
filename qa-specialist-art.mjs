import assert from 'node:assert/strict';
import { MonsterArt } from './dist/monster-art.js';
import { ENEMY_ART } from './dist/enemy-art/registry.js';
import { ENEMY_VISUALS } from './dist/enemy-visuals.js';
import { bossPhaseLabel, bossWindingUp, drawBossGround } from './dist/enemy-presentation.js';

function recordingContext(){
  let depth=0;const calls=[];
  const ctx={};
  for(const method of ['beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','clip','fillRect','translate','rotate','scale','drawImage'])ctx[method]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${method} must only receive finite coordinates`);
    calls.push([method,...args]);
  };
  ctx.save=()=>{depth++;};ctx.restore=()=>{assert(depth>0);depth--;};
  ctx.createLinearGradient=(...args)=>{assert(args.every(Number.isFinite));return{addColorStop(){}};};
  return{ctx,calls,get depth(){return depth;}};
}
const ids=['rootbinder','boglurker','prismguard','tidepriest','shieldguard','stoneape','windhunter','frostmage','flamelizard','spiderling','broodmother','deepcaller','frostcrown','furnace'];
const canvases=[],art=new MonsterArt(()=>{const record=recordingContext(),canvas={width:0,height:0,record,getContext:()=>record.ctx};canvases.push(canvas);return canvas;});
const random=Math.random;Math.random=()=>{throw new Error('Visuals must not advance gameplay randomness');};
try{
  const shapes=new Set();
  for(const id of ids){
    const painter=ENEMY_ART[id],visual=ENEMY_VISUALS[id];assert(painter&&visual,`${id} registers both art and body metadata`);
    assert(visual.box[0]>=visual.halfWidth*2);assert(visual.box[1]>=visual.top+visual.foot);
    const record=recordingContext();painter.paint(record.ctx,0,1);assert.equal(record.depth,0);shapes.add(JSON.stringify(record.calls));
    for(const phase of [-1,0,1])for(const flip of [-1,1]){
      const canvas=recordingContext();painter.paint(canvas.ctx,phase,flip);assert.equal(canvas.depth,0,`${id} keeps cached paint state balanced`);
    }
    // Type IDs address the same registry without depending on a build artifact
    // being regenerated while other parallel content edits are still pending.
    const entity={type:id,bossKind:id,id:0,x:0,y:0,hit:0,walkPhase:0,visualFacing:0};
    const ctx=recordingContext();assert(art.draw(ctx.ctx,entity,{reduced:true}));
    const builds=art.diagnostics.builds;
    for(let frame=0;frame<30;frame++)assert(art.draw(ctx.ctx,entity,{time:frame,reduced:true}));
    assert.equal(art.diagnostics.builds,builds,`${id} reuses its cache for stable poses`);
    entity.specialist={phase:'windup',timer:.3,maxTime:1,angle:0};entity.specialAttack={phase:'windup',kind:'leap'};
    assert(art.draw(ctx.ctx,entity,{time:3}));assert.equal(ctx.depth,0);
    assert(art.diagnostics.bytes<=art.diagnostics.limitBytes);
  }
  assert.equal(shapes.size,ids.length,'Every new enemy has distinct geometry, not just a palette swap');
  assert.equal(ENEMY_VISUALS.windhunter.immersionBody,null,'Flying enemy remains above water');
  for(const id of ids.filter(id=>id!=='windhunter'))assert(ENEMY_VISUALS[id].immersionBody,'Grounded forms participate in shared immersion');
  const bosses=['broodmother','deepcaller','frostcrown','furnace'];
  for(const bossKind of bosses){
    const e={type:'boss',bossKind,specialAttack:{kind:'frostCharge',phase:'windup'}};
    assert.match(bossPhaseLabel([e],()=>true),/霜径冲锋.*蓄力/);assert(bossWindingUp(e));
    assert.equal(bossPhaseLabel([e],()=>false),null,'Hidden bosses do not reveal phase labels');
    e.specialAttack=null;e.specialRecovery=1;assert(!bossWindingUp(e),'Recovery is not a windup');
    e.specialPose='tidalWave';assert.equal(bossPhaseLabel([e],()=>true),'潮汐波');
  }
  // New Boss warning geometry is handled by ability-art, not painted twice by
  // the legacy Boss ground-warning dispatcher.
  const ground=recordingContext();drawBossGround(ground.ctx,bosses.map(bossKind=>({bossKind,specialAttack:{phase:'windup',kind:'leap'}})),()=>true,{});assert.equal(ground.calls.length,0);assert.equal(ground.depth,0);
  // A representative mixed world with a Boss fits the existing bounded cache
  // and does not rebuild warmed poses as gameplay time advances.
  const warm=new MonsterArt(()=>{const record=recordingContext();return{width:0,height:0,getContext:()=>record.ctx};});
  const ctx=recordingContext(),mixed=['slime','boar','frostmage','windhunter','frostcrown'];
  for(const type of mixed)for(const hit of [0,1])for(const time of [0,.125,.25,.5,1,1.5,2,3,4])warm.draw(ctx.ctx,{type,id:0,x:0,y:0,hit,visualFacing:0,walkPhase:time*Math.PI},{time});
  const built=warm.diagnostics.builds;
  for(let frame=0;frame<240;frame++)for(const type of mixed)warm.draw(ctx.ctx,{type,id:0,x:0,y:0,hit:frame%2,visualFacing:0,walkPhase:frame/10},{time:frame/60});
  assert(warm.diagnostics.builds-built<=4,'Mixed-world poses settle into the existing cache');
  assert(warm.diagnostics.bytes<=warm.diagnostics.limitBytes);
}finally{Math.random=random;}
console.log('Specialist art: fourteen distinct cached silhouettes, finite/balanced drawing, shared immersion metadata, Boss phase labels and bounded mixed-world cache passed.');
