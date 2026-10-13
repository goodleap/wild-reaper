import { COMBAT_REFERENCE_ATTACK, CHARACTER_DEFENSE_PER_LEVEL, resolveCharacterStats, weaponStats, skillStats, scalePlayerDamage, upgradeEffectTotal, defenseReduction } from './combat-stats.js';
import { UPGRADE_DEFS, ENDLESS_UPGRADES } from './combat-catalog.js';
import { getSuperSkillStats } from './super-skills.js';
import { RELICS, RELIC_RULES } from './relics.js';
import { STATUS_RULES } from './combat-status.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number.isFinite(value)?String(Math.round(value*100)/100):value===Infinity?'∞':'—';
const seconds=value=>`${number(Math.max(0,value))} 秒`;
const percent=value=>`${number(value*100)}%`;
const bonus=value=>`${value>=0?'+':''}${percent(value)}`;
const grid=rows=>`<dl class="character-grid">${rows.map(([label,value,id])=>`<div class="character-stat"${id?` data-stat="${escape(id)}"`:''}><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
const tags=values=>values.length?`<div class="character-tags">${values.filter(Boolean).map(value=>`<span class="character-tag">${escape(value)}</span>`).join('')}</div>`:'';
const section=(title,html)=>`<section class="character-section"><h3>${escape(title)}</h3>${html}</section>`;
const sources=(title,values)=>values.length?`<details class="character-source"><summary>${escape(title)}</summary><ul>${values.map(value=>`<li>${escape(value)}</li>`).join('')}</ul></details>`:'';
const summary=text=>`<p class="character-summary">${escape(text)}</p>`;
const empty=text=>`<p class="character-empty">${escape(text)}</p>`;
const card=(title,body,{id='',meta='',extra='',classes=''}={})=>`<article class="character-card${classes?` ${escape(classes)}`:''}"${id?` data-capability-id="${escape(id)}"`:''}><div class="character-card-head"><h3>${escape(title)}</h3>${extra}</div>${meta?`<p class="character-meta">${escape(meta)}</p>`:''}${body}</article>`;

