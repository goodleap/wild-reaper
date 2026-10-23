import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';

const content=getConfigSection('sites').dialogue.player;
const rules=content?.rules||{globalCooldown:5,hurtCooldown:12,crisisCooldown:20,spellCooldown:15,battleCooldown:20,idleMin:45,idleMax:70,repeatCooldown:120,combatRange:480};
const alive=actor=>actor&&(!Number.isFinite(actor.hp)||actor.hp>0);
const foot=actor=>({x:actor.x,y:actor.y+groundOffset(actor,!!(actor.heroId||actor.isCompanion))});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const heroId=game=>game.hero?.heroId||String(game.hero?.id||game.hero?.appearanceId||'traveler').replace(/-v\d+$/,'');

// getInteraction already applies each doorway's authored activation range.
// An active portal can be disabled solely because the player has not touched
// its much smaller entrance circle; that is not an unmet story requirement.
export function playerBlockedDialogue(choice,game){
  if(!choice||choice.enabled!==false)return null;
  if(choice.type==='portal')return /击败驻门|解锁双向/.test(choice.description||'')?'驻门首领还在。击败它才能打开通路。':null;
  if(choice.type==='stageExit')return game.stage&&!game.stage.bossDefeated?'关卡首领还没倒下，通关门尚未开放。':null;
  if(choice.type==='riftShortcut')return '这边锁住了，得从北侧钟楼绕过去。';
  if(choice.type==='dungeonChest')return '房间守卫还在。先解决它们，再开宝箱。';
  if(choice.category==='relic'||choice.type==='relic'){
    const site=game.relicSites?.sites?.find(site=>site.id===choice.siteId||site.id===choice.id);
    if(site&&['cleared','failed'].includes(site.state))return null;
    if(/队伍已满/.test(choice.label||''))return '队伍已经满了，得先遣散一名伙伴。';
    if(choice.relicType==='stonevault'){
      if(/正在/.test(choice.label||''))return '岩灵正在开路，守住这里就好。';
      if(/带岩灵靠近/.test(choice.label||''))return '岩灵离得太远，得带它靠近正门。';
      return '封石太厚，先找到并唤醒岩灵再回来。';
    }
    if(choice.relicType==='dogcamp')return '路粮还不够，攒够金币再来接它。';
  }
  return null;
}

function blockedChoices(game){
  if(game.story?.active)return [game.getInteraction?.()].filter(Boolean);
  const choices=game.dungeon?.active?[game.dungeon.getInteraction?.()]:[
    game.settlements?.getInteraction?.(),game.regions?.getInteraction?.(),
    game.relicSites?.getInteraction?.(),game.riftExploration?.getInteraction?.()
  ];
  choices.push(game.getInteraction?.());
  return [...new Map(choices.filter(Boolean).map(choice=>[choice.id,choice])).values()];
}

// Presentation-only context: this never retargets a unit or consumes the combat
// RNG. Idle/recovering/captive allies and distant or returning guards do not
// turn into fictitious participants just because they exist in the world.
export function playerCombatContext(game){
  const origin=foot(game.player),clear=entity=>{
    const target=foot(entity);
    return !game.terrain?.firstBlocker?.(origin.x,origin.y,target.x,target.y,0,'sight');
  };
  const enemies=(game.enemies||[]).filter(enemy=>alive(enemy)&&!enemy.trainingDummy&&enemy.guardActive!==false&&
    !['idle','returning','home','patrolling'].includes(enemy.territoryState)&&
    distance(origin,foot(enemy))<rules.combatRange&&clear(enemy));
  const allies=(game.companions?.members||[]).filter(member=>alive(member)&&member.state==='active'&&['stormcaller','warden','golem'].includes(member.kind)&&
    distance(origin,foot(member))<rules.combatRange&&enemies.some(enemy=>
      member._combatTargetId===enemy.id||member._combatTarget===enemy||distance(foot(member),foot(enemy))<150)&&clear(member));
  return {enemies,allies,ratio:Number.isFinite(game.player.maxHp)&&game.player.maxHp>0?game.player.hp/game.player.maxHp:1};
}

