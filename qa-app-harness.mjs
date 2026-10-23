import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { frostcrownAssets } from './dist/enemy-art/frostcrown-assets.js';

// The production bootstrap awaits decoding before importing the app. Keep the
// same readiness boundary while this Node harness counts non-rasterized draws.
await frostcrownAssets.preload({load:async()=>({width:1254,height:1254})});

// Exercise the shipped frame/resize/modal handlers. Drawing is counted, not
// rasterized: this checks scheduling and gameplay semantics, not browser FPS.
export const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
let source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const modules={};
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm)){
  const exports=await import(new URL(`./dist/${match[2].replace('./','')}`,import.meta.url));
  for(const specifier of match[1].split(',').map(value=>value.trim())){const [exported,local=exported]=specifier.split(/\s+as\s+/);modules[local]=exports[exported];}
}
source=source.replace(/^import[^\n]+;\s*$/gm,'');
export function harness(search='',{storage=new Map(),consoleImpl=console,coarse=false,moduleOverrides={}}={}){
  let viewport={width:393,height:717,left:0,top:0},scheduled=0,clockReads=0,drawImages=0,now=1000,nextTask=0;
  const frames=new Map(),timers=new Map();
  const requestFrame=callback=>{scheduled++;const id=++nextTask;frames.set(id,callback);return id;};
  const setTimer=(callback,delay=0)=>{const id=++nextTask;timers.set(id,{callback,at:now+Number(delay)});return id;};
  const drainTimers=()=>{for(const [id,task] of [...timers])if(task.at<=now){timers.delete(id);task.callback();}};
  const nodes={},listeners={},document={activeElement:null,hidden:false};
  const gradient={addColorStop(){}};
  const drawing=new Proxy({measureText:text=>({width:String(text).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,drawImage(){drawImages++;},getImageData:(x,y,width,height)=>({data:new Uint8ClampedArray(width*height*4)})},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  const camel=s=>s.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
  const eventHandlers=new Map(),observers=[];
  const listen=(key,handler)=>{const handlers=eventHandlers.get(key)||[];handlers.push(handler);eventHandlers.set(key,handlers);listeners[key]=event=>{for(const callback of handlers)callback(event);};};
  class Element{
    constructor(id='',tag='DIV',classes=''){
      this.id=id;this.tagName=tag;this.nodeType=1;this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this._text='';this._html='';this.value='';this.isConnected=true;this.disabled=false;this.checked=false;this.scrollLeft=0;this.scrollTop=0;
      this.style={setProperty(name,value){this[name]=String(value);},getPropertyValue(name){return this[name]??'';}};
      const set=new Set(classes.split(' ').filter(Boolean));this.classList={contains:name=>set.has(name),add:(...names)=>names.forEach(name=>set.add(name)),remove:(...names)=>names.forEach(name=>set.delete(name)),toggle:(name,on)=>{on=on??!set.has(name);on?set.add(name):set.delete(name);return on;}};
      Object.defineProperty(this,'className',{get:()=>[...set].join(' '),set:value=>{set.clear();String(value).split(/\s+/).filter(Boolean).forEach(name=>set.add(name));}});
    }
    getBoundingClientRect(){return {...viewport,width:this.clientWidth};}
    get clientWidth(){return this._clientWidth??viewport.width;}
    set clientWidth(value){this._clientWidth=value;}
    get scrollWidth(){return this._scrollWidth??this.clientWidth;}
    set scrollWidth(value){this._scrollWidth=value;}
    get offsetLeft(){return this._offsetLeft??0;}
    set offsetLeft(value){this._offsetLeft=value;}
    get offsetWidth(){return this._offsetWidth??120;}
    set offsetWidth(value){this._offsetWidth=value;}
    scrollBy({left=0,top=0}={}){this.scrollLeft=Math.max(0,Math.min(this.scrollWidth-this.clientWidth,this.scrollLeft+left));this.scrollTop=Math.max(0,this.scrollTop+top);listeners[`${this.id}:scroll`]?.({target:this});}
    scrollTo({left=this.scrollLeft,top=this.scrollTop}={}){this.scrollBy({left:left-this.scrollLeft,top:top-this.scrollTop});}
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='class')this.className=value;if(name==='value')this.value=String(value);if(name==='checked')this.checked=true;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    hasAttribute(name){return Object.hasOwn(this.attributes,name);}
    removeAttribute(name){delete this.attributes[name];if(name==='disabled')this.disabled=false;}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    set textContent(value){this._text=String(value);this.children=[];this._html='';}
    get innerHTML(){return this._html;}
    set innerHTML(value){this._html=String(value);this._text='';this.children=[];parseInto(this._html,this);}
    addEventListener(type,handler){listen(`${this.id}:${type}`,handler);}
    focus(){document.activeElement=this;listeners[`${this.id}:focus`]?.({target:this});}
    select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
    matches(selector){return selector.split(',').some(raw=>{
      let s=raw.trim();if(s.includes(':not(:disabled)')&&this.disabled)return false;s=s.replace(':not(:disabled)','');
      for(const match of [...s.matchAll(/:not\(([^)]+)\)/g)]){if(this.matches(match[1]))return false;s=s.replace(match[0],'');}
      if(s.includes(':checked')&&!this.checked)return false;s=s.replace(':checked','');
      const tag=s.match(/^[a-z]+/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
      const id=s.match(/#([\w-]+)/)?.[1];if(id&&this.id!==id)return false;
      for(const match of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(match[1]))return false;
      for(const match of s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g))if(!this.hasAttribute(match[1])||(match[2]!==undefined&&this.getAttribute(match[1])!==match[2]))return false;
      return true;
    });}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this._html='';this.append(...children);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    contains(target){return target===this||this.children.some(child=>child.contains?.(target));}
    getContext(){return drawing;}
    setPointerCapture(id){this.captured=id;}
    releasePointerCapture(id){if(this.captured===id)this.captured=null;}
    hasPointerCapture(id){return this.captured===id;}
  }
  function parseInto(markup,root){
    const stack=[root],voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    for(const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)){
      const text=token[0];if(text.startsWith('<!'))continue;
      if(text.startsWith('</')){const tag=text.match(/^<\/([a-z][a-z0-9-]*)/i)?.[1]?.toUpperCase();const at=stack.findLastIndex(node=>node.tagName===tag);if(at>0)stack.length=at;continue;}
      if(!text.startsWith('<')){stack.at(-1)._text+=text;continue;}
      const match=text.match(/^<([a-z][a-z0-9-]*)\b([^>]*)>/i);if(!match)continue;
      const node=new Element('',match[1].toUpperCase());for(const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');
      stack.at(-1).append(node);if(node.id)nodes[node.id]=node;if(!voids.has(match[1].toLowerCase())&&!text.endsWith('/>'))stack.push(node);
    }
  }
  const root=new Element('qa-root');parseInto(html,root);
  // bootstrap creates the independent log dialog before importing app.js.
  const logDialog=new Element('activity-log-dialog','DIALOG');logDialog.open=false;
  root.querySelector('body').append(logDialog);nodes[logDialog.id]=logDialog;
  const pauseColumn=nodes['pause-button'].parentElement;
  assert(pauseColumn.classList.contains('pause-control'));
  Object.assign(document,{getElementById:id=>{const node=root.querySelector(`#${id}`);assert(node,id);return node;},body:root.querySelector('body'),createElement:tag=>new Element('',tag.toUpperCase()),querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener:(type,handler)=>listen(`document:${type}`,handler)});
  // Imported drawing helpers also resolve document when allocating a canvas.
  // Their pixels are mocked; they still exercise the actual portrait code.
  globalThis.document=document;
  const window={location:{search},devicePixelRatio:2,addEventListener:(type,handler)=>listen(`window:${type}`,handler)};
  const navigator={userAgent:'QA frame integration'};
  const sandbox={...modules,...moduleOverrides,document,window,navigator,performance:{now:()=>{clockReads++;return performance.now();}},URLSearchParams,ResizeObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){}},matchMedia:query=>({matches:query==='(pointer: coarse)'&&coarse}),localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},requestAnimationFrame:requestFrame,cancelAnimationFrame:id=>frames.delete(id),setTimeout:setTimer,clearTimeout:id=>timers.delete(id),console:consoleImpl};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  // The harness loads the app after configuration directly. Mirror the boot
  // module's successful control release before simulating user interaction.
  for(const id of ['start-button','archive-button','help-button','sound-button'])nodes[id].disabled=false;
  const run=script=>vm.runInContext(script,sandbox);
  run('const shippedRenderGame=renderGame;let gameDraws=0,introDraws=0;renderGame=()=>{gameDraws++;};renderIntro=()=>{introDraws++;};');
  const tick=(delta=1000/60)=>{for(const [id,callback] of frames)if(callback===sandbox.frame)frames.delete(id);const before=scheduled;run(`frame(${now+=delta})`);assert.equal(scheduled,before+1,'every callback schedules its successor without a frame-rate limiter');drainTimers();};
  // Drive real asynchronous startup through its paint/timer boundaries. Do not
  // bypass startGame or substitute a synchronously constructed Game.
  const flush=async()=>{
    for(let count=0;count<100;count++){
      await Promise.resolve();await Promise.resolve();
      if(!run('typeof startLoading!=="undefined"&&startLoading')||nodes['scene-loading']?.classList.contains('has-error'))return;
      now+=1000/60;const callbacks=[...frames.values()];frames.clear();
      for(const callback of callbacks)callback(now);
      drainTimers();
    }
    assert.fail('asynchronous startup did not settle within 100 simulated frames');
  };
  const fire=(node,type,extra={})=>{const event={target:node,currentTarget:node,cancelable:true,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};listeners[`${node.id}:${type}`]?.(event);node[`on${type}`]?.(event);return event;};
  return {nodes,listeners,document,window,navigator,run,tick,flush,fire,pauseColumn,storage,clockReads:()=>clockReads,drawImages:()=>drawImages,resize(width,height){viewport={...viewport,width,height};run('resize();');for(const observer of observers)observer.callback();}};
}