function movement(game,stats) {
  const modifier=game.environment?.movementMultiplier?.(game.player,true)??1;
  return {modifier,speed:stats.moveSpeed*modifier};
}
function attributes(game) {
  const p=game.player,s=resolveCharacterStats(game),move=movement(game,s);
  const magnet=game.adventure?.magnetRange?.(s.magnet)??s.magnet;
  const rank=id=>game.build.getRank(id);
  const attackSources=[`初始攻击 ${COMBAT_REFERENCE_ATTACK}`];
  if(p.level>1)attackSources.push(`角色等级 Lv.${p.level}：攻击加成 ${bonus((p.level-1)*.01)}`);
  for(const id of ['power','endlessPower'])if(rank(id))attackSources.push(`${id==='power'?'锋芒':'百炼锋芒'}：攻击加成 ${bonus(upgradeEffectTotal(game,id,'damageBonus'))}`);
  if(game.rescuePower>0)attackSources.push(`营救援助 ×${game.rescuePower}：攻击加成 ${bonus(game.rescuePower*.08)}`);
  if(game.adventure?.furyTime>0)attackSources.push(`狂暴：伤害 ×${number(game.adventure.damageMultiplier())}`);
  if((game.relics?.damageMultiplier?.()??1)!==1)attackSources.push(`赤心：伤害 ×${number(game.relics.damageMultiplier())}`);
  const otherSources=[`初始最大生命 ${number(p.baseMaxHp??s.maxHp)} · 初始移速 ${number(game.hero.baseSpeed)}`];
  if(game.build.attributes.defense>0)otherSources.push(`基础防御 +${number(game.build.attributes.defense)}`);
  if(p.level>1)otherSources.push(`角色等级：最大生命 +${number((p.level-1)*2)} · 防御 +${number((p.level-1)*CHARACTER_DEFENSE_PER_LEVEL)}`);
  for(const def of [...UPGRADE_DEFS,...ENDLESS_UPGRADES])if(def.category==='attribute'&&rank(def.id)&&!['power','endlessPower'].includes(def.id)) {
    const effects=[];
    for(const [stat,label,format] of [['maxHealth','最大生命',value=>`+${number(value)}`],['defense','防御',value=>`+${number(value)}`],['healthRegen','每秒回复',value=>`+${number(value)}`],['moveSpeedBonus','移动速度',bonus],['pickupRangeBonus','拾取范围',bonus]]) {
      const amount=upgradeEffectTotal(game,def.id,stat);if(amount)effects.push(`${label} ${format(amount)}`);
    }
    otherSources.push(`${def.name} ×${rank(def.id)}${effects.length?'：'+effects.join(' · '):''}`);
  }
  if(game.relics?.has?.('swiftFeather'))otherSources.push(`风羽：移速 ${bonus(RELIC_RULES.movement-1)}`);
  if(game.debug)otherSources.push('调试模式：移动速度 ×3，天雷无冷却');
  if(move.modifier!==1)otherSources.push(`当前位置地形：移动速度 ×${number(move.modifier)}`);
  if(game.adventure?.magnetTime>0)otherSources.push(`磁力涌动：当前拾取范围 ${number(magnet)}`);
  return summary('展示当前生效属性；武器和技能页展示各自的攻击数值。')+
    grid([
      ['角色等级',`Lv.${p.level}`,'level'],['生命',`${number(s.currentHp)} / ${number(s.maxHp)}`,'health'],
      ['角色攻击',number(s.attack),'attack'],['额外伤害增益',bonus(s.externalDamageMultiplier-1),'damageBonus'],
      ['防御',number(s.defense),'defense'],['受击减伤',percent(defenseReduction(s.defense)),'damageReduction'],
      ['当前移速',number(move.speed),'moveSpeed'],['自身回复',`${number(s.regen)} / 秒`,'regen'],
      ['拾取范围',number(magnet),'magnet'],['金币',number(game.gold),'gold'],
      ['角色经验',`${number(p.xp)} / ${number(p.xpNext)}`,'experience'],['灵晶进度',`${number(game.crystals)} / ${number(game.crystalsNext)}`,'crystals'],
      ['灵晶强化',`${Math.max(0,game.progressionTier-1)} 次`,'upgrades']
    ])+sources('攻击与伤害来源',attackSources)+sources('防御、生命与其他来源',otherSources);
}
function enhancements(item) {
  return tags((item.enhancements||[]).filter(value=>value.rank>0).map(value=>`${value.name} ×${value.rank}`));
}
function ownership(item,kind) {
  return [`${kind} · Lv.${item.level}`,item.branchName&&`分支：${item.branchName}`,item.evolved&&'已进化'].filter(Boolean).join(' · ');
}
function weapons(game) {
  const items=game.build.getWeaponLoadout(),equipped=items.filter(item=>item.equipped).length;
  return summary('伤害已计入角色攻击与当前增益。卸下后保留强化，至少装备一件武器。')+items.map(item=>{
    const s=weaponStats(game,item.id),rows=[],notes=[];
    if(!s)return '';
    if(item.id==='arrow') {
      rows.push(['主箭伤害',number(s.damage),'damage'],['攻击间隔',seconds(s.interval),'interval'],['索敌范围',number(s.range),'range'],['每轮箭数',number(s.count),'count']);
      notes.push('远程攻击，单箭命中数量有限');
      if(s.count>1){rows.push(['副箭伤害',number(s.damage*s.sideDamageMultiplier),'secondaryDamage']);notes.push(`同轮对同一目标累计最多造成主箭伤害的 ${percent(s.volleyTargetMultiplier)}`);}
      if(item.branch)rows.push(['最多命中',`${s.targetLimit} 个`,'targetLimit'],['每段伤害保留',percent(s.retention),'retention']);
      if(item.branch==='ricochet')rows.push(['弹射次数',number(s.maxBounces),'bounces'],['弹射范围','150','chainRange']);
      if(s.runic){rows.push(['符文穿击伤害',number(s.runicDamage),'runicDamage'],['符文触发间隔',seconds(s.runicInterval),'runicInterval']);notes.push('符文穿击：飞矢专属能力，自动贯穿沿途敌人；卸下飞矢时停用');}
    }else if(item.id==='sword') {
      rows.push(['挥砍伤害',number(s.damage),'damage'],['攻击间隔',seconds(s.interval),'interval'],[s.energyRank?'攻击覆盖距离':'挥砍距离',number(s.range),'range'],['挥砍角度',`${number(s.arc*180/Math.PI)}°`,'arc']);
      notes.push('近身定向爆发；自动朝敌人挥砍，移动方向不限制攻击方向');
      if(s.energyRank){rows.push(['剑气等级',`${s.energyRank} / 3`,'swordEnergyRank'],['剑气伤害增幅',bonus(s.energyBonus),'swordEnergyBonus']);notes.push('剑气随挥剑扩大覆盖，增幅已计入挥砍伤害；卸下长剑时停用');}
      if(item.branch==='heavy')notes.push('重斩集中处理强敌，攻击节奏更慢');
      else if(item.branch==='sweep')notes.push('横扫覆盖更宽的敌群');
    }else if(item.id==='orbit') {
      rows.push(['单次伤害',number(s.damage),'damage'],['同敌命中间隔',seconds(s.hitInterval),'interval'],['刃数',number(s.count),'count'],['环绕半径',item.evolved?`${number(s.radius)}—${number(s.radius+55)}`:number(s.radius),'range'],['旋转一周',seconds(Math.PI*2/s.rotationSpeed),'rotation']);
      notes.push('环绕持续攻击，移动调整与敌人的距离');
      notes.push(`流血：每 ${seconds(STATUS_RULES.bleedInterval)} 造成 ${number(s.bleedDamage)} 伤害，持续 ${seconds(STATUS_RULES.bleedDuration)}；单层刷新`);
      if(item.evolved)notes.push('每 3 秒向外扩张一次');
    }
    const disabled=game.status!=='playing'||(item.equipped&&equipped<=1),action=item.equipped?'卸下':'装备';
    const reason=game.status!=='playing'?'先完成当前奖励选择':disabled?'至少装备一件武器':'本局强化保留';
    const button=`<button type="button" class="character-equip" id="character-equip-${escape(item.id)}" data-weapon-id="${escape(item.id)}" data-equipped="${item.equipped?'true':'false'}" aria-pressed="${item.equipped?'true':'false'}" aria-label="${escape(action+item.name)}" title="${escape(reason)}"${disabled?' disabled':''}>${action}</button>`;
    return card(`${item.icon} ${item.name}`,tags([item.equipped?'已装备':'未装备',item.baseName!==item.name?item.baseName:null])+grid(rows)+enhancements(item)+sources('附加效果',notes),{id:item.id,meta:ownership(item,'自动攻击'),extra:button,classes:item.equipped?'':'unequipped'});
  }).join('');
}
function skills(game) {
  const items=game.build.getSkillLoadout();
  const groups={manual:[],automatic:[],super:[]};
  for(const item of items){
    const s=skillStats(game,item.id)??getSuperSkillStats(item.id,item.baseRank,item.branch),rows=[],notes=[];
    if(!s)continue;
    const superSkill=item.tier==='super'&&item.id!=='storm';
    const damage=superSkill?scalePlayerDamage(game,s.damage,{skillId:item.id}):s.primaryDamage??s.damage;
    const damageLabel={domain:'每跳伤害',vortex:'每跳伤害',meteor:'每次星陨伤害',swords:'单剑伤害'}[item.id]||'单次伤害';
    if(item.id!=='barrier')rows.push([damageLabel,number(damage),'damage']);
    rows.push(['冷却',seconds(s.cooldown),'cooldown']);
    if(item.id==='barrier') {
      const barrier=game.barrier,state=barrier?.active?'保护中':barrier?.ready?'就绪待命':`恢复中 · ${seconds(barrier?.cooldown??0)}`;
      rows.push(['护盾容量',number(s.capacity),'capacity'],['最长持续',seconds(s.duration),'duration'],['当前状态',state,'barrierState']);
      if(barrier?.active)rows.push(['剩余护盾',number(barrier.remaining),'remainingShield'],['剩余持续',seconds(barrier.life),'remainingDuration']);
      notes.push('受到伤害时自动展开，触发的第一击也受保护；伤害先经防御减免，再消耗护盾');
      if(game.relics?.has?.('leafWard'))notes.push('铁叶护符增幅已计入护盾容量与冷却');
    }else if(item.id==='storm') {
      rows.push(['剩余冷却',seconds(game.player.skillCooldown),'remainingCooldown'],['攻击范围','屏内可攻击目标','range']);
      notes.push(`感电持续 ${seconds(STATUS_RULES.shockDuration)}；武器命中可触发传导`);
    }else if(item.id==='pulse') {
      rows.push(['冲击半径',number(s.radius),'range'],['击退强度',number(s.knockback),'knockback']);
      notes.push('有可攻击地面敌人靠近时施放；消耗流血时伤害增加 25%');
      if(s.echo)rows.push(['追加回波伤害',number(s.damage*.6),'echoDamage'],['回波半径',number(s.radius*1.2),'echoRange']);
      if(s.control)notes.push('普通敌人减速 35%，持续 1.1 秒');
    }else if(item.id==='lightning') {
      rows.push(['索敌范围',number(s.range),'range'],['最多目标',number(s.focus?1:s.targetLimit),'targetLimit']);
      if(!s.focus)rows.push(['跳跃范围',number(s.chainRange),'chainRange']);
      if(!s.focus&&s.targetLimit>3)rows.push(['后续连锁伤害',number(s.damage*s.chainRetention),'secondaryDamage']);
      notes.push(s.focus?'优先攻击 Boss 与高生命目标':`附加 ${seconds(STATUS_RULES.shockDuration)} 感电`);
    }else {
      rows.push(['索敌范围',number(s.range??420),'range']);
      if(s.radius)rows.push(['作用半径',number(s.radius),'radius']);
      if(s.impactDamage)rows.push(['初次爆发伤害',number(scalePlayerDamage(game,s.impactDamage,{skillId:item.id})),'impactDamage']);
      if(s.duration)rows.push(['持续时间',seconds(s.duration),'duration']);
      if(s.interval)rows.push([item.id==='swords'?'出剑间隔':'伤害间隔',seconds(s.interval),'interval']);
      if(s.count)rows.push([{meteor:'每轮星陨',swords:'每轮灵剑'}[item.id]||'数量',number(s.count),'count']);
      if(s.root)notes.push(`每次伤害束缚普通地面敌人 ${seconds(s.root)}，强敌受到减速`);
      if(item.id==='domain'&&s.slow)notes.push(`领域减速 ${percent(s.slow)}`);
      if(item.id==='domain'&&s.linger)notes.push(`离开后侵蚀持续 ${seconds(s.linger)}`);
      if(s.pull)notes.push('持续牵引普通敌人，Boss 不受牵引');
    }
    if(item.id==='storm'||item.id==='lightning')notes.push(`感电传导伤害 ${number(scalePlayerDamage(game,STATUS_RULES.conductionDamage,{skillId:item.id}))}，范围 ${STATUS_RULES.conductionRange}`);
    const kind=`${item.activation==='manual'?'手动':'自动'}${item.tier==='super'?' · 超级技能':'技能'}`;
    groups[item.activation==='manual'?'manual':item.tier==='super'?'super':'automatic'].push(card(`${item.icon} ${item.name}`,tags(item.baseName!==item.name?[item.baseName]:[])+grid(rows)+enhancements(item)+sources('附加效果',notes),{id:item.id,meta:ownership(item,kind)}));
  }
  return summary('伤害已计入角色攻击与当前增益；防护自动触发，不增加操作。')+(items.length?Object.entries(groups).filter(([,cards])=>cards.length).map(([id,cards])=>section({manual:'手动技能',automatic:'自动技能',super:'自动超级技能'}[id],cards.join(''))).join(''):empty('尚未掌握技能。'));
}
function status(game) {
  const active=[],adventure=game.adventure,stats=resolveCharacterStats(game),move=movement(game,stats),relics=game.relics;
  if(adventure?.furyTime>0)active.push(card('狂暴',grid([['剩余时间',seconds(adventure.furyTime)],['伤害加成',bonus(adventure.damageMultiplier()-1)],['飞矢攻速',bonus(adventure.fireRateMultiplier()-1)]]),{meta:'来源：狂暴补给'}));
  if(adventure?.magnetTime>0)active.push(card('磁力涌动',grid([['剩余时间',seconds(adventure.magnetTime)],['当前拾取范围',number(adventure.magnetRange(stats.magnet))]]),{meta:'来源：磁力补给'}));
  if((relics?.damageMultiplier?.()??1)>1)active.push(card('赤心增幅',grid([['伤害加成',bonus(relics.damageMultiplier()-1)]]),{meta:'来源：赤心 · 当前生命低于 40%'}));
  if(move.modifier<1)active.push(card('地形减速',grid([['当前移速',number(move.speed)],['地形速度系数',`${number(move.modifier)} 倍`]]),{meta:'离开影响区域后恢复'}));
  if(relics?.wardAmount>0)active.push(card('守护护罩',grid([['可抵消伤害',number(relics.wardAmount)]]),{meta:'下一次受击时消耗'}));
  if(game.barrier?.active)active.push(card('守护屏障',grid([['剩余护盾',number(game.barrier.remaining)],['剩余持续',seconds(game.barrier.life)]]),{meta:'自动防护 · 与技能共用同一护盾'}));
  const ally=game.companions?.active;
  const helper=ally?card(ally.name,grid([['助战剩余',seconds(ally.remaining)],['助战技能',ally.kind==='warden'?'高级地震':'高级雷电']]),{meta:'解救的伙伴'}):empty('当前没有同行伙伴。');
  const permanent=game.rescuePower>0?card('营救援助',grid([['累计援助',`${game.rescuePower} 次`],['角色攻击加成',bonus(game.rescuePower*.08)]]),{meta:'本局持续生效，已计入角色攻击'}):'';
  const owned=(relics?.owned||[]).map(id=>RELICS.find(item=>item.id===id)).filter(Boolean);
  const relicHTML=owned.map(relic=>{
    let description=relic.desc;
    // The inherited item copy says weapons; its runtime multiplier also applies
    // to independent player skills. Keep the inspector truthful to combat.
    if(relic.id==='bloodstone')description='生命低于 40% 时，角色伤害提升 25%';
    if(relic.id==='herbalEcho')description=`药草实际治疗后释放冲击波：当前伤害 ${number(scalePlayerDamage(game,RELIC_RULES.herbDamage))}，范围 ${RELIC_RULES.herbRadius}`;
    return card(`${relic.icon} ${relic.name}`,`<p class="character-meta">${escape(description)}</p>`,{id:relic.id});
  }).join('');
  return section('当前状态',active.join('')||empty('当前没有临时增益或减益。'))+section('助战与援助',helper+permanent)+section('本局遗物',relicHTML||empty('尚未获得遗物。'));
}

// Rendering is read-only. Opening a panel must never advance timers, awaken a
// target, refresh a reward, or change a weapon's state.
export function characterPanelHTML(game,tab='attributes') {
  if(!game?.player||!game.build)return empty('开始冒险后查看角色详情。');
  switch(tab){case 'weapons':return weapons(game);case 'skills':return skills(game);case 'status':return status(game);default:return attributes(game);}
}
export function characterPanelTitle(game) {
  return game?.player?`${game.hero?.name||'旅人'} · Lv.${game.player.level}`:'角色详情';
}
