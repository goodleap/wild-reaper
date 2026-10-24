import { Terrain } from './terrain.js';
import { interiorPropFootprint } from './interior-prop-geometry.js';

const MERCHANT_NAMES=Object.freeze({weapons:'兵器商人',skills:'术法商人',supplies:'补给商人'});
export const isWorldShop=site=>Object.hasOwn(MERCHANT_NAMES,site?.worldFacility);

// A shop uses the same finite scene and return snapshot as a hut. Its static
// furnishing belongs to the room; purchases belong only to WorldShops/Build.
export function createShopState(game,site,seed){
  const shopKind=site.worldFacility,bounds={minX:-280,minY:-210,maxX:280,maxY:210},walls=[];
  const addWall=(x,y,length,angle)=>walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'shop-wall',structureType:'shop-wall',structureId:site.id,artTheme:site.artTheme,x,y,r:12,halfLength:length*.5,angle,seed:seed+walls.length,sortY:y});
  addWall(0,-210,560,0);addWall(-280,0,420,Math.PI*.5);addWall(280,0,420,Math.PI*.5);
  addWall(-172.5,210,215,0);addWall(172.5,210,215,0);
  const shelf=shopKind==='weapons'?'weaponRack':shopKind==='skills'?'scrollShelf':'supplyShelf';
  const furniture=[
    {kind:'rug',x:0,y:112,width:132,depth:140,solid:false},
    {kind:'counter',x:0,y:-26,width:168,depth:44,solid:true},
    ...[-198,198].flatMap(x=>[-118,35].map(y=>({kind:shelf,x,y,width:88,depth:34,solid:true}))),
    ...[-112,112].map(x=>({kind:'lamp',x,y:-152,width:18,depth:18,solid:false}))
  ].map((prop,i)=>({...prop,id:`${site.id}:furniture:${i}`,type:prop.kind,variant:'shop-furniture',shopKind,
    footprint:{width:prop.width,depth:prop.depth,offsetY:-prop.depth*.5}}));
  const obstacles=furniture.filter(prop=>prop.solid).map(prop=>({...interiorPropFootprint(prop),id:prop.id,heightBand:'low',visual:false}));
  return {id:site.id,kind:'shop',shopKind,artTheme:site.artTheme,name:site.name,site,seed,cols:1,rows:1,cellSize:560,originX:-280,originY:-210,
    cells:[{id:0,col:0,row:0,x:0,y:0,open:[]}],visited:new Set([0]),entranceId:0,
    entrance:{x:0,y:165},landing:{x:0,y:64},bounds,walls,props:furniture,
    shopInterior:{theme:site.artTheme,shopKind,bounds,entry:{x:0,y:210,width:130},furniture},
    merchant:{id:`${site.id}:merchant`,name:MERCHANT_NAMES[shopKind],shopKind,x:0,y:-116,r:18,interaction:{x:0,y:0},interactRadius:82,touchRadius:32},
    terrain:new Terrain({obstacles:[...walls,...obstacles],region:'forest',seed}),
    chests:[],treasure:null,bossRoom:null,bossDefeated:false,rewardClaimed:false,rewardPending:false,
    enemies:[],gems:[],coins:[],adventure:null,rooms:new Map(),distances:new Map([[0,0]]),mainRoute:[0],createdAt:game.time};
}
