import { groundOffset } from './terrain.js';
import { isGrounded } from './height-rules.js';
import { clearBossAttacks } from './bosses.js';
import { resolveCharacterStats, scalePlayerDamage, defenseDamageMultiplier } from './combat-stats.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rand=(a,b)=>a+Math.random()*(b-a);
const feedbackSeed=(x,y,time,id=0)=>(Math.imul(Math.round(x*16),73856093)^Math.imul(Math.round(y*16),19349663)^Math.imul(Math.round(time*1000),83492791)^Math.imul(id|0,2654435761))>>>0;
const HIT_COLORS=Object.freeze({sword:'#f1e5bb',arrow:'#e8f3ad',runeArrow:'#c4e7df',orbit:'#f2d492',lightning:'#cce9ff',companionLightning:'#cce9ff',storm:'#d4e7ff',conduction:'#c4e8ff',pulse:'#b9dca0',echo:'#c6ead5',companionPulse:'#b9dca0',companionEcho:'#c6ead5',bleed:'#e8a486',mushroom:'#ffbd70',super:'#ead4aa',relic:'#ddc8f5'});

// Source ownership and reaction permissions are explicit. An automatic attack
// is not automatically a weapon, nor does an ally inherit the player's stats.
export const ATTACK_SOURCES=Object.freeze({
  sword:Object.freeze({owner:'player',weaponId:'sword',conduct:true}),
  arrow:Object.freeze({owner:'player',weaponId:'arrow',conduct:true}),
  runeArrow:Object.freeze({owner:'player',weaponId:'arrow'}),
  orbit:Object.freeze({owner:'player',weaponId:'orbit',conduct:true,bleed:true}),
  pulse:Object.freeze({owner:'player',skillId:'pulse',consumeBleed:true}),
  echo:Object.freeze({owner:'player',skillId:'pulse',consumeBleed:true}),
  lightning:Object.freeze({owner:'player',skillId:'lightning',shock:true}),
  storm:Object.freeze({owner:'player',skillId:'storm',shock:true}),
  companionLightning:Object.freeze({owner:'ally',skillId:'lightning',shock:true}),
  companionPulse:Object.freeze({owner:'ally',skillId:'pulse',consumeBleed:true}),
  companionEcho:Object.freeze({owner:'ally',skillId:'pulse',consumeBleed:true}),
  super:Object.freeze({owner:'player',tier:'super'}),
  relic:Object.freeze({owner:'player',kind:'relic'}),
  conduction:Object.freeze({owner:'reaction',kind:'secondary'}),
  bleed:Object.freeze({owner:'reaction',kind:'secondary'}),
  angel:Object.freeze({owner:'ally',skillId:'storm'}),
  mushroom:Object.freeze({owner:'environment'})
});
const RAW_SOURCE=Object.freeze({owner:'external'});
export const attackSource=source=>ATTACK_SOURCES[source]||RAW_SOURCE;
const PROPAGATION_PROFILES=Object.freeze({pulse:'ground',echo:'ground',companionPulse:'ground',companionEcho:'ground',storm:'overhead',angel:'overhead'});
export const attackProfile=source=>PROPAGATION_PROFILES[source]||'projectile';

export class CombatResolution {
  constructor(game){this.game=game;}

  groundPoint(entity){
    if(Number.isFinite(entity?.groundY))return {x:entity.x,y:entity.groundY};
    const human=entity===this.game.player||entity?.isCompanion||entity?.isCaptive||entity?.isTownNpc;
    const offset=groundOffset(entity||{},human);
    return {x:entity?.x,y:(entity?.y??0)+(Number.isFinite(offset)?offset:0)};
  }

