import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Encounters, ARENA_ACTIVATION_RULES } from './dist/encounters.js';
import { RelicSites } from './dist/relic-sites.js';
import { portalDoor } from './dist/portal-geometry.js';

let seed=873256;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const foot=e=>({x:e.x,y:e.y+groundOffset(e)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function arena() {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,companions:false,environment:false,settlements:false});
  g.enemies=[];g.events=[];g.effects=[];g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.build.setEquipped('sword',false);g._refreshWeapons();
  g.encounters=new Encounters(g,{generation:false});g.relicSites=new RelicSites(g,{generation:false});
  const site={id:'arena:qa',category:'relic',type:'hunt',name:'林间狩猎',x:400,y:0,r:210,door:{x:400,y:190},interactRadius:82,state:'ready',progress:0,goal:24};
  g.relicSites.sites.push(site);return {g,site};
}
function begin() {const {g,site}=arena();feet(g,site);assert(g.relicSites.interact(site.id));return {g,site,active:g.encounters.active};}
function advance(g,seconds,{enemies=false}={}) {
  for(let left=seconds;left>1e-8;left-=.025) {
    const dt=Math.min(.025,left);g.encounters?.update(dt);
    if(enemies)for(const enemy of g.enemies)if(enemy.eventRole==='huntGuard')g.encounters?.updateEnemy(enemy,dt);
  }
}
function killReady(g) {
  for(const enemy of [...g.enemies])if(enemy.eventRole==='huntGuard'&&enemy.hp>0&&!(enemy.rescueSpawnGrace>0))g._hurtEnemy(enemy,enemy.hp+1);
}

const contact=arena();feet(contact.g,contact.site.door);contact.g.update(0);
assert.equal(contact.site.state,'ready','entering the arena rim does not activate it');
feet(contact.g,{x:contact.site.x+60,y:contact.site.y});
assert.equal(contact.g.relicSites.getInteraction().x,contact.site.x);
assert.equal(contact.g.relicSites.interact(contact.site.id),false,'hint range cannot remotely activate the center seal');
feet(contact.g,{x:contact.site.x+25,y:contact.site.y});contact.g.update(0);
assert.equal(contact.site.state,'active','small center contact activates immediately without a dwell timer');
assert.equal(contact.g.enemies.length,0);assert.equal(contact.g.encounters.active.activationAge,0);

const first=begin();advance(first.g,.6);
assert.equal(first.active.spawnWarnings.length,0);assert.equal(first.active.spawnedCount,0);
const beforePause=structuredClone(first.active);
for(const status of ['paused','upgrade','shop','super','dead']) {
  first.g.status=status;advance(first.g,1);assert.deepEqual(first.active,beforePause,`${status} freezes ceremony and pending waves`);
}
first.g.status='playing';first.g.encounters.update(20);
assert(first.active.activationAge<.7,'large elapsed time is bounded rather than catching up the entire ceremony');
advance(first.g,.1);assert.equal(first.active.spawnWarnings.length,3);assert.equal(first.active.spawnedCount,0);
for(const warning of first.active.spawnWarnings)assert(distance(warning,first.site)>=189&&distance(warning,first.site)<=221);
advance(first.g,.4);assert.equal(first.active.spawnedCount,3);assert.equal(first.active.pendingGuards.length,21);
assert(first.g.enemies.every(e=>e.guardActive===false&&e.rescueSpawnGrace>0));
for(const enemy of first.g.enemies) {
  const health=enemy.hp;assert.equal(first.g._hurtEnemy(enemy,9999),0);assert.equal(enemy.hp,health,'emergence grace blocks actual damage');
}
advance(first.g,.35,{enemies:true});killReady(first.g);
assert.equal(first.active.progress,3);assert.equal(first.site.progress,3);assert.equal(first.site.state,'active');
assert.equal(first.g.gold,0);assert.equal(first.g.crystals,0,'clearing only the first wave cannot pay the final reward');
for(let elapsed=0;elapsed<12;elapsed+=.025) {advance(first.g,.025,{enemies:true});killReady(first.g);}
assert.equal(first.active.spawnedCount,24);assert.equal(first.active.guardIds.length,24);assert.equal(new Set(first.active.guardIds).size,24);
assert.equal(first.site.state,'cleared');assert.equal(first.site.progress,24);assert.equal(first.g.encounters.active,null);
assert.equal(first.g.gold,18);assert.equal(first.g.crystals,72);
feet(first.g,first.site);assert.equal(first.g.relicSites.interact(first.site.id),false,'cleared architecture remains one-shot');

