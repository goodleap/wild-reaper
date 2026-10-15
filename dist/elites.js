import { getConfigSection } from './content-config.js';
import { ELITE_ELIGIBLE_TYPES, ENCOUNTER_SEQUENCES } from './encounter-definitions.js';
import { enemyDefinition } from './enemy-definitions.js';
import { groundOffset } from './terrain.js';

const eliteContent=getConfigSection('enemies').elite;
export const ELITE_RULES=eliteContent.rules;
export const ELITE_AFFIXES=eliteContent.affixes;
const ELIGIBLE=new Set(ELITE_ELIGIBLE_TYPES);
const distanceSq=(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2;

export class Elites {
  constructor(game,{generation=true}={}) { this.game=game;this.generation=generation; }

  _eligible(enemy) {
    return enemy.hp>0&&ELIGIBLE.has(enemy.type)&&!enemy.affix&&!enemy.elite&&!enemy.guardianId&&!enemy.rescueId&&!enemy.rescueGuard&&!enemy.eventId&&!enemy.eventRole&&!enemy.summoned;
  }

  maybePromote(enemy) {
    if(!this.generation||this.game.status!=='playing'||this.game.time<ELITE_RULES.startAt||!this._eligible(enemy)||Math.random()>=ELITE_RULES.chance)return false;
    const ids=Object.keys(ELITE_AFFIXES);
    return this.promote(enemy,ids[Math.floor(Math.random()*ids.length)]);
  }

  // A deterministic entry point also makes authored encounters and QA safe:
  // it bypasses only natural spawn timing/chance. A finite authored population
  // may reserve its own cap; natural runtime promotion keeps the global cap.
  promote(enemy,id,{authoredCap}={}) {
    const game=this.game,rules=ELITE_RULES,definition=ELITE_AFFIXES[id],cap=Number.isInteger(authoredCap)?Math.max(rules.cap,authoredCap):rules.cap;
    if(game.status!=='playing'||!definition||!this._eligible(enemy)||game.enemies.filter(e=>e.hp>0&&e.affix).length>=cap)return false;
    const foot=enemy.y+groundOffset(enemy);
    enemy.maxHp*=rules.health;enemy.hp*=rules.health;enemy.r*=rules.scale;
    enemy.y=foot-groundOffset(enemy);enemy.xp=Math.round(enemy.xp*rules.xp);
    enemy.affix={...definition,phase:'idle',life:0,maxLife:0,cooldown:id==='swift'?rules.swiftInitialCooldown:rules.otherInitialCooldown,hit:0,shield:0,maxShield:0,castX:enemy.x,castY:foot};
    if(id==='shield')enemy.affix.shield=enemy.affix.maxShield=enemy.maxHp*rules.shield;
    game._moveEntity(enemy,0,0);
    return true;
  }

  beforeDamage(enemy,amount) {
    if(!Number.isFinite(amount)||amount<=0)return 0;
    const affix=enemy.affix;
    if(affix?.id!=='shield'||affix.shield<=0)return amount;
    const absorbed=Math.min(affix.shield,amount);
    affix.shield=Math.max(0,affix.shield-absorbed);affix.hit=.16;
    if(affix.shield===0)this.game._effect(enemy.x,enemy.y,'shieldBreak',.5,enemy.r+12,affix.color);
    return amount-absorbed;
  }

  _canAct(enemy) {
    const game=this.game,p=game.player;
    return enemy.hp>0&&game._inView(enemy)&&distanceSq(enemy.x,enemy.y+groundOffset(enemy),p.x,p.y+groundOffset(p,true))<=ELITE_RULES.range**2;
  }

  _summonRoom(enemy) {
    const alive=this.game.enemies.filter(e=>e.hp>0&&e.summoned);
    return Math.max(0,Math.min(ELITE_RULES.summonCount,
      ELITE_RULES.summonOwnerCap-alive.filter(e=>e.summonerId===enemy.id).length,
      ELITE_RULES.summonGlobalCap-alive.length,
      ELITE_RULES.enemyCap-this.game.enemies.length));
  }

  updateEnemy(enemy,dt) {
    const affix=enemy.affix,game=this.game,rules=ELITE_RULES;
    if(!affix)return false;
    if(game.status!=='playing')return true;
    if(enemy.hp<=0) { affix.phase='idle';affix.life=0;return true; }
    if(!Number.isFinite(dt)||dt<=0)return affix.phase==='windup';
    affix.hit=Math.max(0,affix.hit-dt);
    if(affix.id==='shield')return false;
    if(affix.phase==='rush') {
      affix.life=Math.max(0,affix.life-dt);
      if(affix.life===0) { affix.phase='idle';affix.cooldown=rules.swiftCooldown; }
      return false;
    }
    if(affix.phase==='windup') {
      if(!this._canAct(enemy)) { affix.phase='idle';affix.life=0;affix.cooldown=rules.cancelCooldown;return false; }
      affix.life=Math.max(0,affix.life-dt);
      if(affix.id==='swift'&&affix.life===0) {
        affix.phase='rush';affix.life=affix.maxLife=rules.swiftDuration;
        return false;
      }
      // Summons remain pending until weapons and status damage have resolved.
      return true;
    }
    affix.cooldown=Math.max(0,affix.cooldown-dt);
    if(affix.cooldown>0||!this._canAct(enemy)||(affix.id==='summoner'&&this._summonRoom(enemy)===0))return false;
    affix.phase='windup';affix.life=affix.maxLife=affix.id==='swift'?rules.swiftWindup:rules.summonWindup;
    affix.castX=enemy.x;affix.castY=enemy.y+groundOffset(enemy);
    return true;
  }

  movementMultiplier(enemy) {
    return enemy.affix?.id==='swift'&&enemy.affix.phase==='rush'?ELITE_RULES.swiftSpeed:1;
  }

  _summonPoint(enemy,slot) {
    const game=this.game,rules=ELITE_RULES,p=game.player,r=enemyDefinition(ENCOUNTER_SEQUENCES.eliteSummon.fallback).r,px=p.x,py=p.y+groundOffset(p,true);
    const x=enemy.x,y=enemy.y+groundOffset(enemy),seed=enemy.id*2.399963+slot*Math.PI;
    for(let i=0;i<rules.summonAttempts;i++) {
      const angle=seed+i*Math.PI/3,distance=rules.summonStartRadius+Math.floor(i/rules.summonRingSlots)*rules.summonRingStep;
      const sx=x+Math.cos(angle)*distance,sy=y+Math.sin(angle)*distance;
      if(distanceSq(sx,sy,px,py)<=(rules.summonPlayerClearance+r)**2||!game.terrain.isFree(sx,sy,r+2)||game.terrain.island?.isDry(sx,sy,r+2)===false)continue;
      if(!game._inView({x:sx,y:sy-14,r}))continue;
      if(game.enemies.some(e=>e.hp>0&&distanceSq(sx,sy,e.x,e.y+groundOffset(e))<(r+e.r+5)**2))continue;
      return {x:sx,y:sy};
    }
    return null;
  }

  resolve() {
    const game=this.game,rules=ELITE_RULES;
    if(game.status!=='playing')return;
    // Only the existing casters participate; newly spawned slimes have no
    // affix and cannot recursively cast or be promoted by normal spawning.
    for(const enemy of game.enemies) {
      const affix=enemy.affix;
      if(!affix)continue;
      if(enemy.hp<=0) { affix.phase='idle';affix.life=0;continue; }
      if(affix.id!=='summoner'||affix.phase!=='windup'||affix.life>0)continue;
      affix.phase='idle';affix.cooldown=rules.summonCooldown;
      if(!this._canAct(enemy))continue;
      const room=this._summonRoom(enemy);let count=0;
      for(let slot=0;slot<room;slot++) {
        const point=this._summonPoint(enemy,slot);if(!point)continue;
        const summoned=game._spawnEnemy(ENCOUNTER_SEQUENCES.eliteSummon.fallback,1);
        summoned.x=point.x;summoned.y=point.y-groundOffset(summoned);
        summoned.summoned=true;summoned.summonerId=enemy.id;summoned.xp=0;
        summoned._navTimer=0;count++;
      }
      if(count)this.game._effect(enemy.x,enemy.y+groundOffset(enemy),'eliteSummon',.55,40,affix.color);
    }
  }
}
