import { RELICS } from '../relics.js';
import { SETTLEMENT_RULES, settlementType } from '../site-definitions.js';
const WARD=SETTLEMENT_RULES.ward;

export function settlementInteraction(site){
      let label='',description='',enabled=true;
      if(site.type==='merchant'){label='与商人交易';description='购买一件补给或遗物后，游商将离开';}
      else if(site.type==='supply'||site.type==='occupied'||site.type==='castle') {
        const visited=site.explored||site.state==='spent';
        if(site.type==='castle'){label=site.featureId?`${visited?'重返':'进入'}${site.name}`:visited?'重返已探索古堡':'进入古堡迷宫';description=visited?'宝藏已领取，不会重复刷新':'有限迷宫 · 击败最终首领获取超级技能';}
        else if(site.type==='supply'){label=`${visited?'重返':'进入'}${site.name}`;description=visited?'补给已领取，可随时进出':'进入屋内搜寻补给箱';}
        else {label=site.featureId?`${visited?'重返':'进入'}${site.name}`:visited?'重返清理过的小屋':'进入被占据的小屋';description=visited?'宝藏已领取，可随时进出':site.state==='cleared'?'守卫已清除，屋内宝箱等待领取':'清理屋内守卫，搜寻宝箱';}
      }
  return {label,description,enabled};
}

export function getShopItems(settlements) {
    const g=settlements.game,site=settlements.activeShop;if(!site||g.status!=='shop')return [];
    const relic=RELICS.find(r=>r.id===site.relicId),ward=g.relics?.wardAmount??g.relics?.wardValue??0;
    const items=[
      {id:'heal',name:'旅人药剂',desc:'立即恢复 35 点生命',icon:'✚',color:'#b9dda5',price:12,usable:g.player.hp<g.player.maxHp,reason:'生命已满'},
      {id:'magnet',name:'磁引符',desc:'拾取范围扩大，持续 8 秒',icon:'◉',color:'#a8dcec',price:8,usable:!!g.adventure&&g.adventure.magnetTime<8,reason:'效果已生效'},
      {id:'fury',name:'狂暴药剂',desc:'伤害与射速提升，持续 8 秒',icon:'✦',color:'#efb46b',price:8,usable:!!g.adventure&&g.adventure.furyTime<8,reason:'效果已生效'},
      {id:'shield',name:'守护符',desc:'抵消下一次受击的至多 18 点伤害',icon:'⬡',color:'#d2dbae',price:16,usable:!!g.relics&&ward<WARD,reason:'护盾已充盈'}
    ];
    if(relic)items.push({id:'relic',name:relic.name,desc:relic.desc,icon:relic.icon,color:relic.color,price:60,usable:!!g.relics&&!g.relics.has(relic.id),reason:'已拥有该遗物',relicId:relic.id,rarity:'遗物'});
    return items.map(item=>{const stock=site.stock[item.id]||0,reason=!stock?'已售罄':!item.usable?item.reason:g.gold<item.price?'金币不足':'';return {...item,stock,available:!reason,reason};});
  }

export function buyShopItem(settlements,id) {
    const g=settlements.game,site=settlements.activeShop,item=getShopItems(settlements).find(i=>i.id===id);
    if(!site||!item?.available||!Number.isFinite(g.gold)||g.gold<item.price)return false;
    if(id==='heal'){
      const healed=Math.min(35,g.player.maxHp-g.player.hp);if(!(healed>0))return false;
      g.player.hp+=healed;g._effect(g.player.x,g.player.y-28,'heal',.8,0,'#b9dda5',`+${Math.ceil(healed)}`);
    } else if(id==='magnet'){g.adventure.magnetTime=8;for(const gem of g.gems)if(Math.hypot(gem.x-g.player.x,gem.y-g.player.y)<480)gem.attracted=true;}
    else if(id==='fury')g.adventure.furyTime=8;
    else if(id==='shield'){if(!g.relics.grantWard(WARD))return false;}
    else if(id==='relic'){if(!g.relics.acquire(item.relicId))return false;}
    else return false;
    // Stock and payment commit together, after all rejection checks.
    site.stock[id]--;g.gold-=item.price;site.state='spent';
    g._emit('shopBought',{itemId:id,name:item.name,price:item.price});
    settlements.closeShop();g._emit('merchantDeparted',{itemId:id,name:item.name});return true;
  }

const SETTLEMENT_ACTIONS=Object.freeze({
  interior:(settlements,site)=>!!settlements.game.dungeon?.enter(site),
  shop:(settlements,site)=>{const g=settlements.game;settlements.activeShop=site;g.status='shop';g._emit('shopOpen',{name:site.name});return true;}
});
export function activateSettlement(settlements,site){return SETTLEMENT_ACTIONS[settlementType(site)?.interaction]?.(settlements,site)||false;}
