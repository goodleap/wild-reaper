import { Terrain } from '../terrain.js';

const supported=new Set(['overdue-book','wreck-knocking']);
export function createQuestInterior(game,site){
  if(!supported.has(site?.sideQuestId))return null;
  const wreck=site.sideQuestId==='wreck-knocking',walls=[];
  const add=(ax,ay,bx,by)=>{
    const length=Math.hypot(bx-ax,by-ay),pieces=Math.max(1,Math.ceil(length/140));
    for(let i=0;i<pieces;i++){
      const a=i/pieces,b=(i+1)/pieces,x1=ax+(bx-ax)*a,y1=ay+(by-ay)*a,x2=ax+(bx-ax)*b,y2=ay+(by-ay)*b;
      walls.push({id:`${site.id}:wall:${walls.length}`,type:'log',variant:'hut-wall',structureType:'hut-wall',structureId:site.id,
        x:(x1+x2)/2,y:(y1+y2)/2,halfLength:Math.hypot(x2-x1,y2-y1)/2,r:9,angle:Math.atan2(y2-y1,x2-x1),seed:91+walls.length,sortY:(y1+y2)/2});
    }
  };
  add(-600,-400,600,-400);add(-600,-400,-600,400);add(600,-400,600,400);
  add(-600,400,-460,400);add(-340,400,600,400);
  // Door widths exceed a complete actor footprint. The optional upper
  // passage is genuine geometry, not a marker crossing a solid wall.
  add(-200,-400,-200,-270);add(-200,-150,-200,110);add(-200,250,-200,400);
  add(200,-400,200,-170);add(200,-30,200,400);
  if(wreck){add(200,-220,320,-220);add(480,-220,600,-220);}
  else{add(-65,-210,-65,25);add(95,95,95,250);}
  // Navigation anchors and links follow the real offset doors. A rectangular
  // adjacency graph would point through the solid x=200 wall at y=200.
  const anchors=[[-400,-210],[0,-210],[400,-10],[-400,180],[0,180],[400,200]],
    links=wreck?[[2],[2],[2],[0],[0],[0]]:[[2],[1,2],[2,3],[0,1],[0,3],[0]];
  const cells=anchors.map(([x,y],id)=>({id,col:id%3,row:Math.floor(id/3),x,y,open:[...links[id]]}));
  return {id:site.id,sideQuestId:site.sideQuestId,site,kind:'hut',name:wreck?'白帆残船 · 残船隔舱':'藏书院 · 残存书室',
    seed:wreck?814:715,populated:true,cols:3,rows:2,cellSize:400,originX:-600,originY:-400,
    cells,visited:new Set([3]),entranceId:3,entrance:{x:-400,y:345},landing:{x:-400,y:265},bounds:{minX:-600,minY:-400,maxX:600,maxY:400},
    walls,terrain:new Terrain({obstacles:walls,region:wreck?'beach':'ruins',seed:wreck?814:715}),props:[],
    chests:[],mechanisms:[],treasure:null,bossRoom:null,bossDefeated:true,rewardClaimed:true,rewardPending:false,
    enemies:[],gems:[],coins:[],adventure:null,rooms:new Map(),distances:new Map(cells.map(c=>[c.id,Math.abs(c.col)+Math.abs(c.row-1)])),
    mainRoute:[3,4,1,2],createdAt:game.time};
}
