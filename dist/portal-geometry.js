// Stone gates share their art, collision, contact and arrival geometry, with
// the open edge facing screen-down (+Y). World roads have a boundary strip.
export const PORTAL_GEOMETRY=Object.freeze({halfWidth:32,backY:-22,frontY:10,wallRadius:7,doorY:18,touchRadius:20,entranceHalfWidth:12});
const EDGE_NORMALS=Object.freeze({north:{x:0,y:1},south:{x:0,y:-1},east:{x:-1,y:0},west:{x:1,y:0}});
// World roads terminate on the map boundary. Their inward-facing strip is
// independent of the roadside sign and includes the complete road width.
export function portalExitGeometry(portal){
  const trigger=portal?.worldConnection&&portal.natural&&portal.exitTrigger,normal=EDGE_NORMALS[trigger?.edge];
  if(!normal||![portal.x,portal.y,trigger.width,trigger.depth].every(Number.isFinite)||trigger.width<=0||trigger.depth<=0)return null;
  return {point:{x:portal.x,y:portal.y},normal,tangent:{x:-normal.y,y:normal.x},halfWidth:trigger.width/2,depth:trigger.depth};
}
export const portalDoor=portal=>{
  const exit=portalExitGeometry(portal);
  return exit?{x:exit.point.x+exit.normal.x*exit.depth/2,y:exit.point.y+exit.normal.y*exit.depth/2}:{x:portal.x,y:portal.y+(portal.natural?0:PORTAL_GEOMETRY.doorY)};
};
export function portalEntranceContains(portal,point,radius=0){
  if(!portal||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
  const exit=portalExitGeometry(portal);
  if(exit){
    const dx=point.x-exit.point.x,dy=point.y-exit.point.y,inward=dx*exit.normal.x+dy*exit.normal.y,across=dx*exit.tangent.x+dy*exit.tangent.y;
    const alongGap=Math.max(0,-inward,inward-exit.depth),acrossGap=Math.max(0,Math.abs(across)-exit.halfWidth),r=Number.isFinite(radius)?Math.max(0,radius):0;
    return alongGap*alongGap+acrossGap*acrossGap<=r*r;
  }
  const door=portalDoor(portal),g=PORTAL_GEOMETRY;
  if(portal.natural)return Math.hypot(point.x-door.x,point.y-door.y)<=(portal.touchRadius||42);
  return point.y>=portal.y&&Math.abs(point.x-door.x)<=g.entranceHalfWidth&&Math.hypot(point.x-door.x,point.y-door.y)<=g.touchRadius;
}
export function portalObstacles(portal){
  if(portal.natural)return [];
  const g=PORTAL_GEOMETRY,segments=[['back',-g.halfWidth,g.backY,g.halfWidth,g.backY],['left',-g.halfWidth,g.backY,-g.halfWidth,g.frontY],['right',g.halfWidth,g.backY,g.halfWidth,g.frontY]];
  return segments.map(([part,ax,ay,bx,by])=>({id:`${portal.id}:wall:${part}`,type:'log',x:portal.x+(ax+bx)/2,y:portal.y+(ay+by)/2,halfLength:Math.hypot(bx-ax,by-ay)/2,angle:Math.atan2(by-ay,bx-ax),r:g.wallRadius,structureId:portal.id,structureType:'portal',variant:'portal-wall',visual:false}));
}
