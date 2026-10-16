import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {initBoss} from './dist/bosses.js';
import {getConfigSection} from './dist/content-config.js';
import {RELIC_RULES} from './dist/relics.js';

let seed=924319;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const skills=getConfigSection('companions').skills;
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,`${message}: ${actual} != ${expected}`);
function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.player.x=g.player.y=0;
  g._spawn=g._shot=g._pulse=g._lightning=g.nextBossAt=g.player.xpNext=g.crystalsNext=Infinity;
  g._updatePressure=()=>{};
  for(const id of ['sword','arrow','orbit'])g.build.setEquipped(id,false);
  return g;
}
function target(g,deer=true,extra={}){
  const e=g._spawnEnemy(deer?'boss':'slime');if(deer)initBoss(e,'frostcrown');
  // The ordinary control deliberately shares the old circle/foot envelope,
  // so only the authored Frostcrown identity selects the new geometry.
  Object.assign(e,{x:0,y:0,r:49,groundOffset:40,hp:10000,maxHp:10000,speed:0,defense:0,visualFacing:0,walkPhase:0,moving:false,guardActive:true,specialCooldown:Infinity,...extra});
  g._rebuildGrid();return e;
}
function runic(g,start,end,width=1){
  assert(g.build.increment('arrow'));assert(g.build.setEquipped('arrow',true));
  const amount=31,range=Math.hypot(end.x-start.x,end.y-start.y);
  const origin={x:start.x,y:start.y+groundOffset(g.player,true)};
  g.superSkills._runicShots.push({origin,visual:{...start},angle:Math.atan2(end.y-start.y,end.x-start.x),tick:0,width,range,damage:amount});
  g.superSkills._updateRunic(0);
  const ray=g.effects.find(e=>e.type==='superRay');assert(ray);
  close(ray.x,start.x,'ray keeps actual muzzle x');close(ray.y,start.y,'ray keeps actual muzzle y');
  close(ray.x2,end.x,'ray keeps actual propagation endpoint x');close(ray.y2,end.y,'ray keeps actual propagation endpoint y');
  close(ray.r,width,'ray keeps authored width');assert.equal(g.superSkills._runicShots.length,0);
  return amount;
}

// The actual queued ray misses transparent belly space, reaches an exposed
// head beyond the old r49 circle, and cannot extend past its captured endpoint.
for(const [start,end,hit] of [
  [{x:0,y:24},{x:0,y:45},false],
  [{x:70,y:-25},{x:52,y:-25},true],
  [{x:70,y:-25},{x:58,y:-25},false]
]){
  const g=arena(),e=target(g),amount=runic(g,start,end);
  close(e.hp,10000-(hit?amount:0),'runic body/gap/finite-endpoint damage');
}
{
  const g=arena(),e=target(g,false);const amount=runic(g,{x:0,y:24},{x:0,y:45});
  close(e.hp,10000-amount,'ordinary enemy retains its existing circular ray contact');
}

// Every field center is already ground-space, including overhead meteors and
// projectile-profile vortex fields. No +40 foot adjustment or radius expansion.
for(const [skillId,profile] of [['domain','ground'],['meteor','overhead'],['vortex','projectile']])for(const [x,hit] of [[60,false],[43,true]]){
  const g=arena(),e=target(g),field={id:1,kind:skillId,skillId,profile,x,y:36,r:12,life:.001,maxLife:1,damage:23,tick:0,interval:1,pull:0,color:'#aacccc'};
  g.superSkills.fields.push(field);g.superSkills._updateFields(.01);
  close(e.hp,10000-(hit?23:0),`${skillId} uses exact footprint contact`);
}
for(const x of [60,43]){
  const g=arena(),e=target(g,false),field={x,y:36,r:12,profile:'ground',skillId:'domain'};
  const old=Math.hypot(x-e.x,36-e.y-groundOffset(e))<=field.r+e.r;
  assert.equal(g.superSkills._areaTargets(field).includes(e),old,'ordinary field contact is unchanged');
}
for(const [x,inside] of [[60,false],[43,true]]){
  const g=arena(),e=target(g),field={id:1,x,y:36,r:12,life:1};
  g.superSkills.fields.push(field);
  g.superSkills._erosion.set(e,{fieldId:1,origin:{x,y:36},damage:7,life:1,tick:0});
  g.superSkills._updateErosion(0);
  close(e.hp,inside?10000:9993,'erosion stops deferring to a field after leaving its real footprint');
}

