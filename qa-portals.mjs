import assert from 'node:assert/strict';
import { Game, REGIONS } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Adventure } from './dist/adventure.js';
import { Encounters } from './dist/encounters.js';

// Focused state transitions and enemy behaviors, not a long-run difficulty bot.
let seed=195870;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
function arena(options={}) {
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,...options});
  g.enemies=[];g.gems=[];g.events=[];g.effects=[];
  g._spawn=Infinity;g._shot=Infinity;g._lightning=Infinity;g.nextBossAt=Infinity;
  g.player.xpNext=Infinity;g.crystalsNext=Infinity;if(g.elites)g.elites.generation=false;
  return g;
}
function advance(g,seconds,input={}) {
  for(let left=seconds;left>1e-8;left-=.025)g.update(Math.min(.025,left),input);
}
function monster(g,type,x=200,y=0) {
  const e=g._spawnEnemy(type,1);Object.assign(e,{x,y,speed:0,hp:10000,maxHp:10000});return e;
}
const xpTotal=g=>g.player.xp;
function openPortal(g) {
  const boss=monster(g,'boss',280,-21.2);g._hurtEnemy(boss,boss.hp+1);
  assert(g.portal,'a defeated Boss opens a portal');return boss;
}
function standAtPortal(g) {g.player.x=g.portal.x;g.player.y=g.portal.y-groundOffset(g.player,true);}
function usePortal(g) {
  standAtPortal(g);g.update(0);g.update(0,{interact:true});
  if(g.status==='super')assert(g.chooseSuper(g.getSuperChoices()[0].id));
}

assert.deepEqual(REGIONS.map(r=>r.id),['forest','marsh','ruins']);
const access=arena(),firstBoss=openPortal(access),portalId=access.portal.id;
const firstOffer=access.superSkills.getChoices().map(c=>c.id);
access._hurtEnemy(firstBoss,100);
assert.equal(access.portal.id,portalId,'repeated death processing cannot create another portal');
assert.deepEqual(access.superSkills.getChoices().map(c=>c.id),firstOffer,'the same Boss reward cannot reroll its super skill offer');
assert.equal(access.enterPortal(),false,'a portal cannot be entered from far away');
standAtPortal(access);access.update(0);
assert.equal(access.regionIndex,0);assert.equal(access.status,'playing','walking into a portal never enters automatically');
for(const state of ['paused','upgrade','dead']) {
  access.status=state;assert.equal(access.enterPortal(),false);access.update(.05,{interact:true});
  assert.equal(access.regionIndex,0,`${state} blocks portal entry`);
}
access.status='playing';const blockingBoss=monster(access,'boss',450,0);
assert.equal(access.enterPortal(),false,'an active Boss prevents leaving its encounter');
access.enemies=access.enemies.filter(e=>e!==blockingBoss);access.update(0);access.update(0,{interact:true});
assert.equal(access.status,'super','explicit interaction opens the pending low-frequency reward');
const choices=access.getSuperChoices(),choiceIds=choices.map(c=>c.id);
assert.equal(choices.length,3);assert.equal(new Set(choiceIds).size,3);
for(let i=0;i<8;i++)assert.deepEqual(access.getSuperChoices().map(c=>c.id),choiceIds,'reopening a reward cannot reroll the offered super skills');
const frozen={time:access.time,cooldown:access.player.skillCooldown,x:access.player.x,y:access.player.y};
advance(access,2,{x:1,skill:true});
assert.deepEqual({time:access.time,cooldown:access.player.skillCooldown,x:access.player.x,y:access.player.y},frozen,'the super skill choice freezes combat, movement and timers');
assert.equal(access.chooseSuper('invalid-relic'),false);assert.equal(access.status,'super');
assert(access.chooseSuper(choiceIds[0]));assert.equal(access.region.id,'marsh');
assert.equal(access.chooseSuper(choiceIds[0]),false,'a repeated choice cannot duplicate a super skill or advance another map');
assert.equal(access.regionIndex,1);assert.equal(access.portal,null);

