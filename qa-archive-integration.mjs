import assert from 'node:assert/strict';
import { harness, html } from './qa-app-harness.mjs';
import { ARCHIVE_STORAGE_KEY } from './dist/adventure-archive.js';

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'shipped modal and entry IDs remain unique');
const key=(h,code)=>h.listeners['window:keydown']({code,key:code==='Escape'?'Escape':code,repeat:false,target:h.nodes['game-canvas'],preventDefault(){}});
const click=(h,id)=>{h.nodes[id].focus();h.nodes[id].onclick();};
const start=h=>{
  click(h,'start-button');
  h.run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.regionGrace=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
};
const data=h=>JSON.parse(h.run('JSON.stringify(archive.data)'));
const archiveControl=(h,attribute,value)=>{
  const markup=h.nodes['archive-content'].innerHTML;
  assert(markup.includes(`data-archive-${attribute}="${value}"`),'control must exist in the current rendered panel');
  const button=h.document.createElement('button');button.setAttribute(`data-archive-${attribute}`,value);
  h.listeners['archive-content:click']({target:button});
};

// Real app title -> pause -> archive -> end lifecycle, using the shared frame
// harness. Canvas is mocked; these assertions make no browser/GPU claim.
{
  const h=harness();const {run,tick,nodes,document,listeners,storage}=h;
  click(h,'archive-button');
  assert.equal(run('archiveOpen'),true);assert.equal(document.activeElement.id,'close-archive');
  assert.doesNotMatch(nodes['archive-content'].innerHTML,/孢冠领主|符文穿击/,'unseen discoveries keep names and advice concealed');
  tick();const titleDraws=run('introDraws'),titleClock=run('clock');
  for(let i=0;i<4;i++)tick();
  assert.equal(run('introDraws'),titleDraws,'archive retains the title background');assert.equal(run('clock'),titleClock);
  key(h,'Escape');assert.equal(run('archiveOpen'),false);assert.equal(document.activeElement.id,'archive-button');
  assert.equal(data(h).totals.runs,0,'browsing before the first run never creates a run');

  start(h);tick();
  assert.equal(data(h).totals.runs,1);
  assert(data(h).entries['weapon:sword']);assert(data(h).entries['skill:storm']);
  assert.equal(data(h).entries['weapon:arrow'],undefined,'unowned weapons remain undiscovered');
  click(h,'pause-button');click(h,'pause-archive-button');
  archiveControl(h,'category','weapons');assert.match(nodes['archive-content'].innerHTML,/长剑/);assert.doesNotMatch(nodes['archive-content'].innerHTML,/翠羽飞矢/);
  archiveControl(h,'entry','weapon:arrow');assert.match(nodes['archive-content'].innerHTML,/尚未发现/);assert.doesNotMatch(nodes['archive-content'].innerHTML,/穿透适合直线/);
  archiveControl(h,'category','skills');assert.match(nodes['archive-content'].innerHTML,/天雷轰击/);assert.doesNotMatch(nodes['archive-content'].innerHTML,/王庭剑阵/);
  archiveControl(h,'category','weaponSkills');assert.doesNotMatch(nodes['archive-content'].innerHTML,/符文穿击/);
  archiveControl(h,'tab','records');assert.match(nodes['archive-content'].innerHTML,/一路走来/);
  archiveControl(h,'difficulty','casual');assert.equal(run('archiveView.difficulty'),'casual');
  archiveControl(h,'tab','milestones');assert.match(nodes['archive-content'].innerHTML,/冒险的足迹/);
  key(h,'Escape');click(h,'resume-button');
  run("keys.add('KeyD');skillRequested=true;portalRequested=true;touch={id:7,dx:1,dy:0};");
  click(h,'pause-button');click(h,'pause-archive-button');tick();
  assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested||portalRequested'),false);
  const pausedState=run('JSON.stringify([game.runTime,clock,game.player.x,game.player.y,game.player.skillCooldown])'),draws=run('gameDraws');
  key(h,'KeyD');key(h,'Space');key(h,'KeyE');key(h,'KeyC');key(h,'KeyM');
  listeners['game-canvas:pointerdown']({pointerId:12,clientX:100,clientY:100,preventDefault(){throw Error('archive must not start gameplay pointer capture');}});
  nodes['touch-skill'].onclick();
  assert.equal(run('keys.size'),0);assert.equal(run('skillRequested||portalRequested||characterOpen||mapOpen'),false);assert.equal(run('touch'),null);
  for(let i=0;i<8;i++)tick();
  assert.equal(run('gameDraws'),draws,'archive does not redraw a paused game');assert.equal(run('JSON.stringify([game.runTime,clock,game.player.x,game.player.y,game.player.skillCooldown])'),pausedState);
  key(h,'KeyP');assert.equal(run('archiveOpen'),false);assert.equal(run('paused'),true);assert.equal(document.activeElement.id,'pause-archive-button');
  assert.equal(nodes['pause-overlay'].classList.contains('hidden'),false);
  click(h,'resume-button');tick();assert.equal(run('paused'),false);assert(run('game.runTime')-JSON.parse(pausedState)[0]<.018,'closing archive does not catch up paused wall time');

  // Current active runs checkpoint on pause/pagehide, with repeated hooks safe.
  run('game.runTime=12;game.kills=7;game.player.level=4;game.wave=3;');
  listeners['window:pagehide']();listeners['window:pagehide']();
  assert.equal(data(h).totals.time,12);assert.equal(data(h).totals.kills,7);
  assert.equal(JSON.parse(storage.get(ARCHIVE_STORAGE_KEY)).totals.time,12);
  run("game.status='dead';");tick();
  assert.equal(run('runEnded'),true);assert.equal(data(h).best.normal.time,12);
  click(h,'end-archive-button');tick();const endedDraws=run('gameDraws');tick();assert.equal(run('gameDraws'),endedDraws);
  key(h,'Escape');assert.equal(run('runEnded'),true);assert.equal(document.activeElement.id,'end-archive-button');
  click(h,'home-button');run('home();');
  assert.equal(data(h).totals.runs,1);assert.equal(data(h).totals.time,12);assert.equal(data(h).totals.kills,7,'death then repeated home never double counts');
  const loaded=harness('',{storage});assert.equal(data(loaded).totals.kills,7,'reload reads the persisted archive');assert.equal(data(loaded).totals.runs,1);

  nodes['difficulty-casual'].checked=true;start(h);run('game.runTime=3;game.kills=2;');click(h,'pause-button');click(h,'quit-button');
  assert.equal(data(h).totals.runs,2);assert.equal(data(h).totals.time,15);assert.equal(data(h).totals.kills,9);
  assert.equal(data(h).best.casual.time,3);assert.equal(data(h).best.normal.time,12,'best records are separated by selected difficulty');
}

