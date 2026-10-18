import { ARCHIVE_PERSISTED_IDS, enemyArchiveId, companionArchiveId, ownedArchiveEntries } from './archive-catalog.js';
import { UPGRADE_DEFS } from './combat-catalog.js';
import { HEROES } from './heroes.js';
import { activityLog } from './activity-log.js';

export const ARCHIVE_STORAGE_KEY='wild-echoes-adventure-archive-v3';
const V2_ARCHIVE_KEY='wild-echoes-adventure-archive-v2';
const PREVIOUS_ARCHIVE_KEY='wild-echoes-adventure-archive';
const LEGACY_KEY='wild-echoes-endless-record';
const ENTRY_IDS=new Set(ARCHIVE_PERSISTED_IDS);
const HERO_IDS=new Set(HEROES.map(hero=>hero.id));
const MODIFIER_CAPS=new Map(UPGRADE_DEFS.filter(def=>def.upgradeKind==='modifier').map(def=>[def.id,def.cap]));
const COUNTER_LIMIT=1e12;
const finite=(value,limit=COUNTER_LIMIT)=>typeof value==='number'&&Number.isFinite(value)?Math.min(limit,Math.max(0,value)):0;
const integer=(value,limit=COUNTER_LIMIT)=>Math.floor(finite(value,limit));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const safeId=value=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value);
const emptyBest=()=>({time:0,kills:0,bossKills:0,level:0,wave:0});
const emptyEntry=()=>({seen:true,defeats:0,acquisitions:0,maxLevel:0,branches:[],evolved:false,modifiers:{}});
const emptyStageRecord=()=>({clears:0,bestTime:0});
const emptyData=()=>({version:3,totals:{runs:0,time:0,kills:0,bossKills:0,maxLevel:0,maxWave:0},best:{normal:emptyBest(),casual:emptyBest()},entries:{},stages:{},stories:{},legacy:null});
const sanitizeBest=value=>({time:finite(value?.time),kills:integer(value?.kills),bossKills:integer(value?.bossKills),level:integer(value?.level,1e6),wave:integer(value?.wave,1e6)});
function branchesOf(value){return [...new Set((Array.isArray(value)?value:[]).filter(safeId))].slice(0,12);}
function modifiersOf(value){const result={};if(plain(value))for(const [id,cap] of MODIFIER_CAPS){const rank=integer(value[id],cap);if(rank)result[id]=rank;}return result;}
function legacyOf(value){if(!plain(value))return null;const legacy={time:finite(value.time),kills:integer(value.kills),bossKills:integer(value.bossKills)};return Object.values(legacy).some(Boolean)?legacy:null;}
function sanitize(value){
  const data=emptyData();
  for(const key of Object.keys(data.totals))data.totals[key]=key==='time'?finite(value.totals?.[key]):integer(value.totals?.[key]);
  for(const difficulty of ['normal','casual'])data.best[difficulty]=sanitizeBest(value.best?.[difficulty]);
  if(plain(value.entries))for(const id of ENTRY_IDS){
    const source=value.entries[id];if(!plain(source))continue;
    const entry={...emptyEntry(),defeats:integer(source.defeats),acquisitions:integer(source.acquisitions),maxLevel:integer(source.maxLevel,1e6),branches:branchesOf(source.branches),evolved:source.evolved===true,modifiers:modifiersOf(source.modifiers)};
    if(source.seen===true||entry.defeats||entry.acquisitions)data.entries[id]=entry;
  }
  if(plain(value.stages))for(const [id,record] of Object.entries(value.stages).slice(0,128)){
    if(!safeId(id)||!plain(record))continue;
    data.stages[id]={};
    for(const difficulty of ['normal','casual']){
      const source=record[difficulty],clears=integer(source?.clears);
      const clean={clears,bestTime:clears?finite(source?.bestTime):0};
      if(clears)for(const key of ['bestHeroId','lastHeroId'])if(HERO_IDS.has(source?.[key]))clean[key]=source[key];
      data.stages[id][difficulty]=clean;
    }
  }
  if(plain(value.stories))for(const [id,record] of Object.entries(value.stories).slice(0,128)){
    if(!safeId(id)||!plain(record))continue;
    const clears=integer(record.clears);
    if(clears)data.stories[id]={clears,bestTime:finite(record.bestTime),lastTime:finite(record.lastTime)};
  }
  data.legacy=legacyOf(value.legacy);return data;
}
function defaultStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
const storageTime=()=>globalThis.performance?.now?.()??Date.now();
const storageEncoder=new TextEncoder();
const storageBytes=value=>typeof value==='string'?storageEncoder.encode(value).byteLength:0;
function startStorageLog(log,operation){
  try{return log.begin('storage',operation==='read'?'读取冒险档案':'保存冒险档案',{
    storage:'adventure-archive',operation,archiveVersion:3});}catch{return null;}
}
function finishStorageLog(log,id,{status='success',summary,details,error}={}){
  if(!id)return;
  try{
    if(error)log.captureError(error,{id,phase:'storage'});
    log.end(id,{status,summary,details});
  }catch{}
}

