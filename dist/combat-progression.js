import { UPGRADE_DEFS, ENDLESS_UPGRADES, EVOLUTIONS, getUpgradeDefinition, canTakeUpgrade } from './combat-catalog.js';
import { WEAPON_BRANCHES, BRANCH_WEAPONS, branchDefinition, isBranchReady } from './weapon-branches.js';

const ACQUISITIONS=Object.freeze(['arrow','orbit','pulse','lightning','barrier']);
const randomEntry=items=>items[Math.min(items.length-1,Math.floor(Math.random()*items.length))];
const frozenChoices=choices=>Object.freeze(choices.map(choice=>Object.freeze(choice)));

// Crystal advancement is independent of character XP and of any one weapon
// or skill's level. The build owns all ranks; this service owns only the offer
// transaction and delegates the existing world/UI hooks back to Game.
export class CombatProgression {
  constructor(game,{costForTier}={}) {
    if(typeof costForTier!=='function')throw new TypeError('CombatProgression requires costForTier');
    this.game=game;
    this.costForTier=costForTier;
  }

  tryUpgrade() {
    const g=this.game;
    if(g.status!=='playing'||g.crystals<g.crystalsNext)return false;
    g.status='upgrade';g._choices=null;
    g._emit('skillUpgrade',{progressionTier:g.progressionTier});
    return true;
  }

  _group(choice) {
    if(choice.category==='attribute')return 'attribute';
    const owner=this.game.build.getWeapon(choice.ownerId)||this.game.build.getSkill(choice.ownerId);
    return owner?.baseRank===0?'acquisition':'enhancement';
  }

  _ordinary(pool,count) {
    const g=this.game,chosen=[];
    const groups=Object.fromEntries(['acquisition','enhancement','attribute'].map(group=>[group,pool.filter(choice=>this._group(choice)===group)]));
    if(count===1) {
      // A branch pair must always leave one real alternative. Rotate its
      // category after paid choices, not after reopening the same panel.
      const order=g.progressionTier<=3?['acquisition','enhancement','attribute']:['enhancement','attribute','acquisition'];
      const start=g.progressionTier<=3?0:(g.progressionTier-1)%order.length;
      for(let i=0;i<order.length;i++) {
        const candidates=groups[order[(start+i)%order.length]];
        if(candidates.length)return [randomEntry(candidates)];
      }
      return chosen;
    }
    // Allocate opportunities by purpose before sampling individual cards, so
    // adding dozens of upgrades cannot drown out acquisitions or attributes.
    for(const group of ['acquisition','enhancement','attribute']) {
      if(groups[group].length&&chosen.length<count)chosen.push(randomEntry(groups[group]));
    }
    while(chosen.length<count&&chosen.length<pool.length) {
      chosen.push(randomEntry(pool.filter(choice=>!chosen.includes(choice))));
    }
    return chosen;
  }

  _choice(definition) {
    if(definition.id.startsWith('super:'))return {...definition};
    const g=this.game,id=definition.id,rank=g.build.getRank(id);
    let desc=definition.desc,kind=definition.kind;
    if(id==='sword') {
      desc=rank?'提升伤害、挥砍距离和频率；5 级选择横扫或重斩':'自动朝近身敌人挥剑，扇形斩击身前敌群';kind=rank?'武器强化':'获得武器';
    }else if(id==='barrier') {
      desc=rank?'提高护盾容量与持续时间，缩短冷却':'受击自动展开，吸收首击与随后伤害；无受击时持续待命';kind=rank?'技能强化':'独立技能';
    }else if(id==='orbit') {
      if(rank) {
        desc='增加一枚环刃，并提高切割伤害';
        kind='武器强化';
      }
      if(rank===4){desc=`增加一枚环刃并提高伤害，进化为「${EVOLUTIONS.orbit.name}」：${EVOLUTIONS.orbit.desc}`;kind='武器进化';}
      else desc+='；达到 5 级自动进化';
    }else if(id==='pulse'||id==='lightning') {
      if(rank) {
        desc=id==='pulse'?'扩大解围范围并提高伤害；无敌人时待命':'提升每道闪电伤害；无目标时待命';
        kind='技能强化';
      }else kind='独立技能';
      desc+='；升至 5 级时选择一条分支';
    }
    const owner=g.build.getWeapon(definition.ownerId)||g.build.getSkill(definition.ownerId);
    return {...definition,desc,kind,level:owner?owner.level+1:rank+1,
      evolutionName:id==='orbit'?EVOLUTIONS.orbit.name:undefined,evolves:id==='orbit'&&rank===4};
  }

