import { bossDefinition } from '../boss-definitions.js';
import { enemyDefinition } from '../enemy-definitions.js';
import { groundOffset } from '../terrain.js';
import { isGrounded } from '../height-rules.js';
import { selectFriendlyTarget, friendlyTargets, friendlyFoot, isFriendlyActive, damageFriendly } from '../friendly-combat.js';
import { isFrostcrownBody, frostcrownGroundSweep } from '../enemy-body-geometry.js';

const rules=e=>bossDefinition(e.bossKind).parameters;
const foot=e=>({x:e.x,y:e.y+groundOffset(e)});
const active=(game,e)=>game.status==='playing'&&e.hp>0&&e.guardActive!==false;
const clearLine=(game,a,b,profile='ground')=>!game.terrain.firstBlocker(a.x,a.y,b.x,b.y,0,profile);
function targetState(game,e){
  const target=selectFriendlyTarget(game,e),a=foot(e),b=friendlyFoot(target);
  return {target,a,b,distance:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};
}

export function initSpecialistBoss(e){
  e.specialStep=0;e.specialCooldown=rules(e).initialCooldown;e.specialRecovery=0;
  e.specialAttack=null;e.specialMarks=[];e.specialSummons=[];e.specialPose=null;e.specialLift=0;e.specialRecoveryMax=0;e.specialVisualStrikes=null;e.specialVisualTime=0;
}
export function clearSpecialistBoss(e){
  e.specialAttack=null;e.specialMarks=[];e.specialRecovery=0;e.specialPose=null;e.specialLift=0;e.specialRecoveryMax=0;e.specialVisualStrikes=null;
  // Summons belong to this encounter: death, dormancy and scene changes must
  // never leave an orphaned group behind or create extra kill rewards.
  for(const child of e.specialSummons||[])if(child.hp>0){child.hp=0;child.xp=0;}
  e.specialSummons=[];
}
function recover(e,duration){
  if(e.specialAttack?.kind==='tentacles')e.specialVisualStrikes={circles:e.specialAttack.circles,life:.35,maxLife:.35};
  e.specialAttack=null;e.specialLift=0;e.specialRecovery=duration;e.specialRecoveryMax=duration;
}
function begin(e,kind,duration,state,extra={}){
  e.specialPose=kind;e.specialAttack={kind,phase:'windup',life:duration,maxLife:duration,x:state.a.x,y:state.a.y,angle:state.angle,...extra};
}
function cast(game,e,id,state,options={},hold=0){
  const p=rules(e),ok=game.abilities?.cast(id,e,{target:state.target,point:{x:state.target.x,y:state.target.y},angle:state.angle,...options});
  if(ok){e.specialPose=id;e.specialRecovery=Math.max(p.recovery,hold);e.specialRecoveryMax=e.specialRecovery;}
  return ok;
}
function mark(e,kind,x,y,p){
  if(e.specialMarks.length>=p.markCap)return;
  e.specialMarks.push({x,y,r:p.markRadius,kind,life:p.markLife,maxLife:p.markLife,delay:null,maxDelay:null});
}
function impact(game,e,circle,multiplier,color){
  game._effect(circle.x,circle.y,'bossSlam',.4,circle.r,color);
  if(circle.kind==='ice'||circle.kind==='heat')game.abilities?.visualBurst?.({abilityId:circle.kind==='ice'?'iceShatter':'heatEruption',parameters:{radius:circle.r},angle:0,hostile:true,groundOffset:0},circle,'landing');
  for(const target of friendlyTargets(game)){
    if(!isFriendlyActive(game,target)||!isGrounded(target))continue;
    const at=friendlyFoot(target);
    if(Math.hypot(at.x-circle.x,at.y-circle.y)>circle.r+target.r||!clearLine(game,circle,at))continue;
    damageFriendly(game,target,e.damage*multiplier,e);
  }
}
function startBrood(game,e,s,p){
  const step=e.specialStep%3;
  if(step===0)return cast(game,e,'domain',s,{range:p.domainRange,radius:p.domainRadius,duration:p.domainDuration,damage:e.damage*p.domainDamage,windup:p.windup},p.windup+p.recovery);
  if(step===1){begin(e,'summon',p.windup,s,{circles:[{...s.a,r:p.summonRadius}]});return true;}
  // The destination is captured before the warning and never tracks movement.
  if(s.distance>p.leapRange||!game.terrain.isFree(s.b.x,s.b.y,e.r)||!clearLine(game,s.a,s.b))return false;
  begin(e,'leap',p.windup,s,{destination:{...s.b},circles:[{...s.b,r:p.leapRadius}]});return true;
}
function startDeep(game,e,s,p){
  const step=e.specialStep%3;
  if(step===0){
    const nx=-Math.sin(s.angle),ny=Math.cos(s.angle),circles=[];
    for(const offset of [0,-p.strikeSpacing,p.strikeSpacing]){
      const point={x:s.b.x+nx*offset,y:s.b.y+ny*offset,r:p.strikeRadius,delay:circles.length*p.strikeInterval,maxDelay:circles.length*p.strikeInterval,visualAge:0};
      if(game.terrain.isFree(point.x,point.y,8)&&clearLine(game,s.a,point))circles.push(point);
    }
    if(!circles.length)return false;
    begin(e,'tentacles',p.windup,s,{circles});return true;
  }
  if(step===1)return cast(game,e,'vortex',s,{range:p.vortexRange,radius:p.vortexRadius,duration:p.vortexDuration,damage:e.damage*p.vortexDamage,windup:p.windup},p.vortexDuration+p.windup);
  // Two parallel waves have a deliberate, passable central lane.
  const offset=p.waveGap*.5+p.waveWidth*.5,nx=-Math.sin(s.angle),ny=Math.cos(s.angle);
  let fired=false;
  for(const side of [-1,1]){
    const origin={x:e.x+nx*offset*side,y:e.y+ny*offset*side},originFoot={x:origin.x,y:origin.y+groundOffset(e)};
    if(!game.terrain.isFree(originFoot.x,originFoot.y,8)||!clearLine(game,s.a,originFoot))continue;
    fired=cast(game,e,'tidalWave',s,{origin,range:p.waveRange,radius:p.waveWidth*.5,speed:p.waveSpeed,duration:p.waveDuration,damage:e.damage*p.waveDamage,windup:p.windup},p.windup+p.waveDuration+p.cycleRecovery)||fired;
  }
  return fired;
}
function startFrost(game,e,s,p){
  const step=e.specialStep%4;
  if(step===0){
    let fired=false;
    for(let i=0;i<p.fanCount;i++)fired=cast(game,e,'frostbolt',s,{angle:s.angle+(i-(p.fanCount-1)*.5)*p.fanSpread/Math.max(1,p.fanCount-1),range:p.boltRange,damage:e.damage*p.fanDamage,speed:p.fanSpeed,windup:p.windup,freezeChance:0},p.windup+p.recovery)||fired;
    return fired;
  }
  if(step===1){begin(e,'frostCharge',p.windup,s,{length:Math.min(p.chargeLength,p.chargeSpeed*p.chargeDuration),distance:0,r:e.r});return true;}
  if(step===2){
    e.specialMarks.forEach((m,i)=>{m.delay=m.maxDelay=p.shatterDelay+i*p.shatterInterval;});
    begin(e,'shatter',p.shatterDelay+e.specialMarks.length*p.shatterInterval,s,{circles:[]});return true;
  }
  return cast(game,e,'frostRing',s,{radius:p.frostRadius,damage:e.damage*p.frostDamage,windup:p.windup},p.windup+p.cycleRecovery);
}
function startFurnace(game,e,s,p){
  const step=e.specialStep%4;
  if(step===0){begin(e,'furnaceMarch',p.windup,s,{length:Math.min(p.marchLength,e.speed*p.marchSpeedMultiplier*p.marchDuration),distance:0,r:e.r});return true;}
  if(step===1){
    e.specialMarks.forEach((m,i)=>{m.delay=m.maxDelay=p.eruptionDelay+i*p.eruptionInterval;});
    begin(e,'eruption',p.eruptionDelay+e.specialMarks.length*p.eruptionInterval,s,{circles:[]});return true;
  }
  if(step===2)return cast(game,e,'fireball',s,{range:p.fireballRange,damage:e.damage*p.fireballDamage,windup:p.windup},p.windup+p.recovery);
  return cast(game,e,'flameStream',s,{range:p.flameRange,spread:p.flameSpread,duration:p.flameDuration,damage:e.damage*p.flameDamage,windup:p.windup},p.windup+p.flameDuration+p.cycleRecovery);
}
const START=Object.freeze({broodmother:startBrood,deepcaller:startDeep,frostcrown:startFrost,furnace:startFurnace});
// Each pattern owns its engagement distance. Future patterns can deliberately
// use longer reaches without inheriting the current close/mid-range balance.
const ATTACK_RANGES=Object.freeze({
  broodmother:['domainRange','summonRange','leapRange'],
  deepcaller:['strikeRange','vortexRange','waveActivationRange'],
  frostcrown:['fanRange','chargeRange','shatterRange','frostRange'],
  furnace:['marchRange','eruptionRange','fireballActivationRange','flameActivationRange']
});

