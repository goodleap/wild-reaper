import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDebugViewportControls } from './dist/debug-viewport.js';

const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
const markup=html.slice(html.indexOf('<section id="debug-viewport"'),html.indexOf('<section id="debug-diagnostics"'));
assert.match(markup,/<form[^>]+id="debug-viewport-form"[^>]+novalidate/);
assert.match(markup,/<input[^>]+type="number"[^>]+min="240"[^>]+max="1600"[^>]+step="1"[^>]+inputmode="numeric"/);
assert.match(markup,/id="debug-viewport-current"[^>]+aria-live="polite"/);

// Exercise the shipped controller against event/attribute fixtures. Native
// Enter submission and responsive layout have separate Chromium coverage.
function fixture(enabled=true){
  const document={activeElement:null},nodes=new Map();
  for(const match of markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
    const classes=new Set((match[0].match(/class="([^"]+)"/)?.[1]||'').split(/\s+/));
    const attributes=new Map(),listeners=new Map();
    const node={id:match[1],value:'',textContent:'',disabled:/\bdisabled\b/.test(match[0]),
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
      setAttribute:(name,value)=>attributes.set(name,String(value)),removeAttribute:name=>attributes.delete(name),getAttribute:name=>attributes.get(name)??null,
      addEventListener:(type,callback)=>listeners.set(type,callback),focus(){document.activeElement=node;},
      fire(type){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};listeners.get(type)?.(event);return event;}
    };nodes.set(node.id,node);
  }
  document.getElementById=id=>nodes.get(id)||null;
  let state={mode:'default',width:540,height:985,customWidth:null},reads=0;const changes=[];
  const controller=createDebugViewportControls({document,enabled,getState:()=>{reads++;return state;},onChange:change=>{
    changes.push({...change});state={...state,...change,customWidth:change.mode==='custom'?change.width:state.customWidth};
    state.width=change.mode==='native'?393:change.mode==='default'?540:change.width;state.height=state.width*717/393;
  }});
  return {document,nodes,controller,changes,reads:()=>reads,state:()=>state,node:id=>nodes.get(`debug-viewport-${id}`),root:nodes.get('debug-viewport')};
}
{
  const f=fixture(false);f.controller.refresh();f.node('600').fire('click');f.node('form').fire('submit');
  assert(f.root.classList.contains('hidden'));assert.equal(f.reads(),0);assert.equal(f.changes.length,0);assert(f.node('width').disabled);
}
assert.doesNotThrow(()=>createDebugViewportControls({document:{getElementById:()=>null},enabled:true}).refresh(),'missing optional controls remain inert');
{
  const f=fixture(),input=f.node('width');assert(!f.root.classList.contains('hidden'));assert(!input.disabled);
  assert.equal(f.node('default').getAttribute('aria-pressed'),'true');assert.equal(input.value,'540');
  for(const [id,expected] of [['480',480],['540',540],['600',600],['native',393],['default',540]]){
    f.node(id).fire('click');assert.equal(f.state().width,expected);assert.equal(input.value,String(expected));
    assert.equal(f.node(id).getAttribute('aria-pressed'),'true');
    for(const other of ['default','native','480','540','600'].filter(value=>value!==id))assert.equal(f.node(other).getAttribute('aria-pressed'),'false');
  }
  for(const value of ['', '239', '1601', '540.5', '-300', 'Infinity', 'NaN', '1e3', '240x']){
    const before=f.changes.length;input.value=value;input.focus();const event=f.node('form').fire('submit');
    assert(event.defaultPrevented);assert.equal(f.changes.length,before,`${value} does not change the camera`);
    assert.equal(input.getAttribute('aria-invalid'),'true');assert(!f.node('error').classList.contains('hidden'));assert.equal(f.document.activeElement,input);
  }
  input.value='960';input.fire('input');assert.equal(input.getAttribute('aria-invalid'),null);
  f.controller.refresh();assert.equal(input.value,'960','HUD or window refresh preserves a pending edit');assert.equal(f.state().width,540,'typing is not an immediate camera change');
  f.node('form').fire('submit');assert.equal(f.state().width,960);assert.equal(f.state().mode,'custom');
  assert.match(f.node('current').textContent,/960 × 1751/);assert(f.node('error').classList.contains('hidden'));
  for(const value of ['240','1600']){input.value=value;f.node('form').fire('submit');assert.equal(f.state().width,Number(value));}
  f.node('default').fire('click');assert.equal(f.state().mode,'default');assert.equal(input.value,'540');
  const reopened=fixture();assert.equal(reopened.state().mode,'default');assert.equal(reopened.state().width,540,'a new page controller has no persisted override');
}
console.log('Debug viewport UI: presets, active mode, decimal integer bounds, rejected input without camera changes, explicit submit, pending edit preservation and disabled isolation passed (event/DOM fixtures).');
