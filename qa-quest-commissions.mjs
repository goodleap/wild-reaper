import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave } from './dist/world-save.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';
import { getConfigSection } from './dist/content-config.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
function launch(worldId,storage=memory(),debug=false){
  const save=new WorldSave({storage});
  const g=new Game({mode:'world',environment:false,debug,debugOptions:{},...(save.hasSave?save.startOptions():{worldId}),questStorage:save.questStorage});
  assert(save.attach(g));g.player.invuln=1e8;g.player.xpNext=g.crystalsNext=1e9;
  return {g,save,storage};
}
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId||!!entity.isCompanion)});
const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);g.status='playing';g.regionGrace=0;};
const record=(g,id)=>g.quests.store.record(id);
function tick(g,seconds=.25){for(let i=0;i<Math.ceil(seconds/.05);i++){g._clock+=.05;g.runTime+=.05;g.quests.update();}}
function accept(g,id){
  const board=g.quests.boards.find(board=>board.questId===id);assert(board,`${id}: board exists`);place(g,board);
  assert(g.requestInteraction(board.id),`${id}: opens real offer`);assert(!record(g,id).accepted,'opening the offer must not accept');
  g.quests.update();assert(g.quests.accept(id));tick(g);assert(record(g,id).accepted);return g.quests.commissions.points(id);
}
function request(g,id,action,p){place(g,p);const key=`quest:${id}:${action}`;assert(g.requestInteraction(key),`${key}: shipped interaction succeeds`);}
function defeat(g,id,group){
  const guards=g.quests.commissions._guards(id,group);assert(guards.length,`${id}/${group}: real guards spawned`);
  for(const enemy of guards)g._hurtEnemy(enemy,enemy.maxHp*3,0,g.player,'qa');
  assert(guards.every(enemy=>enemy.hp<=0),'actual combat damage defeats every assigned guard');tick(g);
}
function reload(state){
  assert(state.save.capture(state.g));state.g.dispose('commission-reload');return launch(state.g.worldId,state.storage,state.g.debug);
}
function route(g,from,to){
  const guide=new NavigationRoute(g.terrain).update(from,to,{radius:g.player.r+3,bodyRadius:g.player.r,profile:'ground',time:g._clock});
  assert(guide?.complete,`${g.worldId}: objective route must fully reach ${to.x},${to.y}`);return guide.path;
}
function walk(g,path,{escort=false}={}){
  let traveled=0;
  for(const to of path.slice(1))for(let n=0;n<4000;n++){
    const from=foot(g.player),dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy);if(d<.1)break;
    const step=Math.min(8,d);g._moveEntity(g.player,dx/d*step,dy/d*step,true);
    const moved=Math.hypot(foot(g.player).x-from.x,foot(g.player).y-from.y);assert(moved>.001,'actual collision movement must not stall on the guide');traveled+=moved;
    if(escort)tick(g,.05);
  }
  return traveled;
}
function checkTargets(g,id){
  const p=g.quests.commissions.points(id),start=foot(g.player);
  for(const point of Object.values(p).filter(Boolean))route(g,start,point);
}

// Rescue uses the shipped battle and interaction path. The NPC must walk the
// entire route, wait when abandoned, persist at its own position, and arrive.
let state=launch('rift-forest'),g=state.g,id='ranger-home',points=accept(g,id);checkTargets(g,id);
place(g,points.primary);assert.equal(g.requestInteraction(`quest:${id}:freed`),false,'live guards block rescue');
defeat(g,id,'primary');request(g,id,'freed',points.primary);
let actor=g.quests.commissions._actor();const rescued={x:actor.x,y:actor.y};
place(g,points.delivery);tick(g,1);assert.deepEqual({x:actor.x,y:actor.y},rescued,'abandoned escort waits instead of teleporting');assert(!record(g,id).completed);
assert.match(g.quests.getGuide().target.label,/等你/);place(g,points.primary);
const path=route(g,foot(g.player),points.delivery),midpoint=Math.max(2,Math.floor(path.length/2));
assert(walk(g,path.slice(0,midpoint),{escort:true})>100);
const beforeReload={x:actor.x,y:actor.y};state=reload(state);g=state.g;actor=g.quests.commissions._actor();assert.deepEqual({x:actor.x,y:actor.y},beforeReload,'escort saves its own position');
assert.equal(g.quests.commissions._guards(id).length,0,'defeated escort guards never respawn on reload');
points=g.quests.commissions.points(id);walk(g,route(g,foot(g.player),points.delivery),{escort:true});tick(g,8);
assert(record(g,id).completed,'walking the actual shared-follow route completes the escort');
assert(Math.hypot(foot(actor).x-points.delivery.x,foot(actor).y-points.delivery.y)<140,'escort physically arrives');
const paid={gold:g.gold,crystals:g.crystals};tick(g,1);assert.equal(g.gold,paid.gold);state=reload(state);g=state.g;
assert(record(g,id).completed);assert.equal(g.gold,paid.gold);assert.equal(g.crystals,paid.crystals);assert.equal(g.quests.accept(id),false);g.dispose();

