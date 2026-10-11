import assert from 'node:assert/strict';
import { Game, HEROES } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { Environment, ENVIRONMENT_BALANCE } from './dist/environment.js';

// Short, deterministic interactions. Long-run pacing is checked separately.
let seed=719613;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,type,x,y=0) {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
const xpTotal=g=>g.player.xp;
function offer(g,id) {
  g.crystalsNext=40;g.crystals=40;g.status='upgrade';
  for(let i=0;i<100;i++) {g._choices=null;if(g.getUpgradeChoices().some(c=>c.id===id))return;}
  assert.fail(`expected an eligible ${id} upgrade`);
}
function shootOnce(g) {g._shot=0;g.update(0);g._shot=Infinity;}

assert.deepEqual(HEROES.map(h=>h.id),['traveler'],'there is only one playable protagonist');
for(const hero of ['traveler','ranger','warden','stormcaller','unknown']) {
  const g=arena({hero});
  assert.equal(g.hero.id,'traveler');assert.equal(g.player.heroId,'traveler','obsolete saved selections cannot restore removed starting roles');
  assert.equal(g.player.maxHp,100);assert.equal(g.player.hp,100);
  assert.equal(g.player.speed,220);assert.equal(g.player.skillCooldownMax,15);
  assert(Object.values(g.levels).every(level=>level===0),'the restored protagonist starts without a free weapon or passive upgrade');
  assert.equal(g.player.xp,0);assert.equal(g.player.level,1);assert.equal(g.status,'playing');
  assert.deepEqual(g.weapons.map(w=>[w.id,w.level]),[['arrow',1]],'automatic arrows remain available without a held weapon or side weapon');
  // Character level never gates access to any of the three secondary skills.
  for(const id of ['orbit','pulse','lightning']) {
    offer(g,id);assert(g.chooseUpgrade(id));assert.equal(g.levels[id],1);
    assert.equal(g.player.level,1,'all skills can be acquired while still character level one');
  }
  g.branches.arrow='pierce'; // Movement-only fixture has already resolved its arrow branch.
  const baseSpeed=g.player.speed;offer(g,'speed');assert(g.chooseUpgrade('speed'));
  assert(Math.abs(g.player.speed/baseSpeed-1.08)<1e-10,'earned movement upgrades still change real movement speed');
  assert.equal(arena({hero,difficulty:'casual'}).player.maxHp,140);
  const restarted=arena({hero:g.player.heroId});
  assert.equal(restarted.player.heroId,'traveler');assert(Object.values(restarted.levels).every(level=>level===0));
  assert.equal(restarted.player.xp,0);assert.equal(restarted.player.level,1);
}
const quick=arena(),regular=arena();quick.levels.rapid=1;quick._refreshStats();
for(const g of [quick,regular]) {monster(g,'slime',200);shootOnce(g);}
assert(quick._shot===Infinity&&quick.bullets.length===1);
quick._shot=0;regular._shot=0;quick.update(0);regular.update(0);
assert(quick._shot<regular._shot,'an earned rapid upgrade changes the actual firing interval');

// Apply statuses through the real weapon paths instead of injecting status data.
function bleedingTarget() {
  const g=arena(),e=monster(g,'slime',74);g.levels.orbit=1;
  g.update(0);assert(e.bleed,'an actual orbit collision applies bleed');
  return {g,e};
}
const bleed=bleedingTarget();bleed.g.levels.orbit=0;bleed.e.x=220;
const afterBlade=bleed.e.hp;advance(bleed.g,.49);
assert.equal(bleed.e.hp,afterBlade,'bleed waits for its first tick');
advance(bleed.g,.025);assert(bleed.e.hp<afterBlade);
const tickDamage=afterBlade-bleed.e.hp;advance(bleed.g,1.5);
assert.equal(afterBlade-bleed.e.hp,tickDamage*4,'one bleed produces four equal ticks and then expires');
assert(!bleed.e.bleed);const expiredHp=bleed.e.hp;advance(bleed.g,.75);assert.equal(bleed.e.hp,expiredHp);

const refreshed=bleedingTarget();advance(refreshed.g,.45);
const blade=refreshed.g.orbitals[0];Object.assign(refreshed.e,{x:blade.x,y:blade.y});
const tickPhase=refreshed.e.bleed.nextTick;refreshed.g.update(0);
assert.equal(refreshed.e.bleed.nextTick,tickPhase,'another blade refreshes duration without resetting the tick clock');
assert(refreshed.e.bleed.life>1.9);refreshed.g.levels.orbit=0;refreshed.e.x=220;
const afterRefresh=refreshed.e.hp;advance(refreshed.g,.075);
assert.equal(afterRefresh-refreshed.e.hp,tickDamage,'refreshing bleed does not stack another damage stream');

const rupture=bleedingTarget(),clean=monster(rupture.g,'slime',-74);
rupture.g.levels.orbit=0;rupture.g.levels.pulse=1;rupture.g._pulse=0;
const markedHp=rupture.e.hp,cleanHp=clean.hp;rupture.g.update(0);
assert(Math.abs((markedHp-rupture.e.hp)/(cleanHp-clean.hp)-1.25)<1e-10,'pulse deals extra damage when consuming bleed');
assert(!rupture.e.bleed);const rupturedHp=rupture.e.hp;advance(rupture.g,.6);
assert.equal(rupture.e.hp,rupturedHp,'consumed bleed does not continue ticking');

const echoed=arena();echoed.levels.pulse=5;echoed.branches.pulse='echoes';echoed._pulse=0;
const echoTarget=monster(echoed,'slime',185);echoed.update(0);
assert.equal(echoTarget.hp,10000,'the target is outside the first pulse');
echoed.player.x=111;echoed.levels.orbit=1;echoed.update(0);assert(echoTarget.bleed);
echoed.levels.orbit=0;echoed.player.x=480;const beforeEcho=echoTarget.hp;
advance(echoed,.36);
assert(Math.abs(beforeEcho-echoTarget.hp-90*.6*1.25)<1e-8,'the delayed original-location echo also consumes bleed for bonus damage');
assert(!echoTarget.bleed);

const shock=arena(),shockTargets=[110,190,260].map(x=>monster(shock,'slime',x));
shock.update(0,{skill:true});assert(shockTargets.every(e=>e.shock),'screen lightning marks surviving targets');
const hpBeforeArrow=shockTargets.map(e=>e.hp);shootOnce(shock);advance(shock,.2);
assert(shockTargets[0].hp<hpBeforeArrow[0]);assert(!shockTargets[0].shock,'an arrow consumes the struck target shock');
assert(shockTargets[1].hp<hpBeforeArrow[1],'the arrow triggers one nearby transfer');
assert.equal(shockTargets[2].hp,hpBeforeArrow[2],'a transfer never recursively jumps again');
assert(shockTargets[1].shock,'raw transferred damage does not consume the receiver shock');
const transferred=hpBeforeArrow[1]-shockTargets[1].hp;

const orbitShock=arena(),marked=monster(orbitShock,'slime',74),receiver=monster(orbitShock,'slime',180);
orbitShock.levels.orbit=0;orbitShock.update(0,{skill:true});const receiverHp=receiver.hp;
orbitShock.levels.orbit=1;orbitShock.update(0);
assert(!marked.shock&&marked.bleed,'an orbit hit both consumes shock and applies bleed');
assert.equal(receiverHp-receiver.hp,transferred,'orbit also transfers shock once');

const passiveLightning=arena(),lightningTarget=monster(passiveLightning,'slime',150);passiveLightning.levels.lightning=1;
passiveLightning._lightning=0;passiveLightning.update(0);assert(lightningTarget.shock,'automatic lightning uses the same status path');
passiveLightning.levels.lightning=0;advance(passiveLightning,2.6);assert(!lightningTarget.shock,'unused shock expires');

const edge=arena();edge.viewWidth=390;
const edgeMarked=monster(edge,'slime',160),offscreen=monster(edge,'slime',230);
edge.update(0,{skill:true});assert(edgeMarked.shock&&!offscreen.shock);
const hiddenHp=offscreen.hp;shootOnce(edge);advance(edge,.3);
assert.equal(offscreen.hp,hiddenHp,'shock cannot transfer damage across the visible screen boundary');

const finalArrow=arena(),dying=monster(finalArrow,'slime',110),survivor=monster(finalArrow,'slime',190);
finalArrow.update(0,{skill:true});dying.hp=1;
const survivorHp=survivor.hp,expectedXp=dying.xp;shootOnce(finalArrow);advance(finalArrow,.2);
assert(dying.hp<=0&&!dying.shock&&!dying.bleed);
assert.equal(survivorHp-survivor.hp,transferred,'a killing arrow still consumes its stored shock once');
assert.equal(finalArrow.kills,1);assert.equal(xpTotal(finalArrow),expectedXp);
finalArrow._hurtEnemy(dying,100);advance(finalArrow,.5);
assert.equal(finalArrow.kills,1);assert.equal(xpTotal(finalArrow),expectedXp,'a removed status cannot reward the same dead target twice');

const paused=bleedingTarget();paused.g.levels.orbit=0;paused.g.update(0,{skill:true});
const statuses={bleed:structuredClone(paused.e.bleed),shock:structuredClone(paused.e.shock),hp:paused.e.hp};
for(const state of ['upgrade','paused','dead']) {
  paused.g.status=state;advance(paused.g,1);paused.g.combatStatus.update(.05);
  assert.deepEqual({bleed:paused.e.bleed,shock:paused.e.shock,hp:paused.e.hp},statuses,'combat statuses cannot tick outside live combat');
}

function landscape(options={}) {
  const g=arena(options);g.environment=new Environment(g,{generation:false});return g;
}
let fixtureId=0;
function mushroom(g,x,y=13) {
  const prop={id:`qa-mushroom:${++fixtureId}`,type:'mushroom',x,y,r:17,aimY:y-13,sortY:y,seed:.5,state:'idle',fuse:0,maxFuse:.9,blastRadius:82};
  g.environment.props.push(prop);return prop;
}

const dry=arena(),muddy=landscape();
muddy.environment.muds.push({id:'qa-mud',type:'mud',x:0,y:19.8,rx:400,ry:120,seed:.5});
const dryEnemy=monster(dry,'slime',-150,5.8),mudEnemy=monster(muddy,'slime',-150,5.8);
dryEnemy.speed=mudEnemy.speed=100;
dry.update(.05,{x:1});muddy.update(.05,{x:1});
assert(muddy.player.x<dry.player.x&&mudEnemy.x<dryEnemy.x,'mud slows both actual player and enemy movement');
assert(Math.abs(muddy.player.x/dry.player.x-(mudEnemy.x+150)/(dryEnemy.x+150))<1e-10,'both sides receive the same terrain slowdown');
const onePatch=landscape(),twoPatches=landscape();
for(const g of [onePatch,twoPatches])g.environment.muds.push({id:'one',type:'mud',x:0,y:19.8,rx:100,ry:60});
twoPatches.environment.muds.push({id:'two',type:'mud',x:0,y:19.8,rx:100,ry:60});
onePatch.update(.05,{x:1});twoPatches.update(.05,{x:1});
assert.equal(onePatch.player.x,twoPatches.player.x,'overlapping mud does not stack slowdown');
muddy.player.x=600;const beforeClear=muddy.player.x;muddy.update(.05,{x:1});
assert(Math.abs(muddy.player.x-beforeClear-dry.player.speed*.05)<1e-9,'movement immediately returns to normal outside the patch');
const dryRush=arena(),mudRush=landscape();
mudRush.environment.muds.push({id:'rush-mud',type:'mud',x:0,y:19.8,rx:400,ry:120});
for(const g of [dryRush,mudRush]) {
  const boar=monster(g,'boar',-150,-.2);
  boar.charge={phase:'rush',life:.8,maxLife:.8,dx:1,dy:0,startX:-150,startY:19.8};
  g.update(.05);
}
assert(mudRush.enemies[0].x<dryRush.enemies[0].x,'charging movement also respects mud');

const passable=landscape(),walkedOver=mushroom(passable,40,19.8);
advance(passable,.5,{x:1});
assert(passable.player.x>100,'a mushroom is not an invisible solid obstacle');
assert.equal(walkedOver.state,'idle','walking over a mushroom does not arm it');

for(const source of ['arrow','orbit','pulse','echo','lightning','storm']) {
  const g=landscape(),prop=mushroom(g,source==='echo'?190:source==='orbit'?74:100);
  if(source==='arrow') {monster(g,'slime',220);shootOnce(g);advance(g,.2);}
  if(source==='orbit') {g.levels.orbit=1;g.update(0);}
  if(source==='pulse') {g.levels.pulse=1;g._pulse=0;g.update(0);}
  if(source==='echo') {
    g.levels.pulse=5;g.branches.pulse='echoes';g._pulse=0;g.update(0);
    assert.equal(prop.state,'idle','the outer mushroom is beyond the first pulse');advance(g,.36);
  }
  if(source==='lightning') {monster(g,'slime',100);g.levels.lightning=1;g._lightning=0;g.update(0);}
  if(source==='storm') {
    const hidden=mushroom(g,700);g.update(0,{skill:true});
    assert.equal(hidden.state,'idle','screen lightning cannot arm an offscreen mushroom');
  }
  assert.equal(prop.state,'armed',`the real ${source} weapon path arms a mushroom`);
  assert.equal(prop.source,source);
}

const blast=landscape();blast.player.x=30;
const bomb=mushroom(blast,100,19.8),near=monster(blast,'slime',130,5.8),outside=monster(blast,'slime',220,5.8);
blast.environment.hitAt(bomb.x,bomb.aimY,0,'arrow');
const beforeBlast={player:blast.player.hp,near:near.hp,outside:outside.hp};
advance(blast,.85);assert.deepEqual({player:blast.player.hp,near:near.hp,outside:outside.hp},beforeBlast,'an armed mushroom deals no damage during its fuse');
const savedFuse=bomb.fuse;blast.environment.hitAt(bomb.x,bomb.aimY,30,'pulse');
assert.equal(bomb.fuse,savedFuse,'repeated hits cannot restart or accelerate a lit fuse');
blast.status='upgrade';advance(blast,1);blast.environment.update(.05);assert.equal(bomb.fuse,savedFuse);
blast.status='playing';advance(blast,.075);
assert.equal(blast.player.hp,beforeBlast.player-12,'the blast damages the player through the normal damage path');
assert(beforeBlast.near-near.hp>80&&beforeBlast.near-near.hp<100,'the nearby enemy receives environmental damage');
assert.equal(outside.hp,beforeBlast.outside,'the blast does not reach a distant enemy');
assert(!blast.environment.props.includes(bomb));assert.equal(blast.events.filter(e=>e.type==='mushroomBlast').length,1);
const afterBlast=near.hp;advance(blast,.5);assert.equal(near.hp,afterBlast,'a spent mushroom cannot explode repeatedly');

const chain=landscape(),first=mushroom(chain,180,19.8),second=mushroom(chain,268,19.8);
const chainTarget=monster(chain,'slime',330,5.8);chain.environment.hitAt(first.x,first.aimY,0,'arrow');
advance(chain,.9);
assert.equal(second.state,'armed');assert.equal(second.source,'chain');
assert.equal(chainTarget.hp,10000,'the first explosion does not instantly detonate the next mushroom');
advance(chain,.85);assert.equal(chainTarget.hp,10000,'a chain reaction retains a full new warning fuse');
advance(chain,.075);assert(chainTarget.hp<10000);assert.equal(chain.events.filter(e=>e.type==='mushroomBlast').length,2);

const reward=landscape(),rewardBomb=mushroom(reward,150,19.8),victim=monster(reward,'slime',150,5.8);
victim.hp=50;const rewardXp=victim.xp;reward.environment.hitAt(rewardBomb.x,rewardBomb.aimY);advance(reward,1);
assert.equal(reward.kills,1);assert.equal(xpTotal(reward),rewardXp,'environmental kills use the normal single XP reward');
advance(reward,1);assert.equal(reward.kills,1);assert.equal(xpTotal(reward),rewardXp);

const fatal=landscape();fatal.player.hp=1;
const fatalBomb=mushroom(fatal,50,19.8),waitingBomb=mushroom(fatal,130,19.8),remote=monster(fatal,'slime',300,5.8);
fatal.environment.hitAt(fatalBomb.x,fatalBomb.aimY);advance(fatal,1);
assert.equal(fatal.status,'dead');assert.equal(waitingBomb.state,'idle','death stops newly chained explosions');
const deadHp=remote.hp,deadFuse=waitingBomb.fuse;advance(fatal,2);fatal.environment.update(.05);
assert.equal(remote.hp,deadHp);assert.equal(waitingBomb.fuse,deadFuse,'environment timers stop after the player dies');
const escaped=landscape(),abandonedBomb=mushroom(escaped,100),abandonedVictim=monster(escaped,'slime',100);
escaped.environment.hitAt(abandonedBomb.x,abandonedBomb.aimY);escaped.player.x=3000;escaped.update(.05);
assert(!escaped.environment.props.includes(abandonedBomb));assert.equal(abandonedVictim.hp,10000);assert.equal(escaped.kills,0,'discarding a distant fuse grants no remote kill');

// DOT and environmental kills run before due Boss attacks resolve.
for(const kind of ['ancient','bloom']) {
  const dot=arena();dot.levels.orbit=1;dot.bossCount=kind==='bloom'?2:1;
  const boss=monster(dot,'boss',74);boss.bloomCooldown=0;boss.bloomNext='burst';dot.update(0);
  assert(boss.bleed);const warning=kind==='bloom'?boss.bloomAttack:boss.slam;assert(warning);
  dot.levels.orbit=0;boss.hp=1;boss.bleed.nextTick=.001;warning.life=.001;
  dot.update(.025);
  assert(boss.hp<=0&&!boss.bleed&&!boss.shock);assert.equal(dot.bossKills,1);
  assert(!dot.events.some(e=>e.type==='bossSlam'||e.type==='bloomBurst'),'a same-frame bleed kill cancels the pending Boss attack');
  assert.equal(dot.player.hp,dot.player.maxHp);const once=xpTotal(dot);advance(dot,1);
  assert.equal(dot.bossKills,1);assert.equal(xpTotal(dot),once,'a DOT kill cannot be rewarded again on later ticks');

  const environmental=landscape();environmental.bossCount=kind==='bloom'?2:1;
  const otherBoss=monster(environmental,'boss',140,-21.2);otherBoss.bloomCooldown=0;otherBoss.bloomNext='burst';
  environmental.update(0);const otherWarning=kind==='bloom'?otherBoss.bloomAttack:otherBoss.slam;assert(otherWarning);
  const prop=mushroom(environmental,140,19.8);environmental.environment.hitAt(prop.x,prop.aimY);
  otherBoss.hp=1;otherWarning.life=.001;prop.fuse=.001;environmental.update(.025);
  assert.equal(environmental.bossKills,1);assert.equal(environmental.player.hp,environmental.player.maxHp);
  assert(!environmental.events.some(e=>e.type==='bossSlam'||e.type==='bloomBurst'),'a same-frame mushroom kill also cancels the pending Boss attack');
}

const generated=arena();generated.environment=new Environment(generated);
const env=generated.environment;assert(env.props.length>0&&env.muds.length>0,'the seeded world contains both interactions');
for(const prop of env.props) {
  assert(Math.hypot(prop.x,prop.y)>ENVIRONMENT_BALANCE.safeRadius+prop.r,'mushrooms leave a clear starting area');
  assert(generated.terrain.isFree(prop.x,prop.y,prop.r));
}
for(const mud of env.muds)assert(Math.hypot(mud.x,mud.y)>ENVIRONMENT_BALANCE.safeRadius+Math.max(mud.rx,mud.ry),'mud leaves a clear starting area');
const consumed={...env.props[0]},rememberedMud={...env.muds[0]};
env.hitAt(consumed.x,consumed.aimY);generated.player.x=5000;env.update(.05);env._refresh(true);
for(let i=0;i<35;i++) {
  generated.player.x=5000+i*900;generated.player.y=(i%7)*800;env._refresh(true);
  assert(env.props.length<=ENVIRONMENT_BALANCE.maxProps&&env.muds.length<=ENVIRONMENT_BALANCE.maxMuds,'exploration preserves the live environmental budgets');
}
generated.player.x=0;generated.player.y=0;env._refresh(true);
assert(!env.props.some(p=>p.id===consumed.id),'an armed location cannot respawn after leaving and returning');
const sameMud=env.muds.find(m=>m.id===rememberedMud.id);assert(sameMud);
assert.equal(sameMud.x,rememberedMud.x);assert.equal(sameMud.y,rememberedMud.y,'revisited mud has a stable world position');

const objectives=landscape();objectives.adventure=new Adventure(objectives,{generation:false});
mushroom(objectives,500,19.8);
objectives.environment.muds.push({id:'objective-mud',type:'mud',x:800,y:19.8,rx:80,ry:45});
assert.equal(objectives.adventure.spawnTreasure(550,19.8),null,'treasure cannot appear inside a nearby mushroom blast zone');
assert.equal(objectives.adventure.spawnTreasure(800,19.8),null,'treasure cannot appear inside mud');
assert(objectives.adventure.spawnTreasure(1100,19.8),'a clear, sufficiently distant treasure position remains available');
objectives.adventure.treasure=null;
const starterSupply=objectives.adventure._supplyAt(0,0);assert(starterSupply);
mushroom(objectives,starterSupply.x,starterSupply.y);
assert.equal(objectives.adventure._supplyAt(0,0),null,'generated supplies also avoid the mushroom danger zone');

const stable=arena();stable.adventure=new Adventure(stable,{generation:false});stable.environment=new Environment(stable);
const stableEnv=stable.environment,stableProp={...stableEnv.props[0]},stableMud={...stableEnv.muds[0]};
const mushroomCell=stableProp.id.match(/^mushroom:(-?\d+),(-?\d+):/),mudCell=stableMud.id.match(/^mud:(-?\d+),(-?\d+)$/);
const readProp=()=>stableEnv._mushroomsAt(+mushroomCell[1],+mushroomCell[2]).find(p=>p.id===stableProp.id);
const readMud=()=>stableEnv._mudAt(+mudCell[1],+mudCell[2]);
stable.adventure.props.push({id:'dynamic-crate',x:stableProp.x,y:stableProp.y,r:18});
assert(!readProp(),'a dynamic objective suppresses the occupied fixed mushroom location');
stable.adventure.props=[];const restoredProp=readProp();assert(restoredProp);
assert.equal(restoredProp.x,stableProp.x);assert.equal(restoredProp.y,stableProp.y,'removing a crate restores the same mushroom location without migrating its ID');
stable.adventure.props.push({id:'dynamic-crate',x:stableMud.x,y:stableMud.y,r:18});
assert.equal(readMud(),null,'a dynamic objective suppresses an occupied fixed mud location');
stable.adventure.props=[];const restoredMud=readMud();assert(restoredMud);
assert.equal(restoredMud.x,stableMud.x);assert.equal(restoredMud.y,stableMud.y,'removing the dynamic objective restores the same mud geometry');

console.log('Protagonist and interaction mechanics: fixed starting state, open skill slots, bleed/shock reactions, mud, delayed mushrooms, bounded world state and interrupted Boss attacks passed.');
