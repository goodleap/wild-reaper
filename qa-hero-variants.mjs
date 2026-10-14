import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {HEROES,HERO_CHOICES,getHeroAppearance} from './dist/heroes.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {Environment} from './dist/environment.js';
import {movementProfile} from './dist/height-rules.js';
import {portalDoor} from './dist/portal-geometry.js';
import {AdventureArchive} from './dist/adventure-archive.js';
import {harness,html} from './qa-app-harness.mjs';

let seed=910071;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const baseIds=['traveler','princess','elder'];
const choiceIds=baseIds.flatMap(id=>[id,`${id}-v2`]);
const node=(h,id)=>h.document.getElementById(id);
const click=(h,id)=>h.fire(node(h,id),'click');
const choose=(h,group,id)=>{
  for(const value of group==='hero'?choiceIds:['sword','orbit','arrow'])node(h,`${group}-${value}`).checked=value===id;
  h.fire(node(h,`${group}-${id}`),'change');
};
const arena=(hero,appearanceId,extra={})=>new Game({hero,appearanceId,terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,encounters:false,...extra});
const stats=game=>({
  hp:game.player.hp,maxHp:game.player.maxHp,speed:game.player.speed,defense:game.player.defense,
  radius:game.player.r,ground:groundOffset(game.player,true),movement:movementProfile(game.player),
  cooldown:game.player.skillCooldownMax,stats:{...game.stats},build:game.build.serialize(),
  weapons:game.build.getWeaponLoadout(),skills:game.build.getSkillLoadout()
});

assert.deepEqual(HEROES.map(hero=>hero.id),baseIds,'appearances do not create new gameplay identities');
assert.deepEqual(HERO_CHOICES.map(choice=>choice.id),choiceIds,'each original is immediately followed by its new appearance');
const htmlIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(htmlIds).size,htmlIds.length,'new controls must not duplicate existing home-screen IDs');
for(const hero of HEROES){
  const original=HERO_CHOICES.find(choice=>choice.id===hero.id),next=HERO_CHOICES.find(choice=>choice.id===`${hero.id}-v2`);
  assert.equal(original.name,hero.name);assert.equal(next.name,`${hero.name}·新版`);
  assert.equal(original.heroId,hero.id);assert.equal(next.heroId,hero.id);
  assert.deepEqual(next.statModifiers,hero.statModifiers);assert.deepEqual(next.details,hero.details);
  assert.equal(getHeroAppearance(hero.id).id,hero.id,'legacy records use their original appearance');
  for(const invalid of [null,{},[],[`${hero.id}-v2`],0,true,'unknown','__proto__',...baseIds.filter(id=>id!==hero.id).flatMap(id=>[id,`${id}-v2`])]){
    assert.equal(getHeroAppearance(hero.id,invalid).id,hero.id,'invalid or cross-character appearance falls back to the chosen original');
    const game=arena(hero.id,invalid);assert.equal(game.appearanceId,hero.id);assert.equal(game.player.appearanceId,hero.id);
  }
  for(const difficulty of ['normal','casual'])for(const debug of [false,true])for(const initialWeaponId of ['sword','orbit','arrow']){
    const options={difficulty,debug,initialWeaponId},oldGame=arena(hero.id,hero.id,options),newGame=arena(hero.id,`${hero.id}-v2`,options);
    assert.deepEqual(stats(newGame),stats(oldGame),'appearance changes neither starting stats, skills, weapons nor collision');
    for(const game of [oldGame,newGame]){
      for(const upgrade of ['power','speed','vitality','magnet','fireball','sword'])assert(game.build.increment(upgrade));
      game._refreshStats();game._refreshWeapons();
      game.environment=new Environment(game,{generation:false});
      game.environment.muds.push({id:'variant-water',type:'mud',x:0,y:groundOffset(game.player,true),rx:100,ry:60});
    }
    assert.deepEqual(stats(newGame),stats(oldGame),'upgrades preserve the exact same gameplay rules');
    assert.deepEqual(newGame.environment.getImmersion(newGame.player,true),oldGame.environment.getImmersion(oldGame.player,true));
    assert.equal(newGame.environment.movementMultiplier(newGame.player,true),oldGame.environment.movementMultiplier(oldGame.player,true));
  }
}