// This stores observations and run totals, never positions or a resumable run.
// Counters use monotonic per-run snapshots, so pause/end/save hooks may repeat.
export class AdventureArchive {
  constructor({storage=defaultStorage(),log=activityLog}={}) {
    this.storage=storage;this.storageOk=!!(storage?.getItem&&storage?.setItem);
    this.data=emptyData();this._runs=new WeakMap();this._active=null;this._dirty=false;this._readOnly=false;
    this._log=log;this._writeLog=null;
    const started=storageTime(),id=startStorageLog(log,'read');let bytes=0,warnings=0;
    const warn=(message,reason,details={})=>{warnings++;try{log.event(id,'warning',message,{reason,...details});}catch{}};
    const finish=(summary,details={},error)=>finishStorageLog(log,id,{status:error?'error':warnings?'warning':'success',summary,
      details:{operation:'read',bytes,durationMs:storageTime()-started,...details},error});
    if(!this.storageOk){warn('本地档案存储不可用','storage-unavailable');finish('档案仅保留在本次页面中');return;}
    try{
      // Separate generations prevent older open tabs from erasing chapter
      // records when their checkpoint code writes its previous storage key.
      const current=storage.getItem(ARCHIVE_STORAGE_KEY);
      const raw=current??storage.getItem(V2_ARCHIVE_KEY)??storage.getItem(PREVIOUS_ARCHIVE_KEY);
      bytes=storageBytes(raw);
      let saved=null;try{saved=raw?JSON.parse(raw):null;}catch{warn('档案 JSON 损坏，继续现有恢复流程','invalid-json');}
      if([1,2,3].includes(saved?.version)){
        this.data=sanitize(saved);this._dirty=current===null||saved.version!==3;
        finish(this._dirty?'档案已读取并准备升级':'档案已读取',{sourceVersion:saved.version,migrated:this._dirty});
        if(this._dirty)this.flush();return;
      }
      // A newer release owns its save; an older tab must not overwrite it.
      if(Number.isFinite(saved?.version)&&saved.version>3){
        this._readOnly=true;this.storageOk=false;
        warn('档案来自更新版本，当前页面保持只读','future-version',{sourceVersion:saved.version});
        finish('较新版本档案已保留',{sourceVersion:saved.version,readOnly:true});return;
      }
      if(saved!==null)warn('档案结构版本无法识别，继续现有恢复流程','unsupported-version');
      let legacy=null;try{const legacyRaw=storage.getItem(LEGACY_KEY);bytes+=storageBytes(legacyRaw);legacy=JSON.parse(legacyRaw);}
      catch{warn('旧档案无法读取或解析','legacy-read-or-json');}
      this.data.legacy=legacyOf(legacy);this._dirty=!!this.data.legacy;
      finish(this._dirty?'旧档案记录已恢复':raw?'已准备空白档案':'尚无本地档案',{legacyRecovered:this._dirty});
    }catch(error){this.storageOk=false;finish('读取档案失败',{},error);}
  }
  begin(game) {
    if(!plain(game))return false;
    if(this._runs.has(game))return true;
    if(this._active)this.finish(this._active,'exit');
    const difficulty=game.difficulty==='casual'||game.difficulty==='easy'?'casual':'normal';
    const candidate=game.stage?.id??game.expedition?.id;
    const stageId=safeId(candidate)?candidate:null;
    const heroId=HERO_IDS.has(game.hero?.id)?game.hero.id:null;
    const run={difficulty,stageId,heroId,stageCompletion:null,ended:false,reason:null,baseline:{...this.data.best[difficulty]},counted:emptyBest(),lastSavedTime:0,defeated:new WeakSet(),defeatedBosses:0,acquired:new Set(),discoveries:[],final:null};
    this._runs.set(game,run);this._active=game;
    this.data.totals.runs=integer(this.data.totals.runs+1);this._dirty=true;
    this.checkpoint(game,{force:true});return true;
  }
  _eligible(game){const run=this._runs.get(game);return run&&!run.ended?run:null;}
  _entry(run,id){
    if(!ENTRY_IDS.has(id))return null;
    if(!this.data.entries[id]){this.data.entries[id]=emptyEntry();run.discoveries.push(id);this._dirty=true;}
    return this.data.entries[id];
  }
  _observeBuild(game,run){
    const build=game.canonicalBuild||game.build;
    if(!build)return;
    for(const owned of ownedArchiveEntries(build)){
      const entry=this._entry(run,owned.id);if(!entry)continue;
      if(!run.acquired.has(owned.id)){run.acquired.add(owned.id);entry.acquisitions=integer(entry.acquisitions+1);this._dirty=true;}
      const level=integer(owned.level,1e6);
      if(level>entry.maxLevel){entry.maxLevel=level;this._dirty=true;}
      for(const branch of branchesOf(owned.branches??(owned.branch?[owned.branch]:[])))if(!entry.branches.includes(branch)&&entry.branches.length<12){entry.branches.push(branch);this._dirty=true;}
      if(owned.evolved&&!entry.evolved){entry.evolved=true;this._dirty=true;}
      for(const [id,rank] of Object.entries(modifiersOf(owned.modifiers)))if(rank>(entry.modifiers[id]||0)){entry.modifiers[id]=rank;this._dirty=true;}
    }
  }
  recordDefeat(game,enemy){
    const run=this._eligible(game);if(!run||!plain(enemy)||run.defeated.has(enemy))return false;
    const id=enemyArchiveId(enemy);if(!id)return false;
    const entry=this._entry(run,id);if(!entry)return false;
    run.defeated.add(enemy);entry.defeats=integer(entry.defeats+1);
    if(id.startsWith('boss:'))run.defeatedBosses++;
    this._dirty=true;return true;
  }
  recordRecruit(game,companion){
    const run=this._eligible(game),id=companionArchiveId(companion);if(!run||!id)return false;
    const entry=this._entry(run,id);if(run.acquired.has(id))return false;
    run.acquired.add(id);entry.acquisitions=integer(entry.acquisitions+1);this._dirty=true;return true;
  }
  _observeCompanions(game,run){
    for(const member of game.companions?.members||[])this.recordRecruit(game,member);
    // Site discovery is already gated by the world map's exploration rules.
    // Merely generating an unseen recruit must not unlock its archive entry.
    for(const site of game.relicSites?.sites||[])if(site.discovered){
      const id=companionArchiveId(site);if(id)this._entry(run,id);
    }
  }
  observe(game,{visibleEnemies=[],visibleCompanions=[]}={}){
    const run=this._eligible(game);if(!run)return false;
    for(const enemy of visibleEnemies){if(enemy?.hp<=0)continue;const id=enemyArchiveId(enemy);if(id)this._entry(run,id);}
    for(const companion of visibleCompanions){const id=companionArchiveId(companion);if(id)this._entry(run,id);}
    const camps=game.companions?.camps||(game.companions?.camp?[game.companions.camp]:[]);
    for(const camp of camps)if(!game.dungeon?.active&&!game.sceneTransition?.active&&game._inView?.(camp)){
      const id=companionArchiveId(camp);if(id)this._entry(run,id);
    }
    return this.checkpoint(game);
  }
  _snapshot(game,run){return {time:finite(game.runTime??game.time),kills:integer(game.kills),bossKills:Math.max(integer(game.bossKills),run.defeatedBosses),level:integer(game.player?.level,1e6),wave:integer(game.wave,1e6)};}
  recordStoryCompletion(game){
    const run=this._eligible(game),story=game?.story;
    if(!run||run.storyCompletion||!story?.completed||!safeId(story.id))return false;
    const time=finite(story.completionTime??game.runTime??game.time),previous=this.data.stories[story.id];
    const record={clears:integer((previous?.clears||0)+1),bestTime:previous?.clears?Math.min(previous.bestTime,time):time,lastTime:time};
    this.data.stories[story.id]=record;run.storyCompletion={id:story.id,time};this._dirty=true;this.flush();return true;
  }
  checkpoint(game,{force=false}={}){
    const run=this._eligible(game);if(!run)return false;
    this.recordStoryCompletion(game);
    this._observeBuild(game,run);
    this._observeCompanions(game,run);
    const snapshot=this._snapshot(game,run),totals=this.data.totals,best=this.data.best[run.difficulty];
    for(const key of ['time','kills','bossKills']){
      const delta=Math.max(0,snapshot[key]-run.counted[key]);
      if(delta){totals[key]=finite(totals[key]+delta);this._dirty=true;}
    }
    for(const key of Object.keys(snapshot)){
      run.counted[key]=Math.max(run.counted[key],snapshot[key]);
      if(run.counted[key]>best[key]){best[key]=run.counted[key];this._dirty=true;}
    }
    for(const [key,runKey] of [['maxLevel','level'],['maxWave','wave']])if(run.counted[runKey]>totals[key]){totals[key]=run.counted[runKey];this._dirty=true;}
    if(force||run.counted.time-run.lastSavedTime>=5){run.lastSavedTime=run.counted.time;return this.flush();}
    return true;
  }
  finish(game,reason='death'){
    const run=this._runs.get(game);if(!run)return this.summary(game);
    if(!run.ended){
      this.checkpoint(game,{force:true});
      run.final={...run.counted};run.ended=true;run.reason=typeof reason==='string'?reason.slice(0,32):'death';
      const completedStage=game.stage?.id===run.stageId&&game.stage.completed===true&&game.stage.coreDefeated===true;
      const completedExpedition=game.expedition?.id===run.stageId&&game.expedition.completed===true;
      if(reason==='victory'&&game.status==='victory'&&run.stageId&&(completedStage||completedExpedition)){
        const records=this.data.stages[run.stageId]??={normal:emptyStageRecord(),casual:emptyStageRecord()};
        const record=records[run.difficulty],time=run.final.time,isBest=record.clears===0||time<record.bestTime;
        record.clears=integer(record.clears+1);
        if(isBest){record.bestTime=time;if(run.heroId)record.bestHeroId=run.heroId;else delete record.bestHeroId;}
        if(run.heroId)record.lastHeroId=run.heroId;else delete record.lastHeroId;
        run.stageCompletion={id:run.stageId,heroId:run.heroId,time,clears:record.clears,bestTime:record.bestTime,isBest};
        this._dirty=true;this.flush();
      }
      if(this._active===game)this._active=null;
    }
    return this.summary(game);
  }
  summary(game){
    const run=this._runs.get(game);
    if(!run)return {excluded:true,reason:null,discoveries:[],records:[],run:emptyBest()};
    const snapshot=run.final||run.counted;
    return {excluded:false,reason:run.reason,discoveries:[...run.discoveries],records:Object.keys(snapshot).filter(key=>snapshot[key]>run.baseline[key]).map(key=>({key,previous:run.baseline[key],value:snapshot[key]})),run:{...snapshot},stageCompletion:run.stageCompletion?{...run.stageCompletion}:null};
  }
  flush(){
    if(!this._dirty)return this.storageOk;
    const started=storageTime();let bytes=0;
    if(!this.storage?.setItem||this._readOnly){
      this.storageOk=false;this._recordStorageWrite({started,status:'warning',reason:this._readOnly?'read-only':'storage-unavailable'});return false;
    }
    try{
      const serialized=JSON.stringify(this.data);bytes=storageBytes(serialized);
      this.storage.setItem(ARCHIVE_STORAGE_KEY,serialized);this._dirty=false;this.storageOk=true;
      this._recordStorageWrite({started,bytes,status:'success'});return true;
    }catch(error){this.storageOk=false;this._recordStorageWrite({started,bytes,status:'error',error});return false;}
  }
  _recordStorageWrite({started,bytes=0,status,error,reason}){
    // Checkpoints stay at their existing cadence. Only their diagnostic rows
    // share a one-minute window, and logger failures never affect the archive.
    try{
      const durationMs=storageTime()-started,key=`${status}:${reason||error?.name||''}:${error?.message||''}`;
      let batch=this._writeLog;
      const fresh=!batch||batch.key!==key||started-batch.started>=60000;
      if(fresh)batch=this._writeLog={id:startStorageLog(this._log,'write'),key,started,writes:0,totalBytes:0,totalDurationMs:0,maxDurationMs:0};
      batch.writes++;batch.totalBytes+=bytes;batch.totalDurationMs+=durationMs;batch.maxDurationMs=Math.max(batch.maxDurationMs,durationMs);
      const details={operation:'write',archiveVersion:3,writes:batch.writes,bytes,totalBytes:batch.totalBytes,
        durationMs,totalDurationMs:batch.totalDurationMs,maxDurationMs:batch.maxDurationMs,reason};
      const summary=status==='success'?`档案已保存（${batch.writes} 次）`:status==='warning'?'档案写入已跳过':'档案保存失败';
      if(fresh){
        if(status==='warning')this._log.event(batch.id,'warning',summary,{reason});
        finishStorageLog(this._log,batch.id,{status,summary,details,error});
      }else{
        if(error)this._log.captureError(error,{id:batch.id,phase:'storage'});
        this._log.update(batch.id,{summary,details});
      }
    }catch{}
  }
}
