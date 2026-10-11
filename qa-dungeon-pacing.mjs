import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { DUNGEON_RULES } from './dist/dungeon.js';

let seed=124257;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g._shot=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;g.companions.generation=false;return g;
}
const feet=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const resources=g=>g.gems.reduce((total,gem)=>total+gem.value,0);
const enter=(g,id='pacing-castle')=>{const site={id,door:{x:0,y:groundOffset(g.player,true)}};assert(g.dungeon.enter(site));return {site,state:g.dungeon.active};};
function kill(g,enemy){feet(g,{x:enemy.x,y:enemy.y+groundOffset(enemy)});g.dungeon.updateEnemy(enemy,0);if(enemy.affix)enemy.affix.shield=0;g._hurtEnemy(enemy,enemy.hp+1);assert(enemy.hp<=0);}

// Sampling different real seeds checks generated topology and authored room
// packs, rather than mirroring a single hand-picked example of the maze.
for(let index=0;index<48;index++){
  const g=arena(),{state}=enter(g,`castle-layout-${index}`);
  assert.equal(state.cells.length,25);assert.equal(state.cellSize,360,'art-aligned wall and cell geometry is unchanged');
  assert.equal(state.cells.reduce((sum,cell)=>sum+cell.open.length,0),48);
  assert.equal(state.distances.size,25,'all finite rooms are reachable');
  assert(state.distances.get(state.bossRoom.id)<=DUNGEON_RULES.bossDistance,'the main route cannot demand a farthest-room detour');
  assert(state.distances.get(state.bossRoom.id)>=7,'the main route still has room for a rising sequence of encounters');
  assert.equal(state.mainRoute.length,state.distances.get(state.bossRoom.id)+1);
  assert.equal(state.mainRoute[0],state.entranceId);assert.equal(state.mainRoute.at(-1),state.bossRoom.id);
  assert.equal(state.chests.length,3);
  assert(g.enemies.length>=35&&g.enemies.length<=60,'denser packs remain finite and below the outdoor mob cap');
  assert.equal(g.enemies.filter(enemy=>enemy.dungeonBoss).length,1);
  assert(g.enemies.filter(enemy=>enemy.type==='boar').length<=5);assert(g.enemies.filter(enemy=>enemy.type==='spore').length<=4,'dormant room populations respect the global special-enemy budget');
  for(const id of state.mainRoute.slice(2,-1))assert.equal(state.rooms.get(id)?.kind,'battle','every main-route room after the safe approach contains a short fight');
  for(const [id,room] of state.rooms){
    const enemies=g.enemies.filter(enemy=>enemy.dungeonRoom===id);
    assert.equal(enemies.length,room.total);
    if(room.kind!=='boss'){
      assert(enemies.length>=4&&enemies.length<=DUNGEON_RULES.maxRoomEnemies);
      assert(new Set(enemies.map(enemy=>enemy.type)).size>=2,'packs mix fodder with a small number of threats');
      assert(enemies.filter(enemy=>enemy.type==='spore').length<=1);assert(enemies.filter(enemy=>enemy.type==='boar').length<=1);
      assert(enemies.filter(enemy=>enemy.affix).length<=1);assert(!enemies.some(enemy=>enemy.affix?.id==='summoner'));
      for(const enemy of enemies)assert(enemy.xp>0&&enemy.xp<=(enemy.affix?8:5),'finite packs do not multiply skill resources with full outdoor rewards');
    }
    for(const enemy of enemies){assert(state.terrain.isFree(enemy.x,enemy.y+groundOffset(enemy),enemy.r));assert.equal(enemy.guardActive,false);}
  }
  assert(!g.enemies.some(enemy=>state.distances.get(enemy.dungeonRoom)<=1),'entrance and its approach have no immediate contact damage');
  const guidance=g.dungeon.getPacing();assert.equal(guidance.currentRoom,state.entranceId);assert.equal(guidance.remaining,0);assert.equal(guidance.next.kind,'route');
  assert.equal(g.terrain.firstBlocker(state.entrance.x,state.entrance.y,guidance.next.x,guidance.next.y,g.player.r),null,'guidance sends players through an open doorway');
}

const idle=arena(),{state:idleState}=enter(idle);const positions=idle.enemies.map(enemy=>[enemy.id,enemy.x,enemy.y]),entryHp=idle.player.hp;
for(let time=0;time<10;time+=.025)idle.update(.025);
assert.equal(idle.player.hp,entryHp);assert.deepEqual(idle.enemies.map(enemy=>[enemy.id,enemy.x,enemy.y]),positions,'unentered rooms do not all stream toward the entrance');
assert.equal(idle.gems.length,0);assert.equal(idleState.rooms.size,10);