// Real selection/start/restart and storage handlers, with only DOM/Canvas mocked.
for(const choice of HERO_CHOICES)for(const weaponId of ['sword','orbit','arrow']){
  const h=harness();click(h,'start-button');
  assert.equal(node(h,'hero-options').children.length,6);
  choose(h,'hero',choice.id);choose(h,'weapon',weaponId);
  assert.equal(node(h,'hero-selection-name').textContent,choice.name);
  assert.match(node(h,'prepare-summary').textContent,new RegExp(choice.name));
  assert.equal(h.run('archive.data.totals.runs'),0,'browsing animation never creates an adventure');
  click(h,'prepare-back-button');click(h,'start-button');assert(node(h,`hero-${choice.id}`).checked);
  const setup=JSON.parse(h.storage.get('wild-echoes-setup'));
  assert.equal(setup.heroId,choice.heroId);assert.equal(setup.appearanceId,choice.id);assert.equal(setup.weaponId,weaponId);
  click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.hero.id'),choice.heroId);assert.equal(h.run('game.player.heroId'),choice.heroId);
  assert.equal(h.run('game.appearanceId'),choice.id);assert.equal(h.run('game.player.appearanceId'),choice.id);
  assert.equal(h.run('game.build.heroId'),choice.heroId);assert.equal(h.run('game.initialWeaponId'),weaponId);
  assert.equal(h.run('archive.data.totals.runs'),1);
  h.run('game.status="dead"');h.tick();click(h,'restart-button');await h.flush();
  assert.equal(h.run('game.appearanceId'),choice.id);assert.equal(h.run('game.player.appearanceId'),choice.id);
  assert.equal(h.run('game.hero.id'),choice.heroId);assert.equal(h.run('game.initialWeaponId'),weaponId);
  assert.equal(h.run('archive.data.totals.runs'),2);
  const reload=harness('',{storage:h.storage});click(reload,'start-button');
  assert(node(reload,`hero-${choice.id}`).checked);assert(node(reload,`weapon-${weaponId}`).checked);
}

// A missing appearance is a legacy selection; malformed/cross-role appearances
// cannot accidentally change a valid chosen hero or its starter weapon.
for(const heroId of baseIds)for(const appearanceId of [undefined,'unknown',null,['princess-v2'],{},...baseIds.filter(id=>id!==heroId).map(id=>`${id}-v2`)]){
  const setup={heroId,appearanceId,weaponId:'arrow',mode:'free'},h=harness('',{storage:new Map([['wild-echoes-setup',JSON.stringify(setup)]])});
  click(h,'start-button');assert(node(h,`hero-${heroId}`).checked);
  click(h,'prepare-start-button');await h.flush();
  assert.equal(h.run('game.hero.id'),heroId);assert.equal(h.run('game.appearanceId'),heroId);assert.equal(h.run('game.initialWeaponId'),'arrow');
}
for(const heroId of [null,undefined,'unknown',['traveler'],{}]){
  assert.equal(getHeroAppearance(heroId,'traveler-v2').id,'traveler','invalid hero identity cannot opt into a new appearance');
  if(heroId!==undefined){const game=arena(heroId,'traveler-v2');assert.equal(game.hero.id,'traveler');assert.equal(game.appearanceId,'traveler');}
  const h=harness('',{storage:new Map([['wild-echoes-setup',JSON.stringify({heroId,appearanceId:'traveler-v2',weaponId:'arrow'})]])});
  click(h,'start-button');assert(node(h,'hero-traveler').checked);
}

