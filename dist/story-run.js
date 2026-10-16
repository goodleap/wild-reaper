import { getConfigSection } from './content-config.js';
import { StoryFlow } from './story-flow.js';
import { TemporaryBuild } from './temporary-build.js';
import { groundOffset } from './terrain.js';
import { getHero } from './heroes.js';
import { resolveCharacterStats } from './combat-stats.js';
import { resetLocomotion } from './locomotion.js';
import { ANGEL_RULES } from './site-definitions.js';
import { StoryNavigation } from './story-navigation.js';
import { StoryPursuit } from './story-pursuit.js';

export const STORY_DEFINITIONS=getConfigSection('story').definitions;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=entity=>({x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+groundOffset(entity,!!entity.heroId)});
const objectives={awakening:'林海余烬',search:'离开营地 · 沿路前往林间谷地',escape:'追兵发现了你 · 沿路逃往公主所在的谷地',escort:'跟随公主 · 前往前方突围路口',pill:'燃脉丸已拿到 · 点击「服药」击退追兵',burst:'掩护公主求援 · 留在她附近迎击追兵',fading:'药力消退 · 沿路撤入守望光环',sanctuary:'守住光环 · 为天使引雷争取时间',judgment:'天雷降临 · 留在守护之内',conversation:'危机解除',complete:'沿林海追查押运队，寻找祭场线索'};
const conversations=new Set(['awakening','escort','pill','sanctuary','conversation']);
const titles={awakening:'序章 · 林海余烬',escort:'林间相逢',pill:'燃脉丸',sanctuary:'守望者降临',conversation:'余烬未熄'};
const continueLabels={awakening:'开始行动',escort:'一起突围',pill:'接过燃脉丸',sanctuary:'守住光环',conversation:'正式启航'};
const speakerNames={player:'王子',princess:'公主',angel:'守望天使'};

