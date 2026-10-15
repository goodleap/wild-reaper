import assert from 'node:assert/strict';
import { portalDoor } from './dist/portal-geometry.js';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { Encounters } from './dist/encounters.js';
import { RelicSites } from './dist/relic-sites.js';
import { Environment } from './dist/environment.js';
import { REGIONS } from './dist/regions.js';

let seed=967231;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
function world() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,companions:false,environment:false,settlements:false});
  g.enemies=[];g.events=[];g.effects=[];g.gems=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g._features.encounters=true;g._features.companions=true;
  g.adventure=new Adventure(g,{generation:false});g.encounters=new Encounters(g,{generation:false});
  g.relicSites=new RelicSites(g);return g;
}
const site=(g,type)=>g.relicSites.sites.find(s=>s.type===type);
function begin(g,type) {
  const target=site(g,type);assert(target);feet(g,type==='hunt'?target:target.door);
  assert.equal(g.relicSites.getInteraction()?.enabled,true);
  assert(g.relicSites.interact(target.id));assert.equal(target.state,'active');return target;
}
function finishWarnings(g) {
  for(let i=0;i<17;i++)for(const enemy of g.enemies)if(enemy.rescueId)g.companions.updateEnemy(enemy,.05);
}
function finishHuntWaves(g) {
  for(let i=0;i<241;i++) {
    g.encounters.update(.05);
    for(const enemy of g.enemies)if(enemy.eventRole==='huntGuard')g.encounters.updateEnemy(enemy,.05);
  }
}
const generated=world(),initial=structuredClone(generated.relicSites.sites);
assert.deepEqual(initial.map(s=>s.type),['hunt','rescue','rescue','dogcamp','rescue','rescue','stonevault']);
assert(initial.every(s=>s.category==='relic'&&s.state==='ready'&&!s.discovered));
assert(Math.hypot(initial[0].x-initial[1].x,initial[0].y-initial[1].y)>initial[0].r+initial[1].r);
generated.time=1000;generated.companions.generation=true;generated.companions.update(0);
assert.equal(generated.companions.camp,null,'time never creates a rescue outside its durable ruin');
assert.deepEqual(generated.relicSites.sites,initial,'waiting never removes an untriggered site');
assert.equal(generated.relicSites.interact(initial[0].id),false,'a distant ruin cannot be remotely activated');
assert(generated.encounters._canStart(),'an idle rescue ruin cannot block random events');
generated.encounters.generation=true;generated.encounters.nextAt=0;generated.encounters.update(0);
assert.equal(generated.encounters.active?.type,'treasure','the random scheduler no longer creates temporary hunt arenas');
assert.equal(generated.companions.camp,null);

// The platform footprint, not merely its center, must stay out of existing
// water. Testing never drains, relocates or otherwise rewrites the pool.
const wet=world();wet.relicSites.sites=[];wet.environment={muds:[],props:[],isHazardFree:()=>true};
for(const [type,r,doorOffset] of [['hunt',210,190],['rescue',105,80],['rune',72,45]]) {
  const candidate={type,x:2500,y:1800,r,door:{x:2500,y:1800+doorOffset}};
  assert(wet.relicSites._valid(candidate));
  const mud={id:`existing-pool:${type}`,x:candidate.x+r+45,y:candidate.y+12,rx:76,ry:42};
  wet.environment.muds.push(mud);
  assert(Math.hypot((candidate.x-mud.x)/mud.rx,(candidate.y-mud.y)/mud.ry)>1,'the ruin center itself is dry');
  assert.equal(wet.relicSites._valid(candidate),false,'an overlapping wet platform edge rejects the entire placement');
  assert.equal(wet.environment.muds[0],mud);assert.equal(wet.environment.muds.length,1);
  mud.x=candidate.x+r+mud.rx+60;
  assert(wet.relicSites._valid(candidate),'a genuinely separated pool does not reject the dry platform');
  wet.environment.muds=[];
}

