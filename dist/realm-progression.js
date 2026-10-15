import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';
import { majorFightActive, optionalFightNearby } from './event-scheduling.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const activeEnemy=e=>e?.hp>0&&!e.trainingDummy&&e.guardActive!==false&&e.territoryState!=='returning';

// Session-only growth. Trial IDs and reward identities never survive a run;
// quitting ends the run rather than attempting to restore part of a battle.
export class RealmProgression {
  constructor(game,{config=getConfigSection('realms')}={}) {
    this.game=game;this.config=config;this.enabled=config.enabledModes.includes(game.mode)&&(game.mode==='story'||game._worldExploration!==false);
    this.index=0;this.talismans=0;this.active=null;this.cooldown=0;this.lastResult=null;
    this._quiet=config.trial.quietSeconds;this._starterGranted=false;this._serial=0;this._disposed=false;
    this._rewarded=new WeakSet();this._rewardIds=new Set();this._settled=new Set();
  }

  get definition(){return this.config.definitions[this.index];}
  get nextDefinition(){return this.config.definitions[this.index+1]||null;}
  get cap(){return this.enabled?this.definition.maxLevel:null;}
  get bottleneck(){return this.enabled&&this.cap!==null&&this.game.player.level>=this.cap;}
  get xpFull(){return this.bottleneck&&this.game.player.xp>=this.game.player.xpNext;}
  get label(){return this.enabled?this.definition.name:'';}

  canLevelUp() {return !this.enabled||this.cap===null||this.game.player.level<this.cap;}

  capExperience() {
    if(!this.enabled||this._disposed)return;
    const p=this.game.player;
    if(this.bottleneck)p.xp=Math.min(p.xp,p.xpNext);
    if(this.xpFull&&!this._starterGranted) {
      this._starterGranted=true;this.addTalismans(this.config.materials.starter,'firstBottleneck');
      this.game._emit?.('realmBottleneck',{realmId:this.definition.id,nextRealmId:this.nextDefinition?.id});
    }
  }

  addTalismans(amount,source='reward') {
    if(!this.enabled||this._disposed||!Number.isSafeInteger(amount)||amount<=0)return 0;
    const before=this.talismans;this.talismans=Math.min(this.config.materials.inventoryCap,before+amount);
    if(this.talismans>before)this.game._emit?.('tribulationMaterial',{amount:this.talismans-before,total:this.talismans,name:this.config.materials.name,source});
    return this.talismans-before;
  }

  onEnemyDefeated(enemy) {
    if(!this.enabled||this._disposed||!enemy||enemy.hp>0||enemy.summoned||enemy.trainingDummy||enemy.storyEnemy||enemy.storyId||enemy.debugBoss)return false;
    const amount=enemy.type==='boss'?this.config.materials.bossDrop:enemy.affix?this.config.materials.eliteDrop:0;
    if(!amount||this._rewarded.has(enemy)||enemy.id!=null&&this._rewardIds.has(enemy.id))return false;
    this._rewarded.add(enemy);if(enemy.id!=null)this._rewardIds.add(enemy.id);
    this.addTalismans(amount,enemy.type==='boss'?'boss':'elite');return true;
  }

  _foot(entity=this.game.player,player=true) {return {x:entity.x,y:entity.y+groundOffset(entity,player)};}
  _combatNearby() {
    const p=this._foot(),radius=this.config.trial.combatRadius;
    return this.game.enemies?.some(e=>activeEnemy(e)&&distance(p,this._foot(e,false))<=radius)||false;
  }
  _angelNearby(point,radius=0) {
    return this.game.settlements?.sites?.some(site=>site.type==='angel'&&site.storyHidden!==true&&site.state!=='disabled'&&distance(point,site)<=(site.guardRadius||site.auraRadius||300)+radius)||false;
  }
  _openGround(point) {
    const g=this.game,t=this.config.trial,r=t.arenaRadius+t.clearancePadding;
    if(g.terrain?.isFree?.(point.x,point.y,r,'ground')!==true||g.terrain?.isDry?.(point.x,point.y,r)===false||g.environment?.isHazardFree?.(point.x,point.y,r)===false)return false;
    const waters=g.environment?.watersInBounds?.({minX:point.x-r,minY:point.y-r,maxX:point.x+r,maxY:point.y+r});
    return !waters?.some(patch=>patch.kind==='water'||patch.kind==='lava');
  }

