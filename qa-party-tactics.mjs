import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { COMPANION_RULES } from './dist/companion-catalog.js';
import { updateSpore, resolveSpore } from './dist/enemies/spore.js';
import { updateSpecialist } from './dist/enemies/specialists.js';
import { enemyGroupProvoked } from './dist/combat-tactics.js';
import { selectFriendlyTarget } from './dist/friendly-combat.js';

const foot=e=>({x:e.x,y:e.y+groundOffset(e,!!(e.heroId||e.isCompanion))});
const place=(e,x,y=0)=>{e.x=x;e.y=y-groundOffset(e,!!(e.heroId||e.isCompanion));};
const gap=(a,b)=>Math.hypot(foot(a).x-foot(b).x,foot(a).y-foot(b).y);
const arena=(obstacles=[])=>{
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.gold=1000;g.player.xpNext=g.crystalsNext=g._spawn=g.nextBossAt=Infinity;place(g.player,0);
  return g;
};
const enemy=(g,x,y=0,type='slime')=>{const e=g._spawnEnemy(type,1);Object.assign(e,{hp:100000,maxHp:100000,guardActive:true});place(e,x,y);g._rebuildGrid();return e;};
const tick=(g,seconds,resolve=false)=>{for(let left=seconds;left>1e-8;left-=.025){const dt=Math.min(left,.025);g._clock+=dt;g.time+=dt;g.runTime+=dt;g._rebuildGrid();g.companions.update(dt);if(resolve)g.companions.resolve();}};

const roster=arena(),mages=Array.from({length:5},(_,i)=>roster.companions.recruit('stormcaller',{x:-160+i*70,y:0}));
assert(mages.every(Boolean));assert.equal(new Set(mages.map(m=>m.id)).size,5);assert.equal(roster.companions.recruit('stormcaller'),null);
const victim=enemy(roster,200);for(const m of mages)m._attack=Infinity;mages[0]._attack=0;
roster.companions.resolve();assert(victim.hp<victim.maxHp);assert(mages[0]._attack>0);assert(mages.slice(1).every(m=>m._attack===Infinity&&!m.castFace),'same-kind members retain independent cooldown and cast state');
roster.companions.takeDamage(mages[1],1e6,'raw',victim);assert.equal(mages[1].state,'recovering');assert.equal(roster.companions.recruit('warden'),null,'recovering members count toward five');
mages[1].recovery=0;tick(roster,.025);assert.equal(mages[1].state,'active');assert.equal(roster.companions.members[1],mages[1]);
assert(roster.companions.dismiss(mages[2].id));assert.equal(roster.companions.members.filter(m=>m.kind==='stormcaller').length,4);assert(roster.companions.recruit('stormcaller'));

const guards=arena(),far=guards.companions.recruit('warden',{x:340,y:0}),near=guards.companions.recruit('warden',{x:40,y:0});
assert.equal(guards.companions.protectionMultiplier(guards.player),COMPANION_RULES.guardMultiplier,'a distant first warden cannot hide a valid second defender');
place(far,-40);assert.equal(guards.companions.protectionMultiplier(guards.player),COMPANION_RULES.guardMultiplier,'overlapping guards do not multiply protection');
near.state='recovering';far.state='recovering';assert.equal(guards.companions.protectionMultiplier(guards.player),1);

