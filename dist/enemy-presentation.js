import { ENEMY_ART } from './enemy-art/registry.js';

// The order preserves established ground-warning and HUD priority. Each Boss
// owns its painting, labels and sound definitions beside its sprite module.
const bosses=Object.freeze(Object.values(ENEMY_ART).filter(art=>art.phaseLabel||art.ground||art.notice||art.sounds));
const groundArt=Object.freeze(bosses.filter(art=>art.ground).sort((a,b)=>a.groundOrder-b.groundOrder));
const sounds=Object.freeze(Object.assign({},...bosses.map(art=>art.sounds||{})));
export function drawBossGround(ctx,enemies,visible,helpers){
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=0;i<groundArt.length;i++){
    if(i)ctx.globalAlpha=1;
    for(const enemy of enemies)if(visible(enemy))groundArt[i].ground(ctx,enemy,helpers);
  }
  ctx.restore();
}
export function bossPhaseLabel(enemies,visible){
  for(const art of bosses)for(const enemy of enemies){const label=art.phaseLabel?.(enemy);if(label&&visible(enemy))return label;}
  return null;
}
export function bossWarning(events,boss){for(const art of bosses){const message=art.notice?.(events,boss);if(message)return message;}return null;}
export function bossWindingUp(enemy){return bosses.some(art=>art.windingUp?art.windingUp(enemy):!!art.phaseLabel?.(enemy));}
export function bossSound(eventType){return sounds[eventType]||null;}
