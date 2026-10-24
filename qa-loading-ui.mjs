import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLoadingView,waitForPaint} from './dist/loading-ui.js';

function fixture(options={}){
  let now=0,next=0;const jobs=new Map(),nodes=new Map();
  const element=id=>{if(nodes.has(id))return nodes.get(id);const classes=new Set(id.endsWith('-loading')||id.endsWith('-actions')?['hidden']:[]);const node={id,style:{},attributes:{},classList:{add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),contains:value=>classes.has(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value)},setAttribute(key,value){this.attributes[key]=String(value);},focus(){this.focused=true;}};nodes.set(id,node);return node;};
  const document={getElementById:element};
  const setTimer=(fn,delay=0)=>{const id=++next;jobs.set(id,{fn,at:now+delay});return id;},clearTimer=id=>jobs.delete(id);
  const advance=ms=>{now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}};
  return {view:createLoadingView(document,{...options,setTimer,clearTimer}),element,advance,jobs,setTimer};
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
  assert.equal(element('boot-loading-percent').textContent,'40%');
  view.update({completed:.999,total:1,stage:'正在准备'});
  assert.equal(element('boot-loading-percent').textContent,'99%','rounding must not announce completion before readiness');
  assert.equal(element('boot-loading-track').attributes['aria-valuenow'],'99');
  view.finish();assert(element('boot-loading').classList.contains('is-complete'));advance(179);assert(!element('boot-loading').classList.contains('hidden'));advance(1);assert(element('boot-loading').classList.contains('hidden'));
  assert.equal(element('boot-loading-percent').textContent,'100%');
}
{
  const {view,element}=fixture();
  view.start('boot',{delay:0,stage:'读取配置',detail:'读取清单'});
  assert.equal(element('boot-loading-label').textContent,'读取配置');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'读取配置');
  view.update({completed:1,total:2,stage:'准备界面',detail:'导入应用模块'});
  assert.equal(element('boot-loading-label').textContent,'准备界面','ordinary loading hides diagnostic detail');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'准备界面');
  view.fail('暂时无法完成加载，请重试。',{detail:'下载图片：等待数据超时',onRetry:()=>{}});
  assert.equal(element('boot-loading-label').textContent,'暂时无法完成加载，请重试。');
}
{
  const {view,element,advance}=fixture({debug:true});
  view.start('boot',{delay:0,stage:'读取配置',detail:'读取清单'});
  assert.equal(element('boot-loading-label').textContent,'读取配置（读取清单）');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'读取配置（读取清单）');
  view.update({completed:1,total:2,stage:'准备界面',detail:'导入应用模块'});
  assert.equal(element('boot-loading-label').textContent,'准备界面（导入应用模块）');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'准备界面（导入应用模块）');
  assert.equal(element('boot-loading-fill').style.transform,'scaleX(0.5)');
  view.update({stage:'准备界面'});
  assert.equal(element('boot-loading-label').textContent,'准备界面','missing detail clears the previous diagnostic step');
  view.update({stage:'准备界面',detail:'连接交互'});view.finish();
  assert.equal(element('boot-loading-label').textContent,'准备完成');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'准备完成');
  advance(180);view.start('boot',{delay:0,stage:'读取配置'});
  assert.equal(element('boot-loading-label').textContent,'读取配置','a later start does not inherit diagnostic detail');
  view.update({stage:'读取配置',detail:'读取清单'});view.fail('配置读取失败',{onRetry:()=>{}});
  assert.equal(element('boot-loading-label').textContent,'配置读取失败','failure text replaces diagnostic detail');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],'配置读取失败');
  view.fail('暂时无法完成加载，请重试。',{detail:'解码图片：解码超时',onRetry:()=>{}});
  assert.equal(element('boot-loading-label').textContent,'暂时无法完成加载，请重试。（解码图片：解码超时）');
  assert.equal(element('boot-loading-track').attributes['aria-valuetext'],element('boot-loading-label').textContent);
}
{
  const {view,element,advance}=fixture({debug:true});
  view.start('boot',{stage:'读取配置',detail:'读取清单'});view.finish();advance(1000);
  assert(element('boot-loading').classList.contains('hidden'));
  assert.equal(element('boot-loading-label').textContent,'准备完成','instant completion clears hidden diagnostic detail');
  view.start('scene',{stage:'准备场景',detail:'生成地图'});view.finish({fade:false});
  assert(element('scene-loading').classList.contains('hidden'));
  assert.equal(element('scene-loading-track').attributes['aria-valuetext'],'准备完成');
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
assert.deepEqual([...bootstrap.matchAll(/^import .* from '([^']+)'/gm)].map(match=>match[1]),['./loading-ui.js','./boot-progress.js','./debug-search.js','./activity-log.js','./activity-log-view.js','./boot-modules.js'],'only lightweight loading and diagnostic utilities are in the initial dependency graph');
assert(bootstrap.indexOf("loading.start('boot'")<bootstrap.indexOf("modules.load('config'"));
assert(bootstrap.indexOf('await loadContentConfig')<bootstrap.indexOf("modules.load('app'"));
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert.match(html,/<script type="module" src="\.\/bootstrap\.js(?:[^\"]*)"><\/script>/);
for(const id of ['start-button','archive-button','help-button','sound-button'])assert.match(html,new RegExp(`id="${id}" disabled`));
const css=fs.readFileSync(new URL('./dist/loading.css',import.meta.url),'utf8');
assert.match(css,/\.loading-boot\{position:absolute/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/prefers-reduced-motion/);
console.log('Loading UI OK: delayed/no-flash startup, task progress, fade cleanup, superseded timers, retry/back, paint-before-work, boot ordering.');
