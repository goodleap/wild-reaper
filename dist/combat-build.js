import { WEAPON_DEFS, SKILL_DEFS, SUPER_SKILL_DEFS, UPGRADE_DEFS, ENDLESS_UPGRADES, EVOLUTIONS, getUpgradeDefinition, canTakeUpgrade, meetsUpgradeRequirements } from './combat-catalog.js';
import { branchDefinition, isBranchReady } from './weapon-branches.js';

const ALL_UPGRADES=[...UPGRADE_DEFS,...ENDLESS_UPGRADES];
const natural=value=>Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
const view=(target,id,get,set)=>Object.defineProperty(target,id,{enumerable:true,configurable:false,get,set});
function record(def) {
  const state={id:def.id,baseRank:def.initialRank,modifiers:{},branch:null,evolved:false,equipped:def.initialRank>0};
  // Overall Lv counts each investment once. Main ranks remain separately
  // capped so a post-evolution modifier never accidentally adds more blades.
  Object.defineProperties(state,{
    rank:{enumerable:false,get(){return this.baseRank;},set(value){this.baseRank=natural(value);}},
    level:{enumerable:true,get(){return this.baseRank+Object.values(this.modifiers).reduce((sum,n)=>sum+n,0)+(def.id==='arrow'&&this.branch?1:0);}},
    acquired:{enumerable:true,get(){return this.baseRank>0;}}
  });
  return state;
}