// This chapter owns its temporary cast and pursuers, not world geometry or the
// ordinary combat loop. No internal step is persisted: a new run starts clean.
export class StoryRun {
  constructor(game,{id='prologue'}={}) {
    this.game=game;this.definition=STORY_DEFINITIONS.find(entry=>entry.id===id);
    if(!this.definition)throw new RangeError(`Unknown story: ${id}`);
    this.id=id;this.name=this.definition.name;this.rules=this.definition.rules;
    this.actors=[];this.dialogue=[];this.completed=false;this.disposed=false;this.initialized=false;this.pillUsed=false;
    this.temporary=new TemporaryBuild(game);this.flow=new StoryFlow(this.definition.steps,step=>this._enter(step));
    this._lineId=0;this._lineState=new Map();
    this._clock=0;this._prayerProgress=0;this._sanctuaryProgress=0;this._helpReady=false;this._dialogueTotal=0;
    this.navigation=new StoryNavigation(game,this);
    this.pursuit=new StoryPursuit(game,this,this.definition.pursuit);
  }
  get step(){return this.flow.step;}
  get active(){return this.initialized&&!this.completed&&!this.disposed;}
  get suppressChoices(){return this.active;}
  get dialogueBlocking(){return this.active&&this.dialogue.length>0;}
  get dialogueExclusive(){return false;}
  get objective(){
    if(this.step==='burst'&&this._helpReady)return this.temporary.remaining<=6?'药力即将消退 · 立即撤向守望光环':'求援已有回应 · 趁药力仍在，跟公主撤向光环';
    if(this.step==='fading'&&!this._helpReady)return '靠近公主 · 掩护她完成求援';
    if(this.step==='sanctuary'&&!this._inAura())return '返回光环 · 离开守护范围会中断引雷';
    return objectives[this.step]||'';
  }
  _awaitingAngel(){return false;}
  get objectivePoint() {
    if(['search','escape'].includes(this.step))return this.anchors?.meeting;
    if(this.step==='escort')return this.anchors?.pill;
    if(['burst','fading'].includes(this.step))return this._helpReady?this.angel||this.anchors?.refuge:this.princess?foot(this.princess):null;
    if(['sanctuary','judgment'].includes(this.step))return this.angel||this.anchors?.refuge;
    return null;
  }
  getDialogue(){
    const line=this.dialogue[0];if(!this.active||!line)return null;
    return {...line,name:speakerNames[line.speaker],index:this._dialogueTotal-this.dialogue.length+1,total:this._dialogueTotal,
      title:titles[this.step]||this.name,nextLabel:this.dialogue.length===1?continueLabels[this.step]||'继续':'继续'};
  }
  advanceDialogue(skip=false){
    if(!this.dialogueBlocking)return false;
    const lines=skip?this.dialogue.splice(0):[this.dialogue.shift()];
    for(const line of lines){const state=this._lineState.get(line.id);state.presented=!skip;state.finished=true;state.skipped=skip;}
    if(!this.dialogue.length){
      const g=this.game;g.player.invuln=Math.max(g.player.invuln||0,1.5);
      if(this.step==='awakening')this.flow.go('search');
      else if(this.step==='pill')this._medicineReceivedAt=this._clock;
      else if(this.step==='conversation')this._beginDeparture();
    }
    return true;
  }
  getProgress(){
    if(!this.active||this.dialogueBlocking)return null;
    if(['burst','fading'].includes(this.step)&&!this._helpReady){
      const nearby=this.princess&&distance(foot(this.game.player),foot(this.princess))<=this.rules.prayerRadius;
      return {label:'公主求援',value:this._prayerProgress,max:this.rules.prayerDuration,detail:nearby?'守在公主附近，为她完成祈愿争取时间':'靠近公主，继续掩护求援'};
    }
    if(this.step==='burst')return {label:'燃脉药效',value:this.temporary.remaining,max:this.rules.pillDuration,detail:`还剩 ${Math.ceil(this.temporary.remaining)} 秒 · 前往光环，准备撤退`};
    if(this.step==='sanctuary')return {label:'天使引雷',value:this._sanctuaryProgress,max:this.rules.sanctuaryWaveSeconds*2,detail:this._inAura()?`守住光环 · 还需 ${Math.ceil(this.rules.sanctuaryWaveSeconds*2-this._sanctuaryProgress)} 秒`:'引雷暂停 · 回到光环内'};
    if(this.step==='judgment')return {label:'天雷降临',value:Math.max(0,this._clock-(this._judgmentStartedAt??this._clock)),max:this.rules.judgmentDuration,detail:'守护仍在 · 追兵即将溃散'};
    return null;
  }
  getObjectiveTarget(){const target=this.objectivePoint;return target?{...target,label:this.objective,color:'#eed898'}:null;}
  getGuide(){return this.navigation.getGuide();}
  getRecap(){return [...this._lineState.entries()].filter(([,state])=>state.presented).map(([id])=>this._recap?.get(id)).filter(Boolean).slice(-8).join('\n');}
  initialize() {
    if(this.initialized)return false;
    const g=this.game,layout=g.terrain.island?.layout,keys=this.definition.anchors;
    const area=id=>layout?.areas?.find(area=>area.id===id)?.center;
    const passage=id=>layout?.passages?.find(passage=>passage.id===id)?.waypoints;
    const origin=foot(g.player),meeting=area(keys.meetingArea),refuge=area(keys.refugeArea);
    const searchPath=passage(keys.searchPassage),escapePath=passage(keys.escapePassage);
    if(!meeting||!refuge||!searchPath?.length||!escapePath?.length)throw new Error(`Story ${this.id} requires its configured walkable anchors`);
    this.anchors={wake:{...origin},meeting:{...meeting},refuge:{...refuge},pill:{...escapePath[Math.floor(escapePath.length*.42)]}};
    this.paths={search:searchPath,escape:escapePath};
    this._sceneTerrain=g.terrain;this._sceneMapId=g.mapId;
    g.canonicalBuild??=g.build;this.initialized=true;this._createPrincess();this.flow.start();
    g._emit?.('storyStarted',{storyId:this.id,name:this.name});return true;
  }
  _queue(step) {
    this.dialogue=[];this._recap??=new Map();
    for(const line of conversations.has(step)?this.definition.dialogue[step]||[]:[]) {
      const id=`${this.id}:${++this._lineId}`;
      this.dialogue.push({...line,id});this._lineState.set(id,{step,presented:false,finished:false});
      this._recap.set(id,`${speakerNames[line.speaker]}：${line.text}`);
    }
    this._dialogueTotal=this.dialogue.length;
  }
  _linesFinished(step){return [...this._lineState.values()].filter(line=>line.step===step).every(line=>line.finished);}
  _enter(step) {
    const g=this.game;this._queue(step);
    g._emit?.('storyStep',{storyId:this.id,step});
    if(step==='fading'){
      this.temporary.stop('expired');
      // A warning precedes this change; a short grace covers the exact loss of
      // the shield so the player can continue the indicated escape route.
      g.player.invuln=Math.max(g.player.invuln||0,1.2);
    }
    if(step==='sanctuary'){this._createAngel();this._sanctuaryProgress=0;}
    if(step==='judgment'){
      this._judgmentAt=this._clock+this.rules.judgmentWindup;
      if(this.angel){this.angel.castFace=this.rules.judgmentWindup+.4;g._effect?.(this.angel.x,this.angel.y,'ring',this.rules.judgmentWindup,this.rules.guardRadius,'#f4edc0');}
    }
    if(step==='conversation'){
      this._clearHostileAttacks();
      // The rescue has ended. Its last lightning frame and floating damage
      // must not remain frozen over the entire concluding conversation.
      g.effects=[];g.bullets=[];g.attacks?.clearScene?.();
    }
    this.pursuit?.enter(step);
    if(step==='complete')this._complete();
  }
  _beginDeparture(){
    if(this.departing||this.completed)return false;
    this.departing=true;
    return this.game.sceneTransition.run('序章完成 · 正式启航',()=>this.flow.go('complete'));
  }
  _living(){return this.game.enemies.filter(enemy=>enemy.hp>0&&enemy.storyId===this.id);}
  _safePoint(around,{radius=18,min=0,max=260,ordinal=0,avoidPlayer=false}={}) {
    const g=this.game,p=foot(g.player),candidates=[];
    for(const ring of [min,Math.max(min,70),Math.max(min,140),max])for(let i=0;i<24;i++) {
      const angle=(i+ordinal*3)*Math.PI/12;
      candidates.push({x:around.x+Math.cos(angle)*ring,y:around.y+Math.sin(angle)*ring});
    }
    // Existing route nodes are valid fallbacks in narrow winding passages.
    candidates.push(...[...this.paths.search,...this.paths.escape].filter(point=>distance(point,around)<max+250).sort((a,b)=>distance(a,around)-distance(b,around)));
    for(const point of candidates) {
      if(avoidPlayer&&distance(point,p)<100||!g.terrain.isFree(point.x,point.y,radius+5)||g.terrain.island?.isDry(point.x,point.y,radius+5)===false)continue;
      if(g.environment?.isHazardFree?.(point.x,point.y,radius+5)===false)continue;
      if(g.enemies.some(enemy=>enemy.hp>0&&distance(foot(enemy),point)<enemy.r+radius+8))continue;
      return {...point};
    }
    return null;
  }
  _createPrincess() {
    if(this.princess)return this.princess;
    const point=this._safePoint(this.anchors.meeting,{radius:15,max:180})||this.anchors.meeting;
    const hero=getHero('princess');
    this.princess={id:'story:princess',storyActor:true,name:'公主',heroId:'princess',appearanceId:hero.appearanceId||'princess-v2',x:point.x,y:point.y-19.8,groundOffset:19.8,r:15,hp:1,maxHp:1,speed:hero.baseSpeed,facing:0,following:true};
    resetLocomotion(this.princess);this.actors.push(this.princess);return this.princess;
  }
  _createAngel() {
    if(this.angel)return this.angel;
    const point=this._safePoint(this.anchors.refuge,{radius:16,max:100})||this.anchors.refuge;
    this.angel={id:'story:angel',storyActor:true,type:'angel',kind:'angel',name:'守望天使',x:point.x,y:point.y,r:15,hp:1,maxHp:1,flying:true,guardRadius:this.rules.guardRadius,auraRadius:this.rules.guardRadius,healing:true,castFace:1,seed:916};
    this.actors.push(this.angel);this.game._effect?.(point.x,point.y,'ring',1.4,this.rules.guardRadius,'#f4edc0');return this.angel;
  }
  updateActors(dt){if(this.active&&!this.dialogueBlocking)this.navigation.updatePrincess(dt);}
  beforeEnemy(enemy,dt) {
    return this.active&&this.pursuit.beforeEnemy(enemy,dt);
  }
  onEnemyDefeated(enemy) {
    if(!this.active||enemy.storyId!==this.id)return;
    if(this.step==='search')this.flow.go('escape');
  }
  _found() {
    const g=this.game,p=foot(g.player);
    return this._living().some(enemy=>enemy.hp<enemy._storyInitialHp||distance(foot(enemy),p)<=this.rules.noticeRange&&!g.terrain.firstBlocker(enemy.x,foot(enemy).y,p.x,p.y,0,'sight'));
  }
  _near(point,radius=this.rules.arrivalRadius){return distance(foot(this.game.player),point)<=radius;}
  _inAura(){const p=foot(this.game.player);return !!this.angel&&distance(p,this.angel)<=this.rules.guardRadius&&!this.game.terrain.firstBlocker(this.angel.x,this.angel.y,p.x,p.y,0,'sight');}
  get guardReduction(){return this.active&&['sanctuary','judgment'].includes(this.step)&&this._inAura()?this.rules.guardReduction:0;}
  update(dt) {
    if(!this.active||this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    if(this.game.terrain!==this._sceneTerrain||this.game.mapId!==this._sceneMapId){this.cleanup('sceneChange');return;}
    if(this.dialogueBlocking)return;
    const g=this.game;this._clock+=dt;this.flow.update(dt);
    const wasBoosted=this.temporary.active;this.temporary.update(dt);
    if(wasBoosted&&!this.temporary.active&&this.step==='burst')this.flow.go('fading');
    this.pursuit.update(dt);
    if(['burst','fading'].includes(this.step)&&!this._helpReady&&this.princess){
      const nearby=distance(foot(g.player),foot(this.princess))<=this.rules.prayerRadius;
      if(nearby){
        this._prayerProgress=Math.min(this.rules.prayerDuration,this._prayerProgress+dt);this.princess.castFace=.25;
        if(this._clock>=(this._nextPrayerPulse||0)){g._effect?.(this.princess.x,foot(this.princess).y,'ring',.9,38,'#d4e9c5');this._nextPrayerPulse=this._clock+1.2;}
      }
      if(this._prayerProgress>=this.rules.prayerDuration){this._helpReady=true;this._createAngel();g._emit?.('storyAidReady',{storyId:this.id});}
    }
    if(this.angel) {this.angel.castFace=Math.max(0,this.angel.castFace-dt);this.angel.healing=this._inAura();}
    if(this.guardReduction>0)g.player.hp=Math.min(g.player.maxHp,g.player.hp+g.player.maxHp*this.rules.guardHealing*dt);
    switch(this.step) {
      case 'awakening':
        if(this._linesFinished('awakening'))this.flow.next();
        break;
      case 'search':
        // Seeing the rear patrol or leaving camp starts the chase. Slower
        // pursuers must never force a correctly fleeing player to walk back.
        if(this._found()||this._living().some(enemy=>g._inView(enemy)&&!g.terrain.firstBlocker(enemy.x,foot(enemy).y,g.player.x,foot(g.player).y,0,'sight'))||this._near(this.anchors.meeting,350))this.flow.next();
        break;
      case 'escape':if(this._near(this.anchors.meeting))this.flow.next();break;
      case 'escort':
        if(this._near(this.anchors.pill)&&distance(foot(this.princess),foot(g.player))<240)this.flow.next();
        break;
      case 'fading':
        if(this._helpReady&&this._near(this.angel||this.anchors.refuge,200)&&distance(foot(this.princess),foot(g.player))<350)this.flow.next();
        break;
      case 'sanctuary':
        if(this._inAura())this._sanctuaryProgress=Math.min(this.rules.sanctuaryWaveSeconds*2,this._sanctuaryProgress+dt);
        if(this._sanctuaryProgress>=this.rules.sanctuaryWaveSeconds*2)this.flow.next();
        break;
      case 'judgment':
        if(this._clock>=this._judgmentAt) {
          if(!this._judgmentStartedAt){this._judgmentStartedAt=this._clock;this._judgment();this._nextJudgmentStrike=this._clock;}
          if(this._clock>=this._nextJudgmentStrike) {
            this._showJudgmentStrikes();this._nextJudgmentStrike=this._clock+ANGEL_RULES.attackInterval;
          }
          if(this._clock-this._judgmentStartedAt>=this.rules.judgmentDuration) {
            // Idempotent fallback for a late script spawn. Dead enemies cannot
            // pay XP or kill credit again during the continuing spectacle.
            for(const enemy of this._living())g.combat.storyJudgment(enemy,{x:this.angel.x,y:this.angel.y,groundY:this.angel.y});
            this.flow.next();
          }
        }
        break;

    }
  }
  getAction() {
    if(!this.active||this.dialogueBlocking||this.game.status!=='playing')return null;
    // The medicine is carried after the handover; the princess's moving
    // interaction radius can no longer make this vital control disappear.
    if(this.step==='pill'&&Number.isFinite(this._medicineReceivedAt)&&!this.pillUsed)return {id:'story:take-pill',label:'服药',detail:`燃脉丸 · 激发潜力 ${this.rules.pillDuration} 秒`,enabled:true};
    return null;
  }
  useAction(id) {
    const action=this.getAction();if(!action||action.id!==id)return false;
    if(id==='story:take-pill') {
      if(!this.temporary.start({duration:this.rules.pillDuration,moveSpeedBonus:this.rules.moveSpeedBonus,damageReductionBonus:this.rules.damageReductionBonus,damageReductionCap:this.rules.damageReductionCap}))return false;
      this.pillUsed=true;this.flow.go('burst');return true;
    }
    return false;
  }
  getBuff() {
    if(!this.temporary.active)return null;
    return {id:'burning-potential',label:'燃脉激发',name:'燃脉激发',remaining:this.temporary.remaining,maxDuration:this.temporary.maxDuration,speedPercent:this.temporary.moveSpeedBonus*100,damageReduction:resolveCharacterStats(this.game).damageReduction,damageReductionBonus:this.temporary.damageReductionBonus};
  }
  _clearHostileAttacks() {
    const g=this.game;g.enemyBullets=[];
    if(g.abilities)g.abilities.effects=g.abilities.effects.filter(effect=>!effect.hostile);
    for(const enemy of g.enemies){g._clearRegionalBossAttacks?.(enemy);enemy.specialAttack=null;enemy.specialist=null;}
  }
  _judgment() {
    const g=this.game;this._clearHostileAttacks();
    const living=[...g.enemies].filter(enemy=>enemy.hp>0);
    const origin={x:this.angel.x,y:this.angel.y-19.8,groundY:this.angel.y};
    for(const enemy of living)g.combat.storyJudgment(enemy,origin);
    this._judgmentPoints=living.map(enemy=>foot(enemy));
    if(this._judgmentPoints.length<8)for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4,p=foot(g.player);
      this._judgmentPoints.push({x:p.x+Math.cos(angle)*Math.min(300,g.viewWidth*.4),y:p.y+Math.sin(angle)*Math.min(200,g.viewHeight*.35)});
    }
    g._emit?.('storyJudgment',{damage:this.rules.judgmentDamage,count:living.length});
  }
  _showJudgmentStrikes() {
    const g=this.game;this.angel.castFace=.25;
    // Reinforcements still enter during the cast. Each arriving soldier is a
    // real target, and receives the same judgment once on the next pulse.
    const arriving=this._living().filter(enemy=>g._inView(enemy)&&this.pursuit.clock>=enemy._storyAdmission);
    if(arriving.length){
      this._clearHostileAttacks();
      const origin={x:this.angel.x,y:this.angel.y-19.8,groundY:this.angel.y};
      for(const enemy of arriving)g.combat.storyJudgment(enemy,origin);
      this._judgmentPoints=[...this._judgmentPoints,...arriving.map(enemy=>foot(enemy))].slice(-64);
    }
    // Several old landing points fill the existing scene. Every individual
    // bolt retains the ordinary angel's original .18-second animation.
    for(const point of this._judgmentPoints)g._effect?.(point.x,point.y,'angelStrike',.18,ANGEL_RULES.strikeRadius,'#f4edc0',undefined,{sourceX:this.angel.x,sourceY:this.angel.y,angelId:this.angel.id,storyJudgment:true});
  }
  _complete() {
    if(this.completed)return;
    const g=this.game;this.temporary.stop('complete');this.completed=true;this.completionTime=g.runTime??this._clock;
    this.dialogue=[];this._clearHostileAttacks();this.pursuit.clear();
    // Keep the canonical build and earned results for the victory archive;
    // this chapter ends without instantiating an exploration population.
    g._choices=null;
    this.actors=[];g._refreshStats?.();g._refreshWeapons?.();
    g.status='victory';
    g._emit?.('storyCompleted',{storyId:this.id,name:this.name,time:this.completionTime});
    g._emit?.('victory',{storyId:this.id,storyName:this.name});
  }
  cleanup(reason='exit') {
    if(this.disposed)return false;
    this.temporary.stop(reason);this.disposed=true;this.dialogue=[];this.actors=[];this._clearHostileAttacks();
    this.pursuit.clear(reason);this.game.sceneContent.dispose();
    return true;
  }
}
