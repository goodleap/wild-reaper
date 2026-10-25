import { getStoryChapter } from './story-chapters.js';
import { StoryFlow } from './story-flow.js';
import { NavigationRoute } from './navigation-route.js';
import { terrainNavigation } from './terrain-navigation.js';
import { updateFollowMovement } from './follow-movement.js';
import { groundOffset } from './terrain.js';
import { getHero } from './heroes.js';
import { resetLocomotion } from './locomotion.js';
import { clearSceneActors } from './scene-actors.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=a=>({x:a.x,y:a.y+groundOffset(a,!!a.heroId)});
const names={player:'王子',princess:'公主',elder:'老登',villager:'村民',worker:'装粮人',officer:'押运官',document:'征粮告示'};


// Attempt-local chapter state. The only durable result is the completion event.
export class StoryChapterRun {
  constructor(game,{id='false-orders'}={}){
    this.game=game;this.definition=getStoryChapter(id);
    if(!this.definition||id!=='false-orders')throw new RangeError(`Unknown chapter: ${id}`);
    this.id=id;this.name=this.definition.name;this.rules=this.definition.rules;
    this.initialized=false;this.completed=false;this.disposed=false;this.actors=[];this.props=[];this.dialogue=[];
    this.evidence=new Set();this.rescued=false;this.signalDisabled=false;this.officerEscaped=false;
    this._clock=0;this._line=0;this._recap=[];this._bubbles=[];this._bubbleQueue=[];this._waves=0;this._supplyUsed=new Set();
    this.flow=new StoryFlow(this.definition.steps,step=>this._enter(step));this.route=new NavigationRoute(game.terrain);
  }
  get step(){return this.flow.step;}
  get active(){return this.initialized&&!this.completed&&!this.disposed;}
  get suppressChoices(){return this.active;}
  get dialogueBlocking(){return this.active&&this.dialogue.length>0;}
  get dialogueExclusive(){return false;}
  get guardReduction(){return 0;}
  allowsSkill(id){return id!=='storm';}
  getBuff(){return null;}
  get objective(){
    return {meeting:'在渡口与老登会合',notice:'沿旧路前往猎场 · 查看征粮告示',witness:'向交粮村民打听登记棚',scout:'侦察北侧征粮营地',infiltrate:this.signalDisabled?'传令架已拆除 · 从棚后取证':'可先拆传令架，或直接进入登记棚',rescue:this._rescueObjective(),withdraw:'护送装粮人沿南侧旧路撤离',debrief:'在安全处核对原令与运输底页',northroad:'沿北路查看押运官去向',departure:'确认前往粮道',complete:'第一章完成'}[this.step]||'';
  }
  _rescueObjective(){
    if(!this.evidence.has('records'))return '击退守军 · 取出桌上的征粮原令';
    if(!this.evidence.has('ledger'))return '取出箱中的运输底页';
    if(!this.worker?.following)return '清开扣押处 · 解救装粮人';
    return '带着证据和装粮人撤到南侧旧路';
  }
  get objectivePoint(){
    const a=this.anchors;if(!a)return null;
    if(this.step==='meeting')return foot(this.elder);
    if(this.step==='notice')return a.notice;
    if(this.step==='witness')return foot(this.villager);
    if(this.step==='scout')return a.scout;
    if(this.step==='infiltrate')return a.records;
    if(this.step==='rescue')return !this.evidence.has('records')?a.records:!this.evidence.has('ledger')?a.ledger:!this.worker.following?foot(this.worker):a.rally;
    if(['withdraw','debrief'].includes(this.step))return a.rally;
    if(['northroad','departure'].includes(this.step))return a.exit;
    return null;
  }
  getGuide(){
    const objective=this.objectivePoint;if(!objective||!this.active)return null;
    const target=this._approach(objective);
    const route=this.route.update(foot(this.game.player),target,{radius:this.game.player.r+4,bodyRadius:this.game.player.r,time:this._clock});
    return {...route,target,label:this.objective,shortLabel:'',kind:'travel',phase:this.step,arrivalRadius:this.rules.arrivalRadius};
  }
  getObjectiveTarget(){const target=this.objectivePoint;return target?{...target,label:this.objective,color:'#eed898'}:null;}
  getProgress(){
    if(!this.active||this.dialogueBlocking||!['rescue','withdraw'].includes(this.step))return null;
    return {label:'撤离准备',value:this.evidence.size+(this.rescued?1:0),max:3,detail:`原令 ${this.evidence.has('records')?'✓':'—'} · 运输底页 ${this.evidence.has('ledger')?'✓':'—'} · 人员 ${this.rescued?'已撤出':this.worker?.following?'护送中':'待解救'}`};
  }
  getRecap(){return this._recap.slice(-8).join('\n');}
  getProps(){return this.active?this.props.filter(prop=>!prop.hidden):[];}
  getDialogue(){
    const line=this.dialogue[0];if(!this.active||!line)return null;
    return {...line,name:names[line.speaker],title:this.name,index:this._total-this.dialogue.length+1,total:this._total,
      nextLabel:this.step==='departure'&&this.dialogue.length===1?'前往粮道':'继续',departure:this.step==='departure'&&this.dialogue.length===1};
  }
  getSceneDialogue(){
    if(!this.active)return [];
    const line=this.getDialogue();
    if(line){const actor=line.speaker==='player'?this.game.player:this[line.speaker];return actor?[{id:line.id,speaker:line.speaker,text:'…',actor}]:[];}
    return this._bubbles.filter(bubble=>bubble.until>this._clock&&bubble.actor&&!bubble.actor.hidden);
  }
  _sayLine(key,duration=5){
    const {speaker,text}=this.definition.sceneLines[key];
    const line={id:`${this.id}:bubble:${++this._line}`,speaker,text,actor:speaker==='player'?this.game.player:this[speaker],duration};
    if(this._bubbles.some(b=>b.speaker===speaker&&b.until>this._clock)){this._bubbleQueue.push(line);return;}
    this._bubbles.push({...line,until:this._clock+duration});
  }
  _updateBubbles(){
    this._bubbles=this._bubbles.filter(b=>b.until>this._clock);
    for(let i=0;i<this._bubbleQueue.length;){
      const line=this._bubbleQueue[i];
      if(this._bubbles.some(b=>b.speaker===line.speaker)){i++;continue;}
      this._bubbleQueue.splice(i,1);this._bubbles.push({...line,until:this._clock+line.duration});
    }
  }
  _dialogue(key){this.dialogue=(this.definition.dialogue[key]||[]).map(({speaker,text})=>({id:`${this.id}:line:${++this._line}`,speaker,text}));this._total=this.dialogue.length;}
  advanceDialogue(skip=false){
    if(!this.dialogueBlocking)return false;
    if(skip&&this.step==='departure'&&this.dialogue.length===1)return false;
    const count=skip?(this.step==='departure'?this.dialogue.length-1:this.dialogue.length):1;
    for(const line of this.dialogue.splice(0,count))if(!skip)this._recap.push(`${names[line.speaker]}：${line.text}`);
    if(!this.dialogue.length){
      this.game.player.invuln=Math.max(this.game.player.invuln||0,1);
      if(this.step==='meeting'){this.elder.following=true;this.flow.go('notice');}
      else if(this.step==='notice')this.flow.go('witness');
      else if(this.step==='witness')this.flow.go('scout');
      else if(this.step==='scout')this.flow.go('infiltrate');
      else if(this.step==='debrief')this.flow.go('northroad');
      else if(this.step==='departure')this._beginDeparture();
    }
    return true;
  }
  initialize(){
    if(this.initialized)return false;
    const g=this.game,layout=g.terrain.island?.layout,area=id=>layout?.areas?.find(a=>a.id===id)?.center,keys=this.definition.anchors;
    const contact=area(keys.contactArea),levy=area(keys.levyArea),camp=area(keys.campArea),exit=area(keys.exitArea);
    if(!contact||!levy||!camp||!exit)throw new Error('Chapter terrain anchors unavailable');
    const point=(center,dx=0,dy=0,r=20)=>this._safePoint({x:center.x+dx,y:center.y+dy},r);
    const northRoad=layout.passages?.find(p=>p.id===`${keys.campArea}-${keys.exitArea}`)?.waypoints;
    if(!northRoad?.length)throw new Error('Chapter reinforcement approach unavailable');
    this.anchors={contact:point(contact),notice:point(levy,-70,90),scout:point(camp,90,300),records:point(camp,-60,-30),ledger:point(camp,120,-70),signal:point(camp,-260,60),captives:point(camp,60,140),rally:point(levy,80,-120),exit:point(exit),reinforcement:point(northRoad[Math.floor(northRoad.length*.65)])};
    this._sceneTerrain=g.terrain;this._sceneMapId=g.mapId;
    g.player.x=this.anchors.contact.x;g.player.y=this.anchors.contact.y-groundOffset(g.player,true);resetLocomotion(g.player);
    this.princess=this._actor('princess','princess',point(contact,-65,25));this.princess.following=true;
    this.elder=this._actor('elder','elder',point(contact,45,-90));
    this.villager=this._actor('villager','traveler',point(levy,70,70),{isTownNpc:true,townKind:'merchant'});this.villager.site=this.villager;
    this.worker=this._actor('worker','traveler',this.anchors.captives,{isTownNpc:true,townKind:'merchant'});this.worker.site=this.worker;
    this.worker2=this._actor('worker2','traveler',point(this.anchors.captives,45,25),{name:'装粮人',isTownNpc:true,townKind:'merchant'});this.worker2.site=this.worker2;this.workers=[this.worker,this.worker2];
    this.officer=this._actor('officer','traveler',point(camp,210,-130),{enemyArtId:'royalguard'});
    for(const [id,kind,label] of [['notice','notice','征粮告示'],['records','records','征粮原令'],['ledger','ledger','运输底页'],['signal','signal','传令架']])this._prop(id,kind,this.anchors[id],label);
    this._prop('camp-supply','supplies',point(camp,-120,190),'药箱');this._prop('road-supply','supplies',point(levy,-130,-120),'药箱');
    this._prop('camp-tent','tent',point(camp,-110,-180),'登记棚');
    for(const [i,dx,dy] of [[0,190,100],[1,210,140],[2,-150,-65]])this._prop(`grain-${i}`,'grain',point(camp,dx,dy),'粮袋');
    g.canonicalBuild??=g.build;
    for(const skill of Object.values(g.build.skills))if(!this.allowsSkill(skill.id)){skill.baseRank=0;skill.equipped=false;}
    // Each chapter supplies its own fixed starting kit, not a world save.
    for(const [id,rank] of Object.entries(this.definition.startingBuild))g.build.levels[id]=rank;
    g._refreshStats?.();g._refreshWeapons?.();g.player.hp=g.player.maxHp;
    this._syncStructures();this.initialized=true;this.flow.start();g._emit?.('storyStarted',{storyId:this.id,name:this.name});return true;
  }
  _syncStructures(){
    const solids=this.props.filter(p=>['tent','records','ledger','grain','supplies'].includes(p.storyProp));
    this.game.terrain.setStructures(solids.map(p=>({id:p.id,type:'log',variant:'story-camp',x:p.x,y:p.y-3,halfLength:p.storyProp==='tent'?34:p.storyProp==='grain'?22:18,r:p.storyProp==='tent'?13:8,angle:0,visual:false})),this.id);
  }
  _approach(point){
    const g=this.game,r=g.player.r+4;
    if(g.terrain.isFree(point.x,point.y,r))return point;
    for(const [dx,dy] of [[0,60],[60,30],[-60,30],[0,-65]]){
      const candidate={x:point.x+dx,y:point.y+dy};if(g.terrain.isFree(candidate.x,candidate.y,r))return candidate;
    }
    return this._safePoint(point,r);
  }
  _safePoint(point,r=20){
    const terrain=this.game.terrain;if(terrain.isFree(point.x,point.y,r))return {...point};
    for(let radius=24;radius<=360;radius+=24)for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,p={x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius};if(terrain.isFree(p.x,p.y,r))return p;
    }
    throw new Error(`No walkable chapter placement at ${point.x},${point.y}`);
  }
  _actor(id,heroId,point,extra={}){
    const hero=getHero(heroId),actor={id:`${this.id}:${id}`,storyActor:true,name:names[id],heroId,appearanceId:hero.appearanceId||`${heroId}-v2`,x:point.x,y:point.y-19.8,groundOffset:19.8,r:15,hp:1,maxHp:1,speed:hero.baseSpeed,facing:Math.PI/2,...extra};
    resetLocomotion(actor);this.actors.push(actor);return actor;
  }
  _prop(id,storyProp,point,label){const prop={id:`${this.id}:${id}`,type:'storyProp',storyProp,x:point.x,y:point.y,sortY:point.y,r:storyProp==='tent'?50:22,label,state:'ready'};this.props.push(prop);return prop;}
  _enter(step){
    this.game._emit?.('storyStep',{storyId:this.id,step});
    if(['meeting','debrief','departure'].includes(step))this._dialogue(step);
    if(step==='notice')this._spawnGroup('levy',this.anchors.notice,['royalguard','royallancer'],170);
    if(step==='scout'){
      this._spawnGroup('gate',this.anchors.scout,['royalguard','royalguard','royalarbalist'],150);
      this._spawnGroup('signal',this.anchors.signal,['royalguard','royalmage'],65);
      this._spawnGroup('papers',this.anchors.records,['royalguard','royallancer','royalarbalist','royalmage'],100);
      this._spawnGroup('captives',this.anchors.captives,['royalguard','royallancer','royalarbalist'],85);
      this.marshal=this._spawn('boss',{x:this.anchors.records.x+100,y:this.anchors.records.y-50},'escort');
      this.game._initializeRegionalBoss?.(this.marshal,'escortmarshal');
      Object.assign(this.marshal,{...this.definition.encounters.bosses.escortmarshal,maxHp:this.definition.encounters.bosses.escortmarshal.hp,storyId:this.id,storyEnemy:true,storyGroup:'escort',_chapterAwake:false});this.marshal._chapterInitialHp=this.marshal.hp;
    }
    if(step==='rescue'){
      this._exposedAt=this._clock;this.officer.fleeing=true;
      this._sayLine('exposedOfficer',6);
      this._sayLine('exposedPrincess',6);
      if(this.marshal?.hp>0)this.marshal._chapterAwake=true;
      this._nextWave=this._clock+this.definition.encounters.reinforcement.firstDelay;
    }
    if(step==='withdraw'){
      this._sayLine('withdraw');
      this._spawnGroup('rear',this.anchors.scout,['royalguard','royalarbalist','royallancer'],100,true);
    }
    if(step==='northroad'){
      for(const worker of this.workers)worker.following=false;this._sayLine('workerDeparture');
      this._spawnGroup('north',this.anchors.exit,['royallancer','royalarbalist','royalguard'],120);
      const captain=this._spawn('boss',this.anchors.exit,'north');this.game._initializeRegionalBoss?.(captain,'searchcaptain');
      Object.assign(captain,{...this.definition.encounters.bosses.searchcaptain,maxHp:this.definition.encounters.bosses.searchcaptain.hp,storyId:this.id,storyEnemy:true,storyGroup:'north',_chapterAwake:false});captain._chapterInitialHp=captain.hp;
    }
    if(step==='complete')this._complete();
  }
  _spawn(type,point,group){
    const enemy=this.game._spawnEnemy(type,1),spot=this._safePoint(point,enemy.r+3);
    const stats=this.definition.encounters.troops[type]||this.definition.encounters.bosses.escortmarshal;
    Object.assign(enemy,{...stats,maxHp:stats.hp,x:spot.x,y:spot.y-groundOffset(enemy,false),storyId:this.id,storyEnemy:true,storyGroup:group,_chapterAwake:false});
    enemy._chapterInitialHp=enemy.hp;enemy._chapterHome=spot;return enemy;
  }
  _spawnGroup(group,center,types,spread=100,awake=false){
    types.forEach((type,i)=>{
      const angle=(i+.4)*Math.PI*2/types.length,enemy=this._spawn(type,{x:center.x+Math.cos(angle)*spread,y:center.y+Math.sin(angle)*spread},group);
      enemy._chapterInitialHp=enemy.hp;enemy._chapterAwake=awake;
    });this.game._rebuildGrid?.();
  }
  _living(){return this.game.enemies.filter(enemy=>enemy.storyId===this.id&&enemy.hp>0);}
  beforeEnemy(enemy){
    if(enemy.storyId!==this.id)return false;
    if(enemy._chapterAwake)return false;
    const close=distance(foot(enemy),foot(this.game.player))<this.rules.guardNotice;
    const hit=enemy.hp<enemy._chapterInitialHp;
    if(hit||close&&!this.game.terrain.firstBlocker(enemy.x,foot(enemy).y,this.game.player.x,foot(this.game.player).y,0,'sight')){
      for(const ally of this._living())if(ally.storyGroup===enemy.storyGroup)ally._chapterAwake=true;return false;
    }
    enemy.moving=false;return true;
  }
  onEnemyDefeated(enemy){if(enemy.storyId===this.id)this._lastDefeat=this._clock;}
  _near(point,r=this.rules.interactionRadius){return !!point&&distance(foot(this.game.player),point)<=r;}
  _clear(point,r=160){return !this._living().some(enemy=>distance(foot(enemy),point)<r);}
  _interactable(point){const approach=this._approach(point);return this._near(point)&&!this.game.terrain.firstBlocker(this.game.player.x,foot(this.game.player).y,approach.x,approach.y,0,'sight');}
  getAction(){
    if(!this.active||this.dialogueBlocking)return null;
    const action=(id,label,point,guarded=false)=>this._interactable(point)?{id:`story:${id}`,label,detail:guarded?'先击退附近的守军':'',enabled:!guarded}:null;
    let result=null;
    if(this.step==='notice')result=action('read-notice','查看告示',this.anchors.notice,!this._clear(this.anchors.notice,200));
    if(this.step==='witness')result=action('ask-villager','询问村民',foot(this.villager));
    if(this.step==='scout')result=action('scout','观察哨位',this.anchors.scout,!this._clear(this.anchors.scout,150));
    if(['infiltrate','rescue'].includes(this.step)&&!this.signalDisabled)result??=action('cut-signal','拆除传令架',this.anchors.signal,!this._clear(this.anchors.signal,140));
    if(this.step==='infiltrate')result??=action('enter-camp','进入登记棚',this.anchors.records);
    if(this.step==='rescue'){
      if(!this.evidence.has('records'))result??=action('take-records','收起征粮原令',this.anchors.records,!this._clear(this.anchors.records,140));
      if(!this.evidence.has('ledger'))result??=action('take-ledger','取出运输底页',this.anchors.ledger,!this._clear(this.anchors.ledger,140));
      if(!this.worker.following)result??=action('free-workers','解救装粮人',foot(this.worker),!this._clear(foot(this.worker),160));
    }
    if(this.step==='withdraw'&&this.rescued&&this.officerEscaped)result??=action('compare-evidence','核对文书',this.anchors.rally,!this._clear(this.anchors.rally,220));
    if(this.step==='northroad')result??=action('inspect-tracks','查看北路车辙',this.anchors.exit,!this._clear(this.anchors.exit,200));
    if(result)return result;
    if(this.game.player.hp<this.game.player.maxHp*.95)for(const prop of this.props)if(prop.storyProp==='supplies'&&!this._supplyUsed.has(prop.id)){
      result=action(`supply:${prop.id}`,'使用药箱',prop,!this._clear(prop,130));if(result)return result;
    }
    return null;
  }
  useAction(id){
    const action=this.getAction();if(!action||!action.enabled||action.id!==id)return false;
    if(id==='story:read-notice')this._dialogue('notice');
    else if(id==='story:ask-villager')this._dialogue('witness');
    else if(id==='story:scout')this._dialogue('scout');
    else if(id==='story:cut-signal'){this.signalDisabled=true;this.props.find(p=>p.storyProp==='signal').state='disabled';this._sayLine('signalDisabled');}
    else if(id==='story:enter-camp')this.flow.go('rescue');
    else if(id==='story:take-records'||id==='story:take-ledger'){
      const key=id==='story:take-records'?'records':'ledger';this.evidence.add(key);this.props.find(p=>p.storyProp===key).state='taken';
      this._sayLine(key==='records'?'recordsTaken':'ledgerTaken');
    }
    else if(id==='story:free-workers'){for(const worker of this.workers)worker.following=true;this._sayLine('workersFreed');}
    else if(id==='story:compare-evidence')this.flow.go('debrief');
    else if(id==='story:inspect-tracks')this.flow.go('departure');
    else if(id.startsWith('story:supply:')){
      const key=id.slice('story:supply:'.length);this._supplyUsed.add(key);this.props.find(p=>p.id===key).state='used';
      this.game.player.hp=Math.min(this.game.player.maxHp,this.game.player.hp+this.game.player.maxHp*this.rules.recovery);this._sayLine('healed',3);
    }else return false;
    return true;
  }
  _follow(actor,target,dt,{stop=60,start=125,mode='follow',speed=320}={}){
    const g=this.game,nav=terrainNavigation(g.terrain),from=foot(actor);
    updateFollowMovement(g,actor,{target,from,stop,start,mode:`${this.id}:${mode}`,baseSpeed:speed,catchup:1.1,direct:nav.clearSegment(from,target,actor.r+3,'ground'),move:(moving,time,goal)=>{
      const origin=foot(moving),next=nav.waypoint(moving,origin,goal,moving.r+3,'ground',this._clock,g._clock);if(!next)return;
      const dx=next.x-origin.x,dy=next.y-origin.y,length=Math.hypot(dx,dy);if(length<.01)return;
      const amount=Math.min(length,moving.speed*time);g._moveEntity(moving,dx/length*amount,dy/length*amount);
    }},dt);actor.groundY=actor.y+groundOffset(actor,true);if(actor.moving)actor.moveFacing=actor.facing;
  }
  updateActors(dt){
    if(!this.active||this.dialogueBlocking||dt<=0)return;
    const leader=foot(this.game.player);
    for(const actor of this.actors)actor.castFace=Math.max(0,(actor.castFace||0)-dt);
    for(const actor of [this.princess,this.elder,...this.workers])if(actor?.following&&!actor.hidden)this._follow(actor,leader,dt,{stop:this.workers.includes(actor)?65:70,start:this.workers.includes(actor)?135:150,speed:getHero(actor.heroId).baseSpeed});
    if(this.officer.fleeing&&!this.officerEscaped){
      this._follow(this.officer,this.anchors.exit,dt,{stop:28,start:40,mode:'escape',speed:335});
      if(distance(foot(this.officer),this.anchors.exit)<65){this.officerEscaped=true;this.officer.hidden=true;this._sayLine('officerEscaped',6);}
    }
    this._support(dt);
  }
  _support(dt){
    if(!['scout','infiltrate','rescue','withdraw','northroad'].includes(this.step))return;
    const support=this.definition.encounters.support;
    this._supportTimer=(this._supportTimer||0)-dt;if(this._supportTimer>0)return;this._supportTimer=support.interval;
    const g=this.game,actor=this.princess;
    const enemy=this._living().filter(e=>e._chapterAwake&&g.combat.canTarget(e,actor,{range:support.range,requireView:true,checkPath:true,source:'companionLightning'})).sort((a,b)=>distance(a,actor)-distance(b,actor))[0];
    if(enemy){actor.facing=Math.atan2(enemy.y-actor.y,enemy.x-actor.x);actor.castFace=.2;g._effect?.(actor.x,actor.y,'lightning',.16,8,'#c8dfdd',undefined,{x2:enemy.x,y2:enemy.y,renderGroundY:foot(actor).y,renderEndGroundY:foot(enemy).y,ally:true});g._hitEnemy(enemy,support.damage,0,actor,'companionLightning');}
    else actor.castFace=0;
  }
  update(dt){
    if(!this.active||this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    if(this.game.terrain!==this._sceneTerrain||this.game.mapId!==this._sceneMapId){this.cleanup('sceneChange');return;}
    if(this.dialogueBlocking)return;
    this._clock+=dt;this.flow.update(dt);this._updateBubbles();
    if(['rescue','withdraw'].includes(this.step)){
      if(!this.rescued&&!this.signalDisabled&&this._waves<this.definition.encounters.reinforcement.waves&&this._clock>=this._nextWave){
        this._waves++;this._nextWave=this._clock+this.definition.encounters.reinforcement.interval;this._spawnGroup(`reinforcement-${this._waves}`,this.anchors.reinforcement,['royalguard','royallancer','royalarbalist'],110,true);
        this._sayLine('reinforcements',4);
      }
      if(this.step==='rescue'&&this.evidence.size===2&&this.worker.following)this.flow.go('withdraw');
    }
    if(this.step==='withdraw'&&!this.rescued&&this._near(this.anchors.rally,160)&&this.workers.every(worker=>distance(foot(worker),this.anchors.rally)<165)){
      this.rescued=true;for(const worker of this.workers)worker.following=false;this._sayLine('rescueComplete');
    }
  }
  _beginDeparture(){
    if(this.departurePending||this.completed)return false;
    this.departurePending=true;
    if(this.game.sceneTransition?.run)this.game.sceneTransition.run('前往粮道',()=>this.flow.go('complete'));
    else this.flow.go('complete');
    return true;
  }
  _clearCombat(){
    const g=this.game;clearSceneActors(g);
    g.enemies=g.enemies.filter(e=>e.storyId!==this.id);g._rebuildGrid?.();
  }
  _complete(){
    if(this.completed)return;this.completed=true;this.completionTime=this.game.runTime;this.dialogue=[];this.actors=[];this.props=[];this._sceneTerrain?.setStructures([],this.id);this._clearCombat();
    const g=this.game;g._choices=null;g.status='victory';g.sceneContent?.dispose();
    g._emit?.('storyCompleted',{storyId:this.id,name:this.name,summary:this.definition.completionSummary});g._emit?.('victory',{storyId:this.id,story:true});
  }
  cleanup(reason='exit'){
    if(this.disposed)return false;this.disposed=true;this.dialogue=[];this.actors=[];this.props=[];this._bubbles=[];this._bubbleQueue=[];this._sceneTerrain?.setStructures([],this.id);this._clearCombat();
    this.game.sceneContent?.dispose();this.game._emit?.('storyDisposed',{storyId:this.id,reason});return true;
  }
}