  // Acquisition checks the same projected path as execution. Unknown plain
  // points are already ground coordinates; callers can supply groundY for a
  // body-space effect, a prop, or a projectile segment.
  clearPath(origin,target,{source='arrow',profile=attackProfile(source),radius=0,targetGroundY}={}){
    if(profile==='overhead'||!this.game.terrain?.firstBlocker)return true;
    const a=this.groundPoint(origin),b=this.groundPoint(target);
    if(Number.isFinite(targetGroundY))b.y=targetGroundY;
    else if(source==='arrow'&&Number.isFinite(origin?.y))b.y=target.y+a.y-origin.y;
    return !this.game.terrain.firstBlocker(a.x,a.y,b.x,b.y,radius,profile);
  }

  // One pure target gate is reused for acquisition, attack validation and
  // delayed damage. It never awakens an enemy or reveals unexplored rooms.
  canTarget(enemy,origin=this.game.player,{requireView=false,range=Infinity,canHitFlying=true,source='raw',profile,checkPath=false,pathRadius=0}={}){
    const g=this.game;
    if(!enemy||enemy.hp<=0||enemy.rescueSpawnGrace>0)return false;
    if((!canHitFlying||(checkPath&&(profile??attackProfile(source))==='ground'))&&!isGrounded(enemy))return false;
    if(requireView&&!g._inView(enemy))return false;
    if(Number.isFinite(range)&&Math.hypot(enemy.x-origin.x,enemy.y-origin.y)>range)return false;
    if(enemy.dungeonId&&g.dungeon?.canDamage(enemy,origin)===false)return false;
    if(g.regions?.canTarget(enemy)===false)return false;
    return !checkPath||this.clearPath(origin,enemy,{source,profile,radius:pathRadius});
  }

  // Raw base damage is scaled exactly once at attack creation. Passing damage
  // explicitly means a projectile/tick already owns a resolved damage snapshot.
  createAttack({source='raw',actor,origin,baseDamage=0,damage,knockback=0,weaponId,skillId}={}){
    const definition=attackSource(source),g=this.game;
    const owner=actor??(definition.owner==='player'?g.player:null);
    const amount=damage??(owner===g.player?scalePlayerDamage(g,baseDamage,{weaponId:weaponId??definition.weaponId,skillId:skillId??definition.skillId}):baseDamage);
    const ownerScope=owner===g.player?'player':owner&&definition.owner==='player'?'ally':definition.owner;
    return Object.freeze({source,actor:owner,ownerScope,origin:origin??owner??g.player,damage:Number.isFinite(amount)?Math.max(0,amount):0,knockback,weaponId:weaponId??definition.weaponId,skillId:skillId??definition.skillId});
  }

  resolve(enemy,attack,{reactions=true}={}){
    if(!attack||this.game.status!=='playing'||!this.canTarget(enemy,attack.origin)||!(attack.damage>0))return 0;
    return reactions?this.game.combatStatus.hit(enemy,attack.damage,attack.knockback,attack.origin,attack.source,attack):this.applyEnemyDamage(enemy,attack.damage,attack.knockback,attack.origin,attack.source);
  }

  hit(enemy,damage,knockback=0,origin=this.game.player,source='arrow'){
    return this.resolve(enemy,this.createAttack({source,damage,knockback,origin}));
  }