export class CombatBuild {
  constructor() {
    this.progressionTier=1;this.rescuePower=0;
    this.attributes=Object.fromEntries(ALL_UPGRADES.filter(def=>def.category==='attribute').map(def=>[def.id,0]));
    this.attributes.defense=0;
    this.weapons=Object.fromEntries(Object.values(WEAPON_DEFS).map(def=>[def.id,record(def)]));
    this.skills=Object.fromEntries(Object.values(SKILL_DEFS).map(def=>[def.id,record(def)]));
    this.levels={};this.branches={};this.evolutions={};this.superLevels={};
    for(const def of ALL_UPGRADES) {
      if(def.upgradeKind==='modifier')this._owner(def).modifiers[def.id]=0;
      view(this.levels,def.id,()=>this.getRank(def.id),value=>this._setRank(def,natural(value)));
    }
    for(const id of ['sword','arrow','pulse','lightning','domain'])view(this.branches,id,()=>this._record(id).branch,value=>{
      if(value===null||branchDefinition(id,value))this._record(id).branch=value;
    });
    for(const id of Object.keys(EVOLUTIONS))view(this.evolutions,id,()=>this._record(id).evolved,value=>{this._record(id).evolved=!!value;});
    for(const def of SUPER_SKILL_DEFS)view(this.superLevels,def.id,()=>this.skills[def.id].baseRank,value=>{
      const skill=this.skills[def.id];skill.baseRank=Math.min(def.maxBaseRank,natural(value));skill.equipped=skill.baseRank>0;
    });
  }
  _record(id){return this.weapons[id]||this.skills[id]||null;}
  _owner(def){return def.category==='weapon'?this.weapons[def.ownerId]:this.skills[def.ownerId];}
  getWeapon(id){return this.weapons[id]||null;}
  getSkill(id){return this.skills[id]||null;}
  getRank(id) {
    if(typeof id!=='string')return 0;
    if(id.startsWith('super:'))return this.skills[id.slice(6)]?.baseRank||0;
    const def=getUpgradeDefinition(id);if(!def)return 0;
    if(def.category==='attribute')return this.attributes[id]||0;
    const owner=this._owner(def);
    if(def.upgradeKind==='modifier')return owner.modifiers[id]||0;
    return Math.max(0,owner.baseRank-(id==='storm'?1:0));
  }
  _setRank(def,value) {
    value=Math.min(def.cap,value);
    if(def.category==='attribute'){this.attributes[def.id]=value;return;}
    const owner=this._owner(def);
    if(def.upgradeKind==='modifier'){owner.modifiers[def.id]=value;return;}
    const wasOwned=owner.baseRank>0;owner.baseRank=value+(def.id==='storm'?1:0);
    if(!owner.baseRank)owner.equipped=false;
    else if(!wasOwned)owner.equipped=true;
  }
  increment(id) {
    if(!canTakeUpgrade(this,id))return false;
    if(id.startsWith('super:'))this.superLevels[id.slice(6)]=this.getRank(id)+1;
    else this._setRank(getUpgradeDefinition(id),this.getRank(id)+1);
    return true;
  }
  selectBranch(id,branch) {
    if(!branchDefinition(id,branch)||!isBranchReady(this,id))return false;
    this._record(id).branch=branch;
    if(id!=='arrow')this._record(id).baseRank=5;
    return true;
  }
  awardDomain(branch) {
    if(!branchDefinition('domain',branch))return false;
    const item=this.skills.domain;
    if(item.baseRank>=3||(item.baseRank>0&&item.branch&&item.branch!==branch))return false;
    item.branch=branch;item.baseRank++;item.equipped=true;
    return true;
  }
  awardRuneArrow() {
    const item=this.weapons.arrow;
    if(item.branch==='ricochet'||item.modifiers.arrowRune>=3)return false;
    if(!item.baseRank){item.baseRank=1;item.equipped=true;}
    item.branch='pierce';item.modifiers.arrowRune++;
    return true;
  }
  isEquipped(id){const item=this.weapons[id];return !!(item?.baseRank>0&&item.equipped);}
  setEquipped(id,equipped) {
    const item=this.weapons[id];
    if(!item||!item.baseRank||typeof equipped!=='boolean')return false;
    item.equipped=equipped;return true;
  }
  _loadout(state,def) {
    const branch=branchDefinition(state.id,state.branch);
    const evolution=EVOLUTIONS[state.id];
    const branchName=branch?.name;
    const name=branchName||(state.evolved?evolution?.name:null)||def.name;
    return {...def,name,baseName:def.name,icon:branch?.icon||def.icon,level:state.level,baseRank:state.baseRank,branch:state.branch,branchName,
      evolved:state.evolved,evolutionName:state.evolved?(branchName||evolution?.name):undefined,equipped:state.equipped,
      automatic:def.activation==='automatic',enhancements:ALL_UPGRADES.filter(upgrade=>upgrade.category===def.category&&upgrade.ownerId===state.id&&upgrade.upgradeKind==='modifier'&&state.modifiers[upgrade.id]>0).map(upgrade=>({id:upgrade.id,name:upgrade.name,rank:state.modifiers[upgrade.id],cap:upgrade.cap}))};
  }
  getWeaponLoadout(){return Object.values(this.weapons).filter(item=>item.baseRank>0).map(item=>this._loadout(item,WEAPON_DEFS[item.id]));}
  getSkillLoadout(){return Object.values(this.skills).filter(item=>item.baseRank>0).map(item=>this._loadout(item,SKILL_DEFS[item.id]));}
  previewUpgrade(choice) {
    if(typeof choice==='string')choice={id:choice};
    if(!choice?.id)return null;
    const next=CombatBuild.fromSnapshot(this.serialize());
    const parts=choice.id.split(':');
    if(choice.domainBranch) {
      if(!next.awardDomain(choice.domainBranch))return null;
    }else if(choice.id==='runeArrow') {
      if(!next.awardRuneArrow())return null;
    }else if(parts[0]==='branch') {
      if(!next.selectBranch(choice.ownerId||choice.weaponId||parts[1],choice.branch||parts[2]))return null;
    }else if(SUPER_SKILL_DEFS.some(def=>def.id===choice.id)) {
      if(next.superLevels[choice.id]>=SKILL_DEFS[choice.id].maxBaseRank)return null;
      next.superLevels[choice.id]++;
    }else if(!next.increment(choice.id))return null;
    for(const id of Object.keys(EVOLUTIONS))next.evolutions[id]=next._canEvolve(id);
    return next;
  }
  _canEvolve(id){const item=this._record(id);return !!EVOLUTIONS[id]&&item.baseRank>=5&&(id==='orbit'||!!item.branch);}

