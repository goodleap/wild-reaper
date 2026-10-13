// Screen-space foot offsets remain in terrain.js. These bands describe which
// solid volumes intersect movement and attacks, independently of sprite depth.
const LOW_CREST=32;
const ROCK_CREST=[49/36,24/36,61/36,7/36,44/36];
const RUINS_CREST=[28.6/30,17/30,44/30,7/36,21/30];
const WORLD_ROCK_CREST=[46/36,28/36,58/36,39/36,42/36];

export function isGrounded(entity){
  return !!entity&&entity.flying!==true&&entity.type!=='bat'&&entity.type!=='angel'&&entity.kind!=='angel'&&entity.townKind!=='angel';
}

export function movementProfile(entity){return entity&&!isGrounded(entity)?'air':'ground';}

export function obstacleHeight(obstacle){
  if(obstacle?.heightBand==='low'||obstacle?.heightBand==='high')return obstacle.heightBand;
  if(!obstacle)return 'high';
  // Collision capsules also represent foundations, closed gates and room
  // walls. Their geometric type must not make them behave like fallen logs.
  if(obstacle.structureId||obstacle.structureType||obstacle.type==='tree'||obstacle.variant==='pillar'||['world-building','world-ridge'].includes(obstacle.variant)||/-(wall|gate)$/.test(obstacle.variant||''))return 'high';
  if(obstacle.type==='log')return 'low';
  if(obstacle.type==='rock'){
    const form=Number.isInteger(obstacle.rockForm)&&obstacle.rockForm>=0&&obstacle.rockForm<5?obstacle.rockForm:0;
    const radius=Number.isFinite(obstacle.r)?obstacle.r:36*(obstacle.scale||1);
    // Fragment height is the visible side depth, not the wide scattered
    // footprint. Solid forms use their painted crest above the root anchor.
    const crest=(obstacle.variant?.startsWith('world-')?WORLD_ROCK_CREST:obstacle.variant==='slab'?RUINS_CREST:ROCK_CREST)[form]*radius;
    return crest<=LOW_CREST?'low':'high';
  }
  return 'high';
}

export function blocksObstacle(obstacle,profile='ground'){
  if(profile==='overhead')return false;
  if(profile==='air'||profile==='projectile'||profile==='sight')return obstacleHeight(obstacle)==='high';
  return true;
}
