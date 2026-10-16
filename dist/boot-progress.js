// Observe the browser's existing module requests. The release manifest records
// source byte sizes, so cached and compressed responses share the same weights.
// No fetch, polling loop or extra preload is used to measure script progress.
const TASK_WEIGHTS=Object.freeze({config:.04,image:.03,app:.04,frame:.03});
const NETWORK_WEIGHT=.86;
const positive=value=>Number.isFinite(value)&&value>0?value:0;
export function createBootProgress({view,manifest={},imports={},baseURL,performance=globalThis.performance,Observer=globalThis.PerformanceObserver,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>performance?.now?.()??Date.now()}={}){
  const modules=new Map(),downloads=new Map(),groups=new Map(),tasks=new Set();
  const canonical=path=>new URL(imports[path]||path,baseURL).href;
  for(const [name,entries]of Object.entries(manifest.groups||{})){
    const urls=[];
    for(const [path,bytes]of entries){if(!positive(bytes))continue;const url=canonical(path);urls.push(url);if(!modules.has(url))modules.set(url,{bytes,ratio:0});}
    groups.set(name,urls);
  }
  for(const [path,bytes]of Object.entries(manifest.assets||{}))if(positive(bytes))downloads.set(path,{bytes,ratio:0});
  const totalBytes=[...modules.values(),...downloads.values()].reduce((sum,item)=>sum+item.bytes,0);
  let observer=null,active=true,timer=null,lastUpdate=-Infinity,shown=0;
  let stage='正在加载冒险内容',detail='加载配置模块';
  const ratio=()=>Math.min(.99,(totalBytes?[...modules.values(),...downloads.values()].reduce((sum,item)=>sum+item.bytes*item.ratio,0)/totalBytes*NETWORK_WEIGHT:0)+[...tasks].reduce((sum,name)=>sum+TASK_WEIGHTS[name],0));
  function flush(){
    if(timer!==null){clearTimer(timer);timer=null;}
    if(!active)return;
    shown=Math.max(shown,ratio());lastUpdate=now();
    view.update({completed:shown,total:1,stage,detail});
  }
  function schedule(){
    if(!active)return;
    const remaining=100-(now()-lastUpdate);
    if(remaining<=0)flush();else if(timer===null)timer=setTimer(flush,remaining);
  }
  function receive(entries){
    let changed=false;
    for(const entry of entries){
      const item=modules.get(entry.name);
      if(!item||item.ratio===1||entry.responseStatus>=400)continue;
      item.ratio=1;changed=true;
    }
    if(changed)schedule();
  }
  // Buffered observation includes warm-cache requests and the lightweight
  // dependencies that finished before bootstrap began collecting progress.
  try{
    if(Observer){observer=new Observer(list=>{if(active)receive(list.getEntries());});observer.observe({type:'resource',buffered:true});}
    receive(performance?.getEntriesByType?.('resource')||[]);
  }catch{observer?.disconnect();observer=null;}
  function stop(){active=false;observer?.disconnect();observer=null;if(timer!==null){clearTimer(timer);timer=null;}}
  return {
    setStage(nextStage,nextDetail){if(!active)return;stage=nextStage;detail=nextDetail||'';schedule();},
    modulesReady(name){if(!active)return;for(const url of groups.get(name)||[])modules.get(url).ratio=1;schedule();},
    download(path,{loaded=0,total,done=false}={}){
      if(!active)return;const item=downloads.get(path);if(!item)return;
      // Without a trustworthy body size, completion is the only fraction we
      // know. Even an exact expected byte count does not imply EOF or decode.
      const next=done?1:positive(total)?Math.min(.999,Math.max(0,loaded)/total):0;
      item.ratio=Math.max(item.ratio,next);schedule();
    },
    resolvedDownload(path){if(!active)return;const item=downloads.get(path);if(item)item.ratio=1;schedule();},
    completeTask(name){if(!active)return;if(Object.hasOwn(TASK_WEIGHTS,name))tasks.add(name);schedule();},
    finish(){if(!active)return;stop();view.update({completed:1,total:1,stage:'准备完成',detail:'首页可交互'});},
    stop
  };
}
