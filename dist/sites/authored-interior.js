import { getConfigSection } from '../content-config.js';
import { Terrain, groundOffset } from '../terrain.js';
import { initBoss } from '../bosses.js';
import { enemyDefinition } from '../enemy-definitions.js';
import { castleProfileFor } from '../interior-profiles.js';
import { featureForSite } from '../world-sites.js';
import { interiorPropFootprint } from '../interior-prop-geometry.js';
import { seedFor, randomFor } from './interior-seed.js';

const combatRules=getConfigSection('sites').castleCombat;
const FURNITURE=new Set(['barrel','cargo','table','shelf','rug']);

function capsule(site,layout,id,ax,ay,bx,by,extra={}){
  const dx=bx-ax,dy=by-ay,y=(ay+by)*.5;
  return {id,type:'log',variant:'castle-wall',structureType:'castle-wall',structureId:site.id,
    authoredStyle:layout.style,x:(ax+bx)*.5,y,r:layout.wallRadius,halfLength:Math.hypot(dx,dy)*.5,
    angle:Math.atan2(dy,dx),sortY:y,...extra};
}

export function createAuthoredInterior(dungeon,site,key){
  const layout=getConfigSection('geography').interiors.authoredLayouts[key];
  if(!layout)throw new RangeError(`Unknown authored interior: ${key}`);
  const profile=castleProfileFor(site),feature=featureForSite(site);
  const seed=seedFor(`${dungeon.game.regionIndex}:${site.id}:${site.seed??0}`),random=randomFor(seed);
  const cells=layout.cells.map(cell=>({...cell,bounds:{...cell.bounds},neighbors:[...cell.neighbors],open:[]}));
  const state={id:site.id,kind:layout.style==='cave'?'cave':'castle',name:layout.name,featureId:feature?.id,
    treasureName:profile.treasureName,site,seed,authored:true,authoredLayout:layout,
    cols:0,rows:0,cellSize:360,originX:layout.bounds.minX,originY:layout.bounds.minY,cells,
    visited:new Set([layout.entranceCell]),entranceId:layout.entranceCell,
    entrance:{...layout.entrance},landing:{...layout.landing},bounds:{...layout.bounds},
    bossDefeated:false,rewardClaimed:false,rewardPending:false,enemies:[],gems:[],coins:[],
    rooms:new Map(),adventure:null,createdAt:dungeon.game.time,mainRoute:[...layout.mainRoute],
    bossRoom:cells[layout.boss.cellId]};
  state.treasure={id:`${site.id}:treasury`,...layout.treasure,r:27,state:'locked'};
  state.chests=layout.chests.map(chest=>({...chest,id:`${site.id}:chest:${chest.id}`,r:21,state:'closed'}));
  state.mechanisms=layout.mechanisms.map(mechanism=>({...mechanism,id:`${site.id}:${mechanism.id}`,
    gateId:`${site.id}:${mechanism.gateId}`,closedLink:[...mechanism.closedLink],opened:false}));
  state.props=layout.props.map(prop=>({...prop,id:`${site.id}:prop:${prop.id}`,seed:random(),sortY:prop.y,isHutFurniture:FURNITURE.has(prop.type)}));
  const walls=[];
  for(const polygon of layout.floorPolygons)for(const ring of [polygon.outer,...polygon.holes])for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    // Short wall pieces preserve actor depth ordering along long north/south edges.
    const pieces=Math.max(1,Math.ceil(length/160));
    for(let n=0;n<pieces;n++){
      const t=n/pieces,u=(n+1)/pieces;
      walls.push(capsule(site,layout,`${site.id}:wall:${walls.length}`,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
        a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,{seed:random()}));
    }
  }
  state.walls=walls;
  state.gates=state.mechanisms.map(mechanism=>{
    const {ax,ay,bx,by}=mechanism.gate;
    return capsule(site,layout,mechanism.gateId,ax,ay,bx,by,{mechanismId:mechanism.id,isInteriorGate:true,seed:random()});
  });
  const props=state.props.filter(prop=>prop.collision!==false).map(prop=>({...prop,...interiorPropFootprint(prop),visual:false}));
  state.terrain=new Terrain({obstacles:[...walls,...props],region:layout.terrain,seed});
  for(const mechanism of state.mechanisms)state.terrain.setStructures(state.gates.filter(gate=>gate.mechanismId===mechanism.id),`interior:${mechanism.id}`);
  const distances=new Map([[state.entranceId,0]]),queue=[state.entranceId];
  for(let i=0;i<queue.length;i++)for(const next of cells[queue[i]].neighbors){
    if(state.mechanisms.some(mechanism=>mechanism.closedLink.includes(queue[i])&&mechanism.closedLink.includes(next)))continue;
    if(!distances.has(next)){distances.set(next,distances.get(queue[i])+1);queue.push(next);}
  }
  state.distances=distances;
  return state;
}

export function populateAuthoredInterior(dungeon,state){
  const g=dungeon.game,layout=state.authoredLayout,profile=castleProfileFor(state.site);
  const difficulty=1+Math.min(combatRules.difficultyCap,state.createdAt/combatRules.difficultyPeriod)*combatRules.difficultyGrowth;
  const place=(enemy,cellId,x,y)=>{
    enemy.dungeonId=state.id;enemy.dungeonRoom=cellId;enemy.dungeonHome={x,y};enemy.guardActive=false;
    enemy.x=x;enemy.y=y-groundOffset(enemy);enemy._navTimer=0;g._moveEntity(enemy,0,0);
  };
  for(const group of layout.groups){
    state.rooms.set(group.cellId,{cellId:group.cellId,kind:state.chests.some(chest=>chest.cellId===group.cellId)?'treasure':'battle',
      total:group.enemies.length,started:false,cleared:false,rewarded:false,heal:group.heal});
    for(const spec of group.enemies){
      const enemy=g._spawnEnemy(spec.type,1);
      enemy.hp*=combatRules.guardHp*(profile.guardHp||1);enemy.maxHp=enemy.hp;
      enemy.xp=Math.max(combatRules.minGuardXp,Math.min(combatRules.maxGuardXp,Math.round(enemy.xp*combatRules.guardXpMultiplier)));
      place(enemy,group.cellId,spec.x,spec.y);
    }
  }
  const spec=layout.boss;
  state.rooms.set(spec.cellId,{cellId:spec.cellId,kind:'boss',total:1,started:false,cleared:false,rewarded:false,heal:false});
  const boss=g._spawnEnemy('boss',1);boss.dungeonBoss=true;boss.name=spec.name;boss.bossIndex=spec.bossIndex;initBoss(boss);
  boss.hp=boss.maxHp=(g.easy?combatRules.boss.hp.easy:combatRules.boss.hp.normal)*difficulty*(profile.bossHp||1);
  boss.damage=(g.easy?combatRules.boss.damage.easy:combatRules.boss.damage.normal)*(1+state.createdAt/combatRules.boss.damageGrowthPeriod);
  boss.speed=enemyDefinition('boss').baseSpeed*(g.easy?combatRules.boss.speedMultiplier.easy:combatRules.boss.speedMultiplier.normal);
  boss.xp=combatRules.boss.xp+Math.floor(state.createdAt/combatRules.boss.xpGrowthPeriod);
  place(boss,spec.cellId,spec.x,spec.y);state.bossId=boss.id;state.enemies=g.enemies;
}