// Actual combat-resolution hook remains independent of the capped sound/VFX
// event queue. Castle kills and invulnerable practice dummies have distinct rules.
{
  const h=harness();start(h);
  h.run(`
  game.events=Array.from({length:100},()=>({type:'shoot'}));
  const archiveSlime=game._spawnEnemy('slime',1);archiveSlime.x=game.player.x+50;archiveSlime.y=game.player.y;archiveSlime.hp=1;archiveSlime.xp=0;
  game.combat.applyEnemyDamage(archiveSlime,2,0,game.player,'sword');
  const archiveCastle=game._spawnEnemy('boss',1);archiveCastle.x=game.player.x+60;archiveCastle.y=game.player.y;archiveCastle.hp=1;archiveCastle.xp=0;archiveCastle.dungeonBoss=true;
  game.combat.applyEnemyDamage(archiveCastle,2,0,game.player,'sword');
  const archiveDummy=game._spawnEnemy('slime',1);archiveDummy.x=game.player.x+80;archiveDummy.y=game.player.y;archiveDummy.hp=1;archiveDummy.maxHp=100;archiveDummy.trainingDummy=true;
  game.combat.applyEnemyDamage(archiveDummy,2,0,game.player,'sword');
  checkpointArchive();checkpointArchive();`);
  assert.equal(h.run('game.events.length'),100);assert.equal(h.run('game.bossKills'),0,'fixture exercises a castle Boss excluded by the legacy regional counter');
  assert.equal(data(h).totals.kills,2);assert.equal(data(h).totals.bossKills,1);
  assert.equal(data(h).entries['enemy:slime'].defeats,1);assert.equal(data(h).entries['boss:castle'].defeats,1);
  assert.equal(Object.keys(data(h).entries).some(id=>/dummy/i.test(id)),false);
  h.run('game.onEnemyDefeated(archiveSlime);game.onEnemyDefeated(archiveCastle);checkpointArchive();');
  assert.equal(data(h).entries['enemy:slime'].defeats,1);assert.equal(data(h).totals.bossKills,1,'defeat identity prevents duplicate callbacks');
}

// Observe the same screen-and-ground-visibility gate used by the shipped app.
// Dormant visible guards are discoverable; offscreen and wall-hidden guards are not.
{
  const h=harness();start(h);
  h.run(`
  game.player.x=game.player.y=0;
  game.enemies=[{type:'boar',id:2001,x:20,y:0,r:17,hp:10,guardActive:false},{type:'spore',id:2002,x:80,y:0,r:17,hp:10},{type:'beetle',id:2003,x:5000,y:0,r:17,hp:10}];
  const originalVision=game.dungeon.vision;game.dungeon.active={};game.dungeon.vision={isVisible:(x,y,r)=>x<60};
  observeArchive();game.dungeon.active=null;game.dungeon.vision=originalVision;`);
  assert(data(h).entries['enemy:boar'],'visible dormant guard is an encounter');
  assert.equal(data(h).entries['enemy:spore'],undefined,'wall-hidden enemy does not unlock');
  assert.equal(data(h).entries['enemy:beetle'],undefined,'offscreen enemy does not unlock');
}

for(const search of ['?debug','?debug=full']){
  const storage=new Map(),h=harness(search,{storage});const before=JSON.stringify(data(h));start(h);
  h.run("game.runTime=300;game.kills=999;game.bossKills=10;game.player.level=50;game.onEnemyDefeated({type:'boss',hp:0,dungeonBoss:true});checkpointArchive();game.status='dead';");h.tick();
  assert.equal(JSON.stringify(data(h)),before,`${search} cannot change formal stats or unlock the full build`);
  assert.match(h.nodes['end-archive-summary'].textContent,/调试对局/);assert.equal(storage.has(ARCHIVE_STORAGE_KEY),false);
  click(h,'end-archive-button');key(h,'Escape');click(h,'home-button');assert.equal(JSON.stringify(data(h)),before);
}

console.log('archive integration: modal freeze/input/focus, persistence/idempotence, difficulty, reliable defeat hooks, encounter visibility and debug isolation passed');
