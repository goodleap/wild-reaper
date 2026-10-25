import { getConfigSection } from '../content-config.js';
import { bossDefinition } from '../boss-definitions.js';
import { friendlyFoot, friendlyTargets, selectFriendlyTarget, isFriendlyActive, clearFriendlyPath, damageFriendly } from '../friendly-combat.js';
import { isGrounded } from '../height-rules.js';
import { retreatRangedEnemy } from '../combat-tactics.js';
import { capsuleHitsCircle } from '../attack-capsule.js';
import { humanAttackCapsules } from '../royal-attack-geometry.js';

export const HUMAN_RULES=getConfigSection('enemies').humanRules||{};
const ruleFor=e=>e.type==='boss'?bossDefinition(e.bossKind).parameters:HUMAN_RULES[e.type];
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function initializeHuman(e){e.specialist={phase:'idle',timer:0,maxTime:0,noContact:true};e.humanCooldown=ruleFor(e).initialCooldown;e.humanSequence=0;}
export function initializeHumanBoss(e){e.r=bossDefinition(e.bossKind).r;clearHumanBoss(e);e.humanCooldown=ruleFor(e).initialCooldown;e.humanSequence=0;}
export function clearHumanBoss(e){e.specialAttack=null;e.specialRecovery=0;e.specialPose='';e.specialist={phase:'idle',noContact:true};}

function start(game,e,target,r){
  const p=friendlyFoot(e),t=friendlyFoot(target),angle=Math.atan2(t.y-p.y,t.x-p.x);
  const second=e.type==='boss'&&(e.humanSequence++%2===1);
  const kind=e.type==='royalarbalist'?'royalBolt':e.type==='royalmage'?'royalSpell':e.type==='royalguard'?'royalSweep':
    e.bossKind==='escortmarshal'?(second?'royalSweep':'royalVolley'):e.bossKind==='searchcaptain'&&!second?'royalSweep':'royalThrust';
  const windup=second?r.secondWindup:r.windup;
  const a={kind,phase:'windup',x:p.x,y:p.y,angle,reach:second?r.secondReach:r.reach,width:r.width,
    arc:r.arc||1.1,life:windup,maxLife:windup,timer:windup,maxTime:windup,noContact:true};
  if(kind==='royalSpell'&&!game.abilities?.cast('fireball',e,{target,angle,range:r.reach,windup:r.windup,
    damage:e.damage*r.damageMultiplier,radius:7,speed:270,duration:1.2,burnDamage:0,burnDuration:0}))return false;
  if(e.type==='boss')e.specialAttack=a;else e.specialist=a;
  e.humanCooldown=r.cooldown;e.visualFacing=angle;game._emit?.('humanWindup',{enemyId:e.id,kind});return true;
}

// Human troops share target acquisition, path checks, status handling and
// projectiles with the ordinary combat loop. Their locked attacks leave a
// recovery window; touching a soldier is not a second, unannounced attack.
export function updateHuman(game,e,dt){
  const r=ruleFor(e);if(!r)return false;
  if(game.status!=='playing'||e.hp<=0||e.guardActive===false)return true;
  if(!e.specialist){if(e.type==='boss')e.specialist={phase:'idle',noContact:true};else initializeHuman(e);}
  const s=e.type==='boss'?e.specialAttack:e.specialist;
  e.humanCooldown=Math.max(0,(e.humanCooldown||0)-dt);
  if(e.type==='boss'&&e.specialRecovery>0){e.specialRecovery=Math.max(0,e.specialRecovery-dt);return true;}
  if(s?.phase==='recovery'){
    s.timer=Math.max(0,s.timer-dt);if(!s.timer)s.phase='idle';return true;
  }
  if(s?.phase==='windup'){s.life=s.timer=Math.max(0,s.life-dt);return true;}
  // Melee cooldowns need only the shared chase movement, not a second sight
  // query on every frame. Ranged troops still check cover before holding ground.
  if(e.humanCooldown>0&&!r.ranged)return false;
  const target=selectFriendlyTarget(game,e),from=friendlyFoot(e),to=friendlyFoot(target),d=Math.hypot(to.x-from.x,to.y-from.y);
  const range=e.type==='boss'?Math.min(r.range,e.humanSequence%2===1?r.secondReach:r.reach):r.range;
  if(!game._inView(e)||d>range||!isFriendlyActive(game,target)||!clearFriendlyPath(game,e,target,'sight')||
    e.dungeonId&&game.dungeon?.canDamage(e,target)===false)return false;
  if(e.humanCooldown<=0)return start(game,e,target,r);
  if(r.ranged){if(retreatRangedEnemy(game,e,target,dt,r.range))return true;return d<=r.holdRange;}
  return false;
}

export function resolveHuman(game,e){
  const a=e.type==='boss'?e.specialAttack:e.specialist,r=ruleFor(e);
  if(!r||e.hp<=0||e.guardActive===false||a?.phase!=='windup'||a.life>0||game.status!=='playing')return;
  if(a.kind==='royalBolt'){
    if(game._inView(e)&&game.enemyBullets.length<getConfigSection('difficulty').balance.maxEnemyBullets){
      game.enemyBullets.push({id:++game._id,ownerId:e.id,type:'royalBolt',x:a.x,y:a.y,r:4,
        vx:Math.cos(a.angle)*350,vy:Math.sin(a.angle)*350,life:r.reach/350,maxLife:r.reach/350,color:'#d7bd85',damage:e.damage*r.damageMultiplier});
    }
  }else if(a.kind!=='royalSpell'){
    const capsules=humanAttackCapsules(a);
    for(const target of friendlyTargets(game)){
      if(!isFriendlyActive(game,target)||!isGrounded(target)||e.dungeonId&&game.dungeon?.canDamage(e,target)===false)continue;
      const p=friendlyFoot(target),dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy);
      const hit=a.kind==='royalSweep'?d<=a.reach+target.r&&Math.abs(angleDelta(Math.atan2(dy,dx),a.angle))<=a.arc:
        capsules.some(c=>capsuleHitsCircle(c,p.x,p.y,target.r));
      if(hit&&!game.terrain.firstBlocker(a.x,a.y,p.x,p.y,0,'ground'))damageFriendly(game,target,e.damage*r.damageMultiplier,e);
    }
    game._effect?.(a.x+Math.cos(a.angle)*a.reach*.5,a.y+Math.sin(a.angle)*a.reach*.5,'ring',.2,a.width*1.7,'#e0bb89');
  }
  game._emit?.('humanAttack',{enemyId:e.id,kind:a.kind});
  if(e.type==='boss'){e.specialPose=a.kind;e.specialAttack=null;e.specialRecovery=e.specialRecoveryMax=r.recovery;}
  else e.specialist={phase:'recovery',timer:r.recovery,maxTime:r.recovery,noContact:true,angle:a.angle};
}

export function humanGuardMultiplier(e,origin,source){
  const r=HUMAN_RULES[e.type];
  if(!r?.guardDamageMultiplier||e.guardActive===false||e.specialist?.phase!=='idle'||!Number.isFinite(origin?.x)||!Number.isFinite(origin?.y))return 1;
  if(['bleed','burn','burning','pulse','echo','companionPulse','companionEcho','storm','angel','storyJudgment'].includes(source))return 1;
  return Math.abs(angleDelta(Math.atan2(origin.y-e.y,origin.x-e.x),e.visualFacing||0))<=r.guardArc?r.guardDamageMultiplier:1;
}
