import assert from 'node:assert/strict';
import { createBootProgress } from './dist/boot-progress.js';

function fixture({observe=true,buffered=[]}={}){
  let now=0,serial=0,observer;const jobs=new Map(),updates=[];
  class Observer{
    constructor(callback){this.callback=callback;observer=this;}
    observe(options){assert.deepEqual(options,{type:'resource',buffered:true});}
    disconnect(){this.disconnected=true;}
    send(entries){this.callback({getEntries:()=>entries});}
  }
  const baseURL='https://example.test/wild-reaper/index.html?debug';
  const manifest={groups:{config:[['./config.js',100],['./shared.js',100]],art:[['./shared.js',100]],app:[['./shared.js',100],['./app.js',100]]},assets:{'./data.json':200,'./art.png':100}};
  const imports=Object.fromEntries(['config','shared','app'].map(name=>[`./${name}.js`,`./${name}.js?v=126&h=current`]));
  const url=name=>new URL(imports[`./${name}.js`],baseURL).href;
  const progress=createBootProgress({view:{update:event=>updates.push({...event,at:now})},manifest,imports,baseURL,
    Observer:observe?Observer:null,performance:{getEntriesByType:()=>buffered},now:()=>now,
    setTimer:(fn,delay)=>{const id=++serial;jobs.set(id,{fn,at:now+delay});return id;},clearTimer:id=>jobs.delete(id)});
  const advance=ms=>{now+=ms;for(const [id,job]of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}};
  return {progress,updates,jobs,url,advance,get observer(){return observer;}};
}
{
  const f=fixture();f.progress.setStage('正在加载冒险内容','加载配置模块');
  f.observer.send([{name:f.url('config'),responseStatus:200},{name:f.url('shared'),responseStatus:0}]);
  f.advance(100);
  assert(Math.abs(f.updates.at(-1).completed-.86/3)<1e-9,'overlapping module closures count each resource once, including a cache hit');
  const count=f.updates.length;
  f.observer.send([{name:f.url('config')},{name:f.url('app').replace('current','stale')},{name:f.url('app'),responseStatus:404}]);
  f.advance(100);assert.equal(f.updates.length,count,'duplicate, stale-version and failed requests do not advance progress');
  f.progress.download('./data.json',{loaded:50,total:200});f.advance(100);
  assert(Math.abs(f.updates.at(-1).completed-(250/600)*.86)<1e-9,'bytes received advance progress before the response finishes');
  const partial=f.updates.at(-1).completed;
  f.progress.download('./data.json',{loaded:20,total:200});f.advance(100);
  assert.equal(f.updates.at(-1).completed,partial,'late samples cannot rewind the bar');
  f.progress.download('./art.png',{loaded:70,total:null});f.advance(100);
  assert.equal(f.updates.at(-1).completed,partial,'an unknown total is not a guessed percentage');
  f.progress.download('./art.png',{loaded:100,total:100,done:false});f.advance(100);
  assert(f.updates.at(-1).completed<(350/600)*.86,'the expected last byte does not imply EOF');
  f.progress.download('./art.png',{loaded:100,total:100,done:true});f.progress.resolvedDownload('./data.json');
  f.progress.modulesReady('app');for(const task of ['config','image','app','frame'])f.progress.completeTask(task);f.advance(100);
  assert.equal(f.updates.at(-1).completed,.99,'all measured work still waits for the explicit interactive-ready signal');
  f.progress.finish();assert.equal(f.updates.at(-1).completed,1);assert(f.observer.disconnected);assert.equal(f.jobs.size,0);
  const finished=f.updates.length;f.observer.send([{name:f.url('app')}]);f.progress.setStage('迟到','不应显示');f.advance(1000);assert.equal(f.updates.length,finished);
}
{
  const f=fixture();f.progress.setStage('读取配置','下载');
  for(let i=0;i<100;i++){f.progress.download('./data.json',{loaded:i,total:200});f.progress.setStage('读取配置','下载');}
  assert.equal(f.updates.length,1);assert.equal(f.jobs.size,1,'a burst shares one scheduled UI update');
  f.advance(99);assert.equal(f.updates.length,1);f.advance(1);assert.equal(f.updates.length,2);
  f.progress.setStage('准备画面','解码');f.progress.stop();f.advance(1000);assert.equal(f.updates.length,2);assert.equal(f.jobs.size,0);assert(f.observer.disconnected,'failure cleanup disconnects resource observation');
}
{
  const f=fixture({observe:false});f.progress.modulesReady('config');f.advance(100);
  assert(f.updates.at(-1).completed>0,'unsupported timing observation retains genuine completed-task progress');
  f.progress.stop();
}
{
  const url='https://example.test/wild-reaper/config.js?v=126&h=current';
  const f=fixture({buffered:[{name:url,responseStatus:200}]});
  assert(f.updates[0].completed>0,'requests completed before observation are included');f.progress.stop();
}
console.log('Boot progress: weighted existing requests, byte updates, cache/deduplication, unknown lengths, 100 ms coalescing, ready gate and cleanup passed.');
