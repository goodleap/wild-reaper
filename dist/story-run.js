import { getConfigSection } from './content-config.js';
import { StoryFlow } from './story-flow.js';
import { TemporaryBuild } from './temporary-build.js';
import { groundOffset } from './terrain.js';
import { getHero } from './heroes.js';
import { resolveCharacterStats } from './combat-stats.js';
import { terrainNavigation } from './terrain-navigation.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { ANGEL_RULES } from './site-definitions.js';

export const STORY_DEFINITIONS=getConfigSection('story').definitions;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=entity=>({x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+groundOffset(entity,!!entity.heroId)});
const objectives={awakening:'看清四周，寻找离开营地的路',search:'搜寻队正在接近 · 留意脚步与退路',escape:'被发现了！沿东侧道路前往林间谷地',escort:'与公主沿东侧道路突围，前往会合处',pill:'靠近公主，点击左下「服药」突破包围',burst:'燃脉激发 · 拦住追兵，为求援争取时间',fading:'药力消退！向东前往采石盆地求援',sanctuary:'守住天使光环 · 等待守望者完成引雷',judgment:'天使正在引雷 · 退回守护之内',conversation:'危机已解 · 靠近公主交谈，正式启航',complete:'沿林海追查押运队，寻找祭场线索'};

// This chapter owns its temporary cast and pursuers, not world geometry or the
// ordinary combat loop. No internal step is persisted: a new run starts clean.
export class StoryRun {
  constructor(game,{id='prologue'}={}) {
    this.game=game;this.definition=STORY_DEFINITIONS.find(entry=>entry.id===id);
    if(!this.definition)throw new RangeError(`Unknown story: ${id}`);
    this.id=id;this.name=this.definition.name;this.rules=this.definition.rules;
    this.actors=[];this.dialogue=[];this.completed=false;this.disposed=false;this.initialized=false;this.pillUsed=false;
    this.temporary=new TemporaryBuild(game);this.flow=new StoryFlow(this.definition.steps,step=>this._enter(step));
    this._lineId=0;this._lineState=new Map();this._kills=0;this._storyDamage=false;this._wave=0;this._spawnSequence=0;
    this._clock=0;this._dialogueWait=0;this._lastHeroHp=game.player.hp;
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
    this._worldEnemies=g.enemies;g.enemies=[];g._grid?.clear();
    this._worldAngels=g.settlements?.sites.filter(site=>site.type==='angel')||[];
    if(g.settlements)g.settlements.sites=g.settlements.sites.filter(site=>site.type!=='angel');
    g.canonicalBuild??=g.build;this.initialized=true;this.flow.start();
    g._emit?.('storyStarted',{storyId:this.id,name:this.name});return true;
  }
  _queue(step) {
    this._recap??=new Map();
    for(const line of this.definition.dialogue[step]||[]) {
      const id=`${this.id}:${++this._lineId}`;
      this.dialogue.push({...line,id,duration:3.6});this._lineState.set(id,{step,presented:false,finished:false});
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
    const situational=new Set(['search','escape','burst','fading']);
    this.dialogue=this.dialogue.filter(line=>!situational.has(this._lineState.get(line.id)?.step));
    this._queue(step);this._dialogueWait=0;
    if(step==='pill') {
      // Deliver the actionable explanation as soon as the current protected
      // line and opening memory finish; optional introductions may follow.
      const order=line=>{const state=this._lineState.get(line.id);return state?.presented?0:state?.step==='awakening'?1:state?.step==='pill'?2:3;};
      this.dialogue.sort((a,b)=>order(a)-order(b));
    }
    g._emit?.('storyStep',{storyId:this.id,step});
    if(step==='search')this._spawnSearch();
    if(step==='escape') {
      for(const enemy of this._living()) {enemy.guardActive=true;enemy.storySearching=false;enemy.cast=null;enemy._navTimer=0;}
      this._spawnGroup('pursuit',3,this.paths.search[Math.floor(this.paths.search.length*.65)],['brute','slime']);
    }
    if(step==='escort') {
      this._createPrincess();this._escortKills=this._kills;
      this._spawnGroup('blockade',4,this.anchors.pill,['shieldguard','slime','brute']);
    }
    if(step==='pill') {
      this._spawnGroup('encirclement',4,this.anchors.pill,['slime','brute']);
      this._nextPursuit=this._clock+7;
    }
    if(step==='burst') {
      this._nextBurst=this._clock+1;
      this._spawnGroup('burst',10,foot(g.player),['slime','shieldguard','brute']);
    }
    if(step==='fading') {
      // Restoration always precedes the next encounter. No delayed boosted
      // sword, bleed, shock, shield or owned super-skill survives this edge.
      this.temporary.stop('expired');this._nextPursuit=this._clock+5;
      this._spawnGroup('last-pursuit',5,foot(g.player),['brute','slime']);
    }
    if(step==='sanctuary') {
      this._createAngel();this._guardWave=1;this._guardWaveStarted=this._clock;
      this._spawnGroup('sanctuary:1',8,this.anchors.refuge,['slime','brute','shieldguard']);
    }
    if(step==='judgment')this._judgmentArmed=false;
    if(step==='conversation') {
      this._clearHostileAttacks();this._conversationReady=false;
    }
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
  _spawnGroup(wave,count,around,types=['slime'],{silent=false}={}) {
    const g=this.game,spawned=[];
    for(let i=0;i<count&&this._living().length<this.rules.maxEnemies;i++) {
      const point=this._safePoint(around,{radius:24,min:wave==='search'?0:180,max:420,ordinal:++this._spawnSequence,avoidPlayer:true});
      if(!point)break;
      const enemy=g._spawnEnemy(types[i%types.length],1);if(!enemy)continue;
      enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);enemy.storyId=this.id;enemy.storyEnemy=true;enemy.storyWave=wave;
      // Script pursuers never own doors, regional rewards or other objectives.
      enemy.guardActive=wave!=='search';enemy.storySearching=wave==='search';enemy.guardianId=`story:${this.id}`;
      enemy.maxHp=enemy.hp=Math.min(this.rules.judgmentDamage-1,enemy.maxHp);
      enemy._storyInitialHp=enemy.hp;enemy._navTimer=0;spawned.push(enemy);
      if(!silent)g._effect?.(enemy.x,point.y,'rescueWarning',.7,enemy.r+8,'#c8a58b',undefined,{seed:enemy.id});
    }
    return spawned;
  }
  _spawnSearch() {
    const path=this.paths.search,index=Math.min(path.length-1,Math.max(2,Math.floor(path.length*.38)));
    this._searchers=this._spawnGroup('search',3,path[index],['shieldguard','slime','brute']);
    for(const [order,enemy] of this._searchers.entries()) {
      enemy._storySearchRoute=[...path.slice(0,index+1).reverse(),this.anchors.wake];enemy._storyWaypoint=0;enemy._storySearchOrder=order;
    }
    // A completely occupied approach cannot trap the chapter before discovery.
    if(!this._searchers.length) {
      const local=this._spawnGroup('search',1,foot(this.game.player),['slime']);this._searchers=local;
      for(const enemy of local){enemy._storySearchRoute=[this.anchors.wake];enemy._storyWaypoint=0;}
    }
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
  _followPrincess(dt) {
    const actor=this.princess;if(!actor)return;
    const g=this.game,p=foot(g.player),from=foot(actor),d=distance(from,p);
    const oldX=actor.x,oldY=actor.y;
    if(d>92) {
      const navigation=terrainNavigation(g.terrain);
      const direction={x:p.x-from.x,y:p.y-from.y},target={x:p.x-direction.x/(d||1)*70,y:p.y-direction.y/(d||1)*70};
      const waypoint=navigation.waypoint(actor,from,target,actor.r+3,'ground',this._clock,g._clock)||target;
      const dx=waypoint.x-from.x,dy=waypoint.y-from.y,n=Math.hypot(dx,dy)||1;
      g._moveEntity(actor,dx/n*Math.min(n,actor.speed*dt),dy/n*Math.min(n,actor.speed*dt));
    }
    actor.groundY=actor.y+actor.groundOffset;updateLocomotion(actor,oldX,oldY,dt);
    if(actor.moving)actor.facing=actor.moveFacing=Math.atan2(actor.y-oldY,actor.x-oldX);
  }
  beforeEnemy(enemy,dt) {
    if(!this.active||enemy.storyId!==this.id)return false;
    if(this.step!=='search'&&this.step!=='awakening')return false;
    if(!enemy.storySearching)return false;
    enemy.guardActive=false;enemy.cast=null;enemy.charge=null;enemy._chargeSegment=null;
    const route=enemy._storySearchRoute||[this.anchors.wake],index=Math.min(route.length-1,enemy._storyWaypoint||0),target=route[index];
    if(distance(foot(enemy),target)<35&&index<route.length-1)enemy._storyWaypoint=index+1;
    this.game._moveEnemy(enemy,dt,route[Math.min(route.length-1,enemy._storyWaypoint||0)]);
    return true;
  }
  onEnemyDefeated(enemy) {
    if(!this.active||enemy.storyId!==this.id)return;
    this._kills++;
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
    const g=this.game;this._clock+=dt;this.flow.update(dt);this._followPrincess(dt);
    this._storyDamage||=g.player.hp<this._lastHeroHp;this._lastHeroHp=g.player.hp;
    const wasBoosted=this.temporary.active;this.temporary.update(dt);
    if(wasBoosted&&!this.temporary.active&&this.step==='burst')this.flow.go('fading');
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
          for(const enemy of this._spawnGroup('search',2,this.anchors.meeting,['slime','brute'])){enemy._storySearchRoute=[foot(g.player)];enemy._storyWaypoint=0;}
        }
        break;
      case 'escape':if(this._near(this.anchors.meeting))this.flow.next();break;
      case 'escort':
        if(this._near(this.anchors.pill)&&distance(foot(this.princess),foot(g.player))<240&&(this._kills>this._escortKills||this._storyDamage||!this._living().length||this._living().some(enemy=>distance(foot(enemy),foot(g.player))<240)))this.flow.next();
        break;
      case 'pill':
        if(this._clock>=this._nextPursuit){this._spawnGroup('pressure',2,foot(g.player),['slime']);this._nextPursuit=this._clock+9;}
        break;
      case 'burst':
        if(this._clock>=this._nextBurst){this._spawnGroup('burst',6,foot(g.player),['slime','brute','shieldguard']);this._nextBurst=this._clock+2.8;}
        break;
      case 'fading':
        if(this._near(this.anchors.refuge,200)&&distance(foot(this.princess),foot(g.player))<350)this.flow.next();
        else if(this._clock>=this._nextPursuit){this._spawnGroup('last-pursuit',3,foot(g.player),['slime','brute']);this._nextPursuit=this._clock+8;}
        break;
      case 'sanctuary': {
        const wave=`sanctuary:${this._guardWave}`,remaining=this._living().filter(enemy=>enemy.storyWave===wave).length;
        const elapsed=this._clock-this._guardWaveStarted;
        if(elapsed>=this.rules.sanctuaryWaveSeconds||elapsed>=3&&!remaining) {
          if(this._guardWave>=2)this.flow.next();
          else {this._guardWave++;this._guardWaveStarted=this._clock;this._spawnGroup(`sanctuary:${this._guardWave}`,10,this.anchors.refuge,['shieldguard','brute','slime']);}
        }
        break;
      }
      case 'judgment':
        if(!this._judgmentArmed&&this._linesFinished('judgment')){this._judgmentArmed=true;this._judgmentAt=this._clock+1;this.angel.castFace=1.4;g._effect?.(this.angel.x,this.angel.y,'ring',1,this.rules.guardRadius,'#f4edc0');}
        if(this._judgmentArmed&&this._clock>=this._judgmentAt) {
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
    const explained=[...this._lineState.values()].find(line=>line.step==='pill')?.presented;
    if(this.step==='pill'&&!this.pillUsed&&explained&&distance(foot(this.princess),foot(this.game.player))<145)return {id:'story:take-pill',label:'服药',detail:'燃脉丸 · 临时激发潜力 30 秒',enabled:true};
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
    for(const enemy of g.enemies){enemy.cast=null;enemy.charge=null;enemy.slam=null;enemy._chargeSegment=null;enemy.specialAttack=null;enemy.specialist=null;}
  }
  _judgment() {
    const g=this.game;this._clearHostileAttacks();
    // A very strong player may have cleared both defensive waves already.
    // The last pursuers arrive into the rescue strike, never another battle.
    const remaining=this._living().length;
    if(remaining<6)this._spawnGroup('final-pursuit',6-remaining,this.anchors.refuge,['brute','shieldguard','slime'],{silent:true});
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
    // Several old landing points fill the existing scene. Every individual
    // bolt retains the ordinary angel's original .18-second animation.
    for(const point of this._judgmentPoints)g._effect?.(point.x,point.y,'angelStrike',.18,ANGEL_RULES.strikeRadius,'#f4edc0',undefined,{sourceX:this.angel.x,sourceY:this.angel.y,angelId:this.angel.id,storyJudgment:true});
  }
  _restoreWorld() {
    const g=this.game,p=foot(g.player);
    // The rescue cleared this immediate scene. Distant original territories
    // retain their original state; no rewards or gate events are fabricated.
    for(const enemy of this._worldEnemies||[])if(distance(foot(enemy),p)<450&&!enemy.worldBoss&&!enemy.portalId)enemy.hp=0;
    g.enemies=(this._worldEnemies||[]).filter(enemy=>enemy.hp>0);this._worldEnemies=null;
    if(g.settlements)for(const angel of this._worldAngels||[])if(!g.settlements.sites.some(site=>site.id===angel.id))g.settlements.sites.push(angel);
    this._worldAngels=[];g.settlements?.ensureAngels?.();
    for(const group of g.territories?.groups||[])if(group.members.every(enemy=>enemy.hp<=0))group.cleared=true;
    // Delay expired optional-event timers until after control is returned.
    if(g.companions)g.companions.nextAt=Math.max(g.companions.nextAt||0,g.time+20);
    g.regionGrace=Math.max(g.regionGrace||0,4);g._rebuildGrid?.();
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
    this.temporary.stop(reason);this.disposed=true;this.dialogue=[];this.actors=[];
    if(this.initialized&&!this.completed) {
      if(this.game.terrain===this._sceneTerrain&&this.game.mapId===this._sceneMapId)this._restoreWorld();
      else {this._worldEnemies=null;this._worldAngels=[];}
    }
    return true;
  }
}
