import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WORLD_IDS } from './dist/world-definitions.js';
import { groundOffset } from './dist/terrain.js';
import { getWaterContours, waterBounds } from './dist/water-geometry.js';
import { MonsterTerritories } from './dist/monster-territories.js';

const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const report=[];
for(const region of WORLD_IDS){
  const g=new Game({mode:'world',debug:true,debugWorld:region});
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
  assert.equal(bosses.length,1,`${region}: one optional field boss`);
  const group=bosses[0],boss=group.members[0],gates=g.regions.portals.map(p=>({id:p.id,state:p.state,bossId:p.bossId}));
  assert(boss.worldBoss&&boss.bossKind);assert(!boss.portalId);
  if(region==='forest'){
    const fresh=new Game({mode:'world'});fresh.enemies=fresh.enemies.filter(e=>!e.territoryId);fresh.bossCount=12;
    const late=new MonsterTerritories(fresh).groups.find(p=>p.kind==='boss').members[0];
    assert.deepEqual([late.maxHp,late.damage,late.xp],[boss.maxHp,boss.damage,boss.xp],'field difficulty is independent of prior Boss encounters');
  }
  place(g,group);g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.territories.update(.05);assert.equal(boss.guardActive,true);
  g._hurtEnemy(boss,boss.hp+1000,0,g.player,'raw');
  assert(group.cleared&&group.rewardQueued,'death registers a single reward');
  assert.deepEqual(g.regions.portals.map(p=>({id:p.id,state:p.state,bossId:p.bossId})),gates,'optional victory never unlocks an unrelated gate');
  assert.equal(g.regions.unlockedConnections.size,0);
  assert(g.regions.flushReward());assert.equal(g.status,'super');
  assert(g.chooseSuper(g.getSuperChoices()[0].id));assert(group.rewardClaimed);
  g.regions.openPortal(boss);assert.equal(g.regions._rewardQueue.length,0,'reward cannot be claimed twice');
  assert.equal(g.superSkills.pending,null);
  const secret=layout.clearings.find(c=>c.kind==='secret');assert(secret,`${region}: an exploration branch has supplies`);
  place(g,secret);g.adventure._refreshSupplies(true);
  const crate=g.adventure.props.find(p=>p.id===`supply:layout:${secret.id}`);assert(crate,`${region}: hidden supply is usable`);
  assert(g.adventure.hitSupply(crate,crate.hp));
  place(g,{x:0,y:0});g.adventure._refreshSupplies(true);place(g,secret);g.adventure._refreshSupplies(true);
  assert(!g.adventure.props.some(p=>p.id===crate.id),'returning never regenerates a consumed supply');
  const origin=g.regionIndex,out=g.regions.portals[0];assert(out);assert(g._switchRegion(out));
  assert(g._switchRegion(g.regions.portals.find(p=>p.nextRegionIndex===origin)));
  assert.equal(g.territories.byId.get(group.id),group);assert(group.rewardClaimed);
  assert(!g.enemies.some(e=>e.id===boss.id),'dead field boss stays defeated after world travel');
  let shores=0;
  for(const lake of layout.lakes){
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
console.log(JSON.stringify({mapEncounters:'passed',worlds:report}));
