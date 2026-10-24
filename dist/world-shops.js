import { getConfigSection } from './content-config.js';
import { WEAPON_DEFS, SKILL_DEFS, getUpgradeDefinition, canTakeUpgrade } from './combat-catalog.js';
import { SETTLEMENT_RULES } from './site-definitions.js';
import { groundOffset } from './terrain.js';
import { resetLocomotion } from './locomotion.js';
import { isWorldShop } from './shop-interior.js';

const economy=getConfigSection('economy'),rules=economy.worldShops;
const ITEM_IDS=Object.freeze(['heal','magnet','fury','shield']);
export const WORLD_FACILITY_NAMES=Object.freeze({weapons:'武器铺',skills:'术法馆',supplies:'补给铺',rest:'休憩处'});
const point=entity=>({x:entity.x,y:entity.y+groundOffset(entity,!!entity.heroId||!!entity.isCompanion)});
const emptyInventory=()=>Object.fromEntries(ITEM_IDS.map(id=>[id,0]));
const itemDefinition=id=>economy.shop.items.find(item=>item.id===id);
const itemCopy=def=>({...def,desc:def.description.replace(/\{([A-Za-z]+)\}/g,(_,key)=>String(key==='ward'?SETTLEMENT_RULES.ward:def[key]))});

export function worldFacilitySites(game){
  if(game.mode!=='world')return [];
  const region=getConfigSection('worlds').travel.regions.find(entry=>entry.worldId===game.worldId);
  if(!region)return [];
  const core=region.core;
  return core.facilities.map(def=>({id:`facility:${core.id}:${def.id}`,type:'supply',worldFacility:def.kind,
    coreId:core.id,name:WORLD_FACILITY_NAMES[def.kind],artTheme:core.artTheme,region:region.worldId,
    x:def.x,y:def.y,sortY:def.y,width:def.width,depth:def.depth,door:{x:def.x,y:def.y+30},
    interactRadius:SETTLEMENT_RULES.interactRadius,state:'ready',guardIds:[],remainingGuards:0}));
}

