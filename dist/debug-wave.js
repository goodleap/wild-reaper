import { ENEMY_IDS } from './enemy-definitions.js';

export const DEBUG_MONSTER_TYPES=Object.freeze(ENEMY_IDS.filter(type=>type!=='boss'));
export const DEBUG_MONSTER_RULES=Object.freeze({interval:.2,batchSize:16,initialCount:64,maxEnemies:320});

// Use the current viewport on every batch, including after a resize or a world
// transition. Failed coastal sides try other sides, never an on-screen fallback.
export function updateDebugMonsterStream(game,dt) {
  if(game.debug!==true||game.debugOptions?.allMonsters!==true||game.status!=='playing'||game.dungeon?.active||game.sceneTransition?.active||!(dt>0))return [];
  const state=game._debugMonsterStream??={remaining:0,cursor:0,started:false};
  state.remaining-=dt;
  if(state.remaining>1e-9)return [];
  state.remaining=DEBUG_MONSTER_RULES.interval;
  const count=state.started?DEBUG_MONSTER_RULES.batchSize:DEBUG_MONSTER_RULES.initialCount;
  state.started=true;
  const spawned=[];
  let available=DEBUG_MONSTER_RULES.maxEnemies-game.enemies.filter(enemy=>enemy.hp>0).length;
  for(let i=0;i<count&&available>0;i++) {
    const cursor=state.cursor++,type=DEBUG_MONSTER_TYPES[cursor%DEBUG_MONSTER_TYPES.length];
    const side=(cursor+Math.floor(cursor/DEBUG_MONSTER_TYPES.length))%4;
    const along=((Math.floor(cursor/4)%8)-3.5)/4.5;
    const edgeDirections=[[1,along],[along,1],[-1,along],[along,-1]];
    let point=null;
    for(let offset=0;offset<4&&!point;offset++) {
      const [x,y]=edgeDirections[(side+offset)%4];
      const angle=Math.atan2(y*Math.max(1,game.viewHeight),x*Math.max(1,game.viewWidth));
      point=game._findSpawnPoint(type,angle);
    }
    if(!point)continue;
    const enemy=game._spawnEnemy(type,1);
    enemy.x=point.x;enemy.y=point.y;enemy.debugMonster=true;
    spawned.push(enemy);available--;
  }
  return spawned;
}
