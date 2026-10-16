import { enemyAnimationPose, sampleEnemyPose } from './enemy-animation.js';
import { createFrostcrownRigDeformer, FROSTCROWN_RIG } from './enemy-art/frostcrown-rig.js';

// Frostcrown's illustrated body is not its legacy r49 circle. These authored
// contours use the same right-facing local origin and foot40 as its painter.
// Other enemies deliberately keep their existing collision implementations.
const TAU=Math.PI*2,EPS=1e-8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const facings=new WeakMap();
const bodies=new WeakMap();
export const isFrostcrownBody=e=>e?.type==='boss'&&e.bossKind==='frostcrown';
const scale=e=>Math.max(.001,(e.r||49)/49);
export function frostcrownFacing(e,{frozen=false}={}){
  if((e._bodyGeometryFrozen||frozen)&&facings.has(e))return facings.get(e);
  let angle;
  for(const state of [e.specialAttack,e._visualCast,e.specialist])if(Number.isFinite(state?.angle)){angle=state.angle;break;}
  angle??=e.visualFacing;
  const dx=Number.isFinite(angle)?Math.cos(angle):0;
  if(Math.abs(dx)>.12)facings.set(e,dx<0?-1:1);
  return facings.get(e)||1;
}
const freeze=points=>Object.freeze(points.map(p=>Object.freeze(p)));
// Ears/antlers and the small tail are decorative. The head, neck, trunk and
// four individual legs leave the obvious space under the belly unoccupied.
const BODY=Object.freeze([
  freeze([[54,-25],[52,-19],[39,-16],[25,-18],[15,-21],[10,-30],[10,-40],[15,-50],[26,-54],[38,-51],[47,-43],[51,-35]]),
  freeze([[12,-35],[27,-32],[31,-14],[27,2],[11,8],[3,-5],[8,-18]]),
  freeze([[-26,-15],[-18,-16],[-10,-17],[-5,-17],[0,-16],[6,-18],[17,-17],[27,-13],[29,-5],[27,4],[21,10],[8,13],[-10,12],[-26,9],[-28,1],[-27,-5],[-29,-12]]),
  freeze([[22,10],[30,12],[31,23],[34,31],[33.5,35],[25,35],[23,29],[21,22]]),
  freeze([[7,8],[21,9],[19,18],[17,25],[17,32],[19,37],[17.5,39.4],[10,39.4],[6.5,38],[6.5,35],[7,29],[6.5,23],[5,18]]),
  freeze([[-15,10],[-5.5,11],[-5.5,18],[-6,25],[-4.5,31],[-6.8,33.7],[-9,33.7],[-13,32],[-14,31],[-12,23],[-14,16]]),
  freeze([[-28,5],[-18,8],[-21,18],[-25,24],[-23,32],[-23,36],[-24.5,36.8],[-30,36.8],[-34,35.5],[-34.5,33],[-33,26],[-31,18]])
]);
const foot=e=>Number.isFinite(e.groundOffset)?e.groundOffset:40*scale(e);
function bodyGeometry(e,frozen=false){
  const prior=bodies.get(e);if((e._bodyGeometryFrozen||frozen)&&prior)return prior;
  const pose=sampleEnemyPose(enemyAnimationPose(e));
  if(prior?.key===pose.key)return prior;
  const deformer=createFrostcrownRigDeformer(pose),polygons=deformer.state.static?BODY:BODY.map(polygon=>polygon.map(([x,y])=>{const p=deformer.localPoint(x,y);return [p.x,p.y];}));
  const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const polygon of polygons)for(const [x,y] of polygon){bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);}
  const body={key:pose.key,polygons,bounds,pose:Object.freeze(pose),feet:deformer.feet};bodies.set(e,body);return body;
}
// Called from simulation after locomotion. Rendering reads the same finite
// pose but never advances collision state. Frozen hit timers cannot unplant a
// previously sampled hoof while MonsterArt is holding its prior image.
export function snapshotFrostcrownBody(e){frostcrownFacing(e);bodyGeometry(e);}
export function frostcrownBodyPose(e,{frozen=false}={}){return bodyGeometry(e,frozen).pose;}
export function frostcrownQueryBounds(e){
  const s=scale(e),flip=frostcrownFacing(e),b=bodyGeometry(e).bounds;
  // The grid is rebuilt before the final distance-based pose sample. One
  // authored stride's margin admits a newly planted hoof across a cell edge;
  // precise contacts below still use only the current deformed body.
  return {minX:e.x+((flip>0?b.minX:-b.maxX)-18)*s,maxX:e.x+((flip>0?b.maxX:-b.minX)+18)*s,minY:e.y+(b.minY-8)*s,maxY:e.y+Math.max((b.maxY+8)*s,foot(e)+6*s)};
}
function local(e,p,position=e){const s=scale(e);return {x:(p.x-position.x)/s*frostcrownFacing(e),y:(p.y-position.y)/s};}
function distance2(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?clamp(((x-a[0])*dx+(y-a[1])*dy)/length,0,1):0;
  return (x-a[0]-dx*t)**2+(y-a[1]-dy*t)**2;
}
function inside(p,polygon){
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(distance2(p.x,p.y,a,b)<EPS)return true;
    if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
function polygonCircle(polygon,p,r){
  if(inside(p,polygon))return true;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if(distance2(p.x,p.y,polygon[j],polygon[i])<=r*r+EPS)return true;
  return false;
}
function circleImpact(a,b,x,y,r){
  const ox=a.x-x,oy=a.y-y,dx=b.x-a.x,dy=b.y-a.y,c=ox*ox+oy*oy-r*r;
  if(c<=EPS)return 0;
  const aa=dx*dx+dy*dy;if(aa<EPS)return Infinity;
  const bb=ox*dx+oy*dy,disc=bb*bb-aa*c;if(disc<0)return Infinity;
  const t=(-bb-Math.sqrt(Math.max(0,disc)))/aa;return t>=0&&t<=1?t:Infinity;
}
function capsuleImpact(a,b,c,d,r){
  if(distance2(a.x,a.y,c,d)<=r*r+EPS)return 0;
  let first=Math.min(circleImpact(a,b,c[0],c[1],r),circleImpact(a,b,d[0],d[1],r));
  const ex=d[0]-c[0],ey=d[1]-c[1],length=Math.hypot(ex,ey);
  if(length<EPS)return first;
  const ux=ex/length,uy=ey/length,along=(a.x-c[0])*ux+(a.y-c[1])*uy,
    normal=-(a.x-c[0])*uy+(a.y-c[1])*ux,dx=b.x-a.x,dy=b.y-a.y,
    ds=dx*ux+dy*uy,dn=-dx*uy+dy*ux;
  if(Math.abs(dn)>EPS)for(const side of [-1,1]){
    const t=(side*r-normal)/dn,s=along+ds*t;
    if(t>=0&&t<=1&&s>=0&&s<=length)first=Math.min(first,t);
  }
  return first;
}
export function frostcrownBodyCircle(e,x,y,r=0){
  const p=local(e,{x,y}),radius=Math.max(0,r)/scale(e);
  return bodyGeometry(e).polygons.some(polygon=>polygonCircle(polygon,p,radius));
}
export function frostcrownBodyDistance(e,x,y){
  const p=local(e,{x,y});let best=Infinity;
  for(const polygon of bodyGeometry(e).polygons){
    if(inside(p,polygon))return 0;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)best=Math.min(best,distance2(p.x,p.y,polygon[j],polygon[i]));
  }
  return Math.sqrt(best)*scale(e);
}
// Relative target motion is supplied separately: interpolated sword-energy
// positions must not lose the target's identity or facing in a plain clone.
export function frostcrownBodySweep(e,a,b,r=0,previous=e,current=e){
  const start=local(e,a,previous),end=local(e,b,current),radius=Math.max(0,r)/scale(e);
  let first=Infinity;
  for(const polygon of bodyGeometry(e).polygons){
    if(polygonCircle(polygon,start,radius))return 0;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)first=Math.min(first,capsuleImpact(start,end,polygon[j],polygon[i],radius));
  }
  return first;
}
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function frostcrownBodyArc(e,origin,range,arc,angle){
  const o=local(e,origin),reach=Math.max(0,range)/scale(e),flip=frostcrownFacing(e),
    direction=Math.atan2(Math.sin(angle),Math.cos(angle)*flip),half=Math.max(0,Math.min(TAU,arc))*.5;
  const within=(x,y)=>Math.hypot(x-o.x,y-o.y)<=reach+EPS&&(half>=Math.PI||Math.abs(angleDelta(Math.atan2(y-o.y,x-o.x),direction))<=half+EPS);
  for(const polygon of bodyGeometry(e).polygons){
    if(inside(o,polygon)||polygon.some(([x,y])=>within(x,y)))return true;
    if(half>=Math.PI&&polygonCircle(polygon,o,reach))return true;
    for(const side of [-1,1]){
      const tip={x:o.x+Math.cos(direction+half*side)*reach,y:o.y+Math.sin(direction+half*side)*reach};
      for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if(Number.isFinite(capsuleImpact(o,tip,polygon[j],polygon[i],0)))return true;
    }
    // A circular sector can cross an edge with neither polygon vertex inside.
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[j],b=polygon[i],dx=b[0]-a[0],dy=b[1]-a[1],x=a[0]-o.x,y=a[1]-o.y,
        aa=dx*dx+dy*dy,bb=x*dx+y*dy,disc=bb*bb-aa*(x*x+y*y-reach*reach);
      if(aa<EPS||disc<0)continue;
      for(const sign of [-1,1]){const t=(-bb+sign*Math.sqrt(Math.max(0,disc)))/aa;if(t>=0&&t<=1&&within(a[0]+t*dx,a[1]+t*dy))return true;}
    }
  }
  return false;
}
const FOOT_SAMPLES=Object.freeze([-25,-50/3,-25/3,0,25/3,50/3,25]);
function supportFeet(e,feet=bodyGeometry(e).feet,compression=1,flip=frostcrownFacing(e),plantedOnly=true,projected=false){
  const s=scale(e),cy=foot(e)-4*s;
  return feet.filter(f=>!plantedOnly||f.planted).map(f=>({x:f.target.x*s*flip*compression,y:cy+(f.target.y+(projected?f.lift:0)-36)*s*compression,r:5*s*compression}));
}
// The trunk's ground projection and separately planted hooves own contact.
// A swinging hoof remains a body target but does not claim ground occupancy.
export function frostcrownGroundSamples(e){
  const s=scale(e),y=foot(e)-4*s;
  return [...FOOT_SAMPLES.map(x=>({x:x*s,y,r:10*s})),...supportFeet(e)];
}
export function frostcrownTerrainSamples(e){
  const s=scale(e),y=foot(e)-4*s,pose=enemyAnimationPose(e);
  const samples=[...FOOT_SAMPLES.map(x=>({x:x*s,y,r:10*s})),...supportFeet(e,undefined,1,undefined,false,true)];
  if(!e._bodyGeometryFrozen&&pose.moving)samples.push(...supportFeet(e,createFrostcrownRigDeformer(pose).feet,1,undefined,false,true));
  return samples;
}
export function frostcrownGroundContact(e,x,y,r=0,compression=1){
  const s=scale(e),half=25*s*compression,cy=e.y+foot(e)-4*s;
  const shapes=[{x:clamp(x,e.x-half,e.x+half),y:cy,r:10*s*compression},...supportFeet(e,undefined,compression).map(p=>({...p,x:p.x+e.x,y:p.y+e.y}))];
  let contact=null;
  for(const p of shapes){
    const dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy),overlap=p.r+Math.max(0,r)-d;
    if(overlap>0&&(!contact||overlap>contact.overlap))contact={nx:d>EPS?dx/d:0,ny:d>EPS?dy/d:1,overlap};
  }
  return contact;
}
export function frostcrownGroundSweep(e,line,target,r=0){
  const s=scale(e),a={x:target.x-line.x,y:target.y-line.y+4*s},b={x:target.x-line.x2,y:target.y-line.y2+4*s};
  let first=capsuleImpact(a,b,[-25*s,0],[25*s,0],10*s+Math.max(0,r));
  for(const p of supportFeet(e))first=Math.min(first,circleImpact(a,b,p.x,p.y-foot(e)+4*s,p.r+Math.max(0,r)));
  return first;
}
// Seven overlapping trunk discs approximate the capsule to <1 world unit at
// r49; planted hooves may extend beyond it during the authored stride. All
// samples share one translation. Check the next finite gait frame before
// accepting movement, so a newly planted hoof cannot pop through a wall.
export function moveFrostcrownGround(terrain,e,dx,dy,profile='ground'){
  const s=scale(e),originalPose=enemyAnimationPose(e),samples=frostcrownTerrainSamples(e);
  // Terrain also clears a swinging hoof's path between the finite painted
  // keyframes. This transient sweep never expands ground contact damage or
  // reserves extra space while idle; a wall cannot be crossed in mid-swing.
  let x=e.x,y=e.y,blocked=false,correctionX=0,correctionY=0;
  const free=(px,py,list=samples)=>list.every(p=>terrain.isFree(px+p.x,py+p.y,p.r,profile));
  // Setup/knockback may begin slightly intersecting a wall. Resolve the whole
  // support envelope, not seven independently moving pieces.
  if(!free(x,y)&&terrain.resolveCircle)for(let pass=0;pass<6&&!free(x,y);pass++)for(const p of samples){
    const at=terrain.resolveCircle(x+p.x,y+p.y,p.r,profile);if(at.blocked){x=at.x-p.x;y=at.y-p.y;blocked=true;}
  }
  if(!free(x,y))return {x:e.x,y:e.y,blocked:true};
  correctionX=x-e.x;correctionY=y-e.y;
  if(Math.abs(dx)+Math.abs(dy)<EPS)return {x,y,blocked,correctionX,correctionY};
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/Math.max(2,6*s))),sx=dx/steps,sy=dy/steps;
  const walkStartX=e._walkStartX??e.x,walkStartY=e._walkStartY??e.y;
  const futureFrames=new Map();
  const predictsStride=!e._bodyGeometryFrozen&&(!e.specialAttack||e.specialAttack.phase==='rush')&&!(e.specialRecovery>0)&&!['windup','recovery'].includes(e.specialist?.phase)&&e.guardActive!==false;
  const futureSamples=(px,py)=>{
    if(!predictsStride)return samples;
    const travelX=px-walkStartX-correctionX,travelY=py-walkStartY-correctionY,traveled=Math.hypot(travelX,travelY);if(traveled<=.001)return samples;
    const rawPose={...originalPose,mode:['idle','move','hit'].includes(originalPose.mode)?'move':originalPose.mode,moving:true,cycle:(e.walkPhase||0)+traveled*TAU/FROSTCROWN_RIG.stride},pose=sampleEnemyPose(rawPose);
    const hasAttackAngle=[e.specialAttack,e._visualCast,e.specialist].some(a=>Number.isFinite(a?.angle));
    const flip=!hasAttackAngle&&Math.abs(travelX)>.12*Math.max(.001,traveled)?Math.sign(travelX):frostcrownFacing(e);
    const key=`${pose.key}:${flip}`;
    if(!futureFrames.has(key))futureFrames.set(key,[...samples,...supportFeet(e,createFrostcrownRigDeformer(pose).feet,1,flip,false,true)]);
    return [...futureFrames.get(key),...supportFeet(e,createFrostcrownRigDeformer(rawPose).feet,1,flip,false,true)];
  };
  for(let step=0;step<steps;step++){
    let mx=sx,my=sy;
    for(let pass=0;pass<2;pass++)for(const p of samples){
      const moved=terrain.moveCircle(x+p.x,y+p.y,mx,my,p.r,profile);
      blocked||=moved.blocked;mx=moved.x-(x+p.x);my=moved.y-(y+p.y);
    }
    // When the next planted hoof extends toward an adjacent wall, move the
    // connected body just far enough away to fit it. This is constraint
    // resolution, not a new footstep or a facing reversal. A purely tangent
    // pursuit can therefore keep sliding instead of stopping its entire gait.
    const anticipated=futureSamples(x+mx,y+my);let px=x+mx,py=y+my;
    if(!free(px,py,anticipated)&&terrain.resolveCircle)for(let pass=0;pass<4&&!free(px,py,anticipated);pass++)for(const p of anticipated){
      if(terrain.isFree(px+p.x,py+p.y,p.r,profile))continue;
      // Resolve from the connected trunk's side. A finite-frame hoof can
      // otherwise land beyond a thin wall and be pushed onto its far side.
      const at=terrain.moveCircle(x,y+p.y,px+p.x-x,py-y,p.r,profile);px=at.x-p.x;py=at.y-p.y;blocked=true;
    }
    const cx=px-(x+mx),cy=py-(y+my);
    correctionX+=cx;correctionY+=cy;mx=px-x;my=py-y;
    const safe=t=>free(x+mx*t,y+my*t,futureSamples(x+mx*t,y+my*t))&&samples.every(p=>!terrain.firstBlocker?.(x+p.x,y+p.y,x+p.x+mx*t,y+p.y+my*t,p.r,profile));
    if(!safe(1)){
      let lo=0,hi=1;for(let i=0;i<14;i++){const mid=(lo+hi)*.5;if(safe(mid))lo=mid;else hi=mid;}
      correctionX-=cx*(1-lo);correctionY-=cy*(1-lo);mx*=lo;my*=lo;blocked=true;
    }
    x+=mx;y+=my;
  }
  return {x,y,blocked,correctionX,correctionY};
}
