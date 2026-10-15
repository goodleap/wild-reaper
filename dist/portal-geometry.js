// One ground-space definition is shared by the gate's art, collision, contact
// prompt and arrival search. The open edge always faces screen-down (+Y).
export const PORTAL_GEOMETRY=Object.freeze({halfWidth:32,backY:-22,frontY:10,wallRadius:7,doorY:18,touchRadius:20,entranceHalfWidth:12});
export const portalDoor=portal=>({x:portal.x,y:portal.y+(portal.natural?0:PORTAL_GEOMETRY.doorY)});
export function portalEntranceContains(portal,point){
  if(!portal||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
  const door=portalDoor(portal),g=PORTAL_GEOMETRY;
  if(portal.natural)return Math.hypot(point.x-door.x,point.y-door.y)<=(portal.touchRadius||42);
  return point.y>=portal.y&&Math.abs(point.x-door.x)<=g.entranceHalfWidth&&Math.hypot(point.x-door.x,point.y-door.y)<=g.touchRadius;
}
export function portalObstacles(portal){
  if(portal.natural)return [];
  const g=PORTAL_GEOMETRY,segments=[['back',-g.halfWidth,g.backY,g.halfWidth,g.backY],['left',-g.halfWidth,g.backY,-g.halfWidth,g.frontY],['right',g.halfWidth,g.backY,g.halfWidth,g.frontY]];
  return segments.map(([part,ax,ay,bx,by])=>({id:`${portal.id}:wall:${part}`,type:'log',x:portal.x+(ax+bx)/2,y:portal.y+(ay+by)/2,halfLength:Math.hypot(bx-ax,by-ay)/2,angle:Math.atan2(by-ay,bx-ax),r:g.wallRadius,structureId:portal.id,structureType:'portal',variant:'portal-wall',visual:false}));
}
