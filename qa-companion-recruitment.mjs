import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { portalDoor } from './dist/portal-geometry.js';
import { RESCUE_RULES } from './dist/companions.js';
import { COMPANION_RULES } from './dist/companion-catalog.js';
import { armyPanelHTML } from './dist/army-panel.js';

const feet=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});
function quiet(g){
  g.enemies=g.enemies.filter(e=>e.portalId||e.rescueId);
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=g.player.xpNext=g.crystalsNext=Infinity;
  g.player.invuln=Infinity;g.gold=1000;g.build.setEquipped('sword',false);
  if(g.territories)g.territories.update=()=>{};
  if(g.encounters)g.encounters.generation=false;
  return g;
}
const world=()=>quiet(new Game({mode:'world',environment:false}));
function activate(g,kind='stormcaller'){
  const site=g.relicSites.sites.find(s=>s.kind===kind);
  feet(g,site.door);assert(g.relicSites.interact(site.id));
  const camp=g.companions.campFor(site.id);assert(camp);
  return {site,camp};
}
function clear(g,camp){
  for(const e of g.enemies.filter(e=>e.rescueId===camp.id)){e.rescueSpawnGrace=0;g._hurtEnemy(e,e.hp+100);assert(e.hp<=0);}
  assert.equal(camp.state,'ready');assert.equal(camp.remainingGuards,0);
}
function travel(g,portal){
  feet(g,portalDoor(portal));
  const guard=g.enemies.find(e=>e.id===portal.bossId);
  if(guard?.hp>0){g._hurtEnemy(guard,guard.hp+100);assert(guard.hp<=0);g.regions.flushReward();assert(g.chooseSuper(g.getSuperChoices()[0].id));}
  assert(g.enterPortal(portal.id));quiet(g);
}

assert.equal(RESCUE_RULES.rescueRadius,100);
const approach=world(),first=activate(approach);
feet(approach,{x:first.site.x,y:first.site.y+90});approach.update(0);
assert.equal(first.camp.state,'trapped');assert.equal(approach.companions.members.length,0);
assert.equal(approach.relicSites.canRescue(first.site.id,foot(approach),15),false,'closed gates never permit rescue');
clear(approach,first.camp);
assert(first.site.gateOpen);
for(const point of [{x:first.site.x,y:first.site.y+101},{x:first.site.x-100,y:first.site.y},{x:first.site.x,y:first.site.y-80}]){
  feet(approach,point);approach.update(0);assert.equal(approach.companions.members.length,0,'distance or the remaining side/back wall prevents recruitment');
}
// Another obstacle cannot be bypassed merely because the prison gate is open.
approach.terrain.setStructures([{id:'rescue-approach-wall',type:'log',x:first.site.x,y:first.site.y+80,r:3,halfLength:50,angle:0,structureType:'wall'}],'qa-rescue');
feet(approach,{x:first.site.x,y:first.site.y+105});
assert.equal(approach.relicSites.canRescue(first.site.id,foot(approach),15),false);
feet(approach,{x:first.site.x,y:first.site.y+100});approach.update(0);assert.equal(approach.companions.members.length,0);
approach.terrain.setStructures([],'qa-rescue');
feet(approach,{x:first.site.x,y:first.site.y+140});
for(let step=0;step<30&&!approach.companions.members.length;step++)approach.update(1/60,{y:-1});
const joinedAt=Math.hypot(foot(approach).x-first.site.x,foot(approach).y-first.site.y);
assert(joinedAt<=100&&joinedAt>90,'real movement recruits near the open entrance, before the old inner rectangle');
assert.equal(first.site.state,'cleared');assert.equal(approach.rescuePower,1);
feet(approach,first.site);approach.update(0);assert.equal(approach.companions.members.length,1);assert.equal(approach.rescuePower,1);