export class PlayerDialogue {
  constructor(){this.reset();}
  reset(){this.clock=0;this.nextGlobal=0;this.nextClass=new Map();this.recent=[];this.lastLine=new Map();this.rotations=new Map();this.entered=new Set();this.previousHp=null;this.previousEnemies=new Set();this.previousElites=new Set();this.samples=[];this.wasThreatened=false;this.retreatArmed=true;this.combatSince=null;this.lastCombatAt=0;this.nextIdle=rules.idleMin;this.idleTurn=0;this.seenEvents=new WeakSet();this.context=null;this.nextContextAt=0;}
  observe(game,dt,{say,exclusive=false}={}){
    if(game.mode==='story')return;
    this.clock+=Math.max(0,dt||0);
    const now=this.clock;
    if(!this.context||now>=this.nextContextAt){this.context=playerCombatContext(game);this.nextContextAt=now+.25;}
    const context={...this.context,enemies:this.context.enemies.filter(alive),ratio:Number.isFinite(game.player.maxHp)&&game.player.maxHp>0?game.player.hp/game.player.maxHp:1},ids=new Set(context.enemies.map(enemy=>enemy.id)),eliteIds=new Set(context.enemies.filter(enemy=>enemy.elite||enemy.type==='boss').map(enemy=>enemy.id));
    const lostHp=this.previousHp!=null&&game.player.hp<this.previousHp;
    this.previousHp=game.player.hp;
    const entrants=this.wasThreatened?context.enemies.filter(enemy=>!this.previousEnemies.has(enemy.id)).length:0;
    this.samples.push({at:now,count:entrants});this.samples=this.samples.filter(sample=>now-sample.at<=2);
    const surge=this.wasThreatened&&this.samples.reduce((sum,sample)=>sum+sample.count,0)>=3;
    const newElite=this.wasThreatened&&[...eliteIds].some(id=>!this.previousElites.has(id));
    this.previousEnemies=ids;this.previousElites=eliteIds;
    if(context.enemies.length){this.lastCombatAt=now;this.combatSince??=now;}else this.combatSince=null;
    this.wasThreatened=true;if(context.ratio>.4)this.retreatArmed=true;
    const blocked=blockedChoices(game).map(choice=>({choice,text:playerBlockedDialogue(choice,game)})).filter(item=>item.text);
    const current=new Set(blocked.map(({choice,text})=>`${choice.id}:${text}`));
    if(exclusive)this.entered.clear();
    if(!exclusive)for(const {choice,text}of blocked){
      const key=`${choice.id}:${text}`;
      if(!this.entered.has(key)&&say({key:`hint:${key}`,text,priority:110,channel:'hint',persistent:true})){this.entered.add(key);this.nextGlobal=now+rules.globalCooldown;}
    }
    // While a plot exchange owns the channel, an unread doorway cue stays
    // eligible; standing within it will explain the condition after the plot.
    this.entered=new Set([...this.entered].filter(key=>current.has(key)));
    const events=(game.events||[]).filter(event=>event&&typeof event==='object'&&!this.seenEvents.has(event));
    for(const event of game.events||[])if(event&&typeof event==='object')this.seenEvents.add(event);
    if(exclusive)return;
    const candidates=[];
    if(context.ratio<.3&&context.enemies.length&&this.retreatArmed)candidates.push({kind:'retreat',line:'retreat',priority:105,onAccepted:()=>{this.retreatArmed=false;}});
    if(surge||newElite)candidates.push({kind:'crisis',line:context.enemies.length>context.allies.length+3?'surrounded':'alert',priority:88});
    if(lostHp)candidates.push({kind:'hurt',line:'hurt',priority:85});
    for(const event of events){
      const spell=event.type==='skill'?'storm':event.type==='superCast'&&['meteor','swords'].includes(event.skillId)?event.skillId:null;
      if(spell)candidates.push({kind:'spell',line:spell,priority:90});
    }
    if(this.combatSince!=null&&now-this.combatSince>=8&&context.ratio>=.4&&context.enemies.length>=2)candidates.push({kind:'battle',line:context.enemies.length>context.allies.length+3?'determined':'encourage',priority:70});
    if(!context.enemies.length&&now-this.lastCombatAt>=10&&now>=this.nextIdle){
      const area=game.dungeon?.active?'interior':game.region?.id==='marsh'?'marsh':game.region?.id==='ruins'?'ruins':'forest';
      candidates.push({kind:'idle',line:area,priority:15});
    }
    for(const candidate of candidates.sort((a,b)=>b.priority-a.priority))if(this._say(game,candidate,say))break;
  }
  _say(game,candidate,say){
    const now=this.clock,{kind,line,priority}=candidate;
    if(now<this.nextGlobal||now<(this.nextClass.get(kind)||0))return false;
    const variants=content?.voices?.[heroId(game)]?.[line]||content?.voices?.traveler?.[line];
    if(!variants?.length)return false;
    const key=`${heroId(game)}:${line}`,turn=this.rotations.get(key)||0;
    this.recent=this.recent.filter(item=>now-item.at<rules.repeatCooldown);
    const text=Array.from({length:variants.length},(_,i)=>variants[(turn+i)%variants.length]).find(text=>!this.recent.some(item=>item.text===text)&&now-(this.lastLine.get(text)??-Infinity)>=rules.repeatCooldown);
    if(!text||!say({key:`player:${key}`,text,priority,channel:'player'}))return false;
    this.nextGlobal=now+rules.globalCooldown;
    this.nextClass.set(kind,now+(rules[`${kind}Cooldown`]||rules.battleCooldown));
    this.rotations.set(key,variants.indexOf(text)+1);this.lastLine.set(text,now);this.recent.push({text,at:now});this.recent=this.recent.slice(-5);
    if(kind==='idle'){this.nextIdle=now+rules.idleMin+(this.idleTurn++*13)%(rules.idleMax-rules.idleMin+1);}
    candidate.onAccepted?.();return true;
  }
}
