import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { Game } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { defenseDamageMultiplier } from './dist/combat-stats.js';

// UI owns its pause flags without changing Game.status. Exercise the shipped
// handlers and actual simulation, including start from a paused character page.
const h=harness('',{coarse:true});
const node=id=>h.document.getElementById(id),click=id=>h.fire(node(id),'click');
click('start-button');click('prepare-start-button');await h.flush();
h.run(`game.enemies=[];game.regionGrace=0;game.regionTransition=null;game.addExperience(1000000);game.realms._random=()=>0;updateHUD();`);
assert(h.run('game.realms.getAction()?.enabled'),'the actual starting position supports a trial without finding a special site');
assert.equal(h.run('game.player.level'),5);assert.equal(h.run('game.realms.getState().xpRemaining'),0);
click('pause-button');assert.equal(h.run('paused'),true);
click('pause-character-button');assert.equal(h.run('characterOpen'),true);assert.equal(h.run('game.status'),'playing');
node('realm-material-2').checked=true;h.fire(node('realm-material-2'),'change');click('start-tribulation');
assert.equal(h.run('characterOpen'),false);assert.equal(h.run('paused'),false);assert.equal(h.run('game.realms.active.materials'),2);assert.equal(h.run('game.realms.talismans'),1);
assert.equal(node('tribulation-progress').classList.contains('hidden'),false);
assert.equal(node('realm-ready').classList.contains('hidden'),true);
const elapsed=h.run('game.realms.active.elapsed');click('pause-button');for(let i=0;i<10;i++)h.tick();assert.equal(h.run('game.realms.active.elapsed'),elapsed,'pause suspends trial warnings and damage');click('resume-button');
for(let i=0;i<600&&!h.run('!game.realms.active');i++)h.tick();
assert.equal(h.run('game.player.level'),6);assert.equal(h.run('game.realms.label'),'筑基');assert.equal(h.run('game.realms.active'),null);assert.equal(h.run('game.realms.talismans'),1);

// A real world transition retains the service and the unlocked cap. Region
// cancellation must never dispose the whole growth service.
h.run(`const integratedRealms=game.realms;
  const integratedGate=game.regions.portals.find(portal=>portal.nextRegionIndex===1);
  game._switchRegion(integratedGate);game.addExperience(1000000);`);
assert.equal(h.run('game.realms===integratedRealms'),true);assert.equal(h.run('game.realms._disposed'),false);
assert.equal(h.run('game.player.level'),20);assert.equal(h.run('game.player.xp===game.player.xpNext'),true);
click('pause-button');click('home-button');assert.equal(h.run('game'),null);

// Realm support must not alter ordinary challenge damage. Compare actual hit
// resolution to the existing defense formula with different defenses/shields.
for(const defense of [0,8,28,108,500]) {
  const g=new Game({mode:'dungeon',terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false,companions:false});
  g.build.attributes.defense=Math.max(0,defense-g.hero.baseDefense);g._refreshStats();
  const hp=g.player.hp,expected=40*defenseDamageMultiplier(g.player.defense);
  assert(g._hurtPlayer(40));assert(Math.abs(hp-g.player.hp-expected)<1e-8,'ordinary challenge uses the same defense reduction');
  assert.equal(g.realms.active,null);assert.equal(g.realms.enabled,false);assert.equal(g._hurtPlayer(40),false,'normal hit invulnerability is preserved');
}
const shielded=new Game({mode:'dungeon',terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false,companions:false});
shielded.levels.toughness=5;shielded._refreshStats();assert(shielded.relics.acquire('leafWard'));assert(shielded.relics.grantWard(18));
const shieldHp=shielded.player.hp;assert(shielded._hurtPlayer(100));assert.equal(shielded.player.hp,shieldHp,'ordinary relic ward and barrier still absorb a defense-reduced challenge hit');
assert.equal(shielded.relics.wardAmount,0);assert(shielded.barrier.remaining>0);assert.equal(shielded.player.invuln,.8);
console.log('Realm integration: real paused UI start/material selection, timing, success, persistent growth after world transition and unchanged challenge damage passed.');
