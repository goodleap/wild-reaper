import { groundOffset } from '../terrain.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive } from '../friendly-combat.js';
import { ANGEL_RULES } from '../site-definitions.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Both placed guardians and scripted arrivals use the same aura and attack
// behavior. A caller can supply a shared healing set to avoid stacking havens.
export function updateAngelGuardian(g,site,dt,{rules:overrides,healingTargets,heal=true,attack=true,targets=friendlyTargets(g)}={}) {
      if(g.status!=='playing'||!(dt>0)||!Number.isFinite(dt))return;
      const rules=overrides?{...ANGEL_RULES,...overrides}:ANGEL_RULES;
      site.castFace=Math.max(0,(site.castFace||0)-dt);
      site.healing=false;
      for(const ally of targets){
        if(!isFriendlyActive(g,ally)||ally.hp>=ally.maxHp)continue;
        const point=friendlyFoot(ally);
        if(distance(point,site)<=rules.guardRadius&&!g.terrain.firstBlocker(site.x,site.y,point.x,point.y,0,'projectile')){
          site.healing=true;
          if(heal){
            if(healingTargets)healingTargets.add(ally);
            else ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*rules.healingPerSecond*dt);
          }
        }
      }
      site._attack=Math.max(0,(site._attack||0)-dt);
      if(!attack||site._attack>1e-8||!g._inView(site,rules.guardRadius))return;
      const canHit=enemy=>enemy.hp>0&&!enemy.trainingDummy&&!enemy.dungeonId&&!(enemy.rescueSpawnGrace>0)&&enemy.guardActive!==false&&g._inView(enemy)&&
        Math.hypot(enemy.x-site.x,enemy.y+groundOffset(enemy)-site.y)<=rules.guardRadius;
      let target=null,nearest=Infinity;
      for(const enemy of g.enemies)if(canHit(enemy)){const d=Math.hypot(enemy.x-site.x,enemy.y+groundOffset(enemy)-site.y);if(d<nearest){target=enemy;nearest=d;}}
      if(!target)return;
      site._attack=rules.attackInterval;
      site.castFace=.25;
      const impact={x:target.x,y:target.y+groundOffset(target)},origin={x:site.x,y:site.y-19.8,groundY:site.y};
      const damage=rules.damage*(1+Math.min(rules.maxGrowthConnections,g.regions?.unlockedConnections?.size||0)*rules.connectionGrowth+Math.max(0,(g.region?.danger||1)-1));
      for(const enemy of g.enemies)if(canHit(enemy)&&Math.hypot(enemy.x-impact.x,enemy.y+groundOffset(enemy)-impact.y)<=rules.strikeRadius)
        g._hurtEnemy(enemy,damage,0,origin,'angel');
      // A long sky strike with a short lifetime: ten casts/second show at most
      // two live main bolts per guardian, without a global flash or shake.
      g._effect(impact.x,impact.y,'angelStrike',.18,rules.strikeRadius,'#f4edc0',undefined,{sourceX:site.x,sourceY:site.y,angelId:site.id});
}

export function updateAngels(settlements,dt,p) {
    const g=settlements.game,healing=new Set(),targets=friendlyTargets(g);
    for(const site of settlements.sites)if(site.type==='angel')updateAngelGuardian(g,site,dt,{healingTargets:healing,targets});
    // Overlapping havens never multiply healing; the aura stops at its real
    // world-space boundary and heals no one through a building foundation.
    if(dt>0)for(const ally of healing)if(isFriendlyActive(g,ally))
      ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*ANGEL_RULES.healingPerSecond*dt);
  }