const travel=arena({hero:'warden',adventure:true,encounters:true,environment:true});
travel.time=241;travel._clock=241;travel.wave=5;travel.nextBossAt=500;travel.player.level=9;
Object.assign(travel.player,{hp:91,maxHp:210,xp:37,xpNext:600,skillCooldown:7.4});
Object.assign(travel.levels,{orbit:5,pulse:3,lightning:2,power:3,speed:2});
travel._syncEvolutions();travel._refreshStats();travel._refreshWeapons();
travel.relics.owned.push('leafWard');travel.relics.shieldReady=false;travel.relics.shieldCooldown=7.8;
travel.adventure.furyTime=4.3;travel.adventure.magnetTime=5.2;
const defeated=openPortal(travel);standAtPortal(travel);
const oldTerrain=travel.terrain,oldAdventure=travel.adventure,oldEnvironment=travel.environment,oldEncounters=travel.encounters;
const oldEnemy=monster(travel,'spore',400);oldEnemy.cast={life:.001,maxLife:.65,angle:0};
travel.enemyBullets.push({id:9001,x:999,y:999,r:6,vx:0,vy:0,life:1,damage:10});
travel.bullets.push({x:999,y:999,r:4,vx:0,vy:0,life:1,damage:10,pierce:1,hitIds:new Set()});
travel._pulseEchoes.push({x:999,y:999,r:180,damage:60,life:.01,maxLife:.35});
travel.storm={x:999,y:999,life:.3,maxLife:.65,targets:[]};
travel.effects.push({type:'old-map-effect',x:999,y:999,life:1,maxLife:1});
travel.gems.push({x:999,y:999,r:5,value:77});
travel.adventure.treasure={id:'old-chest',x:800,y:800,r:27,state:'locked',life:100};
travel.environment.props.push({id:'old-environment-prop',x:900,y:900,r:17,state:'armed',fuse:.01});
travel.encounters.active={id:'old-event',type:'hunt',x:800,y:800,r:210,life:10,goal:12,progress:3};
travel.events.push({type:'old-map-event'});
const preserved={
  hero:travel.player.heroId,hp:travel.player.hp,maxHp:travel.player.maxHp,xp:travel.player.xp,level:travel.player.level,xpNext:travel.player.xpNext,
  levels:structuredClone(travel.levels),evolutions:structuredClone(travel.evolutions),time:travel.time,clock:travel._clock,wave:travel.wave,
  skillCooldown:travel.player.skillCooldown,nextBossAt:travel.nextBossAt,shieldCooldown:travel.relics.shieldCooldown,
  fury:travel.adventure.furyTime,magnet:travel.adventure.magnetTime,kills:travel.kills,bossKills:travel.bossKills
};
assert(travel.enterPortal());assert.equal(travel.status,'super');advance(travel,2,{x:1,skill:true});
assert.equal(oldEnemy.cast.life,.001,'old enemy attacks remain frozen throughout the super skill choice');
assert.equal(oldEnvironment.props.find(p=>p.id==='old-environment-prop').fuse,.01,'old environmental fuses also freeze throughout the choice');
assert(travel.chooseSuper(travel.getSuperChoices()[0].id));
assert.deepEqual({
  hero:travel.player.heroId,hp:travel.player.hp,maxHp:travel.player.maxHp,xp:travel.player.xp,level:travel.player.level,xpNext:travel.player.xpNext,
  levels:travel.levels,evolutions:travel.evolutions,time:travel.time,clock:travel._clock,wave:travel.wave,
  skillCooldown:travel.player.skillCooldown,nextBossAt:travel.nextBossAt,shieldCooldown:travel.relics.shieldCooldown,
  fury:travel.adventure.furyTime,magnet:travel.adventure.magnetTime,kills:travel.kills,bossKills:travel.bossKills
},preserved,'travel preserves all earned progression, live buffs and global difficulty clocks');
assert.notEqual(travel.terrain,oldTerrain);assert.notEqual(travel.adventure,oldAdventure);assert.notEqual(travel.environment,oldEnvironment);assert.notEqual(travel.encounters,oldEncounters);
assert.equal(travel.enemies.length,0);assert.equal(travel.bullets.length,0);assert.equal(travel.enemyBullets.length,0);assert.equal(travel.gems.length,0);assert.equal(travel._pulseEchoes.length,0);assert.equal(travel.storm,null);
assert(!travel.events.some(e=>e.type==='old-map-event'));assert(!travel.effects.some(e=>e.type==='old-map-effect'));
assert.equal(travel.adventure.treasure,null);assert.equal(travel.encounters.active,null);
assert(!travel.environment.props.some(p=>p.id==='old-environment-prop'));
assert(travel.terrain.isFree(travel.player.x,travel.player.y+groundOffset(travel.player,true),travel.player.r+80),'the next map starts in a clear area');
assert(travel.player.invuln>0&&travel.regionGrace>0,'travel gives a short protected landing');
assert(travel.adventure._nextTreasureAt>travel.time+40&&travel.encounters.nextAt>travel.time+60,'new objectives schedule from the retained run clock');
advance(travel,.5);assert.equal(travel.enemies.length,0,'ordinary spawns wait during the landing grace period');
assert.equal(travel.adventure.treasure,null);assert.equal(travel.encounters.active,null,'old timestamps cannot trigger objectives immediately after travel');
assert.equal(travel.nextBossAt,preserved.nextBossAt,'travel does not reset or accelerate the Boss schedule');

