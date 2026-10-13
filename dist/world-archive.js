import { REGIONS } from './regions.js';
import { ARMY_SITE_RULES } from './relic-sites.js';
import { ANGEL_RULES } from './settlements.js';
import { REGIONAL_MECHANISM_RULES } from './regional-mechanisms.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const descriptions={
  forest:{theme:'密林 · 池塘 · 沙滩',risk:'藤蔓会绊住地面单位，爆裂蘑菇有延迟爆炸。',tip:'留意藤蔓预警，借空地周旋，也能攻击切断藤蔓。'},
  marsh:{theme:'湿地 · 水塘 · 毒雾',risk:'涉水会下沉、减速；毒雾会伤害范围内的单位。',tip:'优先沿干燥地面移动。飞行能避开涉水减速，仍需躲避毒雾。'},
  ruins:{theme:'石地 · 古迹 · 符文',risk:'甲虫与巨怪的出现比例更高，石块和墙体会影响走位。',tip:'寻找遗迹符文阵获得短暂火力支援，利用开阔地迎战。'}
};

export const WORLD_ARCHIVE_WORLDS=Object.freeze(REGIONS.map(region=>Object.freeze({
  id:region.id,name:region.name,color:region.colors.accent,...descriptions[region.id]
})));

// This is a type reference, independent of each run's discovery map and saves.
export const WORLD_ARCHIVE_LOCATIONS=Object.freeze([
  {id:'castle',group:'relics',name:'古堡 · 旧王城迷宫',tag:'副本',summary:'探索房间，挑战最终首领',trigger:'从古堡正门进入独立迷宫。',feature:'沿通路探索，墙体遮挡未探索房间；支路有宝箱。击败最终首领后，开启王城宝藏选择超级技能。'},
  {id:'hunt',group:'relics',name:'林间狩猎',tag:'擂台',summary:'中央激活，迎战周围来敌',trigger:'走到擂台中央纹章。',feature:'守卫从周围陆续出现。完成挑战获得灵晶与金币，擂台会保留。'},
  {id:'rescue',group:'relics',name:'唤雷者 / 守林人囚牢',tag:'解救',summary:'击败守卫，招募战斗伙伴',trigger:'触碰正门开启挑战，清除守卫后从门口入内。',feature:'靠近被困伙伴完成招募，并获得一次角色能力提升。唤雷者主攻，守林人保护队伍。'},
  {id:'owlroost',group:'relics',name:'林间鸟笼',tag:'解救',summary:'解救猫头鹰，获得危险侦察',trigger:'到鸟笼入口驱散守卫，再靠近伙伴。',feature:'猫头鹰随队飞行并提示附近威胁；不会透视封闭房间。'},
  {id:'golemaltar',group:'relics',name:'沉睡石像',tag:'唤醒',summary:'完成试炼，唤醒岩灵',trigger:'触碰古坛，击败试炼守卫后靠近石像。',feature:'岩灵加入队伍，以重击参与战斗，并能击碎封石宝库的入口封石。'},
  {id:'rune',group:'relics',name:'遗迹符文阵',tag:'支援',summary:'失落遗迹中的一次性火力支援',trigger:'在失落遗迹触碰符文阵入口。',feature:`激活后自动攻击附近怪物，持续 ${REGIONAL_MECHANISM_RULES.runeDuration} 秒。能量耗尽后石台保留。`},
  {id:'stonevault',group:'relics',name:'封石宝库',tag:'破障',summary:'带岩灵回来，开启被封住的通路',trigger:'与能行动的岩灵一起靠近宝库正门。',feature:`岩灵击碎封石后，进入宝库获得 ${ARMY_SITE_RULES.vaultGold} 金币与 ${ARMY_SITE_RULES.vaultCrystals} 灵晶。本局通路保持开启，奖励只领取一次。`},
  {id:'occupied',group:'relics',name:'被占据的小屋',tag:'战斗',summary:'清理屋内守卫，领取补给',trigger:'从正门进入小屋内部。',feature:'击败屋内守卫后开启宝箱，获得金币、灵晶及补给。离开再进入不会重置奖励。'},
  {id:'supply',group:'waypoints',name:'林间小屋 / 高脚屋 / 石屋',tag:'补给',summary:'小房间里的补给箱',trigger:'从小屋正门进入。',feature:'三种世界有不同外形的小屋。屋内有金币、灵晶与恢复药，取走后不再刷新。'},
  {id:'merchant',group:'waypoints',name:'荒野游商',tag:'交易',summary:'使用金币购买一件补给或遗物',trigger:'靠近商人，打开交易面板。',feature:'购买成功后商人离开；未购买便退出，可以稍后再来。'},
  {id:'angel',group:'waypoints',name:'守望天使',tag:'守护',summary:'固定驻守，治疗友方并攻击怪物',trigger:'进入天使的守护光环，无需交互。',feature:`天使出现在出生地与已激活传送门附近。守护半径 ${ANGEL_RULES.guardRadius}，范围内持续恢复友方生命，并以高频雷击攻击附近怪物。`},
  {id:'dogcamp',group:'waypoints',name:'旅犬营地',tag:'招募',summary:'提供路粮，请寻宝小狗同行',trigger:`携带 ${ARMY_SITE_RULES.dogCost} 金币靠近营地入口。`,feature:'招募后小狗会寻找附近宝箱与遗迹，提供方向提示；同行期间仍需支付少量维持费。'}
].map(item=>Object.freeze(item)));

