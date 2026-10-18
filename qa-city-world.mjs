import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { WORLD_IDS, worldForId, worldNeighbors } from './dist/world-definitions.js';
import { createRiftLayout } from './dist/worlds/rift-layout.js';
import { validateWorlds } from './dist/config-validation/worlds.js';
import { worldArchiveHTML } from './dist/world-archive.js';

const sections=Object.fromEntries(['worlds','stages','geography','enemies','encounters','economy'].map(id=>[id,JSON.parse(readFileSync(new URL(`./dist/config/${id}.json`,import.meta.url)))]));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.deepEqual(WORLD_IDS,['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift','clockshadow-city','ember-realm-large']);
assert.equal(digest(sections.worlds.definitions.slice(0,9)),'ee9da7fa416564219527b75690d9606ff786479d1307aedba72aafefb4edd2ad','all nine existing complete world definitions remain unchanged');
assert.equal(layoutStyle(), 'clockshadow-renewed', 'only the authored city opts into its renewed art');
function layoutStyle(){return sections.worlds.definitions.find(w=>w.id==='clockshadow-city').authored.artStyle;}
assert.equal(digest(sections.worlds.connections),'d552ca4f4ec835d24603a2cf5a2578ebe6d737a7ce5426177655e08712f89980','existing connections remain byte-for-value unchanged');
assert.deepEqual(worldNeighbors(9),[],'the new city has an independent world selection');
assert(validateWorlds(sections));
const layout=createRiftLayout('clockshadow-city');
assert.equal(layout.id,'clockshadow-city:1');assert.equal(layout.artTheme,'city');
assert.equal(layout.bounds.maxX-layout.bounds.minX,14400);assert.equal(layout.bounds.maxY-layout.bounds.minY,10800);
assert.equal(createRiftLayout('clockshadow-city'),layout);assert.notEqual(layout,createRiftLayout('verdant-rift'));
assert(layout.cityStructures.length>100,'the city is built from populated street blocks and complete structural modules');
for(const kind of ['house','keep','wall','tower','gate','cathedral'])assert(layout.cityStructures.some(s=>s.cityKind===kind),`the city includes authored ${kind} modules`);
assert.equal(layout.encounters.filter(e=>e.kind==='boss').length,2,'two existing open bosses occupy their own city areas');
assert.match(worldArchiveHTML({selectedId:'clockshadow-city'}),/世界选择[\s\S]*街巷、城门、石桥[\s\S]*没有跨世界出口/);
const reject=(edit,label)=>{const bad=structuredClone(sections),map=bad.worlds.definitions.find(w=>w.id==='clockshadow-city').authored;edit(map);assert.throws(()=>validateWorlds(bad),undefined,label);};
reject(map=>map.worldId='city','the new city cannot share the saved identity of the existing city');
reject(map=>map.artTheme='unknown','unregistered painting themes are rejected');
reject(map=>delete map.cityStructures,'a city layout requires its authored building modules');
reject(map=>map.cityStructures[0].cityKind='unknown','unknown building modules are rejected');
reject(map=>map.cityStructures[0].width=Infinity,'building dimensions must remain finite');
reject(map=>map.cityStructures[0].width=0,'buildings cannot have an empty collision footprint');
reject(map=>map.cityStructures[0].solid='yes','collision flags must be explicit booleans');
reject(map=>map.cityStructures[0].area='missing','building modules belong to a real area');
reject(map=>map.cityStructures[0].style=-1,'visual styles remain bounded');
reject(map=>map.cityStructures.push({...map.cityStructures[0]}),'building IDs remain unique');
reject(map=>map.cityStructures[0].x=map.bounds.maxX,'the complete building footprint stays inside the world');

