import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { NavigationRoute } from './dist/navigation-route.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId)});
const place=(game,point)=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);game.dungeon.update(0);};
const game=new Game({mode:'world',worldId:'rift-forest',adventure:false,environment:false,encounters:false,companions:false,settlements:true});
game._shot=game._pulse=game._lightning=Infinity;game.player.xpNext=game.crystalsNext=Infinity;
game.viewWidth=800;game.viewHeight=650;
let steps=0,targets=0;

function route(start,target,label){
  const state=game.dungeon.active;
  const navigation=new NavigationRoute(game.terrain,{routeBackbone:(from,to)=>game.quests._dungeonRoute(state,from,to)});
  const result=navigation.update(start,target,{radius:game.player.r+3,bodyRadius:game.player.r,profile:'ground'}),path=result?.path;
  assert.ok(result?.complete&&path?.length,`${label}: the actual interior guide finds a complete route`);
  assert.ok(distance(path.at(-1),target)<.05,`${label}: the path reaches the actual target`);
  let from=start,length=0;
  for(const point of path){
    assert.ok(!game.terrain.firstBlocker(from.x,from.y,point.x,point.y,game.player.r),`${label}: full-body sweep clears the path`);
    assert.ok(game.terrain.isFree(point.x,point.y,game.player.r),`${label}: waypoint is clear`);
    length+=distance(from,point);from=point;
  }
  return {path,length};
}
function walk(target,label){
  for(const point of route(foot(game.player),target,label).path){
    for(let i=0;distance(foot(game.player),point)>.02&&i<1000;i++){
      const before=foot(game.player),remaining=distance(before,point),travel=Math.min(20,remaining);
      game._moveEntity(game.player,(point.x-before.x)/remaining*travel,(point.y-before.y)/remaining*travel,true);
      const after=foot(game.player);
      assert.ok(distance(before,after)>.001,`${label}: movement advances`);
      assert.ok(game.terrain.isFree(after.x,after.y,game.player.r),`${label}: movement never enters a wall or furnishing`);steps++;
    }
    assert.ok(distance(foot(game.player),point)<.03,`${label}: movement reaches each turn`);
  }
  game.dungeon.update(0);targets++;
}
function enterSite(site){
  place(game,site.door);assert.ok(game.dungeon.enter(site),'the actual site enters its interior');
  game.touchInteractions.update();return game.dungeon.active;
}
function enterCave(mouth){
  place(game,mouth);assert.ok(game.riftExploration.interact(mouth.id),'the actual surface cave enters its shared interior');
  game.touchInteractions.update();return game.dungeon.active;
}
function strike(enemy,amount){place(game,foot(enemy));assert.ok(game._hurtEnemy(enemy,amount)>0,'an unobstructed attack reaches the authored guard');}
function claimChest(state,chest){
  place(game,chest);
  if(game.enemies.some(enemy=>enemy.hp>0&&enemy.dungeonRoom===chest.cellId))assert.equal(game.getInteraction()?.enabled,false,'living room guards protect the chest');
  for(const enemy of [...game.enemies])if(enemy.hp>0&&enemy.dungeonRoom===chest.cellId)strike(enemy,enemy.hp*100+1);
  place(game,chest);assert.ok(game.interact(chest.id),'the cleared chest is claimable');
  assert.equal(chest.state,'claimed');
  const balance={gold:game.gold,crystals:game.crystals};
  assert.equal(game.interact(chest.id),false,'a claimed chest cannot pay again');
  assert.deepEqual({gold:game.gold,crystals:game.crystals},balance);
}
function checkGuideAnchors(state){
  const clearance=game.player.r+3;
  for(const cell of state.cells){
    assert.ok(game.terrain.isFree(cell.x,cell.y,clearance),'each authored room and corridor anchor has guide clearance');
    for(const next of game.dungeon._neighbors(cell,state))if(next.id>cell.id){
      assert.ok(game.terrain.isFree((cell.x+next.x)/2,(cell.y+next.y)/2,clearance),'an available guide connection never targets a wall or furnishing');
    }
  }
}
function openShortcut(state){
  assert.equal(state.mechanisms.length,1);
  const mechanism=state.mechanisms[0],gate=state.gates.find(item=>item.id===mechanism.gateId);
  assert.ok(gate,'the mechanism owns an actual collision gate');
  assert.equal(mechanism.opened,false);assert.equal(game.terrain.isFree(gate.x,gate.y,game.player.r),false);
  const nx=-Math.sin(gate.angle),ny=Math.cos(gate.angle),side=Math.sign((mechanism.x-gate.x)*nx+(mechanism.y-gate.y)*ny)||1;
  const across={x:gate.x-nx*side*90,y:gate.y-ny*side*90};
  assert.ok(game.terrain.isFree(across.x,across.y,game.player.r),'the opposite approach has full player clearance');
  // Stand beside the control, within its ordinary touch range, looking
  // through the gate rather than through an adjoining solid wall corner.
  const controlApproach={x:mechanism.x-Math.cos(gate.angle)*24,y:mechanism.y-Math.sin(gate.angle)*24};
  walk(controlApproach,'shortcut control');
  const vision=game.dungeon.vision,closedRoute=route(foot(game.player),across,'closed-gate detour').length;
  assert.equal(vision.isVisible(across),false,'the closed gate hides the opposite approach');
  assert.ok(vision.knownWallSegments(gate.id).length>0,'the closed gate is remembered on the map');
  const explored=vision.getExploredRects().map(rect=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2}));
  const known=vision.knownWallSegments().filter(piece=>!piece.id.startsWith(gate.id+':')).map(piece=>piece.id);
  const revision=game.terrain.structureRevision,before=foot(game.player),rebuilds=vision.stats.rebuilds;
  assert.equal(game.getInteraction()?.id,mechanism.id);
  assert.ok(game.touchInteractions.update(),'ordinary contact activates the mechanism');
  assert.ok(mechanism.opened);assert.ok(game.terrain.structureRevision>revision);
  assert.deepEqual(foot(game.player),before,'opening the gate does not move the player');
  assert.ok(vision.stats.rebuilds>rebuilds,'stationary vision rebuilds after collision changes');
  assert.ok(vision.isVisible(across),'the same-position LOS query is refreshed immediately');
  assert.equal(vision.knownWallSegments(gate.id).length,0,'the removed gate leaves no stale remembered wall');
  for(const point of explored)assert.ok(vision.isExplored(point.x,point.y),'gate opening retains previously explored floor');
  const knownAfter=new Set(vision.knownWallSegments().map(piece=>piece.id));
  for(const id of known)assert.ok(knownAfter.has(id),'unchanged remembered walls survive the revision');
  assert.ok(game.terrain.isFree(gate.x,gate.y,game.player.r),'the opened gap allows the complete body');
  checkGuideAnchors(state);
  const openRoute=route(before,across,'open shortcut').length;
  assert.ok(openRoute+150<closedRoute,'the opened gate provides a materially shorter real walking route');
  assert.equal(game.interact(mechanism.id),false,'the mechanism can only activate once');
  walk(across,'opened shortcut crossing');
  return {mechanism,closedRoute:Math.round(closedRoute),openRoute:Math.round(openRoute)};
}
function inspectAuthored(state){
  assert.ok(state.authoredLayout,'the selected site uses the authored sample');
  assert.ok(game.terrain===state.terrain,'collision and active scene share one terrain');
  assert.ok(game.enemies===state.enemies,'authored guards are live scene entities');
  checkGuideAnchors(state);
  const boss=game.enemies.find(enemy=>enemy.id===state.bossId);
  assert.ok(boss?.dungeonBoss);assert.ok(game.terrain.isFree(foot(boss).x,foot(boss).y,boss.r),'the Boss fits its actual spawn');
  const goals=[...state.chests,...state.mechanisms,foot(boss),state.treasure,...(state.riftExits||[state.entrance])];
  for(const [i,target]of goals.entries())walk(target,`${state.kind} objective ${i}`);
  assert.equal(state.mechanisms[0].opened,false,'all objectives and exits are reachable before opening the shortcut');
  const shortcut=openShortcut(state),chest=state.chests[0];
  const survivor=game.enemies.find(enemy=>!enemy.dungeonBoss&&enemy.dungeonRoom!==chest.cellId);
  assert.ok(survivor);strike(survivor,1);const survivorHp=survivor.hp;
  claimChest(state,chest);
  return {state,boss,chest,survivor,survivorHp,...shortcut};
}
function retained(record){
  const {state,chest,survivor,survivorHp,mechanism}=record;
  assert.ok(game.dungeon.active===state,'reentry preserves the same authored scene');
  assert.ok(game.enemies.includes(survivor)&&survivor.hp===survivorHp,'surviving enemies retain their damage');
  assert.equal(chest.state,'claimed');assert.ok(mechanism.opened);
  assert.ok(game.terrain.isFree(state.gates[0].x,state.gates[0].y,game.player.r),'the shortcut remains physically open after reentry');
  place(game,chest);const balance={gold:game.gold,crystals:game.crystals};
  assert.equal(game.interact(chest.id),false);assert.deepEqual({gold:game.gold,crystals:game.crystals},balance);
}