// Medicine is a carried objective followed by a real, interruptible work site.
state=launch('marsh',memory(),true);g=state.g;id='marsh-medicine';points=accept(g,id);checkTargets(g,id);
place(g,points.primary);assert.equal(g.requestInteraction(`quest:${id}:medicine`),false);defeat(g,id,'primary');request(g,id,'medicine',points.primary);
place(g,points.secondary);assert.equal(g.requestInteraction(`quest:${id}:repair`),false,'work cannot start with the site occupied');
defeat(g,id,'secondary');request(g,id,'repair',points.secondary);tick(g,3);
assert(record(g,id).commission.repairProgress>2&&record(g,id).commission.repairProgress<4);const progress=record(g,id).commission.repairProgress;
place(g,points.delivery);tick(g,5);assert.equal(record(g,id).commission.repairProgress,progress,'walking away pauses work');
state=reload(state);g=state.g;points=g.quests.commissions.points(id);assert.equal(record(g,id).commission.repairProgress,progress,'debug campaign saves partial work');
place(g,points.secondary);tick(g,7);assert(record(g,id).completed);g.player.hp=g.player.maxHp/3;
const hp=g.player.hp;request(g,id,'heal',points.secondary);assert(g.player.hp>hp,'restored field station actually heals');
assert.equal(g.requestInteraction(`quest:${id}:heal`),false,'healing cooldown prevents rapid repeated use');
state=reload(state);g=state.g;points=g.quests.commissions.points(id);place(g,points.secondary);assert.equal(g.requestInteraction(`quest:${id}:heal`),false,'cooldown survives reload');g.dispose();

// Two destinations may be visited in either order, without resetting acquired
// cargo across saves. Payment requires returning to the actual town merchant.
state=launch('beach');g=state.g;id='coastal-cargo';points=accept(g,id);checkTargets(g,id);
const count=g.quests.commissions._guards(id).length;tick(g,1);assert.equal(g.quests.commissions._guards(id).length,count,'groups spawn once');
defeat(g,id,'secondary');request(g,id,'cargo-b',points.secondary);assert(!record(g,id).completed);
state=reload(state);g=state.g;points=g.quests.commissions.points(id);assert(record(g,id).objectives['cargo-b']);assert.equal(g.quests.commissions._guards(id,'secondary').length,0);
defeat(g,id,'primary');request(g,id,'cargo-a',points.primary);assert(!record(g,id).completed,'cargo possession alone does not deliver it');
const goldBefore=g.gold;request(g,id,'delivered',points.delivery);assert(record(g,id).completed);assert.equal(g.gold-goldBefore,55);assert.equal(g.requestInteraction(`quest:${id}:delivered`),false);
const supply=g.settlements.sites.find(site=>site.worldFacility==='supplies');place(g,supply.door);assert(g.requestInteraction(supply.id));for(let i=0;i<40&&g.sceneTransition.active;i++)g.sceneTransition.update(.05);
assert.equal(g.dungeon.active?.kind,'shop');const items=g.worldShops.getItems(supply);assert(items.every(item=>item.desc.includes('九折')));
for(const item of items)assert.equal(item.price,Math.ceil(getConfigSection('economy').shop.items.find(def=>def.id===item.id).price*.9),'actual shop price receives the earned reduction');
place(g,g.dungeon.active.merchant.interaction);assert(g.worldShops.open(supply));const shopGold=g.gold,item=items[0],inventory=g.worldShops.inventory[item.id];assert(g.worldShops.buy(supply,item.id));assert.equal(g.gold,shopGold-item.price);assert.equal(g.worldShops.inventory[item.id],inventory+1,'discount produces a real purchased supply');g.dispose();

// The optional flank changes reinforcements, while direct assault remains a
// valid alternative. Neither path can take the ledger through living guards.
for(const cutSignal of [true,false]){
  state=launch('clockshadow-city');g=state.g;id='city-signal';points=accept(g,id);checkTargets(g,id);
  if(cutSignal)request(g,id,'signal',points.secondary);
  place(g,points.primary);assert.equal(g.requestInteraction(`quest:${id}:orders`),false);tick(g,40);
  const reinforcements=g.quests.commissions._guards(id).filter(enemy=>enemy.eventId.includes('reinforcement'));
  assert.equal(reinforcements.length,cutSignal?0:6,'signal action actually removes three bounded reinforcement waves');
  defeat(g,id,'primary');request(g,id,'orders',points.primary);assert(!record(g,id).completed);
  request(g,id,'reported',points.delivery);assert(record(g,id).completed,'optional signal is not mandatory for a valid strong assault');
  const groupCount=Object.keys(record(g,id).commission.groups).length;place(g,points.primary);tick(g,40);assert.equal(Object.keys(record(g,id).commission.groups).length,groupCount);
  const paid=g.gold;state=reload(state);g=state.g;assert(record(g,id).completed);assert.equal(g.gold,paid);g.dispose();
}
console.log('Four commissions: explicit offers, real guard combat, connected walking routes, physical escort/wait, interruptible repair + healing, two cargo destinations + shop discount, optional signal + bounded reinforcements, normal/debug save and exactly-once reward passed.');
