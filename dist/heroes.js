import { getConfigSection } from './content-config.js';
const HERO_CONFIG=getConfigSection('heroes');
// Stable identities remain separate from the names shown in menus and records.
const percent=value=>`${value>0?'+':''}${Math.round(value*100)}%`;
const STAT_LABELS=HERO_CONFIG.statLabels;
const signed=value=>`${value>0?'+':''}${value}`;
function normalizeModifiers(modifiers={}) {
  return Object.freeze(Object.fromEntries(Object.keys(STAT_LABELS).map(key=>{
    const source=modifiers[key]??{};
    return [key,Object.freeze({multiplier:Number.isFinite(source.multiplier)?source.multiplier:1,fixed:Number.isFinite(source.fixed)?source.fixed:0})];
  })));
}

// Apply once to a fully accumulated common stat; never compound on refresh.
export function applyHeroStat(hero,key,base) {
  const modifier=hero?.statModifiers?.[key];
  return base*(modifier?.multiplier??1)+(modifier?.fixed??0);
}

function hero({id,name,dialogueName,role,summary,color,appearanceId=`${id}-v2`,statModifiers={}}) {
  const modifiers=normalizeModifiers(statModifiers),identity={statModifiers:modifiers};
  const effects=[];
  for(const [key,label] of Object.entries(STAT_LABELS)) {
    const modifier=modifiers[key];
    if(modifier.multiplier!==1)effects.push(`${label} ${percent(modifier.multiplier-1)}`);
    if(modifier.fixed!==0)effects.push(`${label} ${signed(modifier.fixed)}`);
  }
  const traits=effects.map((effect,index)=>`${index===0?'角色特性：':''}${effect}`);
  const details=[
    `角色特性：${effects.join(' · ')||'无'}`,
    `初始生命：${Math.round(applyHeroStat(identity,'maxHealth',HERO_CONFIG.defaults.baseHealth))}`
  ];
  return Object.freeze({id,name,dialogueName,role,summary,appearanceId,tagline:role,passive:summary,color,statModifiers:modifiers,
    hpMultiplier:modifiers.maxHealth.multiplier,baseSpeed:Math.round(applyHeroStat(identity,'moveSpeed',HERO_CONFIG.defaults.baseMoveSpeed)*100)/100,
    damageMultiplier:modifiers.attack.multiplier,baseDefense:modifiers.defense.fixed,magnetMultiplier:modifiers.pickupRange.multiplier,
    skillCooldown:HERO_CONFIG.defaults.skillCooldown,initialUpgrade:null,traits:Object.freeze(traits),details:Object.freeze(details)});
}
export const HEROES=Object.freeze(HERO_CONFIG.definitions.map(hero));
export const getHero=id=>HEROES.find(hero=>hero.id===id)||HEROES[0];

// Each stable hero identity has one standard appearance. Old selection records
// retain that identity and migrate to its directional artwork on resolution.
export const HERO_APPEARANCES=Object.freeze(HERO_CONFIG.appearances.map(appearance=>Object.freeze({...appearance,name:getHero(appearance.heroId).name})));
export function getHeroAppearance(heroId,appearanceId) {
  const validIdentity=HEROES.find(identity=>identity.id===heroId),identity=validIdentity||HEROES[0];
  if(!validIdentity)appearanceId=identity.appearanceId;
  return HERO_APPEARANCES.find(appearance=>appearance.heroId===identity.id&&appearance.id===appearanceId)
    ||HERO_APPEARANCES.find(appearance=>appearance.heroId===identity.id&&appearance.id===identity.appearanceId);
}
export const HERO_CHOICES=Object.freeze(HEROES.flatMap(identity=>HERO_APPEARANCES.filter(appearance=>appearance.heroId===identity.id).map(appearance=>Object.freeze({
  ...identity,...appearance,id:appearance.id,heroId:identity.id,appearanceId:appearance.id
}))));