  _blockedReason() {
    const g=this.game;
    if(this._disposed)return '本次冒险已结束';
    if(g.status!=='playing'&&g.status!=='paused')return '当前无法渡劫';
    if(g.story?.active||g.story?.temporary?.active)return '序章结束后方可渡劫';
    if(g.dungeon?.active||g.sceneKind==='dungeon'||g.sceneKind==='cave')return '请在室外渡劫';
    if(g.sceneTransition?.active||g.regionTransition||g.regionGrace>0)return '等待场景稳定';
    if(this.cooldown>0)return `调息中，${Math.ceil(this.cooldown)}秒后可重试`;
    if(this._combatNearby()||this._quiet<this.config.trial.quietSeconds||g.player.hurtFlash>0)return '先脱离战斗并稍作调息';
    if(majorFightActive(g)||optionalFightNearby(g))return '先结束附近的遭遇或首领战';
    const point=this._foot();
    if(this._angelNearby(point,this.config.trial.arenaRadius))return '请离开天使守护范围';
    if(!this._openGround(point))return '请寻找足够开阔的安全地面';
    return '';
  }

  getAction() {
    if(!this.enabled||!this.xpFull||!this.nextDefinition||this.active)return null;
    const reason=this._blockedReason();
    return {id:'tribulation',label:`渡劫·${this.nextDefinition.name}`,enabled:!reason,reason,materials:this.talismans,selectedMaterials:Math.min(this.config.materials.maxPerTrial,this.talismans),maxMaterials:this.config.materials.maxPerTrial};
  }

  start(count=Math.min(this.config.materials.maxPerTrial,this.talismans)) {
    if(!Number.isSafeInteger(count)||count<0||count>this.config.materials.maxPerTrial||count>this.talismans)return false;
    if(!this.getAction()?.enabled)return false;
    // UI may inspect the action while the character panel pauses the world;
    // the transaction itself commits only once actual play resumes.
    if(this.game.status!=='playing')return false;
    const d=this.definition,t=this.config.trial;
    this.talismans-=count;
    this.active={id:`tribulation:${++this._serial}`,realmIndex:this.index,elapsed:0,duration:d.duration,totalBolts:d.bolts,bolts:0,center:this._foot(),radius:t.arenaRadius,materials:count,pending:null,mapId:this.game.mapId,terrain:this.game.terrain};
    this.lastResult=null;this.game._emit?.('tribulationStarted',{trialId:this.active.id,materials:count,realmId:d.id});return true;
  }

  _strike(trial) {
    const g=this.game,p=g.player,t=this.config.trial,mark=trial.pending;
    if(!mark)return;
    const direct=distance(this._foot(),mark)<=mark.r+p.r;
    const ratio=t.pressureRatio+(direct?t.directRatio:0),reduction=1-trial.materials*this.config.materials.damageReductionEach;
    // Heavenly damage owns its own source. Ordinary invulnerability, defense,
    // barriers and story buffs cannot turn a tribulation into a free upgrade.
    const damage=p.maxHp*ratio*reduction;p.hp=Math.max(0,p.hp-damage);p.hurtFlash=Math.max(p.hurtFlash||0,.35);p.hurtFace=.24;
    g._effect?.(mark.x,mark.y,'lightning',.3,mark.r,this.config.colors.strike,undefined,{source:'tribulation',tribulation:true});
    g._effect?.(p.x,p.y-16,'damage',.7,0,this.config.colors.strike,`-${Math.ceil(damage)}`,{source:'tribulation'});
    g._emit?.('hurt',{source:'tribulation'});g._emit?.('tribulationStrike',{trialId:trial.id,bolt:trial.bolts+1,direct,damage});
    trial.bolts++;trial.pending=null;
    if(p.hp<=0){g.status='dead';this._settle(false,'death',trial.id);}
  }

