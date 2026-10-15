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
const objectives={awakening:'看清四周，寻找离开营地的路',search:'搜寻队正在接近 · 留意脚步与退路',escape:'追兵不断赶来 · 沿路逃往林间谷地',escort:'跟随公主突围 · 不要与追兵纠缠',pill:'靠近公主，点击左下「服药」突破包围',burst:'燃脉激发 · 拦住追兵，为求援争取时间',fading:'药力消退！前往采石盆地求援',sanctuary:'守住天使光环 · 等待守望者完成引雷',judgment:'天使正在引雷 · 退回守护之内',conversation:'危机已解 · 靠近公主交谈，正式启航',complete:'沿林海追查押运队，寻找祭场线索'};

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
    this._clock=0;this._dialogueWait=0;
    this.navigation=new StoryNavigation(game,this);
    this.pursuit=new StoryPursuit(game,this,this.definition.pursuit);
  }
  get step(){return this.flow.step;}
  get active(){return this.initialized&&!this.completed&&!this.disposed;}
  get suppressChoices(){return this.active;}
  get dialogueExclusive(){return this.active&&this.dialogue.length>0;}
  get objective(){return this.step==='conversation'&&this._awaitingAngel()?'返回守望天使身边继续交谈':objectives[this.step]||'';}
  _awaitingAngel(){return this.dialogue.some(line=>line.speaker==='angel');}
  get objectivePoint() {
    if(['escape'].includes(this.step))return this.anchors?.meeting;
    if(this.step==='escort')return this.anchors?.pill;
    if(['fading','sanctuary','judgment'].includes(this.step))return this.anchors?.refuge;
    if(this.step==='conversation'&&this._awaitingAngel())return this.angel;
    if(['pill','conversation'].includes(this.step))return this.princess?foot(this.princess):null;
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
    g.canonicalBuild??=g.build;this.initialized=true;this.flow.start();
    g._emit?.('storyStarted',{storyId:this.id,name:this.name});return true;
  }
  _queue(step) {
    this._recap??=new Map();
    for(const line of this.definition.dialogue[step]||[]) {
      const id=`${this.id}:${++this._lineId}`;
      const scope=this.definition.dialogueScopes?.[step]||'stage';
      this.dialogue.push({...line,id,duration:3.6});this._lineState.set(id,{step,scope,presented:false,finished:false});
      this._recap.set(id,`${line.speaker==='player'?'王子':line.speaker==='princess'?'公主':'天使'}：${line.text}`);
    }
  }
  onDialoguePresented(id) {const line=this._lineState.get(id);if(line)line.presented=true;}
  onDialogueFinished(id) {
    const line=this._lineState.get(id);if(!line)return false;
    line.finished=true;this.dialogue=this.dialogue.filter(item=>item.id!==id);return true;
  }
  _linesFinished(step) {return [...this._lineState.values()].filter(line=>line.step===step).every(line=>line.finished);}
  _enter(step) {
    const g=this.game;
    // Reactions to a passed situation must not hold up the next instruction.
    // SceneDialogue preserves the minimum for a line still being read, then
    // cancels this removed ID without pretending it was fully presented.
    this.dialogue=this.dialogue.filter(line=>{const state=this._lineState.get(line.id);return state?.scope==='chapter'||state?.step===step;});
    this._queue(step);this._dialogueWait=0;
    if(step==='pill') {
      // Deliver the actionable explanation as soon as the current protected
      // line and opening memory finish; optional introductions may follow.
      const order=line=>{const state=this._lineState.get(line.id);return state?.presented?0:state?.step==='awakening'?1:state?.step==='pill'?2:3;};
      this.dialogue.sort((a,b)=>order(a)-order(b));
    }
    g._emit?.('storyStep',{storyId:this.id,step});
    if(step==='escort')this._createPrincess();
    if(step==='pill')this._medicineReceivedAt??=this._clock;
    if(step==='fading') {
      // Restoration always precedes the next encounter. No delayed boosted
      // sword, bleed, shock, shield or owned super-skill survives this edge.
      this.temporary.stop('expired');
    }
    if(step==='sanctuary') {
      this._createAngel();
    }
    if(step==='judgment') {
      this._judgmentAt=this._clock+this.rules.judgmentWindup;
      if(this.angel)this.angel.castFace=this.rules.judgmentWindup+.4;
      if(this.angel)g._effect?.(this.angel.x,this.angel.y,'ring',this.rules.judgmentWindup,this.rules.guardRadius,'#f4edc0');
    }
    if(step==='conversation') {
      this._clearHostileAttacks();this._conversationReady=false;
    }
    this.pursuit?.enter(step);
    if(step==='complete')this._complete();
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
  updateActors(dt){if(this.active)this.navigation.updatePrincess(dt);}
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
    const g=this.game;this._clock+=dt;this.flow.update(dt);
    const wasBoosted=this.temporary.active;this.temporary.update(dt);
    if(wasBoosted&&!this.temporary.active&&this.step==='burst')this.flow.go('fading');
    this.pursuit.update(dt);
    if(this.angel) {this.angel.castFace=Math.max(0,this.angel.castFace-dt);this.angel.healing=this._inAura();}
    if(this.guardReduction>0)g.player.hp=Math.min(g.player.maxHp,g.player.hp+g.player.maxHp*this.rules.guardHealing*dt);
    switch(this.step) {
      case 'awakening':
        if(distance(foot(g.player),this.anchors.wake)>45||this._linesFinished('awakening'))this.flow.next();
        break;
      case 'search':
        if(this._found())this.flow.next();
        else if(this._near(this.anchors.meeting,230)&&!this._interceptionSpawned) {
          // Reaching the far end unseen creates an actual visible patrol, not
          // a countdown that declares the player discovered through a wall.
          this._interceptionSpawned=true;
          this.pursuit.spawnSearch(this.anchors.meeting);
        }
        break;
      case 'escape':if(this._near(this.anchors.meeting))this.flow.next();break;
      case 'escort':
        if(this._near(this.anchors.pill)&&distance(foot(this.princess),foot(g.player))<240)this.flow.next();
        break;
      case 'fading':
        if(this._near(this.anchors.refuge,200)&&distance(foot(this.princess),foot(g.player))<350)this.flow.next();
        break;
      case 'sanctuary':
        if(this.flow.elapsed>=this.rules.sanctuaryWaveSeconds*2)this.flow.next();
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
      case 'conversation':this._conversationReady=this._linesFinished('conversation');break;
    }
  }
  getAction() {
    if(!this.active||this.game.status!=='playing')return null;
    // Combat actions carry their explanation in the persistent action control.
    // A crowded or occluded speech bubble must never lock a time-critical aid.
    if(this.step==='pill'&&!this.pillUsed&&distance(foot(this.princess),foot(this.game.player))<145)return {id:'story:take-pill',label:'服药',detail:'燃脉丸 · 临时激发潜力 30 秒',enabled:true};
    if(this.step==='conversation'&&this._conversationReady&&distance(foot(this.princess),foot(this.game.player))<145)return {id:'story:finish',label:'正式启航',detail:'序章完成 · 沿路追查押运队',enabled:true};
    return null;
  }
  useAction(id) {
    const action=this.getAction();if(!action||action.id!==id)return false;
    if(id==='story:take-pill') {
      if(!this.temporary.start({duration:this.rules.pillDuration,moveSpeedBonus:this.rules.moveSpeedBonus,damageReductionBonus:this.rules.damageReductionBonus,damageReductionCap:this.rules.damageReductionCap}))return false;
      this.pillUsed=true;this.flow.go('burst');return true;
    }
    if(id==='story:finish')return this.flow.go('complete');
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
  _restoreWorld() {
    this.pursuit.clear('complete');
    this.game.sceneContent.restoreWorld();
  }
  _complete() {
    if(this.completed)return;
    const g=this.game;this.temporary.stop('complete');this.completed=true;this.completionTime=g.runTime??this._clock;
    this.dialogue=[];this._clearHostileAttacks();this._restoreWorld();
    // Script kills grant real XP, but no crystal choices. Existing unrelated
    // resources remain intact when the chapter returns control to exploration.
    g._choices=null;
    this.actors=[];g._refreshStats?.();g._refreshWeapons?.();
    g._emit?.('storyCompleted',{storyId:this.id,name:this.name,time:this.completionTime});
  }
  cleanup(reason='exit') {
    if(this.disposed)return false;
    this.temporary.stop(reason);this.disposed=true;this.dialogue=[];this.actors=[];this._clearHostileAttacks();
    this.pursuit.clear(reason);this.game.sceneContent.dispose();
    return true;
  }
}