  // This is a combat-build snapshot, not a saved run: positions, loot, timers,
  // HP and world events belong to their respective future persistence layer.
  serialize() {
    const save=records=>Object.fromEntries(Object.values(records).map(item=>[item.id,{baseRank:item.baseRank,modifiers:{...item.modifiers},branch:item.branch,evolved:item.evolved,equipped:item.equipped}]));
    return {version:2,progressionTier:this.progressionTier,rescuePower:this.rescuePower,attributes:{...this.attributes},weapons:save(this.weapons),skills:save(this.skills)};
  }
  static fromSnapshot(snapshot) {
    if(!snapshot||![1,2].includes(snapshot.version))throw new TypeError('Unsupported combat build snapshot');
    if(snapshot.version===1){
      snapshot=structuredClone(snapshot);
      const oldBinding=snapshot.skills?.thorns,oldErosion=snapshot.skills?.miasma;
      const oldDomain=(oldErosion?.baseRank||0)>(oldBinding?.baseRank||0)?oldErosion:oldBinding;
      if(oldDomain?.baseRank&&!snapshot.skills.domain)snapshot.skills.domain={...oldDomain,branch:oldDomain===oldErosion?'erosion':'binding',evolved:false};
      const runic=snapshot.skills?.runes?.baseRank||0,arrow=snapshot.weapons?.arrow;
      if(runic&&arrow){
        if(arrow.branch==='ricochet')arrow.modifiers.arrowPower=Math.min(3,(arrow.modifiers.arrowPower||0)+runic);
        else {arrow.baseRank=1;arrow.branch='pierce';arrow.modifiers.arrowRune=Math.min(3,runic);}
      }
    }
    const build=new CombatBuild();
    const readNumber=(value,label,min=0,max=Number.MAX_SAFE_INTEGER)=>{
      if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`Invalid combat build ${label}`);
      return value;
    };
    build.progressionTier=readNumber(snapshot.progressionTier,'progressionTier',1);
    build.rescuePower=readNumber(snapshot.rescuePower,'rescuePower');
    for(const id of Object.keys(build.attributes))if(snapshot.attributes?.[id]!==undefined)build.attributes[id]=readNumber(snapshot.attributes[id],id,0,getUpgradeDefinition(id)?.cap??Number.MAX_SAFE_INTEGER);
    const restore=(destination,source,defs)=>{
      if(!source||typeof source!=='object')throw new TypeError('Missing combat build records');
      for(const [id,item] of Object.entries(destination)) {
        const saved=source[id];if(!saved)continue;
        item.baseRank=readNumber(saved.baseRank,`${id}.baseRank`,defs[id].initialRank,defs[id].maxBaseRank);
        if(typeof saved.equipped!=='boolean'||typeof saved.evolved!=='boolean')throw new TypeError(`Invalid combat build flags: ${id}`);
        if(saved.branch!==null&&!branchDefinition(id,saved.branch))throw new TypeError(`Invalid combat build branch: ${id}`);
        item.branch=saved.branch;item.equipped=item.baseRank>0&&saved.equipped;item.evolved=saved.evolved;
        for(const modifier of Object.keys(item.modifiers))if(saved.modifiers?.[modifier]!==undefined)item.modifiers[modifier]=readNumber(saved.modifiers[modifier],modifier,0,getUpgradeDefinition(modifier).cap);
      }
    };
    restore(build.weapons,snapshot.weapons,WEAPON_DEFS);restore(build.skills,snapshot.skills,SKILL_DEFS);
    for(const def of ALL_UPGRADES)if(def.category==='attribute'&&build.getRank(def.id)&&!meetsUpgradeRequirements(build,def))throw new RangeError(`Unavailable combat build attribute: ${def.id}`);
    for(const item of [...Object.values(build.weapons),...Object.values(build.skills)]) {
      if(item.branch) {
        const ready=item.id==='domain'?item.baseRank>=1:item.id==='arrow'?build.getRank('arrowRune')>0||1+build.getRank('rapid')+build.getRank('multishot')>=4:item.baseRank>=5;
        if(!item.baseRank||!ready)throw new RangeError(`Untrained combat build branch: ${item.id}`);
      }
      if(item.evolved&&!build._canEvolve(item.id))throw new RangeError(`Invalid combat build evolution: ${item.id}`);
      if(EVOLUTIONS[item.id])item.evolved=build._canEvolve(item.id);
      for(const [id,rank] of Object.entries(item.modifiers))if(rank&&!meetsUpgradeRequirements(build,getUpgradeDefinition(id)))throw new RangeError(`Unavailable combat build modifier: ${id}`);
    }
    return build;
  }
}
