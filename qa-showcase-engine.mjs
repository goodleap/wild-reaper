import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {WorldSave} from './dist/world-save.js';
import {visitSceneUnits} from './dist/unit-counts.js';
import {importantActorName} from './dist/actor-labels.js';
import {groundOffset} from './dist/terrain.js';

const selected={characterShowcase:true,allMonsters:true,allBosses:true,fullLoadout:true,testFacilities:true,extraGold:true,zeroStormCooldown:true,fastMovement:false};
for(const mode of ['world','story','dungeon']){
  let writes=0;const storage={getItem:()=>null,setItem:()=>writes++,removeItem:()=>writes++};
  const game=new Game({mode,debug:true,debugOptions:selected,questStorage:storage});
  assert.equal(game.mode,'showcase');assert(game.showcase);assert.equal(game.story,null);
  assert.equal(game.quests.enabled,false);assert.equal(game.worldTravel.enabled,false);assert.equal(game.realms.enabled,false);
  assert.equal(game.sceneContent.allows('worldContent'),false);
  assert.equal(game.environment,null);assert.equal(game.adventure,null);
  assert.equal(game.settlements.sites.length,0);assert.equal(game.companions.members.length,0);
  assert.equal(game.canUseSkill('storm'),false);assert.equal(game._castStorm(),false);
  for(const key of ['allMonsters','allBosses','fullLoadout','testFacilities','extraGold','zeroStormCooldown'])assert.equal(game.debugOptions[key],false);
  assert.equal(game.debugOptions.fastMovement,false);assert.equal(selected.allMonsters,true,'the stored selection is not modified');
  const save=new WorldSave({storage});assert.equal(save.attach(game),false);assert.equal(save.capture(game),false);
  const hp=game.player.hp,appearance=game.player.appearanceId,first=game.showcase.actors[0].entity;
  const starts=game.showcase.actors.map(a=>({x:a.entity.x,y:a.entity.y})),seenFacings=new Set();
  for(let frame=0;frame<1200;frame++){
    game.update(.05,{x:1,y:frame<100?1:0,skill:true,interact:true});
    seenFacings.add(Math.round(first.facing*10));
  }
  assert(seenFacings.size>=2,'showcase actors repeatedly turn around');
  assert(game.showcase.actors.some((a,i)=>Math.hypot(a.entity.x-starts[i].x,a.entity.y-starts[i].y)>1));
  assert.equal(game.player.appearanceId,appearance);assert.equal(game.player.hp,hp);assert.equal(game.player.xp,0);assert.equal(game.kills,0);assert.equal(game.gold,0);
  assert.equal(game.player.groundY,game.player.y+groundOffset(game.player,true));
  for(const key of ['enemies','bullets','enemyBullets','gems','coins','effects'])assert.equal(game[key].length,0,`${key} stays empty even with combat input held`);
  assert.equal(game.storm,null);assert.equal(writes,0,'no progress or quest storage writes');
  const b=game.showcase.bounds;assert(game.player.x<b.maxX-game.player.r,'the viewing character remains inside the exhibition');
  const visited=[];assert.equal(visitSceneUnits(game,(entity,isPlayer)=>visited.push({entity,isPlayer})),game.showcase.actors.length+1);
  assert.equal(visited[0].entity,game.player);assert(visited.slice(1).every(({entity})=>importantActorName(entity,game.player)));
  assert.equal(importantActorName(game.player,game.player),'');
  game.status='paused';const snapshot=JSON.stringify(game.showcase.actors.map(a=>a.entity));game.update(.05,{x:1});
  assert.equal(JSON.stringify(game.showcase.actors.map(a=>a.entity)),snapshot,'paused display actors do not move');
  game.dispose();assert.equal(writes,0);
}
// A stored development choice cannot activate the alternate scene without
// debug authorization; ordinary constructors retain their existing mode.
const ordinary=new Game({debug:false,debugOptions:selected,adventure:false});
assert.equal(ordinary.mode,'world');assert.equal(ordinary.showcase,null);assert.equal(ordinary.debugOptions.characterShowcase,false);ordinary.dispose();
console.log('Showcase engine passed: all preparation modes, 60-second noncombat run, actual movement, labels, boundaries, pause and progress isolation; ordinary entry unchanged.');