// Permanent abilities remain canonical in CombatBuild. Only counted supplies
// are stored here, so moving between shops cannot buy a second base rank.
export class WorldShops {
  constructor(game){this.game=game;this.inventory=emptyInventory();}
  serialize(){return {inventory:{...this.inventory}};}
  restore(snapshot){
    const inventory=snapshot?.inventory;
    if(!inventory||typeof inventory!=='object'||Array.isArray(inventory)||Object.keys(inventory).length!==ITEM_IDS.length||
      ITEM_IDS.some(id=>!Object.hasOwn(inventory,id)||!Number.isInteger(inventory[id])||inventory[id]<0||inventory[id]>rules.inventoryLimit))return false;
    this.inventory={...inventory};return true;
  }
  _siteValid(site){
    const g=this.game,state=g.dungeon?.active;
    if(g.mode!=='world'||!site?.worldFacility||!g.settlements?.sites.includes(site)||site.region!==g.worldId)return false;
    return site.worldFacility==='rest'?!state:isWorldShop(site)&&state?.kind==='shop'&&state.site===site;
  }
  canEnter(site){
    const g=this.game;
    return g.mode==='world'&&!g.dungeon?.active&&isWorldShop(site)&&g.settlements?.sites.includes(site)&&site.region===g.worldId;
  }
  _withinReach(site){
    const g=this.game,p=point(g.player),merchant=site.worldFacility!=='rest'?g.dungeon?.active?.merchant:null;
    const target=merchant?.interaction||site.door,radius=merchant?.interactRadius||site.interactRadius;
    return Math.hypot(p.x-target.x,p.y-target.y)<=radius&&
      !g.terrain?.firstBlocker(p.x,p.y,target.x,target.y,0);
  }
  canTrade(site){return isWorldShop(site)&&this._siteValid(site)&&this._withinReach(site);}
  open(site){
    const g=this.game;
    if(g.status!=='playing'||!this.canTrade(site))return false;
    g.settlements.activeShop=site;g.status='shop';g._emit('shopOpen',{name:site.name});return true;
  }
  getItems(site){
    const g=this.game;if(!this._siteValid(site)||site.worldFacility==='rest')return [];
    if(site.worldFacility==='supplies')return ITEM_IDS.map(id=>{
      const def=itemCopy(itemDefinition(id)),count=this.inventory[id],reason=count>=rules.inventoryLimit?'携带数量已满':g.gold<def.price?'金币不足':'';
      return {...def,desc:`${def.desc} · 购买后放入补给`,count,stock:1,consumable:true,available:!reason,reason};
    });
    const ids=site.worldFacility==='weapons'?Object.keys(rules.weaponPrices):rules.skillSupply[site.region];
    return ids.map(id=>{
      const def=WEAPON_DEFS[id]||SKILL_DEFS[id],upgrade=getUpgradeDefinition(id),owner=g.build.getWeapon(id)||g.build.getSkill(id);
      const owned=!!owner?.acquired,price=rules.weaponPrices[id]??rules.skillPrices[id];
      const reason=owned?'已掌握':!owner||!canTakeUpgrade(g.build,id)?'当前角色不可学习':g.gold<price?'金币不足':'';
      return {id,name:def.name,icon:def.icon,color:def.color,desc:upgrade.desc,price,stock:1,owned,
        level:owner?.level||0,nextLevel:1,category:def.category,available:!reason,reason};
    });
  }
  buy(site,id){
    const g=this.game;
    if(g.status!=='shop'||g.settlements?.activeShop!==site||!this._siteValid(site)||!this._withinReach(site))return false;
    const item=this.getItems(site).find(entry=>entry.id===id);
    if(!item?.available||!Number.isFinite(g.gold)||g.gold<item.price)return false;
    if(item.consumable)this.inventory[id]++;
    else {
      const owner=g.build.getWeapon(id)||g.build.getSkill(id);
      if(owner?.acquired||!g.build.increment(id))return false;
      if(id==='pulse')g._pulse=.15;
      if(id==='lightning')g._lightning=.15;
      g._choices=null;g._syncEvolutions(false);g._refreshStats();g._refreshWeapons();
    }
    g.gold-=item.price;
    if(!item.consumable)g._emit('weaponAcquired',{weaponId:id,name:item.name,category:item.category,source:'shop'});
    g._emit('shopBought',{itemId:id,name:item.name,price:item.price,facilityId:site.id,stored:!!item.consumable});
    g._scheduleWorldSave?.('purchase');
    return true;
  }
  _useReason(id){
    const g=this.game,def=itemDefinition(id);if(!def)return '未知补给';
    if(g.mode!=='world'||g.status!=='playing'||g.sceneTransition?.active||g.player.hp<=0)return '现在无法使用';
    if(!this.inventory[id])return '补给不足';
    if(id==='heal')return g.player.hp>=g.player.maxHp?'生命已满':'';
    if(id==='magnet'||id==='fury')return !g.adventure?'当前无法使用':g.adventure[`${id}Time`]>0?'效果已生效':'';
    return !g.relics?'当前无法使用':g.relics.wardAmount>=SETTLEMENT_RULES.ward?'护盾已充盈':'';
  }
  getInventoryItems(){
    if(this.game.mode!=='world')return [];
    return ITEM_IDS.map(id=>{const reason=this._useReason(id);return {...itemCopy(itemDefinition(id)),count:this.inventory[id],available:!reason,reason};});
  }
  useConsumable(id){
    if(this._useReason(id))return false;
    const g=this.game,def=itemDefinition(id),p=g.player;
    if(id==='heal'){
      const healed=Math.min(def.healing,p.maxHp-p.hp);p.hp+=healed;
      g._effect(p.x,p.y-28,'heal',.8,0,'#b9dda5',`+${Math.ceil(healed)}`);
    }else if(id==='magnet'){
      g.adventure.magnetTime=def.duration;
      for(const gem of g.gems)if(Math.hypot(gem.x-p.x,gem.y-p.y)<economy.pickups.magnetAttractRange)gem.attracted=true;
    }else if(id==='fury')g.adventure.furyTime=def.duration;
    else if(!g.relics.grantWard(SETTLEMENT_RULES.ward))return false;
    this.inventory[id]--;g._emit('consumableUsed',{itemId:id,name:def.name,count:this.inventory[id]});g._scheduleWorldSave?.('consumable');return true;
  }
  rest(site){
    const g=this.game;
    if(g.status!=='playing'||site?.worldFacility!=='rest'||!this._siteValid(site)||!this._withinReach(site))return false;
    const anchor={...site,...site.door};
    if(g.worldTravel?.setRestAnchor(anchor)===false)return false;
    g.player.hp=g.player.maxHp;g.player.invuln=Math.max(g.player.invuln,2);
    const p=point(g.player),placed=[];
    for(const member of g.companions?.members||[]){
      if(member.state==='left')continue;
      const recovering=member.state==='recovering'||member.hp<=0;
      member.hp=member.maxHp;member.state='active';member.recovery=0;member._recoveryBlocked=false;member.invuln=Math.max(member.invuln||0,2);
      if(recovering){
        for(let i=0;i<48;i++){
          const radius=40+Math.floor(i/16)*28,angle=i*Math.PI/8,x=p.x+Math.cos(angle)*radius,y=p.y+Math.sin(angle)*radius;
          if(!g.terrain.isFree(x,y,member.r+3)||g.terrain.firstBlocker(p.x,p.y,x,y,member.r+3)||placed.some(other=>Math.hypot(other.x-x,other.y-y)<member.r+other.r+6))continue;
          member.x=x;member.y=y-groundOffset(member,true);resetLocomotion(member);placed.push({x,y,r:member.r});break;
        }
      }
    }
    g._friendlySnapshot=null;
    g._effect(g.player.x,g.player.y-28,'heal',.8,0,'#b9dda5','恢复完毕');
    g._emit('worldRest',{facilityId:site.id,worldId:g.worldId});g._scheduleWorldSave?.('rest');return true;
  }
}
