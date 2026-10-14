import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

for(const search of ['', '?debug']){
  const h=harness(search),countNodes=h.pauseColumn.children.filter(node=>node.id==='debug-unit-counts');
  assert.equal(countNodes.length,search?1:0,'the two totals are exclusive to debug');
  if(!search)continue;
  const panel=countNodes[0];
  assert.equal(panel.textContent,'','the title screen has no stale adventure totals');
  h.nodes['start-button'].onclick();h.nodes['prepare-start-button'].onclick();await h.flush();
  h.run(`game=new Game({adventure:false,encounters:false,environment:false,settlements:false,companions:false,debug:true,debugOptions:{testFacilities:false,allBosses:false,allMonsters:false}});
    game.player.x=0;game.player.y=0;game.enemies=[];game.companions.members=[];game.companions.camps=[];game.relicSites.sites=[];
    game.settlements.sites=[{id:'count-merchant',type:'merchant',x:60,y:20,state:'ready'}];
    const nearUnit=game._spawnEnemy('slime',1);nearUnit.x=90;nearUnit.y=0;
    const farUnit=game._spawnEnemy('slime',1);farUnit.x=5000;farUnit.y=0;
    game.effects=[];game.bullets=[];game.enemyBullets=[];game.gems=[];game.coins=[];
    shippedRenderGame();resetDebugFps();
    updateDebugFps(0,true,0,0,{hasGame:true});updateDebugFps(501,true,0,0,{hasGame:true});`);
  assert.equal(panel.textContent,'场景 4\n屏幕 3','hero, merchant and nearby slime are on screen; distant slime remains in the scene');
  h.run(`game.enemies[1].x=215;shippedRenderGame();updateDebugFps(1002,true,0,0,{hasGame:true});`);
  assert.equal(panel.textContent,'场景 4\n屏幕 4','a sprite partially crossing the right edge is counted');
  h.run(`game.settlements.sites[0].state='spent';shippedRenderGame();updateDebugFps(1503,true,0,0,{hasGame:true});`);
  assert.equal(panel.textContent,'场景 3\n屏幕 3','a removed NPC disappears from both totals');
  h.run('resetDebugFps()');assert.equal(panel.textContent,'','restart resets the displayed totals');
}
console.log('Debug unit HUD: exactly two totals, normal-mode exclusion, actual render bounds, NPC lifecycle and restart reset passed.');
