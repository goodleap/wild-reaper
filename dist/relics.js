import { getConfigSection } from './content-config.js';
// Run-only relics are awarded at a portal, at most once per unique item.
// The world owns the portal transition; this module owns only its reward.
const economy=getConfigSection('economy');
export const RELIC_RULES=economy.relicRules;
const rules=RELIC_RULES,values={...rules,thunderWindowLabel:rules.thunderWindow===1?'每秒':`每 ${rules.thunderWindow} 秒`,thunderWindowReduction:Math.round(rules.thunderReduction*rules.thunderLimit*100)/100,lowHealthPercent:Math.round(rules.lowHealthThreshold*100),lowHealthDamagePercent:Math.round((rules.lowHealthDamage-1)*100),barrierCapacityPercent:Math.round((rules.barrierCapacityMultiplier-1)*100),barrierCooldownPercent:Math.round((1-rules.barrierCooldownMultiplier)*100),movementPercent:Math.round((rules.movement-1)*100),herbHealingPercent:Math.round((rules.herbHealing-1)*100),herbBaseHealing:economy.pickups.herbHealing,herbTotalHealing:Math.round(economy.pickups.herbHealing*rules.herbHealing*100)/100};
export const RELICS=Object.freeze(economy.relics.map(relic=>Object.freeze({...relic,desc:relic.desc.replace(/\{([A-Za-z]+)\}/g,(_,key)=>String(values[key]))})));
const THUNDER_SOURCES=new Set(['lightning','storm','conduction']);

export class Relics {
  constructor(game) {
    this.game=game;
    this.owned=[];this.pending=false;this.choices=[];
    this.wardAmount=0;
    // The configured rolling allowance also bounds timestamp memory.
    this._thunderKills=[];
  }

  has(id) { return this.owned.includes(id); }

  // Read-only aliases let existing status consumers refer to the single
  // barrier state; the relic no longer owns a rechargeable shield or timer.
  get shieldReady(){return this.has('leafWard')&&!!this.game.barrier?.ready;}
  get shieldCooldown(){return this.has('leafWard')?(this.game.barrier?.cooldown||0):0;}

  acquire(id) {
    const relic=RELICS.find(item=>item.id===id);
    if(!relic||this.has(id)||!['playing','shop','relic'].includes(this.game.status))return false;
    this.owned.push(id);
    let grantedBarrier=false;
    if(id==='leafWard'&&!this.game.build?.getSkill('barrier')?.acquired)
      grantedBarrier=this.game.build?.increment('barrier')||false;
    this.game._refreshStats?.();
    if(grantedBarrier){this.game._refreshWeapons?.();this.game._emit('skillAcquired',{skillId:'barrier',name:'守护屏障'});}
    this.game._emit('relicChosen',{relicId:id,name:relic.name});
    return true;
  }

  grantWard(amount) {
    if(!Number.isFinite(amount)||amount<=0||this.game.status==='dead')return false;
    const ward=Math.min(RELIC_RULES.maxWard,amount);if(this.wardAmount>=ward)return false;
    this.wardAmount=ward;
    const p=this.game.player;this.game._effect(p.x,p.y,'ring',.5,34,'#f1e3b7');
    return true;
  }

  offer() {
    if(this.pending)return false;
    this.pending=true;this.choices=[];
    return true;
  }

  getChoices() {
    if(!this.pending)return [];
    if(this.choices.length)return this.choices;
    const available=RELICS.filter(relic=>!this.has(relic.id));
    for(let i=available.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [available[i],available[j]]=[available[j],available[i]];
    }
    this.choices=available.slice(0,RELIC_RULES.choiceCount);
    return this.choices;
  }

  choose(id) {
    if(this.game.status!=='relic'||!this.pending||this.has(id)||!this.choices.some(relic=>relic.id===id))return false;
    // Commit the award before any effect or transition hook can be invoked.
    if(!this.acquire(id))return false;
    this.pending=false;this.choices=[];
    return true;
  }

  completeCollectionReward() {
    const g=this.game,p=g.player;
    if(!this.pending||!RELICS.every(relic=>this.has(relic.id)))return false;
    this.pending=false;this.choices=[];
    const healed=Math.max(0,Math.min(p.maxHp*RELIC_RULES.collectionHeal,p.maxHp-p.hp));
    p.hp+=healed;
    if(healed>0)g._effect(p.x,p.y-28,'heal',.8,0,'#b9e89c',`+${Math.ceil(healed)}`);
    g._emit('relicSupply',{healed});
    return true;
  }

  update() {}

  damageMultiplier() {
    const p=this.game.player;
    return this.has('bloodstone')&&p.hp<p.maxHp*RELIC_RULES.lowHealthThreshold?RELIC_RULES.lowHealthDamage:1;
  }

  movementMultiplier() { return this.has('swiftFeather')?RELIC_RULES.movement:1; }

  modifyIncomingDamage(amount) {
    // The caller performs the invulnerability guard first and still starts
    // its normal invulnerability window when the shield absorbs all damage.
    if(this.game.status!=='playing'||!Number.isFinite(amount)||amount<=0)return amount;
    if(this.wardAmount>0){
      amount=Math.max(0,amount-this.wardAmount);this.wardAmount=0;
      this.game._effect(this.game.player.x,this.game.player.y,'ring',.35,34,'#f1e3b7');
    }
    return amount;
  }

  modifyHerbHealing(base) { return base*(this.has('deepRoot')?RELIC_RULES.herbHealing:1); }

  onHerb(healed) {
    const g=this.game,p=g.player;
    if(g.status!=='playing'||!(healed>0)||!this.has('herbalEcho'))return false;
    const r=RELIC_RULES.herbRadius,damage=RELIC_RULES.herbDamage*g._damageMultiplier();
    g._effect(p.x,p.y,'ring',.55,r,'#b9dda5');
    // Raw damage avoids applying bleed/shock or invoking another herb effect.
    for(const enemy of g.enemies)if(enemy.hp>0&&Math.hypot(enemy.x-p.x,enemy.y-p.y)<=r+enemy.r)
      g._hurtEnemy(enemy,damage,12,p,'relic');
    return true;
  }

  onEnemyKilled(enemy,source) {
    const g=this.game,p=g.player;
    if(g.status!=='playing'||enemy.hp>0||enemy._relicThunderAwarded||!this.has('thunderstone')||!THUNDER_SOURCES.has(source))return 0;
    // Death notification can be forwarded by more than one integration hook;
    // an individual kill can never refund cooldown twice.
    enemy._relicThunderAwarded=true;
    if(!(p.skillCooldown>0))return 0;
    const now=g._clock;
    this._thunderKills=this._thunderKills.filter(time=>now-time<RELIC_RULES.thunderWindow-1e-9);
    if(this._thunderKills.length>=RELIC_RULES.thunderLimit)return 0;
    const reduction=Math.min(RELIC_RULES.thunderReduction,p.skillCooldown);
    p.skillCooldown=Math.max(0,p.skillCooldown-reduction);
    this._thunderKills.push(now);
    return reduction;
  }
}
