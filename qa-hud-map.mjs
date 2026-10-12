import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Exercise real UI handlers with a minimal DOM. No browser, preview server, or
// rendering package is required for pause/input/fog-of-war invariants.
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const modules={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm)){
  const exports=await import(new URL(`./dist/${match[2].replace('./','')}`,import.meta.url));
  for(const name of match[1].split(',').map(value=>value.trim()))modules[name]=exports[name];
}
source=source.replace(/^import[^\n]+;\s*$/gm,'');
const gradient={addColorStop(){}};
const drawing=new Proxy({measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
const nodes={},listeners={},document={activeElement:null};
class Element{
  constructor(id='',tag='DIV',classes=''){this.id=id;this.tagName=tag;this.children=[];this.style={setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]??'';}};this.attributes={};this.textContent='';this.isConnected=true;this.disabled=false;const set=new Set(classes.split(' ').filter(Boolean));this.classList={contains:name=>set.has(name),add:name=>set.add(name),remove:name=>set.delete(name),toggle:(name,on)=>{on=on??!set.has(name);on?set.add(name):set.delete(name);return on;}};}
  getBoundingClientRect(){return {width:393,height:717,left:0,top:0};}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name];}
  addEventListener(type,handler){listeners[`${this.id}:${type}`]=handler;}
  focus(){document.activeElement=this;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  querySelector(){return this.children.find(child=>!child.disabled);}
  querySelectorAll(){return this.children.filter(child=>child.tagName==='BUTTON'&&!child.disabled);}
  contains(target){return target===this||this.children.some(child=>child.contains?.(target));}
  getContext(){return drawing;}
  setPointerCapture(){}
}
for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g))nodes[match[3]]=new Element(match[3],match[1].toUpperCase(),match[2].match(/class="([^"]*)"/)?.[1]||'');
Object.assign(document,{getElementById:id=>{assert(nodes[id],id);return nodes[id];},body:new Element(),createElement:tag=>new Element('',tag.toUpperCase()),querySelectorAll:()=>Object.values(nodes).filter(node=>node.classList.contains('modal-layer')),addEventListener:(type,handler)=>listeners[`document:${type}`]=handler});
const sandbox={...modules,document,window:{location:{search:'?debug'},devicePixelRatio:1,addEventListener:(type,handler)=>listeners[`window:${type}`]=handler},URLSearchParams,ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},console};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const run=script=>vm.runInContext(script,sandbox);
const key=(code)=>listeners['window:keydown']({code,key:code==='Escape'?'Escape':code,repeat:false,target:nodes['game-canvas'],preventDefault(){}});
nodes['start-button'].onclick();
// Freeze rendering only: the actual frame, game clock, input and HUD run normally.
run('renderGame=()=>{};renderIntro=()=>{}');
assert(run('game.status')==='playing');
run("keys.add('KeyW');skillRequested=true;touch={id:1,dx:1,dy:0};");
nodes['map-button'].onclick();
assert(run('mapOpen'));assert.equal(run('keys.size'),0);assert.equal(run('touch'),null);assert.equal(run('skillRequested'),false);
assert.equal(nodes['map-button'].getAttribute('aria-expanded'),'true');assert.equal(document.activeElement.id,'close-map');
const before=run('game.runTime??game.time');run('frame(1000);frame(1040);');assert.equal(run('game.runTime??game.time'),before,'opening map freezes simulation');
key('KeyW');key('Space');key('KeyE');assert.equal(run('keys.size'),0);assert.equal(run('skillRequested'),false);assert.equal(run('portalRequested'),false);
listeners['game-canvas:pointerdown']({pointerId:4,clientX:130,clientY:200,preventDefault(){}});assert.equal(run('touch'),null,'map does not leak pointer movement');
key('Escape');assert.equal(run('mapOpen'),false);assert.equal(run('paused'),false);assert.equal(nodes['map-button'].getAttribute('aria-expanded'),'false');
// Opening over an already paused upgrade restores both layers, not gameplay.
run("game.status='upgrade';pause();");key('KeyM');assert(run('mapOpen&&paused'));key('Escape');assert.equal(run('game.status'),'upgrade');assert(run('paused'));assert.equal(document.activeElement.id,'resume-button');
run('resume();');assert.equal(run('game.status'),'upgrade');assert.equal(run('paused'),false);
key('KeyM');nodes['help-button'].onclick();assert(run('helpOpen&&mapOpen'));key('Escape');assert.equal(run('helpOpen'),false);assert(run('mapOpen'));assert.equal(document.activeElement.id,'close-map');key('Escape');assert.equal(run('game.status'),'upgrade');
// Real choice buttons cannot spend crystals or accept a boss reward behind the map.
run("game.crystals=game.crystalsNext;game.status='upgrade';upgradeLevel=0;openUpgrades();");
const upgrade=nodes['upgrade-cards'].children[0];assert(upgrade?.onclick);
const upgradeBefore=run('game.skillLevel');key('KeyM');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore);key('Escape');upgrade.onclick();assert.equal(run('game.skillLevel'),upgradeBefore+1);assert.equal(run('game.status'),'playing');
run("game.regions.rewardPortal={rewardClaimed:false};game.superSkills.offer('region',game.region.id);game.status='super';openSuperChoices();");
const superChoice=nodes['super-cards'].children[0];assert(superChoice?.onclick);
key('KeyM');superChoice.onclick();assert.equal(run('Object.keys(game.superSkills.owned).length'),0);assert.equal(run('game.status'),'super');key('Escape');superChoice.onclick();assert.equal(run('Object.keys(game.superSkills.owned).length'),1);assert.equal(run('game.status'),'playing');
// The expanded map obeys exactly the minimap's discovery rules.
run("game.status='playing';game.settlements.sites=[{id:'visible',type:'castle',name:'已知城堡',x:40,y:0,state:'ready',discovered:true},{id:'secret',type:'castle',name:'隐藏城堡',x:50,y:0,state:'ready',discovered:false}];game.relicSites.sites=[];game.regions.portals=[];");
key('KeyM');const mapCopy=nodes['map-landmarks'].children.flatMap(row=>row.children.map(child=>child.textContent)).join(' ');assert(mapCopy.includes('已知城堡'));assert(!mapCopy.includes('隐藏城堡'));assert.equal(run('game.settlements.sites[1].discovered'),false);
listeners['window:blur']();assert(run('paused&&mapOpen'));assert.equal(document.activeElement.id,'close-map');nodes['map-done'].onclick();assert(run('paused'),'window blur keeps run paused when map closes');
// Objective pointers reserve both the map and the adjacent pause control,
// using the same bounds in the wilderness and the castle.
run('width=1100;height=700;');
const normalPointer=run('edgePointer({x:game.player.x+2500,y:game.player.y-1400})');assert(normalPointer.y>=174);
run('game.dungeon.active={};');const castlePointer=run('edgePointer({x:game.player.x+2500,y:game.player.y-1400})');assert.equal(castlePointer.y,normalPointer.y);run('game.dungeon.active=null;');
nodes['quit-button'].onclick();assert.equal(run('game'),null);assert.equal(run('mapOpen'),false);assert(nodes['map-overlay'].classList.contains('hidden'));
console.log('HUD map: compact bounds, simulation pause, modal stack restoration, blocked input, discovery privacy and reset passed.');
