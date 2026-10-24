const number=value=>Number.isFinite(value)&&value>0?value:0;
const phases=['snapshotMs','validateMs','serializeMs','storageMs'];
const empty=()=>({writes:0,failures:0,totalMs:0,maxMs:0,latestMs:0,latestBytes:0,rebuiltRegions:0,reusedRegions:0,...Object.fromEntries(phases.map(key=>[key,0]))});
const rounded=value=>Math.round(value*100)/100;
const summary=stats=>Object.fromEntries(Object.entries(stats).map(([key,value])=>[key,rounded(value)]));
function add(stats,sample){
  stats.writes++;stats.failures+=sample.status==='error'?1:0;
  stats.latestMs=number(sample.totalMs);stats.totalMs+=stats.latestMs;stats.maxMs=Math.max(stats.maxMs,stats.latestMs);
  stats.latestBytes=number(sample.bytes);stats.rebuiltRegions+=number(sample.rebuiltRegions);stats.reusedRegions+=number(sample.reusedRegions);
  for(const key of phases)stats[key]+=number(sample[key]);
}

// Only bounded timing/count metadata is retained. The existing activity logger
// batches disk writes; repeated checkpoints share a row instead of a timer.
export function createWorldSaveDiagnostics({log,clock=Date.now,windowMs=60000}={}){
  const totals=empty();let batch=null;
  return {
    record(sample,{debug=false,mode='guest'}={}){
      if(!sample)return;
      add(totals,sample);
      try{
        const now=clock(),status=sample.status==='error'?'error':'success',scope=mode==='account'?'account':'guest';
        const key=`${debug===true}:${scope}:${status}`;
        const fresh=!batch||batch.key!==key||now-batch.startedAt>=windowMs;
        if(fresh)batch={key,startedAt:now,id:null,stats:empty()};
        add(batch.stats,sample);
        const details={...summary(batch.stats),reason:String(sample.reason||'checkpoint').slice(0,64),scope,debug:debug===true,
          timing:'本机存档统计；不含网络同步，可能在帧回调之外执行，不能与帧 CPU 耗时直接相加。'};
        const label=status==='success'?`世界进度已保存（${batch.stats.writes} 次）`:`世界进度保存失败（${batch.stats.writes} 次）`;
        if(fresh){batch.id=log?.begin('storage','世界进度保存',{storage:'world-save',operation:'write',scope,debug:debug===true});log?.end(batch.id,{status,summary:label,details});}
        else log?.update(batch.id,{summary:label,details});
      }catch{}
    },
    get snapshot(){return {scope:'page-session',...summary(totals)};},
  };
}
