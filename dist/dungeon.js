import { Terrain, groundOffset } from './terrain.js';
import { Adventure } from './adventure.js';
import { clearBossAttacks, initBoss } from './bosses.js';
import { resetLocomotion } from './locomotion.js';
import { DungeonVision } from './dungeon-vision.js';
import { HUT_RULES, createHutState, populateHut, claimHutChest } from './hut-interior.js';

const TAU=Math.PI*2;
const DIRS=Object.freeze([{dx:0,dy:-1,opposite:2},{dx:1,dy:0,opposite:3},{dx:0,dy:1,opposite:0},{dx:-1,dy:0,opposite:1}]);
export const DUNGEON_RULES=Object.freeze({cols:5,rows:5,cellSize:360,wallRadius:14,doorWidth:180,interactRadius:74,sideChests:3,bossDistance:8,roomCrystals:6,maxRoomEnemies:6,bossGold:80,bossCrystals:100,maxStates:4});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function seedFor(value){let seed=2166136261;for(const char of String(value))seed=Math.imul(seed^char.charCodeAt(0),16777619);return seed>>>0;}
function randomFor(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
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
  _makeState(site){
    const rules=DUNGEON_RULES,cols=rules.cols,rows=rules.rows,cellSize=rules.cellSize;
    const seed=seedFor(`${this.game.regionIndex}:${site.id}:${site.seed??0}`),random=randomFor(seed);
    const originX=-cols*cellSize*.5,originY=-rows*cellSize*.5;
    const cells=Array.from({length:cols*rows},(_,id)=>({id,col:id%cols,row:Math.floor(id/cols),x:originX+(id%cols+.5)*cellSize,y:originY+(Math.floor(id/cols)+.5)*cellSize,open:[]}));
    const entranceId=(rows-1)*cols+Math.floor(cols/2),stack=[cells[entranceId]],seen=new Set([entranceId]);
    // Iterative seeded depth-first carving produces a connected perfect maze.
    while(stack.length){
      const cell=stack[stack.length-1],available=[];
      for(let i=0;i<4;i++){const d=DIRS[i],col=cell.col+d.dx,row=cell.row+d.dy;if(col>=0&&row>=0&&col<cols&&row<rows&&!seen.has(row*cols+col))available.push(i);}
      if(!available.length){stack.pop();continue;}
      const direction=available[Math.floor(random()*available.length)],d=DIRS[direction],next=cells[(cell.row+d.dy)*cols+cell.col+d.dx];
      cell.open.push(direction);next.open.push(d.opposite);seen.add(next.id);stack.push(next);
    }
    const state={id:site.id,kind:'castle',name:'旧王城迷宫',site,seed,cols,rows,cellSize,originX,originY,cells,visited:new Set([entranceId]),entranceId,
      entrance:{x:cells[entranceId].x,y:cells[entranceId].y+55},landing:{x:cells[entranceId].x,y:cells[entranceId].y-30},bounds:{minX:originX,minY:originY,maxX:originX+cols*cellSize,maxY:originY+rows*cellSize},
      bossDefeated:false,rewardClaimed:false,rewardPending:false,enemies:[],gems:[],coins:[],rooms:new Map(),adventure:null,createdAt:this.game.time};
    const distances=new Map([[entranceId,0]]),parents=new Map(),queue=[cells[entranceId]];
    for(let i=0;i<queue.length;i++)for(const next of this._neighbors(queue[i],state))if(!distances.has(next.id)){distances.set(next.id,distances.get(queue[i].id)+1);parents.set(next.id,queue[i].id);queue.push(next);}
    // Keep the finite connected maze, but put its climax on a compact route.
    // The old farthest-cell rule could require 18+ mostly empty room crossings.
    const bossDistance=Math.min(rules.bossDistance,Math.max(...distances.values())),bossCandidates=cells.filter(c=>distances.get(c.id)===bossDistance);
    state.bossRoom=bossCandidates[Math.floor(random()*bossCandidates.length)];
    state.mainRoute=[state.bossRoom.id];
    while(state.mainRoute[0]!==entranceId)state.mainRoute.unshift(parents.get(state.mainRoute[0]));
    state.treasure={id:`${site.id}:treasury`,x:state.bossRoom.x,y:state.bossRoom.y-90,r:27,state:'locked'};
    const sideRooms=cells.filter(c=>distances.get(c.id)>1&&!state.mainRoute.includes(c.id)).sort((a,b)=>(distances.get(a.id)-distances.get(b.id))||(a.open.length-b.open.length)||a.id-b.id);
    state.chests=sideRooms.slice(0,rules.sideChests).map(c=>({id:`${site.id}:chest:${c.id}`,cellId:c.id,x:c.x+68,y:c.y-45,r:21,state:'closed'}));
    const walls=[],add=(x,y,length,angle)=>{if(length<=0)return;walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'castle-wall',structureType:'castle-wall',structureId:site.id,x,y,r:rules.wallRadius,halfLength:length*.5,angle,seed:random(),sortY:y});};
    const wall=(x,y,angle,hasDoor)=>{
      if(!hasDoor){add(x,y,cellSize,angle);return;}
      const length=(cellSize-rules.doorWidth)*.5,offset=(cellSize+rules.doorWidth)*.25,dx=Math.cos(angle)*offset,dy=Math.sin(angle)*offset;
      add(x-dx,y-dy,length,angle);add(x+dx,y+dy,length,angle);
    };
    for(const cell of cells){
      // North/west edges plus the outer south/east edges avoid duplicate walls.
      wall(cell.x,cell.y-cellSize*.5,0,cell.open.includes(0));
      wall(cell.x-cellSize*.5,cell.y,Math.PI*.5,cell.open.includes(3));
      if(cell.row===rows-1)wall(cell.x,cell.y+cellSize*.5,0,false);
      if(cell.col===cols-1)wall(cell.x+cellSize*.5,cell.y,Math.PI*.5,false);
    }
    state.walls=walls;state.terrain=new Terrain({obstacles:walls,region:'ruins',seed});
    state.distances=distances;return state;
  }
  _snapshotWorld(site){
    const g=this.game,c=g.companions;
    return {terrain:g.terrain,adventure:g.adventure,environment:g.environment,encounters:g.encounters,enemies:g.enemies,gems:g.gems,coins:g.coins,
      portal:g.portal,regionGrace:g.regionGrace,regionTransition:g.regionTransition,sceneKind:g.sceneKind,returnPoint:{...this._playerFoot()},door:{...this._door(site)},
      spawn:g._spawn,superPending:g.superSkills?.pending,companionCamp:c?.camp,companionGeneration:c?.generation,companionNextAt:c?.nextAt,enteredClock:g._clock};
  }
  _clearScene(){
    const g=this.game;g.attacks?.clearTrails();g.bullets=[];g.enemyBullets=[];g.effects=[];g.orbitals=[];g.storm=null;g._pulseEchoes=[];g._grid.clear();
    g.superSkills?.clearScene();g.barrier?.clearScene();
    if(g.companions?.active)g.companions.active._echoes=[];
    // No old warning may resolve at an unrelated position after a boundary.
    for(const enemy of g.enemies){enemy.charge=null;enemy.cast=null;enemy._chargeSegment=null;enemy.slam=null;clearBossAttacks(enemy);enemy._navTimer=0;enemy._navObstacle=null;}
  }
  _placePlayer(point){
    const g=this.game,p=g.player;p.x=point.x;p.y=point.y-groundOffset(p,true);g._moveEntity(p,0,0,true);p.invuln=Math.max(p.invuln,2);p.hurtFlash=0;resetLocomotion(p);
    const active=g.companions?.active;
    if(active){active.x=p.x;active.y=p.y;g.companions._resetFollowing?.(active);g.companions._safeReturn?.(active);}
  }
  _populate(state){
    const g=this.game,random=randomFor(state.seed^0x59B730D1),difficulty=1+Math.min(15,state.createdAt/120)*.32;
    const roomIds=[...state.mainRoute.slice(2,-1),...state.chests.map(chest=>chest.cellId)],specialCounts={boar:0,spore:0};
    const packs=[['slime','slime','beetle','bat'],['beetle','slime','beetle','slime','spore'],['slime','beetle','slime','beetle','boar'],['beetle','slime','beetle','brute','spore'],['slime','beetle','beetle','slime','boar','spore']];
    for(const [index,id] of roomIds.entries()){
      const cell=state.cells[id],route=state.distances.get(id),side=!state.mainRoute.includes(id);
      const types=side?['beetle','slime','beetle',route>4?'boar':'bat']:packs[Math.min(packs.length-1,Math.max(0,route-2))];
      const room={cellId:id,kind:side?'treasure':'battle',total:types.length,started:false,cleared:false,rewarded:false,heal:!side&&(index+1)%3===0};
      state.rooms.set(id,room);
      const rotation=random()*TAU;
      for(const [i,archetype] of types.entries()){
        const type=(archetype==='boar'&&specialCounts.boar>=5)||(archetype==='spore'&&specialCounts.spore>=4)?'bat':archetype;
        if(type in specialCounts)specialCounts[type]++;
        const angle=rotation+i/types.length*TAU,radius=72+(i%2)*20,enemy=g._spawnEnemy(type,1);
        enemy.dungeonId=state.id;enemy.dungeonRoom=id;enemy.dungeonHome={x:cell.x+Math.cos(angle)*radius,y:cell.y+Math.sin(angle)*radius};enemy.guardActive=false;
        // Group encounters replace lonely, tougher guards. Per-enemy rewards
        // stay modest; the clear reward is finite and belongs to the room.
        enemy.hp*=1.05;enemy.maxHp=enemy.hp;enemy.xp=Math.max(3,Math.min(5,Math.round(enemy.xp*.7)));
        enemy.x=enemy.dungeonHome.x;enemy.y=enemy.dungeonHome.y-groundOffset(enemy);enemy._navTimer=0;g._moveEntity(enemy,0,0);
        // At most one authored shield/fast guard in a late room. Summoners
        // cannot turn this finite scene into an unlimited resource farm.
        if(route>5&&i===0&&random()<.3)g.elites?.promote(enemy,random()<.5?'shield':'swift');
      }
    }
    state.rooms.set(state.bossRoom.id,{cellId:state.bossRoom.id,kind:'boss',total:1,started:false,cleared:false,rewarded:false,heal:false});
    const boss=g._spawnEnemy('boss',1);boss.dungeonId=state.id;boss.dungeonRoom=state.bossRoom.id;boss.dungeonBoss=true;boss.name='旧王城守卫';
    boss.bossIndex=state.seed%2?2:1;initBoss(boss);
    boss.hp=boss.maxHp=(g.easy?2100:2800)*difficulty;boss.damage=(g.easy?18:25)*(1+state.createdAt/600);boss.speed=g.easy?44:49;boss.xp=180+Math.floor(state.createdAt/10);
    boss.dungeonHome={x:state.bossRoom.x,y:state.bossRoom.y+20};boss.x=boss.dungeonHome.x;boss.y=boss.dungeonHome.y-groundOffset(boss);boss.guardActive=false;boss._navTimer=0;g._moveEntity(boss,0,0);
    state.bossId=boss.id;state.enemies=g.enemies;
  }
  enter(site){
    const g=this.game;
    if(!site||!site.id||this.active||g.status!=='playing'||!this._near(this._door(site),site.interactRadius||100)||g.enemies.some(e=>e.type==='boss'&&e.hp>0&&e.guardActive!==false))return false;
    const kind=site.type==='supply'||site.type==='occupied'?'hut':'castle';
    if(site.type&&!['supply','occupied','castle'].includes(site.type))return false;
    let state=this.states.get(site.id);
    if(!state){
      const count=[...this.states.values()].filter(existing=>(existing.kind||'castle')===kind).length;
      if(count>=(kind==='hut'?HUT_RULES.maxStates:DUNGEON_RULES.maxStates))return false;
      state=kind==='hut'?createHutState(g,site,seedFor(`${g.regionIndex}:${site.id}:${site.seed??0}`)):this._makeState(site);this.states.set(site.id,state);
    }
    this._world=this._snapshotWorld(site);
    const furyTime=g.adventure?.furyTime||0,magnetTime=g.adventure?.magnetTime||0;
    this._clearScene();if(g.superSkills)g.superSkills.pending=null;this.active=state;g.sceneKind=state.kind;g.terrain=state.terrain;g.enemies=state.enemies;g.gems=state.gems;g.coins=state.coins;g.portal=null;g.environment=null;g.encounters=null;
    g.regionGrace=2;g.regionTransition={life:.7,maxLife:.7,name:state.name,from:g.region.id,to:state.kind};
    if(!state.adventure)state.adventure=new Adventure(g,{generation:false});
    g.adventure=state.adventure;g.adventure.furyTime=furyTime;g.adventure.magnetTime=magnetTime;
    if(g.companions){g.companions.camp=null;g.companions.generation=false;}
    this._placePlayer(state.landing||state.entrance);
    if(!state.populated){state.populated=true;if(state.kind==='hut')populateHut(g,state);else this._populate(state);}
    this._clearScene();g._refreshStats();g._refreshWeapons();this.update(0);
    g._emit('dungeonEnter',{name:state.name,revisit:state.visited.size>1});return true;
  }
  _saveScene(){const state=this.active,g=this.game;if(!state)return;state.enemies=g.enemies;state.gems=g.gems;state.coins=g.coins;state.adventure=g.adventure;}
  _returnPoint(world){
    const g=this.game,p=g.player,safe=q=>g.terrain.isFree(q.x,q.y,p.r+4)&&g.environment?.isHazardFree?.(q.x,q.y,p.r)!==false;
    for(const point of [world.returnPoint,world.door])if(safe(point))return point;
    for(const radius of [35,60,95,135,180])for(let i=0;i<16;i++){const a=i*TAU/16,q={x:world.door.x+Math.cos(a)*radius,y:world.door.y+Math.sin(a)*radius};if(safe(q))return q;}
    return world.returnPoint;
  }
  exit(){
    const g=this.game,state=this.active,world=this._world;
    if(!state||!world||g.status!=='playing')return false;
    // Only the entrance or the claimed treasury is an exit; this is not a
    // combat teleport that can bypass the route back while the Boss lives.
    if(!this._near(state.entrance,95)&&!(state.treasure&&state.rewardClaimed&&this._near(state.treasure,95)))return false;
    const furyTime=g.adventure?.furyTime||0,magnetTime=g.adventure?.magnetTime||0;
    this._clearScene();this._saveScene();
    Object.assign(g,{terrain:world.terrain,adventure:world.adventure,environment:world.environment,encounters:world.encounters,enemies:world.enemies,gems:world.gems,coins:world.coins,portal:world.portal,sceneKind:world.sceneKind,_spawn:world.spawn});
    if(g.adventure){g.adventure.furyTime=furyTime;g.adventure.magnetTime=magnetTime;}
    if(g.superSkills)g.superSkills.pending=world.superPending??null;
    if(g.companions){g.companions.camp=world.companionCamp;g.companions.generation=world.companionGeneration;g.companions.nextAt=Math.max(world.companionNextAt??0,g.companions.nextAt??0);}
    this.active=null;this._world=null;g.regionGrace=Math.max(2,world.regionGrace||0);g.regionTransition={life:.7,maxLife:.7,name:g.region.name,from:state.kind,to:g.region.id};
    this._clearScene();this._placePlayer(this._returnPoint(world));g._refreshStats();g._refreshWeapons();g._emit('dungeonExit',{name:state.name,cleared:state.rewardClaimed});return true;
  }
  getInteraction(){
    const g=this.game,state=this.active;if(!state||g.status!=='playing')return null;
    if(this._near(state.entrance,95)&&this.vision.isVisible(state.entrance))return {id:`${state.id}:exit`,type:'dungeonExit',label:'返回荒野',description:'保留探索与战斗进度',...state.entrance,enabled:true};
    if(state.treasure&&this._near(state.treasure)&&this.vision.isVisible(state.treasure.x,state.treasure.y)){
      if(state.treasure.state==='unlocked')return {id:state.treasure.id,type:'castleTreasure',label:'开启王城宝藏',description:'超级技能 · 80 金币 · 100 灵晶',x:state.treasure.x,y:state.treasure.y,enabled:true};
      if(state.rewardClaimed)return {id:`${state.id}:treasury-exit`,type:'dungeonExit',label:'携宝返回荒野',x:state.treasure.x,y:state.treasure.y,enabled:true};
    }
    const chest=state.chests.find(c=>c.state==='closed'&&this._near(c,62)&&this.vision.isVisible(c.x,c.y));
    if(chest){const guarded=g.enemies.some(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===chest.cellId);return {id:chest.id,type:'dungeonChest',label:guarded?'清理房间守卫':state.kind==='hut'?'打开小屋补给':'打开古堡宝箱',description:guarded?'击败本房间守卫后开启':'金币、灵晶与恢复补给',x:chest.x,y:chest.y,enabled:!guarded};}
    return null;
  }
  interact(id){
    const state=this.active,g=this.game,choice=this.getInteraction();if(!state||!choice||!choice.enabled||choice.id!==id)return false;
    if(choice.type==='dungeonExit')return this.exit();
    if(choice.type==='dungeonChest'){
      const chest=state.chests.find(c=>c.id===id);if(!chest||chest.state!=='closed')return false;
      if(state.kind==='hut')return claimHutChest(g,state,chest);
      chest.state='claimed';g.grantResources({gold:12,crystals:24},'castleSideChest');g.adventure?.dropPickup('herb',chest.x,chest.y+28);g._effect(chest.x,chest.y,'ring',.7,65,'#edca85');g._emit('dungeonChest');return true;
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
    g.grantResources({gold:DUNGEON_RULES.bossGold,crystals:DUNGEON_RULES.bossCrystals},'castleBoss');g._effect(state.treasure.x,state.treasure.y,'ring',1.1,130,'#f4d688');g._emit('dungeonCleared',{name:state.name});return true;
  }
  onEnemyKilled(enemy){
    const state=this.active;if(!state||enemy.dungeonId!==state.id||enemy.hp>0)return false;
    if(enemy.dungeonBoss&&!state.bossDefeated){state.bossDefeated=true;state.treasure.state='unlocked';this.game._emit('dungeonBossKill');this.game._effect(state.treasure.x,state.treasure.y,'ring',1.1,110,'#f4d688');}
    const room=state.rooms.get(enemy.dungeonRoom);
    if(room&&!room.cleared&&!this.game.enemies.some(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===room.cellId)){
      room.cleared=true;
      if(state.kind==='hut'){
        room.rewarded=true;state.site.state='cleared';this.game._emit('houseCleared',{name:state.name});
      }else if(room.kind!=='boss'&&!room.rewarded){
        room.rewarded=true;const cell=state.cells[room.cellId],g=this.game;
        g.dropCrystals(cell.x,cell.y,DUNGEON_RULES.roomCrystals);
        if(room.heal)g.adventure?.dropPickup('herb',cell.x,cell.y+28);
        g._effect(cell.x,cell.y,'ring',.7,75,'#b9e4c4');g._emit('dungeonRoomCleared',{cellId:room.cellId,crystals:DUNGEON_RULES.roomCrystals,heal:room.heal});
      }
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
    enemy.guardActive=room?!!(playerCell?.id===room.cellId||(room.started&&visible)):!!(sameRoom||visible);
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
  getMap(){
    const state=this.active;if(!state)return null;const p=this._playerFoot(),known=point=>this.vision.isExplored(point.x,point.y);
    const landmarks=[{id:`${state.id}:exit`,type:'exit',name:'荒野出口',...state.entrance,state:'active',completed:false}];
    for(const chest of state.chests)if(known(chest))landmarks.push({...chest,type:'chest',name:state.kind==='hut'?'小屋补给':'古堡宝箱',completed:chest.state==='claimed'});
    if(state.treasure&&known(state.treasure))landmarks.push({...state.treasure,type:'chest',name:'王城宝藏',completed:state.rewardClaimed});
    if(state.bossDiscovered&&state.bossRoom)landmarks.push({id:`${state.id}:boss`,type:'boss',name:'旧王城守卫',x:state.bossRoom.x,y:state.bossRoom.y,state:state.bossDefeated?'cleared':'active',completed:state.bossDefeated});
    return {kind:state.kind,cols:state.cols,rows:state.rows,cellSize:state.cellSize,originX:state.originX,originY:state.originY,bounds:state.bounds,
      cells:state.cells.map(c=>{const revealed=state.visited.has(c.id);return {...c,open:revealed?c.open:[],revealed,roomKind:revealed?state.rooms.get(c.id)?.kind:undefined,cleared:revealed&&(state.rooms.get(c.id)?.cleared??false)};}),playerCell:this._cellAt(p.x,p.y)?.id??state.entranceId,player:p,
      entrance:state.entranceId,boss:state.bossDiscovered?state.bossRoom?.id:null,bossDefeated:!!state.bossDiscovered&&state.bossDefeated,
      chests:state.chests.filter(known).map(c=>({cellId:c.cellId,state:c.state})),treasure:state.treasure&&known(state.treasure)?state.treasure.state:null,
      walls:this.vision.knownWallSegments(),explored:this.vision.getExploredRects(),landmarks:landmarks.filter(known)};
  }
  getPacing(){
    const state=this.active;if(!state)return null;
    const p=this._playerFoot(),cell=this._cellAt(p.x,p.y)||state.cells[state.entranceId],room=state.rooms.get(cell.id);
    const remaining=room?this.game.enemies.filter(e=>e.hp>0&&e.dungeonId===state.id&&e.dungeonRoom===cell.id&&this.vision.isVisible(foot(e))).length:0;
    const battleRooms=[...state.rooms.values()].filter(r=>r.kind!=='boss'&&state.visited.has(r.cellId)),chest=state.chests.find(c=>c.cellId===cell.id&&c.state==='closed'&&this.vision.isExplored(c.x,c.y));let next;
    if(state.kind==='hut'){
      next=remaining?{x:cell.x,y:cell.y,kind:'battle',label:`清理屋内守卫 ${room.total-remaining}/${room.total}`}:
        chest?{x:chest.x,y:chest.y,kind:'treasure',label:'领取小屋补给'}:{...state.entrance,kind:'route',label:'返回荒野'};
    }else if(state.bossDefeated&&this.vision.isExplored(state.treasure.x,state.treasure.y))next={...state.treasure,kind:'treasure',label:state.rewardClaimed?'携宝返回荒野':'领取王城宝藏'};
    else if(remaining)next={x:cell.x,y:cell.y,kind:room.kind,label:room.kind==='boss'?'击败旧王城守卫':`清理守卫 ${room.total-remaining}/${room.total}`};
    else if(chest)next={x:chest.x,y:chest.y,kind:'treasure',label:'打开古堡宝箱'};
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
