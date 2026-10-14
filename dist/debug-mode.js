import { WORLD_IDS } from './world-definitions.js';

export const DEBUG_OPTION_DEFS=Object.freeze([
  {id:'fullLoadout',label:'全部武器、技能满级',description:'仅当前角色可用能力；奖励卡片自动选第一项',defaultValue:false},
  {id:'extraGold',label:'充足金币',description:'开局获得 500 金币',defaultValue:true},
  {id:'fastMovement',label:'高速移动',description:'移动速度 ×3',defaultValue:true},
  {id:'zeroStormCooldown',label:'天雷无冷却',description:'天雷轰击可连续释放',defaultValue:true},
  {id:'testFacilities',label:'出生点附近测试设施',description:'木桩、调试首领和城堡入口',defaultValue:true},
  {id:'enemyWave',label:'开局包围怪群',description:'测试守护与范围攻击',defaultValue:false}
].map(Object.freeze));

// Copy known boolean values only. Each run owns a fixed snapshot, and an
// ordinary entry cannot inherit boosts from stored developer preferences.
export function normalizeDebugOptions(options,enabled=true) {
  return Object.freeze(Object.fromEntries(DEBUG_OPTION_DEFS.map(def=>[
    def.id,enabled===true?(typeof options?.[def.id]==='boolean'?options[def.id]:def.defaultValue):false
  ])));
}

// Legacy "full" links still enter diagnostics, but never select a loadout.
// Unrelated truthy strings do not enable developer tools.
export function debugConfigFromSearch(search='') {
  const params=search instanceof URLSearchParams?search:new URLSearchParams(search);
  const value=params.get('debug')?.toLowerCase();
  const enabled=value==='full'||value===''||value==='1'||value==='true',world=params.get('world');
  return Object.freeze({enabled,...(enabled&&WORLD_IDS.includes(world)?{world}:{})});
}