for(const echo of [false,true])for(const [x,hit] of [[60,false],[43,true]]){
  const g=arena(),e=target(g);
  g.companions._quake(x,36,12,19,echo,1);
  close(e.hp,10000-(hit?19:0),`companion ${echo?'echo':'pulse'} footprint contact`);
  const ring=g.effects.find(effect=>effect.type==='ring'&&effect.quake);
  assert(ring);close(ring.x,x,'quake retains center x');close(ring.y,36,'quake retains ground center y');close(ring.r,12,'quake retains radius');
}

// Real cast gates use the same contact as their damage pass, while preserving
// configured range, cooldown, damage, and the golem's existing center-angle aim.
for(const [kind,method,farX,nearX] of [['warden','_castQuake',205,195],['golem','_castGolem',155,145]])for(const [x,hit] of [[farX,false],[nearX,true]]){
  const g=arena(),e=target(g),member=g.companions.recruit(kind,{x,y:36}),rule=skills[kind];assert(member);
  const before=member._attack,cast=g.companions[method](member);
  assert.equal(cast,hit,`${kind} edge contact controls actual cast`);
  close(e.hp,10000-(hit?rule.damage:0),`${kind} retains configured damage`);
  close(member._attack,hit?rule.cooldown:before,`${kind} only consumes its existing cooldown on a real cast`);
}
for(const [kind,method,x] of [['warden','_castQuake',205],['golem','_castGolem',155]]){
  const g=arena(),e=target(g,false),member=g.companions.recruit(kind,{x,y:36});assert(member);
  const rule=skills[kind];assert(Math.hypot(x,4)<rule.radius+e.r,'control overlaps its original radius');
  assert(g.companions[method](member),'ordinary enemy keeps previous cast eligibility');
  close(e.hp,10000-rule.damage,'ordinary companion damage remains unchanged');
}

// Herbal Echo's existing visual ring is centered at p.x/p.y itself. Using that
// exact point avoids inventing a player/deer foot shift in either direction.
for(const [y,hit] of [[-100,false],[36,true]]){
  const g=arena(),e=target(g);g.relics.owned.push('herbalEcho');g.player.x=0;g.player.y=y;
  const amount=RELIC_RULES.herbDamage*g._damageMultiplier();assert(g.relics.onHerb(1));
  close(e.hp,10000-(hit?amount:0),'herb ring uses its displayed ground center');
  const ring=g.effects.find(effect=>effect.type==='ring');assert(ring);
  close(ring.x,0,'herb keeps center x');close(ring.y,y,'herb keeps its existing center y');close(ring.r,RELIC_RULES.herbRadius,'herb keeps radius');
}
{
  const g=arena(),e=target(g,false);g.relics.owned.push('herbalEcho');g.player.y=-100;
  assert(Math.hypot(e.x-g.player.x,e.y-g.player.y)<=RELIC_RULES.herbRadius+e.r);
  const amount=RELIC_RULES.herbDamage*g._damageMultiplier();assert(g.relics.onHerb(1));
  close(e.hp,10000-amount,'ordinary herb contact retains the original sprite-anchor circle');
}

console.log('Frostcrown support hits: finite rune rays, transparent gaps/exposed head, exact ground fields/erosion/companion casts/herb rings, unchanged ranges/damage/cooldowns and ordinary-enemy branches passed.');
