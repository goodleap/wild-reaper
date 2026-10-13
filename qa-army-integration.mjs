import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { COMPANIONS } from './dist/companion-catalog.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { friendlyFoot, friendlyTargets, selectFriendlyTarget } from './dist/friendly-combat.js';
import { movementProfile } from './dist/height-rules.js';
function game(){return new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});}
function army(g){for(const kind of COMPANIONS)assert(g.companions.recruit(kind.id));return g.companions.members;}
function checkArrival(g,members){
 assert.equal(g.companions.members.length,5);
 for(const member of members){
  assert(g.companions.members.includes(member),'scene changes retain companion identity');
  const foot=friendlyFoot(member),p=friendlyFoot(g.player);
  assert(g.terrain.isFree(foot.x,foot.y,member.r,movementProfile(member)),`${member.kind} lands outside solids`);
  assert(Math.hypot(foot.x-p.x,foot.y-p.y)<=member.followDistance+25,`${member.kind} follows into the new scene`);
  assert(!g.terrain.firstBlocker(p.x,p.y,foot.x,foot.y,0,'sight'),`${member.kind} never spawns through an opaque wall`);
  assert.equal(member._echoes.length,0);
 }
 for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
  const a=friendlyFoot(members[i]),b=friendlyFoot(members[j]);assert(Math.hypot(a.x-b.x,a.y-b.y)>members[i].r+members[j].r,'arrival does not pile bodies together');
 }
}
const g=game();g.enemies=[];const members=army(g),ids=members.map(m=>m.id);
const door={x:g.player.x,y:g.player.y+groundOffset(g.player,true)};
assert(g.dungeon.enter({id:'army-castle',type:'castle',door}));checkArrival(g,members);
for(const member of members)member._echoes.push({life:10});
g.player.x=g.dungeon.active.entrance.x;g.player.y=g.dungeon.active.entrance.y-groundOffset(g.player,true);
assert(g.dungeon.exit());checkArrival(g,members);assert.deepEqual(g.companions.members.map(m=>m.id),ids);
assert(g.dungeon.enter({id:'army-hut',type:'supply',door}));checkArrival(g,members);
g.player.x=g.dungeon.active.entrance.x;g.player.y=g.dungeon.active.entrance.y-groundOffset(g.player,true);assert(g.dungeon.exit());checkArrival(g,members);

const closed=game();closed.enemies=[];army(closed);
assert(closed.dungeon.enter({id:'army-wall',type:'castle',door:{x:0,y:19.8}}));
closed.terrain=new Terrain({obstacles:[{id:'opaque-wall',type:'log',structureType:'castle-wall',x:70,y:0,r:12,halfLength:250,angle:Math.PI/2}]});
Object.assign(closed.dungeon.active,{terrain:closed.terrain,bounds:{minX:-500,maxX:500,minY:-500,maxY:500}});
closed.enemies=[];closed.player.x=0;closed.player.y=-19.8;
for(const member of closed.companions.members){member.x=0;member.y=-member.groundOffset;member._attack=0;}
const hidden=closed._spawnEnemy('boss');Object.assign(hidden,{x:150,y:-groundOffset(hidden),hp:10000,maxHp:10000,dungeonId:closed.dungeon.active.id,guardActive:false});
closed._rebuildGrid();closed.companions.resolve();
assert.equal(hidden.hp,10000);assert.equal(hidden.guardActive,false,'real party cannot attack or wake a wall-separated castle Boss');
assert.equal(closed.companions.members.find(m=>m.kind==='owl').scoutTarget??null,null);

const worlds=new Game();const travellers=army(worlds);worlds.enemies=worlds.enemies.filter(e=>e.portalId);
const portal=worlds.regions.portals.find(p=>p.nextRegionIndex===1);assert(worlds._switchRegion(portal));checkArrival(worlds,travellers);
const back=worlds.regions.portals.find(p=>p.nextRegionIndex===0);assert(worlds._switchRegion(back));checkArrival(worlds,travellers);

const full=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,debug:true,debugFull:true});
assert.equal(full.companions.members.length,5,'debug=full starts with the five unique companions');
assert.equal(full.rescuePower,0,'debug recruitment grants no repeatable rescue attack bonus');
const previous=friendlyTargets(full),removed=full.companions.members.find(m=>m.kind==='dog');full.companions.dismiss(removed.id);const replacement=full.companions.recruit('dog');
assert(friendlyTargets(full).includes(replacement)&&!friendlyTargets(full).includes(removed),'same-frame dismissal/recruitment refreshes shared target snapshot');
console.log('Army integration: all five companions retain identities and clear placements across castle, hut and paired worlds; real party obeys sealed-room visibility; full debug and same-frame roster refresh passed.');
