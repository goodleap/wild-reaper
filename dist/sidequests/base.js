import { groundOffset } from '../terrain.js';
import { terrainNavigation } from '../terrain-navigation.js';
import { updateFollowMovement } from '../follow-movement.js';
import { resetLocomotion, updateLocomotion } from '../locomotion.js';
import { cleanSidequestState } from './state.js';
import { getConfigSection } from '../content-config.js';

export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const foot=actor=>({x:actor.x,y:actor.y+(Number.isFinite(actor.groundOffset)?actor.groundOffset:groundOffset(actor,!!actor.heroId||!!actor.isCompanion||!!actor.isTownNpc))});
const keyOK=key=>typeof key==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(key);
const requireKey=key=>{if(!keyOK(key))throw new TypeError(`Invalid sidequest key: ${key}`);return key;};
const MAX_ACTORS=32,MAX_PROPS=96;

export class SideQuestScene {
  constructor(host,definition){
    this.host=host;this.quests=host.quests;this.game=host.game;this.definition=definition;this.id=definition.id;
    const record=this.record;record.sidequest=cleanSidequestState(record.sidequest);this.state=record.sidequest;
    this.actors=new Map();this.props=new Map();this.points=new Map();this.gates=new Map();this._gateTerrains=new Set();this._gateSignatures=new WeakMap();
    this._bubbles=[];this._bubbleQueue=[];this._bubbleSequence=0;this._services=new Map();this._disposed=false;this._dirty=false;
  }
  get record(){return this.quests._record(this.id);}
  get accepted(){return !!this.record?.accepted;}
  get completed(){return !!this.record?.completed;}
  get terrain(){return this.game.terrain;}
  get blocksPlayerAttacks(){return false;}
  setup(){}
  update(){}
  actions(){return [];}
  targets(){return [];}
  handlesDungeon(){return false;}
  beforeEnemy(){return false;}
  canTarget(){return true;}
  beforeEnemyDamage(enemy,amount){return amount;}
  beforePlayerDamage(amount){return amount;}
  getSites(){return [];}
  changed(){this._dirty=false;this.quests._changed();}
  dirty(){this._dirty=true;this.quests.store.dirty=true;}
  mark(objective){return this.quests._objective(objective,this.id);}
  safePoint(desired,r=20,anchor=desired){
    const terrain=this.terrain,nav=terrainNavigation(terrain),valid=point=>terrain.isFree(point.x,point.y,r)&&
      this.game.environment?.isHazardFree?.(point.x,point.y,r+4)!==false;
    const connected=point=>distance(point,anchor)<.01||nav.clearSegment(anchor,point,r,'ground');
    if(valid(desired)&&connected(desired))return {...desired};
    for(const radius of [24,48,80,120,170,230,310,400])for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,point={x:desired.x+Math.cos(angle)*radius,y:desired.y+Math.sin(angle)*radius};
      if(valid(point)&&connected(point))return point;
    }
    throw new Error(`No connected sidequest placement: ${this.id} (${desired.x}, ${desired.y})`);
  }
  point(key,areaId,dx=0,dy=0,r=20){
    requireKey(key);if(this.points.has(key))return this.points.get(key);
    const area=this.terrain.island?.layout?.areas?.find(area=>area.id===areaId);
    if(!area?.center)throw new Error(`Missing sidequest area: ${this.id}/${areaId}`);
    const point=this.safePoint({x:area.center.x+dx,y:area.center.y+dy},r,area.center);this.points.set(key,point);return point;
  }
  actor(key,point,options={}){
    requireKey(key);let actor=this.actors.get(key);
    if(actor){Object.assign(actor,options);return actor;}
    if(this.actors.size>=MAX_ACTORS)throw new Error(`Too many sidequest actors: ${this.id}`);
    const {kind='merchant',name=this.definition.name,r=15,speed=280,...rest}=options,animal=['deer','otter'].includes(kind),offset=animal?12:19.8;
    const stateKey=`${this.game.dungeon?.active?'inside':'outside'}-${key}`;
    actor={id:`sidequest:${this.id}:${key}`,type:'player',sideQuestId:this.id,sideQuestKey:key,sideQuestActor:true,_sideQuestStateKey:stateKey,neutral:true,name,kind,heroId:animal?'traveler':kind,
      appearanceId:kind,r,hp:1,maxHp:1,speed,facing:Math.PI/2,groundOffset:offset,
      ...animal?{sideQuestAnimal:kind}:{isTownNpc:true,townKind:kind==='angel'?'angel':'merchant'},...rest};
    const saved=this.state.actors[stateKey],savedFoot=saved?{x:saved.x,y:saved.y+offset}:null;
    if(savedFoot&&this.terrain.isFree(savedFoot.x,savedFoot.y,r))Object.assign(actor,saved);
    else{actor.x=point.x;actor.y=point.y-offset;}
    actor.groundY=actor.y+offset;resetLocomotion(actor);this.actors.set(key,actor);return actor;
  }
  placeActor(actor,point){actor.x=point.x;actor.y=point.y-(actor.groundOffset??19.8);actor.groundY=point.y;resetLocomotion(actor);this.dirty();return actor;}
  prop(key,kind,point,options={}){
    requireKey(key);let prop=this.props.get(key);
    if(!prop){if(this.props.size>=MAX_PROPS)throw new Error(`Too many sidequest props: ${this.id}`);prop={id:`sidequest:${this.id}:${key}`,isQuest:true,kind:'questSceneProp',questArt:kind,sideQuestId:this.id,sideQuestKey:key,x:point.x,y:point.y,sortY:point.y,state:'ready'};this.props.set(key,prop);}
    Object.assign(prop,{questArt:kind,x:point.x,y:point.y,sortY:point.y},options);return prop;
  }
  action(key,point,label,onUse,options={}){
    requireKey(key);return {id:`sidequest:${this.id}:${key}`,questId:this.id,sideQuestId:this.id,action:key,category:'quest',type:'sideQuestAction',manual:true,
      x:point.x,y:point.y,label,description:'',enabled:true,range:92,touchRadius:0,...options,onUse};
  }
  move(actor,target,dt,{speed=actor.speed||280,stop=12,mode='move',animate=true}={}){
    const from=foot(actor),remaining=distance(from,target),oldX=actor.x,oldY=actor.y;
    if(remaining<=stop||dt<=0){actor.moving=false;return remaining<=stop;}
    const nav=terrainNavigation(this.terrain),point=nav.waypoint(actor,from,target,actor.r+2,'ground',this.game._clock||0,this.game._clock||0);
    if(!point){actor.moving=false;return false;}
    const dx=point.x-from.x,dy=point.y-from.y,length=Math.hypot(dx,dy),amount=Math.min(length,Math.max(0,remaining-stop),Math.max(0,speed)*dt);
    if(length>.001&&amount>0){this.game._moveEntity(actor,dx/length*amount,dy/length*amount);if(distance({x:oldX,y:oldY},actor)>.001)actor.facing=Math.atan2(actor.y-oldY,actor.x-oldX);}
    actor.groundY=foot(actor).y;actor.moveFacing=actor.facing;if(animate)updateLocomotion(actor,oldX,oldY,dt);if(distance({x:oldX,y:oldY},actor)>.001)this.dirty();
    return distance(foot(actor),target)<=stop+1;
  }
  follow(actor,target,dt,{speed=280,stop=65,start=125,hold=false}={}){
    const from=foot(actor),nav=terrainNavigation(this.terrain);
    const result=updateFollowMovement(this.game,actor,{target,from,mode:`sidequest:${this.id}`,stop,start,baseSpeed:speed,hold,
      direct:nav.clearSegment(from,target,actor.r+2,'ground'),move:(entity,time,goal)=>this.move(entity,goal,time,{speed:entity.speed,stop,animate:false})},dt);
    actor.groundY=foot(actor).y;if(result.moved>.001)this.dirty();return result;
  }
  gate(key,a,b,{open=false,r=8,kind='gate',label,...options}={}){
    requireKey(key);const x=(a.x+b.x)/2,y=(a.y+b.y)/2,length=distance(a,b),angle=Math.atan2(b.y-a.y,b.x-a.x);
    const prop=this.prop(key,kind,{x,y},{a:{...a},b:{...b},angle,width:length,radius:r,open:!!open,state:open?'open':'closed',label,...options});
    this.gates.set(key,{terrain:this.terrain,structure:{id:`sidequest:${this.id}:${key}`,type:'log',variant:'sidequest-gate',x,y,halfLength:length/2,r,angle,visual:false,navigationBarrier:true},open:!!open});
    this._syncGates(this.terrain);return prop;
  }
  _syncGates(terrain){
    const structures=[...this.gates.values()].filter(gate=>gate.terrain===terrain&&!gate.open).map(gate=>gate.structure),signature=JSON.stringify(structures);
    if(this._gateSignatures.get(terrain)===signature)return;
    this._gateSignatures.set(terrain,signature);this._gateTerrains.add(terrain);terrain.setStructures(structures,`sidequest:${this.id}`);
  }
  removeGate(key){const gate=this.gates.get(key);this.gates.delete(key);this.props.delete(key);if(gate)this._syncGates(gate.terrain);}
  _eventId(key){return `quest:${this.id}:${requireKey(key)}`;}
  alive(key){const id=this._eventId(key);return this.game.enemies.filter(enemy=>enemy.hp>0&&enemy.eventId===id);}
  groupCleared(key){return this.state.flags[`spawn-${key}`]===true&&!this.alive(key).length;}
  spawnGroup(key,point,types,options={}){
    requireKey(key);const flag=`spawn-${key}`,existing=this.alive(key);if(existing.length||this.state.flags[flag])return existing;
    const {spread=90,awake=true,bossKind,...stats}=options;
    const places=types.map((_,index)=>this.safePoint({x:point.x+Math.cos((index+.25)*Math.PI*2/types.length)*spread,y:point.y+Math.sin((index+.25)*Math.PI*2/types.length)*spread},25,point));
    const enemies=[];
    for(let index=0;index<types.length;index++){
      const enemy=this.game._spawnEnemy(types[index],1);if(!enemy)throw new Error(`Unknown sidequest enemy: ${types[index]}`);
      if(enemy.type==='boss'&&bossKind)this.game._initializeRegionalBoss(enemy,bossKind);
      for(const property of ['hp','damage','speed','xp'])if(Number.isFinite(stats[property]))enemy[property]=stats[property];
      if(Number.isFinite(stats.hp))enemy.maxHp=stats.hp;
      const spot=places[index];Object.assign(enemy,{x:spot.x,y:spot.y-groundOffset(enemy),eventId:this._eventId(key),eventRole:'questGuard',sideQuestId:this.id,guardActive:awake,huntHome:{...spot}});
      enemies.push(enemy);
    }
    this.state.flags[flag]=true;this.game._rebuildGrid?.();this.changed();return enemies;
  }
  clearGroup(key,{reset=false}={}){
    const id=this._eventId(key);this.game.enemies=this.game.enemies.filter(enemy=>enemy.eventId!==id);this.game._rebuildGrid?.();
    if(reset){delete this.state.flags[`spawn-${key}`];this.changed();}
  }
  clearEnemies(){this.game.enemies=this.game.enemies.filter(enemy=>!enemy.eventId?.startsWith(`quest:${this.id}:`));this.game._rebuildGrid?.();}
  say(actor,text,duration=4){
    if(!actor||typeof text!=='string'||!text.trim())return;
    const line={id:`sidequest:${this.id}:line:${++this._bubbleSequence}`,text:text.slice(0,96),actor,speaker:actor.name||this.definition.name,duration:Math.max(3,Math.min(12,duration))};
    if(this._bubbles.some(bubble=>bubble.actor===actor))this._bubbleQueue.push(line);else this._bubbles.push({...line,remaining:line.duration});
    if(this._bubbleQueue.length>8)this._bubbleQueue.shift();
  }
  tickDialogue(dt){
    if(!this._bubbles.length&&!this._bubbleQueue.length)return;
    for(const bubble of this._bubbles)bubble.remaining-=dt;
    this._bubbles=this._bubbles.filter(bubble=>bubble.remaining>0&&!bubble.actor.hidden);
    for(let index=0;index<this._bubbleQueue.length;){const line=this._bubbleQueue[index];if(this._bubbles.some(bubble=>bubble.actor===line.actor)){index++;continue;}this._bubbleQueue.splice(index,1);if(!line.actor.hidden)this._bubbles.push({...line,remaining:line.duration});}
  }
  getDialogue(){return this._bubbles;}
  getActors(){return [...this.actors.values()].filter(actor=>!actor.hidden&&actor.hp>0);}
  getProps(){return [...this.props.values()].filter(prop=>!prop.hidden);}
  setService(key,point,{name='休息',healing=.25,cooldown=20}={}){requireKey(key);this._services.set(key,{point,name,healing,cooldown,terrain:this.terrain});}
  canBuySupply(id,price){
    const game=this.game,economy=getConfigSection('economy'),inventory=game.worldShops?.inventory;
    return this.completed&&game.mode==='world'&&['playing','sidequest-choice'].includes(game.status)&&!game.sceneTransition?.active&&
      ['heal','magnet','fury','shield'].includes(id)&&Number.isSafeInteger(price)&&price>0&&Number.isFinite(game.gold)&&game.gold>=price&&
      Number.isSafeInteger(inventory?.[id])&&inventory[id]>=0&&inventory[id]<economy.worldShops.inventoryLimit;
  }
  buySupply(id,price){
    if(!this.canBuySupply(id,price))return false;
    const game=this.game,definition=getConfigSection('economy').shop.items.find(item=>item.id===id);
    game.gold-=price;game.worldShops.inventory[id]++;
    game._emit?.('shopBought',{itemId:id,name:definition.name,price,facilityId:`sidequest:${this.id}`,stored:true});game._scheduleWorldSave?.('purchase');return true;
  }
  serviceActions(){
    return [...this._services].filter(([,service])=>service.terrain===this.terrain).map(([key,service])=>{
      const clock=this.game.runTime||0,next=this.state.values[`service-${key}`]??-Infinity,cooling=Math.max(0,next-clock),injured=this.game.player.hp<this.game.player.maxHp;
      return this.action(`rest-${key}`,service.point,cooling>0?`${service.name} · ${Math.ceil(cooling)} 秒`:service.name,()=>{
        this.game.player.hp=Math.min(this.game.player.maxHp,this.game.player.hp+this.game.player.maxHp*service.healing);this.state.values[`service-${key}`]=clock+service.cooldown;this.changed();return true;
      },{enabled:injured&&cooling<=0,description:'在此稍作休息，恢复生命。'});
    });
  }
  checkpoint(){
    for(const [key,actor] of this.actors){if(!Number.isFinite(actor.x)||!Number.isFinite(actor.y))continue;this.state.actors[actor._sideQuestStateKey||`outside-${key}`]={x:actor.x,y:actor.y,facing:actor.facing||0};}
    if(this._dirty){this.quests.store.dirty=true;this._dirty=false;}
  }
  clearFixtures({actors=true,props=true,gates=true}={}){
    if(actors)this.actors.clear();if(props)this.props.clear();
    if(gates){for(const terrain of this._gateTerrains)terrain.setStructures([],`sidequest:${this.id}`);this.gates.clear();this._gateTerrains.clear();this._gateSignatures=new WeakMap();}
    this.points.clear();this._bubbles=[];this._bubbleQueue=[];
  }
  dispose(){this.checkpoint();this.clearFixtures();this._disposed=true;}
}
