import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';

for(const search of ['', '?debug']){
  const {nodes,listeners,document,window,run,tick,resize,pauseColumn,clockReads,flush}=harness(search,{coarse:true});
  const debugDetails=pauseColumn.children.filter(node=>node.id==='debug-performance');
  assert.equal(debugDetails.length,search?1:0,'performance detail is attached once in debug and absent on normal URLs');
  assert.equal(run('diagnostics===null'),!search,'ordinary URLs allocate no diagnostic capture');
  if(!search){assert(nodes['debug-diagnostics'].classList.contains('hidden'));assert(nodes['diagnostic-live'].classList.contains('hidden'));assert.equal(nodes['diagnostic-start'].onclick,undefined);assert.equal(nodes['diagnostic-auto'].onclick,undefined);}
  nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();await flush();
  run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
  assert.equal(nodes['game-canvas'].width,786,'phone rendering retains native 2x detail within the pixel budget');
  assert.equal(run('game.viewWidth'),540,'phone camera uses the standard horizontal world span');
  assert(Math.abs(run('game.viewHeight')-717*540/393)<1e-8,'portrait world height follows the CSS aspect ratio');
  tick();
  const liveBefore=run('gameDraws'),timeBefore=run('game.runTime');
  for(let i=0;i<120;i++)tick(1000/120);
  assert.equal(run('gameDraws'),liveBefore+60,'high-refresh callbacks submit at most 60 gameplay frames per second');
  assert(Math.abs(run('game.runTime')-timeBefore-1)<1e-9,'render scheduling preserves elapsed gameplay time');
  if(search){assert(clockReads()>0);assert.match(debugDetails[0].textContent,/Δ[\d.]+ms\nU[\d.]+ms\nD[\d.]+ms\n[\d.]+×[\d.]+M/,'debug displays cadence, CPU timings and buffer size');assert.match(debugDetails[0].title,/不含 GPU/,'CPU timing is explicitly distinguished from GPU cost');}
  else assert.equal(clockReads(),0,'ordinary play has no diagnostic timing overhead');
  run("keys.add('KeyD');skillRequested=true;touch={id:1,dx:1,dy:0};");
  nodes['pause-button'].onclick();tick();
  assert.equal(nodes['debug-diagnostics'].classList.contains('hidden'),!search,'the diagnostic panel appears only on a debug pause');
  const pausedDraws=run('gameDraws'),pausedState=run('JSON.stringify([game.runTime,clock,game.player.x,game.player.y,game.player.skillCooldown])');
  for(let i=0;i<90;i++)tick();
  assert.equal(run('gameDraws'),pausedDraws,'pause retains the last canvas rather than redrawing the world');
  assert.equal(run('JSON.stringify([game.runTime,clock,game.player.x,game.player.y,game.player.skillCooldown])'),pausedState,'pause freezes both visual and simulation clocks');
  assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested'),false);
  resize(1512,850);
  assert(nodes['game-canvas'].width*nodes['game-canvas'].height<=3_000_000,'large Retina canvas obeys the pixel budget');
  assert.equal(run('game.viewWidth'),1512);assert.equal(run('game.viewHeight'),850,'render scaling must not zoom or shrink world view');
  tick();assert.equal(run('gameDraws'),pausedDraws+1,'resize repaints a paused canvas after its backing store changes');
  tick();assert.equal(run('gameDraws'),pausedDraws+1,'the resized pause returns to retained rendering');
  nodes['resume-button'].onclick();tick();
  assert.equal(run('gameDraws'),pausedDraws+2,'resuming immediately submits the live scene');
  const resumed=run('game.runTime');assert(resumed>JSON.parse(pausedState)[0]&&resumed-JSON.parse(pausedState)[0]<.018,'resume does not catch up time spent paused');
  const position=run('JSON.stringify([game.player.x,game.player.y])');tick();assert.equal(run('JSON.stringify([game.player.x,game.player.y])'),position,'old input cannot resume movement');
  for(const [open,close] of [['map-button','map-done'],['character-button','character-done'],['help-button','close-help']]){
    nodes[open].onclick();tick();const before=run('gameDraws'),time=run('game.runTime');
    for(let i=0;i<5;i++)tick();assert.equal(run('gameDraws'),before,`${open} retains the frozen scene`);assert.equal(run('game.runTime'),time);
    nodes[close].onclick();tick();assert.equal(run('gameDraws'),before+1,`${close} restores live rendering`);
  }
  run('game.crystalsNext=40;game.crystals=200;upgradeLevel=0;hudTick=0;');tick();
  assert.equal(run('game.status'),'upgrade','real progression enters reward selection during the update');
  assert.equal(nodes['crystal-label'].textContent,'200 / 40','entering a frozen reward refreshes the final resource HUD before retaining the scene');
  const upgradeDraws=run('gameDraws'),upgradeTime=run('game.runTime');
  for(let i=0;i<5;i++)tick();assert.equal(run('gameDraws'),upgradeDraws,'reward selection retains the scene');assert.equal(run('game.runTime'),upgradeTime);
  const beforeBuild=run('JSON.stringify(game.build.serialize())');
  nodes['upgrade-cards'].children[0].onclick();assert.equal(run('game.status'),'upgrade','surplus crystals keep the next reward open');
  assert.notEqual(run('JSON.stringify(game.build.serialize())'),beforeBuild,'the choice changes the real build');tick();
  assert.equal(run('gameDraws'),upgradeDraws+1,'a build mutation repaints once even while the reward status remains unchanged');
  assert.equal(nodes['crystal-label'].textContent,'160 / 110');tick();assert.equal(run('gameDraws'),upgradeDraws+1,'the untouched second reward then retains the scene');
  nodes['upgrade-cards'].children[0].onclick();tick();assert.equal(run('gameDraws'),upgradeDraws+2,'accepting the last reward resumes rendering');assert.equal(run('game.status'),'playing');
  // Enter a real merchant interaction; frozen shop frames stay cheap, and a
  // purchase must update gold/HP and repaint the departing merchant immediately.
  run(`game.player.hp=game.player.maxHp-35;game.gold=50;
const merchant={id:'qa-performance-merchant',type:'merchant',name:'测试游商',x:game.player.x,y:game.player.y+groundOffset(game.player,true),door:{x:game.player.x,y:game.player.y+groundOffset(game.player,true)},interactRadius:82,state:'ready',stock:{heal:1,magnet:1,fury:1,shield:1,relic:0}};
game.settlements.sites=[merchant];if(!game.settlements.interact(merchant.id))throw new Error('merchant fixture failed');`);
  tick();assert.equal(run('game.status'),'shop');const shopDraws=run('gameDraws'),shopTime=run('game.runTime');
  for(let i=0;i<5;i++)tick();assert.equal(run('gameDraws'),shopDraws);assert.equal(run('game.runTime'),shopTime);
  nodes['shop-items'].children[0].onclick();assert.equal(run('merchant.state'),'spent');assert.equal(run('game.gold'),38);assert.equal(run('game.player.hp'),run('game.player.maxHp'));
  assert.equal(nodes['gold-label'].textContent,'38');tick();assert.equal(run('gameDraws'),shopDraws+1,'purchase resumes rendering with updated merchant and resource state');
  // A scene fade intentionally freezes gameplay clocks while remaining animated.
  run(`game=new Game({terrain:new game.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;
const hut={id:'qa-performance-hut',type:'supply',name:'测试小屋',x:400,y:0,door:{x:400,y:30},width:54,depth:28,interactRadius:82,state:'ready',seed:1,guardIds:[]};
game.settlements.sites=[hut];game.player.x=hut.door.x;game.player.y=hut.door.y-groundOffset(game.player,true);`);
  tick();assert(run('game.sceneTransition.active'));
  const fadeTime=run('game.runTime');let fadeFrames=0;
  while(run('game.sceneTransition.active')&&fadeFrames++<40){const before=run('gameDraws');tick();assert.equal(run('gameDraws'),before+1,'every active fade frame renders even while gameplay is frozen');}
  assert.equal(run('game.sceneTransition.active'),false);assert.equal(run('game.dungeon.active.kind'),'hut');assert.equal(run('game.runTime'),fadeTime);
  document.hidden=true;listeners['document:visibilitychange']();tick();const hiddenDraws=run('gameDraws'),hiddenTime=run('game.runTime');tick(60_000);
  assert.equal(run('gameDraws'),hiddenDraws,'background callbacks do not redraw the scene');assert.equal(run('game.runTime'),hiddenTime);
  document.hidden=false;listeners['document:visibilitychange']();tick();assert.equal(run('game.runTime'),hiddenTime,'returning to a paused tab does not advance gameplay');
  nodes['resume-button'].onclick();tick();assert(run('gameDraws')>hiddenDraws,'foreground resume paints again');
  window.devicePixelRatio=1;resize(393,717);tick();assert.equal(nodes['game-canvas'].width,393,'subsequent display scale changes remain responsive');
}