  getChoices() {
    const g=this.game;
    if(g._choices)return g._choices;
    const pool=UPGRADE_DEFS.filter(definition=>canTakeUpgrade(g.build,definition.id));
    pool.push(...g.superSkills.getUpgradeChoices());
    if(pool.length<3)pool.push(...ENDLESS_UPGRADES.filter(definition=>canTakeUpgrade(g.build,definition.id)));

    // Present both exclusive branches together and keep the third card as a
    // deferral. A successful purchase advances the cursor; inspection does not.
    g._branchOfferWeapon=null;
    for(let i=0;i<BRANCH_WEAPONS.length;i++) {
      const owner=BRANCH_WEAPONS[((g._branchOfferCursor||0)+i)%BRANCH_WEAPONS.length];
      if(isBranchReady(g,owner)){g._branchOfferWeapon=owner;break;}
    }
    const opening=g.progressionTier===1&&!g._branchOfferWeapon&&ACQUISITIONS.every(id=>!g.build.getRank(id));
    const ordinary=opening?['arrow','barrier',randomEntry(['orbit','pulse','lightning'])].map(id=>pool.find(choice=>choice.id===id)).filter(Boolean):this._ordinary(pool,g._branchOfferWeapon?1:3);
    let choices=ordinary.map(choice=>this._choice(choice));
    if(g._branchOfferWeapon) {
      const owner=g._branchOfferWeapon;
      const level=owner==='arrow'?(g.build.getWeapon('arrow')?.level||1)+1:5;
      choices=[...WEAPON_BRANCHES[owner].map(definition=>({...definition,level})),...choices];
    }
    g._choices=frozenChoices(choices);
    return g._choices;
  }

  choose(id) {
    const g=this.game;
    if(g.status!=='upgrade'||g.crystals<g.crystalsNext)return false;
    const choice=this.getChoices().find(candidate=>candidate.id===id);
    if(!choice)return false;
    const p=g.player,paidCost=g.crystalsNext;
    if(choice.branch) {
      const definition=branchDefinition(choice.weaponId,choice.branch);
      if(!definition||definition.id!==id||!isBranchReady(g,choice.weaponId)||!g.build.selectBranch(choice.weaponId,choice.branch))return false;
      g._emit('branchChosen',{ownerId:choice.weaponId,branch:choice.branch,name:definition.name});
    }else if(id.startsWith('super:')) {
      if(!g.superSkills.upgrade(id))return false;
    }else {
      // Revalidate against the canonical build, including ownership, branch
      // requirements and caps. A stale card can never bypass prerequisites.
      const acquiring=this._group(choice)==='acquisition';
      if(!getUpgradeDefinition(id)||!canTakeUpgrade(g.build,id)||!g.build.increment(id))return false;
      if(acquiring) {
        if(id==='pulse')g._pulse=.15;
        if(id==='lightning')g._lightning=.15;
        g._emit('weaponAcquired',{weaponId:id,name:choice.name,category:choice.category});
      }
    }

    g.crystals-=paidCost;
    g.progressionTier++;
    g.crystalsNext=this.costForTier(g.progressionTier);
    if(g._branchOfferWeapon)g._branchOfferCursor=(BRANCH_WEAPONS.indexOf(g._branchOfferWeapon)+1)%BRANCH_WEAPONS.length;
    g._branchOfferWeapon=null;
    g._syncEvolutions(true);
    // Maximum HP is derived from build attributes; only the one-time healing
    // belongs to the purchase transaction, or vitality would be counted twice.
    const healing=(getUpgradeDefinition(id)?.effects||[])
      .filter(effect=>effect.stat==='heal'&&effect.operation==='add')
      .reduce((sum,effect)=>sum+effect.value,0);
    if(healing>0){p.hp=Math.min(p.maxHp,p.hp+healing);g._emit('heal');}
    g._refreshStats();g._refreshWeapons();
    p.invuln=Math.max(p.invuln,1);
    g._choices=null;g.status='playing';
    this.tryUpgrade();
    return true;
  }
}