const old=new Game({mode:'world',environment:false}),game=new Game({mode:'world',worldId:'clockshadow-city',environment:false});
assert.equal(game.mapId,9);assert.equal(game.worldId,'clockshadow-city');assert.equal(game.startWorldId,'clockshadow-city');
assert.equal(game.debug,false);assert.equal(game.debugOptions.fastMovement,false);assert.equal(game.player.speed,old.player.speed);
assert.equal(game.region.danger,worldForId('city').danger,'the authored city reuses city combat settings');
assert.deepEqual(game.region.enemyWeights,worldForId('city').enemyWeights,'enemy weights reuse the existing city values');
assert.equal(game.terrain.island.layout,layout);assert.equal(game.regions.portals.length,0);assert.equal(game.regions.states.size,0);
assert.equal(game.territories.groups.length,layout.encounters.length,'every authored encounter creates a finite population');
assert.equal(game.enemies.filter(e=>e.worldBoss).length,2);
const tower=game.settlements.sites.find(s=>s.featureId==='belltower');assert(tower,'the new map reuses the existing city bell-tower interaction');
assert(game.terrain.isFree(tower.door.x,tower.door.y,24),'the real bell-tower door retains full-body standing room');
assert(!layout.cityStructures.some(s=>s.solid&&Math.abs(s.x-tower.x)<(s.width+tower.width)/2&&Math.abs(s.y-tower.y)<(s.depth+tower.depth)/2),'the functional bell tower does not overlap a baked building');
assert(game.terrain.isFree(game.player.x,game.player.y+groundOffset(game.player,true),game.player.r));
for(const site of game.riftExploration.sites){assert(site.id.startsWith('rift:clockshadow-city:'));assert.equal(site.artTheme,'city');}
assert(!old.riftExploration.sites.some(s=>s.artTheme==='city'),'forest landmarks retain their original style');
const put=p=>{game.player.x=p.x;game.player.y=p.y-groundOffset(game.player,true);game.regionGrace=0;};
const finish=()=>{for(let i=0;i<30&&game.sceneTransition.active;i++)game.sceneTransition.update(.05);assert.equal(game.sceneTransition.active,false);assert.equal(game.sceneTransition.commitSucceeded,true);};
const request=id=>{assert.equal(game.requestInteraction(id),true,`request ${id}`);finish();};
// These transaction checks isolate objectives from fighting. Browser gameplay
// and navigation QA retain normal enemy populations separately.
game.enemies=[];
const chest=game.riftExploration.sites.find(s=>s.kind==='chest');assert(chest);put(chest);
const gold=game.gold;assert(game.riftExploration.interact(chest.id));assert.equal(chest.state,'claimed');assert(game.gold>gold);
assert.equal(game.riftExploration.interact(chest.id),false,'a claimed city chest cannot grant the reward again');
assert(old.riftExploration.sites.filter(s=>s.kind==='chest').every(s=>s.state==='closed'));
for(const gate of game.riftExploration.sites.filter(s=>s.kind==='shortcut')){
  const dx=gate.approach.x-gate.x,dy=gate.approach.y-gate.y,n=Math.hypot(dx,dy);
  put({x:gate.x-dx/n*76,y:gate.y-dy/n*76});assert.equal(game.riftExploration.getInteraction()?.enabled,false);assert.equal(game.riftExploration.interact(gate.id),false);
  put({x:gate.x+dx/n*76,y:gate.y+dy/n*76});assert(game.riftExploration.interact(gate.id));assert(game.terrain.riftGateOpen(gate.gateId));
}
const caves=game.riftExploration.sites.filter(s=>s.kind==='cave');assert(caves.length>=3);
const paired=caves.filter(c=>caves.filter(other=>other.caveId===c.caveId).length===2),challenge=caves.find(c=>caves.filter(other=>other.caveId===c.caveId).length===1);
assert.equal(paired.length,2);assert(challenge);assert(game.companions.recruit('owl'));assert(game.companions.recruit('stormcaller'));
put(challenge);request(challenge.id);const challengeState=game.dungeon.active;assert.equal(challengeState.artTheme,'city');assert.equal(challengeState.riftExits.length,1);
put(challengeState.riftExits[0]);game.dungeon.update(0);request(challengeState.riftExits[0].id);
const [a,b]=paired;put(a);request(a.id);const cave=game.dungeon.active;assert.equal(cave.artTheme,'city');assert.equal(cave.riftExits.length,2);assert(cave.enemies.length>8&&cave.chests.length>0);
const enemy=cave.enemies[0];enemy.hp-=1;const retainedHp=enemy.hp;
const opposite=cave.riftExits.find(exit=>exit.key===b.key);put(opposite);game.dungeon.update(0);request(opposite.id);
assert(game.terrain.isFree(game.player.x,game.player.y+groundOffset(game.player,true),game.player.r));
assert(Math.hypot(game.player.x-b.x,game.player.y+groundOffset(game.player,true)-b.y)<190);
for(const member of game.companions.members)assert(Math.hypot(member.x-game.player.x,member.y-game.player.y)<190);
assert.equal(game.touchInteractions.update(),false,'returning does not immediately re-enter the city sewer');
put(b);request(b.id);assert.equal(game.dungeon.active,cave);assert.equal(enemy.hp,retainedHp);
const entrance=cave.riftExits.find(exit=>exit.key===a.key);put(entrance);game.dungeon.update(0);request(entrance.id);
const snapshot=game.regions.saveWorld();assert.equal(game.regions.states.get(9),snapshot);assert.equal(game.regions.restoreWorld(4),false,'old city identity cannot restore the new city');
assert(game.regions.restoreWorld(9));assert.equal(game.riftExploration.sites.find(s=>s.id===chest.id).state,'claimed');assert.equal(game.dungeon.states.get(cave.id),cave);assert.equal(old.dungeon.states.size,0);
console.log('City world: all nine old worlds and connections preserved, independent normal selection, module schema, finite encounters/rewards, themed paired/challenge dungeons and retained isolated state passed.');