const worldTerrain=game.terrain,mouths=game.riftExploration.sites.filter(site=>site.kind==='cave'&&site.caveId==='underground-passage');
assert.equal(mouths.length,2);
const cave=enterCave(mouths[0]);assert.equal(cave.kind,'cave');assert.equal(cave.riftExits.length,2);
const caveRecord=inspectAuthored(cave);
const farExit=cave.riftExits.find(exit=>exit.key===mouths[1].key);assert.ok(farExit);
walk(farExit,'second cave exit');assert.ok(game.dungeon.exit(farExit.id));
assert.ok(game.terrain===worldTerrain);assert.ok(distance(foot(game.player),mouths[1])<160,'the other underground opening returns to its own surface mouth');
assert.ok(enterCave(mouths[1])===cave,'both mouths share one interior instance');retained(caveRecord);
const nearExit=cave.riftExits.find(exit=>exit.key===mouths[0].key);
walk(nearExit,'original cave exit');assert.ok(game.dungeon.exit(nearExit.id));
assert.ok(distance(foot(game.player),mouths[0])<160);

const castleSite=game.settlements.sites.find(site=>site.type==='castle'&&site.region==='rift-forest');
assert.ok(castleSite,'the forest exposes its actual castle entrance');
const castle=enterSite(castleSite);assert.equal(castle.kind,'castle');
const castleRecord=inspectAuthored(castle);walk(castle.entrance,'castle retreat');assert.ok(game.dungeon.exit());
assert.ok(game.terrain===worldTerrain);enterSite(castleSite);retained(castleRecord);
strike(castleRecord.boss,castleRecord.boss.hp*100+1);assert.ok(castle.bossDefeated);assert.equal(castle.treasure.state,'unlocked');
place(game,castle.treasure);assert.ok(game.interact(castle.treasure.id));assert.equal(game.status,'super');
assert.ok(game.chooseSuper(game.getSuperChoices()[0].id));assert.ok(castle.rewardClaimed);
const rewardBalance={gold:game.gold,crystals:game.crystals};assert.equal(game.dungeon.completeReward(),false);
assert.deepEqual({gold:game.gold,crystals:game.crystals},rewardBalance,'the final treasury cannot pay twice');
walk(castle.entrance,'castle exit');assert.ok(game.dungeon.exit());

const hutSite=game.settlements.sites.find(site=>site.type==='supply');assert.ok(hutSite);
const hut=enterSite(hutSite);assert.equal(hut.kind,'hut');
const furnishings=hut.props.filter(prop=>prop.footprint);assert.ok(furnishings.length>=2,'the small hut contains usable furnishings');
for(const prop of furnishings)assert.equal(game.terrain.isFree(prop.x,prop.y+(prop.footprint.offsetY||0),0),false,'furniture blocks its painted floor footprint');
walk(hut.chests[0],'hut supplies');assert.ok(game.interact(hut.chests[0].id));
const hutBalance={gold:game.gold,crystals:game.crystals};walk(hut.entrance,'hut doorway');assert.ok(game.dungeon.exit());
assert.ok(enterSite(hutSite)===hut);place(game,hut.chests[0]);assert.equal(game.interact(hut.chests[0].id),false);
assert.deepEqual({gold:game.gold,crystals:game.crystals},hutBalance,'hut supplies remain claimed on return');

console.log(JSON.stringify({authoredInteriors:'passed',samples:3,targets,steps,shortcuts:[caveRecord,castleRecord].map(({closedRoute,openRoute})=>({closedRoute,openRoute}))}));
