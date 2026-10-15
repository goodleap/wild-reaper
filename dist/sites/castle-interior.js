import { getConfigSection } from '../content-config.js';
import { castleRoomTypes, cappedEncounterType } from '../encounter-definitions.js';
import { Terrain, groundOffset } from '../terrain.js';
import { initBoss } from '../bosses.js';
import { enemyDefinition } from '../enemy-definitions.js';
import { DUNGEON_RULES, castleProfileFor } from '../interior-profiles.js';
import { featureForSite } from '../world-sites.js';
import { seedFor, randomFor } from './interior-seed.js';
const combatRules=getConfigSection('sites').castleCombat;
const TAU=Math.PI*2;
const DIRS=Object.freeze([{dx:0,dy:-1,opposite:2},{dx:1,dy:0,opposite:3},{dx:0,dy:1,opposite:0},{dx:-1,dy:0,opposite:1}]);

export function createCastleState(dungeon,site){
    const rules=DUNGEON_RULES,feature=featureForSite(site),profile=castleProfileFor(site),{cols,rows,cellSize}=profile;
    const seed=seedFor(`${dungeon.game.regionIndex}:${site.id}:${site.seed??0}`),random=randomFor(seed);
    const originX=-cols*cellSize*.5,originY=-rows*cellSize*.5;
    const cells=Array.from({length:cols*rows},(_,id)=>({id,col:id%cols,row:Math.floor(id/cols),x:originX+(id%cols+.5)*cellSize,y:originY+(Math.floor(id/cols)+.5)*cellSize,open:[]}));
    const entranceId=(rows-1)*cols+Math.floor(cols/2),stack=[cells[entranceId]],seen=new Set([entranceId]);
    // Iterative seeded depth-first carving produces a connected perfect maze.
    while(stack.length){
      const cell=stack[stack.length-1],available=[];
      for(let i=0;i<4;i++){const d=DIRS[i],col=cell.col+d.dx,row=cell.row+d.dy;if(col>=0&&row>=0&&col<cols&&row<rows&&!seen.has(row*cols+col))available.push(i);}
      if(!available.length){stack.pop();continue;}
      const direction=available[Math.floor(random()*available.length)],d=DIRS[direction],next=cells[(cell.row+d.dy)*cols+cell.col+d.dx];
      cell.open.push(direction);next.open.push(d.opposite);seen.add(next.id);stack.push(next);
    }
    const state={id:site.id,kind:'castle',name:profile.name,featureId:feature?.id,treasureName:profile.treasureName,site,seed,cols,rows,cellSize,originX,originY,cells,visited:new Set([entranceId]),entranceId,
      entrance:{x:cells[entranceId].x,y:cells[entranceId].y+55},landing:{x:cells[entranceId].x,y:cells[entranceId].y-30},bounds:{minX:originX,minY:originY,maxX:originX+cols*cellSize,maxY:originY+rows*cellSize},
      bossDefeated:false,rewardClaimed:false,rewardPending:false,enemies:[],gems:[],coins:[],rooms:new Map(),adventure:null,createdAt:dungeon.game.time};
    const distances=new Map([[entranceId,0]]),parents=new Map(),queue=[cells[entranceId]];
    for(let i=0;i<queue.length;i++)for(const next of dungeon._neighbors(queue[i],state))if(!distances.has(next.id)){distances.set(next.id,distances.get(queue[i].id)+1);parents.set(next.id,queue[i].id);queue.push(next);}
    // Keep the finite connected maze, but put its climax on a compact route.
    // The old farthest-cell rule could require 18+ mostly empty room crossings.
    const bossDistance=Math.min(profile.bossDistance,Math.max(...distances.values())),bossCandidates=cells.filter(c=>distances.get(c.id)===bossDistance);
    state.bossRoom=bossCandidates[Math.floor(random()*bossCandidates.length)];
    state.mainRoute=[state.bossRoom.id];
    while(state.mainRoute[0]!==entranceId)state.mainRoute.unshift(parents.get(state.mainRoute[0]));
    state.treasure={id:`${site.id}:treasury`,x:state.bossRoom.x,y:state.bossRoom.y-90,r:27,state:'locked'};
    const sideRooms=cells.filter(c=>distances.get(c.id)>1&&!state.mainRoute.includes(c.id)).sort((a,b)=>(distances.get(a.id)-distances.get(b.id))||(a.open.length-b.open.length)||a.id-b.id);
    state.chests=sideRooms.slice(0,rules.sideChests).map(c=>({id:`${site.id}:chest:${c.id}`,cellId:c.id,x:c.x+68,y:c.y-45,r:21,state:'closed'}));
    const walls=[],add=(x,y,length,angle)=>{if(length<=0)return;walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'castle-wall',structureType:'castle-wall',structureId:site.id,x,y,r:rules.wallRadius,halfLength:length*.5,angle,seed:random(),sortY:y});};
    const wall=(x,y,angle,hasDoor)=>{
      if(!hasDoor){add(x,y,cellSize,angle);return;}
      const length=(cellSize-rules.doorWidth)*.5,offset=(cellSize+rules.doorWidth)*.25,dx=Math.cos(angle)*offset,dy=Math.sin(angle)*offset;
      add(x-dx,y-dy,length,angle);add(x+dx,y+dy,length,angle);
    };
    for(const cell of cells){
      // North/west edges plus the outer south/east edges avoid duplicate walls.
      wall(cell.x,cell.y-cellSize*.5,0,cell.open.includes(0));
      wall(cell.x-cellSize*.5,cell.y,Math.PI*.5,cell.open.includes(3));
      if(cell.row===rows-1)wall(cell.x,cell.y+cellSize*.5,0,false);
      if(cell.col===cols-1)wall(cell.x+cellSize*.5,cell.y,Math.PI*.5,false);
    }
    state.walls=walls;state.terrain=new Terrain({obstacles:walls,region:profile.terrain,seed});
    state.distances=distances;return state;
  }