const hunt=world(),arena=begin(hunt,'hunt'),active=hunt.encounters.active;
assert.equal(hunt.enemies.filter(e=>e.eventId===active.id).length,0,'center activation precedes the first telegraphed perimeter wave');
finishHuntWaves(hunt);
const defenders=hunt.enemies.filter(e=>e.eventId===active.id);
assert.equal(defenders.length,24);assert.equal(active.goal,24);assert(defenders.every(e=>e.relicSiteId===arena.id&&e.eventRole==='huntGuard'));
const stranger=hunt._spawnEnemy('slime',1);hunt._hurtEnemy(stranger,stranger.hp+1);
assert.equal(active.progress,0,'unrelated ordinary kills do not replace the finite defenders');
hunt.encounters.onEnemyKilled(defenders[0]);assert.equal(active.progress,0,'a living guard cannot count as killed');
hunt._hurtEnemy(defenders[0],defenders[0].hp+1);hunt.encounters.onEnemyKilled(defenders[0]);
assert.equal(active.progress,1);assert.equal(arena.progress,1);
const life=active.life;feet(hunt,{x:5000,y:5000});hunt.time+=1000;hunt.encounters.update(.05);
assert.equal(hunt.encounters.active,active);assert.equal(active.life,life);assert.equal(arena.state,'active','leaving a relic preserves its combat and building');
const gold=hunt.gold,crystals=hunt.crystals;
for(const enemy of defenders.slice(1))hunt._hurtEnemy(enemy,enemy.hp+1);
assert.equal(arena.state,'cleared');assert.equal(arena.progress,24);assert.equal(hunt.encounters.active,null);
assert.equal(hunt.gold-gold,18);assert.equal(hunt.crystals-crystals,72);
assert(hunt.relicSites.sites.includes(arena),'the completed stone arena remains in the region');
feet(hunt,arena.door);assert.equal(hunt.relicSites.interact(arena.id),false);
assert.equal(hunt.encounters.spawn('hunt',arena.x,arena.y,{siteId:arena.id}),null,'a completed site cannot be replayed through the battle API');
for(const enemy of defenders)hunt.encounters.onEnemyKilled(enemy);
assert.equal(hunt.gold-gold,18);assert.equal(hunt.crystals-crystals,72,'repeated death callbacks cannot pay the relic twice');

const removed=world(),broken=begin(removed,'hunt'),lost=removed.encounters.active;
finishHuntWaves(removed);
const missingId=lost.guardIds[0],before={gold:removed.gold,crystals:removed.crystals,kills:removed.kills};
removed.enemies=removed.enemies.filter(e=>e.id!==missingId);removed.encounters.update(.05);
assert.equal(broken.state,'failed');assert.equal(removed.encounters.active,null);
assert.deepEqual({gold:removed.gold,crystals:removed.crystals,kills:removed.kills},before,'culling/missing guards never masquerade as real kills');
assert(removed.relicSites.sites.includes(broken));assert.equal(removed.relicSites.interact(broken.id),false);

const rescue=world(),prison=begin(rescue,'rescue'),camp=rescue.companions.camp;
const guards=rescue.enemies.filter(e=>e.rescueId===camp.id);
assert.equal(guards.length,9);assert.equal(camp.siteId,prison.id);assert.equal(camp.category,'relic');
const campLife=camp.life;feet(rescue,{x:5000,y:5000});rescue.time+=1000;rescue.companions.update(.05);
assert.equal(rescue.companions.camp,camp);assert.equal(camp.life,campLife);
finishWarnings(rescue);
for(const enemy of guards)rescue._hurtEnemy(enemy,enemy.hp+1);
assert.equal(prison.progress,9);assert.equal(prison.state,'active');assert.equal(camp.state,'ready');assert.equal(rescue.rescuePower,0);
feet(rescue,camp);assert(rescue.companions._join());
assert.equal(prison.state,'cleared');assert.equal(rescue.rescuePower,1);assert(rescue.companions.members.includes(rescue.companions.active));assert(rescue.companions.active.upkeep>0);
assert(rescue.relicSites.sites.includes(prison),'opening the prison never deletes its permanent structure');
for(const enemy of guards)rescue.companions.onEnemyKilled(enemy);
assert.equal(rescue.companions._join(),false);assert.equal(rescue.rescuePower,1);
rescue.companions._leave();feet(rescue,prison.door);assert.equal(rescue.relicSites.interact(prison.id),false);

const missing=world(),lostPrison=begin(missing,'rescue'),lostCamp=missing.companions.camp;
missing.enemies=missing.enemies.filter(e=>e.id!==lostCamp.guardIds[0]);missing.companions.update(.05);
assert.equal(lostPrison.state,'failed');assert.equal(missing.rescuePower,0);assert.equal(missing.companions.camp,null);

const paused=world(),pausedArena=begin(paused,'hunt');paused.status='paused';
const beforePause=structuredClone(paused.encounters.active);paused.encounters.update(.05);paused.relicSites.update(.05);
assert.deepEqual(paused.encounters.active,beforePause);assert.equal(pausedArena.state,'active');
const disabled=new Game({adventure:false});assert.equal(disabled.relicSites.sites.length,0,'disabled world content cannot be recreated by the relic module');

