// Weapon reactions share the normal damage/death path, but never call hit()
// recursively. Each enemy keeps only one bleed and one shock record.
export const STATUS_RULES=Object.freeze({
  bleedDuration:2,bleedInterval:.5,bleedDamage:4,
  pulseBonus:.25,shockDuration:2.5,conductionRange:130,conductionDamage:12
});

export class CombatStatus {
  constructor(game) { this.game=game; }

  hit(enemy,amount,knockback=0,origin=this.game.player,source='arrow') {
    const game=this.game,rules=STATUS_RULES;
    if(game.status!=='playing'||enemy.hp<=0||!Number.isFinite(amount)||amount<=0)return 0;
    const x=enemy.x,y=enemy.y;
    const burst=(source==='pulse'||source==='echo')&&enemy.bleed?.life>0;
    const shock=(source==='arrow'||source==='orbit')&&enemy.shock?.life>0?enemy.shock:null;
    // Consume before dealing damage: killing blows still discharge exactly
    // once, and death hooks cannot reuse a mark that has already reacted.
    if(burst)enemy.bleed=null;
    if(shock)enemy.shock=null;
    const damage=amount*(burst?1+rules.pulseBonus:1);
    game._hurtEnemy(enemy,damage,knockback,origin);
    if(burst)game._effect(x,y,'bleedBurst',.32,enemy.r+6,'#e8a486');
    if(shock)this._conduct(enemy,x,y,shock.damage);

    if(enemy.hp<=0) {
      enemy.bleed=null;enemy.shock=null;
      return damage;
    }
    if(source==='orbit') {
      // Repeated blade hits are faster than the tick interval. Refresh the
      // lifetime, not the tick phase, so contact cannot postpone all damage.
      const nextTick=enemy.bleed?.life>0?enemy.bleed.nextTick:rules.bleedInterval;
      enemy.bleed={life:rules.bleedDuration,maxLife:rules.bleedDuration,nextTick,damage:rules.bleedDamage*game._damageMultiplier()};
    }else if(source==='lightning'||source==='storm') {
      enemy.shock={life:rules.shockDuration,maxLife:rules.shockDuration,damage:rules.conductionDamage*game._damageMultiplier()};
    }
    return damage;
  }

  _conduct(source,x,y,damage) {
    const game=this.game;
    let target=null,nearest=STATUS_RULES.conductionRange**2;
    for(const enemy of game.enemies) {
      if(enemy===source||enemy.id===source.id||enemy.hp<=0||!game._inView(enemy))continue;
      const distance=(enemy.x-x)**2+(enemy.y-y)**2;
      if(distance<=nearest) { target=enemy;nearest=distance; }
    }
    if(!target)return;
    game._effect(x,y,'conduction',.26,0,'#c4e8ff',undefined,{x2:target.x,y2:target.y});
    game._hurtEnemy(target,damage,0,{x,y});
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
          game._hurtEnemy(enemy,bleed.damage);
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
