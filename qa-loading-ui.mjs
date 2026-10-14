import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLoadingView,waitForPaint} from './dist/loading-ui.js';

function fixture(){
  let now=0,next=0;const jobs=new Map(),nodes=new Map();
  const element=id=>{if(nodes.has(id))return nodes.get(id);const classes=new Set(id.endsWith('-loading')||id.endsWith('-actions')?['hidden']:[]);const node={id,style:{},attributes:{},classList:{add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),contains:value=>classes.has(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value)},setAttribute(key,value){this.attributes[key]=String(value);},focus(){this.focused=true;}};nodes.set(id,node);return node;};
  const document={getElementById:element};
  const setTimer=(fn,delay=0)=>{const id=++next;jobs.set(id,{fn,at:now+delay});return id;},clearTimer=id=>jobs.delete(id);
  const advance=ms=>{now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}};
  return {view:createLoadingView(document,{setTimer,clearTimer}),element,advance,jobs,setTimer};
}
{
  const {view,element,advance,jobs}=fixture();view.start();advance(249);
  assert(element('boot-loading').classList.contains('hidden'));
  view.finish();advance(1000);assert(element('boot-loading').classList.contains('hidden'));assert.equal(jobs.size,0,'instant loading never flashes');
}
{
  const {view,element,advance}=fixture();view.start('boot');advance(250);
  assert(!element('boot-loading').classList.contains('hidden'));
  view.update({completed:2,total:5,stage:'读取配置'});
  assert.equal(element('boot-loading-fill').style.transform,'scaleX(0.4)');assert.equal(element('boot-loading-track').attributes['aria-valuenow'],'40');assert.equal(element('boot-loading-label').textContent,'读取配置');
  view.finish();assert(element('boot-loading').classList.contains('is-complete'));advance(179);assert(!element('boot-loading').classList.contains('hidden'));advance(1);assert(element('boot-loading').classList.contains('hidden'));
}
{
  const {view,element,advance}=fixture();view.start('boot');advance(250);view.finish();view.start('scene');advance(1000);
  assert(!element('scene-loading').classList.contains('hidden'),'old fade cannot dismiss a later load');assert(element('boot-loading').classList.contains('hidden'));
  view.finish({fade:false});assert(element('scene-loading').classList.contains('hidden'));
}
{
  const {view,element,advance,jobs}=fixture();let retry=0,back=0;
  view.start('boot');view.fail('失败',{onRetry:()=>retry++});assert(!element('boot-loading').classList.contains('hidden'));assert(element('boot-loading-back').classList.contains('hidden'));element('boot-loading-retry').onclick();assert.equal(retry,1);assert.equal(jobs.size,0);
  view.start('scene');view.fail('重试',{onRetry:()=>retry++,onBack:()=>back++});element('scene-loading-back').onclick();assert.equal(back,1);view.hide();advance(1000);assert(element('scene-loading').classList.contains('hidden'));
}
{
  const {setTimer,advance}=fixture();let frame,done=false;
  const painted=waitForPaint({requestFrame:callback=>frame=callback,setTimer}).then(()=>done=true);
  await Promise.resolve();assert(!done);frame();await Promise.resolve();assert(!done,'map work cannot run inside the loading RAF');advance(0);await painted;assert(done);
}
const bootstrap=fs.readFileSync(new URL('./dist/bootstrap.js',import.meta.url),'utf8');
assert.equal([...bootstrap.matchAll(/^import .* from /gm)].length,1,'only the loading view is in the initial dependency graph');
assert(bootstrap.indexOf("loading.start('boot'")<bootstrap.indexOf("await import('./content-config.js')"));
assert(bootstrap.indexOf('await loadContentConfig')<bootstrap.indexOf("await import('./app.js')"));
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert.match(html,/<script type="module" src="\.\/bootstrap\.js(?:[^\"]*)"><\/script>/);
for(const id of ['start-button','archive-button','help-button','sound-button'])assert.match(html,new RegExp(`id="${id}" disabled`));
const css=fs.readFileSync(new URL('./dist/loading.css',import.meta.url),'utf8');
assert.match(css,/\.loading-boot\{position:absolute/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/prefers-reduced-motion/);
console.log('Loading UI OK: delayed/no-flash startup, task progress, fade cleanup, superseded timers, retry/back, paint-before-work, boot ordering.');
