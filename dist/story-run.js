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
import { updateAngelGuardian } from './sites/angel-guardian.js';
import { beginUnitArrival, unitArrivalComplete } from './unit-arrival.js';
import { createJudgmentPlan, judgmentBatch } from './judgment-layout.js';
import { clearSceneActors } from './scene-actors.js';

export const STORY_DEFINITIONS=getConfigSection('story').definitions;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=entity=>({x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+groundOffset(entity,!!entity.heroId)});
const objectives={awakening:'郊野重生',search:'避开搜寻队，沿郊外旧路前进',escape:'甩开追兵，与公主会合',escort:'跟随公主突围',pill:'燃脉丸已拿到 · 点击「服药」击退追兵',burst:'跟随公主 · 前往召唤地点',fading:'药力消退 · 跟紧公主',sanctuary:'守住光环 · 为天使引雷争取时间',judgment:'天雷降临 · 留在守护之内',conversation:'危机解除',complete:'序章完成'};
const conversations=new Set(['awakening','escort','pill','conversation']);
const titles={awakening:'序章 · 郊野重生',escort:'旧路接应',pill:'燃脉丸',sanctuary:'守望者降临',conversation:'去接头点'};
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
    this._sceneQueue=[];this._sceneCue=null;this._sceneSpoken=new Set();
    this._clock=0;this._prayerProgress=0;this._sanctuaryProgress=0;this._summoning=false;this._helpReady=false;this._dialogueTotal=0;
    this.navigation=new StoryNavigation(game,this);
    this.pursuit=new StoryPursuit(game,this,this.definition.pursuit);
  }
  get step(){return this.flow.step;}
  get active(){return this.initialized&&!this.completed&&!this.disposed;}
  get suppressChoices(){return this.active;}
  allowsSkill(id){return id!=='storm';}
  get dialogueBlocking(){return this.active&&this.dialogue.length>0;}
  get dialogueExclusive(){return false;}
  get objective(){
    if(['burst','fading'].includes(this.step)){
      if(this._helpReady)return this.step==='burst'?(this.temporary.remaining<=6?'药力即将消退 · 留在天使守护之内':'守望者已降临 · 在光环内迎击追兵'):'进入守望光环';
      if(this._summoning)return this.angel?'守望者正在降临':'掩护公主完成召唤';
    }
    if(this.step==='sanctuary'&&!this._inAura())return '返回光环 · 离开守护范围会中断引雷';
    return objectives[this.step]||'';
  }
  _awaitingAngel(){return false;}
  get objectivePoint() {
    if(['search','escape'].includes(this.step))return this.anchors?.meeting;
    if(this.step==='escort')return this.anchors?.pill;
    if(['burst','fading'].includes(this.step))return this.angel||this.anchors?.refuge;
    if(['sanctuary','judgment'].includes(this.step))return this.angel||this.anchors?.refuge;
    return null;
  }
  getDialogue(){
    const line=this.dialogue[0];if(!this.active||!line)return null;
    return {...line,name:speakerNames[line.speaker],index:this._dialogueTotal-this.dialogue.length+1,total:this._dialogueTotal,
      title:titles[this.step]||this.name,nextLabel:this.dialogue.length===1?continueLabels[this.step]||'继续':'继续',
      departure:this.step==='conversation'&&this.dialogue.length===1};
  }
  getSceneDialogue(){
    if(!this.active)return [];
    const line=this.getDialogue();
    if(line){const actor=line.speaker==='player'?this.game.player:this[line.speaker];return actor?[{id:line.id,speaker:line.speaker,text:'…',actor}]:[];}
    if(['fading','sanctuary'].includes(this.step)&&this.princess)return [{id:`${this.id}:medicine-ended`,speaker:'princess',text:this.definition.dialogue.sanctuary[0].text,actor:this.princess}];
    if(this._summoning&&!this._helpReady&&this.princess)return [{id:`${this.id}:summon`,speaker:'princess',text:this.definition.summonLine,actor:this.princess}];
    if(this._sceneCue&&this._sceneActorAlive(this._sceneCue.actor))return [this._sceneCue];
    return [];
  }
  _sceneActorAlive(actor){return actor===this.game.player||this.actors.includes(actor)||actor?.hp>0&&this.game.enemies.includes(actor);}
  _visibleSearcher(){const g=this.game,p=foot(g.player);return this._living().find(enemy=>g._inView(enemy,-60)&&!g.terrain.firstBlocker(enemy.x,foot(enemy).y,p.x,p.y,0,'sight'));}
  _sceneScript(stage,searcher){
    if(this._sceneSpoken.has(stage))return;
    this._sceneSpoken.add(stage);
    // An action event owns the queue; ordinary combat chatter never enters it.
    for(const [index,line]of (this.definition.dialogue[stage]||[]).entries()){
      const actor=line.speaker==='searcher'?searcher:line.speaker==='player'?this.game.player:this[line.speaker];
      if(actor)this._sceneQueue.push({...line,id:`${this.id}:scene:${stage}:${index}`,actor,shown:0});
    }
  }
  _updateSceneCue(dt){
    let cue=this._sceneCue;
    if(cue&&(!this._sceneActorAlive(cue.actor)||cue.shown>=Math.max(3,Math.min(6,cue.text.length*.12))))cue=this._sceneCue=null;
    while(!cue&&this._sceneQueue.length){const next=this._sceneQueue.shift();if(this._sceneActorAlive(next.actor))cue=this._sceneCue=next;}
    if(cue&&this.game._inView(cue.actor,-60))cue.shown+=dt;
  }
  advanceDialogue(skip=false){
    if(!this.dialogueBlocking)return false;
    // Skipping the conclusion reaches its final invitation. Departure still
    // requires a separate, deliberate activation of the final control.
    if(skip&&this.step==='conversation'&&this.dialogue.length===1)return false;
    const lines=skip?this.dialogue.splice(0,this.step==='conversation'?this.dialogue.length-1:this.dialogue.length):[this.dialogue.shift()];
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
    if(['burst','fading'].includes(this.step)&&this._summoning&&!this._helpReady){
      if(this.angel)return {label:'守望者降临',value:Math.max(0,this.game._clock-this.angel.arrival.startedAt),max:this.angel.arrival.duration,detail:'守住召唤地点'};
      const nearby=this.princess&&distance(foot(this.game.player),foot(this.princess))<=this.rules.prayerRadius;
      return {label:'公主召唤',value:this._prayerProgress,max:this.rules.prayerDuration,detail:nearby?'掩护公主，等待守望者回应':'返回公主身边，继续掩护召唤'};
    }
    if(this.step==='burst')return {label:'燃脉药效',value:this.temporary.remaining,max:this.rules.pillDuration,detail:`还剩 ${Math.ceil(this.temporary.remaining)} 秒 · ${this._helpReady?'留在守护范围':'沿引导带跟随公主'}`};
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
    const wake=area(keys.wakeArea),meeting=area(keys.meetingArea),refuge=area(keys.refugeArea);
    const entryPath=passage(keys.entryPassage),searchPath=passage(keys.searchPassage),escapePath=passage(keys.escapePassage);
    if(!wake||!meeting||!refuge||!entryPath?.length||!searchPath?.length||!escapePath?.length)throw new Error(`Story ${this.id} requires its configured walkable anchors`);
    this.paths={entry:entryPath,search:searchPath,escape:escapePath};
    // Story geography is independent of the exploration town spawn. Every
    // replay starts on the configured outskirts, with a legal whole-body foot.
    const origin=this._safePoint(wake,{radius:g.player.r,max:140});
    if(!origin)throw new Error(`Story ${this.id} has no safe starting point`);
    g.player.x=origin.x;g.player.y=origin.y-groundOffset(g.player,true);resetLocomotion(g.player);
    this.anchors={wake:{...origin},meeting:{...meeting},refuge:{...refuge},pill:{...escapePath[Math.floor(escapePath.length*.42)]}};
    this.anchors.refuge=this._safePoint(refuge,{radius:18,max:100})||refuge;
    this._sceneTerrain=g.terrain;this._sceneMapId=g.mapId;
    g.canonicalBuild??=g.build;
    // A chapter's restricted skill is absent from the real build as well as
    // its controls, so snapshots and archives cannot claim it was learned.
    for(const skill of Object.values(g.canonicalBuild.skills))if(!this.allowsSkill(skill.id)){skill.baseRank=0;skill.equipped=false;}
    g._refreshStats?.();g._refreshWeapons?.();
    this.initialized=true;this._createPrincess();this.flow.start();
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
    if(conversations.has(step)){this._sceneQueue=[];this._sceneCue=null;}
    if(step==='escape'){
      // Preserve a line already on screen for its minimum duration, but drop
      // obsolete, unread search comments after real discovery.
      this._sceneQueue=[];this._sceneScript('escape',this._visibleSearcher());
    }
    g._emit?.('storyStep',{storyId:this.id,step});
    if(step==='fading'){
      this.temporary.stop('expired');
      // A warning precedes this change; a short grace covers the exact loss of
      // the shield so the player can continue the indicated escape route.
      g.player.invuln=Math.max(g.player.invuln||0,1.2);
    }
    if(step==='sanctuary'){this._createAngel({instant:true});this._sanctuaryProgress=0;}
    if(step==='judgment'){
      this._judgmentStartedAt=this._clock;
      this._judgmentAt=this._clock+this.rules.judgmentWindup;
      this._judgmentPlan=createJudgmentPlan({width:g.viewWidth,height:g.viewHeight,duration:this.rules.judgmentDuration-this.rules.judgmentWindup,seed:916}).map(point=>({...point,at:point.at+this.rules.judgmentWindup}));
      this._judgmentVisualTime=-1;
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
  _createAngel({instant=false}={}) {
    if(this.angel)return this.angel;
    const point=this.anchors.refuge;
    this.angel={id:'story:angel',storyActor:true,type:'angel',kind:'angel',name:'守望天使',x:point.x,y:point.y,r:15,hp:1,maxHp:1,flying:true,guardRadius:this.rules.guardRadius,auraRadius:this.rules.guardRadius,healing:false,castFace:0,seed:916};
    this.actors.push(this.angel);
    if(instant)this._helpReady=true;
    else beginUnitArrival(this.game,this.angel,{duration:this.rules.arrivalDuration,radius:70});
    return this.angel;
  }
  updateActors(dt){
    if(!this.active||this.dialogueBlocking||!Number.isFinite(dt)||dt<=0)return;
    if(this.princess)this.princess.castFace=Math.max(0,(this.princess.castFace||0)-dt);
    this.navigation.updatePrincess(dt);
  }
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
  _inAura(){const p=foot(this.game.player);return !!this.angel&&this._helpReady&&distance(p,this.angel)<=this.rules.guardRadius&&!this.game.terrain.firstBlocker(this.angel.x,this.angel.y,p.x,p.y,0,'sight');}
  get guardReduction(){return this.active&&this._inAura()?this.rules.guardReduction:0;}
  update(dt) {
    if(!this.active||this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    if(this.game.terrain!==this._sceneTerrain||this.game.mapId!==this._sceneMapId){this.cleanup('sceneChange');return;}
    if(this.dialogueBlocking)return;
    const g=this.game;this._clock+=dt;this.flow.update(dt);
    const wasBoosted=this.temporary.active;this.temporary.update(dt);
    if(wasBoosted&&!this.temporary.active&&this.step==='burst')this.flow.go('fading');
    this.pursuit.update(dt);
    if(this.step==='search'){const searcher=this._visibleSearcher();if(searcher)this._sceneScript('search',searcher);}
    this._updateSceneCue(dt);
    if(['burst','fading'].includes(this.step)&&!this._helpReady&&this.princess){
      if(!this._summoning&&this._near(this.anchors.refuge,180)&&distance(foot(this.princess),this.anchors.refuge)<100)this._summoning=true;
      const nearby=this._summoning&&distance(foot(g.player),foot(this.princess))<=this.rules.prayerRadius;
      if(nearby&&!this.angel){
        this._prayerProgress=Math.min(this.rules.prayerDuration,this._prayerProgress+dt);this.princess.castFace=.25;
        if(this._clock>=(this._nextPrayerPulse||0)){g._effect?.(this.princess.x,foot(this.princess).y,'ring',.9,38,'#d4e9c5');this._nextPrayerPulse=this._clock+1.2;}
      }
      if(this._prayerProgress>=this.rules.prayerDuration&&!this.angel)this._createAngel();
      if(this.angel&&unitArrivalComplete(this.angel,g._clock)){this._helpReady=true;g._emit?.('storyAidReady',{storyId:this.id});}
    }
    if(this.angel&&this._helpReady)updateAngelGuardian(g,this.angel,dt,{rules:{guardRadius:this.rules.guardRadius,healingPerSecond:this.rules.guardHealing},attack:this.step!=='judgment'});
    switch(this.step) {
      case 'awakening':
        if(this._linesFinished('awakening'))this.flow.next();
        break;
      case 'search':
        if(this._found())this.flow.next();
        // Successfully avoiding the patrol reaches the same rendezvous. Never
        // invent an unseen discovery just because a waypoint was crossed.
        else if(this._near(this.anchors.meeting))this.flow.go('escort');
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
          if(!this._judgmentApplied){this._judgment();this._judgmentApplied=true;}
          this._showJudgmentStrikes();
        }
        if(this._clock-this._judgmentStartedAt+1e-8>=this.rules.judgmentDuration){
          for(const enemy of this._living())g.combat.storyJudgment(enemy,{x:this.angel.x,y:this.angel.y,groundY:this.angel.y});
          this.flow.next();
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
    }
    // Visual coverage belongs to the camera, not the size or clustering of an
    // enemy army. Sparse timed strikes never limit the actual defeat result.
    const elapsed=this._clock-this._judgmentStartedAt;
    const points=judgmentBatch(this._judgmentPlan,this._judgmentVisualTime,elapsed,{x:g.player.x,y:g.player.y,width:g.viewWidth,height:g.viewHeight});
    for(const point of points)g._effect?.(point.x,point.y,'angelStrike',.18,ANGEL_RULES.strikeRadius,'#f4edc0',undefined,{sourceX:this.angel.x,sourceY:this.angel.y,angelId:this.angel.id,seed:point.seed,storyJudgment:true});
    this._judgmentVisualTime=elapsed;
  }
  _complete() {
    if(this.completed)return;
    const g=this.game;this.temporary.stop('complete');this.completed=true;this.completionTime=g.runTime??this._clock;
    this.dialogue=[];this._sceneQueue=[];this._sceneCue=null;this._clearHostileAttacks();this.pursuit.clear();clearSceneActors(g);
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
    this.temporary.stop(reason);this.disposed=true;this.dialogue=[];this._sceneQueue=[];this._sceneCue=null;this.actors=[];this._clearHostileAttacks();
    this.pursuit.clear(reason);clearSceneActors(this.game);this.game.sceneContent.dispose();
    return true;
  }
}