const route=arena(),routeIds=[route.region.id],terrainSignatures=[];
for(let i=0;i<3;i++) {
  route.time=180+i*180;route.wave=1+Math.floor(route.time/60);openPortal(route);usePortal(route);
  routeIds.push(route.region.id);assert.equal(route.regionIndex,i+1);
  terrainSignatures.push(JSON.stringify(route.terrain.query(200,-900,1100,900).map(o=>[o.type,o.x,o.y,o.r])));
  assert.equal(route.time,180+i*180);assert.equal(route.wave,1+Math.floor(route.time/60),'regional travel retains endless difficulty progression');
}
assert.deepEqual(routeIds,['forest','marsh','ruins','forest']);
assert.equal(new Set(terrainSignatures).size,3,'each region transition builds a different seeded map');

const xpChoice=arena();openPortal(xpChoice);standAtPortal(xpChoice);
xpChoice.crystalsNext=40;xpChoice.crystals=41;const savedXp=xpChoice.player.xp;
assert(xpChoice.enterPortal());assert(xpChoice.chooseSuper(xpChoice.getSuperChoices()[0].id));
assert.equal(xpChoice.crystals,41,'the region transition itself never consumes earned crystals');
assert.equal(xpChoice.status,'upgrade','banked crystals open their normal choice after the super reward transition');
assert.equal(xpChoice.player.level,1);assert.equal(xpChoice.player.xp,savedXp,'the separate super reward never loses or duplicates XP');
assert(xpChoice.chooseUpgrade(xpChoice.getUpgradeChoices()[0].id));assert.equal(xpChoice.crystals,1);

const mixed=arena();
for(const [i,id] of ['shield','swift','summoner'].entries())assert(mixed.elites.promote(monster(mixed,'slime',150+i*80),id));
assert.equal(mixed.elites.promote(monster(mixed,'slime',420),'shield'),false,'at most three living affix elites coexist');
const natural=arena();natural.elites.generation=true;const early=monster(natural,'slime');
const originalRandom=Math.random;
try {
  Math.random=()=>0;natural.time=44;assert.equal(natural.elites.maybePromote(early),false,'affixes do not appear during the opening grace period');
  natural.time=45;assert(natural.elites.maybePromote(early),'an eligible later spawn can receive a natural affix');
} finally {Math.random=originalRandom;}
for(const extras of [{type:'boss'},{type:'boar'},{elite:true},{guardianId:'guarded-chest'},{eventRole:'treasure'},{summoned:true}]) {
  const g=arena(),e=monster(g,'slime');Object.assign(e,extras);
  assert.equal(g.elites.promote(e,'swift'),false,'special enemies and summons cannot receive a second elite identity');
}

