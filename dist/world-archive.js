import { REGIONS } from './regions.js';
import { ARMY_SITE_RULES } from './relic-sites.js';
import { ANGEL_RULES } from './settlements.js';
import { REGIONAL_MECHANISM_RULES } from './regional-mechanisms.js';
import { WORLD_SITE_FEATURES } from './world-sites.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const descriptions={
  forest:{theme:'密林 · 池塘 · 沙滩',risk:'藤蔓会绊住地面单位，爆裂蘑菇有延迟爆炸。',tip:'留意藤蔓预警，借空地周旋，也能攻击切断藤蔓。'},
  marsh:{theme:'湿地 · 水塘 · 毒雾',risk:'涉水会下沉、减速；毒雾会伤害范围内的单位。',tip:'优先沿干燥地面移动。飞行能避开涉水减速，仍需躲避毒雾。'},
  ruins:{theme:'石地 · 古迹 · 符文',risk:'甲虫与巨怪的出现比例更高，石块和墙体会影响走位。',tip:'寻找遗迹符文阵获得短暂火力支援，利用开阔地迎战。'},
  beach:{theme:'金沙 · 碧海 · 搁浅船只',risk:'局部潮池会涨落，高潮更深、涉水减速更明显；水位上涨前会提示。',tip:'沿干燥沙洲周旋，探索沉船货舱搜寻金币珍藏。'},
  city:{theme:'石板街道 · 砖红屋顶 · 钟楼',risk:'建筑围出街巷与广场，高墙阻挡通行和弹道。',tip:'利用街巷控制来敌方向，再到开阔广场迎战；暮钟塔里有护盾守卫。'},
  mountain:{theme:'青灰山壁 · 峡谷 · 矿洞',risk:'山壁限制通路，局部落石有提前预警，飞行单位也需避让。',tip:'沿山道寻找盆地和通路，矿洞里的岩石可提供低矮掩护，深处藏有灵晶。'},
  snow:{theme:'蓝白积雪 · 墨绿松林 · 冰湖',risk:'局部深雪降低地面单位速度；冰湖保持正常方向操控。',tip:'激活冰封祭坛，可获得短暂自动攻击与减速支援。'},
  volcano:{theme:'黑岩 · 熔岩河 · 熔炉神殿',risk:'熔岩伤害地面单位；喷气口有预警喷发，飞行也不能避开喷发。',tip:'选择安全岩地交战，穿过危险间隙探索神殿，挑战更强守卫与首领。'}
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
  {id:'supply',group:'waypoints',name:'旅途小屋',tag:'补给',summary:'小房间里的补给箱',trigger:'从小屋正门进入。',feature:'森林小屋、海岸渔舍、雪原木屋等补给点分布在各个世界。屋内有金币、灵晶与恢复药，取走后不再刷新。'},
  {id:'merchant',group:'waypoints',name:'荒野游商',tag:'交易',summary:'使用金币购买一件补给或遗物',trigger:'靠近商人，打开交易面板。',feature:'购买成功后商人离开；未购买便退出，可以稍后再来。'},
  {id:'angel',group:'waypoints',name:'守望天使',tag:'守护',summary:'固定驻守，治疗友方并攻击怪物',trigger:'进入天使的守护光环，无需交互。',feature:`天使出现在出生地与已激活传送门附近。守护半径 ${ANGEL_RULES.guardRadius}，范围内持续恢复友方生命，并以高频雷击攻击附近怪物。`},
  {id:'dogcamp',group:'waypoints',name:'旅犬营地',tag:'招募',summary:'提供路粮，请寻宝小狗同行',trigger:`携带 ${ARMY_SITE_RULES.dogCost} 金币靠近营地入口。`,feature:'招募后小狗会寻找附近宝箱与遗迹，提供方向提示；同行期间仍需支付少量维持费。'},
  {id:'shipwreck',group:'relics',name:'沉船宝库',tag:'海岸',summary:'深入货舱，搜寻金币珍藏',trigger:'从搁浅船只的正面舱口进入。',feature:`狭长货舱里驻守 ${WORLD_SITE_FEATURES.shipwreck.guardTypes.length} 名守卫。清理后获得 ${WORLD_SITE_FEATURES.shipwreck.reward.gold} 金币与 ${WORLD_SITE_FEATURES.shipwreck.reward.crystals} 灵晶。`},
  {id:'belltower',group:'relics',name:'暮钟塔',tag:'古城',summary:'紧凑迷宫，护盾守卫驻守',trigger:'从钟楼正门进入。',feature:`探索钟楼房间，击败护盾守卫与最终首领。宝藏提供超级技能、${WORLD_SITE_FEATURES.belltower.reward.gold} 金币与 ${WORLD_SITE_FEATURES.belltower.reward.crystals} 灵晶。`},
  {id:'mine',group:'relics',name:'废弃矿洞',tag:'山地',summary:'绕过矿石，清除重装守卫',trigger:'从矿洞正面入口进入。',feature:`矿石分隔交战位置，${WORLD_SITE_FEATURES.mine.guardTypes.length} 名守卫看守矿藏。清理后获得 ${WORLD_SITE_FEATURES.mine.reward.gold} 金币与 ${WORLD_SITE_FEATURES.mine.reward.crystals} 灵晶。`},
  {id:'icealtar',group:'relics',name:'冰封祭坛',tag:'雪原',summary:'激活寒霜火力，减速来敌',trigger:'触碰冰封祭坛入口。',feature:`获得 ${REGIONAL_MECHANISM_RULES.runeDuration} 秒寒霜支援，自动攻击可见来敌并短暂减速；首领受到的减速较弱，墙后怪物不会被穿墙攻击。`},
  {id:'furnace',group:'relics',name:'熔炉神殿',tag:'熔火',summary:'挑战强化首领，获取高额宝藏',trigger:'从神殿正门进入。',feature:`守卫与最终首领更坚韧。完成后获得超级技能、${WORLD_SITE_FEATURES.furnace.reward.gold} 金币与 ${WORLD_SITE_FEATURES.furnace.reward.crystals} 灵晶，领奖与探索状态永久保留至本局结束。`}
].map(item=>Object.freeze(item)));

