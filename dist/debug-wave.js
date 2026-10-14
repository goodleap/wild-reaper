import { groundOffset } from './terrain.js';
import { enemyDefinition } from './enemy-definitions.js';
import { DEBUG_WAVE_TYPES } from './encounter-definitions.js';

const TAU=Math.PI*2;
export const DEBUG_WAVE_RULES=Object.freeze({count:40,minRadius:220,maxRadius:305,entranceGap:Math.PI/2});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function segmentDistance(point,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}

// An explicit debug-only cohort, created once per run after structures and the
// spawn angel exist. Reentering a world or rebuilding its sites never refills it.
export function spawnDebugWave(game) {
  if(game.debug!==true||game._debugWaveSpawned||(game.regionIndex!==0&&!game.stage)||game.dungeon?.active)return [];
  game._debugWaveSpawned=true;
  const origin={x:game.player.x,y:game.player.y+groundOffset(game.player,true)};
  const castle=game.settlements?.sites.find(site=>site.type==='castle');
  const gate=castle?.door,gateAngle=gate?Math.atan2(gate.y-origin.y,gate.x-origin.x):-Math.PI/2;
  const {count,entranceGap}=DEBUG_WAVE_RULES,arc=TAU-entranceGap;
  const points=[];
  for(let i=0;i<count;i++) {
    const type=DEBUG_WAVE_TYPES[i%DEBUG_WAVE_TYPES.length],r=enemyDefinition(type).r;
    const angle=gateAngle+entranceGap*.5+(i+.5)*arc/count;
    const radii=i%2?[285,250,305,220]:[250,285,220,305];
    let chosen=null;
    for(const jitter of [0,.035,-.035,.07,-.07]) {
      for(const radius of radii) {
        const a=angle+jitter,point={x:origin.x+Math.cos(a)*radius,y:origin.y+Math.sin(a)*radius};
        if(!game.terrain.isFree(point.x,point.y,r+3)||game.terrain.island?.isDry(point.x,point.y,r+3)===false)continue;
        // Preserve the castle approach and reject trapped starts; enemies may
        // still naturally flow around one another once ordinary AI takes over.
        if(gate&&segmentDistance(point,origin,gate)<r+45)continue;
        if(game.terrain.firstBlocker(origin.x,origin.y,point.x,point.y,r+2))continue;
        if(game.settlements?._hazardFree(point.x,point.y,r)===false)continue;
        if(points.some(other=>distance(point,other)<r+other.r+3))continue;
        chosen={...point,type,r};break;
      }
      if(chosen)break;
    }
    // A deliberately sealed custom map may fit fewer enemies. Never move an
    // obstacle or force a monster into the player just to reach the target.
    if(chosen)points.push(chosen);
  }
  // The four initial slimes are the only replaceable enemies here. All guarded
  // objectives, including the dormant regional Boss, retain their identities.
  game.enemies=game.enemies.filter(enemy=>!(enemy.id<=4&&enemy.type==='slime'&&!enemy.portalId&&!enemy.guardianId&&!enemy.eventId&&!enemy.rescueId&&!enemy.settlementId&&!enemy.relicSiteId));
  const spawned=[];
  for(const point of points.slice(0,Math.max(0,180-game.enemies.length))) {
    const enemy=game._spawnEnemy(point.type,1);
    enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);
    enemy.debugWave=true;
    spawned.push(enemy);
  }
  return spawned;
}