const shield=arena(),shielded=monster(shield,'slime',74);shield.levels.orbit=1;
assert(shield.elites.promote(shielded,'shield'));
const shieldHp=shielded.hp,shieldStart=shielded.affix.shield;shield.update(0);
assert.equal(shielded.hp,shieldHp);assert(shielded.affix.shield<shieldStart);
assert(!shielded.bleed,'a fully shielded orbit hit does not apply bleed to health');
shield.update(0,{skill:true});assert.equal(shielded.hp,shieldHp);assert(!shielded.shock,'a fully absorbed storm cannot mark the enemy as shocked');
shield.levels.orbit=0;shield.levels.lightning=1;shield._lightning=0;shielded.affix.shield=10;shield.update(0);
assert.equal(shielded.hp,shieldHp-38,'only lightning damage beyond the remaining shield reaches health');
assert(shielded.shock&&shielded.affix.shield===0);
assert.equal(shield.effects.filter(e=>e.type==='shieldBreak').length,1);
shield._hurtEnemy(shielded,20);assert.equal(shield.effects.filter(e=>e.type==='shieldBreak').length,1,'a broken shield produces one break effect');
const absorbedDot=arena(),bleeder=monster(absorbedDot,'slime',74);absorbedDot.levels.orbit=1;absorbedDot.update(0);assert(bleeder.bleed);
absorbedDot.levels.orbit=0;assert(absorbedDot.elites.promote(bleeder,'shield'));
const hpBeforeDot=bleeder.hp,shieldBeforeDot=bleeder.affix.shield;bleeder.bleed.nextTick=.001;absorbedDot.update(.025);
assert.equal(bleeder.hp,hpBeforeDot);assert(bleeder.affix.shield<shieldBeforeDot,'existing DOT also passes through the common shield damage path');

const swift=arena(),runner=monster(swift,'slime',-180,5.8);runner.speed=100;assert(swift.elites.promote(runner,'swift'));runner.affix.cooldown=0;
const windupX=runner.x;swift.update(.025);assert.equal(runner.affix.phase,'windup');advance(swift,.4);
assert.equal(runner.x,windupX,'a swift elite stays still throughout its readable windup');
advance(swift,.15);assert.equal(runner.affix.phase,'rush');const rushStart=runner.x;swift.update(.05);
assert(runner.x-rushStart>7.5,'the actual rush movement is faster than ordinary pursuit');
const frozenSwift={x:runner.x,y:runner.y,affix:structuredClone(runner.affix)};swift.status='upgrade';advance(swift,1);
assert.deepEqual({x:runner.x,y:runner.y,affix:runner.affix},frozenSwift,'a swift elite attack freezes with the game');
const blocked=arena({terrain:new Terrain({obstacles:[{id:'elite-wall',type:'rock',x:-85,y:19.8,r:35}]})});
const blockedRunner=monster(blocked,'slime',-180,5.8);blockedRunner.speed=100;blocked.elites.promote(blockedRunner,'swift');blockedRunner.affix.cooldown=0;
for(let i=0;i<80;i++) {
  blocked.update(.025);assert(blocked.terrain.isFree(blockedRunner.x,blockedRunner.y+groundOffset(blockedRunner),blockedRunner.r),'a swift rush cannot tunnel into terrain');
}

function summoner(g,x=250,y=5.8) {
  const e=monster(g,'slime',x,y);assert(g.elites.promote(e,'summoner'));e.affix.cooldown=0;return e;
}
const summoning=arena(),caster=summoner(summoning);summoning.update(.025);
assert.equal(caster.affix.phase,'windup');advance(summoning,.5);
assert.equal(summoning.enemies.filter(e=>e.summoned).length,0,'a summoner creates no enemy before its warning ends');
const summonWarning=structuredClone(caster.affix);summoning.status='upgrade';advance(summoning,1);
assert.deepEqual(caster.affix,summonWarning);summoning.status='playing';advance(summoning,.65);
const children=summoning.enemies.filter(e=>e.summoned);
assert.equal(children.length,2);
for(const child of children) {
  assert.equal(child.xp,0);assert.equal(child.summonerId,caster.id);assert(!child.affix);
  assert.equal(summoning.elites.promote(child,'summoner'),false,'summons cannot recursively become summoner elites');
  assert(summoning.terrain.isFree(child.x,child.y+groundOffset(child),child.r));
  assert(Math.hypot(child.x-summoning.player.x,child.y+groundOffset(child)-summoning.player.y-groundOffset(summoning.player,true))>75,'new summons do not materialize on the player');
}
caster.affix.cooldown=0;advance(summoning,.2);assert.equal(summoning.enemies.filter(e=>e.summoned).length,2,'one summoner cannot exceed its living minion allowance');
const beforeChildXp=xpTotal(summoning);summoning._hurtEnemy(children[0],children[0].hp+1);
assert.equal(xpTotal(summoning),beforeChildXp,'a summoned enemy cannot be farmed for experience');

