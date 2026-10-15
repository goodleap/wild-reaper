import { CombatBuild } from './combat-build.js';
import { UPGRADE_DEFS, SUPER_SKILL_DEFS } from './combat-catalog.js';
import { isBranchReady } from './weapon-branches.js';

const PREVIEW_OWNERS=new Set(['sword','orbit','barrier','storm','swords']);

function bindBuild(game,build) {
  game.build=build;game.levels=build.levels;game.branches=build.branches;game.evolutions=build.evolutions;
  if(game.superSkills)game.superSkills.owned=build.superLevels;
}

// Only transient combat execution is discarded. The canonical build is never
// replaced with a snapshot, so references held by archives/progression remain
// valid and real XP, health damage and currency cannot be rolled back.
export class TemporaryBuild {
  constructor(game) {this.game=game;this.active=false;this.remaining=0;this.maxDuration=0;this.moveSpeedBonus=0;this.damageReductionBonus=0;}
  start({duration=30,moveSpeedBonus=1,damageReductionBonus=.95,damageReductionCap=.99}={}) {
    if(this.active||this.game.status!=='playing')return false;
    const g=this.game,canonical=g.canonicalBuild||g.build;
    const preview=CombatBuild.fromSnapshot(canonical.serialize());
    for(let pass=0;pass<UPGRADE_DEFS.length;pass++) {
      let changed=false;
      for(const def of UPGRADE_DEFS)if(PREVIEW_OWNERS.has(def.ownerId)&&def.category!=='attribute')while(preview.increment(def.id))changed=true;
      if(isBranchReady(preview,'sword')&&!preview.getWeapon('sword').branch){preview.selectBranch('sword','sweep');changed=true;}
      if(!changed)break;
    }
    const swords=SUPER_SKILL_DEFS.find(skill=>skill.id==='swords');
    if(swords&&preview.getSkill('swords'))preview.superLevels.swords=swords.maxBaseRank;
    for(const item of Object.values(preview.weapons))if(item.baseRank>0)item.equipped=true;
    this.canonical=canonical;g.canonicalBuild=canonical;
    this.previousCooldowns={storm:g.player.skillCooldown,super:{...g.superSkills?.cooldowns},ability:{...g._abilityCooldowns}};
    this.maxDuration=this.remaining=duration;this.elapsed=0;this.moveSpeedBonus=moveSpeedBonus;this.damageReductionBonus=damageReductionBonus;this.damageReductionCap=damageReductionCap;this.active=true;
    this._clearPlayerAttacks();bindBuild(g,preview);
    g.player.skillCooldown=0;if(g.superSkills)g.superSkills.cooldowns={};
    g._syncEvolutions?.(false);g._refreshStats?.();g._refreshWeapons?.();
    g._emit?.('storyBuffStarted',{id:'burning-potential',duration});return true;
  }
  update(dt) {
    if(!this.active||!Number.isFinite(dt)||dt<=0)return;
    this.elapsed+=dt;this.remaining=Math.max(0,this.maxDuration-this.elapsed);
    if(this.remaining<=1e-8)this.stop('expired');
  }
  _clearPlayerAttacks() {
    const g=this.game;
    for(const bullet of g.bullets||[])bullet.trail?.clear?.();
    g.bullets=[];g.orbitals=[];g.storm=null;g._pulseEchoes=[];
    g.attacks?.clearScene?.();g.superSkills?.clearScene?.();g.barrier?.clearScene?.();
    if(g.abilities) {
      g.abilities.effects=g.abilities.effects.filter(effect=>effect.caster!==g.player);
      g.abilities.visualBursts=g.abilities.visualBursts.filter(effect=>effect.hostile);
      const cast=g.abilities.visualCasts.get(g.player);if(cast&&g.player._visualCast===cast.pose)delete g.player._visualCast;
      g.abilities.visualCasts.delete(g.player);
      for(const [entity,status] of g.abilities.statuses) {
        if(status.burn?.caster===g.player)status.burn=null;
        if(entity!==g.player){status.slowUntil=0;status.frozenUntil=0;}
      }
    }
    for(const enemy of g.enemies||[]) {enemy.bleed=null;enemy.shock=null;delete enemy.branchSlowUntil;}
    const attackTypes=new Set(['swordSlash','swordEnergy','swordTrail','storm','pulse','lightning','orbit','superBurst','superSword','barrierTrigger','barrierBreak']);
    g.effects=(g.effects||[]).filter(effect=>!attackTypes.has(effect.type)&&!PREVIEW_OWNERS.has(effect.skillId));
  }
  stop(reason='cleanup') {
    if(!this.active)return false;
    const g=this.game;this._clearPlayerAttacks();bindBuild(g,this.canonical);
    this.active=false;this.remaining=0;this.moveSpeedBonus=0;this.damageReductionBonus=0;
    if(g.superSkills)g.superSkills.cooldowns=Object.fromEntries(Object.entries(this.previousCooldowns.super).map(([id,value])=>[id,Math.max(0,value-this.elapsed)]));
    g._abilityCooldowns=Object.fromEntries(Object.entries(this.previousCooldowns.ability).map(([id,value])=>[id,Math.max(0,value-this.elapsed)]));
    g.player.skillCooldown=Math.max(0,(this.previousCooldowns.storm||0)-this.elapsed);
    g._refreshStats?.();g._refreshWeapons?.();g.player.hp=Math.min(g.player.hp,g.player.maxHp);
    g._emit?.('storyBuffEnded',{id:'burning-potential',reason});return true;
  }
}