function locationHTML(item){
  return `<details class="world-archive-location" data-world-location="${escape(item.id)}"><summary><span class="world-archive-location-title"><strong>${escape(item.name)}</strong><small>${escape(item.summary)}</small></span><span class="world-archive-tag">${escape(item.tag)}</span><span class="world-archive-chevron" aria-hidden="true">›</span></summary><div class="world-archive-location-body"><p><span>触发</span>${escape(item.trigger)}</p><p><span>特色</span>${escape(item.feature)}</p></div></details>`;
}

export function worldArchiveHTML(){
  return `<section class="world-archive" aria-label="世界与地点指南"><div class="world-archive-heading"><h3>三座岛屿，三种荒野</h3><span>世界指南</span></div><p class="world-archive-intro">了解世界与地点的特色，具体位置留待每局冒险中探索。</p><div class="world-archive-worlds">${WORLD_ARCHIVE_WORLDS.map((world,index)=>`<article class="world-archive-world" data-world-id="${escape(world.id)}" style="--world-accent:${escape(world.color)}"><div class="world-archive-world-heading"><span aria-hidden="true">0${index+1}</span><h4>${escape(world.name)}</h4></div><p class="world-archive-theme">${escape(world.theme)}</p><p>${escape(world.risk)}</p><p class="world-archive-tip">${escape(world.tip)}</p></article>`).join('')}</div><div class="world-archive-travel"><strong>传送门 · 世界之间的通路</strong><p>击败驻门首领后，立即获得超级技能奖励并激活双向通道。从正面入口穿越，可在本局反复往返，已完成地点与已领取宝藏保持原状。</p></div>${[['relics','遗迹与挑战'],['waypoints','补给与伙伴']].map(([id,name])=>`<section class="world-archive-section" aria-label="${name}"><h3>${name}<small>${WORLD_ARCHIVE_LOCATIONS.filter(item=>item.group===id).length} 类地点</small></h3><div class="world-archive-locations">${WORLD_ARCHIVE_LOCATIONS.filter(item=>item.group===id).map(locationHTML).join('')}</div></section>`).join('')}<p class="archive-small-note">触碰入口可自动进入或激活；条件未满足时会先提示。遗迹建筑会保留，完成奖励不会因往返刷新。</p></section>`;
}
