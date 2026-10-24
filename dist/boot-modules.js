// Native module failures are cached by the current document. Retrying only the
// entry import cannot recover a failed static dependency; use one fresh page.
const RECOVERY_KEY='wild-reaper-module-recovery';
const networkImportError=error=>error?.name==='TypeError'&&
  /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|failed to load module script/i.test(error.message||'');

export function createBootModules({manifest={},imports={},baseURL,version,
  performance=globalThis.performance,storage=()=>globalThis.sessionStorage,now=Date.now}={}){
  let group=null,previous=null;
  try{
    const record=JSON.parse(storage()?.getItem(RECOVERY_KEY)||'null');
    if(record?.version===version&&Number.isFinite(record.at))previous=record;
  }catch{}
  function clear(){try{storage()?.removeItem(RECOVERY_KEY);}catch{}}
  function report(){
    if(!group)return null;
    let timings=[];try{timings=performance?.getEntriesByType?.('resource')||[];}catch{}
    const entries=new Map(timings.map(entry=>[entry.name,entry]));
    const modules=(manifest.groups?.[group]||[]).map(([path,bytes])=>{
      const entry=entries.get(new URL(imports[path]||path,baseURL).href);
      const status=Number(entry?.responseStatus)||null;
      const received=Number(entry?.decodedBodySize)||0;
      return {path:path.split(/[?#]/)[0],bytes,status,observed:!!entry,
        // Missing timing/status is inconclusive, particularly in WebKit.
        responseReceived:!!entry&&(status>=200&&status<400||received>0&&!(status>=400)),
        durationMs:entry?Math.round(entry.duration):null};
    });
    const failed=modules.filter(item=>item.status>=400);
    const unconfirmed=modules.filter(item=>!item.responseReceived&&!(item.status>=400));
    return {group,evidence:'resource-timing-only',total:modules.length,observed:modules.filter(item=>item.observed).length,
      failed:failed.slice(0,12).map(item=>({...item})),unconfirmedCount:unconfirmed.length,
      unconfirmed:unconfirmed.sort((a,b)=>Number(b.observed)-Number(a.observed)).slice(0,12).map(item=>({...item})),
      slowest:modules.filter(item=>item.observed).sort((a,b)=>b.durationMs-a.durationMs).slice(0,6).map(item=>({...item}))};
  }
  return {
    previous,
    async load(name,load){group=name;const result=await load();group=null;return result;},
    report,
    recover(error,bootId){
      if(!group||previous||!networkImportError(error))return false;
      try{
        const record={version,at:now(),group,bootId};
        const target=storage();if(!target)return false;
        target.setItem(RECOVERY_KEY,JSON.stringify(record));
        if(target.getItem(RECOVERY_KEY)!==JSON.stringify(record))return false;
        previous=record;return true;
      }catch{return false;}
    },
    clear
  };
}
