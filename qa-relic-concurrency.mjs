import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {Adventure} from './dist/adventure.js';
import {Encounters} from './dist/encounters.js';
import {RelicSites} from './dist/relic-sites.js';
import {portalDoor} from './dist/portal-geometry.js';

const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
function quiet(g){g.enemies=g.enemies.filter(e=>e.portalId);g.nextBossAt=Infinity;g._spawn=Infinity;g._shot=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;if(g.encounters)g.encounters.generation=false;return g;}
function open(g,site){feet(g,site.type==='hunt'||site.appearance==='golemaltar'?site:site.door);assert(g.relicSites.getInteraction()?.enabled,site.id);assert(g.relicSites.interact(site.id),site.id);return site.type==='hunt'?g.encounters.activities.find(a=>a.siteId===site.id):g.companions.campFor(site.id);}
function lethal(g,e){e.rescueSpawnGrace=0;g._hurtEnemy(e,e.hp+100);assert(e.hp<=0);}

// Explicitly create two arenas to exercise same-type state ownership, even
// though ordinary region generation currently contains only one arena.
const g=quiet(new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,companions:false,environment:false,settlements:false}));
g._features.encounters=true;g._features.companions=true;g.adventure=new Adventure(g,{generation:false});g.encounters=new Encounters(g,{generation:false});g.relicSites=new RelicSites(g);
const first=g.relicSites.sites.find(s=>s.type==='hunt'),second={...first,id:'relic-test:second-arena',x:4000,y:4000,door:{x:4000,y:4190}};g.relicSites.sites.push(second);
const a=open(g,first),b=open(g,second);assert.equal(g.encounters.activities.length,2);assert.equal(g.encounters.spawn('hunt',first.x,first.y,{siteId:first.id}),null,'same site cannot activate twice');
const prisons=['stormcaller','warden'].map(kind=>g.relicSites.sites.find(s=>s.kind===kind));
const camps=prisons.map(site=>open(g,site));assert.equal(g.companions.camps.length,2);assert.equal(g.companions.spawn(prisons[0].kind,prisons[0].x,prisons[0].y,{siteId:prisons[0].id}),null);
const boss=g._spawnEnemy('boss',1);boss.guardActive=true;
const owlSite=g.relicSites.sites.find(s=>s.kind==='owl'),owlCamp=open(g,owlSite);assert(owlCamp,'another relic activates while a boss and other relics are active');
const owlGuard=g.enemies.find(e=>e.rescueId===owlCamp.id);owlGuard.rescueSpawnGrace=0;feet(g,owlCamp);g.companions.updateEnemy(owlGuard,0);assert.equal(owlGuard.guardActive,true,'bosses do not suspend another relic guard');
const campGuard=g.enemies.find(e=>e.rescueId===camps[1].id);lethal(g,campGuard);g.companions.onEnemyKilled(campGuard);assert.equal(camps[1].remainingGuards,camps[1].guardTotal-1);assert.equal(camps[0].remainingGuards,camps[0].guardTotal,'kills only belong to their camp');
feet(g,{x:9000,y:9000});for(let i=0;i<280;i++){
  g.encounters.update(.05);
  // This scheduler-only fixture advances defenders off their rim spawn slots;
  // ordinary movement is deliberately not driven while the player is away.
  for(const enemy of g.enemies)if(enemy.eventRole==='huntGuard'&&!enemy._qaMoved){const battle=g.encounters.activities.find(item=>item.id===enemy.eventId);enemy.x=battle.x+(enemy.x-battle.x)*.25;enemy.y=battle.y+(enemy.y+groundOffset(enemy)-battle.y)*.25-groundOffset(enemy);enemy._qaMoved=true;}
}
assert.equal(a.spawnedCount,24);assert.equal(b.spawnedCount,24,'both arenas advance their own wave queues');
const aGuards=g.enemies.filter(e=>e.eventId===a.id),bGuards=g.enemies.filter(e=>e.eventId===b.id);
lethal(g,aGuards[0]);assert.equal(a.progress,1);assert.equal(b.progress,0);
const missing=g.enemies.find(e=>e.rescueId===owlCamp.id);g.enemies=g.enemies.filter(e=>e!==missing);g.companions.update(0);assert.equal(owlSite.state,'failed');assert.equal(g.companions.camps.length,2,'missing guards abandon only their own camp');assert.equal(g.encounters.activities.length,2);
const before={gold:g.gold,crystals:g.crystals};for(const e of bGuards)lethal(g,e);assert.equal(second.state,'cleared');assert.deepEqual(g.encounters.activities,[a]);assert.equal(g.gold-before.gold,18);assert.equal(g.crystals-before.crystals,72);
for(const e of bGuards)g.encounters.onEnemyKilled(e);assert.equal(g.gold-before.gold,18,'duplicate callbacks cannot pay completed arenas');
for(const e of aGuards.slice(1))lethal(g,e);assert.equal(first.state,'cleared');assert.equal(g.encounters.activities.length,0);assert.equal(g.gold-before.gold,36);assert.equal(g.crystals-before.crystals,144);
for(const camp of [...camps].reverse()){
  for(const e of g.enemies.filter(e=>e.rescueId===camp.id&&e.hp>0))lethal(g,e);
  assert.equal(camp.state,'ready');feet(g,camp);assert(g.companions._join());assert.equal(g.companions._join(camp),false);
}
assert.equal(g.companions.camps.length,0);assert.equal(g.companions.members.length,2);assert.equal(g.rescuePower,2,'each distinct rescue improves the hero once');

