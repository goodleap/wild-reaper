import assert from 'node:assert/strict';
import { portalDoor } from './dist/portal-geometry.js';
import { Game, WEAPON_BRANCHES, BALANCE } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

// Follow actual upgrade, projectile and weapon paths; suppress only unrelated
// world generation and automatic casts so each interaction has one cause.
let seed=976317;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._pulse=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g._updatePressure=()=>{};
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,x=200,y=0,type='slime') {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
function select(g,weapon,branch) {
  if(weapon==='arrow')g.levels.rapid=3;
  else g.levels[weapon]=4;
  const id=`branch:${weapon}:${branch}`;
  for(let i=0;i<6;i++) {
    g.crystalsNext=40;g.crystals=40;g.status='upgrade';g._choices=null;
    const choices=g.getUpgradeChoices();
    if(choices.some(c=>c.id===id)){assert(g.chooseUpgrade(id));return;}
    const other=choices.find(c=>!c.weaponId);assert(other);assert(g.chooseUpgrade(other.id));
  }
  assert.fail(`eligible branch ${id} was starved`);
}
function shot(g) {g._shot=0;g.update(0);g._shot=Infinity;}
const damage=e=>10000-e.hp;

assert.deepEqual(Object.keys(WEAPON_BRANCHES).sort(),['arrow','lightning','pulse']);
assert.deepEqual(WEAPON_BRANCHES.arrow.map(b=>b.branch),['pierce','ricochet']);
assert.deepEqual(WEAPON_BRANCHES.pulse.map(b=>b.branch),['echoes','control']);
assert.deepEqual(WEAPON_BRANCHES.lightning.map(b=>b.branch),['chain','focus']);
const early=arena();early.player.level=40;early.status='upgrade';
assert(!early.getUpgradeChoices().some(c=>c.weaponId==='arrow'),'high character level alone cannot unlock an untrained arrow branch');
for(const weapon of ['pulse','lightning']) {
  const g=arena();g.levels[weapon]=4;g.update(0);
  assert.equal(g.evolutions[weapon],false,'level four no longer silently evolves');
  g.levels[weapon]=5;g.update(0);
  assert.equal(g.evolutions[weapon],false,'an unselected fixture cannot invent a branch at level five');
}
const offer=arena();offer.levels.rapid=3;offer.crystalsNext=40;offer.crystals=40;offer.status='upgrade';offer.player.xp=17;
const choices=offer.getUpgradeChoices(),ids=choices.map(c=>c.id);
assert.equal(choices.length,3);assert.equal(new Set(ids).size,3);
assert.equal(choices.filter(c=>c.weaponId==='arrow').length,2);
assert(choices.filter(c=>c.weaponId).every(c=>c.kind===(c.weaponId==='arrow'?'武器分支':'技能分支')&&c.evolves===(c.weaponId!=='arrow')));
for(let i=0;i<10;i++)assert.deepEqual(offer.getUpgradeChoices().map(c=>c.id),ids,'reopening choices cannot reroll a branch offer');
const unconsumed={level:offer.player.level,xp:offer.player.xp,levels:structuredClone(offer.levels),branches:structuredClone(offer.branches)};
for(const invalid of ['branch:arrow:fake','branch:pulse:control','arrow','']) {
  assert.equal(offer.chooseUpgrade(invalid),false);
  assert.deepEqual({level:offer.player.level,xp:offer.player.xp,levels:offer.levels,branches:offer.branches},unconsumed);
  assert.equal(offer.status,'upgrade');assert.deepEqual(offer.getUpgradeChoices().map(c=>c.id),ids);
}
assert(offer.chooseUpgrade('branch:arrow:pierce'));assert.equal(offer.branches.arrow,'pierce');
assert.equal(offer.player.level,1);assert.equal(offer.player.xp,17,'branch selection uses the current upgrade without another XP charge');
assert.equal(offer.status,'playing');assert.equal(offer.chooseUpgrade('branch:arrow:ricochet'),false);
offer.status='upgrade';offer._choices=null;
assert(!offer.getUpgradeChoices().some(c=>c.weaponId==='arrow'),'a chosen branch excludes both arrow branch cards for this run');
assert.equal(offer.chooseUpgrade('branch:arrow:ricochet'),false);assert.equal(offer.branches.arrow,'pierce');

const deferred=arena();deferred.levels.rapid=3;deferred.levels.pulse=4;deferred.levels.lightning=4;
const seen=[];
for(let i=0;i<3;i++) {
  deferred.crystalsNext=40;deferred.crystals=40;deferred.status='upgrade';deferred._choices=null;const cards=deferred.getUpgradeChoices();
  const branches=cards.filter(c=>c.weaponId);assert.equal(branches.length,2);assert.equal(branches[0].weaponId,branches[1].weaponId);
  seen.push(branches[0].weaponId);const ordinary=cards.find(c=>!c.weaponId);assert(ordinary);
  assert(deferred.chooseUpgrade(ordinary.id));assert(Object.values(deferred.branches).every(b=>b===null));
}
assert.equal(new Set(seen).size,3,'deferring a branch rotates through other ready weapons without starving them');
for(const [weapon,branch] of [['pulse','echoes'],['lightning','focus']]) {
  const g=arena();select(g,weapon,branch);
  assert.equal(g.levels[weapon],5);assert.equal(g.branches[weapon],branch);assert.equal(g.evolutions[weapon],true);
  const displayed=g.skills.find(w=>w.id===weapon);
  assert(displayed.evolved);assert.equal(displayed.name,WEAPON_BRANCHES[weapon].find(b=>b.branch===branch).name);
  assert.equal(g.status,'playing','choosing the fifth level does not open a second dialog');
}

// Reverse array order catches a tempting endpoint-only/array-order shortcut.
const piercing=arena();select(piercing,'arrow','pierce');
const pierced=[330,250,170,90].map(x=>monster(piercing,x));shot(piercing);
assert.equal(piercing.bullets.length,1);assert.equal(piercing.bullets[0].branch,'pierce');
advance(piercing,.65);
const byPosition=[...pierced].sort((a,b)=>a.x-b.x),piercingDamage=byPosition.map(damage);
assert.equal(piercingDamage.filter(d=>d>0).length,3,'a piercing arrow has a finite three-enemy budget');
assert(Math.abs(piercingDamage[0]-32)<1e-8);assert(Math.abs(piercingDamage[1]/piercingDamage[0]-.65)<1e-8);
assert(Math.abs(piercingDamage[2]/piercingDamage[1]-.65)<1e-8);assert.equal(piercingDamage[3],0);
const swept=arena();select(swept,'arrow','pierce');
const far=monster(swept,200),near=monster(swept,90),middle=monster(swept,145);shot(swept);
swept.bullets[0].vx=6000;swept.update(.05);
assert(damage(near)>damage(middle)&&damage(middle)>damage(far)&&damage(far)>0,'swept hits resolve by traveled distance even in one large step');
assert.equal(swept.bullets.length,0,'exhausted penetrating arrows disappear');

const bouncing=arena();select(bouncing,'arrow','ricochet');
const bounced=[[90,0],[145,60],[200,0],[260,55]].map(([x,y])=>monster(bouncing,x,y));shot(bouncing);
let maxProjectiles=0;
for(let i=0;i<36;i++){bouncing.update(.025);maxProjectiles=Math.max(maxProjectiles,bouncing.bullets.length);}
assert.equal(bounced.filter(e=>damage(e)>0).length,3,'a ricochet has at most two jumps after the first hit');
assert(maxProjectiles<=1,'ricochets turn the same projectile instead of multiplying arrows');
const ricochetDamages=bounced.map(damage).filter(d=>d>0);
assert(ricochetDamages.every(d=>d<=BALANCE.arrowDamage),'bounces never amplify per-hit arrow damage');
for(const [width,height,axis] of [[390,690,'x'],[1100,300,'y']]) {
  const g=arena();g.viewWidth=width;g.viewHeight=height;select(g,'arrow','ricochet');
  const visible=monster(g,axis==='x'?160:0,axis==='y'?110:0),hidden=monster(g,axis==='x'?230:0,axis==='y'?190:0);
  shot(g);advance(g,.5);assert(damage(visible)>0);assert.equal(damage(hidden),0,'a bounce cannot retarget beyond either visible edge');
}
const spread=arena();select(spread,'arrow','ricochet');spread.levels.multishot=3;monster(spread,120);shot(spread);
assert.equal(spread.bullets.length,4,'branch selection preserves the existing multishot projectile budget');
assert.equal(spread.bullets[0].damage,32);assert(spread.bullets.slice(1).every(b=>b.damage===32*.6));

const echo=arena();select(echo,'pulse','echoes');echo._pulse=0;
const echoOuter=monster(echo,185);echo.update(0);
assert.equal(damage(echoOuter),0);assert.equal(echo._pulseEchoes.length,1);
echo.player.x=450;advance(echo,.3);assert.equal(damage(echoOuter),0);
const frozenEcho=structuredClone(echo._pulseEchoes);echo.status='paused';advance(echo,1);
assert.deepEqual(echo._pulseEchoes,frozenEcho);echo.status='playing';advance(echo,.06);
assert(Math.abs(damage(echoOuter)-54)<1e-8,'the echo branch retains its delayed original-location 60% strike');
const control=arena();select(control,'pulse','control');control._pulse=0;
const controlled=monster(control,195),outside=monster(control,260);control.update(0);
assert(damage(controlled)>0);assert.equal(damage(outside),0);assert.equal(control._pulseEchoes.length,0,'control expands the first wave without spawning an echo');
const clean=arena(),cleanEnemy=monster(clean,controlled.x,controlled.y);
controlled.speed=cleanEnemy.speed=100;
const start=controlled.x,normalStart=cleanEnemy.x;advance(control,.2);advance(clean,.2);
assert(start-controlled.x<(normalStart-cleanEnemy.x)*.8,'the control wave applies a real temporary enemy movement penalty');
const afterControl=controlled.hp;advance(control,.3);assert.equal(controlled.hp,afterControl,'control cannot hide an additional damage echo');
advance(control,.61);assert.equal(control._branchMovementMultiplier(controlled),1,'the control slow expires after its promised duration');
const guarded=arena();select(guarded,'pulse','control');guarded._pulse=0;
const guardedTarget=monster(guarded,120),immuneBoss=monster(guarded,-160,0,'boss');
guarded.elites.promote(guardedTarget,'shield');const guardedHp=guardedTarget.hp;guarded.update(0);
assert.equal(guardedTarget.hp,guardedHp);assert.equal(guarded._branchMovementMultiplier(guardedTarget),1,'a fully absorbed strike cannot plant a new movement debuff');
assert.equal(guarded._branchMovementMultiplier(immuneBoss),1,'control never slows a Boss');

const chain=arena();select(chain,'lightning','chain');chain._lightning=0;
const chainTargets=[60,140,220,300,380,460].map(x=>monster(chain,x));chain.update(0);
assert.equal(chainTargets.filter(e=>damage(e)>0).length,5);
assert(chainTargets.slice(0,3).every(e=>damage(e)===88));assert(chainTargets.slice(3,5).every(e=>Math.abs(damage(e)-35.2)<1e-8));
const focus=arena();select(focus,'lightning','focus');focus._lightning=0;
const close=monster(focus,80),healthy=monster(focus,150),boss=monster(focus,310,0,'boss');healthy.hp=healthy.maxHp=20000;
focus.update(0);
assert.equal(damage(close),0);assert.equal(healthy.hp,20000);assert.equal(damage(boss),220,'concentrated lightning prioritizes a visible Boss with one stronger strike');
assert(boss.shock,'the focused hit retains the normal lightning shock status');
assert.equal(focus._lightning,2.8);assert.equal(focus.effects.filter(e=>e.type==='lightning').length,1);
for(const state of ['paused','upgrade','relic']) {
  focus.status=state;advance(focus,2);assert.equal(focus._lightning,2.8);assert.equal(damage(boss),220,'focus cooldown and damage freeze outside combat');
}
focus.status='playing';
const tank=arena();select(tank,'lightning','focus');tank._lightning=0;
const weak=monster(tank,70),strong=monster(tank,200);strong.hp=strong.maxHp=20000;tank.update(0);
assert.equal(weak.hp,10000);assert.equal(strong.hp,19780,'without a Boss the focused hit chooses a durable visible target');

// Branches still reach the common relic/status/death path. A same-frame kill
// must cancel the Boss release before enemy attacks resolve.
for(const branch of ['chain','focus']) {
  const g=arena();select(g,'lightning',branch);g.relics.owned.push('thunderstone');g.player.skillCooldown=5;g._lightning=0;
  const boss=monster(g,120,0,'boss');boss.hp=1;boss.slam={life:.001,maxLife:1,x:0,y:19.8,r:100};
  g.update(.025);assert(boss.hp<=0);assert.equal(boss.slam,null);assert.equal(g.player.hp,g.player.maxHp);
  assert(g.player.skillCooldown<4.8,'lightning branch kills still trigger the thunderstone cooldown benefit');
  assert.equal(g.bossKills,1);assert(g.portal);assert.equal(g.enemyBullets.length,0);
}
const travel=arena();select(travel,'arrow','ricochet');select(travel,'pulse','control');select(travel,'lightning','focus');
const beforeTravel=structuredClone(travel.branches),travelBoss=monster(travel,280,0,'boss');travel._hurtEnemy(travelBoss,travelBoss.hp+1);
travel.player.x=travel.portal.x;travel.player.y=portalDoor(travel.portal).y-groundOffset(travel.player,true);
travel.regions.flushReward();assert(travel.chooseSuper(travel.getSuperChoices()[0].id));assert(travel.enterPortal());
assert.deepEqual(travel.branches,beforeTravel,'travel preserves all mutually exclusive branch choices');
assert.equal(travel._pulseEchoes.length,0);assert.equal(travel.bullets.length,0);
assert(Object.values(arena().branches).every(b=>b===null),'a new run resets branch choices');

console.log('Weapon branches: stable exclusive choices, deferred offers, bounded swept arrows and ricochets, distinct pulse/lightning paths, reactions and travel passed.');
