import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain} from './dist/terrain.js';

const game=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false,questStorage:null});
game.player.x=game.player.y=0;game.enemies=[];game._spawn=game.nextBossAt=Infinity;
const enemy=game._spawnEnemy('slime');Object.assign(enemy,{x:120,y:0,hp:1000,maxHp:1000,speed:0});
game._rebuildGrid();
const runtime=game.quests.sidequests;let carrying=false;
Object.defineProperty(runtime,'blocksPlayerAttacks',{get:()=>carrying});
const buildBefore=JSON.stringify(game.build);
assert(game.abilities.cast('fireball',game.player,{target:enemy}));
assert(game.abilities.cast('fireball',enemy,{target:game.player}));
const shield=game.abilities.statusFor(game.player);shield.shield=35;shield.shieldUntil=20;
const burn=game.abilities.statusFor(enemy);burn.burn={caster:game.player,damage:4,interval:1,nextAt:1,until:10,hostile:false};
game.bullets.push({owner:'player',life:2});
carrying=true;assert(game._syncQuestAttackBlock());
assert.equal(game.bullets.length,0,'lifting a box cancels already launched hero attacks');
assert(game.abilities.effects.every(effect=>effect.caster!==game.player),'hero spells stop while both hands are occupied');
assert(game.abilities.effects.some(effect=>effect.caster===enemy),'lifting a box cannot cancel enemy spells');
assert.equal(shield.shield,35,'defensive status is retained');assert.equal(burn.burn,null,'a cancelled cast cannot continue burning enemies');
assert(!game.canUseSkill('storm'));assert(!game.combat.canTarget(enemy,game.player));
assert.equal(game._hitEnemy(enemy,20,0,game.player,'sword'),0);assert.equal(enemy.hp,1000);
assert.equal(JSON.stringify(game.build),buildBefore,'carrying never edits weapon ranks, modifiers, or equipped state');
carrying=false;assert.equal(game._syncQuestAttackBlock(),false);assert(game.canUseSkill('storm'));
assert(game._hitEnemy(enemy,20,0,game.player,'sword')>0,'putting the box down restores combat immediately');
assert.equal(JSON.stringify(game.build),buildBefore);
// The same cancellation is used when a nonlethal duel ends. Other casters
// and defensive statuses remain live, but the old opponent cannot hit later.
game.abilities.cancelCaster(enemy);assert.equal(game.abilities.effects.length,0);
assert(!game.abilities.visualCasts.has(enemy));assert.equal(shield.shield,35);
console.log('Sidequest combat passed: carrying, residual spells, build preservation and caster-scoped cleanup.');