  _settle(success,reason,id=this.active?.id) {
    const trial=this.active;
    if(!trial||trial.id!==id||this._settled.has(id))return false;
    this._settled.add(id);this.active=null;
    if(success) {
      // Opening the next cap before delegating preserves the ordinary XP
      // cost, level statistics and health growth; the capped pool buys one level.
      this.index=trial.realmIndex+1;this.game._levelUp();this.capExperience();
    }else this.cooldown=this.config.trial.retrySeconds;
    this.lastResult={trialId:id,success,reason,realmId:this.definition.id};
    this.game._emit?.(success?'realmBreakthrough':'tribulationFailed',{...this.lastResult,name:this.definition.name});return true;
  }

  cancel(reason='cancelled') {return this._settle(false,reason);}

  update(dt) {
    const g=this.game;
    if(this._disposed||!this.enabled)return;
    if(g.status==='dead'){this.cancel('death');return;}
    if(g.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.1);this.cooldown=Math.max(0,this.cooldown-dt);
    this._quiet=this._combatNearby()||g.player.hurtFlash>0?0:this._quiet+dt;
    const trial=this.active;if(!trial)return;
    if(g.mapId!==trial.mapId||g.terrain!==trial.terrain||g.dungeon?.active||g.sceneTransition?.active){this.cancel('scene-change');return;}
    if(distance(this._foot(),trial.center)>trial.radius){this.cancel('left-area');return;}
    if(this._angelNearby(this._foot())){this.cancel('angel-aura');return;}
    trial.elapsed=Math.min(trial.duration,trial.elapsed+dt);
    const nextAt=(trial.bolts+1)*trial.duration/trial.totalBolts,t=this.config.trial;
    if(!trial.pending&&trial.elapsed+1e-8>=nextAt-t.warning)trial.pending={...this._foot(),r:t.boltRadius,warning:t.warning,remaining:Math.max(0,nextAt-trial.elapsed)};
    if(trial.pending)trial.pending.remaining=Math.max(0,nextAt-trial.elapsed);
    if(trial.elapsed+1e-8>=nextAt)this._strike(trial);
    if(this.active===trial&&trial.bolts===trial.totalBolts)this._settle(true,'completed',trial.id);
  }

  getState() {
    const trial=this.active;
    return {enabled:this.enabled,realmId:this.definition.id,realmName:this.label,nextRealmName:this.nextDefinition?.name||null,cap:this.cap,bottleneck:this.bottleneck,xpFull:this.xpFull,talismans:this.talismans,cooldown:this.cooldown,lastResult:this.lastResult&&{...this.lastResult},trial:trial?{id:trial.id,elapsed:trial.elapsed,duration:trial.duration,bolts:trial.bolts,totalBolts:trial.totalBolts,remaining:Math.max(0,trial.duration-trial.elapsed),center:{...trial.center},radius:trial.radius,pending:trial.pending&&{...trial.pending}}:null};
  }

  getMarkers() {
    const trial=this.active;if(!trial)return [];
    const markers=[{kind:'tribulationBoundary',...trial.center,r:trial.radius,color:this.config.colors.boundary}];
    if(trial.pending)markers.push({kind:'tribulationWarning',x:trial.pending.x,y:trial.pending.y,r:trial.pending.r,color:this.config.colors.warning,remaining:trial.pending.remaining,progress:1-trial.pending.remaining/trial.pending.warning});
    return markers;
  }

  dispose(reason='exit') {this.cancel(reason);this._disposed=true;}
}
