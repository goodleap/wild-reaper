import { groundOffset } from './terrain.js';
import { isGrounded } from './height-rules.js';

export const BLOOM_BOSS = Object.freeze({
  name:'孢冠领主',range:430,preferredMin:230,preferredMax:300,
  cooldown:5.2,enragedCooldown:4.8,recovery:1.1,
  fanWindup:1,fanSpread:.8,fanCount:5,bulletSpeed:150,bulletLife:4.5,
  burstWindup:1.1,burstRadius:52,burstSpacing:145,maxEnemyBullets:60
});

export function initBoss(enemy) {
  if(enemy.type!=='boss')return enemy;
  enemy.bossKind=(enemy.bossIndex||1)%2===0?'bloom':'ancient';
  if(enemy.bossKind==='bloom') {
    enemy.bloomAttack=null;enemy.bloomCooldown=2;enemy.bloomRecovery=0;
    enemy.bloomNext='fan';enemy.bloomRetreat=0;enemy.bloomRetreatCooldown=0;
  }
  return enemy;
}

export function clearBossAttacks(enemy) {
  enemy.bloomAttack=null;enemy.bloomRecovery=0;enemy.bloomRetreat=0;
}

function groundState(game,enemy) {
  const p=game.player,x=enemy.x,y=enemy.y+groundOffset(enemy);
  const px=p.x,py=p.y+groundOffset(p,true),dx=px-x,dy=py-y;
  return {x,y,px,py,dx,dy,distance:Math.hypot(dx,dy)};
}

function canAttack(game,enemy,state) {
  return enemy.hp>0&&game._inView(enemy)&&state.distance<=BLOOM_BOSS.range;
}

function clearAttackPath(game,state,profile='projectile') {
  return !game.terrain.firstBlocker(state.x,state.y,state.px,state.py,0,profile);
}

function startAttack(game,enemy,state) {
  const angle=Math.atan2(state.dy,state.dx);
  let circles=[];
  if(enemy.bloomNext==='burst') {
    // All three positions are captured now. The gaps between their edges leave
    // space to dodge, and solid terrain never conceals a circle's origin.
    const nx=-Math.sin(angle),ny=Math.cos(angle);
    for(const offset of [0,-BLOOM_BOSS.burstSpacing,BLOOM_BOSS.burstSpacing]) {
      const x=state.px+nx*offset,y=state.py+ny*offset;
      if(game.terrain.isFree(x,y,8)&&!game.terrain.firstBlocker(state.x,state.y,x,y,0,'ground'))circles.push({x,y,r:BLOOM_BOSS.burstRadius});
    }
  }
  if(circles.length) {
    enemy.bloomAttack={kind:'burst',x:state.x,y:state.y,circles,life:BLOOM_BOSS.burstWindup,maxLife:BLOOM_BOSS.burstWindup};
    enemy.bloomNext='fan';
  } else {
    // Low cover may stop every ground eruption while leaving a clear ranged
    // shot. Tall cover requires a new position instead of an empty warning.
    if(!clearAttackPath(game,state))return false;
    enemy.bloomAttack={kind:'fan',x:state.x,y:state.y,angle,spread:BLOOM_BOSS.fanSpread,life:BLOOM_BOSS.fanWindup,maxLife:BLOOM_BOSS.fanWindup};
    enemy.bloomNext='burst';
  }
  enemy.bloomCooldown=enemy.hp<enemy.maxHp*.5?BLOOM_BOSS.enragedCooldown:BLOOM_BOSS.cooldown;
  enemy.bloomRetreat=0;game._emit('bloomWindup');
  return true;
}

