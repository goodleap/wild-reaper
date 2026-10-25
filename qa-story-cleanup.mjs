import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';

function attacking(storyId,{release=false}={}){
  const game=new Game({mode:'story',storyId});game.story.advanceDialogue(true);
  game.build.levels.sword=3;game.build.levels.swordEnergy=1;game._refreshWeapons();
  const enemy=game._spawnEnemy('royalguard',1);
  Object.assign(enemy,{x:game.player.x+45,y:game.player.y+groundOffset(game.player,true)-groundOffset(enemy),storyId,storyEnemy:true,hp:10000,maxHp:10000});
  game._rebuildGrid();game.update(.02);
  assert(game.attacks.sword.pending&&game.player._heroAction,'The fixture starts a real melee attack.');
  if(release){
    for(let i=0;i<8&&!game.attacks.sword.energyWaves.length;i++)game.update(.025);
    assert(game.attacks.sword.energyWaves.length,'The fixture releases real sword-energy projectiles.');
  }
  return game;
}
function cleared(game){
  assert.equal(game.attacks.sword.pending,null);assert.equal(game.attacks.sword._visual,null);
  assert.equal(game.attacks.sword.energyWaves.length,0);assert.equal(game.player._heroAction,undefined);
  for(const list of [game.bullets,game.enemyBullets,game.effects,game.orbitals,game._pulseEchoes,game.abilities.effects,game.abilities.visualBursts,game.superSkills.fields,game.superSkills.swordFlights])assert.equal(list.length,0);
  assert.equal(game.story.actors.length,0);assert.equal(game.story.getProps?.().length??0,0);
  assert.equal(game.terrain._structureOwners.has(game.story.id),false);
}

for(const storyId of ['prologue','false-orders']){
  for(const reason of ['death','quit']){
    const game=attacking(storyId,{release:reason==='quit'}),build=game.build.serialize();
    if(reason==='death'){game.player.hp=0;game.status='dead';game.update(.02);}else game.dispose(reason);
    cleared(game);assert.deepEqual(game.build.serialize(),build,'Cleanup preserves the permanent build.');
    assert.equal(game.story.completed,false,'Exiting or dying never grants a chapter clear.');game.dispose();
  }
  const game=attacking(storyId,{release:true}),story=game.story;
  story.flow.go(storyId==='prologue'?'conversation':'departure');
  assert(story.dialogueBlocking,'The concluding dialogue survives combat cleanup.');
  story.advanceDialogue(true);
  assert.equal(story.getDialogue().departure,true);assert.equal(story.completed,false);assert.equal(game.sceneTransition.active,false);
  story.advanceDialogue(false);for(let i=0;i<40&&game.sceneTransition.active;i++)game.update(.025);
  assert.equal(game.status,'victory');assert(story.completed);assert(story.name);
  assert(game.events.some(event=>event.type==='storyCompleted'&&event.storyId===storyId),'Completion metadata remains available to the UI and archive.');
  cleared(game);game.dispose();
}
console.log('Story cleanup: real melee/projectile teardown on death, quit and confirmed chapter completion; ending dialogue, permanent build and completion metadata retained.');
