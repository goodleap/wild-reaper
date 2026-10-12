import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DUNGEON_RULES } from './dist/dungeon.js';

let seed=572837;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const feet=(game,point)=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};
const foot=enemy=>({x:enemy.x,y:enemy.y+groundOffset(enemy)});
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});
  g.enemies=[];g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g.companions.generation=false;
  return g;
}
const site=(id,type)=>({id,type,name:type==='occupied'?'被占据的小屋':'林间小屋',door:{x:0,y:groundOffset({r:18},true)},state:'ready'});
const enter=(g,s)=>{feet(g,s.door);assert(g.dungeon.enter(s));return g.dungeon.active;};
const leave=g=>{feet(g,g.dungeon.active.entrance);assert(g.dungeon.exit());};

const supply=arena(),supplySite=site('supply-test','supply'),world={terrain:supply.terrain,adventure:supply.adventure,enemies:supply.enemies};
const hut=enter(supply,supplySite);
assert.equal(hut.kind,'hut');assert.equal(supply.sceneKind,'hut');assert.equal(hut.cells.length,1);assert(hut.cellSize<=420);assert.equal(supply.enemies.length,0);
assert(Math.hypot(supply.player.x-hut.entrance.x,supply.player.y+groundOffset(supply.player,true)-hut.entrance.y)>65,'interior landing clears the touch trigger and rearm margin');
assert(hut.props.some(prop=>prop.type==='table')&&hut.props.some(prop=>prop.type==='bed'),'a hut exposes its own room furnishing instead of a castle layout');
assert(hut.terrain.isFree(supply.player.x,supply.player.y+groundOffset(supply.player,true),supply.player.r));
const supplyChest=hut.chests[0];feet(supply,supplyChest);assert(supply.interact());
assert.equal(supply.gold,4);assert.equal(supply.crystals,12);assert.equal(supplySite.state,'spent');assert.equal(supplySite.explored,true);assert.equal(supply.adventure.pickups.length,1);
assert.equal(supply.interact(supplyChest.id),false);leave(supply);
for(const key of Object.keys(world))assert.equal(supply[key],world[key],`leaving restores world ${key} identity`);
assert.equal(enter(supply,supplySite),hut);assert.equal(hut.chests[0].state,'claimed');feet(supply,supplyChest);assert.equal(supply.interact(supplyChest.id),false);assert.equal(supply.gold,4);assert.equal(supply.crystals,12);

const battle=arena(),occupiedSite=site('occupied-test','occupied'),occupied=enter(battle,occupiedSite),chest=occupied.chests[0];
assert.equal(battle.enemies.length,4);assert(battle.enemies.every(enemy=>enemy.dungeonId===occupied.id&&!enemy.settlementId));
for(const enemy of battle.enemies)assert(Math.hypot(enemy.x-battle.player.x,foot(enemy).y-(battle.player.y+groundOffset(battle.player,true)))>125,'guards leave a safe initial approach');
feet(battle,chest);assert.equal(battle.getInteraction()?.enabled,false);assert.equal(battle.interact(),false,'the hut chest cannot be claimed before clearing its four guards');
const first=battle.enemies[0],survivor=battle.enemies[1];feet(battle,foot(first));battle._hurtEnemy(first,first.hp+1);assert(first.hp<=0);feet(battle,foot(survivor));battle._hurtEnemy(survivor,1);const remainingHp=survivor.hp;
leave(battle);assert.equal(enter(battle,occupiedSite),occupied);assert.equal(survivor.hp,remainingHp);assert.equal(battle.enemies.filter(enemy=>enemy.hp>0).length,3,'reentry does not respawn killed guards or heal survivors');
for(const enemy of battle.enemies.filter(enemy=>enemy.hp>0)){feet(battle,foot(enemy));battle._hurtEnemy(enemy,enemy.hp+1);assert(enemy.hp<=0);}
assert.equal(occupiedSite.state,'cleared');feet(battle,chest);assert(battle.interact());assert.equal(battle.gold,24);assert.equal(battle.crystals,40);assert.equal(battle.adventure.pickups.filter(p=>p.type==='herb').length,1);assert.equal(battle.adventure.pickups.filter(p=>p.type==='fury').length,1);
leave(battle);enter(battle,occupiedSite);feet(battle,chest);assert.equal(battle.interact(chest.id),false);assert.equal(battle.gold,24);assert.equal(battle.crystals,40);

const bounded=arena();for(let i=0;i<DUNGEON_RULES.maxStates;i++){enter(bounded,site(`capacity-castle-${i}`,'castle'));leave(bounded);}
assert(enter(bounded,site('capacity-hut','supply')),'the castle scene limit does not starve persistent huts');leave(bounded);
const blocked=arena(),blockedState=enter(blocked,site('blocked-chest','supply'));
const blockedChest=blockedState.chests[0];
blocked.terrain=new Terrain({obstacles:[{id:'solid',type:'log',x:0,y:blockedChest.y+25,r:12,halfLength:180,angle:0}]});blockedState.terrain=blocked.terrain;feet(blocked,{x:blockedChest.x,y:blockedChest.y+49});
assert.equal(blocked.dungeon.getInteraction(),null,'a nearby chest across a solid wall is not interactable');

