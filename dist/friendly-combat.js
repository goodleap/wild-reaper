import { groundOffset } from './terrain.js';
import { isGrounded } from './height-rules.js';
import { enemyDefinition } from './enemy-definitions.js';
import { bossDefinition } from './boss-definitions.js';

export const FRIENDLY_COMBAT_RULES=Object.freeze({retargetInterval:.2,allyLeash:420,acquireRange:460});
export function friendlyFoot(entity){
  const offset=groundOffset(entity,!!(entity.heroId||entity.isCompanion));
  return {x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+(Number.isFinite(offset)?offset:0)};
}
export function isFriendlyActive(game,entity){
  return !!entity&&entity.hp>0&&(entity===game.player||entity.isCompanion&&entity.state!=='recovering'&&entity.state!=='left'&&game.companions?.members?.includes(entity));
}

// A small, shared snapshot avoids building one party array for every enemy.
// Health/state are still validated at use time when a hit downs a companion.
export function friendlyTargets(game){
  const members=game.companions?.members||[];
  const cached=game._friendlySnapshot;
  if(cached&&cached.clock===game._clock&&cached.members===members&&cached.count===members.length)return cached.targets;
  const targets=[game.player,...members];
  game._friendlySnapshot={clock:game._clock,members,count:members.length,targets};
  return targets;
}

export function clearFriendlyPath(game,origin,target,profile='sight',radius=0){
  const a=friendlyFoot(origin),b=friendlyFoot(target);
  return !game.terrain?.firstBlocker(a.x,a.y,b.x,b.y,radius,profile);
}

function canPursue(enemy,target){
  return isGrounded(target)||!isGrounded(enemy)||enemyDefinition(enemy.type).ranged===true||(enemy.type==='boss'&&bossDefinition(enemy.bossKind).canTargetAir===true);
}

// Ordinary enemies continue pursuing the hero around cover. Optional ally
// targets must actually be visible and near the hero, never in sealed rooms.
export function selectFriendlyTarget(game,enemy){
  const p=game.player,members=game.companions?.members;
  if(!members?.length||enemy.isCompanion)return p;
  const cached=enemy._friendlyTarget,now=game._clock||0;
  if(now<(enemy._friendlyRetargetAt||0)&&isFriendlyActive(game,cached)&&
    (cached===p||members.includes(cached))&&canPursue(enemy,cached))return cached;
  enemy._friendlyRetargetAt=now+FRIENDLY_COMBAT_RULES.retargetInterval+(enemy.id%4)*.013;
  const from=friendlyFoot(enemy),hero=friendlyFoot(p);
  let target=p,best=(hero.x-from.x)**2+(hero.y-from.y)**2;
  for(const ally of members){
    if(!isFriendlyActive(game,ally)||!canPursue(enemy,ally)||game._inView?.(ally,80)===false)continue;
    const point=friendlyFoot(ally),distance=(point.x-from.x)**2+(point.y-from.y)**2;
    const score=distance*(ally===cached ? .85 : 1);
    if(score>=best||distance>FRIENDLY_COMBAT_RULES.acquireRange**2||
      (point.x-hero.x)**2+(point.y-hero.y)**2>FRIENDLY_COMBAT_RULES.allyLeash**2)continue;
    if(enemy.dungeonId&&game.dungeon?.canDamage(enemy,ally)===false)continue;
    if(!clearFriendlyPath(game,enemy,ally))continue;
    best=score;target=ally;
  }
  // This is a live cache, not part of an enemy's serializable combat state.
  Object.defineProperty(enemy,'_friendlyTarget',{value:target,writable:true,configurable:true,enumerable:false});return target;
}

export function damageFriendly(game,target,amount,source){
  if(!isFriendlyActive(game,target)||game.status!=='playing')return false;
  if(target===game.player)return game._hurtPlayer(amount,source);
  return !!game.companions?.takeDamage(target,amount,typeof source==='string'?source:source?.type||'enemy',source);
}