for(const struck of ['hero','companion']){
  const g=arena(),warden=g.companions.recruit('warden',{x:-120,y:0}),golem=g.companions.recruit('golem',{x:-130,y:80}),dog=g.companions.recruit('dog',{x:-160,y:-80}),foe=enemy(g,310);
  foe.guardActive=false;
  if(struck==='hero')assert(g._hurtPlayer(1,foe));else assert(g.companions.takeDamage(dog,1,'enemy',foe));
  assert(g.companions.members.every(m=>m._combatAlertUntil>g._clock),'damage to either party side alerts every active member');
  const before=[warden.x,golem.x];tick(g,1);
  assert(warden.x>before[0]+60&&golem.x>before[1]+60,'combat members approach even when their personal attack range is initially insufficient');
  assert.equal(dog._combatTarget??null,null,'support roles gain no attack skill');
}
const independent=arena(),left=independent.companions.recruit('warden',{x:-170,y:0}),right=independent.companions.recruit('warden',{x:170,y:0});
const west=enemy(independent,-240),east=enemy(independent,240);independent.companions.alert(west);tick(independent,.05);
assert.equal(left._combatTarget,west);assert.equal(right._combatTarget,east,'an alarm does not force every ally to attack its original source');
const chosen=right._combatTarget;east.x+=4;tick(independent,.1);assert.equal(right._combatTarget,chosen,'small position changes retain the current target');
assert.equal(selectFriendlyTarget(independent,east),right,'both actors can select one another');
for(const actor of [right,east]){
  const saved=JSON.parse(JSON.stringify(actor)),cloned=structuredClone(actor);
  assert(!('_combatTarget' in saved)&&!('_friendlyTarget' in saved));
  assert(!('_combatTarget' in cloned)&&!('_friendlyTarget' in cloned),'live target caches do not clone an actor graph');
}
assert.equal(structuredClone(right)._combatTargetId,east.id);
independent.enemies=independent.enemies.filter(e=>e!==east);assert.equal(right._combatTarget,null,'a removed actor immediately invalidates the target');
const expired=arena(),guard=expired.companions.recruit('warden',{x:-170,y:0}),quiet=enemy(expired,310);quiet.guardActive=false;
expired.companions.alert(quiet);assert(expired.companions._combatPlan(guard),'a party alarm permits approaching a distant attacker');
guard._combatAlertUntil=0;assert.equal(expired.companions._combatPlan(guard),null,'a member without a live party alarm cannot pursue a dormant out-of-range group');

const approach=arena(),caster=approach.companions.recruit('stormcaller',{x:-220,y:0}),distant=enemy(approach,310);caster._attack=5;
const beforeGap=gap(caster,distant);tick(approach,1);assert(gap(caster,distant)<beforeGap-60);assert(caster._attack>3.9&&caster._attack<4.1,'movement does not reset cooldown');
const arrived=foot(caster);tick(approach,.4);assert(Math.hypot(caster.x-arrived.x,foot(caster).y-arrived.y)<1,'ranged ally holds a useful position once in range');
place(distant,850);tick(approach,.3);assert.equal(caster._combatTarget,null,'party does not pursue beyond the leader leash');

// Different sprite heights must not leave lightning holding just outside its
// actual cast radius. Exercise both sides of the foot-distance boundary.
for(const type of ['slime','bat','brute','boss'])for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const edge of [-1,1]){
  const g=arena(),mage=g.companions.recruit('stormcaller',{x:0,y:0}),range=g.companions._combatRule(mage).range;
  const x=Math.cos(angle)*(range+edge),y=Math.sin(angle)*(range+edge),foe=enemy(g,x,y,type);
  place(g.player,x*.5,y*.5);g.viewWidth=g.viewHeight=1400;mage._attack=0;
  const canCast=g.combat.canTarget(foe,mage,{range,requireView:true,checkPath:true,source:'companionLightning'});
  assert.equal(!!g.companions._combatPlan(mage)?.hold,canCast,`${type}/${angle}/${edge}: stopping matches the real spell gate`);
  tick(g,1,true);assert(foe.hp<foe.maxHp,`${type}/${angle}/${edge}: the caster closes the boundary gap and attacks`);
}

