// Run-only relics are awarded at a portal, at most once per unique item.
// The world owns the portal transition; this module owns only its reward.
export const RELICS=Object.freeze([
  Object.freeze({id:'thunderstone',name:'引雷石',icon:'ϟ',color:'#bfcafa',desc:'雷电、天雷或感电传导击杀敌人，天雷冷却减少 0.3 秒；每秒最多减少 1.2 秒'}),
  Object.freeze({id:'bloodstone',name:'赤心',icon:'◆',color:'#eaa08f',desc:'生命低于 40% 时，所有武器伤害提升 25%'}),
  Object.freeze({id:'herbalEcho',name:'春芽符',icon:'✿',color:'#b9dda5',desc:'拾取药草并实际恢复生命时，释放一道范围 125、基础伤害 60 的冲击波'}),
  Object.freeze({id:'leafWard',name:'铁叶护符',icon:'⬡',color:'#d2dbae',desc:'立即获得护罩，抵消下一次受击的至多 12 点伤害；消耗后 20 秒恢复一层'}),
  Object.freeze({id:'swiftFeather',name:'风羽',icon:'↗',color:'#a9d9de',desc:'移动速度额外提升 8%，可与轻盈步伐共同生效'}),
  Object.freeze({id:'deepRoot',name:'深根',icon:'♧',color:'#dac395',desc:'药草的治疗量提升 40%，从 25 点增加至 35 点；满血时仍保留药草'})
]);

export const RELIC_RULES=Object.freeze({
  thunderReduction:.3,thunderWindow:1,thunderLimit:4,
  lowHealthThreshold:.4,lowHealthDamage:1.25,
  herbRadius:125,herbDamage:60,herbHealing:1.4,
  shieldAbsorption:12,shieldRecharge:20,movement:1.08,collectionHeal:.2
});
const THUNDER_SOURCES=new Set(['lightning','storm','conduction']);

export class Relics {
  constructor(game) {
    this.game=game;
    this.owned=[];this.pending=false;this.choices=[];
    this.shieldReady=false;this.shieldCooldown=0;
    this.wardAmount=0;
    // Four timestamps bound both the rolling one-second allowance and memory.
    this._thunderKills=[];
  }

  has(id) { return this.owned.includes(id); }

  acquire(id) {
    const relic=RELICS.find(item=>item.id===id);
    if(!relic||this.has(id)||!['playing','shop','relic'].includes(this.game.status))return false;
    this.owned.push(id);
    if(id==='leafWard'){this.shieldReady=true;this.shieldCooldown=0;}
    this.game._refreshStats?.();
    this.game._emit('relicChosen',{relicId:id,name:relic.name});
    return true;
  }

  grantWard(amount) {
    if(!Number.isFinite(amount)||amount<=0||this.game.status==='dead')return false;
    const ward=Math.min(40,amount);if(this.wardAmount>=ward)return false;
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
    this.choices=available.slice(0,3);
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

  update(dt) {
    if(this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0||!this.has('leafWard')||this.shieldReady)return;
    this.shieldCooldown=Math.max(0,this.shieldCooldown-dt);
    if(this.shieldCooldown===0) {
      this.shieldReady=true;
      this.game._effect(this.game.player.x,this.game.player.y,'ring',.3,25,'#d2dbae');
    }
  }

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
    if(amount<=0||!this.has('leafWard')||!this.shieldReady)return amount;
    this.shieldReady=false;this.shieldCooldown=RELIC_RULES.shieldRecharge;
    const p=this.game.player;
    this.game._effect(p.x,p.y,'ring',.35,31,'#d2dbae');
    return Math.max(0,amount-RELIC_RULES.shieldAbsorption);
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