  applyEnemyDamage(enemy,amount,knockback=0,origin=this.game.player,source='raw') {
    const g=this.game;
    if(!this.canTarget(enemy,origin)||!Number.isFinite(amount)||amount<=0)return 0;
    if(g.regions?.canDamage(enemy)===false)return 0;
    // A shield absorbing a valid hit still alerts its defender. Visibility
    // and origin checks above remain pure and reject blocked strikes first.
    if(enemy.dungeonId)g.dungeon.awaken?.(enemy);
    amount=g.elites?.beforeDamage(enemy,amount)??amount;
    if(amount<=0)return 0;
    const actual=Math.min(enemy.hp,amount);
    const angle=Math.atan2(enemy.y-(Number.isFinite(origin?.y)?origin.y:enemy.y),enemy.x-(Number.isFinite(origin?.x)?origin.x:enemy.x));
    const strength=clamp(actual/Math.max(1,enemy.maxHp||actual)*3,0,1),color=HIT_COLORS[source]||'#e8f3ad';
    const seed=feedbackSeed(0,0,g._clock,enemy.id);
    enemy.hp -= amount; enemy.hit = .12;
    enemy.hitAngle=angle;enemy.hitSource=source;enemy.hitStrength=strength;
    if(knockback && enemy.type!=='boss') {
      const dx=enemy.x-origin.x,dy=enemy.y-origin.y,d=Math.hypot(dx,dy)||1;
      g._moveEntity(enemy,dx/d*knockback,dy/d*knockback);
      if(enemy.charge?.phase==='windup'){enemy.charge.startX=enemy.x;enemy.charge.startY=enemy.y+groundOffset(enemy);}
    }
    g._effect(enemy.x,enemy.y,'hit',.24,enemy.r*.7,color,undefined,{source,angle,strength,seed});
    if(Math.random()<.24 || enemy.type==='boss') g._effect(enemy.x+rand(-8,8),enemy.y-enemy.r,'damage',.65,0,'#f1e4aa',String(Math.round(amount)));
    if(enemy.hp<=0) {
      enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;
      g._effect(enemy.x,enemy.y,'defeat',enemy.type==='boss'?.95:.5,enemy.r,color,undefined,{enemyType:enemy.type,source,boss:enemy.type==='boss',angle,strength,seed});
      g.kills++; g._emit('kill');
      // Kill XP is automatic. Loot is a separate skill/currency resource and
      // never opens a modal in the middle of an attack's target loop.
      if(enemy.xp>0&&!enemy.summoned) {
        g.addExperience(enemy.xp);
        if(enemy.type!=='boss') {
          g.dropCrystals(enemy.x,enemy.y,enemy.xp);
          if(enemy.affix)g.dropGold(enemy.x+9,enemy.y,3);
          else if(Math.random()<.08)g.dropGold(enemy.x+9,enemy.y,1);
        }
      }
      g.waveDirector?.onEnemyKilled(enemy);
      g.dungeon.onEnemyKilled(enemy);
      g.settlements.onEnemyKilled(enemy);
      if(enemy.type==='boss') {
        enemy.slam=null;clearBossAttacks(enemy);
        g._effect(enemy.x,enemy.y,'ring',1.1,170,'#f2d482');
        if(!enemy.dungeonBoss&&!enemy.dungeonId) {
          g.bossDefeated=true;g.bossKills++;g._emit('bossKill');
          g.grantResources({gold:30,crystals:45},'regionalBoss');g.regions.openPortal(enemy);
        }
      }
      g.adventure?.onEnemyKilled(enemy);
      g.encounters?.onEnemyKilled(enemy);
      g.companions?.onEnemyKilled(enemy);
      g.relics?.onEnemyKilled(enemy,source);
      if(g.kills%24===0 && g.player.hp<g.player.maxHp) {
        g.player.hp=Math.min(g.player.maxHp,g.player.hp+7);
        g._effect(g.player.x,g.player.y-26,'heal',.8,0,'#b9e89c','+7'); g._emit('heal');
      }
    }
    return actual;
  }

  damagePlayer(amount) {
    const g=this.game;
    const p=g.player;if(p.invuln>0||g.status!=='playing'||!Number.isFinite(amount)||amount<=0)return false;
    amount*=defenseDamageMultiplier(resolveCharacterStats(g).defense);
    amount=g.relics?.modifyIncomingDamage(amount)??amount;
    amount=g.barrier?.absorbDamage(amount)??amount;
    const previousHp=p.hp;
    p.hp=Math.max(0,p.hp-amount);p.invuln=.8;
    if(p.hp<previousHp){p.hurtFace=.24;g._emit('hurt');g._effect(p.x,p.y,'ring',.3,42,'#e48d78');}
    else g._emit('shieldAbsorbed');
    if(p.hp<=0)g.status='dead';return true;
  }
}
