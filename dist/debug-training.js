import { UPGRADE_DEFS, SUPER_SKILL_DEFS } from './combat-catalog.js';
import { isBranchReady } from './weapon-branches.js';
import { groundOffset } from './terrain.js';
import { enemyDefinition } from './enemy-definitions.js';
import { BOSS_DEFS, initBoss } from './bosses.js';

export const DEBUG_FULL_BRANCHES=Object.freeze({sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
export const TRAINING_DUMMY_RULES=Object.freeze({radius:16,foot:18,defense:100,health:1e9,minDistance:110,maxDistance:230});
export const DEBUG_BOSS_RULES=Object.freeze({health:100000,minDistance:260,maxDistance:650});
// World and castle encounters share combat kinds. Location-specific names or
// stat multipliers do not create a second testing copy of the same boss.
export const DEBUG_BOSS_ROSTER=Object.freeze(Object.values(BOSS_DEFS).map(boss=>
  Object.freeze({id:`world:${boss.id}`,kind:boss.id,name:boss.name})
));

// Grant the same capped records ordinary rewards build. Attribute purchases,
// character XP and crystal progression are deliberately left untouched.
export function applyFullDebugBuild(game) {
  if(game.debug!==true||game.debugOptions?.fullLoadout!==true||game._debugFullApplied)return false;
  const build=game.build;
  const upgrades=UPGRADE_DEFS.filter(def=>def.category!=='attribute');
  // Normal acquisition/rank APIs enforce prerequisites and branch thresholds.
  // A later pass can take modifiers unlocked by the preceding branch choice.
  for(let pass=0;pass<UPGRADE_DEFS.length;pass++) {
    let changed=false;
    for(const def of upgrades)while(build.increment(def.id))changed=true;
    for(const [id,branch] of Object.entries(DEBUG_FULL_BRANCHES)) {
      if(isBranchReady(build,id)&&build.selectBranch(id,branch))changed=true;
    }
    if(!changed)break;
  }
  while(build.awardRuneArrow()){}
  for(const def of SUPER_SKILL_DEFS)if(build.getSkill(def.id))build.superLevels[def.id]=def.maxBaseRank;
  for(const weapon of Object.values(build.weapons))if(weapon.acquired)build.setEquipped(weapon.id,true);
  game._syncEvolutions(false);game._refreshStats();game._refreshWeapons();
  game._debugFullApplied=true;
  return true;
}

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function segmentDistance(point,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
  return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);
}

function debugSpawnPoint(game,{radius:r,minDistance,maxDistance,angle:preferredAngle=Math.PI*.25}) {
  const from={x:game.player.x,y:game.player.y+groundOffset(game.player,true)};
  const doors=(game.settlements?.sites||[]).filter(site=>!['angel','merchant'].includes(site.type)).map(site=>site.door).filter(Boolean);
  let point=null;
  for(let radius=minDistance;radius<=maxDistance&&!point;radius+=30) {
    // Natural forest edges can leave safe gaps between the former 32 rays.
    for(let i=0;i<64;i++) {
      const angle=preferredAngle+i*Math.PI/32,candidate={x:from.x+Math.cos(angle)*radius,y:from.y+Math.sin(angle)*radius};
      if(!game.terrain.isFree(candidate.x,candidate.y,r+12)||game.terrain.island?.isDry(candidate.x,candidate.y,r+12)===false)continue;
      if(game.terrain.firstBlocker(from.x,from.y,candidate.x,candidate.y,r+5))continue;
      if(game.settlements?._hazardFree(candidate.x,candidate.y,r+14)===false)continue;
      if(game.environment?.isHazardFree?.(candidate.x,candidate.y,r+14)===false)continue;
      if(doors.some(door=>distance(candidate,door)<r+70||segmentDistance(candidate,from,door)<r+40))continue;
      if(game.enemies.some(enemy=>distance(candidate,{x:enemy.x,y:enemy.y+groundOffset(enemy)})<r+enemy.r+18))continue;
      point=candidate;break;
    }
  }
  return point;
}

export function spawnDebugTrainingDummy(game) {
  if(game.debug!==true||game.debugOptions?.testFacilities!==true||game._debugTrainingSpawned||(game.regionIndex!==0&&!game.stage)||game.dungeon?.active)return null;
  const {radius:r,foot,defense,health}=TRAINING_DUMMY_RULES;
  const point=debugSpawnPoint(game,TRAINING_DUMMY_RULES);
  if(!point)return null;
  const enemy={id:++game._id,type:'trainingDummy',trainingDummy:true,x:point.x,y:point.y-foot,r,hp:health,maxHp:health,defense,
    speed:0,damage:0,xp:0,hit:0,attackCooldown:0,charge:null,cast:null,phase:0};
  game.enemies.push(enemy);game._debugTrainingSpawned=true;
  return enemy;
}

export function spawnDebugBosses(game) {
  if(game.debug!==true||game.debugOptions?.allBosses!==true||game._debugBossSpawned||game.dungeon?.active)return [];
  game._debugBossSpawned=true;
  const spawned=[];
  for(const [index,definition] of DEBUG_BOSS_ROSTER.entries()) {
    const point=debugSpawnPoint(game,{...DEBUG_BOSS_RULES,radius:enemyDefinition('boss').r,angle:-Math.PI/2+index*Math.PI*2/DEBUG_BOSS_ROSTER.length});
    // Never damage terrain or overlap the player on a sealed custom map.
    if(!point)continue;
    const enemy=game._spawnEnemy('boss',1);
    initBoss(enemy,definition.kind);
    enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);
    enemy.hp=enemy.maxHp=DEBUG_BOSS_RULES.health;
    // Keep the normal combat kinds, but never attach a dungeon/stage owner:
    // these outdoor copies must not unlock real rooms or advance objectives.
    enemy.debugBoss=true;enemy.debugBossId=definition.id;enemy.name=definition.name;
    spawned.push(enemy);
  }
  return spawned;
}
