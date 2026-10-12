import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

let seed=58173;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,elites:false,companions:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g._spawn=g._shot=g.nextBossAt=Infinity;
  g.player.xpNext=g.crystalsNext=Infinity;g._updatePressure=()=>{};return g;
}
function advance(g,t){for(let left=t;left>1e-8;left-=.025)g.update(Math.min(.025,left));}
const hurt=arena();assert.equal(hurt.player.hurtFace,0);
hurt.player.invuln=2;assert.equal(hurt._hurtPlayer(20),false);assert.equal(hurt.player.hurtFace,0,'Entry protection cannot show a hurt expression.');
hurt.player.invuln=0;hurt._hurtPlayer(5);assert.equal(hurt.player.hp,95);assert.equal(hurt.player.hurtFace,.24);
advance(hurt,.1);const pausedFace=hurt.player.hurtFace;hurt.status='upgrade';advance(hurt,.5);assert.equal(hurt.player.hurtFace,pausedFace,'Choice pauses freeze facial animation.');
hurt.status='playing';advance(hurt,.16);assert.equal(hurt.player.hurtFace,0);assert(hurt.player.invuln>0,'Pain ends well before the invulnerability window.');
const ward=arena();ward.relics.ward=18;const beforeWard=ward.player.hp;ward._hurtPlayer(5);
// The existing relic API's actual result is authoritative, including any
// fully absorbed damage; expressions never infer damage from an event alone.
assert.equal(ward.player.hurtFace>0,ward.player.hp<beforeWard);
const blocked=arena();blocked.relics.modifyIncomingDamage=()=>0;blocked._hurtPlayer(5);assert.equal(blocked.player.hurtFace,0);
const entry=arena();assert(entry.dungeon.enter({id:'face-castle',type:'castle',door:{x:0,y:19.8}}));assert(entry.player.invuln>0);assert.equal(entry.player.hurtFace,0);
const storm=arena();storm._castStorm();assert.equal(storm.player.castFace,.25);advance(storm,.3);assert.equal(storm.player.castFace,0);assert.equal(storm.player.hurtFace,0);

const crawl=arena(),beetle=crawl._spawnEnemy('beetle',1);Object.assign(beetle,{x:180,y:70,hp:10000,maxHp:10000,speed:100});
const old={x:beetle.x,y:beetle.y};crawl.update(.04);assert(beetle.moving);assert(beetle.walkPhase>0);
assert(Math.abs(beetle.visualFacing-Math.atan2(beetle.y-old.y,beetle.x-old.x))<1e-9);
const phase=beetle.walkPhase;beetle.speed=0;advance(crawl,.2);assert.equal(beetle.moving,false);assert.equal(beetle.walkSpeed,0);assert.equal(beetle.walkPhase,phase,'Still beetles never march on wall-clock time.');
beetle.speed=100;beetle.guardActive=false;advance(crawl,.1);assert.equal(beetle.walkPhase,phase,'Dormant guards retain their settled feet.');
beetle.guardActive=true;crawl.player.x=beetle.x+100;crawl.player.y=beetle.y;advance(crawl,.04);assert(Math.abs(beetle.visualFacing)<.03,'Turning follows actual motion toward the player.');
const frozen=beetle.walkPhase;crawl.status='upgrade';advance(crawl,.3);assert.equal(beetle.walkPhase,frozen);

for(const kind of ['stormcaller','warden']){
  const g=arena(),camp=g.companions.spawn(kind,250,19.8);assert(camp);
  for(const e of g.enemies.filter(e=>camp.guardIds.includes(e.id)))g._hurtEnemy(e,e.hp+1);
  g.player.x=camp.x;g.player.y=camp.y-groundOffset(g.player,true);g.update(0);
  const ally=g.companions.active;assert(ally);assert.equal(ally.rescuedFace,.65);assert.equal(ally.hurtFace,undefined);
  g.enemies=[];const e=g._spawnEnemy('slime',1);Object.assign(e,{x:ally.x+90,y:ally.y,hp:10000,maxHp:10000,speed:0});
  ally._attack=0;g.companions.resolve();assert.equal(ally.castFace,.25,'A real successful cast triggers focus.');
  if(kind==='stormcaller')assert.equal(ally.castFacing,0);
  advance(g,.3);assert.equal(ally.castFace,0);assert(ally.rescuedFace<.65);
}
console.log('Character state QA passed: actual-damage faces, protection/entry isolation, pause, cast/rescue expressions, resolved beetle stride and heading.');
