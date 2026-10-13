import { ACTOR_VISUALS } from './actor-visuals.js';

export const DAMAGE_NUMBERS=Object.freeze({fontSize:14,life:.72,globalLimit:48,targetLimit:6,mergeWindow:.12});
const LANES=Object.freeze([
  Object.freeze({side:0,lift:0}),Object.freeze({side:-1,lift:8}),Object.freeze({side:1,lift:8}),
  Object.freeze({side:0,lift:25}),Object.freeze({side:-1,lift:33}),Object.freeze({side:1,lift:33})
]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Body art, names and damage share one envelope. Collision radius alone is
// too low for the dummy's label, tall mushrooms and the boss's crown.
export function damageNumberAnchor(enemy) {
  const shape=ACTOR_VISUALS[enemy.type]||ACTOR_VISUALS.slime;
  const scale=(enemy.r||shape.radius)/shape.radius;
  const labelRoom=enemy.affix||enemy.rescueId?32:enemy.trainingDummy||enemy.type==='boss'||enemy.name?26:enemy.elite?24:12;
  return {x:enemy.x,y:enemy.y-shape.top*scale-labelRoom};
}

// The effect list is already bounded by the engine. One bounded scan per hit
// avoids a persistent target registry and any per-frame text collision pass.
// Only true bleed ticks merge; consecutive weapon hits remain separate.
export function emitDamageNumber(game,enemy,amount,source='raw') {
  if(!enemy||!Number.isFinite(amount)||amount<=0||game.status!=='playing')return null;
  const effects=game.effects,time=game._clock||0;
  let globalCount=0,targetCount=0,oldest=-1,oldestTarget=-1,merge=null;
  for(let i=0;i<effects.length;i++) {
    const effect=effects[i];
    if(effect.type!=='damage'||effect.life<=0)continue;
    globalCount++;if(oldest<0)oldest=i;
    if(effect.damageTarget!==enemy)continue;
    targetCount++;if(oldestTarget<0)oldestTarget=i;
    if(source==='bleed'&&effect.damageSource===source&&time-effect.damageBornAt>=0&&time-effect.damageBornAt<=DAMAGE_NUMBERS.mergeWindow)merge=effect;
  }
  if(merge) {
    merge.damageAmount+=amount;merge.text=String(Math.round(merge.damageAmount));
    return merge;
  }
  // Replace only another number. Spawn warnings and other important effects
  // still use the engine's admission policy and cannot be evicted here.
  const remove=targetCount>=DAMAGE_NUMBERS.targetLimit?oldestTarget:globalCount>=DAMAGE_NUMBERS.globalLimit?oldest:-1;
  if(remove>=0)effects.splice(remove,1);
  const sequence=Number.isInteger(enemy._damageNumberSequence)?enemy._damageNumberSequence:0;
  const lane=LANES[sequence%LANES.length],anchor=damageNumberAnchor(enemy);
  const text=String(Math.round(amount)),spacing=clamp(text.length*DAMAGE_NUMBERS.fontSize*.52,24,36);
  enemy._damageNumberSequence=(sequence+1)%LANES.length;
  game._effect(anchor.x+lane.side*spacing,anchor.y-lane.lift,'damage',DAMAGE_NUMBERS.life,0,'#f5e8b8',text,{
    damageTarget:enemy,damageSource:source,damageAmount:amount,damageBornAt:time,damageSide:lane.side,
    // Keep visibility tied to the struck actor, even as the text rises above
    // a castle wall. The existing scene visibility gate remains authoritative.
    groundX:enemy.x,groundY:game.combat?.groundPoint?.(enemy)?.y??enemy.y
  });
  const effect=effects[effects.length-1];
  return effect?.type==='damage'&&effect.damageTarget===enemy&&effect.damageBornAt===time?effect:null;
}

// The simulation already moves text upwards and freezes it when paused.
// Lateral drift, the brief pop and opacity use that same simulation age.
export function drawDamageNumber(ctx,e,{reduced=false}={}) {
  if(e.type!=='damage')return false;
  if(!(e.life>0))return true;
  const age=Math.max(0,e.maxLife-e.life),progress=clamp(age/e.maxLife,0,1);
  const pop=reduced?1:age<.055?.9+.2*(age/.055):age<.14?1.1-.1*((age-.055)/.085):1;
  const alpha=progress<.3?1:clamp((1-progress)/.7,0,1);
  ctx.save();ctx.translate(e.x+(reduced?0:(e.damageSide||0)*6*progress),e.y);ctx.scale(pop,pop);
  ctx.globalAlpha=alpha;ctx.font=`700 ${DAMAGE_NUMBERS.fontSize}px ui-monospace,monospace`;
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';ctx.lineWidth=1.8;
  ctx.shadowBlur=0;ctx.strokeStyle='#17271c';ctx.fillStyle=e.color||'#f5e8b8';
  ctx.strokeText(e.text||'',0,0);ctx.fillText(e.text||'',0,0);ctx.restore();return true;
}
