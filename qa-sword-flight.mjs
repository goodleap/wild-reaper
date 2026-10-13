import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { SWORD_FLIGHT_RULES, swordFormationAnchor, createSwordFlight, advanceSwordFlight } from './dist/sword-flight.js';
import { drawSwordFlight } from './dist/sword-flight-art.js';

function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.superSkills.owned.swords=1;g.superSkills.cooldowns.swords=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;
}
function enemy(g,x=240,y=0){const e=g._spawnEnemy('slime');Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0});return e;}
function advance(g,time,move){for(let left=time;left>1e-8;left-=.025){const dt=Math.min(.025,left);if(g.status==='playing'){g._clock+=dt;move?.(dt);}g.superSkills.update(dt);}}
function launch(g,target){assert(g.superSkills._cast('swords',1));advance(g,.175);const flight=g.superSkills.swordFlights[0];assert(flight);g.superSkills._volleys=[];assert.equal(flight.target,target);return flight;}

const staged=arena(),first=enemy(staged),flight=launch(staged,first);
assert.equal(first.hp,10000,'release cannot damage before actual contact');
const initial={x:flight.x,y:flight.y,angle:flight.angle};advance(staged,.075);
assert(flight.y<initial.y,'top sword initially fans outward');assert.equal(first.hp,10000);
assert(flight.trail.length<=SWORD_FLIGHT_RULES.trailPoints);
advance(staged,1.8);assert.equal(first.hp,9876,'one sword applies exactly one unchanged hit');
assert.equal(staged.superSkills.swordFlights.length,0);
assert.equal(staged.effects.filter(e=>e.type==='superSword'&&e.impactOnly).length,1);
advance(staged,1);assert.equal(first.hp,9876,'completed flight cannot hit twice');

for(const direction of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const g=arena(),target=enemy(g,Math.cos(direction)*220,Math.sin(direction)*220),f=launch(g,target);
  let oldAngle=f.angle;
  advance(g,1.9,dt=>{target.x+=Math.cos(direction+.6)*140*dt;target.y+=Math.sin(direction+.6)*140*dt;});
  assert.equal(target.hp,9876,`ordinary moving target is caught in quadrant ${direction}`);
  assert.equal(f.reason,'arrived');assert(f.age<SWORD_FLIGHT_RULES.maxLife);
  assert.notEqual(f.angle,oldAngle,'heading follows the curve');
}

const deceased=arena(),victim=enemy(deceased),deadFlight=launch(deceased,victim);
advance(deceased,.12);victim.x=275;victim.y=37;victim.hp=0;
const defeat={x:victim.x,y:victim.y+groundOffset(victim),lift:groundOffset(victim)};
deceased.enemies=[];advance(deceased,.025);
assert(deadFlight.targetDefeated);assert.deepEqual({x:deadFlight.targetPoint.x,y:deadFlight.targetPoint.y,lift:deadFlight.targetPoint.lift},defeat);
victim.x=1900;victim.y=1900;const replacement=enemy(deceased,275,37);
advance(deceased,1.8);
assert.equal(deadFlight.reason,'arrived','death does not prematurely dissolve the sword');
assert.equal(deadFlight.x,defeat.x);assert.equal(deadFlight.y,defeat.y);
assert.equal(replacement.hp,10000,'dead-target landing neither retargets nor adds area damage');
const impact=deceased.effects.find(e=>e.type==='superSword');assert(impact?.impactOnly);
assert.equal(impact.x,275);assert.equal(impact.y,37,'impact uses the exact defeat body position');

const anchors=Array.from({length:6},(_,i)=>swordFormationAnchor({x:8,y:12},i,6));
assert(anchors.some(p=>p.x<8)&&anchors.some(p=>p.x>8));assert(anchors.some(p=>p.y<12-13)&&anchors.some(p=>p.y>12-13));
assert.equal(new Set(anchors.map(p=>`${p.x},${p.y}`)).size,6);