const many=arena();for(const [x,y] of [[-250,-100],[0,250],[250,-100]]) {
  const e=summoner(many,x,y);e.affix.phase='windup';e.affix.life=.001;
}
many.update(.025);assert.equal(many.enemies.filter(e=>e.summoned).length,6,'three summoners share the global six-minion budget');
for(const e of many.enemies.filter(e=>e.affix)){e.affix.phase='windup';e.affix.life=.001;}
many.update(.025);assert.equal(many.enemies.filter(e=>e.summoned).length,6,'subsequent casts cannot exceed that shared budget');
const crowd=arena(),crowdCaster=summoner(crowd);
for(let i=1;i<179;i++)monster(crowd,'slime',900+(i%10)*30,700+Math.floor(i/10)*30);
crowdCaster.affix.phase='windup';crowdCaster.affix.life=.001;crowd.update(.025);
assert.equal(crowd.enemies.length,180,'summons also respect the ordinary total population cap');
const unseen=arena(),hiddenCaster=summoner(unseen,750);hiddenCaster.affix.phase='windup';hiddenCaster.affix.life=.001;
unseen.update(.025);assert(!unseen.enemies.some(e=>e.summoned),'an unseen summoner cannot create offscreen pressure');

for(const source of ['storm','bleed']) {
  const g=arena(),e=summoner(g,source==='bleed'?74:250,0);if(source==='bleed')g.levels.orbit=1;
  if(source==='bleed') {g.update(0);assert(e.bleed);g.levels.orbit=0;e.bleed.nextTick=.001;}
  e.hp=1;e.affix.phase='windup';e.affix.life=.001;g.update(.025,source==='storm'?{skill:true}:{});
  assert(e.hp<=0);assert(!g.enemies.some(child=>child.summoned),`a same-frame ${source} kill cancels a ready summon`);
}

const hunt=arena();hunt.adventure=new Adventure(hunt,{generation:false});hunt.encounters=new Encounters(hunt,{generation:false});
const huntEvent=hunt.encounters.spawn('hunt',0,19.8),affixed=monster(hunt,'slime',100,5.8);hunt.elites.promote(affixed,'swift');
hunt._hurtEnemy(affixed,affixed.hp+1);assert.equal(huntEvent.progress,0,'affix elites cannot count as ordinary hunt kills');
const minion=monster(hunt,'slime',100,5.8);minion.summoned=true;minion.xp=0;hunt._hurtEnemy(minion,minion.hp+1);
assert.equal(huntEvent.progress,0,'summoned enemies cannot farm hunt progress');
const ordinary=monster(hunt,'slime',100,5.8);hunt._hurtEnemy(ordinary,ordinary.hp+1);assert.equal(huntEvent.progress,1);

const populations=[];
for(const region of REGIONS) {
  const g=arena();g.region=region;g.time=90;const counts={};const savedRandom=Math.random;
  try {
    for(let i=0;i<240;i++) {
      g.enemies=[];g._spawn=0;Math.random=()=>((i+.5)/240);g.update(0);
      const type=g.enemies[0].type;counts[type]=(counts[type]||0)+1;
    }
  } finally {Math.random=savedRandom;}
  populations.push(counts);
  for(let i=0;i<240;i++) {g._spawn=0;g.update(0);}
  assert(g.enemies.length<=180&&g.enemies.filter(e=>e.type==='boar').length<=5&&g.enemies.filter(e=>e.type==='spore').length<=4,'regional preferences retain enemy type and population limits');
}
assert(populations[1].spore>populations[0].spore,'marsh produces more spore enemies under the same sampled spawn rolls');
assert(populations[2].beetle+populations[2].brute>populations[0].beetle+populations[0].brute,'ruins favor beetles and brutes without increasing the spawn count');

console.log('Portal and elite mechanics: deliberate travel, preserved progression, fresh worlds, region populations, shield/swift/summoner behavior and bounded rewards passed.');
