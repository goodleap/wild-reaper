import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { HEROES, HERO_CHOICES } from './dist/heroes.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { movementProfile } from './dist/height-rules.js';
import { portalDoor } from './dist/portal-geometry.js';
import { characterPanelHTML, characterPanelTitle } from './dist/character-panel.js';
import { harness } from './qa-app-harness.mjs';

let seed=830033;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
const choose=(h,group,id)=>{
  const ids=group==='hero'?HERO_CHOICES.map(hero=>hero.id):['sword','orbit','arrow'];
  for(const item of ids)node(h,`${group}-${item}`).checked=item===id;
  h.fire(node(h,`${group}-${id}`),'change');
};
const near=(value,expected,message)=>assert(Math.abs(value-expected)<1e-9,`${message}: ${value} != ${expected}`);
const expected={traveler:{hp:110,attack:32,speed:220,defense:8,magnet:105},princess:{hp:100,attack:32,speed:246.4,defense:0,magnet:126},elder:{hp:85,attack:28.16,speed:202.4,defense:0,magnet:105}};
const value=(html,id)=>html.match(new RegExp(`data-stat="${id}"><dt>[^<]*</dt><dd>([^<]*)</dd>`))?.[1];
const place=(game,point)=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};

// The real preparation handlers create all nine role/weapon combinations.
// Mocked DOM/Canvas only verifies behavior; it does not assert device layout.
for(const hero of HEROES)for(const weaponId of ['sword','orbit','arrow']){
  const h=harness(),stats=expected[hero.id];
  click(h,'start-button');
  assert.equal(node(h,'hero-options').children.length,3);
  choose(h,'hero',hero.appearanceId);choose(h,'weapon',weaponId);
  assert.equal(node(h,'hero-selection-name').textContent,hero.name);
  assert.match(node(h,'prepare-summary').textContent,new RegExp(hero.name));
  assert.equal(node(h,'hero-attributes').children.length,hero.details.length);
  assert.match(node(h,'hero-attributes').children[0].textContent,/^角色特性：/);
  assert.match(node(h,'hero-attributes').children[1].textContent,/^初始生命：/);
  const traitCopy=[...node(h,'hero-attributes').children,...node(h,'hero-traits').children].map(item=>item.textContent).join(' ');
  assert.doesNotMatch(traitCopy,/持续特性|固定加值|固定值/);
  if(hero.id!=='elder')assert.doesNotMatch(traitCopy,/-\d/,'standard heroes advertise positive bonuses only');
  assert.equal(node(h,'hero-attributes').closest('details')?.tagName,'DETAILS','full numerical traits stay in expandable details');
  assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0);
  click(h,'prepare-back-button');assert.equal(h.run('game'),null);
  click(h,'start-button');assert.equal(node(h,`hero-${hero.appearanceId}`).checked,true);
  assert.equal(h.run('archive.data.totals.runs'),0,'browsing roles never creates runs');
  click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.hero.id'),hero.id);assert.equal(h.run('game.player.heroId'),hero.id);
  assert.equal(h.run('game.initialWeaponId'),weaponId);
  assert.equal(h.run('JSON.stringify(game.weapons.map(item=>item.id))'),JSON.stringify([weaponId]));
  near(h.run('game.player.maxHp'),stats.hp,'selected role HP');
  near(h.run('game.player.defense'),stats.defense,'selected role defense');
  near(h.run('game.player.speed'),stats.speed,'selected role speed');
  const game=h.run('game'),panel=characterPanelHTML(game);
  assert.equal(characterPanelTitle(game),`${hero.name} · Lv.1`);
  assert.equal(value(panel,'health'),`${stats.hp} / ${stats.hp}`);
  for(const id of ['attack','defense','magnet'])near(Number(value(panel,id)),stats[id],`inspector ${id}`);
  near(Number(value(panel,'moveSpeed')),stats.speed,'inspector speed');
  assert.equal(h.run('archive.data.totals.runs'),1);
  const saved=JSON.parse(h.storage.get('wild-echoes-setup'));
  assert.equal(saved.heroId,hero.id);assert.equal(saved.weaponId,weaponId);
  h.run('game.status="dead";');h.tick();click(h,'restart-button');await h.flush();
  assert.equal(h.run('game.hero.id'),hero.id);assert.equal(h.run('game.initialWeaponId'),weaponId);
  assert.equal(h.run('archive.data.totals.runs'),2);
  const loaded=harness('',{storage:h.storage});click(loaded,'start-button');
  assert.equal(node(loaded,`hero-${hero.appearanceId}`).checked,true);assert.equal(node(loaded,`weapon-${weaponId}`).checked,true);
}

