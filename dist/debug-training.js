import { UPGRADE_DEFS, SUPER_SKILL_DEFS } from './combat-catalog.js';
import { isBranchReady } from './weapon-branches.js';
import { groundOffset } from './terrain.js';

export const DEBUG_FULL_BRANCHES=Object.freeze({sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain',domain:'binding'});
export const TRAINING_DUMMY_RULES=Object.freeze({radius:16,foot:18,defense:100,health:1e9,minDistance:110,maxDistance:230});

// Grant the same capped records ordinary rewards build. Attribute purchases,
// character XP and crystal progression are deliberately left untouched.
export function applyFullDebugBuild(game) {
  if(game.debug!==true||game.debugFull!==true||game._debugFullApplied)return false;
  const build=game.build;
  const upgrades=UPGRADE_DEFS.filter(def=>def.category!=='attribute');
  // Normal acquisition/rank APIs enforce prerequisites and branch thresholds.
  // A later pass can take modifiers unlocked by the preceding branch choice.
  for(let pass=0;pass<UPGRADE_DEFS.length;pass++) {
    let changed=false;
    for(const def of upgrades)while(build.increment(def.id))changed=true;
    for(const [id,branch] of Object.entries(DEBUG_FULL_BRANCHES)) {
      if(id!=='domain'&&isBranchReady(build,id)&&build.selectBranch(id,branch))changed=true;
    }
    if(!changed)break;
  }
  while(build.awardRuneArrow()){}
  while(build.awardDomain(DEBUG_FULL_BRANCHES.domain)){}
  for(const def of SUPER_SKILL_DEFS)if(def.id!=='domain')build.superLevels[def.id]=def.maxBaseRank;
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

export function spawnDebugTrainingDummy(game) {
  if(game.debug!==true||game._debugTrainingSpawned||game.regionIndex!==0||game.dungeon?.active)return null;
  const {radius:r,foot,defense,health,minDistance,maxDistance}=TRAINING_DUMMY_RULES;
  const from={x:game.player.x,y:game.player.y+groundOffset(game.player,true)};
  const doors=(game.settlements?.sites||[]).filter(site=>!['angel','merchant'].includes(site.type)).map(site=>site.door).filter(Boolean);
  let point=null;
  for(let radius=minDistance;radius<=maxDistance&&!point;radius+=30) {
    for(let i=0;i<32;i++) {
      const angle=Math.PI*.25+i*Math.PI/16,candidate={x:from.x+Math.cos(angle)*radius,y:from.y+Math.sin(angle)*radius};
      if(!game.terrain.isFree(candidate.x,candidate.y,r+12)||game.terrain.island?.isDry(candidate.x,candidate.y,r+12)===false)continue;
      if(game.terrain.firstBlocker(from.x,from.y,candidate.x,candidate.y,r+5))continue;
      if(game.settlements?._hazardFree(candidate.x,candidate.y,r+14)===false)continue;
      if(game.environment?.isHazardFree?.(candidate.x,candidate.y,r+14)===false)continue;
      if(doors.some(door=>distance(candidate,door)<r+70||segmentDistance(candidate,from,door)<r+40))continue;
      if(game.enemies.some(enemy=>distance(candidate,{x:enemy.x,y:enemy.y+groundOffset(enemy)})<r+enemy.r+18))continue;
      point=candidate;break;
    }
  }
  // A custom sealed map may have no safe point. Never move authored obstacles
  // or place the post inside the player to force a testing fixture into it.
  if(!point)return null;
  const enemy={id:++game._id,type:'trainingDummy',trainingDummy:true,x:point.x,y:point.y-foot,r,hp:health,maxHp:health,defense,
    speed:0,damage:0,xp:0,hit:0,attackCooldown:0,charge:null,cast:null,phase:0};
  game.enemies.push(enemy);game._debugTrainingSpawned=true;
  return enemy;
}
