import { featureForSite } from './world-sites.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const SETTLEMENT_RULES=freeze({maxSites:7,interactRadius:82,ward:18,guards:4});
export const ANGEL_RULES=freeze({guardRadius:150,auraRadius:150,attackRange:150,healingPerSecond:.03,strikeRadius:60,attackInterval:.1,damage:115});
export const SETTLEMENT_DEFINITIONS=freeze([
  {type:'merchant',name:'荒野游商',width:42,depth:24,radius:410,angle:.12},
  {type:'supply',name:'林间小屋',width:64,depth:28,radius:610,angle:2.2},
  {type:'occupied',name:'被占据的小屋',width:68,depth:30,radius:970,angle:3.1},
  {type:'castle',name:'古堡入口',width:240,depth:90,radius:1180,angle:5.65}
]);
export const SETTLEMENT_TYPES=freeze({merchant:{foundation:false,bodyOffset:false,doorOffset:0,interaction:'shop'},angel:{foundation:false,bodyOffset:true,doorOffset:0,interaction:null},supply:{foundation:true,bodyOffset:true,doorOffset:30,interaction:'interior',interior:'hut'},occupied:{foundation:true,bodyOffset:true,doorOffset:30,interaction:'interior',interior:'hut'},castle:{foundation:true,bodyOffset:true,doorOffset:30,interaction:'interior',interior:'castle'}});
export const settlementType=site=>SETTLEMENT_TYPES[typeof site==='string'?site:site?.type]||null;

export const RELIC_SITE_RULES=freeze({huntGuards:24,rescueGuards:9,interactRadius:82,huntTouchRadius:26});
export const ARMY_SITE_RULES=freeze({dogCost:8,vaultGold:45,vaultCrystals:90,smashDuration:.9,smashReach:110,altarTouchRadius:30});
export const RESCUE_BUILDING=freeze({halfWidth:63,back:-46,front:61,doorHalfWidth:34,wallRadius:8});
export const RELIC_SITE_DEFINITIONS=freeze([
  {key:'hunt',type:'hunt',name:'林间狩猎'},
  {key:'rescue',type:'rescue',kind:'stormcaller',name:'唤雷者囚牢',guardCount:9},
  {key:'rescue-warden',type:'rescue',kind:'warden',name:'守林人囚牢',guardCount:9},
  {key:'dogcamp',type:'dogcamp',kind:'dog',name:'旅犬营地'},
  {key:'owlroost',type:'rescue',kind:'owl',appearance:'owlroost',name:'林间鸟笼',guardCount:3},
  {key:'golemaltar',type:'rescue',kind:'golem',appearance:'golemaltar',name:'沉睡石像',guardCount:8},
  {key:'stonevault',type:'stonevault',name:'封石宝库'}
]);
export const WORLD_RELIC_DEFINITIONS=freeze({
  ruins:[{key:'rune',type:'rune',name:'遗迹符文阵'}],
  snow:[{key:'rune',type:'rune',featureId:'icealtar',appearance:'icealtar',name:'冰封祭坛'}]
});
export const RELIC_SITE_TYPES=freeze({
  default:{r:105,width:128,depth:66,doorOffset:100,clearance:100,hazardRadius:105,feature:'companions'},
  hunt:{r:210,width:420,depth:420,doorOffset:190,clearance:245,hazardRadius:70,goal:RELIC_SITE_RULES.huntGuards,feature:'encounters',touchRadius:RELIC_SITE_RULES.huntTouchRadius,anchor:'center'},
  rescue:{r:105,width:128,depth:66,doorOffset:100,clearance:135,hazardRadius:105,feature:'companions',gated:true},
  stonevault:{r:105,width:128,depth:66,doorOffset:138,clearance:135,hazardRadius:105,feature:'companions',gated:true},
  dogcamp:{r:62,width:90,depth:65,doorOffset:36,clearance:100,hazardRadius:105,feature:'companions'},
  rune:{r:72,width:96,depth:82,doorOffset:45,clearance:100,hazardRadius:105,goal:12,mechanism:{type:'rune',r:48,state:'idle',charge:0,remaining:0,maxRemaining:12}}
});
export const RELIC_APPEARANCES=freeze({golemaltar:{doorOffset:0,gateOpen:true,touchRadius:ARMY_SITE_RULES.altarTouchRadius,anchor:'center',gated:false}});
export function relicSiteProfile(site){const profile=RELIC_SITE_TYPES[site?.type]||RELIC_SITE_TYPES.default,appearance=RELIC_APPEARANCES[site?.appearance];return appearance?{...profile,...appearance}:profile;}
export function relicSiteEntries(game){return game.environment?.mechanisms?[...RELIC_SITE_DEFINITIONS,...(WORLD_RELIC_DEFINITIONS[game.region?.id]||[])]:RELIC_SITE_DEFINITIONS;}
export function relicSiteEnabled(game,site){const feature=relicSiteProfile(site).feature;return !feature||game._features?.[feature]!==false;}
export function createRelicMechanism(site,entry){const spec=relicSiteProfile(entry).mechanism;if(!spec)return null;return {id:`${site.id}:support`,siteId:site.id,...spec,element:featureForSite(entry)?.element,x:site.x,y:site.y};}
