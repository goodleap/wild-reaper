import { groundOffset } from './terrain.js';
import { ENEMY_IDS, enemyDefinition } from './enemy-definitions.js';
import { DEBUG_WAVE_TYPES } from './encounter-definitions.js';

const TAU=Math.PI*2;
export const DEBUG_WAVE_RULES=Object.freeze({count:40,minRadius:220,maxRadius:305,entranceGap:Math.PI/2});
export const DEBUG_MONSTER_TYPES=Object.freeze(ENEMY_IDS.filter(type=>type!=='boss'));
export const DEBUG_MONSTER_RULES=Object.freeze({interval:.2,batchSize:16,initialCount:64,maxEnemies:320});

// Use the current viewport on every batch, including after a resize or a world
// transition. Failed coastal sides try other sides, never an on-screen fallback.
export function updateDebugMonsterStream(game,dt) {
  if(game.debug!==true||game.debugOptions?.allMonsters!==true||game.status!=='playing'||game.dungeon?.active||game.sceneTransition?.active||!(dt>0))return [];
  const state=game._debugMonsterStream??={remaining:0,cursor:0,started:false};
  state.remaining-=dt;
  if(state.remaining>1e-9)return [];
  state.remaining=DEBUG_MONSTER_RULES.interval;
  const count=state.started?DEBUG_MONSTER_RULES.batchSize:DEBUG_MONSTER_RULES.initialCount;
  state.started=true;
  const spawned=[];
  let available=DEBUG_MONSTER_RULES.maxEnemies-game.enemies.filter(enemy=>enemy.hp>0).length;
  for(let i=0;i<count&&available>0;i++) {
    const cursor=state.cursor++,type=DEBUG_MONSTER_TYPES[cursor%DEBUG_MONSTER_TYPES.length];
    const side=(cursor+Math.floor(cursor/DEBUG_MONSTER_TYPES.length))%4;
    const along=((Math.floor(cursor/4)%8)-3.5)/4.5;
    const edgeDirections=[[1,along],[along,1],[-1,along],[along,-1]];
    let point=null;
    for(let offset=0;offset<4&&!point;offset++) {
      const [x,y]=edgeDirections[(side+offset)%4];
      const angle=Math.atan2(y*Math.max(1,game.viewHeight),x*Math.max(1,game.viewWidth));
      point=game._findSpawnPoint(type,angle);
    }
    if(!point)continue;
    const enemy=game._spawnEnemy(type,1);
    enemy.x=point.x;enemy.y=point.y;enemy.debugMonster=true;
    spawned.push(enemy);available--;
  }
  return spawned;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function segmentDistance(point,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}

// An explicit debug-only cohort, created once per run after structures and the
// spawn angel exist. Reentering a world or rebuilding its sites never refills it.
export function spawnDebugWave(game) {
  if(game.debug!==true||game.debugOptions?.enemyWave!==true||game._debugWaveSpawned||(game.regionIndex!==0&&!game.stage)||game.dungeon?.active)return [];
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