const moving=begin();advance(moving.g,.75);
const invaded=moving.active.spawnWarnings[0],oldPoint={x:invaded.x,y:invaded.y};feet(moving.g,oldPoint);
advance(moving.g,.5);
assert.equal(moving.active.spawnedCount,2,'the invaded warning is relocated instead of spawning on the player');
assert.equal(moving.active.spawnWarnings.length,1);assert(distance(invaded,oldPoint)>=ARENA_ACTIVATION_RULES.spawnDistance);
assert(invaded.age<invaded.duration,'relocated defenders restart a full warning');
assert(moving.g.enemies.every(e=>distance(foot(e),oldPoint)>=ARENA_ACTIVATION_RULES.spawnDistance));
advance(moving.g,.5);assert.equal(moving.active.spawnedCount,3);

const wet=begin();advance(wet.g,.75);
const wetWarning=wet.active.spawnWarnings[0],waterPoint={x:wetWarning.x,y:wetWarning.y};
wet.g.environment={muds:[{id:'new-pool',...waterPoint,rx:42,ry:42}],props:[],isHazardFree:()=>true};
advance(wet.g,.5);
assert.equal(wet.active.spawnedCount,2,'terrain and water are revalidated at emergence');
assert(distance(wetWarning,waterPoint)>42);assert(wetWarning.age<wetWarning.duration);

const crowded=begin();advance(crowded.g,.75);
for(let i=0;i<180;i++){const e=crowded.g._spawnEnemy('slime',1);e.x=10000+i*50;e.y=10000;}
advance(crowded.g,3);assert.equal(crowded.active.spawnedCount,0);assert.equal(crowded.g.enemies.length,180);assert.equal(crowded.site.state,'active');
crowded.g.enemies.splice(0,2);crowded.g.encounters.update(.05);
assert.equal(crowded.g.enemies.length,180);assert.equal(crowded.active.spawnedCount,2);assert.equal(crowded.active.spawnWarnings.length,1);
crowded.g.enemies=crowded.g.enemies.filter(e=>e.eventRole==='huntGuard');
crowded.g.encounters.update(20);assert.equal(crowded.active.spawnedCount,3,'capacity recovery spawns only the pending wave, never the whole queue');
assert.equal(crowded.active.spawnWarnings.length,0);assert(crowded.active.spawnTimer>=.8-1e-9,'a delayed wave preserves normal spacing before the next wave');
const missing=crowded.g.enemies[0];crowded.g.enemies=crowded.g.enemies.filter(e=>e.id!==missing.id);crowded.g.encounters.update(.05);
assert.equal(crowded.site.state,'failed');assert.equal(crowded.g.encounters.active,null);assert.equal(crowded.g.gold,0);

// Exercise a real region round trip while a warning is pending. Global time
// advances elsewhere, but this world's animation age and finite queue do not.
const journey=new Game();journey.player.xpNext=Infinity;journey.crystalsNext=Infinity;
const home=journey.relicSites.sites.find(s=>s.type==='hunt');assert(home);feet(journey,home);assert(journey.relicSites.interact(home.id));
advance(journey,.8);const saved=journey.encounters,progress=structuredClone(saved.active);
assert(progress.spawnWarnings.length>0&&progress.spawnedCount===0);
const gate=journey.portal;feet(journey,portalDoor(gate));const guardian=journey.enemies.find(e=>e.id===gate.bossId);journey._hurtEnemy(guardian,guardian.hp+1);
journey.regions.flushReward();assert(journey.chooseSuper(journey.getSuperChoices()[0].id));assert(journey.enterPortal(gate.id));
journey.time+=300;journey._clock+=300;
const back=journey.regions.portals.find(p=>p.direction==='back');feet(journey,portalDoor(back));assert(journey.enterPortal(back.id));
assert.equal(journey.encounters,saved);assert.deepEqual(saved.active,progress,'warning positions, phase and pending cohort survive a different-world visit');
saved.update(.05);assert.equal(saved.active.spawnedCount,0,'returning does not catch up the absent simulation');

console.log('Arena activation: center contact, two-stage warmup, bounded perimeter waves, safe warnings, finite rewards, pause and world persistence passed.');