export function populateCastle(dungeon,state){
    const g=dungeon.game,random=randomFor(state.seed^0x59B730D1),difficulty=1+Math.min(combatRules.difficultyCap,state.createdAt/combatRules.difficultyPeriod)*combatRules.difficultyGrowth,feature=castleProfileFor(state.site);
    const roomIds=[...state.mainRoute.slice(2,-1),...state.chests.map(chest=>chest.cellId)],specialCounts={boar:0,spore:0};

    for(const [index,id] of roomIds.entries()){
      const cell=state.cells[id],route=state.distances.get(id),side=!state.mainRoute.includes(id);
      const types=castleRoomTypes(route,side);
      const room={cellId:id,kind:side?'treasure':'battle',total:types.length,started:false,cleared:false,rewarded:false,heal:!side&&(index+1)%combatRules.healEveryRooms===0};
      state.rooms.set(id,room);
      const rotation=random()*TAU;
      for(const [i,archetype] of types.entries()){
        const type=cappedEncounterType(archetype,specialCounts,'castle');
        if(type in specialCounts)specialCounts[type]++;
        const angle=rotation+i/types.length*TAU,radius=72+(i%2)*20,enemy=g._spawnEnemy(type,1);
        enemy.dungeonId=state.id;enemy.dungeonRoom=id;enemy.dungeonHome={x:cell.x+Math.cos(angle)*radius,y:cell.y+Math.sin(angle)*radius};enemy.guardActive=false;
        // Group encounters replace lonely, tougher guards. Per-enemy rewards
        // stay modest; the clear reward is finite and belongs to the room.
        enemy.hp*=combatRules.guardHp*(feature?.guardHp||1);enemy.maxHp=enemy.hp;enemy.xp=Math.max(combatRules.minGuardXp,Math.min(combatRules.maxGuardXp,Math.round(enemy.xp*combatRules.guardXpMultiplier)));
        enemy.x=enemy.dungeonHome.x;enemy.y=enemy.dungeonHome.y-groundOffset(enemy);enemy._navTimer=0;g._moveEntity(enemy,0,0);
        // At most one authored shield/fast guard in a late room. Summoners
        // cannot turn this finite scene into an unlimited resource farm.
        if(feature?.shieldRooms&&i===0&&route>=combatRules.shieldRoute)g.elites?.promote(enemy,'shield');
        else if(route>combatRules.eliteRoute&&i===0&&random()<combatRules.eliteChance)g.elites?.promote(enemy,random()<combatRules.shieldChance?'shield':'swift');
      }
    }
    state.rooms.set(state.bossRoom.id,{cellId:state.bossRoom.id,kind:'boss',total:1,started:false,cleared:false,rewarded:false,heal:false});
    const boss=g._spawnEnemy('boss',1);boss.dungeonId=state.id;boss.dungeonRoom=state.bossRoom.id;boss.dungeonBoss=true;boss.name=feature?.bossName||combatRules.boss.name;
    boss.bossIndex=feature?.bossIndex||(state.seed%2?2:1);initBoss(boss);
    boss.hp=boss.maxHp=(g.easy?combatRules.boss.hp.easy:combatRules.boss.hp.normal)*difficulty*(feature?.bossHp||1);boss.damage=(g.easy?combatRules.boss.damage.easy:combatRules.boss.damage.normal)*(1+state.createdAt/combatRules.boss.damageGrowthPeriod);boss.speed=enemyDefinition('boss').baseSpeed*(g.easy?combatRules.boss.speedMultiplier.easy:combatRules.boss.speedMultiplier.normal);boss.xp=combatRules.boss.xp+Math.floor(state.createdAt/combatRules.boss.xpGrowthPeriod);
    boss.dungeonHome={x:state.bossRoom.x,y:state.bossRoom.y+20};boss.x=boss.dungeonHome.x;boss.y=boss.dungeonHome.y-groundOffset(boss);boss.guardActive=false;boss._navTimer=0;g._moveEntity(boss,0,0);
    state.bossId=boss.id;state.enemies=g.enemies;
  }