// The core calls this only from its playing update. Keep the guard here too so
// direct QA calls cannot consume an attack's warning while the game is paused.
export function updateBloomBoss(game,enemy,dt) {
  if(enemy.bossKind!=='bloom')return false;
  if(game.status!=='playing')return true;
  if(enemy.hp<=0){clearBossAttacks(enemy);return true;}
  enemy.bloomCooldown=Math.max(0,(enemy.bloomCooldown||0)-dt);
  enemy.bloomRecovery=Math.max(0,(enemy.bloomRecovery||0)-dt);
  enemy.bloomRetreatCooldown=Math.max(0,(enemy.bloomRetreatCooldown||0)-dt);
  if(enemy.bloomAttack) {
    enemy.bloomAttack.life=Math.max(0,enemy.bloomAttack.life-dt);
    return true;
  }
  if(enemy.bloomRecovery>0)return true;
  const state=groundState(game,enemy);
  if(enemy.bloomCooldown<=0&&canAttack(game,enemy,state)) {
    if(startAttack(game,enemy,state))return true;
    game._moveEnemy(enemy,dt*.75);return true;
  }
  if(state.distance>BLOOM_BOSS.preferredMax||!game._inView(enemy)||!clearAttackPath(game,state)) {
    game._moveEnemy(enemy,dt*.75);return true;
  }
  // A short retreat creates shooting room without continually kiting the
  // player. The existing terrain-aware navigation handles rocks and trunks.
  if(state.distance<170&&enemy.bloomRetreatCooldown<=0) {
    enemy.bloomRetreat=.7;enemy.bloomRetreatCooldown=3;
  }
  if(enemy.bloomRetreat>0) {
    enemy.bloomRetreat=Math.max(0,enemy.bloomRetreat-dt);
    const length=state.distance||1;
    game._moveEnemy(enemy,dt*.45,{x:state.x-state.dx/length*90,y:state.y-state.dy/length*90});
  } else if(state.distance>BLOOM_BOSS.preferredMin) {
    // Hold the middle distance; attacks provide pressure while it stands still.
    return true;
  }
  return true;
}

// Resolve after every player weapon, so a killing hit on the final warning
// frame cancels the shot or explosion. Existing bullets remain independent.
export function resolveBloomBoss(game,enemy) {
  if(enemy.bossKind!=='bloom')return false;
  if(enemy.hp<=0){clearBossAttacks(enemy);return false;}
  if(game.status!=='playing')return false;
  const attack=enemy.bloomAttack;
  if(!attack||attack.life>0)return false;
  enemy.bloomAttack=null;enemy.bloomRecovery=BLOOM_BOSS.recovery;
  const state=groundState(game,enemy);
  if(!canAttack(game,enemy,state))return false;
  if(attack.kind==='fan') {
    const available=Math.max(0,BLOOM_BOSS.maxEnemyBullets-game.enemyBullets.length);
    // Under the shared cap, keep the central shot and add symmetric pairs.
    const offsets=available>=5?[0,-1,1,-2,2]:available>=3?[0,-1,1]:available>=1?[0]:[];
    for(const offset of offsets) {
      const angle=attack.angle+offset*attack.spread/(BLOOM_BOSS.fanCount-1);
      game.enemyBullets.push({id:++game._id,type:'bloom',x:attack.x,y:attack.y,r:7,vx:Math.cos(angle)*BLOOM_BOSS.bulletSpeed,vy:Math.sin(angle)*BLOOM_BOSS.bulletSpeed,life:BLOOM_BOSS.bulletLife,maxLife:BLOOM_BOSS.bulletLife,color:'#dcb4f5',damage:enemy.damage*.65});
    }
    if(offsets.length)game._emit('bloomShot');
  } else {
    let hit=false;
    for(const circle of attack.circles) {
      game._effect(circle.x,circle.y,'bloomBurst',.65,circle.r,'#c498ed');
      if(isGrounded(game.player)&&Math.hypot(state.px-circle.x,state.py-circle.y)<circle.r+game.player.r&&
        !game.terrain.firstBlocker(circle.x,circle.y,state.px,state.py,0,'ground'))hit=true;
    }
    if(hit)game._hurtPlayer(enemy.damage*.85);
    game._emit('bloomBurst');
  }
  return true;
}
