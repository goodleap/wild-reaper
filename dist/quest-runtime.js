import { groundOffset } from './terrain.js';
import { NavigationRoute } from './navigation-route.js';
import { CLOCK_BRIDGE,MARSH_BRIDGE,questDefinition,questsForWorld,questWorlds } from './quest-definitions.js';
import { QuestStore } from './quest-store.js';
import { portalDoor } from './portal-geometry.js';
import { QuestCommissions } from './quest-commissions.js';
import { SideQuestRuntime } from './sidequests/runtime.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const CITY='clockshadow-city',FOREST='rift-forest',MARSH='marsh',RUINS='ruins',ROAD='moss-stone-road';
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
const point=(value,label)=>value?{x:value.x,y:value.y,label}:null;

// One bounded, event-driven journal belongs to an adventure. Region snapshots
// retain scenes; the journal owns only durable objective facts and route effects.
export class WorldQuests {
  constructor(game,{storage}={}){
    this.game=game;this.enabled=game.mode==='world'&&game._features.adventure&&!game.stage&&!game.expedition;
    // A campaign supplies its own storage adapter in either play mode. A
    // standalone debug fixture must not fall back to the browser quest key.
    this.store=new QuestStore({storage:this.enabled&&(!game.debug||storage!==undefined)?storage:null});
    this.revision=0;this.board=null;this.boards=[];this._definitions=[];this._route=null;this._routeTerrain=null;this._trip=null;this._cellarChests=new WeakMap();this._targetId=null;
    this.commissions=new QuestCommissions(this);this.sidequests=new SideQuestRuntime(this);this.enterWorld();
  }
  get storageAvailable(){return this.store.available;}
  get storageMode(){return this.store.available?'persistent':this.game.debug?'session-debug':'session';}
  get definitions(){return this.enabled?this._definitions:[];}
  get trackedId(){return [this.store.data.tracked[this.game.worldId],this.store.data.tracked.journey].find(id=>this.definitions.some(definition=>definition.id===id)&&this._record(id)?.accepted&&!this._record(id).completed)||null;}
  get definition(){const definitions=this.definitions;return definitions.find(definition=>definition.id===this.trackedId)||definitions.find(definition=>!this._record(definition.id).completed)||definitions[0]||null;}
  _record(id=this.definition?.id){return id?this.store.record(id):null;}
  _changed(){this.revision++;this.store.changed();this._applyWorldEffects();this.game._scheduleWorldSave?.('quest-progress');}
  flush(){this.commissions.checkpoint();this.sidequests.checkpoint();return this.store.flush();}
  _known(definition){return !!definition&&this.definitions.includes(definition);}
  _discover(id=this.definition?.id){const record=this._record(id);if(!record||record.discovered)return false;record.discovered=true;this._changed();return true;}
  _boardPoint(){
    const g=this.game,core=g.worldTravel?.enabled?g.worldTravel.current?.core:null,anchor=core||g.terrain.island?.layout?.spawn;if(!anchor)return null;
    const approach=core?.spawn||(core?.waypoint?{x:core.waypoint.x,y:core.waypoint.y+30}:anchor),candidates=core?.questBoard?[core.questBoard]:[];
    for(const radius of [115,155,195])for(const [dx,dy] of [[-1,.4],[-1,-.4],[0,1],[0,-1],[1,.8]])candidates.push({x:anchor.x+dx*radius,y:anchor.y+dy*radius});
    for(const p of candidates){
      if(!g.terrain.isFree(p.x,p.y,28)||g.terrain.firstBlocker(approach.x,approach.y,p.x,p.y,18))continue;
      if(g.environment?.isHazardFree?.(p.x,p.y,40)===false)continue;
      if(g.settlements?.sites.some(site=>distance(p,site)<85))continue;
      if(this.boards.some(board=>distance(p,board)<75))continue;
      return p;
    }
    return null;
  }
  enterWorld(){
    this.commissions.enterWorld();
    this._route=null;this._routeTerrain=null;this._trip=null;this._roadTrip=null;this._targetId=null;this._mouthId=null;this._exitChoice=null;this.board=null;this.boards=[];
    const g=this.game;if(g.dungeon?.active)return;
    const layout=g.terrain.island?.layout;
    this._definitions=this.enabled&&layout?.kind==='rift-forest'?questsForWorld(g.worldId):[];
    const road=this._record(ROAD);if(this.enabled&&layout?.kind==='rift-forest'&&road.accepted&&!road.completed&&!this._definitions.some(definition=>definition.id===ROAD))this._definitions.push(questDefinition(ROAD));
    // A reduced mechanics fixture, or a map missing a required authored
    // source, must never receive an impossible quest or a permanent roadblock.
    this._definitions=this._definitions.filter(definition=>definition.sidequest?this.sidequests.ready(definition):definition.id==='clock-bridge'?!!(this._occupied()&&this._cellar()):definition.id==='underground-return'?!!g.riftExploration?.sites.some(site=>site.gateId==='bell-shortcut'):definition.id===ROAD?this._roadSourcesReady():this.commissions.ready(definition));
    this.sidequests.enterWorld();
    if(!this.definitions.length)return;
    for(const definition of this.definitions){if(definition.sidequest||!questWorlds(definition).includes(g.worldId))continue;const location=this._boardPoint();if(location)this.boards.push({id:`quest:${definition.id}:board`,questId:definition.id,kind:'questBoard',...location,sortY:location.y,name:definition.name});}
    this.board=this.boards[0]||null;
    this._applyWorldEffects();
    // The starting sign is visible from the haven, so the first journal entry
    // is immediately discoverable without an interrupting modal or toast.
    for(const board of this.boards)if(distance(foot(g),board)<=220)this._discover(board.questId);
    this.revision++;
  }
  _applyWorldEffects(){
    const g=this.game;if(!this.definitions.length||g.dungeon?.active)return;
    const city=this.definitions.some(definition=>definition.id==='clock-bridge')?this._record('clock-bridge'):null,forest=this.definitions.some(definition=>definition.id==='underground-return')?this._record('underground-return'):null,road=this._known(questDefinition(ROAD))?this._record(ROAD):null;
    const key=`${g.worldId}:${!!city?.objectives.bridge}:${!!forest?.objectives.gate}:${!!road?.objectives.bridge}`;
    if(this._effectTerrain===g.terrain&&this._effectKey===key)return;
    this._effectTerrain=g.terrain;this._effectKey=key;
    if(city){
      const bridge=g.terrain.island?.layout?.passages?.find(p=>p.id==='08-12'&&p.kind==='bridge');
      if(!bridge)return;
      const b=CLOCK_BRIDGE;
      g.terrain.setStructures(city.objectives.bridge?[]:[{id:'quest:clock-bridge:barrier',type:'log',variant:'quest-barrier',structureId:'quest:clock-bridge',x:b.x,y:b.y,r:b.r,halfLength:b.halfLength,angle:b.angle,visual:false,navigationBarrier:true}], 'world-quests');
    }
    if(forest?.objectives.gate){
      const gate=g.riftExploration?.sites.find(site=>site.gateId==='bell-shortcut');
      if(gate){gate.open=true;gate.state='cleared';g.riftExploration.shortcutOpen=true;g.terrain.setRiftGate(gate.gateId,true);}
    }
    if(g.worldId===MARSH&&road){
      const b=MARSH_BRIDGE;
      g.terrain.setStructures(road.objectives.bridge?[]:[{id:`quest:${ROAD}:barrier`,type:'log',variant:'quest-barrier',structureId:`quest:${ROAD}`,x:b.x,y:b.y,r:b.r,halfLength:b.halfLength,angle:b.angle,visual:false,navigationBarrier:true}],'world-quests-road');
    }
  }
  accept(id){
    const definition=questDefinition(id);if(!this._known(definition))return false;
    this.store.refresh();this._applyWorldEffects();
    const record=this._record(id);if(!record.discovered||record.accepted||record.completed)return false;
    record.accepted=true;for(const worldId of questWorlds(definition))this.store.data.tracked[worldId]=id;if(definition.worldIds)this.store.data.tracked.journey=id;this._changed();
    this.game._emit('questAccepted',{id,name:definition.name});this._complete(id);return true;
  }
  track(id){
    const definition=questDefinition(id);if(!this._known(definition))return false;
    const record=this._record(id);if(!record.accepted||record.completed)return false;
    for(const worldId of questWorlds(definition))this.store.data.tracked[worldId]=id;
    // An explicitly selected journey also owns the current region's tracker,
    // including detours outside its objective regions. Local quests may be
    // selected again without removing the journey fallback for other regions.
    this.store.data.tracked[this.game.worldId]=id;if(definition.worldIds)this.store.data.tracked.journey=id;this._targetId=null;this._route=null;this._changed();return true;
  }
  _objective(id,questId){
    const definition=questDefinition(questId);if(!this._known(definition)||!definition.objectives.some(objective=>objective.id===id))return false;
    const record=this._record(questId);if(record.objectives[id])return false;
    // These are world facts, including one-time chest claims and route changes.
    // Finding them never opts the player into a commission or its rewards.
    record.discovered=true;record.objectives[id]=true;this._changed();this._complete(questId);return true;
  }
  _complete(id){
    const definition=questDefinition(id),record=this._record(id);
    if(!record?.accepted)return false;
    if(record.completed){this._applyWorldEffects();return false;}
    if(!definition.objectives.filter(objective=>!objective.optional).every(objective=>record.objectives[objective.id]))return false;
    this.store.refresh();
    if(record.completed){this._applyWorldEffects();return false;}
    const reward=!record.rewardClaimed;record.completed=true;record.rewardClaimed=true;
    this._changed();this._applyWorldEffects();
    if(reward)this.game.grantResources(definition.reward,`quest:${definition.id}`);
    this.game._emit('questCompleted',{id:definition.id,name:definition.name,rewardText:definition.rewardText});return true;
  }
  update(){
    this.commissions.update();
    this.sidequests.update();
    if(!this.definition||this.game.dungeon?.active)return;
    for(const board of this.boards)if(!this._record(board.questId).discovered&&distance(foot(this.game),board)<220)this._discover(board.questId);
  }
  _occupied(){return this.game.settlements?.sites.find(site=>site.type==='occupied');}
  _cellar(){return this.game.riftExploration?.sites.find(site=>site.caveId==='city-cellar');}
  _roadSourcesReady(){
    const g=this.game;
    if(g.worldId===FOREST)return !!this._occupied();
    if(g.worldId===MARSH)return g.riftExploration?.sites.filter(site=>site.caveId==='rootwater-tunnel').length===2&&g.terrain.island?.layout?.passages?.some(p=>p.id==='s18'&&p.kind==='bridge');
    if(g.worldId===RUINS)return g.riftExploration?.sites.some(site=>site.caveId==='buried-aqueduct');
    return !!this._record(ROAD)?.accepted;
  }
  _bearingChest(state){
    if(state?.site?.caveId!=='buried-aqueduct')return null;
    if(!this._cellarChests.has(state))this._cellarChests.set(state,[...state.chests].sort((a,b)=>(state.distances.get(b.cellId)||0)-(state.distances.get(a.cellId)||0)||a.id.localeCompare(b.id))[0]||null);
    return this._cellarChests.get(state);
  }
  _chainChest(state){
    if(!state||state.site?.caveId!=='city-cellar')return null;
    if(!this._cellarChests.has(state)){
      // A real guarded room in the seeded maze contains the chain. Choose a
      // distant side chest, keeping the Boss treasury and normal rewards intact.
      const chest=[...state.chests].sort((a,b)=>(state.distances.get(b.cellId)||0)-(state.distances.get(a.cellId)||0)||a.id.localeCompare(b.id))[0]||null;
      this._cellarChests.set(state,chest);
    }
    return this._cellarChests.get(state);
  }
  onDungeonEnter(state,site){
    this.sidequests.onDungeonEnter(state,site);
    if(!this.definition||this.game.dungeon?.active!==state||state.site?.id!==site.id)return;
    this._route=null;this._targetId=null;this._exitChoice=null;
    if(this.game.worldId===FOREST&&site.caveId==='underground-passage'&&['cave05','cave15'].includes(site.entryKey)){
      this._trip={state,entry:site.entryKey};this._discover('underground-return');
    }else if(this.game.worldId===CITY&&(site.id===this._occupied()?.id||site.caveId==='city-cellar')){
      this._discover('clock-bridge');
      const chest=site.caveId==='city-cellar'?this._chainChest(state):state.chests[0];
      // Existing opened scenes remain valid if the journal was unavailable at
      // their first visit. No new loot or duplicate ordinary chest reward.
      if(chest?.state==='claimed')this.onChestClaimed(state,chest);
    }
    if(this._known(questDefinition(ROAD))){
      if(this.game.worldId===MARSH&&site.caveId==='rootwater-tunnel'){
        this._roadTrip={state,entry:site.entryKey};this._discover(ROAD);
      }
      const chest=this.game.worldId===FOREST&&site.id===this._occupied()?.id?state.chests[0]:this.game.worldId===RUINS?this._bearingChest(state):null;
      if(chest){this._discover(ROAD);if(chest.state==='claimed')this.onChestClaimed(state,chest);}
    }
  }
  onChestClaimed(state,chest){
    if(!this.definition||this.game.dungeon?.active!==state||chest?.state!=='claimed'||!state.chests.includes(chest))return false;
    if(this.game.worldId===CITY){
      if(state.site?.id===this._occupied()?.id&&state.site?.type==='occupied')return this._objective('gear','clock-bridge');
      if(state.site?.caveId==='city-cellar'&&chest===this._chainChest(state))return this._objective('chain','clock-bridge');
    }
    if(this._known(questDefinition(ROAD))){
      if(this.game.worldId===FOREST&&state.site?.id===this._occupied()?.id&&chest===state.chests[0])return this._objective('handle',ROAD);
      if(this.game.worldId===RUINS&&chest===this._bearingChest(state))return this._objective('bearing',ROAD);
    }
    return false;
  }
  onDungeonExit(state,exit){
    this.sidequests.onDungeonExit(state,exit);
    if(this.definition&&this.game.worldId===FOREST&&this._trip?.state===state&&exit&&exit.key!==this._trip.entry&&['cave05','cave15'].includes(exit.key))this._objective('crossing','underground-return');
    if(this._known(questDefinition(ROAD))&&this.game.worldId===MARSH&&this._roadTrip?.state===state&&exit&&exit.key!==this._roadTrip.entry&&state.riftExits?.some(candidate=>candidate.key===exit.key))this._objective('crossing',ROAD);
    this._trip=null;this._roadTrip=null;this._route=null;this._targetId=null;this._mouthId=null;this._exitChoice=null;this._applyWorldEffects();
  }
  onShortcutOpened(site){
    if(this.definition&&this.game.worldId===FOREST&&site?.gateId==='bell-shortcut'&&site.open&&this.game.riftExploration?.sites.includes(site))return this._objective('gate','underground-return');
    return false;
  }
  chestLabel(state,chest){
    if(!this.definition)return '';
    if(this._known(questDefinition(ROAD))){
      const road=this._record(ROAD);
      if(this.game.worldId===FOREST&&!road.objectives.handle&&state.site?.id===this._occupied()?.id&&chest===state.chests[0])return '取回驿桥摇柄';
      if(this.game.worldId===RUINS&&!road.objectives.bearing&&chest===this._bearingChest(state))return '取回耐水轴承';
    }
    if(this.game.worldId!==CITY)return '';
    const record=this._record('clock-bridge');
    if(!record.objectives.gear&&state.site?.id===this._occupied()?.id)return '取回绞盘齿轮';
    if(!record.objectives.chain&&chest===this._chainChest(state))return '取回牵引链';
    return '';
  }
  getInteraction(){
    if(!this.enabled||this.game.status!=='playing')return null;
    const p=foot(this.game),choices=[this.sidequests.getInteraction(),this._legacyInteraction()].filter(Boolean);
    return choices.sort((a,b)=>Number(!!a.portable)-Number(!!b.portable)||distance(p,a)-distance(p,b))[0]||null;
  }
  _legacyInteraction(){
    const g=this.game,definition=this.definition;if(!definition||g.dungeon?.active||g.status!=='playing')return null;
    const p=foot(g),board=[...this.boards].filter(board=>!this._record(board.questId).accepted&&distance(p,board)<90&&!g.terrain.firstBlocker(p.x,p.y,board.x,board.y,0,'sight')).sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(board){const entry=questDefinition(board.questId);return {id:board.id,questId:entry.id,category:'quest',type:'questBoard',label:`查看委托 · ${entry.name}`,description:entry.description,x:board.x,y:board.y,touchRadius:30,enabled:true};}
    const commission=this.commissions.getInteraction();if(commission)return commission;
    const record=this._record('clock-bridge');
    if(this._known(questDefinition('clock-bridge'))&&!record.objectives.bridge&&distance(p,CLOCK_BRIDGE.approach)<105&&!g.terrain.firstBlocker(p.x,p.y,CLOCK_BRIDGE.approach.x,CLOCK_BRIDGE.approach.y,0,'sight')){
      const ready=record.objectives.gear&&record.objectives.chain;
      return {id:'quest:clock-bridge:winch',category:'quest',type:'questMechanism',label:ready?'装回绞盘 · 开启钟桥':'钟桥绞盘缺少零件',description:ready?'恢复东西两岸的直接通路':`需要${record.objectives.gear?'':'绞盘齿轮'}${!record.objectives.gear&&!record.objectives.chain?'、':''}${record.objectives.chain?'':'牵引链'}`,x:CLOCK_BRIDGE.approach.x,y:CLOCK_BRIDGE.approach.y,touchRadius:34,enabled:!!ready};
    }
    const road=this._record(ROAD);
    if(g.worldId===MARSH&&this._known(questDefinition(ROAD))&&!road.objectives.bridge&&distance(p,MARSH_BRIDGE.approach)<105&&!g.terrain.firstBlocker(p.x,p.y,MARSH_BRIDGE.approach.x,MARSH_BRIDGE.approach.y,0,'sight')){
      const ready=road.objectives.handle&&road.objectives.crossing&&road.objectives.bearing;
      const missing=[!road.objectives.handle&&'驿桥摇柄',!road.objectives.crossing&&'盘根水道勘探',!road.objectives.bearing&&'耐水轴承'].filter(Boolean).join('、');
      return {id:`quest:${ROAD}:winch`,category:'quest',type:'questMechanism',label:ready?'修复绞盘 · 开启长堤桥':'长堤桥绞盘尚未修复',description:ready?'连通东西两岸，免去北岸绕行':`尚需${missing}`,x:MARSH_BRIDGE.approach.x,y:MARSH_BRIDGE.approach.y,touchRadius:34,enabled:!!ready};
    }
    return null;
  }
  interact(id){
    const current=this.getInteraction();if(!current||current.id!==id||!current.enabled)return false;
    if(current.sideQuestId)return this.sidequests.interact(id);
    if(current.type==='questBoard'){this._discover(current.questId);this.game._emit('questBoardOpen',{id:current.questId,name:questDefinition(current.questId).name});return true;}
    if(current.type==='questCommission')return this.commissions.interact(id);
    if(current.type==='questMechanism'){
      const road=current.id===`quest:${ROAD}:winch`,bridge=road?MARSH_BRIDGE:CLOCK_BRIDGE;
      this._objective('bridge',road?ROAD:'clock-bridge');this.game._effect(bridge.winch.x,bridge.winch.y,'ring',.65,54,'#dfce92');return true;
    }
    return false;
  }
  getActors(){return this.enabled?[...(this.game.dungeon?.active?[]:this.commissions.getActors()),...this.sidequests.getActors()]:[];}
  getProps(){
    const g=this.game,definition=this.definition,additional=this.sidequests.getProps();if(!definition||g.dungeon?.active)return additional;
    const props=this.boards.map(board=>{const record=this._record(board.questId);return {...board,state:record.completed?'completed':record.accepted?'active':'available'};});
    if(this._known(questDefinition('clock-bridge'))){
      const record=this._record('clock-bridge');
      props.push({id:'quest:clock-bridge:winch',kind:'questWinch',...CLOCK_BRIDGE.winch,sortY:CLOCK_BRIDGE.winch.y,open:!!record.objectives.bridge,state:record.objectives.bridge?'completed':record.objectives.gear&&record.objectives.chain?'ready':'locked'});
      props.push({id:'quest:clock-bridge:barrier',kind:'questBarrier',x:CLOCK_BRIDGE.x,y:CLOCK_BRIDGE.y,sortY:CLOCK_BRIDGE.y,angle:CLOCK_BRIDGE.angle,halfLength:CLOCK_BRIDGE.halfLength,r:CLOCK_BRIDGE.r,open:!!record.objectives.bridge});
    }
    if(g.worldId===MARSH&&this._known(questDefinition(ROAD))){
      const record=this._record(ROAD),b=MARSH_BRIDGE;
      props.push({id:`quest:${ROAD}:winch`,kind:'questWinch',...b.winch,sortY:b.winch.y,open:!!record.objectives.bridge,state:record.objectives.bridge?'completed':record.objectives.handle&&record.objectives.crossing&&record.objectives.bearing?'ready':'locked'});
      props.push({id:`quest:${ROAD}:barrier`,kind:'questBarrier',x:b.x,y:b.y,sortY:b.y,angle:b.angle,halfLength:b.halfLength,r:b.r,open:!!record.objectives.bridge});
    }
    return props.concat(this.commissions.getProps(),additional);
  }
  _exitTarget(label){
    const state=this.game.dungeon?.active;if(!state)return null;
    const exits=state.riftExits||[state.entrance],p=foot(this.game),nearest=exits.includes(this._exitChoice)?this._exitChoice:[...exits].sort((a,b)=>distance(p,a)-distance(p,b))[0];
    this._exitChoice=nearest;
    return point(nearest,`返回地面 · ${label}`);
  }
  _travelTarget(worldId,label){
    const g=this.game;if(g.dungeon?.active)return this._exitTarget(label);
    const edges=g.worldTravel?.config?.connections||[],queue=[g.worldId],parents=new Map([[g.worldId,null]]);
    for(let i=0;i<queue.length&&!parents.has(worldId);i++)for(const edge of edges){
      const next=edge.from===queue[i]?edge.to:edge.to===queue[i]?edge.from:null;
      if(next&&!parents.has(next)){parents.set(next,queue[i]);queue.push(next);}
    }
    if(!parents.has(worldId))return null;
    let next=worldId;while(parents.get(next)!==g.worldId&&parents.get(next)!==null)next=parents.get(next);
    const portal=g.regions.portals.find(portal=>portal.nextRegion?.id===next);
    return portal?point(portalDoor(portal),`沿${portal.name}前往${portal.nextRegion.name} · ${label}`):null;
  }
  _roadTargets(){
    const g=this.game,record=this._record(ROAD),state=g.dungeon?.active;
    const objective=!record.objectives.handle?'handle':!record.objectives.crossing?'crossing':!record.objectives.bearing?'bearing':'bridge';
    const worldId={handle:FOREST,crossing:MARSH,bearing:RUINS,bridge:MARSH}[objective];
    const label={handle:'取回驿桥摇柄',crossing:'穿过盘根水道',bearing:'取回耐水轴承',bridge:'回到长堤桥东岸修复绞盘'}[objective];
    let target;
    if(g.worldId!==worldId)target=this._travelTarget(worldId,label);
    else if(objective==='handle'){
      const occupied=this._occupied();
      target=state?state.site?.id===occupied?.id?point(state.chests[0],label):this._exitTarget(label):point(occupied?.door,'前往被占据的小屋 · 取回摇柄');
    }else if(objective==='crossing'){
      if(state&&this._roadTrip?.state===state)target=point(state.riftExits?.find(exit=>exit.key!==this._roadTrip.entry),'穿过盘根水道，到另一端洞口');
      else if(state)target=this._exitTarget(label);
      else{
        const mouths=g.riftExploration.sites.filter(site=>site.caveId==='rootwater-tunnel'),p=foot(g);
        const mouth=mouths.find(site=>site.id===this._mouthId)||mouths.sort((a,b)=>distance(p,a)-distance(p,b))[0];this._mouthId=mouth?.id;
        target=point(mouth,'进入盘根水道，寻找另一端出口');
      }
    }else if(objective==='bearing'){
      if(state?.site?.caveId==='buried-aqueduct')target=point(this._bearingChest(state),label);
      else if(state)target=this._exitTarget(label);
      else{
        const mouths=g.riftExploration.sites.filter(site=>site.caveId==='buried-aqueduct'),p=foot(g);
        const mouth=mouths.find(site=>site.id===this._mouthId)||mouths.sort((a,b)=>distance(p,a)-distance(p,b))[0];this._mouthId=mouth?.id;
        target=point(mouth,'进入遗迹旧水渠 · 寻找耐水轴承');
      }
    }else target=state?this._exitTarget(label):point(MARSH_BRIDGE.approach,label);
    return target?[{...target,objectiveId:objective}]:[];
  }
  _targets(definition=this.definition){
    const record=this._record(definition?.id),g=this.game,state=g.dungeon?.active;
    if(!definition||!record?.accepted||record.completed)return [];
    const result=[];
    if(definition.sidequest)return this.sidequests.targets(definition);
    if(definition.commission)return this.commissions.targets(definition);
    if(definition.id===ROAD)return this._roadTargets();
    if(definition.id==='clock-bridge'){
      const occupied=this._occupied(),cellar=this._cellar();
      if(!record.objectives.gear&&occupied){
        const target=state?state.site?.id===occupied.id?point(state.chests[0],'取回绞盘齿轮'):this._exitTarget('前往作业屋'):point(occupied.door,'前往被占据的作业屋');
        if(target)result.push({...target,objectiveId:'gear'});
      }
      if(!record.objectives.chain&&cellar){
        const target=state?state.site?.caveId==='city-cellar'?point(this._chainChest(state),'取回牵引链'):this._exitTarget('前往地下酒窖'):point(cellar,'进入地下酒窖');
        if(target)result.push({...target,objectiveId:'chain'});
      }
      if(record.objectives.gear&&record.objectives.chain)result.push({...state?this._exitTarget('修复钟桥'):point(CLOCK_BRIDGE.approach,'装回绞盘，开启钟桥'),objectiveId:'bridge'});
      // While inside a material's scene, finish that room before pointing at
      // the door merely because its world distance happens to be shorter.
      if(state){const local=result.filter(target=>!target.label.startsWith('返回地面'));if(local.length)return local;}
    }else if(definition.id==='underground-return'){
      if(!record.objectives.crossing){
        let target;
        if(state&&this._trip?.state===state)target=point(state.riftExits?.find(exit=>exit.key!==this._trip.entry),'穿过暗河，到另一端洞口');
        else if(state)target=this._exitTarget('探寻暗河通路');
        else{const p=foot(g),mouths=g.riftExploration.sites.filter(site=>site.caveId==='underground-passage'),mouth=mouths.find(site=>site.id===this._mouthId)||mouths.sort((a,b)=>distance(p,a)-distance(p,b))[0];this._mouthId=mouth?.id;target=point(mouth,'进入暗河，寻找另一端出口');}
        if(target)result.push({...target,objectiveId:'crossing'});
      }else if(!record.objectives.gate){
        const gate=g.riftExploration.sites.find(site=>site.gateId==='bell-shortcut');
        const target=state?this._exitTarget('开启钟楼旧门'):gate?point(g.riftExploration._gateApproach(gate),'从北侧开启钟楼旧门'):null;
        if(target)result.push({...target,objectiveId:'gate'});
      }
    }
    return result.filter(target=>Number.isFinite(target.x)&&Number.isFinite(target.y));
  }
  getEntries(){
    return this.definitions.filter(definition=>this._record(definition.id).discovered).map(definition=>{const record=this._record(definition.id);return {id:definition.id,name:definition.name,description:definition.description,status:record.completed?'completed':record.accepted?'active':'available',objectives:definition.objectives.map(objective=>({...objective,current:record.objectives[objective.id]?1:0,total:1,done:!!record.objectives[objective.id]})),rewardText:definition.rewardText,tracked:record.accepted&&this.trackedId===definition.id&&!record.completed,canAccept:!record.accepted&&!record.completed};});
  }
  getTracker(){
    const definition=this.definition,record=this._record();if(!definition||!record?.accepted||record.completed)return null;
    if(this.trackedId!==definition.id)return null;
    const remaining=definition.objectives.filter(objective=>!record.objectives[objective.id]);
    const target=this._selectedTarget();
    return {id:definition.id,name:definition.name,text:target?.label||remaining[0]?.label||'',detail:definition.id==='clock-bridge'&&!record.objectives.bridge?`绞盘齿轮 ${record.objectives.gear?'✓':'未找到'} · 牵引链 ${record.objectives.chain?'✓':'未找到'}`:'',status:'active'};
  }
  getMarkers(){
    return this.definitions.flatMap(definition=>this._targets(definition).map(target=>({id:`quest:${definition.id}:${target.objectiveId}`,type:'quest',x:target.x,y:target.y,name:target.label,label:definition.name,active:true,discovered:true,color:'#efcf83'})));
  }
  getGuide(){
    const definition=this.definition,record=this._record();if(!definition||!record?.accepted||record.completed||this.trackedId!==definition.id)return null;
    const g=this.game,p=foot(g),target=this._selectedTarget();if(!target)return null;
    if(this._routeTerrain!==g.terrain||!this._route){this._routeTerrain=g.terrain;const state=g.dungeon?.active;this._route=new NavigationRoute(g.terrain,state?{routeBackbone:(from,to)=>this._dungeonRoute(state,from,to)}:{});}
    const route=this._route.update(p,target,{radius:g.player.r+3,bodyRadius:g.player.r,profile:'ground',time:g._clock});
    return route?{...route,label:target.label,shortLabel:definition.name,target}:null;
  }
  _selectedTarget(){
    if(this._targetQuest!==this.definition?.id){this._targetQuest=this.definition?.id;this._targetId=null;}
    const targets=this._targets(),retained=targets.find(target=>target.objectiveId===this._targetId);
    if(retained)return retained;
    const p=foot(this.game),selected=targets.sort((a,b)=>distance(p,a)-distance(p,b))[0];this._targetId=selected?.objectiveId??null;return selected;
  }
  _dungeonRoute(state,from,to){
    const dungeon=this.game.dungeon,bodyRadius=this.game.player.r;
    const original=dungeon._cellAt(from.x,from.y,state);
    const attach=point=>{
      const cell=dungeon._cellAt(point.x,point.y,state);
      if(!state.authoredLayout)return cell;
      const reachable=candidate=>!state.terrain.firstBlocker(point.x,point.y,candidate.x,candidate.y,bodyRadius,'ground');
      // Room bounds can overlap a doorway or span both sides of its gate.
      // Attach to an anchor on the same physical side, never through a closed
      // shutter. This bounded scan runs only when a complete route is planned.
      if(cell&&reachable(cell))return cell;
      return [...state.cells].sort((a,b)=>distance(point,a)-distance(point,b)||a.id-b.id).find(reachable)||null;
    };
    const start=attach(from),end=attach(to);
    if(!start||!end)return null;
    const queue=[start],parents=new Map([[start.id,null]]);
    for(let i=0;i<queue.length&&!parents.has(end.id);i++)for(const next of dungeon._neighbors(queue[i],state))if(!parents.has(next.id)){parents.set(next.id,queue[i]);queue.push(next);}
    if(!parents.has(end.id))return null;
    const cells=[];for(let cell=end;cell;cell=parents.get(cell.id))cells.push(cell);cells.reverse();
    const route=start!==original?[{x:start.x,y:start.y}]:[];for(let i=1;i<cells.length;i++){const a=cells[i-1],b=cells[i];route.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2},{x:b.x,y:b.y});}
    route.push({x:to.x,y:to.y});return route;
  }
}
