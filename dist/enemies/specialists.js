import { getConfigSection } from '../content-config.js';
import { friendlyFoot, selectFriendlyTarget, clearFriendlyPath, damageFriendly, isFriendlyActive } from '../friendly-combat.js';
import { circleImpact } from '../combat-attacks.js';
import { isGrounded } from '../height-rules.js';

export const SPECIALIST_RULES=getConfigSection('enemies').specialistRules;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const profile=e=>SPECIALIST_RULES[e.type];
function phase(s,name,time){s.phase=name;s.timer=s.maxTime=time;s.noContact=name!=='idle';}
export function initializeSpecialist(e){
  const rule=profile(e);
  e.specialist={phase:'idle',timer:0,maxTime:0,angle:0,aimX:e.x,aimY:e.y,cooldown:rule.initialCooldown+(e.id%5)*.17,noContact:false};
}
function move(game,e,angle,speed,dt){
  const elapsed=Math.max(0,dt-(e._weaponPushTime||0));
  const scale=(game.environment?.movementMultiplier(e)||1)*(game._branchMovementMultiplier?.(e)??1);
  return game._moveEntity(e,Math.cos(angle)*speed*elapsed*scale,Math.sin(angle)*speed*elapsed*scale);
}
function canStart(game,e,target,rule){
  return game._inView(e)&&Math.hypot(target.x-e.x,target.y-e.y)<=rule.range&&
    (!e.dungeonId||game.dungeon?.canDamage(e,target)!==false)&&clearFriendlyPath(game,e,target,'sight');
}
function cast(game,e,target,rule,s){
  if(!game.abilities?.cast)return false;
  const options={target,point:{x:s.aimX,y:s.aimY},angle:s.angle,damage:e.damage*rule.damageMultiplier,
    range:rule.range,windup:rule.windup,rank:1};
  for(const key of ['radius','duration','tickInterval','slowMultiplier','slowDuration'])if(rule[key]!==undefined)options[key]=rule[key];
  if(rule.speed!==undefined)options.speed=rule.speed;
  let accepted=false;
  const count=rule.mode==='fan'?rule.count:1;
  for(let i=0;i<count;i++)accepted=game.abilities.cast(rule.abilityId,e,{...options,angle:s.angle+(count===1?0:(i/(count-1)-.5)*rule.spread)})||accepted;
  return accepted;
}

// Each specialist owns only its movement/attack cadence. Damage geometry and
// telegraph lifetime are provided by the shared ability executor.
export function updateSpecialist(game,e,dt){
  const rule=profile(e);if(!rule)return false;
  if(!e.specialist)initializeSpecialist(e);
  const s=e.specialist;s.segment=null;s.cooldown=Math.max(0,s.cooldown-dt);
  const target=selectFriendlyTarget(game,e);
  if(s.phase==='recovery'){
    s.timer=Math.max(0,s.timer-dt);
    if(s.timer<=0)phase(s,'idle',0);
    return true;
  }
  if(s.phase==='windup'){
    s.timer=Math.max(0,s.timer-dt);
    if(s.timer<=0){
      if(rule.mode==='pounce'||rule.mode==='strafe'||rule.mode==='shield')phase(s,'active',rule.duration);
      else if(rule.abilityId==='shortFlame')phase(s,'active',rule.duration);
      else phase(s,'recovery',rule.recovery);
    }
    return true;
  }
  if(s.phase==='active'){
    s.timer=Math.max(0,s.timer-dt);
    if(rule.mode==='pounce'){
      const from=friendlyFoot(e),remaining=Math.hypot(s.aimX-e.x,s.aimY-e.y);
      const moved=move(game,e,s.angle,Math.min(rule.speed,remaining/Math.max(dt,.001)),dt),to=friendlyFoot(e);
      s.segment={x:from.x,y:from.y,x2:to.x,y2:to.y};
      if(moved.blocked||remaining<4||s.timer<=0)phase(s,'recovery',rule.recovery);
    }else if(rule.mode==='strafe'){
      const moved=move(game,e,s.moveAngle,rule.speed,dt);
      if(moved.blocked||s.timer<=0){
        // Release at the previously locked point: no instant tracking turn.
        const angle=Math.atan2(s.aimY-e.y,s.aimX-e.x);
        if(game._inView(e))game.abilities?.cast(rule.abilityId,e,{point:{x:s.aimX,y:s.aimY},angle,
          damage:e.damage*rule.damageMultiplier,windup:0,speed:rule.projectileSpeed,range:rule.range,radius:rule.radius});
        phase(s,'recovery',rule.recovery);
      }
    }else if(rule.mode==='shield'){
      const targetAngle=Math.atan2(target.y-e.y,target.x-e.x);
      s.angle+=clamp(angleDelta(s.angle,targetAngle),-rule.turnSpeed*dt,rule.turnSpeed*dt);
      move(game,e,s.angle,e.speed*rule.speedMultiplier,dt);
      s.noContact=false;
      if(s.timer<=0)phase(s,'recovery',rule.recovery);
    }else if(s.timer<=0)phase(s,'recovery',rule.recovery);
    return true;
  }
  const distance=Math.hypot(target.x-e.x,target.y-e.y);
  if(!canStart(game,e,target,rule))return false;
  if(s.cooldown>0)return distance<=rule.holdRange;
  if(rule.minRange&&distance<rule.minRange)return false;
  s.aimX=target.x;s.aimY=target.y;
  if(rule.predictTime){
    s.aimX+=(Number.isFinite(target.vx)?target.vx:0)*rule.predictTime;
    s.aimY+=(Number.isFinite(target.vy)?target.vy:0)*rule.predictTime;
  }
  s.angle=Math.atan2(s.aimY-e.y,s.aimX-e.x);
  s.moveAngle=s.angle+(e.id%2?1:-1)*Math.PI/2;
  s.hitIds=[];
  if(rule.mode==='cast'||rule.mode==='fan'){
    if(!cast(game,e,target,rule,s)){s.cooldown=.4;return distance<=rule.holdRange;}
  }
  s.cooldown=rule.cooldown;phase(s,'windup',rule.windup);
  return true;
}

export function resolveSpecialist(game,e,{targets}){
  const s=e.specialist,rule=profile(e),segment=s?.segment;if(!segment)return;
  s.segment=null;
  for(const target of targets){
    if(!isFriendlyActive(game,target)||!isGrounded(target)||s.hitIds.includes(target.id??'player'))continue;
    const p=friendlyFoot(target);
    if(circleImpact(segment.x,segment.y,segment.x2-segment.x,segment.y2-segment.y,p.x,p.y,e.r+target.r)<Infinity&&clearFriendlyPath(game,e,target,'ground')){
      s.hitIds.push(target.id??'player');damageFriendly(game,target,e.damage*rule.damageMultiplier,e);
    }
  }
}

export function specialistDamageMultiplier(enemy,origin,source='raw'){
  const rule=profile(enemy),s=enemy.specialist;
  if(rule?.mode!=='shield'||s?.phase!=='active'||!Number.isFinite(origin?.x)||!Number.isFinite(origin?.y))return 1;
  if(['bleed','burn','burning','pulse','echo','companionPulse','companionEcho','storm','angel'].includes(source))return 1;
  const incoming=Math.atan2(origin.y-enemy.y,origin.x-enemy.x);
  return Math.abs(angleDelta(s.angle,incoming))<=rule.frontHalfAngle?rule.frontDamageMultiplier:1;
}