// A dormant target seen through a doorway can be queried without a side
// effect, then awakened by actual damage. An adjacent hidden target cannot.
const wake=arena(),castle=enter(wake,site('wake-castle','castle'));
wake.terrain=new Terrain({obstacles:[{id:'screen',type:'log',x:90,y:0,r:12,halfLength:200,angle:Math.PI*.5}]});castle.terrain=wake.terrain;wake.enemies=[];feet(wake,{x:0,y:0});
const visible=wake._spawnEnemy('beetle'),hidden=wake._spawnEnemy('boss');
Object.assign(visible,{x:55,y:-groundOffset(visible),hp:200,maxHp:200,dungeonId:castle.id,dungeonRoom:1,guardActive:false});
Object.assign(hidden,{x:140,y:-groundOffset(hidden),hp:200,maxHp:200,dungeonId:castle.id,dungeonRoom:2,guardActive:false});
castle.rooms.set(1,{cellId:1,started:false});castle.rooms.set(2,{cellId:2,started:false});
assert(wake.dungeon.canDamage(visible));assert.equal(visible.guardActive,false);assert.equal(castle.rooms.get(1).started,false,'visibility and targeting queries never wake a pack');
assert.equal(wake.dungeon.canDamage(hidden),false);assert.equal(wake._hurtEnemy(hidden,10),0);assert.equal(hidden.guardActive,false);
assert.equal(wake._hurtEnemy(visible,10),10);assert.equal(visible.guardActive,true);assert.equal(castle.rooms.get(1).started,true);
feet(wake,{x:130,y:0});assert(wake.dungeon.canDamage(hidden));assert.equal(wake._hurtEnemy(hidden,10),10);assert.equal(hidden.guardActive,true,'a visible Boss can wake before room entry too');
// Exercise the real scheduled attack paths with the player in the other
// room. Changing only the dividing wall must change damage and waking alike.
function doorwayArena(solid,boss=false){
  const g=arena(),state=enter(g,site('attack-doorway','castle'));
  const terrain=new Terrain({obstacles:solid?[{id:'divider',type:'log',x:0,y:0,r:14,halfLength:180,angle:Math.PI/2}]:[
    {id:'upper-post',type:'log',x:0,y:-135,r:14,halfLength:45,angle:Math.PI/2},
    {id:'lower-post',type:'log',x:0,y:135,r:14,halfLength:45,angle:Math.PI/2}
  ]});
  Object.assign(state,{terrain,cols:2,rows:1,originX:-360,originY:-180,
    bounds:{minX:-360,maxX:360,minY:-180,maxY:180},
    cells:[{id:0,col:0,row:0,x:-180,y:0,open:[1]},{id:1,col:1,row:0,x:180,y:0,open:[3]}],
    entrance:{x:-330,y:150},rooms:new Map([[1,{cellId:1,kind:boss?'boss':'battle',total:1,started:false}]]),
    chests:[],treasure:null,bossRoom:null,visited:new Set([0])});
  g.terrain=terrain;g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.bullets=[];
  g.viewWidth=700;g.viewHeight=400;g.player.invuln=10;feet(g,{x:-50,y:0});
  const enemy=g._spawnEnemy(boss?'boss':'beetle',1);
  Object.assign(enemy,{x:55,y:-groundOffset(enemy),hp:10000,maxHp:10000,speed:0,dungeonId:state.id,dungeonRoom:1,dungeonHome:{x:55,y:0},guardActive:false});
  g.dungeon.update(0);assert.equal(g.dungeon._cellAt(g.player.x,g.player.y+groundOffset(g.player,true))?.id,0);
  assert.equal(g.dungeon.canDamage(enemy),!solid);assert.equal(enemy.guardActive,false,'a target query cannot wake the next room');
  return {g,enemy,room:state.rooms.get(1)};
}
for(const skill of ['arrow','pulse','lightning','storm','thorns','miasma','runes','meteor','swords','vortex'])for(const solid of [false,true]){
  const {g,enemy,room}=doorwayArena(solid,skill==='storm'||skill==='swords');
  if(skill==='storm')g._castStorm();
  else {
    if(skill==='arrow')g._shot=0;
    else if(skill==='pulse'||skill==='lightning'){g.levels[skill]=1;g[`_${skill}`]=0;}
    else {g.superSkills.owned[skill]=1;g.superSkills.cooldowns[skill]=0;}
    for(let frame=0;frame<30;frame++)g.update(.05);
  }
  assert.equal(enemy.hp<10000,!solid,`${skill}: only a visible enemy across the doorway takes damage`);
  assert.equal(enemy.guardActive,!solid,`${skill}: actual damage wakes the target, a wall-blocked attempt does not`);
  assert.equal(room.started,!solid,`${skill}: the distant room starts only after a real hit`);
  assert.equal(g.player.x,-50,'the player never enters the target room');
}
// Shield absorption is a real hit, even when it does not reduce health.
for(const solid of [false,true]){
  const {g,enemy,room}=doorwayArena(solid);assert(g.elites.promote(enemy,'shield'));
  const hp=enemy.hp,shield=enemy.affix.shield;
  assert.equal(g.dungeon.canDamage(enemy),!solid);assert.equal(enemy.guardActive,false);
  assert.equal(g._hitEnemy(enemy,10,0,g.player,'arrow'),0);assert.equal(enemy.hp,hp);
  assert.equal(enemy.affix.shield,solid?shield:shield-10,'only the unobstructed hit reaches the shield');
  assert.equal(enemy.guardActive,!solid);assert.equal(room.started,!solid,'absorbed visible hits still awaken the defender');
}
console.log('Interiors: small furnished huts, safe finite guards, single rewards, retained damage/loot, separate scene budgets, solid-wall interaction, visible dormant-target awakening and ten real attack paths through doorways and shield-hit waking passed.');
