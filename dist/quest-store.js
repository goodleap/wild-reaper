import { WORLD_QUESTS,questDefinition,questWorlds } from './quest-definitions.js';
import { WORLD_IDS } from './world-definitions.js';

export const QUEST_STORAGE_KEY='wild-echoes-world-quests-v1';
const empty=()=>({version:1,records:{},tracked:{}});
export const emptyQuestRecord=()=>({discovered:false,accepted:false,completed:false,rewardClaimed:false,objectives:{}});
const groups=new Set(['primary','secondary','reinforcement-1','reinforcement-2','reinforcement-3']);
function commissionState(value){
  const result={groups:{}};if(!value||typeof value!=='object')return result;
  for(const key of groups)if(value.groups?.[key]===true)result.groups[key]=true;
  if(value.actor&&['x','y'].every(key=>Number.isFinite(value.actor[key])&&Math.abs(value.actor[key])<=50000))result.actor={x:value.actor.x,y:value.actor.y};
  if(value.repairStarted===true)result.repairStarted=true;
  if(Number.isFinite(value.repairProgress))result.repairProgress=Math.min(8,Math.max(0,value.repairProgress));
  if(Number.isFinite(value.lastRestAt))result.lastRestAt=Math.max(0,value.lastRestAt);
  return result;
}
function clean(raw){
  const data=empty();
  if(raw?.version!==1)return data;
  for(const definition of WORLD_QUESTS){
    const value=raw.records?.[definition.id];if(!value||typeof value!=='object')continue;
    const record=emptyQuestRecord();
    for(const key of ['discovered','accepted','completed','rewardClaimed'])record[key]=value[key]===true;
    for(const objective of definition.objectives)if(value.objectives?.[objective.id]===true)record.objectives[objective.id]=true;
    // Completion and payment require a real acceptance; objective facts alone
    // can predate it and must survive until the player chooses the commission.
    record.completed=record.accepted&&record.completed&&definition.objectives.filter(objective=>!objective.optional).every(objective=>record.objectives[objective.id]);
    record.rewardClaimed=record.completed&&record.rewardClaimed;
    if(record.accepted||Object.keys(record.objectives).length)record.discovered=true;
    if(definition.commission)record.commission=commissionState(value.commission);
    data.records[definition.id]=record;
    if(record.accepted&&!record.completed)for(const worldId of definition.worldIds?WORLD_IDS:questWorlds(definition))if(raw.tracked?.[worldId]===definition.id)data.tracked[worldId]=definition.id;
    if(record.accepted&&!record.completed&&definition.worldIds&&raw.tracked?.journey===definition.id)data.tracked.journey=definition.id;
  }
  return data;
}
function browserStorage(){try{return globalThis.localStorage??null;}catch{return null;}}

// Objective facts, small work timers and one escort position persist here.
// Hero state, enemies, loot and dungeon rooms belong to the adventure snapshot.
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
        if(definition.commission&&theirs.commission){ours.commission??=commissionState(null);for(const key of groups)if(theirs.commission.groups[key])ours.commission.groups[key]=true;}
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
