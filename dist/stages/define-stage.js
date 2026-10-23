import { WORLD_IDS, regionFor } from '../world-definitions.js';
import { bossDefinition } from '../boss-definitions.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
const positive=(value,label)=>{if(!Number.isFinite(value)||value<=0)throw new RangeError(`Invalid stage ${label}`);return value;};

// Trials share the world's authored ground, while their encounter, rewards
// and session identity belong to this independent challenge run.
export function defineStage(source){
  const {id,worldMapId,name,shortName,summary,difficultyLabel}=source;
  const fields=['id','name','shortName','summary','difficultyLabel','worldMapId','arena','exit','boss','reward'];
  if(Object.keys(source).some(key=>!fields.includes(key)))throw new TypeError(`Invalid stage field: ${id}`);
  const worldIndex=WORLD_IDS.indexOf(worldMapId);
  if(worldIndex<0)throw new RangeError(`Unknown stage world map: ${String(worldMapId)}`);
  for(const [key,value] of Object.entries({id,name,shortName,summary,difficultyLabel}))if(typeof value!=='string'||!value.trim())throw new TypeError(`Missing stage ${key}`);
  const world=regionFor(worldIndex),layout=world.authored;
  if(layout?.kind!=='rift-forest')throw new RangeError(`Stage needs an authored world: ${worldMapId}`);
  const arena={...source.arena},exit={...source.exit},boss={...source.boss},reward={...source.reward};
  if(!layout.areas.some(area=>area.id===arena.areaId))throw new RangeError(`Unknown stage arena: ${id}`);
  for(const [label,point] of Object.entries({arena,exit})){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<layout.bounds.minX||point.x>layout.bounds.maxX||point.y<layout.bounds.minY||point.y>layout.bounds.maxY)throw new RangeError(`Invalid stage ${label}: ${id}`);
  }
  if(Math.hypot(arena.x-exit.x,arena.y-exit.y)<150)throw new RangeError(`Stage exit overlaps arena: ${id}`);
  bossDefinition(boss.kind);
  for(const key of ['index','hp','easyHp','damage','speed','xp'])positive(boss[key],`${id} boss ${key}`);
  if(!Number.isInteger(boss.index)||boss.easyHp>boss.hp)throw new RangeError(`Invalid stage boss difficulty: ${id}`);
  for(const key of ['gold','crystals'])if(!Number.isSafeInteger(reward[key])||reward[key]<0)throw new RangeError(`Invalid stage reward: ${key}`);
  return freeze({...source,arena,exit,boss,reward,worldIndex,seed:world.seed??worldIndex,mapId:`${id}:challenge`,sceneName:`${world.name} · ${name}`,color:world.colors.accent,dangerFactor:world.danger});
}