// Full parties retain a cleared challenge and show the actual reason. A
// recovering instance still occupies a slot; releasing one resumes the rescue.
const pending=activate(approach,'warden');clear(approach,pending.camp);
while(approach.companions.members.length<COMPANION_RULES.maxMembers)assert(approach.companions.recruit('stormcaller'));
const sameKind=[...approach.companions.members];assert.equal(new Set(sameKind.map(m=>m.id)).size,5);
assert(sameKind.every(m=>m.kind==='stormcaller'));
sameKind[0].invuln=0;approach.companions.takeDamage(sameKind[0],10000);assert.equal(sameKind[0].state,'recovering');
feet(approach,pending.camp);approach.update(0);
assert.equal(pending.site.state,'active');assert(approach.companions.camps.includes(pending.camp));
assert.match(approach.getInteraction().label,/队伍已满.*5\/5/);
assert.match(approach.getInteraction().description,/休整.*占名额/);
assert.equal(approach.companions.recruit('dog'),null);
const blockedSite=approach.relicSites.sites.find(s=>s.kind==='owl');feet(approach,blockedSite.door);
assert.equal(approach.relicSites.interact(blockedSite.id),false);assert.equal(blockedSite.state,'ready');
const dogSite=approach.relicSites.sites.find(s=>s.kind==='dog'),gold=approach.gold;feet(approach,dogSite.door);
assert.equal(approach.relicSites.interact(dogSite.id),false);assert.equal(approach.gold,gold);
assert(approach.companions.dismiss(sameKind[2].id));
assert(sameKind.filter((_,index)=>index!==2).every(member=>approach.companions.members.includes(member)),'dismissal acts on a single instance');
feet(approach,pending.camp);approach.update(0);
assert.equal(pending.site.state,'cleared');assert.equal(approach.companions.members.length,5);
assert.equal(approach.companions.members.filter(m=>m.kind==='stormcaller').length,4);

// Reproduce the reported intermittent overlap: leave a ready camp in A,
// recruit the same kind in B, then return through the actual portals.
const crossing=world(),a=activate(crossing),origin=crossing.mapId;clear(crossing,a.camp);
travel(crossing,crossing.regions.portals[0]);
const b=activate(crossing);clear(crossing,b.camp);feet(crossing,b.camp);crossing.update(0);
const earlier=crossing.companions.members[0];assert(earlier);
earlier.invuln=0;crossing.companions.takeDamage(earlier,10000);assert.equal(earlier.state,'recovering');
travel(crossing,crossing.regions.portals.find(p=>p.nextRegionIndex===origin));
assert.equal(crossing.companions.campFor(a.site.id),a.camp);assert.equal(a.camp.state,'ready');
feet(crossing,a.camp);crossing.update(0);
assert.equal(a.site.state,'cleared');assert.equal(crossing.companions.members.length,2);
const later=crossing.companions.members.find(m=>m!==earlier);
assert.equal(later.kind,earlier.kind);assert.notEqual(later.id,earlier.id);assert.notEqual(later._echoes,earlier._echoes);
assert.equal(earlier.state,'recovering');assert.equal(later.state,'active');assert.equal(later.hp,later.maxHp);
assert.equal(crossing.rescuePower,2,'two distinct sites each grant their single rescue reward');
const panel=armyPanelHTML(crossing);
assert.match(panel,/同类可重复招募/);assert.match(panel,/休整中也占名额/);
for(const member of [earlier,later])assert(panel.includes(`data-dismiss-companion="${member.id}"`));

// A second dog can join at another world's stall, with one charge per site.
const dogs=world();assert(dogs.companions.recruit('dog'));
const stall=dogs.relicSites.sites.find(s=>s.kind==='dog');feet(dogs,stall.door);const beforeGold=dogs.gold;
assert(dogs.relicSites.interact(stall.id));assert.equal(dogs.companions.members.filter(m=>m.kind==='dog').length,2);assert(dogs.gold<beforeGold);
const paidGold=dogs.gold;assert.equal(dogs.relicSites.interact(stall.id),false);assert.equal(dogs.gold,paidGold);

// The nearest usable golem may be a later instance. Once work starts, the
// chosen worker remains responsible even if another one approaches.
const workers=world(),vault=workers.relicSites.sites.find(s=>s.type==='stonevault');
const far=workers.companions.recruit('golem'),near=workers.companions.recruit('golem');
far.x=vault.x+600;far.y=vault.y+140-groundOffset(far,true);
near.x=vault.x;near.y=vault.y+140-groundOffset(near,true);feet(workers,vault.door);
assert.equal(workers.relicSites._golemFor(vault),near);assert(workers.relicSites.interact(vault.id));assert.equal(vault.workerId,near.id);
far.x=vault.x+30;far.y=vault.y+140-groundOffset(far,true);
assert.equal(workers.relicSites._golemFor(vault),near);
for(let step=0;step<25;step++)workers.relicSites.update(.05);
assert.equal(vault.state,'opened');assert(vault.gateOpen);

console.log('Companion recruitment: 100-unit open-door approach, wall blocking, full/recovering capacity, independent duplicate instances, actual cross-world rescue, repeat dog hiring and stable golem workers passed.');