// Run the real diagnostic controls through one bounded 15-second capture.
// Keep real frame/update/HUD/input handlers; this fixture has no spawning or
// procedural scenery, and the existing renderer counter avoids raster cost.
{
  const {nodes,listeners,document,navigator,run,tick,resize,drawImages,flush}=harness('?debug');
  nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();await flush();
  run(`game=new Game({terrain:new game.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
game.enemies=[];game.regionGrace=Infinity;game._spawn=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;game.viewWidth=width;game.viewHeight=height;updateHUD();`);
  tick();nodes['pause-button'].onclick();
  assert(!nodes['debug-diagnostics'].classList.contains('hidden'));
  nodes['diagnostic-hud-off'].onclick();
  assert.equal(nodes['diagnostic-hud-off'].getAttribute('aria-pressed'),'true');
  nodes['diagnostic-start'].onclick();
  assert.equal(run('diagnostics.running'),true);assert.equal(run('paused'),false,'capture starts by resuming the game');
  const frozenGold=nodes['gold-label'].textContent,frozenTimer=nodes.timer.textContent;
  run("game.gold=321;game.player.skillCooldown=2;skillRequested=false;keys.add('KeyD');");
  assert.equal(nodes['skill-button'].disabled,false);assert.equal(nodes['touch-skill'].disabled,false);
  nodes['skill-button'].onclick();assert.equal(run('skillRequested'),false,'freezing button appearance never bypasses the real cooldown');
  run('game.player.skillCooldown=0;');nodes['skill-button'].onclick();assert.equal(run('skillRequested'),true,'a ready skill still accepts input while HUD updates are stopped');
  for(let i=0;i<65;i++)tick();
  assert.equal(nodes['gold-label'].textContent,frozenGold);assert.equal(nodes.timer.textContent,frozenTimer,'live numeric HUD stays frozen');
  const beforePause=run('diagnostics._elapsed');
  nodes['pause-button'].onclick();tick(10_000);
  assert.equal(run('diagnostics._elapsed'),beforePause);assert.equal(run('diagnostics.running'),true,'pause suspends rather than discards the capture');
  nodes['resume-button'].onclick();tick();assert.equal(run('diagnostics._elapsed'),beforePause,'first resumed frame only establishes a new baseline');
  tick();const beforeHidden=run('diagnostics._elapsed');
  document.hidden=true;listeners['document:visibilitychange']();tick(60_000);
  document.hidden=false;listeners['document:visibilitychange']();tick();
  assert.equal(run('diagnostics._elapsed'),beforeHidden);assert.equal(run('paused'),true);
  nodes['resume-button'].onclick();tick();assert.equal(run('diagnostics._elapsed'),beforeHidden,'hidden-tab time never enters the RAF distribution');
  run("keys.add('KeyD');");let captureFrames=0;
  while(run('diagnostics.running')&&captureFrames++<1000)tick();
  assert(captureFrames<1000);assert.equal(run('paused'),true,'15 active seconds finish by opening pause');
  assert.equal(run('diagnostics.reports.length'),1);assert.equal(run('diagnostics.reports[0].mode'),'hud-off');
  assert(run('diagnostics.reports[0].activeMs')>=15_000&&run('diagnostics.reports[0].activeMs')<15_020);
  assert(run('diagnostics.reports[0].movingRatio')>.9);assert.equal(run('diagnostics.reports[0].raf.over50'),0);
  assert.equal(nodes['diagnostic-copy'].disabled,false);assert.match(nodes['diagnostic-output'].value,/HUD|RAF/);

  // Call the shipped composition function directly, since the main renderer
  // is counted above. Disabled lighting must bypass both masks and sunlight.
  nodes['diagnostic-default'].onclick();run('let lightCalls=0;drawActorShadows([],0,0,[],[],()=>lightCalls++);');
  assert.equal(run('lightCalls'),1);const litDraws=drawImages();assert(litDraws>0);
  nodes['diagnostic-lights-off'].onclick();run('drawActorShadows([],0,0,[],[],()=>lightCalls++);');
  assert.equal(run('lightCalls'),1);assert.equal(drawImages(),litDraws,'lights-off skips all shadow/sunlight canvas composition');
  assert.equal(run('diagnostics.reports.length'),1,'changing the comparison mode keeps completed reports');
  nodes['diagnostic-start'].onclick();tick();tick();resize(1512,850);
  assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnostics.reports.length'),1);assert.match(nodes['diagnostic-status'].textContent,/尺寸变化/);

  nodes['pause-button'].onclick();nodes['diagnostic-default'].onclick();nodes['diagnostic-start'].onclick();tick();tick();
  run(`const diagnosticHut={id:'qa-diagnostic-hut',type:'supply',name:'测试小屋',x:400,y:0,door:{x:400,y:30},width:54,depth:28,interactRadius:82,state:'ready',seed:1,guardIds:[]};
game.settlements.sites=[diagnosticHut];game.player.x=diagnosticHut.door.x;game.player.y=diagnosticHut.door.y-groundOffset(game.player,true);`);
  tick();assert(run('game.sceneTransition.active'));assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnostics.reports.length'),1);assert.match(nodes['diagnostic-status'].textContent,/场景切换/);

  let copied='';navigator.clipboard={async writeText(text){copied=text;}};
  await nodes['diagnostic-copy'].onclick();assert.equal(copied,run('diagnostics.exportText()'));assert.match(nodes['diagnostic-status'].textContent,/已复制 1 组/);
  navigator.clipboard={async writeText(){throw new Error('clipboard denied');}};
  await nodes['diagnostic-copy'].onclick();const output=nodes['diagnostic-output'];
  assert.equal(document.activeElement,output);assert.equal(output.selectionStart,0);assert.equal(output.selectionEnd,output.value.length);assert.equal(nodes['diagnostic-details'].open,true);assert.match(nodes['diagnostic-status'].textContent,/⌘C/);
  let prevented=false;listeners['arena:selectstart']({target:output,cancelable:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,false,'manual-copy textarea remains selectable under the game callout guard');
}

// A complete automatic comparison changes only its diagnostic mode between
// stages. It must not pause, reset movement, or leave a 5-second manual default.
{
  const {nodes,run,tick,resize,flush}=harness('?debug');
  nodes['start-button'].onclick();nodes['prepare-start-button'].onclick();await flush();
  const quietGame=()=>run(`game=new Game({terrain:new game.terrain.constructor({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
game.enemies=[];game.regionGrace=Infinity;game._spawn=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;game.viewWidth=width;game.viewHeight=height;updateHUD();`);
  quietGame();tick();nodes['pause-button'].onclick();nodes['diagnostic-lights-off'].onclick();
  const indicator=nodes['diagnostic-live'];let indicatorText=indicator.textContent,indicatorWrites=0;
  Object.defineProperty(indicator,'textContent',{get:()=>indicatorText,set:value=>{indicatorText=value;indicatorWrites++;}});
  nodes['diagnostic-auto'].onclick();
  assert.equal(run('diagnostics.mode'),'default','automatic sampling always begins with the default mode');
  assert.equal(run('paused'),false);assert(!indicator.classList.contains('hidden'));assert.match(indicator.textContent,/1\/3.*5 秒/);
  run("keys.add('KeyD');game.gold=111;");tick();assert.equal(run('diagnostics.elapsedMs'),0,'the first automatic frame establishes its RAF baseline');
  let frames=0,completed=0;
  while(run('diagnostics.running')&&frames++<1000){
    assert.equal(run('paused'),false);assert(run("keys.has('KeyD')"),'movement continues throughout all three stages');
    if(run('diagnosticSequence.index')===2&&run('diagnostics.elapsedMs')>4980)run('game.gold=4321;');
    tick();const reports=run('diagnostics.reports.length');
    if(reports>completed&&reports<3){
      completed=reports;assert.equal(run('paused'),false);assert(run("keys.has('KeyD')"));
      assert.equal(run('diagnostics.elapsedMs'),0);assert.match(indicator.textContent,new RegExp(`${completed+1}/3`));
      tick();assert.equal(run('diagnostics.elapsedMs'),0,'each newly selected stage excludes its first-frame interval');
    }
  }
  assert(frames<1000);assert.equal(run('diagnostics.reports.length'),3);assert.equal(run('paused'),true);assert.equal(run('diagnosticSequence'),null);
  const reports=JSON.parse(run('JSON.stringify(diagnostics.reports)'));
  assert.deepEqual(reports.map(report=>report.mode),['default','hud-off','lights-off']);
  assert.deepEqual(reports.map(report=>report.metadata.stage),['1/3','2/3','3/3']);
  assert.equal(new Set(reports.map(report=>report.metadata.batch)).size,1);assert(reports[0].metadata.batch);
  for(const report of reports){assert(report.activeMs>=5000&&report.activeMs<5020);assert.equal(report.metadata.capture,'全自动');assert.equal(report.movingRatio,1);}
  assert.equal(indicatorWrites,3,'the live indicator writes only at automatic start and two stage changes');
  assert(indicator.classList.contains('hidden'));assert.equal(run('diagnostics.mode'),'default');assert.equal(nodes['gold-label'].textContent,String(run('game.gold')),'completion refreshes the real HUD');

  nodes['diagnostic-hud-off'].onclick();nodes['diagnostic-start'].onclick();
  assert.equal(run('diagnosticSequence'),null);assert.equal(run('diagnostics.mode'),'hud-off');assert.match(indicator.textContent,/单组.*15 秒/);
  for(let i=0;i<320;i++)tick();
  assert(run('diagnostics.running'));assert.equal(run('diagnostics.reports.length'),3,'single-mode capture is still running after five seconds');
  let manualFrames=0;while(run('diagnostics.running')&&manualFrames++<650)tick();
  assert(manualFrames<650);const single=JSON.parse(run('JSON.stringify(diagnostics.reports[3])'));
  assert(single.activeMs>=15000&&single.activeMs<15020);assert.equal(single.mode,'hud-off');assert.equal(single.metadata.capture,'单组');assert.equal(single.metadata.batch,undefined);

  // Resize and a real entrance cancel the current automatic stage without
  // losing completed results. Both restore the default visual controls.
  const advanceToSecondStage=()=>{nodes['pause-button'].onclick();nodes['diagnostic-auto'].onclick();let n=0;while(run('diagnosticSequence?.index')===0&&n++<320)tick();assert(n<320);assert.equal(run('diagnostics.mode'),'hud-off');};
  advanceToSecondStage();const beforeResize=run('JSON.stringify(diagnostics.reports)');resize(1512,850);
  assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnosticSequence'),null);assert.equal(run('diagnostics.mode'),'default');assert.equal(run('JSON.stringify(diagnostics.reports)'),beforeResize);assert(indicator.classList.contains('hidden'));
  advanceToSecondStage();const beforeScene=run('JSON.stringify(diagnostics.reports)');
  run(`const autoHut={id:'qa-auto-hut',type:'supply',name:'测试小屋',x:400,y:0,door:{x:400,y:30},width:54,depth:28,interactRadius:82,state:'ready',seed:1,guardIds:[]};
game.settlements.sites=[autoHut];game.player.x=autoHut.door.x;game.player.y=autoHut.door.y-groundOffset(game.player,true);`);
  tick();assert(run('game.sceneTransition.active'));assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnosticSequence'),null);assert.equal(run('diagnostics.mode'),'default');assert.equal(run('JSON.stringify(diagnostics.reports)'),beforeScene);assert(indicator.classList.contains('hidden'));
  quietGame();nodes['pause-button'].onclick();nodes['diagnostic-auto'].onclick();tick();tick();const beforeMode=run('JSON.stringify(diagnostics.reports)');
  nodes['diagnostic-lights-off'].onclick();assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnosticSequence'),null);assert.equal(run('diagnostics.mode'),'lights-off','explicit manual mode choice replaces the automatic sequence');assert.equal(run('JSON.stringify(diagnostics.reports)'),beforeMode);assert(indicator.classList.contains('hidden'));
  advanceToSecondStage();const beforeDeath=run('JSON.stringify(diagnostics.reports)');run("game.status='dead';");tick();
  assert.equal(run('runEnded'),true);assert.equal(run('diagnostics.running'),false);assert.equal(run('diagnosticSequence'),null);assert.equal(run('diagnostics.mode'),'default');assert(indicator.classList.contains('hidden'));assert.equal(run('JSON.stringify(diagnostics.reports)'),beforeDeath,'death stops the automatic comparison without discarding completed reports');
}
console.log('Performance integration: retained scenes, input/time continuity, buffers, manual 15-second and automatic 3×5-second capture, HUD/light controls, cancellations and clipboard fallback passed.');
