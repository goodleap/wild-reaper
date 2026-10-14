import { getConfigSection } from './content-config.js';
import { attackSource } from './combat-resolution.js';
import { scalePlayerDamage } from './combat-stats.js';

// Weapon reactions share the normal damage/death path, but never call hit()
// recursively. Each enemy keeps only one bleed and one shock record.
export const STATUS_RULES=getConfigSection('combat').status;

export class CombatStatus {
  constructor(game) { this.game=game; }

  hit(enemy,amount,knockback=0,origin=this.game.player,source='arrow',attack=null) {
    const game=this.game,rules=STATUS_RULES;
    if(game.status!=='playing'||!Number.isFinite(amount)||amount<=0||!game.combat.canTarget(enemy,origin,{source}))return 0;
    const x=enemy.x,y=enemy.y;
    const profile=attackSource(source);
    const owner=attack?.ownerScope??profile.owner;
    const burst=profile.consumeBleed&&enemy.bleed?.life>0;
    const shock=profile.conduct&&enemy.shock?.life>0?enemy.shock:null;
    // Consume before dealing damage: killing blows still discharge exactly
    // once, and death hooks cannot reuse a mark that has already reacted.
    if(burst)enemy.bleed=null;
    if(shock)enemy.shock=null;
    const damage=amount*(burst?1+rules.pulseBonus:1);
    const dealt=game._hurtEnemy(enemy,damage,knockback,origin,source);
    if(burst)game._effect(x,y,'bleedBurst',.32,enemy.r+6,'#e8a486');
    if(shock)this._conduct(enemy,x,y,shock.damage);

    if(enemy.hp<=0) {
      enemy.bleed=null;enemy.shock=null;
      return dealt;
    }
    // A fully absorbed strike can spend an existing reaction, but cannot
    // plant a fresh status through an intact elite shield.
    if(dealt>0&&profile.bleed) {
      // Repeated blade hits are faster than the tick interval. Refresh the
      // lifetime, not the tick phase, so contact cannot postpone all damage.
      const nextTick=enemy.bleed?.life>0?enemy.bleed.nextTick:rules.bleedInterval;
      enemy.bleed={life:rules.bleedDuration,maxLife:rules.bleedDuration,nextTick,damage:amount*rules.bleedRatio};
    }else if(dealt>0&&profile.shock) {
      enemy.shock={life:rules.shockDuration,maxLife:rules.shockDuration,damage:owner==='player'?scalePlayerDamage(game,rules.conductionDamage,{skillId:attack?.skillId||profile.skillId}):Math.max(rules.conductionDamage,amount*rules.allyConductionRatio)};
    }
    return dealt;
  }

  _conduct(source,x,y,damage) {
    const game=this.game,origin={x,y,type:source.type,r:source.r};
    let target=null,nearest=STATUS_RULES.conductionRange**2;
    for(const enemy of game.enemies) {
      if(enemy===source||enemy.id===source.id)continue;
      const distance=(enemy.x-x)**2+(enemy.y-y)**2;
      if(distance<=nearest&&game.combat.canTarget(enemy,origin,{requireView:true,source:'conduction',checkPath:true})) { target=enemy;nearest=distance; }
    }
    if(!target)return;
    game._effect(x,y,'conduction',.26,0,'#c4e8ff',undefined,{x2:target.x,y2:target.y});
    game._hurtEnemy(target,damage,0,origin,'conduction');
    if(target.hp<=0) { target.bleed=null;target.shock=null; }
  }

  update(dt) {
    const game=this.game,rules=STATUS_RULES;
    if(game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    for(const enemy of game.enemies) {
      if(enemy.hp<=0) { enemy.bleed=null;enemy.shock=null;continue; }
      const bleed=enemy.bleed;
      if(bleed?.life>0) {
        const elapsed=Math.min(dt,bleed.life);
        bleed.life=Math.max(0,bleed.life-dt);
        bleed.nextTick-=elapsed;
        while(bleed.nextTick<=1e-9&&enemy.hp>0) {
          bleed.nextTick+=rules.bleedInterval;
          game._hurtEnemy(enemy,bleed.damage,0,game.player,'bleed');
        }
        if(bleed.life<=0||enemy.hp<=0)enemy.bleed=null;
      }
      if(enemy.hp<=0) { enemy.shock=null;continue; }
      if(enemy.shock) {
        enemy.shock.life=Math.max(0,enemy.shock.life-dt);
        if(enemy.shock.life<=0)enemy.shock=null;
      }
    }
  }
}
