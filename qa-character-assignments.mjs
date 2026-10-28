import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { foot } from './dist/sidequests/base.js';
import { characterSprites } from './dist/character-sprites.js';

await characterSprites.preload({load:async(url,atlas)=>({width:atlas.width,height:atlas.height})});
const worlds={
  'rift-forest':[['bow-rest','giver','hunter']],
  'verdant-rift':[['courier-race','giver','courier'],['divided-stone','giver','swordsman']],
  marsh:[['last-rollcall','giver','bellkeeper']],
  'clockshadow-city':[['market-pickpocket','thief','bandit'],['courtyard-stage','giver','troupeleader']],
  'ember-realm-large':[['potter-fire','giver','potter']]
};
const ctx={save(){},restore(){},translate(){},scale(){},transform(){},drawImage(){}};
for(const [worldId,assignments]of Object.entries(worlds)){
  const game=new Game({mode:'world',worldId,questStorage:null,environment:false,encounters:false});
  for(const [questId,key,sprite]of assignments){
    const scene=game.quests.sidequests.scenes.get(questId),entity=scene?.actors.get(key);
    assert(entity,`${worldId}/${questId}/${key} exists through normal quest setup`);
    assert.equal(entity.characterSpriteId,sprite);
    const position=foot(entity),before=JSON.stringify(entity);
    const actor={entity,x:entity.x,y:entity.y,footY:position.y,scale:1.1};
    assert(characterSprites.draw(ctx,actor));
    assert.equal(characterSprites.geometry(actor).footY,position.y);
    assert.equal(JSON.stringify(entity),before,'art does not mutate interaction, collision or quest state');
    assert(game.quests.getActors().includes(entity),'normal scene visitation exposes the real assigned actor');
  }
  assert.equal(game.player.characterSpriteId,undefined,'the actual hero keeps layered directional art');
  game.dispose();
}
console.log('Production character assignments passed: seven quest identities use distinct art through normal setup and retain their gameplay state.');
