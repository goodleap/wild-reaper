import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

// Exercise the shipped frame/resize/modal handlers. Drawing is counted, not
// rasterized: this checks scheduling and gameplay semantics, not browser FPS.
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const modules={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm)){
  const exports=await import(new URL(`./dist/${match[2].replace('./','')}`,import.meta.url));
  for(const name of match[1].split(',').map(value=>value.trim()))modules[name]=exports[name];
}
source=source.replace(/^import[^\n]+;\s*$/gm,'');
function harness(search){
  let viewport={width:393,height:717,left:0,top:0},scheduled=0,clockReads=0;
  const nodes={},listeners={},document={activeElement:null,hidden:false};
  const gradient={addColorStop(){}};
  const drawing=new Proxy({measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  class Element{
    constructor(id='',tag='DIV',classes=''){this.id=id;this.tagName=tag;this.children=[];this.style={setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]??'';}};this.attributes={};this.textContent='';this.isConnected=true;this.disabled=false;const set=new Set(classes.split(' ').filter(Boolean));this.classList={contains:name=>set.has(name),add:name=>set.add(name),remove:name=>set.delete(name),toggle:(name,on)=>{on=on??!set.has(name);on?set.add(name):set.delete(name);return on;}};}
    getBoundingClientRect(){return viewport;}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name];}
    addEventListener(type,handler){listeners[`${this.id}:${type}`]=handler;}
    focus(){document.activeElement=this;}
    append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[...children];}
    querySelector(){return this.children.find(child=>!child.disabled);}
    querySelectorAll(){return this.children.filter(child=>child.tagName==='BUTTON'&&!child.disabled);}
    contains(target){return target===this||this.children.some(child=>child.contains?.(target));}
    getContext(){return drawing;}
    setPointerCapture(){}
  }
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g))nodes[match[3]]=new Element(match[3],match[1].toUpperCase(),match[2].match(/class="([^"]*)"/)?.[1]||'');
  // Model the shipped pause column so debug detail must actually be attached,
  // instead of passing through the production optional-parent fallback.
  assert.match(html,/<div class="pause-control"><button id="pause-button"/);
  const pauseColumn=new Element('', 'DIV', 'pause-control');pauseColumn.append(nodes['pause-button'],nodes['debug-fps']);
  const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
  Object.assign(document,{getElementById:id=>{const node=nodes[id]||Object.values(nodes).map(root=>find(root,id)).find(Boolean);assert(node,id);return node;},body:new Element(),createElement:tag=>new Element('',tag.toUpperCase()),querySelectorAll:()=>Object.values(nodes).filter(node=>node.classList.contains('modal-layer')),addEventListener:(type,handler)=>listeners[`document:${type}`]=handler});
  const window={location:{search},devicePixelRatio:2,addEventListener:(type,handler)=>listeners[`window:${type}`]=handler};
  const sandbox={...modules,document,window,performance:{now:()=>{clockReads++;return performance.now();}},URLSearchParams,ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){scheduled++;},setTimeout:()=>0,clearTimeout(){},console};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const run=script=>vm.runInContext(script,sandbox);
  run('let gameDraws=0,introDraws=0;renderGame=()=>{gameDraws++;};renderIntro=()=>{introDraws++;};');
  let now=1000;
  const tick=(delta=1000/60)=>{const before=scheduled;run(`frame(${now+=delta})`);assert.equal(scheduled,before+1,'every callback schedules its successor without a frame-rate limiter');};
  return {nodes,listeners,document,window,run,tick,pauseColumn,clockReads:()=>clockReads,resize(width,height){viewport={...viewport,width,height};run('resize();');}};
}

for(const search of ['', '?debug']){
  const {nodes,listeners,document,window,run,tick,resize,pauseColumn,clockReads}=harness(search);
  const debugDetails=pauseColumn.children.filter(node=>node.id==='debug-performance');
  assert.equal(debugDetails.length,search?1:0,'performance detail is attached once in debug and absent on normal URLs');
  nodes['start-button'].onclick();
  run('game.enemies=[];game._spawn=Infinity;game._shot=Infinity;game.nextBossAt=Infinity;game.crystalsNext=Infinity;game.player.xpNext=Infinity;game.player.invuln=Infinity;');
  assert.equal(nodes['game-canvas'].width,786,'phone rendering retains native 2x detail within the pixel budget');
  assert.equal(run('game.viewWidth'),393);
  tick();
  const liveBefore=run('gameDraws'),timeBefore=run('game.runTime');
  for(let i=0;i<120;i++)tick(1000/120);
  assert.equal(run('gameDraws'),liveBefore+120,'live play submits every available high-refresh frame');
  assert(Math.abs(run('game.runTime')-timeBefore-1)<1e-9,'render scheduling preserves elapsed gameplay time');
  if(search){assert(clockReads()>0);assert.match(debugDetails[0].textContent,/Δ[\d.]+ms\nU[\d.]+ms\nD[\d.]+ms\n[\d.]+×[\d.]+M/,'debug displays cadence, CPU timings and buffer size');assert.match(debugDetails[0].title,/不含 GPU/,'CPU timing is explicitly distinguished from GPU cost');}
  else assert.equal(clockReads(),0,'ordinary play has no diagnostic timing overhead');
  run("keys.add('KeyD');skillRequested=true;touch={id:1,dx:1,dy:0};");
  nodes['pause-button'].onclick();tick();
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
console.log('Performance integration: live RAF cadence, bounded Retina buffers, unchanged world view, retained pause/reward/modal scenes, resize repaint, input/time continuity, animated scene fades and background recovery passed.');
