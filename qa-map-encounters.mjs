import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WORLD_IDS, worldNeighbors } from './dist/world-definitions.js';
import { groundOffset } from './dist/terrain.js';
import { getWaterContours, waterBounds } from './dist/water-geometry.js';
import { MonsterTerritories } from './dist/monster-territories.js';

const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const report=[];
const completeWorldIds=['forest','marsh','ruins','beach','city','mountain','snow','volcano','verdant-rift','clockshadow-city'];
assert.deepEqual(WORLD_IDS,[...completeWorldIds,'ember-realm-large']);
// Keep full-map Boss/population/reward fixtures on the ten complete maps.
// qa-ember-geometry.mjs and the scoped checks below cover the partial sample.
for(const region of completeWorldIds){
  const g=new Game({mode:'world',debug:true,debugOptions:{testFacilities:false},debugWorld:region});
  const layout=g.terrain.island.layout;
  assert(layout,`${region}: the formal world uses the shared layout`);
  assert(g.territories.groups.length>=15,`${region}: terrain retains a meaningful population`);
  const guards=g.territories.groups.filter(group=>group.kind==='guard');
  assert(guards.length>=2,`${region}: guarded junctions exist`);
  assert(guards.every(group=>group.members.some(enemy=>enemy.affix)),`${region}: junctions use existing elite content`);
  for(const group of g.territories.groups)for(const enemy of group.members){
    assert(g.terrain.isFree(enemy.territoryHome.x,enemy.territoryHome.y,enemy.r),`${region}: every home is collision free`);
    assert.equal(enemy.guardActive,false,'encounters wait in their own territory');
  }
  const bosses=g.territories.groups.filter(group=>group.kind==='boss');
  assert.equal(bosses.length,layout.kind==='rift-forest'?2:1,`${region}: authored optional field bosses`);
  const group=bosses[0],boss=group.members[0],gates=g.regions.portals.map(p=>({id:p.id,state:p.state,bossId:p.bossId})),connections=[...g.regions.unlockedConnections];
  assert(boss.worldBoss&&boss.bossKind);assert(!boss.portalId);
  if(region==='forest'){
    const fresh=new Game({mode:'world'});fresh.enemies=fresh.enemies.filter(e=>!e.territoryId);fresh.bossCount=12;
    const late=new MonsterTerritories(fresh).groups.find(p=>p.kind==='boss').members[0];
    assert.deepEqual([late.maxHp,late.damage,late.xp],[boss.maxHp,boss.damage,boss.xp],'field difficulty is independent of prior Boss encounters');
  }
  for(const field of bosses){
    const current=field.members[0];place(g,field);g.player.xpNext=Infinity;g.crystalsNext=Infinity;
    g.territories.update(.05);assert.equal(current.guardActive,true);
    g._hurtEnemy(current,current.hp+1000,0,g.player,'raw');
    assert(field.cleared&&field.rewardQueued,'each field Boss death registers a single reward');
    assert.deepEqual(g.regions.portals.map(p=>({id:p.id,state:p.state,bossId:p.bossId})),gates,'optional victory never unlocks an unrelated gate');
    assert.deepEqual([...g.regions.unlockedConnections],connections,'optional Boss rewards do not alter world connections');
    assert(g.regions.flushReward());assert.equal(g.status,'super');
    assert(g.chooseSuper(g.getSuperChoices()[0].id));assert(field.rewardClaimed);
    g.regions.openPortal(current);assert.equal(g.regions._rewardQueue.length,0,'reward cannot be claimed twice');
    assert.equal(g.superSkills.pending,null);
  }
  const secret=layout.clearings.find(c=>c.kind==='secret');assert(secret,`${region}: an exploration branch has supplies`);
  place(g,secret);g.adventure._refreshSupplies(true);
  const crate=g.adventure.props.find(p=>p.id===`supply:layout:${secret.id}`);assert(crate,`${region}: hidden supply is usable`);
  assert(g.adventure.hitSupply(crate,crate.hp));
  place(g,{x:0,y:0});g.adventure._refreshSupplies(true);place(g,secret);g.adventure._refreshSupplies(true);
  assert(!g.adventure.props.some(p=>p.id===crate.id),'returning never regenerates a consumed supply');
  const origin=g.regionIndex,out=g.regions.portals[0];
  if(worldNeighbors(origin).length){
    assert(out,'connected worlds retain a physical exit');assert(g._switchRegion(out));
    assert(g._switchRegion(g.regions.portals.find(p=>p.nextRegionIndex===origin)));
  }else{
    assert.equal(g.regions.portals.length,0,'a separately selected map does not invent a cross-world exit');
    g.regions.saveWorld();assert(g.regions.restoreWorld(origin),'standalone map snapshots retain completed encounters');
  }
  assert.equal(g.territories.byId.get(group.id),group);assert(group.rewardClaimed);
  assert(bosses.every(field=>field.rewardClaimed&&!g.enemies.some(e=>field.memberIds.includes(e.id))),'all defeated field bosses retain their claimed reward after world travel');
  let shores=0;
  for(const lake of layout.lakes){
    if(layout.kind==='rift-forest'){
      const sample=lake.points.filter((_,i)=>i%8===0),before=JSON.stringify(lake),collision=sample.map(p=>g.terrain.rift.circleFree(p.x,p.y,15,'ground'));
      assert(collision.some(free=>!free),'baked lake shore remains a physical boundary');
      g.environment._waterCandidates.clear();g.environment._waterLayout.clear();g.terrain._cache.clear();
      assert.equal(JSON.stringify(g.terrain.island.layout.lakes.find(m=>m.id===lake.id)),before,'cache eviction preserves the authored lake polygon');
      assert.deepEqual(sample.map(p=>g.terrain.rift.circleFree(p.x,p.y,15,'ground')),collision,'distant fixed shores retain collision independently of streamed scenery');
      assert.equal(g.environment._macroWaters.length,0,'legacy water pools do not repaint the authored lake and its bridges');
      shores+=sample.length;continue;
    }
    g.environment.muds=[];
    for(const shore of getWaterContours(lake).outer.filter((_,i)=>i%8===0)){
      const b={minX:shore.x-8,minY:shore.y-8,maxX:shore.x+8,maxY:shore.y+8};
      assert(g.environment.watersInBounds(b).some(m=>m.id===lake.id),'a distant bank is found without loading its center');
      place(g,shore);g.environment._refreshWater(true,shore);
      assert(g.environment.muds.some(m=>m.id===lake.id),'visible shoreline remains painted');shores++;
    }
    const before=JSON.stringify(lake);g.environment._waterCandidates.clear();g.environment._waterLayout.clear();g.terrain._cache.clear();
    assert.equal(JSON.stringify(g.environment.watersInBounds(waterBounds(lake)).find(m=>m.id===lake.id)),before,'cache eviction preserves the lake');
  }
  report.push({region,groups:g.territories.groups.length,guards:guards.length,lakes:layout.lakes.length,shores});
}
const sample=new Game({mode:'world',worldId:'ember-realm-large'}),sampleLayout=sample.terrain.island.layout;
assert.equal(sampleLayout.emberScene?.sample,true,'reduced encounter counts are supported only by the explicitly partial ember sample');
assert.equal(sampleLayout.artTheme,'ember');assert.equal(sample.territories.groups.length,sampleLayout.encounters.length,'the sample creates exactly its authored encounter reservations');
assert(sampleLayout.encounters.length>0,'the region sample has an actual encounter');
assert.equal(sample.territories.groups.filter(group=>group.kind==='boss').length,0,'the sample does not claim a complete-map Boss population');
assert.equal(sample.regions.portals.length,0);
for(const group of sample.territories.groups)for(const enemy of group.members){
  assert(sample.terrain.isFree(enemy.territoryHome.x,enemy.territoryHome.y,enemy.r),'sample encounter members retain the same full-body spawn check');
  assert.equal(enemy.guardActive,false,'sample encounters wait in their own territory');
}
report.push({region:sample.worldId,partial:true,groups:sample.territories.groups.length,guards:sample.territories.groups.filter(group=>group.kind==='guard').length,lakes:sampleLayout.lakes.length});
const debugForest=new Game({mode:'world',debug:true,debugWorld:'forest'});
assert(debugForest.territories.groups.filter(group=>group.kind==='guard').every(group=>group.members.some(enemy=>enemy.affix)),'debug facilities also retain the guarded junction elites');
console.log(JSON.stringify({mapEncounters:'passed',worlds:report}));
