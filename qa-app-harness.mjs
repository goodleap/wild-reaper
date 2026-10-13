import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

// Exercise the shipped frame/resize/modal handlers. Drawing is counted, not
// rasterized: this checks scheduling and gameplay semantics, not browser FPS.
export const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const modules={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm)){
  const exports=await import(new URL(`./dist/${match[2].replace('./','')}`,import.meta.url));
  for(const name of match[1].split(',').map(value=>value.trim()))modules[name]=exports[name];
}
source=source.replace(/^import[^\n]+;\s*$/gm,'');
export function harness(search='',{storage=new Map()}={}){
  let viewport={width:393,height:717,left:0,top:0},scheduled=0,clockReads=0,drawImages=0;
  const nodes={},listeners={},document={activeElement:null,hidden:false};
  const gradient={addColorStop(){}};
  const drawing=new Proxy({measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,drawImage(){drawImages++;}},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  class Element{
    constructor(id='',tag='DIV',classes=''){this.id=id;this.tagName=tag;this.nodeType=1;this.children=[];this.style={setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]??'';}};this.attributes={};this.textContent='';this.value='';this.isConnected=true;this.disabled=false;const set=new Set(classes.split(' ').filter(Boolean));this.classList={contains:name=>set.has(name),add:name=>set.add(name),remove:name=>set.delete(name),toggle:(name,on)=>{on=on??!set.has(name);on?set.add(name):set.delete(name);return on;}};}
    getBoundingClientRect(){return viewport;}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name];}
    addEventListener(type,handler){listeners[`${this.id}:${type}`]=handler;}
    focus(){document.activeElement=this;}
    select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
    closest(selector){for(let node=this;node;node=node.parentElement)if(selector.split(',').some(part=>{const s=part.trim();return s.startsWith('.')?node.classList.contains(s.slice(1)):s.startsWith('#')?node.id===s.slice(1):node.tagName===s.toUpperCase();}))return node;return null;}
    append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){this.children=[...children];}
    querySelector(){return this.children.find(child=>!child.disabled);}
    querySelectorAll(){return this.children.filter(child=>child.tagName==='BUTTON'&&!child.disabled);}
    contains(target){return target===this||this.children.some(child=>child.contains?.(target));}
    getContext(){return drawing;}
    setPointerCapture(){}
  }
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g))nodes[match[3]]=new Element(match[3],match[1].toUpperCase(),match[2].match(/class="([^"]*)"/)?.[1]||'');
  const appRoot=new Element('qa-app','MAIN','app');appRoot.append(nodes.arena);
  // Model the shipped pause column so debug detail must actually be attached,
  // instead of passing through the production optional-parent fallback.
  assert.match(html,/<div class="pause-control"><button id="pause-button"/);
  const pauseColumn=new Element('', 'DIV', 'pause-control');pauseColumn.append(nodes['pause-button'],nodes['debug-fps']);
  const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
  Object.assign(document,{getElementById:id=>{const node=nodes[id]||Object.values(nodes).map(root=>find(root,id)).find(Boolean);assert(node,id);return node;},body:new Element(),createElement:tag=>new Element('',tag.toUpperCase()),querySelectorAll:()=>Object.values(nodes).filter(node=>node.classList.contains('modal-layer')),addEventListener:(type,handler)=>listeners[`document:${type}`]=handler});
  const window={location:{search},devicePixelRatio:2,addEventListener:(type,handler)=>listeners[`window:${type}`]=handler};
  const navigator={userAgent:'QA frame integration'};
  const sandbox={...modules,document,window,navigator,performance:{now:()=>{clockReads++;return performance.now();}},URLSearchParams,ResizeObserver:class{observe(){}},matchMedia:()=>({matches:false}),localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},requestAnimationFrame(){scheduled++;},setTimeout:()=>0,clearTimeout(){},console};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const run=script=>vm.runInContext(script,sandbox);
  run('const shippedRenderGame=renderGame;let gameDraws=0,introDraws=0;renderGame=()=>{gameDraws++;};renderIntro=()=>{introDraws++;};');
  let now=1000;
  const tick=(delta=1000/60)=>{const before=scheduled;run(`frame(${now+=delta})`);assert.equal(scheduled,before+1,'every callback schedules its successor without a frame-rate limiter');};
  return {nodes,listeners,document,window,navigator,run,tick,pauseColumn,storage,clockReads:()=>clockReads,drawImages:()=>drawImages,resize(width,height){viewport={...viewport,width,height};run('resize();');}};
}