// A fixed turning radius can trap swords in loops around nearby targets.
// Exercise every launch anchor, including the smaller dead-target endpoint.
for(const distance of [20,45,100])for(const direction of [0,Math.PI*.375,Math.PI,Math.PI*1.5])for(let index=0;index<6;index++)for(const defeated of [false,true]){
  const target={x:Math.cos(direction)*distance,y:Math.sin(direction)*distance,r:16,hp:defeated?0:1000};
  const pointOf=e=>({x:e.x,y:e.y+14,lift:14});
  const f=createSwordFlight({id:1,anchor:swordFormationAnchor({x:0,y:0},index,6),groundLift:19.8,target,targetPoint:pointOf(target),damage:124});
  let impacts=0;
  for(let time=0;time<2.5&&!f.done;time+=.025){
    const oldAngle=f.angle;
    advanceSwordFlight(f,.025,{pointOf,blocked:()=>false,onImpact:(flight,origin,damage)=>{impacts++;assert.equal(damage,!defeated);}});
    const turn=Math.abs(Math.atan2(Math.sin(f.angle-oldAngle),Math.cos(f.angle-oldAngle)));
    assert(turn<=SWORD_FLIGHT_RULES.turnRate*.025+1e-8,'close-range correction keeps smooth bounded turning');
  }
  assert.equal(f.reason,'arrived',`nearby ${defeated?'defeat point':'enemy'} at ${distance}/${direction}, anchor ${index} cannot orbit indefinitely`);
  assert.equal(impacts,1);assert.equal(f.x,target.x);assert(Math.abs(f.visualY-target.y)<1e-9);
}

for(const high of [false,true]){
  const g=arena(),target=enemy(g),f=launch(g,target);
  g.terrain=new Terrain({obstacles:[{id:'flight-cover',type:'log',...(high?{structureType:'castle-wall'}:{}),x:0,y:-35,r:5,halfLength:65,angle:0}]});
  advance(g,1.8);
  assert.equal(target.hp,high?10000:9876,high?'curve segments cannot cross a tall wall':'low logs allow the sword flight');
  assert.equal(f.reason,high?'blocked':'arrived');
}
const blockedOrigin=arena();enemy(blockedOrigin);
blockedOrigin.terrain=new Terrain({obstacles:[{id:'origin-cover',type:'log',structureType:'castle-wall',x:0,y:0,r:5,halfLength:20,angle:0}]});
assert(blockedOrigin.superSkills._cast('swords',1));advance(blockedOrigin,.175);
assert.equal(blockedOrigin.superSkills.swordFlights.length,0,'an occluded launch anchor cannot spawn a sword across the wall');

const frozen=arena(),frozenTarget=enemy(frozen),frozenFlight=launch(frozen,frozenTarget);
for(const state of ['paused','upgrade','shop','super','relic','dead']){
  frozen.status=state;const before=structuredClone(frozenFlight);advance(frozen,.5);assert.deepEqual(frozenFlight,before,`${state} freezes flight and trail`);
}
frozen.status='playing';frozen.sceneTransition.active=true;
const transition=structuredClone(frozenFlight);advance(frozen,.3);assert.deepEqual(frozenFlight,transition,'scene fade freezes flight');
frozen.sceneTransition.active=false;frozen.superSkills.clearScene();advance(frozen,2);
assert.equal(frozen.superSkills.swordFlights.length,0);assert.equal(frozenTarget.hp,10000,'scene cleanup cannot leave delayed damage');
assert(!frozen.effects.some(e=>e.skillId==='swords'));

const runaway=arena(),runner=enemy(runaway),expiring=launch(runaway,runner);runner.x=10000;
advance(runaway,2.6);assert.equal(expiring.reason,'expired');assert.equal(runaway.superSkills.swordFlights.length,0);assert.equal(runner.hp,10000);
const dense=arena();enemy(dense,280);for(let i=0;i<300;i++){dense.superSkills._cast('swords',3);advance(dense,.025);assert(dense.superSkills.swordFlights.length<=SWORD_FLIGHT_RULES.maxFlights);assert(dense.superSkills.swordFlights.every(f=>f.trail.length<=SWORD_FLIGHT_RULES.trailPoints));}

const render=arena(),renderTarget=enemy(render),renderFlight=launch(render,renderTarget);advance(render,.12);
const snapshot=structuredClone(renderFlight);let draws=0,saves=0;
const ctx=new Proxy({save(){saves++;},restore(){saves--;},drawImage(){draws++;}},{get(object,key){return key in object?object[key]:(()=>{});},set(object,key,value){object[key]=value;return true;}});
for(const options of [{},{reduced:true},{dense:true}])drawSwordFlight(ctx,renderFlight,{},options);
assert.equal(draws,3);assert.equal(saves,0);assert.deepEqual(renderFlight,snapshot,'rendering cannot update flight simulation');
console.log('Sword flight: distributed anchors, delayed single hits, moving pursuit, frozen defeat points, high/low cover, pause and scene cleanup, finite flight/trail budgets passed.');
