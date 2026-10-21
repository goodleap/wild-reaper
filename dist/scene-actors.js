import { groundOffset } from './terrain.js';
import { clearBossAttacks } from './bosses.js';
import { resetLocomotion } from './locomotion.js';

// Doors and authored scene links share the same actor handoff. Persistent
// enemies and drops remain in their owner; transient combat never crosses it.
export function clearSceneActors(g){
  g.realms?.cancel('scene-change');g.attacks?.clearTrails();g.bullets=[];g.enemyBullets=[];g.effects=[];g.orbitals=[];g.storm=null;g._pulseEchoes=[];g._grid.clear();
  g.superSkills?.clearScene();g.barrier?.clearScene();g.abilities?.clearScene();
  for(const member of g.companions?.members||[])member._echoes=[];
  for(const enemy of g.enemies){enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;enemy.slam=null;enemy._groupProvokedUntil=0;clearBossAttacks(enemy);enemy._navTimer=0;enemy._navObstacle=null;}
}
export function placeScenePlayer(g,point,arrival=null){
  const p=g.player;p.x=point.x;p.y=point.y-groundOffset(p,true);g._moveEntity(p,0,0,true);p.invuln=Math.max(p.invuln,2);p.hurtFlash=0;resetLocomotion(p);
  if(arrival){p.facing=Math.atan2(arrival.direction.y,arrival.direction.x);g.companions?.onSceneChange?.(arrival);}
}
