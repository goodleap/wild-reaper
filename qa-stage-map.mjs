import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldMap, landmarkLabel, landmarkState } from './dist/world-map.js';
import { groundOffset } from './dist/terrain.js';
import { portalDoor } from './dist/portal-geometry.js';

const g=new Game({stageId:'forest-trial'}),map=new WorldMap();
g.player.xpNext=g.crystalsNext=Infinity;
const place=point=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const travel=target=>{
  const gate=g.regions.portals.find(p=>p.nextMapId===target);
  place(portalDoor(gate));assert(g.enterPortal(gate.id));
  g.touchInteractions.update();
};
map.discover(g);
const outerTerrain=g.terrain,outerExplored=g.terrain.island.explored;
const optional=g.enemies.find(e=>e.stageBossRole==='optional'),optionalHp=optional.hp;
assert.equal(map.getMarkers(g,{range:10000}).some(m=>m.type==='boss'),false,'unseen optional boss is not revealed');
const gate=g.regions.portals[0];place(portalDoor(gate));map.discover(g);
assert.equal(landmarkLabel(map.getMarkers(g).find(m=>m.id===gate.id)),'通往森林核心岛');
travel('forest-heart');
assert.notEqual(g.terrain,outerTerrain);assert.equal(g.terrain.island.explored,undefined,'new same-theme island starts unexplored');
map.discover(g);assert.notEqual(g.terrain.island.explored,outerExplored);
assert(!map.getMarkers(g,{range:10000}).some(m=>m.id===gate.id),'outer landmarks do not leak across islands');
const angels=g.settlements.sites.filter(s=>s.type==='angel');
assert.equal(angels.length,1);assert(angels[0].anchorId.startsWith('portal:'),'core sanctuary belongs to the return gate');
assert(!angels.some(s=>Math.hypot(s.x,s.y)<450),'no spawn sanctuary occupies the boss arena');

// Small islands still use the same shallow-water immersion and movement rules.
const edge=g.terrain.island.contour(28)[0];place(edge);
assert(g.environment.getImmersion(g.player)?.depth>0);
assert(g.environment.movementMultiplier(g.player)<1);

const boss=g.enemies.find(e=>e.stageBossRole==='core');
place({x:boss.stageHome.x,y:boss.stageHome.y+140});g.regionGrace=0;map.discover(g);
assert.equal(landmarkLabel(map.getMarkers(g).find(m=>m.id===boss.id)),'关卡首领');
assert(g._hurtEnemy(boss,boss.hp+1)>0);g.regions.flushReward();
assert(g.chooseSuper(g.getSuperChoices()[0].id));
const exit=g.regions.portals.find(p=>p.kind==='victory');assert(exit);
const marker=map.getMarkers(g,{range:10000}).find(m=>m.id===exit.id);
assert.equal(landmarkLabel(marker),'通关大门');assert.equal(landmarkState(marker),'从正面进入，完成本局');
assert.equal(g.status,'playing','revealing an exit does not finish the run');
travel('forest-outer');
assert.equal(g.terrain.island.explored,outerExplored);assert.equal(optional.hp,optionalHp);
travel('forest-heart');assert(g.stage.coreDefeated);assert(!g.enemies.some(e=>e.stageBoss));
place(portalDoor(exit));assert(g.touchInteractions.update(),'normal doorway contact completes the stage');
assert.equal(g.status,'victory');assert(g.stage.completed);
assert.equal(g.stage.objectives.get('forest-outer').defeated,false,'an undefeated optional boss does not prevent victory');
console.log('Stage map: separate fog/landmarks, sanctuary placement, shallow water, named golden exit and contact victory with optional boss alive passed.');
