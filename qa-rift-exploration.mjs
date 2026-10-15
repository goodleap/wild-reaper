import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { portalObstacles, portalDoor } from './dist/portal-geometry.js';
import { ENVIRONMENT_BALANCE } from './dist/environment.js';
import { REGIONAL_MECHANISM_RULES } from './dist/regional-mechanisms.js';

for(const dungeonId of ['survival','ship','moon']){const expedition=new Game({mode:'dungeon',dungeonId});assert.equal(expedition.riftExploration.sites.length,0,'the temporary constructor terrain cannot leak forest landmarks into expeditions');}
const safeWorld=new Game({mode:'world'}),camp=safeWorld.terrain.island.layout.spawn,environment=safeWorld.environment,mushrooms=[],vines=[];
for(let x=Math.floor(camp.x/520)-1;x<=Math.floor(camp.x/520)+4;x++)for(let y=Math.floor(camp.y/520)-2;y<=Math.floor(camp.y/520)+3;y++){mushrooms.push(...environment._mushroomsAt(x,y,{ignoreObjectives:true}));const vine=environment.mechanisms._candidate(x,y);if(vine)vines.push(vine);}
assert(mushrooms.length>0&&vines.length>0,'the safety check still permits actual surrounding hazards');
for(const mushroom of mushrooms)assert(Math.hypot(mushroom.x-camp.x,mushroom.y-camp.y)>=ENVIRONMENT_BALANCE.safeRadius+mushroom.blastRadius,'explosive reach stays outside the relocated camp safety circle');
for(const vine of vines)assert(Math.hypot(vine.x-camp.x,vine.y-camp.y)>=REGIONAL_MECHANISM_RULES.safeRadius+vine.r,'generated vines keep the original safety distance from the new camp');
assert.equal(environment.mechanisms.props.some(vine=>vine.id==='vine:-6,3'),false,'the previously generated vine beside the starting angel is excluded');
assert.equal(safeWorld.adventure.spawnTreasure(camp.x,camp.y),null,'a guarded treasure cannot be generated in the reserved camp');
const g=new Game({mode:'world',environment:false});
const put=(point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);g.regionGrace=0;};
const finish=()=>{for(let i=0;i<30&&g.sceneTransition.active;i++)g.sceneTransition.update(.05);assert.equal(g.sceneTransition.active,false);assert.equal(g.sceneTransition.commitSucceeded,true);};
const request=id=>{assert.equal(g.requestInteraction(id),true,`request ${id}`);finish();};
assert.equal(g.terrain.island.layout.kind,'rift-forest');
const exploration=g.riftExploration,layout=exploration.layout;
assert.equal(layout.areas.length,18);
assert.deepEqual(g.regions.portals.map(p=>p.nextRegionIndex).sort(),[1,2,3]);
assert(g.regions.portals.every(p=>p.natural&&p.state==='active'&&portalObstacles(p).length===0),'authored exits are open paths without gate foundations');
assert.equal(g.enemies.filter(e=>e.portalId).length,0,'natural routes do not manufacture portal guardians');
assert.equal(g.enemies.filter(e=>e.worldBoss).length,2,'the two open arenas contain actual existing Boss encounters');
const guards=g.territories.groups.filter(group=>group.kind==='guard');assert.equal(guards.length,4);assert(guards.every(group=>group.members.filter(e=>e.affix).length===1),'each authored junction has exactly one existing elite');
const eliteCount=g.enemies.filter(e=>e.affix).length,candidate=g.enemies.find(e=>g.elites._eligible(e));assert(candidate);assert.equal(g.elites.promote(candidate,'shield'),false,'normal runtime promotions retain their lower global cap');assert.equal(g.elites.promote(candidate,'shield',{authoredCap:guards.length}),false,'the authored allowance cannot add more elites after the four reserved junctions');assert.equal(g.enemies.filter(e=>e.affix).length,eliteCount);

const chest=exploration.sites.find(s=>s.key==='treasure07');
put(chest);const before={gold:g.gold,crystals:g.crystals};
assert.equal(g.interact(chest.id),true);assert.equal(chest.state,'claimed');
assert(g.gold>before.gold||g.crystals>before.crystals,'a found chest grants the existing resources');
assert.equal(exploration.interact(chest.id),false,'a fixed treasure cannot be claimed twice');

