import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Session-only growth. Trial IDs and reward identities never survive a run;
// quitting ends the run rather than attempting to restore part of a battle.
export class RealmProgression {
  constructor(game,{config=getConfigSection('realms'),costForLevel=null,random=Math.random}={}) {
    this.game=game;this.config=config;this.enabled=game.mode==='world'&&config.enabledModes.includes(game.mode)&&game._worldExploration!==false;
    this.index=0;this.talismans=0;this.active=null;this.cooldown=0;this.lastResult=null;
    this._costForLevel=costForLevel;this._random=random;this._starterGranted=false;this._serial=0;this._disposed=false;
    this._rewarded=new WeakSet();this._rewardIds=new Set();this._settled=new Set();
  }

  get definition(){return this.config.definitions[this.index];}
  get nextDefinition(){return this.config.definitions[this.index+1]||null;}
  get cap(){return this.enabled?this.definition.maxLevel:null;}
  get bottleneck(){return this.enabled&&this.cap!==null&&this.game.player.level>=this.cap;}
  get xpFull(){return this.bottleneck&&this.game.player.xp>=this.game.player.xpNext;}
  get label(){return this.enabled?this.definition.name:'';}
  get recommendedMaterials(){return this.enabled?Math.min(this.config.materials.maxPerTrial,this.talismans):0;}
  get xpRemaining(){
    if(!this.enabled||this.cap===null)return null;
    const p=this.game.player;let remaining=Math.max(0,p.xpNext-p.xp);
    if(p.level<this.cap&&typeof this._costForLevel!=='function')return null;
    for(let level=p.level+1;level<=this.cap;level++)remaining+=this._costForLevel(level);
    return remaining;
  }

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
  _landingPoint() {
    const point=this._foot(),angle=this._random()*Math.PI*2,radius=Math.sqrt(this._random())*this.config.trial.boltSpreadRadius;
    return {x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius};
  }

  _blockedReason() {
    const g=this.game;
    if(this._disposed)return '本次冒险已结束';
    if(g.status!=='playing'&&g.status!=='paused')return '当前无法渡劫';
    if(g.story?.active||g.story?.temporary?.active)return '序章结束后方可渡劫';
    if(g.dungeon?.active||g.sceneKind==='dungeon'||g.sceneKind==='cave')return '请在室外渡劫';
    if(g.sceneTransition?.active||g.regionTransition||g.regionGrace>0)return '等待场景稳定';
    if(this.cooldown>0)return `调息中，${Math.ceil(this.cooldown)}秒后可重试`;
    return '';
  }

  getAction() {
    if(!this.enabled||!this.xpFull||!this.nextDefinition||this.active)return null;
    const reason=this._blockedReason();
    return {id:'tribulation',label:`渡劫·${this.nextDefinition.name}`,enabled:!reason,reason,materials:this.talismans,selectedMaterials:this.recommendedMaterials,recommendedMaterials:this.recommendedMaterials,maxMaterials:this.config.materials.maxPerTrial};
  }

  start(count=Math.min(this.config.materials.maxPerTrial,this.talismans)) {
    if(!Number.isSafeInteger(count)||count<0||count>this.config.materials.maxPerTrial||count>this.talismans)return false;
    if(!this.getAction()?.enabled)return false;
    // UI may inspect the action while the character panel pauses the world;
    // the transaction itself commits only once actual play resumes.
    if(this.game.status!=='playing')return false;
    const d=this.definition;
    this.talismans-=count;
    this.active={id:`tribulation:${++this._serial}`,realmIndex:this.index,elapsed:0,duration:d.duration,totalBolts:d.bolts,bolts:0,materials:count,pending:null,mapId:this.game.mapId,terrain:this.game.terrain};
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
    const trial=this.active;if(!trial)return;
    if(g.mapId!==trial.mapId||g.terrain!==trial.terrain||g.dungeon?.active||g.sceneTransition?.active){this.cancel('scene-change');return;}
    trial.elapsed=Math.min(trial.duration,trial.elapsed+dt);
    const nextAt=(trial.bolts+1)*trial.duration/trial.totalBolts,t=this.config.trial;
    // Each warning samples the current position once. Its marked landing stays
    // fixed so movement can avoid the strike while the trial follows the player.
    if(!trial.pending&&trial.elapsed+1e-8>=nextAt-t.warning)trial.pending={...this._landingPoint(),r:t.boltRadius,warning:t.warning,remaining:Math.max(0,nextAt-trial.elapsed)};
    if(trial.pending)trial.pending.remaining=Math.max(0,nextAt-trial.elapsed);
    if(trial.elapsed+1e-8>=nextAt)this._strike(trial);
    if(this.active===trial&&trial.bolts===trial.totalBolts)this._settle(true,'completed',trial.id);
  }

  getState() {
    const trial=this.active;
    return {enabled:this.enabled,realmId:this.enabled?this.definition.id:null,realmName:this.label,nextRealmName:this.enabled?this.nextDefinition?.name||null:null,cap:this.cap,breakthroughLevel:this.enabled?this.nextDefinition?.minLevel??null:null,bottleneck:this.bottleneck,xpFull:this.xpFull,xpRemaining:this.xpRemaining,talismans:this.talismans,recommendedMaterials:this.recommendedMaterials,cooldown:this.cooldown,lastResult:this.lastResult&&{...this.lastResult},trial:trial?{id:trial.id,elapsed:trial.elapsed,duration:trial.duration,bolts:trial.bolts,totalBolts:trial.totalBolts,remaining:Math.max(0,trial.duration-trial.elapsed),pending:trial.pending&&{...trial.pending}}:null};
  }

  getMarkers() {
    const trial=this.active;if(!trial)return [];
    const markers=[];
    if(trial.pending)markers.push({kind:'tribulationWarning',x:trial.pending.x,y:trial.pending.y,r:trial.pending.r,color:this.config.colors.warning,remaining:trial.pending.remaining,progress:1-trial.pending.remaining/trial.pending.warning});
    return markers;
  }

  dispose(reason='exit') {this.cancel(reason);this._disposed=true;}
}