// The selected character owns one animation preview, and all controls remain
// independent of adventure creation. Paused/covered/hidden previews do no work.
{
  const h=harness();click(h,'start-button');choose(h,'hero','princess-v2');h.tick();
  assert.equal(node(h,'hero-action-preview-name').textContent,getHeroAppearance('princess','princess-v2').name);
  assert.equal(h.run('heroPreview.entity.heroId'),'princess');assert.equal(h.run('heroPreview.entity.appearanceId'),'princess-v2');
  const before=h.run('heroPreview.time');h.tick();assert(h.run('heroPreview.time')>before);
  for(const direction of ['front','back','left','right']){
    click(h,`hero-preview-${direction}`);h.tick();assert.equal(h.run('heroPreview.direction'),direction);
    assert.equal(node(h,`hero-preview-${direction}`).getAttribute('aria-pressed'),'true');
  }
  for(const action of ['idle','walk','melee','ranged','cast','hurt','fall']){
    node(h,'hero-preview-action').value=action;h.fire(node(h,'hero-preview-action'),'change');h.tick();
    assert.equal(h.run('heroPreview.entity.heroAnimationPreview.action'),action);
  }
  click(h,'hero-preview-toggle');h.tick();
  const paused={time:h.run('heroPreview.time'),draws:h.run('heroPreview.draws')};
  for(let i=0;i<5;i++)h.tick();assert.equal(h.run('heroPreview.time'),paused.time);assert.equal(h.run('heroPreview.draws'),paused.draws);
  click(h,'hero-preview-back');h.tick();assert.equal(h.run('heroPreview.draws'),paused.draws+1,'paused direction change draws one requested pose');
  assert.equal(h.run('heroPreview.time'),paused.time);
  click(h,'hero-preview-toggle');h.tick();
  for(const modal of ['help','archive']){
    click(h,`prepare-${modal}-button`);const clock=h.run('heroPreview.time'),draws=h.run('heroPreview.draws');
    h.tick();h.tick();assert.equal(h.run('heroPreview.time'),clock);assert.equal(h.run('heroPreview.draws'),draws);
    h.listeners['window:keydown']({code:'Escape',key:'Escape',target:node(h,'game-canvas'),preventDefault(){}});
  }
  h.document.hidden=true;const hidden=h.run('heroPreview.time');h.tick();assert.equal(h.run('heroPreview.time'),hidden);h.document.hidden=false;
  const canvas=node(h,'hero-preview-canvas'),body=node(h,'prepare-body');
  canvas.getBoundingClientRect=()=>({top:900,bottom:1156});body.getBoundingClientRect=()=>({top:0,bottom:717});
  const offscreen=h.run('heroPreview.draws');h.tick();assert.equal(h.run('heroPreview.draws'),offscreen,'a scrolled-off preview stops drawing');
  assert.equal(h.run('game'),null);assert.equal(h.run('archive.data.totals.runs'),0);
  click(h,'prepare-back-button');const closed=h.run('heroPreview.draws');h.tick();assert.equal(h.run('heroPreview.draws'),closed);
}

// Castle/portal transitions retain the player object and appearance; archive
// records and companion identity remain attached to the existing hero type.
const place=(game,point)=>{game.player.x=point.x;game.player.y=point.y-groundOffset(game.player,true);};
for(const heroId of baseIds){
  const appearanceId=`${heroId}-v2`,game=new Game({hero:heroId,appearanceId,initialWeaponId:'orbit',stageId:'forest-trial'});
  game.crystalsNext=game.player.xpNext=Infinity;game.player.invuln=Infinity;
  assert(game.companions.recruit('stormcaller'));
  const player=game.player,build=game.build,member=game.companions.members[0];
  const check=()=>{
    assert.equal(game.player,player);assert.equal(game.build,build);assert.equal(game.hero.id,heroId);
    assert.equal(game.appearanceId,appearanceId);assert.equal(game.player.appearanceId,appearanceId);assert.equal(game.player.heroId,heroId);
    assert.equal(member.heroId,'stormcaller');assert.equal(game.build.heroId,heroId);
  };
  const castle=game.settlements.sites.find(site=>site.type==='castle');assert(castle);
  place(game,castle.door||{x:castle.interactionX??castle.x,y:castle.interactionY??castle.y});
  assert(game.dungeon.enter(castle));check();place(game,game.dungeon.active.entrance);assert(game.dungeon.exit());check();
  const portal=game.regions.portals.find(item=>item.nextMapId==='forest-heart');assert(portal);
  place(game,portalDoor(portal));assert(game.requestInteraction(portal.id));
  for(let frame=0;frame<32&&game.sceneTransition.active;frame++)game.update(.025);
  assert.equal(game.mapId,'forest-heart');check();
  const storage={getItem(){return null;},setItem(){}},archive=new AdventureArchive({storage});
  archive.begin(game);game.runTime=123;game.status='victory';game.stage.completed=true;game.stage.objectives.get(game.stage.definition.coreMapId).defeated=true;
  const summary=archive.finish(game,'victory');assert.equal(summary.stageCompletion.heroId,heroId);
  const record=archive.data.stages['forest-trial'].normal;
  assert.equal(record.bestHeroId,heroId);assert.equal(record.lastHeroId,heroId);
  assert(!JSON.stringify(record).includes('-v2'),'visual variants do not fragment existing hero records');
}
console.log('Hero variants: six adjacent choices / 18 real starter combinations, legacy and invalid saves, restart/reload, equal stats/build/immersion, castle and island transitions, unchanged companion and archive identities passed (VM DOM / mocked Canvas).');
