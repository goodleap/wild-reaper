import { Terrain, groundOffset } from './terrain.js';

export const HUT_RULES=Object.freeze({cellSize:400,wallRadius:12,doorWidth:90,maxStates:8,guards:4});

// Huts share the finite scene lifecycle, but retain a deliberately small,
// authored room instead of reusing the castle's maze and reward progression.
export function createHutState(game,site,seed){
  const size=HUT_RULES.cellSize,half=size*.5,occupied=site.type==='occupied';
  const cell={id:0,col:0,row:0,x:0,y:0,open:[]},walls=[];
  const add=(x,y,length,angle)=>walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'hut-wall',structureType:'hut-wall',structureId:site.id,x,y,r:HUT_RULES.wallRadius,halfLength:length*.5,angle,seed:seed+walls.length,sortY:y});
  add(0,-half,size,0);add(-half,0,size,Math.PI*.5);add(half,0,size,Math.PI*.5);
  const length=(size-HUT_RULES.doorWidth)*.5,offset=(size+HUT_RULES.doorWidth)*.25;
  add(-offset,half,length,0);add(offset,half,length,0);
  return {id:site.id,kind:'hut',name:site.name||'林间小屋',site,seed,cols:1,rows:1,cellSize:size,originX:-half,originY:-half,
    cells:[cell],visited:new Set([0]),entranceId:0,entrance:{x:0,y:155},landing:{x:0,y:70},bounds:{minX:-half,minY:-half,maxX:half,maxY:half},
    walls,terrain:new Terrain({obstacles:walls,region:'forest',seed}),props:[{type:'table',x:-118,y:-83},{type:'stool',x:-118,y:-32},{type:'bed',x:120,y:-92},{type:'shelf',x:0,y:-140},{type:'rug',x:0,y:55}],
    chests:[{id:`${site.id}:supplies`,cellId:0,x:20,y:-25,r:21,state:'closed',hut:true}],treasure:null,
    bossRoom:null,bossDefeated:false,rewardClaimed:false,rewardPending:false,enemies:[],gems:[],coins:[],adventure:null,
    rooms:new Map(occupied?[[0,{cellId:0,kind:'battle',total:HUT_RULES.guards,started:false,cleared:false,rewarded:false,heal:false}]]:[]),
    distances:new Map([[0,0]]),mainRoute:[0],createdAt:game.time};
}

export function populateHut(game,state){
  if(state.site.type!=='occupied'){state.enemies=game.enemies;return;}
  // The inward landing stays more than 125 ground units from every guard.
  // Two seconds of normal scene-entry protection also cover the first view.
  const points=[{x:-100,y:-90},{x:100,y:-90},{x:-65,y:-45},{x:65,y:-45}];
  for(const [i,point] of points.entries()){
    const enemy=game._spawnEnemy(i===0?'brute':'beetle',1);
    enemy.dungeonId=state.id;enemy.dungeonRoom=0;enemy.dungeonHome={...point};enemy.guardActive=false;
    enemy.xp=i===0?8:4;enemy.hp*=i===0?1.6:1.25;enemy.maxHp=enemy.hp;
    enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);enemy._navTimer=0;game._moveEntity(enemy,0,0);
  }
  state.enemies=game.enemies;
}

export function claimHutChest(game,state,chest){
  if(chest.state!=='closed'||state.rewardClaimed||game.enemies.some(enemy=>enemy.hp>0&&enemy.dungeonId===state.id))return false;
  const occupied=state.site.type==='occupied';chest.state='claimed';state.rewardClaimed=true;state.site.state='spent';state.site.explored=true;
  game.grantResources(occupied?{gold:24,crystals:40}:{gold:4,crystals:12},occupied?'occupiedHouse':'supplyHouse');
  game.adventure?.dropPickup('herb',chest.x-24,chest.y+32);
  if(occupied)game.adventure?.dropPickup('fury',chest.x+24,chest.y+32);
  game._effect(chest.x,chest.y,'ring',.7,70,'#edd38d');game._emit('houseOpened',{name:state.name,occupied});return true;
}