const gate=exploration.sites.find(s=>s.kind==='shortcut'),north=layout.landmarks.shortcut13;
const dx=north.x-gate.x,dy=north.y-gate.y,n=Math.hypot(dx,dy);
put({x:gate.x-dx/n*76,y:gate.y-dy/n*76});
assert.equal(exploration.getInteraction()?.enabled,false,'the lower approach cannot release the northern lock');
assert.equal(exploration.interact(gate.id),false);
put({x:gate.x+dx/n*76,y:gate.y+dy/n*76});
assert.equal(g.interact(gate.id),true);assert.equal(gate.open,true);
assert.equal(g.terrain.riftGateOpen?.('bell-shortcut'),true);

const cave05=exploration.sites.find(s=>s.key==='cave05'),cave15=exploration.sites.find(s=>s.key==='cave15');
put(cave05);request(cave05.id);
const cave=g.dungeon.active;assert.equal(cave.kind,'cave');assert.equal(cave.riftExits.length,2);
assert(cave.enemies.length>8&&cave.chests.length>0,'the underground is a playable guarded maze with rewards');
const a=g.dungeon._cellAt(cave.riftExits[0].x,cave.riftExits[0].y,cave),b=g.dungeon._cellAt(cave.riftExits[1].x,cave.riftExits[1].y,cave);
const queue=[a],distances=new Map([[a.id,0]]);
for(let i=0;i<queue.length;i++)for(const next of g.dungeon._neighbors(queue[i],cave))if(!distances.has(next.id)){distances.set(next.id,distances.get(queue[i].id)+1);queue.push(next);}
assert(distances.get(b.id)>=5,'the opposite opening requires traversing the underground');
assert.equal(queue.length,cave.cells.length,'all underground rooms are connected');
const retained=cave.enemies[0];retained.hp-=1;const hp=retained.hp;
put(cave.riftExits[1]);g.dungeon.update(0);request(cave.riftExits[1].id);
assert.equal(g.dungeon.active,null);assert(Math.hypot(g.player.x-cave15.x,g.player.y+groundOffset(g.player,true)-cave15.y)<150,'the second cave mouth returns at the other surface region');
assert.equal(g.touchInteractions.update(),false,'arrival does not immediately re-enter the cave');
put(cave15);request(cave15.id);assert.equal(g.dungeon.active,cave);assert.equal(retained.hp,hp);
put(cave.riftExits[0]);g.dungeon.update(0);request(cave.riftExits[0].id);
assert(Math.hypot(g.player.x-cave05.x,g.player.y+groundOffset(g.player,true)-cave05.y)<150);

// Real scene transitions through the northern path keep the entire finite
// forest state, and the paired destination remains reachable on return.
assert(g.companions.recruit('owl'));assert(g.companions.recruit('stormcaller'));
for(const target of [1,2,3]){
  const out=g.regions.portals.find(p=>p.nextRegionIndex===target);put(portalDoor(out));request(out.id);
  assert.equal(g.regionIndex,target);const back=g.regions.portals.find(p=>p.nextRegionIndex===0);assert(back&&back.state==='active');
  put(portalDoor(back));request(back.id);assert.equal(g.regionIndex,0);
  assert.equal(g.riftExploration,exploration);assert.equal(chest.state,'claimed');assert.equal(gate.open,true);
  assert.equal(g.terrain.riftGateOpen?.('bell-shortcut'),true);assert.equal(g.dungeon.states.get(cave.id),cave);
  assert.equal(g.touchInteractions.update(),false,'a world arrival does not bounce back');
  assert(g.terrain.isFree(g.player.x,g.player.y+groundOffset(g.player,true),g.player.r),'each natural route returns to walkable ground');
  for(const member of g.companions.members)assert(Math.hypot(member.x-g.player.x,member.y-g.player.y)<190,'companions arrive beside each corresponding path');
}
console.log('Rift exploration: three natural world paths, two field bosses, finite treasure, one-sided persistent shortcut, traversable two-mouth cave, retained underground damage and scene-transition return latches passed.');