for(const heroId of [undefined,null,'warden','stormcaller','ranger','unknown','__proto__',['princess'],{}]){
  const saved={mode:'free',weaponId:'arrow',heroId},h=harness('',{storage:new Map([['wild-echoes-setup',JSON.stringify(saved)]])});
  click(h,'start-button');assert.equal(node(h,'hero-traveler-v2').checked,true);
  click(h,'prepare-start-button');await h.flush();assert.equal(h.run('game.hero.id'),'traveler');
  assert.equal(h.run('game.initialWeaponId'),'arrow','legacy role fallback does not erase a valid starter');
}

// Scene changes retain the same player and build, including non-default roles.
for(const hero of HEROES){
  const game=new Game({hero:hero.id,initialWeaponId:'orbit',stageId:'forest-trial'});
  game.crystalsNext=game.player.xpNext=Infinity;game.player.invuln=Infinity;
  const player=game.player,build=game.build,stats=expected[hero.id];
  assert(game.companions.recruit('stormcaller'));
  const member=game.companions.members[0],companionMaxHp=member.maxHp;
  const check=()=>{
    assert.equal(game.player,player);assert.equal(game.build,build);assert.equal(game.player.heroId,hero.id);
    assert.equal(game.hero.id,hero.id);assert.equal(game.player.r,15);assert.equal(movementProfile(player),'ground');
    near(game.player.maxHp,stats.hp,'scene role HP');near(game.player.speed,stats.speed,'scene role speed');
    assert.equal(member.heroId,'stormcaller');assert.equal(member.maxHp,companionMaxHp,'role selection does not transform a companion');
  };
  const castle=game.settlements.sites.find(site=>site.type==='castle');assert(castle);
  place(game,castle.door||{x:castle.interactionX??castle.x,y:castle.interactionY??castle.y});
  assert(game.dungeon.enter(castle));check();
  place(game,game.dungeon.active.entrance);assert(game.dungeon.exit());check();
  const portal=game.regions.portals.find(item=>item.nextMapId==='forest-heart');assert(portal);
  place(game,portalDoor(portal));assert(game.requestInteraction(portal.id));
  for(let frame=0;frame<32&&game.sceneTransition.active;frame++)game.update(.025);
  assert.equal(game.mapId,'forest-heart');check();
}

// Every role uses identical ground collision and immersion geometry; only its
// intended movement baseline changes. Debug applies the same multiplier.
let referenceWater;
for(const hero of HEROES)for(const debug of [false,true]){
  const game=new Game({hero:hero.id,debug,terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,encounters:false});
  game.environment=new Environment(game,{generation:false});
  game.environment.muds.push({id:'role-qa-water',type:'mud',x:0,y:groundOffset(game.player,true),rx:100,ry:60});
  const immersion=game.environment.getImmersion(game.player,true),profile={r:game.player.r,offset:groundOffset(game.player,true),sink:immersion.sink,maxSink:immersion.maxSink,width:immersion.width,slow:game.environment.movementMultiplier(game.player,true)};
  if(!referenceWater)referenceWater=profile;else assert.deepEqual(profile,referenceWater);
  near(game.player.speed,expected[hero.id].speed*(debug?3:1),'debug preserves role movement ratio');
  assert.equal(game.player.skillCooldownMax,debug?0:15);
}
console.log('Hero selection: all nine real role/starter combinations, old selection fallback, static portraits/back/restart/storage, effective inspector, castle/island persistence and shared ground/water geometry passed (VM DOM / mocked Canvas).');
