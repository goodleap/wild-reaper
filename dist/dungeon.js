import { groundOffset } from './terrain.js';
import { enemyGroupProvoked } from './combat-tactics.js';
import { Adventure } from './adventure.js';
import { clearBossAttacks } from './bosses.js';
import { clearSceneActors, placeScenePlayer } from './scene-actors.js';
import { DungeonVision } from './dungeon-vision.js';
import { interiorSceneFor } from './sites/interior-scenes.js';
import { featureForSite } from './world-sites.js';
import { DUNGEON_RULES, interiorRewardFor } from './interior-profiles.js';
import { createCastleState, populateCastle } from './sites/castle-interior.js';
import { settlementType } from './site-definitions.js';
export { DUNGEON_RULES } from './interior-profiles.js';

const DIRS=Object.freeze([{dx:0,dy:-1,opposite:2},{dx:1,dy:0,opposite:3},{dx:0,dy:1,opposite:0},{dx:-1,dy:0,opposite:1}]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Actors expose body coordinates, while plain spell/field points are already
// on the ground. An explicit projection keeps projectile visuals independent
// of collision geometry and never feeds an undefined radius into an offset.
const foot=entity=>({x:entity.x,y:Number.isFinite(entity.groundY)?entity.groundY:entity.y+
  (Number.isFinite(entity.r)&&(entity.type||entity.heroId||entity.isCompanion)?groundOffset(entity,!!entity.isCompanion||!!entity.heroId):0)});

// A castle owns one finite scene. The same object is retained on retreat:
// rooms, surviving guards, opened chests and the treasury cannot be rerolled.
export class Dungeon {
  constructor(game){this.game=game;this.active=null;this.states=new Map();this._world=null;this.vision=new DungeonVision(this);}
  _playerFoot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _door(site){return site.door||{x:site.interactionX??site.x,y:site.interactionY??site.y};}
  _near(point,r=DUNGEON_RULES.interactRadius){return distance(this._playerFoot(),point)<=r;}
  _cellAt(x,y,state=this.active){
    if(!state)return null;
    const col=Math.floor((x-state.originX)/state.cellSize),row=Math.floor((y-state.originY)/state.cellSize);
    return col<0||row<0||col>=state.cols||row>=state.rows?null:state.cells[row*state.cols+col];
  }
  _neighbors(cell,state){return cell.open.map(direction=>{const d=DIRS[direction];return state.cells[(cell.row+d.dy)*state.cols+cell.col+d.dx];});}
  _makeState(site){return createCastleState(this,site);}
  _snapshotWorld(site){
    const g=this.game,c=g.companions;
    return {terrain:g.terrain,adventure:g.adventure,environment:g.environment,encounters:g.encounters,enemies:g.enemies,gems:g.gems,coins:g.coins,
      portal:g.portal,regionGrace:g.regionGrace,regionTransition:g.regionTransition,sceneKind:g.sceneKind,returnPoint:{...this._playerFoot()},door:{...this._door(site)},
      spawn:g._spawn,superPending:g.superSkills?.pending,companionCamps:c?.camps,companionGeneration:c?.generation,companionNextAt:c?.nextAt,enteredClock:g._clock};
  }
  _clearScene(){
    clearSceneActors(this.game);
  }
  _placePlayer(point,arrival=null){
    placeScenePlayer(this.game,point,arrival);
  }
  _populate(state){return populateCastle(this,state);}
  enter(site){
    const g=this.game;
    if(!site||!site.id||this.active||g.status!=='playing'||!this._near(this._door(site),site.interactRadius||100))return false;
    const definition=site.type?settlementType(site):settlementType('castle'),kind=site.riftCave?'cave':definition?.interior,scene=interiorSceneFor(kind);
    if(!kind||!scene)return false;
    let state=this.states.get(site.id);
    if(!state){
      const count=[...this.states.values()].filter(existing=>(existing.kind||'castle')===kind).length;
      if(count>=scene.maxStates)return false;
      state=site.riftCave?g.riftExploration.createCaveState(this,site):scene.create(this,site);this.states.set(site.id,state);
    }
    this._world=this._snapshotWorld(site);
    const furyTime=g.adventure?.furyTime||0,magnetTime=g.adventure?.magnetTime||0;
    this._clearScene();if(g.superSkills)g.superSkills.pending=null;this.active=state;g.sceneKind=state.kind;g.terrain=state.terrain;g.enemies=state.enemies;g.gems=state.gems;g.coins=state.coins;g.portal=null;g.environment=null;g.encounters=null;
    g.regionGrace=2;g.regionTransition={life:.7,maxLife:.7,name:state.name,from:g.region.id,to:state.kind};
    if(!state.adventure)state.adventure=new Adventure(g,{generation:false});
    g.adventure=state.adventure;g.adventure.furyTime=furyTime;g.adventure.magnetTime=magnetTime;
    if(g.companions){g.companions.camps=[];g.companions.generation=false;}
    const caveEntry=state.riftExits?.find(exit=>exit.key===site.entryKey);
    if(caveEntry){const d=caveEntry.direction;this._placePlayer({x:caveEntry.x+d.x*90,y:caveEntry.y+d.y*90},{doorway:caveEntry,direction:d});}
    else this._placePlayer(state.landing||state.entrance,{doorway:state.entrance,direction:{x:0,y:-1}});
    if(!state.populated){state.populated=true;interiorSceneFor(state).populate(this,state);if(state.kind==='cave'){const boss=g.enemies.find(e=>e.id===state.bossId);if(boss)boss.name='暗河守卫';}}
    this._clearScene();g._refreshStats();g._refreshWeapons();this.update(0);
    g.quests?.onDungeonEnter(state,site);
    g._emit('dungeonEnter',{name:state.name,revisit:state.visited.size>1});return true;
  }
  _saveScene(){const state=this.active,g=this.game;if(!state)return;state.enemies=g.enemies;state.gems=g.gems;state.coins=g.coins;state.adventure=g.adventure;}
  _returnPoint(world){
    const g=this.game,p=g.player,door=world.door,clearance=p.r+4;
    const safe=q=>g.terrain.isFree(q.x,q.y,clearance)&&!g.terrain.firstBlocker(door.x,door.y,q.x,q.y,clearance)&&
      g.environment?.isHazardFree?.(q.x,q.y,clearance)!==false&&
      !g.environment?.props?.some(prop=>prop.state!=='spent'&&distance(prop,q)<(prop.blastRadius||82)+clearance);
    // Return on the open front apron, independent of where an earlier manual
    // interaction happened. The reserved doorway remains the close fallback.
    for(const forward of [52,72,32,96,120])for(const side of [0,-28,28,-56,56]){
      const point={x:door.x+side,y:door.y+forward};if(safe(point))return point;
    }
    if(safe(door))return door;
    for(const radius of [135,180])for(let i=0;i<=8;i++){const a=i*Math.PI/8,q={x:door.x+Math.cos(a)*radius,y:door.y+Math.sin(a)*radius};if(safe(q))return q;}
    return world.returnPoint;
  }
  exit(exitId=null){
    const g=this.game,state=this.active,world=this._world;
    if(!state||!world||g.status!=='playing')return false;
    // Only the entrance or the claimed treasury is an exit; this is not a
    // combat teleport that can bypass the route back while the Boss lives.
    const caveExit=state.riftExits?.find(exit=>(!exitId||exit.id===exitId)&&this._near(exit,95));
    if(state.riftExits&&!caveExit)return false;
    if(!caveExit&&!this._near(state.entrance,95)&&!(state.treasure&&state.rewardClaimed&&this._near(state.treasure,95)))return false;
    if(caveExit){world.door={...state.surfaceExits[caveExit.key]};world.returnPoint={...world.door};}
    const furyTime=g.adventure?.furyTime||0,magnetTime=g.adventure?.magnetTime||0;
    this._clearScene();this._saveScene();
    Object.assign(g,{terrain:world.terrain,adventure:world.adventure,environment:world.environment,encounters:world.encounters,enemies:world.enemies,gems:world.gems,coins:world.coins,portal:world.portal,sceneKind:world.sceneKind,_spawn:world.spawn});
    if(g.adventure){g.adventure.furyTime=furyTime;g.adventure.magnetTime=magnetTime;}
    if(g.superSkills)g.superSkills.pending=world.superPending??null;
    if(g.companions){g.companions.camps=world.companionCamps||(world.companionCamp?[world.companionCamp]:[]);g.companions.generation=world.companionGeneration;g.companions.nextAt=Math.max(world.companionNextAt??0,g.companions.nextAt??0);}
    this.active=null;this._world=null;g.regionGrace=Math.max(2,world.regionGrace||0);g.regionTransition={life:.7,maxLife:.7,name:g.stage?.sceneName||g.region.name,from:state.kind,to:g.region.id};
    this._clearScene();this._placePlayer(this._returnPoint(world),{doorway:world.door,direction:{x:0,y:1}});g._refreshStats();g._refreshWeapons();g.quests?.onDungeonExit(state,caveExit);g._emit('dungeonExit',{name:state.name,cleared:state.rewardClaimed});return true;
  }
  getInteraction(){
    const g=this.game,state=this.active;if(!state||g.status!=='playing')return null;
    for(const exit of state.riftExits||[])if(this._near(exit,95)&&this.vision.isVisible(exit.x,exit.y))return {id:exit.id,type:'dungeonExit',label:exit.name,description:'保留洞穴探索与战斗进度',x:exit.x,y:exit.y,enabled:true};
    if(!state.riftExits&&this._near(state.entrance,95)&&this.vision.isVisible(state.entrance))return {id:`${state.id}:exit`,type:'dungeonExit',label:'返回荒野',description:'保留探索与战斗进度',...state.entrance,enabled:true};
    if(state.treasure&&this._near(state.treasure)&&this.vision.isVisible(state.treasure.x,state.treasure.y)){
      if(state.treasure.state==='unlocked'){const reward=interiorRewardFor(state.site);return {id:state.treasure.id,type:'castleTreasure',label:`开启${state.treasureName||'王城宝藏'}`,description:`超级技能 · ${reward.gold} 金币 · ${reward.crystals} 灵晶`,x:state.treasure.x,y:state.treasure.y,enabled:true};}
      if(state.rewardClaimed&&!state.riftExits)return {id:`${state.id}:treasury-exit`,type:'dungeonExit',label:'携宝返回荒野',x:state.treasure.x,y:state.treasure.y,enabled:true};
    }
    const chest=state.chests.find(c=>c.state==='closed'&&this._near(c,62)&&this.vision.isVisible(c.x,c.y));
    if(chest){const guarded=g.enemies.some(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===chest.cellId),questLabel=g.quests?.chestLabel(state,chest);return {id:chest.id,type:'dungeonChest',label:guarded?'清理房间守卫':questLabel||(state.kind==='hut'?`打开${state.treasureName||'小屋补给'}`:state.kind==='cave'?'打开洞窟宝箱':'打开古堡宝箱'),description:guarded?'击败本房间守卫后开启':questLabel?'任务零件与屋内补给':'金币、灵晶与恢复补给',x:chest.x,y:chest.y,enabled:!guarded};}
    return null;
  }
  interact(id){
    const state=this.active,g=this.game,choice=this.getInteraction();if(!state||!choice||!choice.enabled||choice.id!==id)return false;
    if(choice.type==='dungeonExit')return this.exit(choice.id);
    if(choice.type==='dungeonChest'){
      const chest=state.chests.find(c=>c.id===id);if(!chest||chest.state!=='closed')return false;
      const claimed=interiorSceneFor(state).claimChest(this,state,chest);
      if(claimed)g.quests?.onChestClaimed(state,chest);return claimed;
    }
    if(choice.type==='castleTreasure'){
      if(!state.bossDefeated||state.rewardClaimed||state.rewardPending||!g.superSkills)return false;
      g.superSkills.offer('castle',g.region.id);
      if(!g.superSkills.getChoices().length)return false;
      state.rewardPending=true;state.treasure.state='choosing';g.status='super';g._emit('superChoice',{source:'castle'});return true;
    }
    return false;
  }
  completeReward(){
    const g=this.game,state=this.active;
    if(!state||!state.rewardPending||state.rewardClaimed||!state.bossDefeated||g.superSkills?.pending)return false;
    state.rewardPending=false;state.rewardClaimed=true;state.treasure.state='claimed';state.site.state='cleared';state.site.explored=true;
    const reward=interiorRewardFor(state.site);
    g.grantResources(reward,'castleBoss');g._effect(state.treasure.x,state.treasure.y,'ring',1.1,130,'#f4d688');g._emit('dungeonCleared',{name:state.name,treasureName:state.treasureName,reward});return true;
  }
  onEnemyKilled(enemy){
    const state=this.active;if(!state||enemy.dungeonId!==state.id||enemy.hp>0)return false;
    if(enemy.dungeonBoss&&!state.bossDefeated){state.bossDefeated=true;state.treasure.state='unlocked';this.game._emit('dungeonBossKill');this.game._effect(state.treasure.x,state.treasure.y,'ring',1.1,110,'#f4d688');}
    const room=state.rooms.get(enemy.dungeonRoom);
    if(room&&!room.cleared&&!this.game.enemies.some(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===room.cellId)){
      room.cleared=true;
      interiorSceneFor(state).roomCleared(this,state,room);
    }
    return true;
  }
  canDamage(enemy,origin=this.game.player){
    if(!this.active||enemy.dungeonId!==this.active.id)return true;
    const a=origin===this.game.player?this._playerFoot():foot(origin),b=foot(enemy);
    return this.vision.isVisible(b.x,b.y,enemy.r||0)&&!this.game.terrain.firstBlocker(a.x,a.y,b.x,b.y,0,'sight');
  }
  awaken(enemy){
    const state=this.active;if(!state||enemy.dungeonId!==state.id)return false;
    const room=state.rooms.get(enemy.dungeonRoom);if(room)room.started=true;
    enemy.guardActive=true;return true;
  }
  updateEnemy(enemy,dt){
    const state=this.active;if(!state||enemy.dungeonId!==state.id)return false;
    const g=this.game,p=this._playerFoot(),point=foot(enemy),cell=this._cellAt(point.x,point.y),playerCell=this._cellAt(p.x,p.y);
    const sameRoom=cell&&playerCell&&cell.id===playerCell.id,room=state.rooms.get(enemy.dungeonRoom);
    const visible=this.vision.isVisible(point.x,point.y,enemy.r||0)&&!g.terrain.firstBlocker(p.x,p.y,point.x,point.y,0,'sight');
    if(room&&playerCell?.id===room.cellId)room.started=true;
    // Crossing a doorway or actually taking damage wakes one pack. Merely
    // querying a sleeping target through an open door never starts combat.
    // A started pack can pursue briefly, then walks home on a genuine retreat.
    enemy.guardActive=enemyGroupProvoked(g,enemy,enemy.dungeonHome,420)||(room?!!(playerCell?.id===room.cellId||(room.started&&visible)):!!(sameRoom||visible));
    if(!enemy.guardActive){enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;enemy.slam=null;clearBossAttacks(enemy);if(enemy.dungeonHome&&distance(point,enemy.dungeonHome)>6)g._moveEnemy(enemy,dt,enemy.dungeonHome);return true;}
    return false;
  }
  update(dt){
    const g=this.game,state=this.active;if(!state||g.status!=='playing')return;
    const p=this._playerFoot(),cell=this._cellAt(p.x,p.y);
    if(cell)state.visited.add(cell.id);
    // Collision normally keeps everyone inside. Clamp provides an independent
    // finite boundary even if an injected displacement crosses an outer wall.
    const margin=g.player.r+DUNGEON_RULES.wallRadius+1,b=state.bounds;
    const x=Math.max(b.minX+margin,Math.min(b.maxX-margin,p.x)),y=Math.max(b.minY+margin,Math.min(b.maxY-margin,p.y));
    if(x!==p.x||y!==p.y)this._placePlayer({x,y});
    this.vision.update();
    const boss=g.enemies.find(enemy=>enemy.dungeonBoss&&enemy.dungeonId===state.id);
    if(boss&&this.vision.isVisible(foot(boss)))state.bossDiscovered=true;
    this._saveScene();
  }
  getMap({revealMarkers=false}={}){
    const state=this.active;if(!state)return null;const p=this._playerFoot(),known=point=>this.vision.isExplored(point.x,point.y);
    const markable=point=>revealMarkers||known(point);
    const landmarks=state.riftExits?state.riftExits.map(exit=>({...exit,type:'exit',state:'active',completed:false})):[{id:`${state.id}:exit`,type:'exit',name:'荒野出口',...state.entrance,state:'active',completed:false}];
    for(const chest of state.chests)if(markable(chest))landmarks.push({...chest,type:'chest',name:state.kind==='hut'?'小屋补给':state.kind==='cave'?'洞窟宝箱':'古堡宝箱',completed:chest.state==='claimed'});
    if(state.treasure&&markable(state.treasure))landmarks.push({...state.treasure,type:'chest',name:state.treasureName||'王城宝藏',completed:state.rewardClaimed});
    if((state.bossDiscovered||revealMarkers)&&state.bossRoom)landmarks.push({id:`${state.id}:boss`,type:'boss',name:state.kind==='cave'?'暗河守卫':featureForSite(state.site)?.bossName||'旧王城守卫',x:state.bossRoom.x,y:state.bossRoom.y,state:state.bossDefeated?'cleared':'active',completed:state.bossDefeated});
    return {kind:state.kind,cols:state.cols,rows:state.rows,cellSize:state.cellSize,originX:state.originX,originY:state.originY,bounds:state.bounds,
      cells:state.cells.map(c=>{const revealed=state.visited.has(c.id);return {...c,open:revealed?c.open:[],revealed,roomKind:revealed?state.rooms.get(c.id)?.kind:undefined,cleared:revealed&&(state.rooms.get(c.id)?.cleared??false)};}),playerCell:this._cellAt(p.x,p.y)?.id??state.entranceId,player:p,
      entrance:state.entranceId,boss:state.bossDiscovered?state.bossRoom?.id:null,bossDefeated:!!state.bossDiscovered&&state.bossDefeated,
      chests:state.chests.filter(known).map(c=>({cellId:c.cellId,state:c.state})),treasure:state.treasure&&known(state.treasure)?state.treasure.state:null,
      walls:this.vision.knownWallSegments(),explored:this.vision.getExploredRects(),landmarks:landmarks.filter(markable)};
  }
  getPacing(){
    const state=this.active;if(!state)return null;
    const p=this._playerFoot(),cell=this._cellAt(p.x,p.y)||state.cells[state.entranceId],room=state.rooms.get(cell.id);
    const remaining=room?this.game.enemies.filter(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===cell.id&&this.vision.isVisible(foot(e))).length:0;
    const battleRooms=[...state.rooms.values()].filter(r=>r.kind!=='boss'&&state.visited.has(r.cellId)),chest=state.chests.find(c=>c.cellId===cell.id&&c.state==='closed'&&this.vision.isExplored(c.x,c.y));let next;
    if(state.kind==='hut'){
      next=remaining?{x:cell.x,y:cell.y,kind:'battle',label:`清理屋内守卫 ${room.total-remaining}/${room.total}`}:
        chest?{x:chest.x,y:chest.y,kind:'treasure',label:`领取${state.treasureName||'小屋补给'}`}:{...state.entrance,kind:'route',label:'返回荒野'};
    }else if(state.bossDefeated&&this.vision.isExplored(state.treasure.x,state.treasure.y))next={...state.treasure,kind:'treasure',label:state.rewardClaimed?(state.kind==='cave'?'遗藏已领取 · 寻找洞口':'携宝返回荒野'):`领取${state.treasureName||'王城宝藏'}`};
    else if(remaining)next={x:cell.x,y:cell.y,kind:room.kind,label:room.kind==='boss'?`击败${state.kind==='cave'?'暗河守卫':featureForSite(state.site)?.bossName||'旧王城守卫'}`:`清理守卫 ${room.total-remaining}/${room.total}`};
    else if(chest)next={x:chest.x,y:chest.y,kind:'treasure',label:state.kind==='cave'?'打开洞窟宝箱':'打开古堡宝箱'};
    else{
      // Search only already visited rooms for a frontier. The old shortest
      // route to the hidden Boss disclosed the correct maze branch in advance.
      const queue=[cell],parents=new Map([[cell.id,null]]);let frontier=null;
      for(let i=0;i<queue.length&&!frontier;i++)for(const neighbor of this._neighbors(queue[i],state)){
        const doorway={x:(queue[i].x+neighbor.x)*.5,y:(queue[i].y+neighbor.y)*.5};
        if(!this.vision.isExplored(doorway.x,doorway.y))continue;
        if(!state.visited.has(neighbor.id)){frontier={from:queue[i],to:neighbor,doorway};break;}
        if(!parents.has(neighbor.id)){parents.set(neighbor.id,queue[i].id);queue.push(neighbor);}
      }
      if(frontier){
        let id=frontier.from.id;
        while(parents.get(id)!==cell.id&&parents.get(id)!==null&&parents.has(id))id=parents.get(id);
        const point=frontier.from.id===cell.id?frontier.doorway:state.cells[id];next={x:point.x,y:point.y,kind:'route',label:'探索前方通道'};
      }else next={x:cell.x,y:cell.y,kind:'route',label:'探索房间与入口'};
    }
    return {currentRoom:cell.id,remaining,total:room?.total||0,clearedRooms:battleRooms.filter(r=>r.cleared).length,combatRooms:battleRooms.length,next,bossDistance:state.bossDiscovered?state.distances.get(state.bossRoom.id):null};
  }
  resetRegion(){if(this.active)return false;this.states=new Map();this._world=null;return true;}
}
