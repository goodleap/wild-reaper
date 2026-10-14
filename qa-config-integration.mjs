import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if(process.argv.includes('--configured-child')){
  // Install a replacement before importing any runtime catalogue. Fresh process
  // isolation proves production imports consume the chosen pack, not fixtures.
  const config=await import('./dist/content-config.js');
  const pack=structuredClone(config.getConfigSnapshot());pack.contentVersion='qa-remote-content';
  const role=pack.sections.heroes.definitions.find(hero=>hero.id==='traveler');
  role.name='QA traveler';role.statModifiers.maxHealth={multiplier:1.5,fixed:5};role.statModifiers.attack={multiplier:1.25,fixed:0};
  pack.sections.heroes.defaults.baseHealth=120;
  pack.sections.combat.weapons.sword.name='QA blade';
  pack.sections.combat.stats.weaponRules.sword.baseDamage=111;pack.sections.combat.stats.weaponRules.sword.damagePerRank=7;
  pack.sections.enemies.definitions.slime.baseHp=5432;pack.sections.enemies.definitions.slime.codex.name='QA slime';
  pack.sections.worlds.definitions.find(world=>world.id==='forest').name='QA forest';
  pack.sections.stages.definitions.find(stage=>stage.id==='forest-trial').name='QA stage';
  pack.sections.economy.shop.items.find(item=>item.id==='heal').price=17;
  pack.sections.economy.shop.items.find(item=>item.id==='heal').healing=41;
  pack.sections.companions.definitions.find(item=>item.kind==='dog').name='QA dog';
  await config.loadContentConfig({url:'https://configuration.invalid/content',fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(pack)})});
  assert.equal(config.getConfigLoadStatus().fallback,false,config.getConfigLoadStatus().reason);
  const [{Game},{Terrain},{weaponStats},{getUpgradeDefinition},{presentUpgrade},{characterPanelHTML},{ARCHIVE_ENTRY_BY_ID},{REGIONS},{STAGES},{companionDefinition},{getShopItems,buyShopItem}]=await Promise.all([
    import('./dist/engine.js'),import('./dist/terrain.js'),import('./dist/combat-stats.js'),import('./dist/combat-catalog.js'),import('./dist/upgrade-presentation.js'),import('./dist/character-panel.js'),import('./dist/archive-catalog.js'),import('./dist/world-definitions.js'),import('./dist/stage-definitions.js'),import('./dist/companion-catalog.js'),import('./dist/sites/settlement-content.js')
  ]);
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.gems=[];g.coins=[];g.effects=[];g.events=[];g._spawn=g.nextBossAt=g._shot=g._pulse=g._lightning=Infinity;g._updatePressure=()=>{};g.player.xpNext=g.crystalsNext=Infinity;g.player.x=g.player.y=0;
  assert.equal(g.configVersion,pack.contentVersion,'a run records its pinned content revision');
  assert.equal(g.hero.name,'QA traveler');assert.equal(g.player.maxHp,185);
  assert.match(characterPanelHTML(g),/185 \/ 185/,'inspector reflects the chosen role growth source');
  assert.equal(weaponStats(g,'sword').baseDamage,118);assert.equal(weaponStats(g,'sword').damage,147.5);
  const buildBefore=JSON.stringify(g.build.serialize()),preview=presentUpgrade(getUpgradeDefinition('sword'),g);
  assert(preview.rows.some(row=>row.before==='118'&&row.after==='125'),'upgrade preview derives from the replaced weapon stats');
  assert.equal(JSON.stringify(g.build.serialize()),buildBefore,'preview remains nonmutating');
  assert.equal(ARCHIVE_ENTRY_BY_ID.get('weapon:sword').name,'QA blade');
  assert.equal(ARCHIVE_ENTRY_BY_ID.get('enemy:slime').name,'QA slime');
  assert.equal(REGIONS[0].name,'QA forest');assert.equal(STAGES[0].name,'QA stage');assert.equal(companionDefinition('dog').name,'QA dog');
  const enemy=g._spawnEnemy('slime');assert.equal(enemy.maxHp,5432);Object.assign(enemy,{x:68,y:0,speed:0,xp:0});g._rebuildGrid();
  for(let i=0;i<10;i++)g.update(.025,{});
  assert.equal(5432-enemy.hp,147.5,'real sword collision applies configured base damage and role multiplier once');
  g.build.increment('sword');assert.equal(weaponStats(g,'sword').baseDamage,125,'accepted upgrade matches its preview');
  g.status='shop';g.player.hp=100;g.gold=50;
  const merchant={game:g,activeShop:{stock:{heal:1,magnet:0,fury:0,shield:0,relic:0},state:'ready'},closeShop(){g.status='playing';}};
  assert.equal(getShopItems(merchant).find(item=>item.id==='heal').price,17);
  assert.equal(buyShopItem(merchant,'heal'),true);assert.equal(g.gold,33);assert.equal(g.player.hp,141,'payment and healing use the same replacement as the shop preview');
  const snapshot=config.getConfigSnapshot();await config.loadContentConfig({url:'https://configuration.invalid/changed',fetchImpl:()=>{throw Error('must not fetch mid-run');}});
  assert.equal(config.getConfigSnapshot(),snapshot);assert.equal(g.configVersion,pack.contentVersion);
  console.log('Replacement content reaches actual combat, stat/upgrade/shop previews, worlds, stages, companions and codex; runtime snapshot is pinned.');
}else{
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--configured-child'],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);process.stdout.write(result.stdout);
  const {harness}=await import('./qa-app-harness.mjs');
  const h=harness();h.nodes['start-button'].onclick();
  const first=h.nodes['prepare-start-button'].onclick();
  assert(first&&typeof first.then==='function');assert.equal(h.run('startLoading'),true);assert.equal(h.run('game'),null,'constructor waits until loading can paint');
  assert(!h.nodes['scene-loading'].classList.contains('hidden'));assert.equal(h.nodes['prepare-start-button'].disabled,true);
  const second=h.nodes['prepare-start-button'].onclick();assert.equal(first,second,'double-click reuses pending startup');
  for(const code of ['KeyD','Space','KeyM','KeyC','Escape'])h.listeners['window:keydown']({code,key:code,target:h.nodes['game-canvas'],preventDefault(){}});
  h.nodes['touch-skill'].onclick();h.nodes['pause-button'].onclick();
  h.fire(h.nodes['game-canvas'],'pointerdown',{pointerId:1,clientX:90,clientY:200});
  assert.equal(h.run('keys.size'),0);assert.equal(h.run('skillRequested'),false);assert.equal(h.run('touch'),null);
  h.tick();assert.equal(h.run('archive.data.totals.runs'),0,'loading does not begin an archive run');
  await h.flush();assert.equal(await first,true);assert.equal(h.run('startLoading'),false);assert.equal(h.run('archive.data.totals.runs'),1);assert.equal(h.run('game.runTime'),0,'loading frames do not advance the simulation');
  assert(h.nodes['scene-loading'].classList.contains('hidden'));assert.equal(h.nodes['arena'].getAttribute('aria-busy'),'false');assert.equal(h.document.activeElement.id,'game-canvas');
  assert.equal(h.run('game.configVersion'),(await import('./dist/content-config.js')).getConfigSnapshot().contentVersion);
  h.tick();h.tick();assert(h.run('game.runTime')>0,'normal frames resume after loading');
  // A construction error preserves setup and cannot leave a half-recorded run.
  const failures=[],failure=harness('',{consoleImpl:{...console,error:(...args)=>failures.push(args)}});failure.nodes['start-button'].onclick();
  failure.run('const originalGame=Game;Game=class {constructor(){throw new Error("QA construction failure");}};');
  const failed=failure.nodes['prepare-start-button'].onclick();await failure.flush();assert.equal(await failed,false);
  assert.equal(failure.run('game'),null);assert.equal(failure.run('archive.data.totals.runs'),0);assert.equal(failure.run('startLoading'),true);
  assert(failure.nodes['scene-loading'].classList.contains('has-error'));assert.equal(failure.document.activeElement.id,'scene-loading-retry');
  failure.nodes['scene-loading-back'].onclick();assert.equal(failure.run('startLoading'),false);assert.equal(failure.run('prepareOpen'),true);assert(failure.nodes['scene-loading'].classList.contains('hidden'));
  const again=failure.nodes['prepare-start-button'].onclick();await failure.flush();assert.equal(await again,false);
  failure.run('Game=originalGame;');const retried=failure.nodes['scene-loading-retry'].onclick();await failure.flush();assert.equal(await retried,true);
  assert.equal(failure.run('archive.data.totals.runs'),1);assert.equal(failure.run('game.runTime'),0);
  assert.equal(failures.length,2,'the handled construction failures are reported');
  const previous=failure.run('game');failure.run('game.status="dead";');failure.tick();
  failure.run('Game=class {constructor(){throw new Error("QA restart failure");}};');
  const restartFailure=failure.nodes['restart-button'].onclick();await failure.flush();assert.equal(await restartFailure,false);
  assert.equal(failure.run('game'),previous);assert.equal(failure.run('archive.data.totals.runs'),1,'failed restart preserves previous game and record');
  failure.nodes['scene-loading-back'].onclick();assert.equal(failure.run('game'),previous);assert.equal(failure.run('startLoading'),false);
  failure.run('Game=originalGame;');

  const renderErrors=[],renderFailure=harness('',{consoleImpl:{...console,error:(...args)=>renderErrors.push(args)}});
  renderFailure.nodes['start-button'].onclick();renderFailure.run('renderGame=()=>{throw new Error("QA first-frame failure");};');
  const badFrame=renderFailure.nodes['prepare-start-button'].onclick();await renderFailure.flush();assert.equal(await badFrame,false);
  assert.equal(renderFailure.run('archive.data.totals.runs'),0,'a failed first render never records an adventure');
  assert.equal(renderFailure.run('archive.data.entries["weapon:sword"]'),undefined,'failed preparation does not unlock the starter');
  assert.equal(renderErrors.length,1,'the controlled warmup owns render failure handling');
  renderFailure.nodes['scene-loading-back'].onclick();assert.equal(renderFailure.run('game'),null);assert.equal(renderFailure.run('startLoading'),false);
  console.log('Async adventure: one start per double-click, loading paints first, locked input, no simulated/archive time during loading, failure return/retry and immediate control afterwards passed (VM DOM / mocked Canvas).');
}
