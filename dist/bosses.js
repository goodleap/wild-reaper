import { bossDefinition, bossKindFor } from './boss-definitions.js';
import { updateAncientBoss, resolveAncientBoss } from './bosses/ancient.js';
import { initBloomBoss, clearBloomBossAttacks, updateBloomBoss, resolveBloomBoss } from './bosses/bloom.js';

export { ANCIENT_BOSS, BLOOM_BOSS, BOSS_DEFS, BOSS_ROTATION, bossDefinition, bossKindFor } from './boss-definitions.js';
export { updateBloomBoss, resolveBloomBoss } from './bosses/bloom.js';

// Registration is static. Adding a new pattern does not alter Game's update
// loop or another boss's implementation.
export const BOSS_BEHAVIORS=Object.freeze({
  ancient:Object.freeze({update:updateAncientBoss,resolve:resolveAncientBoss,phase:'slam'}),
  bloom:Object.freeze({initialize:initBloomBoss,update:updateBloomBoss,resolve:resolveBloomBoss,clear:clearBloomBossAttacks,phase:'ranged'})
});
export function bossBehavior(kind){
  const id=bossDefinition(kind).behavior;
  if(!Object.hasOwn(BOSS_BEHAVIORS,id))throw new RangeError(`Unknown boss behavior: ${String(id)}`);
  return BOSS_BEHAVIORS[id];
}
export function initBoss(enemy,kind=null) {
  if(enemy.type!=='boss')return enemy;
  enemy.bossKind=kind==null?bossKindFor(enemy.bossIndex):bossDefinition(kind).id;
  bossBehavior(enemy.bossKind).initialize?.(enemy);
  return enemy;
}
export function updateBoss(game,enemy,dt){
  return bossBehavior(enemy.bossKind||'ancient').update(game,enemy,dt);
}
export function resolveBossPhase(game,phase){
  for(const enemy of game.enemies)if(enemy.type==='boss'){
    const behavior=bossBehavior(enemy.bossKind||'ancient');
    if(behavior.phase===phase)behavior.resolve?.(game,enemy);
  }
}
// A slam is already-authored transient state. Keep resolving it independently
// of the selected pattern, exactly as before, including direct QA fixtures.
export function resolveBossSlams(game){
  for(const enemy of game.enemies)if(enemy.type==='boss'){
    const behavior=bossBehavior(enemy.bossKind||'ancient');
    if(behavior.phase==='slam')behavior.resolve?.(game,enemy);
    else if(enemy.slam)resolveAncientBoss(game,enemy);
  }
}
export function clearBossAttacks(enemy){
  const clear=enemy.type==='boss'?bossBehavior(enemy.bossKind||'ancient').clear:null;
  clear?.(enemy);
  if(clear!==clearBloomBossAttacks)clearBloomBossAttacks(enemy);
}
