import { ARCHIVE_PERSISTED_IDS, enemyArchiveId, companionArchiveId, ownedArchiveEntries } from './archive-catalog.js';
import { UPGRADE_DEFS } from './combat-catalog.js';
import { HEROES } from './heroes.js';

export const ARCHIVE_STORAGE_KEY='wild-echoes-adventure-archive-v2';
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
const emptyData=()=>({version:2,totals:{runs:0,time:0,kills:0,bossKills:0,maxLevel:0,maxWave:0},best:{normal:emptyBest(),casual:emptyBest()},entries:{},stages:{},legacy:null});
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
  data.legacy=legacyOf(value.legacy);return data;
}
function defaultStorage(){try{return globalThis.localStorage??null;}catch{return null;}}

// This stores observations and run totals, never positions or a resumable run.
// Counters use monotonic per-run snapshots, so pause/end/save hooks may repeat.
export class AdventureArchive {
  constructor({storage=defaultStorage()}={}) {
    this.storage=storage;this.storageOk=!!(storage?.getItem&&storage?.setItem);
    this.data=emptyData();this._runs=new WeakMap();this._active=null;this._dirty=false;this._readOnly=false;
    if(!this.storageOk)return;
    try{
      // A separate generation prevents an already-open v1 tab from erasing
      // stage records when its older checkpoint code writes the previous key.
      const current=storage.getItem(ARCHIVE_STORAGE_KEY);
      const raw=current??storage.getItem(PREVIOUS_ARCHIVE_KEY);
      let saved=null;try{saved=raw?JSON.parse(raw):null;}catch{}
      if(saved?.version===1||saved?.version===2){this.data=sanitize(saved);this._dirty=current===null||saved.version===1;if(this._dirty)this.flush();return;}
      // A newer release owns its save; an older tab must not overwrite it.
      if(Number.isFinite(saved?.version)&&saved.version>2){this._readOnly=true;this.storageOk=false;return;}
      let legacy=null;try{legacy=JSON.parse(storage.getItem(LEGACY_KEY));}catch{}
      this.data.legacy=legacyOf(legacy);this._dirty=!!this.data.legacy;
    }catch{this.storageOk=false;}
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
    if(!game.build)return;
    for(const owned of ownedArchiveEntries(game.build)){
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
  checkpoint(game,{force=false}={}){
    const run=this._eligible(game);if(!run)return false;
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
    if(!this.storage?.setItem||this._readOnly){this.storageOk=false;return false;}
    try{this.storage.setItem(ARCHIVE_STORAGE_KEY,JSON.stringify(this.data));this._dirty=false;this.storageOk=true;return true;}
    catch{this.storageOk=false;return false;}
  }
}
