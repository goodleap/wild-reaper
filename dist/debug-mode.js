import { WORLD_IDS } from './world-definitions.js';
import { isDebugEnabled } from './debug-search.js';

export const DEBUG_OPTION_DEFS=Object.freeze([
  {id:'characterShowcase',label:'角色展示',description:'在独立场地查看全部角色，往返走动，无战斗、不保存冒险进度',defaultValue:false},
  {id:'fullLoadout',label:'全部武器、技能满级',description:'仅当前角色可用能力；奖励卡片自动选第一项',defaultValue:false},
  {id:'extraGold',label:'充足金币',description:'开局获得 500 金币',defaultValue:true},
  {id:'fastMovement',label:'高速移动',description:'移动速度 ×3',defaultValue:true},
  {id:'zeroStormCooldown',label:'天雷无冷却',description:'天雷轰击可连续释放',defaultValue:true},
  {id:'testFacilities',label:'出生点附近测试设施',description:'木桩和城堡入口',defaultValue:true},
  {id:'allBosses',label:'出生点全部 Boss',description:'全部独立类型各一只，城堡同类不重复，每只 10 万生命',defaultValue:false},
  {id:'allMonsters',label:'全部怪物',description:'所有非 Boss 怪物从屏幕外四周密集涌入，开局 64 只，持续快速补充',defaultValue:false}
].map(Object.freeze));

// Copy known boolean values only. Each run owns a fixed snapshot, and an
// ordinary entry cannot inherit boosts from stored developer preferences.
export function normalizeDebugOptions(options,enabled=true) {
  return Object.freeze(Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[
    def.id,enabled===true?(typeof options?.[def.id]==='boolean'?options[def.id]:def.defaultValue):false
  ])));
}

// Starting a showcase suppresses combat fixtures for that run only. Saved
// preparation switches retain their choices for the next ordinary adventure.
export function normalizeDebugRunOptions(options,enabled=true){
  const selected=normalizeDebugOptions(options,enabled);
  if(!selected.characterShowcase)return selected;
  return Object.freeze({...selected,fullLoadout:false,extraGold:false,zeroStormCooldown:false,testFacilities:false,allBosses:false,allMonsters:false});
}

// Legacy "full" links still enter diagnostics, but never select a loadout.
// Unrelated truthy strings do not enable developer tools.
export function debugConfigFromSearch(search='') {
  const params=search instanceof URLSearchParams?search:new URLSearchParams(search);
  const enabled=isDebugEnabled(params),world=params.get('world');
  return Object.freeze({enabled,...(enabled&&WORLD_IDS.includes(world)?{world}:{})});
}
