import { getConfigSection } from './content-config.js';
import { REGIONS } from './regions.js';
import { ARMY_SITE_RULES } from './relic-sites.js';
import { ANGEL_RULES } from './settlements.js';
import { REGIONAL_MECHANISM_RULES } from './regional-mechanisms.js';
import { WORLD_SITE_FEATURES } from './world-sites.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const codex=getConfigSection('codex'),descriptions=codex.worldDescriptions;
// Placeholder lookup only reads known configuration values; it never evaluates code.
const references={REGIONAL_MECHANISM_RULES,ARMY_SITE_RULES,ANGEL_RULES,WORLD_SITE_FEATURES};
const resolveText=value=>String(value).replace(/\{([A-Z_]+(?:\.[A-Za-z0-9_]+)+)\}/g,(match,path)=>{const value=path.split('.').reduce((node,key)=>node?.[key],references);return typeof value==='string'||typeof value==='number'?String(value):match;});

export const WORLD_ARCHIVE_WORLDS=Object.freeze(REGIONS.map(region=>Object.freeze({
  id:region.id,name:region.name,color:region.colors.accent,...descriptions[region.id]
})));

// This is a type reference, independent of each run's discovery map and saves.
export const WORLD_ARCHIVE_LOCATIONS=Object.freeze(codex.locations.map(item=>Object.freeze({...item,trigger:resolveText(item.trigger),feature:resolveText(item.feature)})));

export const WORLD_ARCHIVE_CATEGORIES=Object.freeze(codex.worldCategories.map(item=>Object.freeze({...item,...(item.id==='worlds'?{name:'地图'}:{}),count:item.id==='worlds'?WORLD_ARCHIVE_WORLDS.length:WORLD_ARCHIVE_LOCATIONS.filter(location=>location.group===item.id).length})));

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
  const region=world&&REGIONS.find(region=>region.id===item.id);
  const note=!world?'触碰入口可自动进入或激活；条件未满足时会先提示。遗迹建筑会保留，奖励不会因往返刷新。':region.authored?.kind==='rift-forest'?'世界探索：各区域由郊外道路相连。在城镇交易、补给与休憩，激活传送点后可快速往返。角色成长与探索进度自动保存在当前浏览器。':'极限挑战：独立关卡，按本关规则完成突破或抵御怪潮。';
  return `<section class="archive-detail world-archive-detail" data-world-archive-detail tabindex="-1">${portrait(item,world,true)}<span class="archive-kicker">${escape(world?(region.authored?.kind==='rift-forest'?'区域 · ':'极限挑战 · ')+item.theme:item.tag)}</span><h3>${escape(item.name)}</h3>${world?`<div class="archive-detail-section"><h4>环境与挑战</h4><p>${escape(item.risk)}</p></div><div class="archive-detail-section"><h4>探索提示</h4><p>${escape(item.tip)}</p></div>`:`<p class="archive-description">${escape(item.summary)}</p><div class="archive-detail-section"><h4>如何进入</h4><p>${escape(item.trigger)}</p></div><div class="archive-detail-section"><h4>地点特色</h4><p>${escape(item.feature)}</p></div>`}<p class="archive-small-note">${note}</p></section>`;
}
export function worldArchiveHTML(options={}){
  const {category,entries,selected}=worldArchiveSelection(options),world=category==='worlds';
  return `<section class="world-archive" aria-label="世界与地点图鉴"><div class="archive-categories world-archive-categories" aria-label="世界图鉴分类">${WORLD_ARCHIVE_CATEGORIES.map(item=>`<button type="button" data-archive-world-category="${escape(item.id)}" aria-pressed="${item.id===category}">${escape(item.name)}<small>${item.count}</small></button>`).join('')}</div><p class="world-archive-intro">了解区域与地点的特色，具体位置随探索记录。</p><div class="archive-codex-layout world-archive-layout"><div class="archive-index"><div class="archive-grid world-archive-grid" aria-label="${escape(WORLD_ARCHIVE_CATEGORIES.find(item=>item.id===category).name)}条目">${entries.map(item=>`<button type="button" class="archive-card world-archive-card${item===selected?' is-selected':''}" data-archive-world-entry="${escape(item.id)}" aria-pressed="${item===selected}" aria-label="${escape(item.name)}">${portrait(item,world)}<strong>${escape(item.name)}</strong><small>${escape(world?(item.id==='forest'?'极限挑战':'区域'):item.tag)}</small></button>`).join('')}</div></div>${detailHTML(selected,world)}</div></section>`;
}
