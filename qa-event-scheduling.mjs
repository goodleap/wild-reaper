import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Encounters } from './dist/encounters.js';
import { OBJECTIVE_RULES } from './dist/event-scheduling.js';

let seed=241077;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena({settlements=false}={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:true,companions:true,environment:false,settlements});
  g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];
  g._spawn=Infinity;g._shot=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Reproduce the first-minute starvation: an ignored 35 s camp previously
// blocked the 70 s event until the old, overly broad boss warning took over.
const opening=arena();opening.time=35;opening.companions.update(0);
const camp=opening.companions.camp;assert(camp);assert(distance(camp,{x:0,y:groundOffset(opening.player,true)})>=319);
for(const guard of opening.enemies)opening.companions.updateEnemy(guard,0);
assert(opening.enemies.every(e=>e.guardActive===false),'the camp does not engage from its initial 320-unit spawn');
opening.time=70;opening.encounters.update(0);
assert(opening.encounters.active,'an ignored rescue permits the first timed event at 70 s');
assert.equal(opening.companions.camp,camp,'ignoring a camp does not consume its rescue opportunity');
assert(distance(opening.encounters.active,camp)>=330+opening.encounters.active.r,'the new event reserves room around the ignored camp');

const engaged=arena();engaged.nextBossAt=Infinity;
const engagedCamp=engaged.companions.spawn('warden',320,19.8);assert(engagedCamp);
feet(engaged,{x:engagedCamp.x-OBJECTIVE_RULES.campEngage+10,y:engagedCamp.y});
for(const guard of engaged.enemies)engaged.companions.updateEnemy(guard,0);
assert(engaged.enemies.every(e=>e.guardActive));
engaged.encounters.nextAt=0;engaged.encounters.update(0);
assert.equal(engaged.encounters.active,null,'an engaged camp still protects its nearby battle from new objectives');
feet(engaged,{x:engagedCamp.x-500,y:engagedCamp.y});
assert(engaged.encounters._canStart(),'walking away releases the event scheduler without deleting the camp');
assert.equal(engaged.encounters.spawn('hunt',engagedCamp.x,engagedCamp.y),null,'explicit event placement also avoids an ignored camp');

// An overdue boss held by a portal is not imminent. Actual boss and arrival
// grace still take precedence, including with the portal retained.
const portal=arena();portal.time=500;portal.nextBossAt=270;portal.portal={x:800,y:0};
assert(portal.companions._canStart());assert(portal.encounters._canStart());
portal.encounters.update(0);assert(portal.encounters.active,'the overdue portal permits real event generation');
portal.encounters.active=null;portal.portal=null;
assert(!portal.companions._canStart());assert(!portal.encounters._canStart(),'a genuinely overdue boss reserves its immediate fight');
portal.nextBossAt=526;assert(portal.companions._canStart());assert(portal.encounters._canStart());
portal.nextBossAt=525;assert(!portal.companions._canStart());assert(!portal.encounters._canStart());
portal.portal={x:800,y:0};portal.regionGrace=2;
assert(!portal.companions._canStart());assert(!portal.encounters._canStart());
portal.regionGrace=0;const boss=portal._spawnEnemy('boss',1);
assert(!portal.companions._canStart());assert(!portal.encounters._canStart());
boss.hp=0;assert(portal.companions._canStart());assert(portal.encounters._canStart());

// A half-cleared house keeps exactly the same guards and reward state when
// abandoned, while other objectives become available away from its battle.
const house=arena({settlements:true});house.nextBossAt=Infinity;
const site=house.settlements.sites.find(s=>s.type==='occupied');assert(site);feet(house,site.door);
assert(house.settlements.interact(site.id));
const guards=house.enemies.filter(e=>e.settlementId===site.id),ids=guards.map(e=>e.id);
house._hurtEnemy(guards[0],guards[0].hp+1);assert.equal(site.remainingGuards,3);
assert(!house.companions._canStart());assert(!house.encounters._canStart());
feet(house,{x:site.door.x+900,y:site.door.y});house.settlements.update(.05);
assert(guards.filter(e=>e.hp>0).every(e=>e.guardActive===false));
assert(house.companions._canStart());assert(house.encounters._canStart(),'a remote active house is not a global veto');
house.encounters.nextAt=0;house.encounters.update(0);assert(house.encounters.active);
assert(distance(house.encounters.active,site.door)>=OBJECTIVE_RULES.houseEngage+house.encounters.active.r);
house.encounters.active=null;feet(house,site.door);house.settlements.update(.05);
assert(guards.filter(e=>e.hp>0).every(e=>e.guardActive));
assert.equal(site.remainingGuards,3);assert.deepEqual(site.guardIds,ids);
assert.equal(house.settlements._startGuards(site),false,'returning cannot spawn another guard squad');
assert(!house.companions._canStart());assert(!house.encounters._canStart());
for(const guard of guards)if(guard.hp>0)house._hurtEnemy(guard,guard.hp+1);
assert.equal(site.state,'cleared');assert(house.settlements.interact(site.id));
assert.equal(house.gold,24);assert.equal(house.crystals,40);
assert.equal(house.settlements.interact(site.id),false);
for(const guard of guards)house.settlements.onEnemyKilled(guard);
assert.equal(house.gold,24);assert.equal(house.crystals,40,'abandonment and resuming never duplicate the house reward');

// Active timed fights only reserve the nearby area; a distant hunt cannot
// stop the next rescue indefinitely when the player elects to leave it.
const hunt=arena();hunt.nextBossAt=Infinity;hunt.encounters=new Encounters(hunt,{generation:false});
assert(hunt.encounters.spawn('hunt',0,19.8));assert(!hunt.companions._canStart());
feet(hunt,{x:900,y:19.8});assert(hunt.companions._canStart());
assert.equal(hunt.companions.spawn('warden',0,19.8),null,'rescue placement does not overlap a distant waiting hunt');

console.log('Event scheduling QA passed: ignored/engaged rescue, first-minute event, portal hold, boss safety, house resume and once-only rewards.');