for(const blocked of [false,true]){
  const obstacles=blocked?[{type:'log',variant:'castle-wall',x:-40,y:0,r:10,halfLength:100,angle:Math.PI/2}]:[];
  const g=arena(obstacles),mage=g.companions.recruit('stormcaller',{x:0,y:0}),close=enemy(g,55);mage._attack=2;
  const before=gap(mage,close);tick(g,.35);
  assert(gap(mage,close)>before+5,`cooldown allows a modest safe retreat (rear wall: ${blocked})`);assert(mage._attack>1.6&&mage._attack<1.7);
  assert(g.terrain.isFree(mage.x,foot(mage).y,mage.r));if(blocked)assert(mage.x>=-15,'retreat never crosses the wall behind the caster');
  tick(g,1);assert(gap(mage,close)<175,'retreat stops after opening a limited gap');
}
for(const type of ['spore','rootbinder','prismguard','tidepriest','stoneape','frostmage']){
  const g=arena(),e=enemy(g,0,0,type);place(g.player,55);const before=gap(e,g.player);
  if(type==='spore'){e.castCooldown=2;updateSpore(g,e,.05);assert.equal(e.cast,null);assert.equal(e.castCooldown,1.95);}
  else{e.specialist.cooldown=2;updateSpecialist(g,e,.05);assert.equal(e.specialist.phase,'idle');assert.equal(e.specialist.cooldown,1.95);}
  assert(gap(e,g.player)>before,`${type} can withdraw during cooldown`);
}
const windup=arena(),spore=enemy(windup,0,0,'spore');place(windup.player,55);spore.castCooldown=0;updateSpore(windup,spore,.01);const locked=spore.cast.angle,at=foot(spore);place(windup.player,55,40);updateSpore(windup,spore,.05);
assert.deepEqual(foot(spore),at);assert.equal(spore.cast.angle,locked,'retreat cannot skip a warning or re-aim a committed shot');
// The selected ally remains the range reference even if the hero is farther.
const aim=arena(),owl=aim.companions.recruit('owl',{x:50,y:0}),shooter=enemy(aim,0,0,'spore');place(aim.player,400);shooter.castCooldown=0;updateSpore(aim,shooter,.01);assert.equal(shooter.cast.targetId,owl.id);assert.doesNotThrow(()=>JSON.stringify(shooter));shooter.cast.life=0;resolveSpore(aim,shooter,{px:400,py:0,maxEnemyBullets:80});assert.equal(aim.enemyBullets.length,1);

// Real damage routes exercise isolated explicit groups, including room IDs.
for(const field of ['rescueId','settlementId','eventId','dungeonId']){
  const g=arena(),a=enemy(g,60),b=enemy(g,120),other=enemy(g,180);
  for(const e of [a,b,other]){e[field]='group-one';e.guardActive=false;e.dungeonRoom='room-one';}
  if(field==='dungeonId')other.dungeonRoom='room-two';else other[field]='group-two';
  g._hurtEnemy(a,1,0,g.player,'raw');assert(a.guardActive&&b.guardActive);assert.equal(other.guardActive,false,`${field}: other groups stay asleep`);
  if(field!=='dungeonId'){
    place(g.player,900);
    if(field==='rescueId'){
      g.companions.camps=[{id:'group-one',x:0,y:0,engageRadius:100}];b.rescueHome={x:120,y:0};g.companions.updateEnemy(b,.025);
    }else if(field==='settlementId'){
      g.settlements.sites=[{id:'group-one',state:'active',door:{x:0,y:0}}];b.settlementHome={x:120,y:0};g.settlements.update(.025);
    }else{
      const {Encounters}=await import('./dist/encounters.js');g.encounters=new Encounters(g,{generation:false});g.encounters.activities=[{id:'group-one',x:0,y:0,r:100}];b.eventRole='huntGuard';b.huntHome={x:120,y:0};g.encounters.updateEnemy(b,.025);
    }
    assert(b.guardActive,`${field}: next movement update retains a newly hit group's alarm`);
  }
  assert(enemyGroupProvoked(g,b,{x:0,y:0},300));g._clock+=3.1;assert.equal(enemyGroupProvoked(g,b,{x:0,y:0},300),false,'explicit group alarm expires');
}
console.log('Party tactics: independent targets, group damage alerts, range approach, safe cooldown retreat, preserved windups, same-kind capacity/recovery/casts and nonstacking protection passed.');
