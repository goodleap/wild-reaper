import { WORLD_QUESTS,questDefinition } from './quest-definitions.js';

export const QUEST_STORAGE_KEY='wild-echoes-world-quests-v1';
const empty=()=>({version:1,records:{},tracked:{}});
export const emptyQuestRecord=()=>({discovered:false,accepted:false,completed:false,rewardClaimed:false,objectives:{}});
function clean(raw){
  const data=empty();
  if(raw?.version!==1)return data;
  for(const definition of WORLD_QUESTS){
    const value=raw.records?.[definition.id];if(!value||typeof value!=='object')continue;
    const record=emptyQuestRecord();
    for(const key of ['discovered','accepted','completed','rewardClaimed'])record[key]=value[key]===true;
    for(const objective of definition.objectives)if(value.objectives?.[objective.id]===true)record.objectives[objective.id]=true;
    // A corrupt completion flag must not open a route without its objectives.
    record.completed=record.completed&&definition.objectives.every(objective=>record.objectives[objective.id]);
    if(record.completed)record.accepted=true;
    if(record.accepted||Object.keys(record.objectives).length)record.discovered=true;
    data.records[definition.id]=record;
    if(raw.tracked?.[definition.worldId]===definition.id)data.tracked[definition.worldId]=definition.id;
  }
  return data;
}
function browserStorage(){try{return globalThis.localStorage??null;}catch{return null;}}

// Only objective flags and route changes persist. Hero state, enemies, loot
// and dungeon rooms remain owned by the current adventure.
export class QuestStore {
  constructor({storage=browserStorage()}={}){
    this.storage=storage;this.available=!!storage?.getItem&&!!storage?.setItem;this.readOnly=false;this.dirty=false;this.data=empty();
    if(!this.available)return;
    try{
      const raw=storage.getItem(QUEST_STORAGE_KEY),parsed=raw?JSON.parse(raw):null;
      if(Number.isFinite(parsed?.version)&&parsed.version>1){this.available=false;this.readOnly=true;return;}
      this.data=clean(parsed);
    }catch{this.available=false;}
  }
  record(id){if(!questDefinition(id))return null;return this.data.records[id]??=(emptyQuestRecord());}
  changed(){this.dirty=true;return this.flush();}
  refresh(){
    if(!this.available||this.readOnly)return false;
    try{
      // Other tabs may finish another objective. Merge monotonic facts before
      // writing; an older tab cannot remove a completed route or grant twice.
      const raw=this.storage.getItem(QUEST_STORAGE_KEY),parsed=raw?JSON.parse(raw):null;
      if(Number.isFinite(parsed?.version)&&parsed.version>1){this.available=false;this.readOnly=true;return false;}
      const remote=clean(parsed);
      for(const definition of WORLD_QUESTS){
        const theirs=remote.records[definition.id];if(!theirs)continue;
        const ours=this.record(definition.id);
        for(const key of ['discovered','accepted','completed','rewardClaimed'])ours[key]||=theirs[key];
        for(const objective of definition.objectives)if(theirs.objectives[objective.id])ours.objectives[objective.id]=true;
      }
      return true;
    }catch{this.available=false;return false;}
  }
  flush(){
    if(!this.dirty||!this.available||this.readOnly||!this.refresh())return false;
    try{this.storage.setItem(QUEST_STORAGE_KEY,JSON.stringify(this.data));this.dirty=false;return true;}
    catch{this.available=false;return false;}
  }
}