export const WORLD_ARCHIVE_CATEGORIES=Object.freeze([
  Object.freeze({id:'worlds',name:'世界',count:WORLD_ARCHIVE_WORLDS.length}),
  Object.freeze({id:'relics',name:'遗迹与挑战',count:WORLD_ARCHIVE_LOCATIONS.filter(item=>item.group==='relics').length}),
  Object.freeze({id:'waypoints',name:'旅途据点',count:WORLD_ARCHIVE_LOCATIONS.filter(item=>item.group==='waypoints').length})
]);

export function worldArchiveSelection(options={}){
  const category=WORLD_ARCHIVE_CATEGORIES.some(item=>item.id===options.category)?options.category:'worlds';
  const entries=category==='worlds'?WORLD_ARCHIVE_WORLDS:WORLD_ARCHIVE_LOCATIONS.filter(item=>item.group===category);
  return {category,entries,selected:entries.find(item=>item.id===options.selectedId)||entries[0]};
}
function portrait(item,world,large=false){
  const key=`${world?'world':'location'}:${item.id}`;
  return `<span class="world-archive-art${large?' world-archive-art-large':''}"><canvas width="480" height="300" data-world-archive-art="${escape(key)}" aria-hidden="true"></canvas></span>`;
}
function detailHTML(item,world){
  return `<section class="archive-detail world-archive-detail" data-world-archive-detail tabindex="-1">${portrait(item,world,true)}<span class="archive-kicker">${escape(world?'世界 · '+item.theme:item.tag)}</span><h3>${escape(item.name)}</h3>${world?`<div class="archive-detail-section"><h4>环境与挑战</h4><p>${escape(item.risk)}</p></div><div class="archive-detail-section"><h4>探索提示</h4><p>${escape(item.tip)}</p></div>`:`<p class="archive-description">${escape(item.summary)}</p><div class="archive-detail-section"><h4>如何进入</h4><p>${escape(item.trigger)}</p></div><div class="archive-detail-section"><h4>地点特色</h4><p>${escape(item.feature)}</p></div>`}<p class="archive-small-note">${world?'关卡模式：同主题岛屿之间可以往返，挑战核心首领后进入通关门。自由探索：击败驻门首领，获得超级技能并开启跨世界通道。':'触碰入口可自动进入或激活；条件未满足时会先提示。遗迹建筑会保留，奖励不会因往返刷新。'}</p></section>`;
}
export function worldArchiveHTML(options={}){
  const {category,entries,selected}=worldArchiveSelection(options),world=category==='worlds';
  return `<section class="world-archive" aria-label="世界与地点图鉴"><div class="archive-categories world-archive-categories" aria-label="世界图鉴分类">${WORLD_ARCHIVE_CATEGORIES.map(item=>`<button type="button" data-archive-world-category="${item.id}" aria-pressed="${item.id===category}">${item.name}<small>${item.count}</small></button>`).join('')}</div><p class="world-archive-intro">了解世界与地点的特色，具体位置留待每局冒险中探索。</p><div class="archive-codex-layout world-archive-layout"><div class="archive-index"><div class="archive-grid world-archive-grid" aria-label="${WORLD_ARCHIVE_CATEGORIES.find(item=>item.id===category).name}条目">${entries.map(item=>`<button type="button" class="archive-card world-archive-card${item===selected?' is-selected':''}" data-archive-world-entry="${escape(item.id)}" aria-pressed="${item===selected}" aria-label="${escape(item.name)}">${portrait(item,world)}<strong>${escape(item.name)}</strong><small>${escape(world?'世界':item.tag)}</small></button>`).join('')}</div></div>${detailHTML(selected,world)}</div></section>`;
}