const runes=world();runes.regionIndex=2;runes.region=REGIONS[2];runes.environment=new Environment(runes,{generation:false});
runes.relicSites=new RelicSites(runes);const platform=site(runes,'rune');assert(platform);
assert.equal(runes.environment.mechanisms._candidate(3,3),null,'ruins no longer generate disposable random rune circles');
const originalSites=runes.relicSites.sites;feet(runes,platform);runes.relicSites.update(.05);
assert.equal(platform.state,'ready','stepping on a relic does not activate its support accidentally');
assert.equal(platform.discovered,false,'map discovery remains the viewport-aware minimap responsibility');
assert(runes.relicSites.interact(platform.id));assert.equal(platform.state,'active');assert.equal(platform.mechanism.remaining,12);
assert.equal(runes.environment.mechanisms.props.includes(platform.mechanism),false,'the permanent rune never enters the temporary prop cache');
const target=runes._spawnEnemy('slime',1);Object.assign(target,{x:platform.x+60,y:platform.y,hp:1000,maxHp:1000,speed:0});
for(let i=0;i<6;i++)runes.relicSites.update(.05);
assert(target.hp<1000,'the fixed rune uses the actual existing support attack');
const remaining=platform.mechanism.remaining;runes.status='paused';runes.relicSites.update(.05);assert.equal(platform.mechanism.remaining,remaining);runes.status='playing';
feet(runes,{x:5000,y:5000});for(let i=0;i<241;i++)runes.relicSites.update(.05);
assert.equal(platform.state,'cleared');assert.equal(platform.mechanism.state,'spent');assert.equal(runes.relicSites.sites,originalSites);
assert(runes.relicSites.sites.includes(platform),'the spent rune pedestal stays in the world');
feet(runes,platform.door);assert.equal(runes.relicSites.interact(platform.id),false);assert.equal(runes.environment.mechanisms.activateRune(platform.mechanism),false);

// Exercise both natural forest travel and a real guarded world, rather than a
// mock snapshot serializer or adding a synthetic boss to a natural exit.
for(const type of ['hunt','rescue'])for(const region of ['forest','marsh']) {
  const traveler=new Game({debug:region!=='forest',debugWorld:region,debugOptions:{testFacilities:false}}),homeIndex=traveler.regionIndex;traveler.player.xpNext=Infinity;traveler.crystalsNext=Infinity;
  const structure=begin(traveler,type),battle=type==='hunt'?traveler.encounters.active:traveler.companions.camp;
  if(type==='hunt')finishHuntWaves(traveler);
  finishWarnings(traveler);
  const ids=battle.guardIds,first=traveler.enemies.find(e=>e.id===ids[0]);traveler._hurtEnemy(first,first.hp+1);
  const remaining=traveler.enemies.filter(e=>e.hp>0&&ids.includes(e.id)),remainingIds=remaining.map(e=>e.id);
  const wounded=remaining[0];traveler._hurtEnemy(wounded,1);const wounds=wounded.hp;
  const gateway=traveler.portal;feet(traveler,portalDoor(gateway));
  const guardian=traveler.enemies.find(e=>e.id===gateway.bossId);
  if(gateway.natural){assert.equal(gateway.state,'active');assert.equal(guardian,undefined);assert.equal(traveler.superSkills.pending,null);}
  else{assert(guardian);traveler._hurtEnemy(guardian,guardian.hp+1);assert(traveler.regions.flushReward());assert(traveler.chooseSuper(traveler.getSuperChoices()[0].id));assert(gateway.rewardClaimed);}
  assert(traveler.enterPortal(gateway.id));assert.equal(traveler.regionIndex,gateway.nextRegionIndex);
  traveler.time+=120;traveler._clock+=120;
  const returnGate=traveler.regions.portals.find(p=>p.nextRegionIndex===homeIndex);feet(traveler,portalDoor(returnGate));
  assert(traveler.enterPortal(returnGate.id));assert.equal(traveler.regionIndex,homeIndex);
  assert.equal(site(traveler,type),structure);assert.equal(structure.state,'active');assert.equal(structure.progress,1);
  assert.equal(type==='hunt'?traveler.encounters.active:traveler.companions.camp,battle);
  assert.deepEqual(traveler.enemies.filter(e=>e.hp>0&&ids.includes(e.id)).map(e=>e.id),remainingIds);
  assert.equal(traveler.enemies.find(e=>e.id===wounded.id).hp,wounds,'travel preserves partially damaged relic defenders');
}
console.log('Relic sites: persistent architecture, deliberate activation, finite defenders, real kills, unique rewards and no automatic rescue/hunt spawning passed.');