const g=arena(),{site,state}=enter(g,'room-persistence'),room=[...state.rooms.values()].find(room=>room.kind==='battle'&&room.heal),cell=state.cells[room.cellId];
const guards=g.enemies.filter(enemy=>enemy.dungeonRoom===room.cellId),initialCount=g.enemies.length;
feet(g,cell);for(const enemy of guards)g.dungeon.updateEnemy(enemy,0);
assert(guards.every(enemy=>enemy.guardActive));assert.equal(room.started,true);
assert.equal(g.dungeon.getPacing().remaining,guards.length);
const unopened=[...state.rooms.values()].find(other=>other.kind==='battle'&&other.cellId!==room.cellId);
for(const enemy of g.enemies.filter(enemy=>enemy.dungeonRoom===unopened.cellId)){g.dungeon.updateEnemy(enemy,0);assert.equal(enemy.guardActive,false,'a neighboring but unentered pack remains asleep');}
kill(g,guards[0]);const survivor=guards[1];feet(g,{x:survivor.x,y:survivor.y+groundOffset(survivor)});g.dungeon.updateEnemy(survivor,0);if(survivor.affix)survivor.affix.shield=0;g._hurtEnemy(survivor,1);const damagedHp=survivor.hp;
feet(g,state.entrance);g.update(0);assert(g.dungeon.exit());feet(g,site.door);assert(g.dungeon.enter(site));
assert.equal(g.dungeon.active,state);assert.equal(g.enemies.length,initialCount-1);assert.equal(survivor.hp,damagedHp);assert(!g.enemies.some(enemy=>enemy.id===guards[0].id),'retreat cannot respawn an earlier kill');
assert.equal(room.cleared,false);assert.equal(room.rewarded,false);
const before=resources(g),killXp=guards.slice(1).reduce((sum,enemy)=>sum+enemy.xp,0),pickups=g.adventure.pickups.length;
for(const enemy of guards.slice(1))kill(g,enemy);
assert.equal(resources(g)-before,killXp+DUNGEON_RULES.roomCrystals,'clearing a room adds exactly one modest reward to ordinary kill drops');
assert.equal(g.adventure.pickups.length,pickups+1);assert.equal(g.adventure.pickups.at(-1).type,'herb');
assert.equal(room.cleared,true);assert.equal(room.rewarded,true);
assert.equal(g.events.filter(event=>event.type==='dungeonRoomCleared'&&event.cellId===room.cellId).length,1);
const clearedValue=resources(g),clearedPickups=g.adventure.pickups.length;g.dungeon.onEnemyKilled(guards.at(-1));
assert.equal(resources(g),clearedValue);assert.equal(g.adventure.pickups.length,clearedPickups,'duplicate kill notification cannot duplicate the clear reward');
feet(g,state.entrance);g.update(0);assert(g.dungeon.exit());feet(g,site.door);assert(g.dungeon.enter(site));
assert.equal(state.rooms.get(room.cellId),room);assert.equal(room.rewarded,true);assert(!g.enemies.some(enemy=>enemy.dungeonRoom===room.cellId));
assert.equal(resources(g),clearedValue);assert.equal(g.adventure.pickups.length,clearedPickups,'cleared rooms stay cleared after reentry');
feet(g,cell);const afterClear=g.dungeon.getPacing();assert.equal(afterClear.remaining,0);assert.equal(afterClear.clearedRooms,1);
assert.equal(g.terrain.firstBlocker(cell.x,cell.y,afterClear.next.x,afterClear.next.y,g.player.r),null,'cleared-room guidance follows the connected maze rather than pointing through walls');

// Real generated walls remain authoritative for the denser awake room, too.
const awake=g.enemies.find(enemy=>enemy.type!=='boss'),awakeCell=state.cells[awake.dungeonRoom];feet(g,awakeCell);g.dungeon.updateEnemy(awake,0);assert(awake.guardActive);
const blocked=state.cells.find(other=>g.terrain.firstBlocker(other.x,other.y,awake.x,awake.y+groundOffset(awake),0));assert(blocked);
const hp=awake.hp;assert.equal(g._hurtEnemy(awake,999,0,{x:blocked.x,y:blocked.y},'pulse'),0);assert.equal(awake.hp,hp,'room density never permits wall-piercing damage');
console.log('Dungeon pacing: bounded main route, varied finite packs, safe approach, doorway guidance, modest once-only clear rewards, retreat persistence and solid-wall damage checks passed.');