// Scene suspension retains every objective instance, defender and partial HP.
for(const region of ['forest','marsh']){
const travel=quiet(new Game({debug:region!=='forest',debugWorld:region,debugOptions:{testFacilities:false}})),homeIndex=travel.regionIndex,sites=['stormcaller','warden'].map(kind=>travel.relicSites.sites.find(s=>s.kind===kind));
const savedCamps=sites.map(site=>open(travel,site)),arena=travel.relicSites.sites.find(s=>s.type==='hunt'),activity=open(travel,arena);
const savedArray=travel.companions.camps,activities=travel.encounters.activities,guard=travel.enemies.find(e=>e.rescueId===savedCamps[1].id);guard.rescueSpawnGrace=0;travel._hurtEnemy(guard,1);const hp=guard.hp;
const castle=travel.settlements.sites.find(s=>s.type==='castle'),outdoorBoss=travel.enemies.find(e=>e.type==='boss')||travel._spawnEnemy('boss',1);outdoorBoss.guardActive=true;feet(travel,castle.door);assert(travel.settlements.interact(castle.id),'a boss does not globally lock a castle entrance');
assert.equal(travel.companions.camps.length,0);assert.equal(travel.encounters,null);travel.companions.update(.05);assert.equal(savedArray.length,2);assert.equal(savedCamps[0].remainingGuards,savedCamps[0].guardTotal);
feet(travel,travel.dungeon.active.entrance);assert(travel.dungeon.exit());assert.equal(travel.companions.camps,savedArray);assert.equal(travel.encounters.activities,activities);assert.equal(travel.enemies.find(e=>e.id===guard.id).hp,hp);
// The unrelated encounter boss has served its entrance-coexistence check.
// Keep it dormant so it cannot globally block the later travel assertion.
outdoorBoss.guardActive=false;
const portal=travel.regions.portals[0];feet(travel,portalDoor(portal));const guardian=travel.enemies.find(e=>e.id===portal.bossId);
if(portal.natural){assert.equal(portal.state,'active');assert.equal(guardian,undefined);assert.equal(travel.superSkills.pending,null,'natural forest exits grant no boss reward');}
else{assert(guardian,'guarded worlds retain an actual portal boss');lethal(travel,guardian);assert(travel.regions.flushReward());assert(travel.chooseSuper(travel.getSuperChoices()[0].id));assert(portal.rewardClaimed);}
assert(travel.enterPortal(portal.id));assert.equal(travel.companions.camps.length,0);
const back=travel.regions.portals.find(p=>p.nextRegionIndex===homeIndex);feet(travel,portalDoor(back));assert(travel.enterPortal(back.id));assert.equal(travel.companions.camps,savedArray);assert.equal(travel.encounters.activities,activities);assert.equal(travel.encounters.activities[0],activity);assert.equal(travel.enemies.find(e=>e.id===guard.id).hp,hp);
assert(savedCamps.every(camp=>travel.companions.camps.includes(camp)));assert(sites.every(site=>site.state==='active'));
}
console.log('Relic concurrency: independent arenas/camps, boss coexistence, wave progress, kill attribution, isolated failure, unique rewards and scene/region round trips passed.');
