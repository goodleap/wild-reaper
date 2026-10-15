import { groundOffset } from './terrain.js';
import { movementProfile } from './height-rules.js';

// An alarm shares readiness, never a compulsory target or attack timer.
export function activateCombatGroup(members,activate){
  for(const member of members||[])if(member.hp>0&&member.state!=='recovering'&&member.state!=='left')activate(member);
}
const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!(e.isCompanion||e.heroId))});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function provokeEnemyGroup(game,enemy){
  const field=['rescueId','settlementId','eventId','dungeonId'].find(key=>enemy[key]);
  if(!field)return false;
  const same=other=>other[field]===enemy[field]&&(field!=='dungeonId'||other.dungeonRoom===enemy.dungeonRoom);
  activateCombatGroup(game.enemies.filter(same),member=>{
    if(member.rescueSpawnGrace>0)return;
    member._groupProvokedUntil=(game._clock||0)+3;member.guardActive=true;member.guardReturnTarget=null;
  });
  return true;
}
export function enemyGroupProvoked(game,enemy,center,leash){
  return (enemy._groupProvokedUntil||0)>(game._clock||0)&&(!center||distance(foot(enemy),center)<leash);
}

// A short, checked step creates shooting room during cooldown. No reverse
// teleport, forced cast cancellation, or unbounded kite destination is used.
export function retreatPoint(game,entity,target,{minimum=85,preferred=140,center=null,leash=Infinity}={}){
  if(!target||!(entity.hp>0))return null;
  const from=foot(entity),threat=foot(target),gap=distance(from,threat);
  if(gap>=minimum)return null;
  const angle=gap>.01?Math.atan2(from.y-threat.y,from.x-threat.x):(entity.id||0)*2.399963;
  const step=Math.min(64,Math.max(24,preferred-gap)),r=entity.r+2,profile=movementProfile(entity);
  for(const offset of [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2]){
    const point={x:from.x+Math.cos(angle+offset)*step,y:from.y+Math.sin(angle+offset)*step};
    if(distance(point,threat)<gap+12||center&&distance(point,center)>leash)continue;
    if(!game.terrain.isFree(point.x,point.y,r,profile)||game.terrain.firstBlocker(from.x,from.y,point.x,point.y,r,profile))continue;
    if(game.environment?.isHazardFree?.(point.x,point.y,r)===false)continue;
    if(profile==='ground'&&game.environment?.watersInBounds?.({minX:point.x-r,minY:point.y-r,maxX:point.x+r,maxY:point.y+r})?.length)continue;
    return point;
  }
  return null;
}

export function retreatRangedEnemy(game,enemy,target,dt,range){
  const group=enemy.territoryId&&game.territories?.byId.get(enemy.territoryId);
  const point=retreatPoint(game,enemy,target,{minimum:Math.min(100,range*.4),preferred:range*.65,center:group||enemy.portalHome||enemy.rescueHome,leash:group?360:260});
  if(!point)return false;
  game._moveEnemy(enemy,dt,point);return true;
}
