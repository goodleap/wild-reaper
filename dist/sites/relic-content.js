import { getConfigSection } from '../content-config.js';
import { ARMY_SITE_RULES } from '../site-definitions.js';
import { COMPANION_RULES } from '../companion-catalog.js';
import { beginRelicActivation } from '../relic-activation.js';
const hunt=getConfigSection('encounters').eventRules;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function relicInteraction(relics,site){
  const g=relics.game;
      let enabled=site.state==='ready',label='',description='';
      if(site.state==='cleared'){label='遗迹已完成';description=site.type==='rune'?'符文能量已耗尽，石台保留':'建筑与通路保留，奖励不再刷新';}
      else if(site.state==='failed'){label='遗迹挑战已结束';description='守卫已散去，遗迹留在原地';}
      else if(site.type==='dogcamp'){
        label=`招募寻宝小狗 · ${ARMY_SITE_RULES.dogCost} 金币`;
        enabled=enabled&&g.gold>=ARMY_SITE_RULES.dogCost;
        description='提供路粮，小狗会带路寻找附近宝藏';
      } else if(site.type==='stonevault'){
        if(site.gateOpen){enabled=site.state==='opened';label='走入宝库领取珍藏';description=`${ARMY_SITE_RULES.vaultGold} 金币 / ${ARMY_SITE_RULES.vaultCrystals} 灵晶`;}
        else if(site.state==='opening'){enabled=false;label='岩灵正在击碎封石';description='守在门前，通路将永久开启';}
        else {enabled=!!relics._golemFor(site);label=enabled?'岩灵击碎封石':relics._member('golem')?'带岩灵靠近宝库正门':'封石宝库 · 需要岩灵';description='寻找沉睡石像，唤醒伙伴后返回';}
      } else if(site.state==='active') {
        const camp=site.type==='rescue'&&g.companions?.campFor(site.id);
        label=site.type==='hunt'?`狩猎守卫 ${site.progress}/${site.goal}`:site.type==='rune'?`符文支援 ${Math.ceil(site.mechanism.remaining)} 秒`:camp?.siteId===site.id&&camp.state==='ready'?'靠近伙伴完成解救':`${site.appearance==='golemaltar'?'唤醒试炼':'囚牢守卫'} ${site.progress}/${site.goal}`;
        description=site.type==='rune'?'符文正在自动轰击附近怪物':'离开后进度保留，返回可继续挑战';
      } else if(site.type==='hunt') {label='走进中央纹章开启狩猎';description=`击败 ${hunt.hunt.relicGoal} 名遗迹守卫 · ${hunt.rewards.relicHunt.crystals} 灵晶 / ${hunt.rewards.relicHunt.gold} 金币`;}
      else if(site.type==='rune') {label=`激活${site.name}`;description=site.featureId==='icealtar'?'一次性寒霜支援 · 自动攻击并减速附近怪物':'一次性 12 秒符文支援 · 自动攻击附近怪物';}
      else {label=site.kind==='golem'?'触碰古坛唤醒岩灵':site.kind==='owl'?'驱散守卫解救猫头鹰':'挑战囚牢守卫';description=`击败 ${site.goal} 名守卫，招募伙伴`;}
  if(['rescue','dogcamp'].includes(site.type)&&['ready','active'].includes(site.state)&&(g.companions?.members.length||0)>=COMPANION_RULES.maxMembers){
    enabled=false;label=`队伍已满 · ${COMPANION_RULES.maxMembers}/${COMPANION_RULES.maxMembers}`;
    description='休整中的伙伴也占名额；在伙伴面板遣散一名后可继续招募';
  }
  return {enabled,label,description};
}

function activateDogcamp(relics,site){
  const g=relics.game;
      if(g.gold<ARMY_SITE_RULES.dogCost)return false;
      const member=g.companions?.recruit('dog',{x:site.x,y:site.y,sourceId:site.id});if(!member)return false;
      g.gold-=ARMY_SITE_RULES.dogCost;site.state='cleared';site.discovered=true;beginRelicActivation(site);return true;
}

function activateStonevault(relics,site){
  const g=relics.game;
      if(site.gateOpen){
        if(site.state!=='opened'||!relics.insideRescue(site.id,relics._foot(),g.player.r))return false;
        site.state='cleared';g.grantResources({gold:ARMY_SITE_RULES.vaultGold,crystals:ARMY_SITE_RULES.vaultCrystals},'stonevault');
        g._emit('stonevaultClaimed',{siteId:site.id});g._effect(site.x,site.y,'ring',.7,90,'#ead18e');return true;
      }
      const member=relics._golemFor(site);if(!member)return false;
      site.state='opening';site.openProgress=0;site.discovered=true;site.workerId=member.id;
      member.workTarget={x:site.x,y:site.y+140,sourceId:site.id};member.castFace=.9;beginRelicActivation(site);
      g._emit('stonevaultOpening',{siteId:site.id});return true;
}

function activateRune(relics,site){
  const g=relics.game;
      if(!g.environment?.mechanisms.activateRune(site.mechanism))return false;
      site.state='active';site.discovered=true;beginRelicActivation(site);return true;
}

function activateBattle(relics,site){
  const g=relics.game;
    const battle=site.type==='hunt'?g.encounters?.spawn('hunt',site.x,site.y,{siteId:site.id}):g.companions?.spawn(site.kind,site.x,site.y,{siteId:site.id});
    if(!battle)return false;
    site.state='active';site.discovered=true;site.battleId=battle.id;site.progress=0;
    if(site.type==='rescue')beginRelicActivation(site);
    g._emit('relicSiteStarted',{siteId:site.id,relicType:site.type,name:site.name});return true;
}

const ACTIVATIONS=Object.freeze({dogcamp:activateDogcamp,stonevault:activateStonevault,rune:activateRune,hunt:activateBattle,rescue:activateBattle});
export function activateRelicSite(relics,site){return (ACTIVATIONS[site.type]||activateBattle)(relics,site);}

export function updateRelicContent(relics,dt){
  const g=relics.game;
    for(const site of relics.sites)if(site.type==='stonevault'&&site.state==='opening') {
      const member=relics._golemFor(site);
      if(!member||member.id!==site.workerId||distance(relics._foot(),site.door)>220){
        const previous=g.companions?.members?.find(ally=>ally.id===site.workerId);if(previous?.workTarget?.sourceId===site.id)delete previous.workTarget;
        site.state='ready';site.openProgress=0;continue;
      }
      site.openProgress=Math.min(ARMY_SITE_RULES.smashDuration,(site.openProgress||0)+dt);member.castFace=.2;
      if(site.openProgress>=ARMY_SITE_RULES.smashDuration){
        delete member.workTarget;site.state='opened';relics.openGate(site.id);beginRelicActivation(site);
        g._effect(site.x,site.y+61,'ring',.55,74,'#d1c093',undefined,{quake:true,groundY:site.y+61,ally:true});g._emit('stonevaultOpened',{siteId:site.id});
      }
    }
    for(const site of relics.sites)if(site.type==='rune'&&site.state==='active') {
      g.environment?.mechanisms._rune(site.mechanism,dt);
      site.progress=site.goal-site.mechanism.remaining;
      if(site.mechanism.state==='spent')relics.complete(site.id,true);
      if(g.status!=='playing')break;
    }
}
