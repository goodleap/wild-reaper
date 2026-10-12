import { groundOffset } from './terrain.js';

const freeze=Object.freeze;
export const SUPER_SKILLS=freeze([
  freeze({id:'thorns',name:'荆棘缚阵',desc:'在敌群脚下召出荆棘，造成范围伤害并短暂定身普通敌人',icon:'♧',color:'#a9d888',source:'region',regionId:'forest',tier:'区域超级技能',automatic:true,maxLevel:3}),
  freeze({id:'miasma',name:'瘴雾侵蚀',desc:'在敌群脚下爆发瘴气，留下持续 4 秒的侵蚀雾，每半秒造成范围伤害',icon:'♨',color:'#cea1da',source:'region',regionId:'marsh',tier:'区域超级技能',automatic:true,maxLevel:3}),
  freeze({id:'runes',name:'符文穿击',desc:'朝敌人展开三道符文射线，贯穿沿途目标，同次攻击不重复命中',icon:'✧',color:'#89ddd8',source:'region',regionId:'ruins',tier:'区域超级技能',automatic:true,maxLevel:3}),
  freeze({id:'meteor',name:'星陨',desc:'标记数处敌群位置，短暂蓄能后落下星陨，造成高额范围伤害',icon:'✦',color:'#f1bc79',source:'castle',regionId:null,tier:'城堡超级技能',automatic:true,maxLevel:3}),
  freeze({id:'swords',name:'王庭剑阵',desc:'连续唤出追击灵剑，优先攻击附近首领和强敌',icon:'⚔',color:'#f0dda3',source:'castle',regionId:null,tier:'城堡超级技能',automatic:true,maxLevel:3}),
  freeze({id:'vortex',name:'虚空漩涡',desc:'生成持续漩涡，牵引普通敌人并反复造成伤害；首领不受牵引',icon:'◉',color:'#b7a3ed',source:'castle',regionId:null,tier:'城堡超级技能',automatic:true,maxLevel:3})
]);
export const SUPER_RULES=freeze({maxLevel:3,maxFields:12,maxTargets:16,regionFallback:freeze({gold:60,crystals:100}),castleFallback:freeze({gold:120,crystals:180})});
const DEFINITIONS=new Map(SUPER_SKILLS.map(skill=>[skill.id,skill]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const segmentDistance=(x,y,x1,y1,x2,y2)=>{
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
  const t=length?clamp(((x-x1)*dx+(y-y1)*dy)/length,0,1):0;
  return Math.hypot(x-x1-dx*t,y-y1-dy*t);
};
// One immutable source supplies both combat and the upgrade-card comparisons.
// damage is a single hit/tick, before the player's shared damage multiplier.
const LEVEL_STATS=freeze(Object.fromEntries(SUPER_SKILLS.map(({id})=>[id,freeze([1,2,3].map(level=>{
  const n=level-1,stats={
    thorns:{cooldown:7-n*.6,damage:84+n*32,radius:105+n*15,root:1.25+n*.2},
    miasma:{cooldown:7-n*.3,damage:24+n*7,impactDamage:32+n*8,radius:95+n*10,duration:4,interval:.5},
    runes:{cooldown:5.4-n*.3,damage:96+n*30,width:11+n*3,range:450,count:3},
    meteor:{cooldown:9-n*.5,damage:145+n*40,radius:86+n*9,count:level===1?2:3},
    swords:{cooldown:6.6-n*.4,damage:124+n*32,count:3+level,interval:.22},
    vortex:{cooldown:9-n*.5,damage:27+n*10,radius:125+n*15,duration:3.2,interval:.4,pull:82+n*14}
  }[id];
  return freeze({level,...stats});
}))])));
export const getSuperSkillStats=(id,level=1)=>LEVEL_STATS[id]?.[level-1]||null;
const cooldown=(id,level)=>getSuperSkillStats(id,level).cooldown;
const upgradeDescription=(id,level)=>{
  const s=getSuperSkillStats(id,level);
  return {
    thorns:`荆棘伤害提升至 ${s.damage}，范围与定身时间增加，冷却缩短`,
    miasma:`瘴气爆发伤害提升至 ${s.impactDamage}，每次侵蚀 ${s.damage} 伤害，范围增加`,
    runes:`符文射线伤害提升至 ${s.damage}，射线加宽，冷却缩短`,
    meteor:`星陨伤害提升至 ${s.damage}，扩大爆炸范围${level===2?'，增加一次星陨':''}`,
    swords:`每轮增加一柄灵剑，单剑伤害提升至 ${s.damage}，冷却缩短`,
    vortex:`漩涡每次伤害提升至 ${s.damage}，范围与牵引速度增加，冷却缩短`
  }[id];
};

// Boss rewards exclusively unlock these skills. Ordinary crystal choices can
// strengthen an already owned skill, but cannot introduce an unearned one.
export class SuperSkills {
  constructor(game) {
    this.game=game;this.owned={};this.cooldowns={};this.pending=null;
    this.fields=[];this._volleys=[];this._id=0;
  }

  offer(source,regionId=this.game.region?.id) {
    if(this.pending||!['region','castle'].includes(source))return false;
    this.pending=this._rewardSnapshot(source,regionId||'forest');
    return true;
  }
  _poolSignature(source) {
    return SUPER_SKILLS.filter(skill=>skill.source===source).map(skill=>`${skill.id}:${this.owned[skill.id]||0}`).join('|');
  }
  _rewardSnapshot(source,regionId) {
    const pool=SUPER_SKILLS.filter(skill=>skill.source===source&&(this.owned[skill.id]||0)<SUPER_RULES.maxLevel);
    pool.sort((a,b)=>Number(b.regionId===regionId)-Number(a.regionId===regionId));
    let choices=freeze(pool.map(skill=>this._choice(skill)));
    if(!choices.length) {
      const reward=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;
      choices=freeze([freeze({id:'super:resource',name:'满阶宝藏',desc:`该类超级技能已全部满阶，获得 ${reward.gold} 金币与 ${reward.crystals} 灵晶`,icon:'◆',color:'#edcf8a',kind:'资源宝藏',source,tier:source==='castle'?'城堡宝藏':'区域宝藏',level:0,automatic:false})]);
    }
    // The pending object is a complete immutable reward snapshot, allowing a
    // castle to suspend and later restore an unclaimed overworld portal.
    return freeze({source,regionId,choices,signature:this._poolSignature(source)});
  }

  _choice(skill) {
    const currentLevel=this.owned[skill.id]||0,level=currentLevel+1;
    return freeze({...skill,level,currentLevel,acquired:currentLevel>0,kind:currentLevel?'超级技能强化':'超级技能',desc:currentLevel?upgradeDescription(skill.id,level):skill.desc});
  }
  getChoices(){
    // A portal can remain unclaimed while crystals strengthen learned skills,
    // including during a castle visit. Keep its source/order, but never offer
    // a stale upgrade that has already reached its cap. No random rerolling.
    if(this.pending&&this.pending.signature!==this._poolSignature(this.pending.source))this.pending=this._rewardSnapshot(this.pending.source,this.pending.regionId);
    return this.pending?.choices||[];
  }

  choose(id) {
    const g=this.game;
    if(g.status!=='super'||!this.pending||!this.getChoices().some(choice=>choice.id===id))return false;
    const source=this.pending.source;
    if(id==='super:resource') {
      if(!SUPER_SKILLS.filter(skill=>skill.source===source).every(skill=>(this.owned[skill.id]||0)>=SUPER_RULES.maxLevel))return false;
      // Consume the claim before resource hooks run; they may schedule another
      // modal, but can never grant the same treasure a second time.
      this.pending=null;
      const reward=source==='castle'?SUPER_RULES.castleFallback:SUPER_RULES.regionFallback;
      g.grantResources({...reward},'superMastered');
      g._emit('superChosen',{skillId:id,name:'满阶宝藏',source});
      return true;
    }
    const skill=DEFINITIONS.get(id),current=this.owned[id]||0;
    if(!skill||skill.source!==source||current>=SUPER_RULES.maxLevel)return false;
    this.owned[id]=current+1;
    // An upgrade preserves the current cooldown instead of granting free
    // extra casts. New skills start shortly after leaving the reward panel.
    this.cooldowns[id]=current?Math.min(this.cooldowns[id]??0,cooldown(id,current+1)):.6;
    this.pending=null;
    g._emit('superChosen',{skillId:id,name:skill.name,level:this.owned[id],source});
    return true;
  }

  getUpgradeChoices() {
    return SUPER_SKILLS.filter(skill=>this.owned[skill.id]>0&&this.owned[skill.id]<SUPER_RULES.maxLevel)
      .map(skill=>({...this._choice(skill),id:`super:${skill.id}`,skillId:skill.id,kind:'超级技能强化'}));
  }
  upgrade(id) {
    if(this.game.status!=='upgrade'||typeof id!=='string'||!id.startsWith('super:'))return false;
    const skillId=id.slice(6),level=this.owned[skillId];
    if(!DEFINITIONS.has(skillId)||!level||level>=SUPER_RULES.maxLevel)return false;
    this.owned[skillId]=level+1;
    this.cooldowns[skillId]=Math.min(this.cooldowns[skillId]??0,cooldown(skillId,level+1));
    return true;
  }
  getLoadout() {
    return SUPER_SKILLS.filter(skill=>this.owned[skill.id]>0)
      .map(skill=>({...skill,level:this.owned[skill.id],cooldown:this.cooldowns[skill.id]||0,maxCooldown:cooldown(skill.id,this.owned[skill.id])}));
  }

  _foot(entity=this.game.player) {
    return {x:entity.x,y:entity.y+groundOffset(entity,entity===this.game.player||!!entity.isCompanion)};
  }
  _visible(enemy) {
    return enemy.hp>0&&!enemy.isCompanion&&enemy.guardActive!==false&&this.game._inView(enemy);
  }
  _lineClear(from,to,r=0) {
    return !this.game.terrain?.firstBlocker(from.x,from.y,to.x,to.y,r);
  }
  _targets(origin=this._foot(),range=420,{strongest=false}={}) {
    const targets=this.game.enemies.filter(enemy=>this._visible(enemy)&&distance(origin,this._foot(enemy))<=range&&this._lineClear(origin,this._foot(enemy)));
    targets.sort((a,b)=>strongest?(Number(b.type==='boss')-Number(a.type==='boss')||b.hp-a.hp||distance(origin,this._foot(a))-distance(origin,this._foot(b))):distance(origin,this._foot(a))-distance(origin,this._foot(b)));
    return targets;
  }
  _center(targets,r) {
    // Only a small nearest subset is considered, independent of the live horde
    // cap. Dense groups receive a useful cast without an O(n²) screen scan.
    let best=targets[0],score=-1;
    const sample=targets.slice(0,18);
    for(const target of sample.slice(0,6)) {
      const at=this._foot(target),count=sample.reduce((n,enemy)=>n+(distance(at,this._foot(enemy))<=r),0);
      if(count>score){best=target;score=count;}
    }
    return best?this._foot(best):null;
  }
  _field(skillId,point,r,life,extra={}) {
    if(this.fields.length>=SUPER_RULES.maxFields)return null;
    const definition=DEFINITIONS.get(skillId),id=++this._id;
    const field={id,kind:skillId,x:point.x,y:point.y,r,life,maxLife:life,stage:'active',color:definition.color,skillId,seed:id,...extra};
    this.fields.push(field);return field;
  }
  _areaTargets(field,limit=SUPER_RULES.maxTargets) {
    return this.game.enemies.filter(enemy=>this._visible(enemy)&&distance(field,this._foot(enemy))<=field.r+enemy.r&&this._lineClear(field,this._foot(enemy)))
      .sort((a,b)=>distance(field,this._foot(a))-distance(field,this._foot(b))).slice(0,limit);
  }
  _damage(enemy,amount,origin) {
    // Raw damage deliberately bypasses bleed, shock and lightning refunds.
    return this.game._hurtEnemy(enemy,amount,0,origin,'super');
  }
  _burst(field,life=.55) {
    this.game._effect(field.x,field.y,'superBurst',life,field.r,field.color,undefined,{skillId:field.skillId,seed:field.seed});
  }

  _cast(id,level) {
    const g=this.game,p=g.player,origin=this._foot(),targets=this._targets(origin,id==='runes'?450:420,{strongest:id==='swords'});
    if(!targets.length)return false;
    const power=g._damageMultiplier(),stats=getSuperSkillStats(id,level);
    if(id==='thorns') {
      const {radius,root}=stats;
      const field=this._field(id,this._center(targets,radius),radius,root+.15);
      if(!field)return false;
      for(const enemy of this._areaTargets(field,12)) {
        this._damage(enemy,stats.damage*power,field);
        if(enemy.hp>0&&enemy.type!=='boss') {
          enemy.superRootUntil=Math.max(enemy.superRootUntil||0,g._clock+root);
          // A newly rooted charging beast stops at its current location;
          // a stale charge segment must not hit the player on this frame.
          enemy.charge=null;enemy._chargeSegment=null;
          enemy.chargeCooldown=Math.max(enemy.chargeCooldown||0,root+.6);
        }
      }
      this._burst(field,.4);
    } else if(id==='miasma') {
      const {radius,duration,interval}=stats;
      const field=this._field(id,this._center(targets,radius),radius,duration,{tick:interval,interval,damage:stats.damage*power});
      if(!field)return false;
      for(const enemy of this._areaTargets(field))this._damage(enemy,stats.impactDamage*power,field);
      this._burst(field,.5);
    } else if(id==='runes') {
      const target=targets[0],angle=Math.atan2(target.y-p.y,target.x-p.x),hit=new Set();
      for(const turn of [0,-.2,.2]) {
        const a=angle+turn,dx=Math.cos(a),dy=Math.sin(a),width=stats.width;
        let length=stats.range;
        if(!this._lineClear(origin,{x:origin.x+dx*length,y:origin.y+dy*length},width)) {
          let lo=0,hi=length;
          for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(this._lineClear(origin,{x:origin.x+dx*mid,y:origin.y+dy*mid},width))lo=mid;else hi=mid;}
          length=lo;
        }
        const end={x:p.x+dx*length,y:p.y+dy*length};
        const along=g.enemies.filter(enemy=>this._visible(enemy)&&!hit.has(enemy.id)&&segmentDistance(enemy.x,enemy.y,p.x,p.y,end.x,end.y)<=enemy.r+width&&this._lineClear(origin,this._foot(enemy)))
          .sort((a,b)=>distance(p,a)-distance(p,b)).slice(0,8);
        g._effect(p.x,p.y,'superRay',.48,width,DEFINITIONS.get(id).color,undefined,{x2:end.x,y2:end.y,skillId:id,seed:++this._id});
        for(const enemy of along){hit.add(enemy.id);this._damage(enemy,stats.damage*power,p);}
      }
    } else if(id==='meteor') {
      const {radius,count}=stats,points=[];
      for(const enemy of targets) {
        const at=this._foot(enemy);
        if(points.some(point=>distance(point,at)<radius*.9))continue;
        points.push(at);if(points.length===count)break;
      }
      // Against a lone boss, the second star still lands nearby rather than
      // silently deleting half the reward's damage potential.
      while(points.length<count)points.push({...points[0]});
      for(let i=0;i<points.length;i++)this._field(id,points[i],radius,.7+i*.25,{stage:'warning',damage:stats.damage*power});
    } else if(id==='swords') {
      if(this._volleys.length>=2)return false;
      const formationId=++this._id;
      this._volleys.push({skillId:id,formationId,remaining:stats.count,count:stats.count,index:0,tick:.16,interval:stats.interval,damage:stats.damage*power});
      g._effect(p.x,p.y,'superBurst',.16+stats.count*stats.interval,48,DEFINITIONS.get(id).color,undefined,{skillId:id,count:stats.count,interval:stats.interval,released:0,castX:p.x,castY:p.y,seed:formationId});
    } else if(id==='vortex') {
      const {radius,duration,interval,pull}=stats;
      if(!this._field(id,this._center(targets,radius),radius,duration,{tick:interval,interval,damage:stats.damage*power,pull}))return false;
    }
    g._emit('superCast',{skillId:id});return true;
  }

  _updateFields(dt) {
    const g=this.game;
    for(const field of this.fields) {
      field.life-=dt;
      if(field.kind==='meteor') {
        if(field.life<=1e-9) {
          this._burst(field,.82);
          for(const enemy of this._areaTargets(field,12))this._damage(enemy,field.damage,field);
          g._emit('superImpact',{skillId:'meteor',x:field.x,y:field.y});
        }
        continue;
      }
      if(field.kind==='thorns')continue;
      field.tick-=dt;
      if(field.kind!=='vortex'&&field.tick>1e-9)continue;
      const targets=this._areaTargets(field);
      if(field.kind==='vortex')for(const enemy of targets) {
        // Keep the advertised geometry of attacks already being telegraphed.
        if(enemy.type==='boss'||enemy.charge||enemy.cast||enemy.slam||enemy.bloomAttack)continue;
        const foot=this._foot(enemy),dx=field.x-foot.x,dy=field.y-foot.y,d=Math.hypot(dx,dy);
        if(d>enemy.r+6){const step=Math.min(d-enemy.r-6,field.pull*dt);g._moveEntity(enemy,dx/d*step,dy/d*step);}
      }
      if(field.tick<=1e-9) {
        field.tick+=field.interval;
        for(const enemy of targets)this._damage(enemy,field.damage,field);
      }
    }
    this.fields=this.fields.filter(field=>field.life>1e-9);
  }
  _updateVolleys(dt) {
    const g=this.game,p=g.player;
    for(const volley of this._volleys) {
      // Unlaunched swords share the actual caster position. Ground decoration
      // retains castX/Y, but the formation and release count follow simulation.
      const formation=g.effects.find(effect=>effect.type==='superBurst'&&effect.skillId==='swords'&&effect.seed===volley.formationId);
      if(formation){formation.x=p.x;formation.y=p.y;}
      volley.tick-=dt;if(volley.tick>1e-9)continue;
      volley.tick+=volley.interval;volley.remaining--;
      const index=volley.index++;
      if(formation)formation.released=volley.count-volley.remaining;
      const target=this._targets(this._foot(),430,{strongest:true})[0];
      if(!target)continue;
      const a=-Math.PI+.35+(index/(volley.count-1))*(Math.PI-.7),x=p.x+Math.cos(a)*35,y=p.y-13+Math.sin(a)*25;
      g._effect(x,y,'superSword',.34,9,DEFINITIONS.get('swords').color,undefined,{x2:target.x,y2:target.y,skillId:'swords',seed:++this._id});
      this._damage(target,volley.damage,p);
    }
    this._volleys=this._volleys.filter(volley=>volley.remaining>0);
  }

  movementMultiplier(enemy) {
    return enemy.type!=='boss'&&!enemy.isCompanion&&(enemy.superRootUntil||0)>this.game._clock?0:1;
  }
  clearScene() {
    this.fields=[];this._volleys=[];
    for(const enemy of this.game.enemies)delete enemy.superRootUntil;
    this.game.effects=this.game.effects.filter(effect=>!effect.skillId||!DEFINITIONS.has(effect.skillId));
  }
  update(dt) {
    if(this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(.05,dt);
    this._updateFields(dt);this._updateVolleys(dt);
    for(const skill of SUPER_SKILLS) {
      const level=this.owned[skill.id];if(!level)continue;
      this.cooldowns[skill.id]=Math.max(0,(this.cooldowns[skill.id]||0)-dt);
      if(this.cooldowns[skill.id]<=1e-9)this.cooldowns[skill.id]=this._cast(skill.id,level)?cooldown(skill.id,level):.2;
    }
  }
}