function updateMovingAttack(game,e,a,p,dt){
  const start=foot(e),life=Math.min(dt,a.life),duration=a.maxLife;
  if(a.kind==='leap'){
    const remaining=Math.max(.001,a.life),ratio=Math.min(1,life/remaining);
    const moved=game._moveEntity(e,(a.destination.x-start.x)*ratio,(a.destination.y-start.y)*ratio);
    e.specialLift=Math.sin(Math.PI*(1-(a.life-life)/duration))*45;
    if(moved.blocked)a.life=0;
  }else{
    const speed=(a.kind==='frostCharge'?p.chargeSpeed:e.speed*p.marchSpeedMultiplier)*(game.environment?.movementMultiplier(e)||1)*(game._branchMovementMultiplier?.(e)||1);
    const step=Math.min(speed*life,Math.max(0,a.length-a.distance));
    const moved=game._moveEntity(e,Math.cos(a.angle)*step,Math.sin(a.angle)*step),at=foot(e);
    a.distance+=Math.hypot(at.x-start.x,at.y-start.y);
    if(!a.lastMark||Math.hypot(at.x-a.lastMark.x,at.y-a.lastMark.y)>=p.markSpacing){mark(e,a.kind==='frostCharge'?'ice':'heat',at.x,at.y,p);a.lastMark=at;}
    if(a.kind==='frostCharge')a.segment={x:start.x,y:start.y,x2:at.x,y2:at.y};
    if(moved.blocked||a.distance>=a.length-1e-6)a.life=0;
  }
  a.life=Math.max(0,a.life-life);
}
export function updateSpecialistBoss(game,e,dt){
  if(!active(game,e)){if(e.hp<=0||e.guardActive===false)clearSpecialistBoss(e);return true;}
  if(game.abilities?.isFrozen(e))return true;
  if(!(dt>0))return true;
  e.specialVisualTime=(e.specialVisualTime||0)+dt;
  if(e.specialVisualStrikes){
    e.specialVisualStrikes.life=Math.max(0,e.specialVisualStrikes.life-dt);
    for(const circle of e.specialVisualStrikes.circles)circle.visualAge=(circle.visualAge||0)+dt;
    if(e.specialVisualStrikes.life<=0)e.specialVisualStrikes=null;
  }
  const p=rules(e),s=targetState(game,e);
  e.specialSummons=(e.specialSummons||[]).filter(child=>child.hp>0);
  for(const m of e.specialMarks){m.life=Math.max(0,m.life-dt);if(m.delay!==null)m.delay=Math.max(0,m.delay-dt);}
  e.specialMarks=e.specialMarks.filter(m=>m.life>0);
  const attack=e.specialAttack;
  if(attack){
    if(attack.phase==='rush')updateMovingAttack(game,e,attack,p,dt);
    else if(attack.phase==='strikes')for(const c of attack.circles){c.delay=Math.max(0,c.delay-dt);if(c.done)c.visualAge=(c.visualAge||0)+dt;}
    else attack.life=Math.max(0,attack.life-dt);
    return true;
  }
  e.specialRecovery=Math.max(0,e.specialRecovery-dt);
  if(e.specialRecovery>0)return true;
  e.specialPose=null;e.specialCooldown=Math.max(0,e.specialCooldown-dt);
  const sequence=ATTACK_RANGES[e.bossKind],attackRange=p[sequence[e.specialStep%sequence.length]],visible=game._inView(e),line=clearLine(game,s.a,s.b,'sight');
  if(e.specialCooldown<=0&&visible&&s.distance<=attackRange&&line){
    if(START[e.bossKind](game,e,s,p)){e.specialStep++;e.specialCooldown=p.cooldown;return true;}
    // A blocked landing or exhausted effect budget must not lock a Boss into
    // an unusable step. Reposition and retry without consuming its attack.
    game._moveEnemy(e,dt*p.moveMultiplier);return true;
  }
  if(!visible||s.distance>Math.min(p.preferredRange,attackRange)||!line)game._moveEnemy(e,dt*p.moveMultiplier);
  return true;
}
function summon(game,e,p){
  const type=p.summonType,r=enemyDefinition(type).r,alive=game.enemies.filter(child=>child.hp>0&&child.summoned);
  const room=Math.max(0,Math.min(p.summonCount,p.summonCap-e.specialSummons.length,p.summonGlobalCap-alive.length,p.enemyCap-game.enemies.length));
  let count=0;
  for(let attempt=0;attempt<p.summonAttempts&&count<room;attempt++){
    const angle=attempt*2.399963229728653+e.phase,origin=foot(e),distance=p.summonRadius+Math.floor(attempt/6)*r*2;
    const point={x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance};
    if(!game.terrain.isFree(point.x,point.y,r+3)||game.terrain.island?.isDry(point.x,point.y,r+3)===false||!clearLine(game,origin,point))continue;
    if(friendlyTargets(game).some(t=>isFriendlyActive(game,t)&&Math.hypot(point.x-t.x,point.y-friendlyFoot(t).y)<p.summonClearance+r))continue;
    if(game.enemies.some(t=>t.hp>0&&Math.hypot(point.x-t.x,point.y-foot(t).y)<r+t.r+4))continue;
    const child=game._spawnEnemy(type,1);if(!child)continue;
    child.x=point.x;child.y=point.y-groundOffset(child);child.summoned=true;child.summonerId=e.id;child.xp=0;child._navTimer=0;
    game.abilities?.visualBurst?.({abilityId:'spiderHatch',visualVariant:'web',parameters:{radius:r*1.3},angle:0,hostile:true,groundOffset:groundOffset(child)},child,'landing');
    e.specialSummons.push(child);count++;
  }
}
function chargeImpact(game,e,a,p){
  const line=a.segment;if(!line)return;a.segment=null;
  const dx=line.x2-line.x,dy=line.y2-line.y,len2=dx*dx+dy*dy;
  a.hitIds??=new Set();
  for(const target of friendlyTargets(game)){
    if(a.hitIds.has(target)||!isFriendlyActive(game,target)||!isGrounded(target))continue;
    const at=friendlyFoot(target),t=len2?Math.max(0,Math.min(1,((at.x-line.x)*dx+(at.y-line.y)*dy)/len2)):0;
    const contact=isFrostcrownBody(e)?Number.isFinite(frostcrownGroundSweep(e,line,at,target.r)):Math.hypot(at.x-line.x-dx*t,at.y-line.y-dy*t)<=e.r+target.r;
    if(!contact||!clearLine(game,foot(e),at))continue;
    a.hitIds.add(target);damageFriendly(game,target,e.damage*p.chargeDamage,e);
  }
}
export function resolveSpecialistBoss(game,e){
  if(!active(game,e)){if(e.hp<=0||e.guardActive===false)clearSpecialistBoss(e);return;}
  if(game.abilities?.isFrozen(e))return;
  const p=rules(e);
  for(const m of e.specialMarks)if(m.delay!==null&&m.delay<=0){impact(game,e,m,p.markDamage,m.kind==='ice'?'#c4edf5':'#ffb17b');m.life=0;}
  e.specialMarks=e.specialMarks.filter(m=>m.life>0);
  const a=e.specialAttack;if(!a)return;
  if(a.phase==='rush'){
    if(a.kind==='frostCharge')chargeImpact(game,e,a,p);
    if(a.life>0)return;
    if(a.kind==='leap')impact(game,e,{...foot(e),r:p.leapRadius},p.leapDamage,'#c5a5e3');
    recover(e,a.kind==='leap'?p.cycleRecovery:p.recovery);return;
  }
  if(a.phase==='strikes'){
    for(const c of a.circles)if(!c.done&&c.delay<=0){impact(game,e,c,p.strikeDamage,'#9bd9df');c.done=true;c.visualAge=0;}
    if(a.circles.every(c=>c.done))recover(e,p.recovery);
    return;
  }
  if(a.life>0)return;
  if(a.kind==='leap'||a.kind==='frostCharge'||a.kind==='furnaceMarch'){
    a.phase='rush';a.life=a.maxLife=a.kind==='leap'?p.leapDuration:a.kind==='frostCharge'?p.chargeDuration:p.marchDuration;
    if(a.kind!=='leap'){a.lastMark=foot(e);mark(e,a.kind==='frostCharge'?'ice':'heat',a.lastMark.x,a.lastMark.y,p);}
    return;
  }
  if(a.kind==='tentacles'){a.phase='strikes';return;}
  if(a.kind==='summon')summon(game,e,p);
  recover(e,p.recovery);
}
