import { companionDefinition } from './companion-catalog.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function armyPanelHTML(game){
  const team=game?.companions,members=team?.members||[],fee=team?.upkeep??members.reduce((sum,m)=>sum+(m.state==='recovering'?0:companionDefinition(m.kind)?.upkeep||0),0);
  const now=game?.runTime??game?.time??0;
  const notice=team?.graceUntil?`维持费不足：还需 ${team.unpaidCost||fee} 金币，请在 ${Math.max(0,Math.ceil(team.graceUntil-now))} 秒内补足。`:`每 30 秒共 ${fee} 金币 · 小狗与猫头鹰维持费较低`;
  const cards=members.map(member=>{
    const def=companionDefinition(member.kind),recovering=member.state==='recovering';
    const state=recovering?(member.recovery>0?`休整中 · ${Math.ceil(member.recovery)} 秒`:`待救治 · 需 ${def?.recoveryCost||0} 金币`):member.cue||'同行中';
    return `<article class="character-card army-member" style="--companion-color:${escape(def?.color||'#b9d5ab')}"><div class="army-member-head"><h3>${escape(member.name)}</h3><span class="army-state">${escape(state)}</span></div><p class="character-meta">${escape(def?.role||'冒险伙伴')} · ${escape(def?.skill||'协同冒险')}</p><dl class="character-grid"><div class="character-stat"><dt>生命</dt><dd>${Math.ceil(member.hp||0)} / ${Math.ceil(member.maxHp||0)}</dd></div><div class="character-stat"><dt>维持费</dt><dd>${recovering?'恢复期间免除':`${def?.upkeep||0} 金币 / 30 秒`}</dd></div><div class="character-stat"><dt>重伤救治</dt><dd>${def?.recoveryCost||0} 金币 / 次</dd></div></dl><button class="secondary-button army-dismiss" type="button" data-dismiss-companion="${escape(member.id)}" ${game?.status!=='playing'?'disabled':''}>遣散 ${escape(member.name)}</button></article>`;
  }).join('');
  return `<p class="character-summary">${members.length} / 5 位伙伴 · 每种一位 · 自动跟随与协作</p><p class="character-meta army-wage-note">${escape(notice)}</p>`+(cards||'<p class="character-empty">在荒野中营救旅人、结识小狗，或唤醒沉睡的岩灵。</p>')+'<p class="character-meta">重伤休整 15 秒后自动支付救治费，恢复 65% 生命；金币不足则等待，期间免维持费。暂停时不会扣费；遣散后需重新寻找招募机会。</p>';
}
