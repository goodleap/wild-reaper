import { Terrain, groundOffset } from './terrain.js';
import { REGIONS } from './world-definitions.js';
import { featureForSite } from './world-sites.js';

export const HUT_RULES=Object.freeze({cellSize:400,wallRadius:12,doorWidth:90,maxStates:REGIONS.length*3,guards:4});

// Huts share the finite scene lifecycle, but retain a deliberately small,
// authored room instead of reusing the castle's maze and reward progression.
export function createHutState(game,site,seed){
  const feature=featureForSite(site),size=feature?.interiorSize||HUT_RULES.cellSize,half=size*.5,halfHeight=(feature?.interiorHeight||size)*.5,occupied=site.type==='occupied';
  const cell={id:0,col:0,row:0,x:0,y:0,open:[]},walls=[];
  const add=(x,y,length,angle)=>walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'hut-wall',structureType:'hut-wall',structureId:site.id,x,y,r:HUT_RULES.wallRadius,halfLength:length*.5,angle,seed:seed+walls.length,sortY:y});
  add(0,-halfHeight,size,0);add(-half,0,halfHeight*2,Math.PI*.5);add(half,0,halfHeight*2,Math.PI*.5);
  const length=(size-HUT_RULES.doorWidth)*.5,offset=(size+HUT_RULES.doorWidth)*.25;
  add(-offset,halfHeight,length,0);add(offset,halfHeight,length,0);
  const rocks=feature?.id==='mine'?[-1,1].map((side,i)=>({id:`${site.id}:ore:${i}`,type:'rock',variant:'moss-rock',x:side*98,y:12,r:25,rockForm:1,seed:seed+i})):[];
  const props=feature?.id==='shipwreck'?[{type:'cargo',x:-175,y:-75},{type:'cargo',x:175,y:-65},{type:'barrel',x:-180,y:80}]:feature?.id==='mine'?[{type:'minecart',x:-145,y:-130},{type:'cargo',x:153,y:-130}]:[{type:'table',x:-118,y:-83},{type:'stool',x:-118,y:-32},{type:'bed',x:120,y:-92},{type:'shelf',x:0,y:-140},{type:'rug',x:0,y:55}];
  return {id:site.id,kind:'hut',featureId:feature?.id,name:site.name||'林间小屋',treasureName:feature?.treasureName||'屋内补给',site,seed,cols:1,rows:1,cellSize:size,originX:-half,originY:-halfHeight,
    cells:[cell],visited:new Set([0]),entranceId:0,entrance:{x:0,y:halfHeight-45},landing:{x:0,y:halfHeight-130},bounds:{minX:-half,minY:-halfHeight,maxX:half,maxY:halfHeight},
    walls,terrain:new Terrain({obstacles:[...walls,...rocks],region:feature?.id==='mine'?'mountain':'forest',seed}),props,
    chests:[{id:`${site.id}:supplies`,cellId:0,x:20,y:feature?-90:-25,r:21,state:'closed',hut:true}],treasure:null,
    bossRoom:null,bossDefeated:false,rewardClaimed:false,rewardPending:false,enemies:[],gems:[],coins:[],adventure:null,
    rooms:new Map(occupied?[[0,{cellId:0,kind:'battle',total:feature?.guardTypes?.length||HUT_RULES.guards,started:false,cleared:false,rewarded:false,heal:false}]]:[]),
    distances:new Map([[0,0]]),mainRoute:[0],createdAt:game.time};
}

export function populateHut(game,state){
  if(state.site.type!=='occupied'){state.enemies=game.enemies;return;}
  // The inward landing stays more than 125 ground units from every guard.
  // Two seconds of normal scene-entry protection also cover the first view.
  const feature=featureForSite(state.site),points=feature?.id==='shipwreck'?[{x:-120,y:-110},{x:120,y:-110},{x:-155,y:-60},{x:155,y:-60},{x:-155,y:0},{x:155,y:0}]:feature?.id==='mine'?[{x:-135,y:-105},{x:135,y:-105},{x:0,y:-150},{x:-145,y:-35},{x:145,y:-35}]:[{x:-100,y:-90},{x:100,y:-90},{x:-65,y:-45},{x:65,y:-45}];
  for(const [i,point] of points.entries()){
    const enemy=game._spawnEnemy(feature?.guardTypes?.[i]||(i===0?'brute':'beetle'),1);
    enemy.dungeonId=state.id;enemy.dungeonRoom=0;enemy.dungeonHome={...point};enemy.guardActive=false;
    enemy.xp=i===0?8:4;enemy.hp*=(i===0?1.6:1.25)*(feature?.guardHp||1);enemy.maxHp=enemy.hp;
    enemy.x=point.x;enemy.y=point.y-groundOffset(enemy);enemy._navTimer=0;game._moveEntity(enemy,0,0);
  }
  state.enemies=game.enemies;
}

export function claimHutChest(game,state,chest){
  if(chest.state!=='closed'||state.rewardClaimed||game.enemies.some(enemy=>enemy.hp>0&&enemy.dungeonId===state.id))return false;
  const occupied=state.site.type==='occupied',feature=featureForSite(state.site),reward=feature?.reward||(occupied?{gold:24,crystals:40}:{gold:4,crystals:12});chest.state='claimed';state.rewardClaimed=true;state.site.state='spent';state.site.explored=true;
  game.grantResources(reward,feature?.id||(occupied?'occupiedHouse':'supplyHouse'));
  game.adventure?.dropPickup('herb',chest.x-24,chest.y+32);
  if(occupied)game.adventure?.dropPickup('fury',chest.x+24,chest.y+32);
  game._effect(chest.x,chest.y,'ring',.7,70,'#edd38d');game._emit('houseOpened',{name:state.name,occupied,featureId:feature?.id,reward});return true;
}
