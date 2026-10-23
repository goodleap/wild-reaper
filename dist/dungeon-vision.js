// A dungeon shares its world-space camera and capsule walls with combat.
// Visibility is current line of sight; exploration is persistent static memory.
// Rendering may rebuild a view after resize, but only update() discovers tiles.
import { blocksObstacle } from './height-rules.js';
const TAU=Math.PI*2, TILE=24, EPSILON=.000015;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const within=(x,y,b)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY;
const rectHit=(ox,oy,dx,dy,b)=>Math.min(dx>0?(b.maxX-ox)/dx:dx<0?(b.minX-ox)/dx:Infinity,dy>0?(b.maxY-oy)/dy:dy<0?(b.minY-oy)/dy:Infinity);

function capsule(obstacle){
  const length=obstacle.type==='log'?obstacle.halfLength||0:0,ux=Math.cos(obstacle.angle||0),uy=Math.sin(obstacle.angle||0);
  return {obstacle,x:obstacle.x,y:obstacle.y,r:obstacle.r||0,length,ux,uy,ax:obstacle.x-ux*length,ay:obstacle.y-uy*length,bx:obstacle.x+ux*length,by:obstacle.y+uy*length};
}
function wallJunctions(walls){
  const points=[],seen=new Set();
  // Ray endpoints and circular-cap tangents do not include the inside corner
  // formed where two thick walls overlap. Without these actual face crossings
  // a polygon edge cuts across visible floor as a small triangular black wedge.
  for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
    const a=walls[i],b=walls[j],ab=a.obstacle.bounds,bb=b.obstacle.bounds;
    if(!a.length||!b.length||ab.maxX<bb.minX||ab.minX>bb.maxX||ab.maxY<bb.minY||ab.minY>bb.maxY)continue;
    const cross=a.ux*b.uy-a.uy*b.ux;if(Math.abs(cross)<1e-8)continue;
    for(const sideA of [-1,1])for(const sideB of [-1,1]){
      const ax=a.ax-a.uy*a.r*sideA,ay=a.ay+a.ux*a.r*sideA,bx=b.ax-b.uy*b.r*sideB,by=b.ay+b.ux*b.r*sideB;
      const dx=bx-ax,dy=by-ay,t=(dx*b.uy-dy*b.ux)/cross,u=(dx*a.uy-dy*a.ux)/cross;
      if(t<-.00001||t>a.length*2+.00001||u<-.00001||u>b.length*2+.00001)continue;
      const x=ax+a.ux*t,y=ay+a.uy*t,key=`${Math.round(x*10000)},${Math.round(y*10000)}`;
      if(!seen.has(key)){seen.add(key);points.push({x,y});}
    }
  }
  return points;
}
function circleHit(ox,oy,dx,dy,cx,cy,r){
  const x=cx-ox,y=cy-oy,projection=x*dx+y*dy,discriminant=r*r-(x*x+y*y-projection*projection);
  if(discriminant<0)return Infinity;
  const root=Math.sqrt(Math.max(0,discriminant)),near=projection-root;
  return near>=0?near:projection+root>=0?0:Infinity;
}
// Ray entry into a capsule: its oriented rectangle and the two circular caps.
// Unlike square wall approximations this has the same rounded door posts as
// Terrain.firstBlocker and never reveals a sliver through a collision wall.
function capsuleHit(ox,oy,dx,dy,c){
  let nearest=Math.min(circleHit(ox,oy,dx,dy,c.ax,c.ay,c.r),circleHit(ox,oy,dx,dy,c.bx,c.by,c.r));
  if(!c.length)return nearest;
  const x=(ox-c.x)*c.ux+(oy-c.y)*c.uy,y=-(ox-c.x)*c.uy+(oy-c.y)*c.ux;
  const vx=dx*c.ux+dy*c.uy,vy=-dx*c.uy+dy*c.ux;
  let entry=0,exit=Infinity;
  for(const [position,velocity,half] of [[x,vx,c.length],[y,vy,c.r]]){
    if(Math.abs(velocity)<1e-12){if(Math.abs(position)>half)return nearest;continue;}
    const a=(-half-position)/velocity,b=(half-position)/velocity;
    entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  }
  if(exit>=entry&&exit>=0)nearest=Math.min(nearest,entry);
  return nearest;
}
function appendPolygon(ctx,polygon,offsetX,offsetY){
  if(!polygon.length)return;
  ctx.moveTo(polygon[0].x+offsetX,polygon[0].y+offsetY);
  for(let i=1;i<polygon.length;i++)ctx.lineTo(polygon[i].x+offsetX,polygon[i].y+offsetY);
  ctx.closePath();
}

export class DungeonVision {
  constructor(dungeon){
    this.dungeon=dungeon;this._states=new WeakMap();this._state=null;this._key='';this._visibleQueries=new Map();
    this.polygon=[];this.view=null;this.stats={rebuilds:0,rays:0,walls:0,exploredTiles:0};
  }
  _record(state){
    let record=this._states.get(state);
    if(!record||record.terrain!==state.terrain||record.revision!==state.terrain.structureRevision){
      // Opening a gate changes occlusion immediately, without forgetting the
      // explored floor or the remaining walls of this same scene terrain.
      const previous=record?.terrain===state.terrain?record:null,knownIds=new Set(previous?.pieces.filter(piece=>piece.seen).map(piece=>piece.id));
      const b=state.bounds,cols=Math.ceil((b.maxX-b.minX)/TILE),rows=Math.ceil((b.maxY-b.minY)/TILE);
      const walls=state.terrain.query(b.minX,b.minY,b.maxX,b.maxY).filter(o=>blocksObstacle(o,'sight')).map(capsule);
      const retain=previous&&previous.cols===cols&&previous.rows===rows;
      record={terrain:state.terrain,revision:state.terrain.structureRevision,cols,rows,seen:retain?previous.seen:new Uint8Array(cols*rows),walls,junctions:wallJunctions(walls),pieces:[],known:[],knownByWall:new Map(),rects:retain?previous.rects:[],dirty:!!retain,discoverKey:null,count:retain?previous.count:0};
      for(const wall of walls){
        const count=Math.max(1,Math.ceil(wall.length*2/TILE));
        for(let i=0;i<count;i++){
          const a=i/count,z=(i+1)/count;
          const piece={wallId:wall.obstacle.id,id:`${wall.obstacle.id}:${i}`,ax:wall.ax+(wall.bx-wall.ax)*a,ay:wall.ay+(wall.by-wall.ay)*a,bx:wall.ax+(wall.bx-wall.ax)*z,by:wall.ay+(wall.by-wall.ay)*z,r:wall.r,seen:false};
          piece.seen=knownIds.has(piece.id);record.pieces.push(piece);
          if(piece.seen){record.known.push(piece);if(!record.knownByWall.has(piece.wallId))record.knownByWall.set(piece.wallId,[]);record.knownByWall.get(piece.wallId).push(piece);}
        }
      }
      this._states.set(state,record);
    }
    return record;
  }
  ensureCurrent(){
    const state=this.dungeon.active,g=this.dungeon.game;
    if(!state){this._state=null;this._key='';this.polygon=[];this.view=null;this._visibleQueries.clear();return false;}
    const p=g.player,origin=this.dungeon._playerFoot(),w=Math.max(1,g.viewWidth||800),h=Math.max(1,g.viewHeight||600);
    const key=`${origin.x},${origin.y},${p.x},${p.y},${w},${h}`;
    if(this._state===state&&this._terrain===state.terrain&&this._revision===state.terrain.structureRevision&&this._key===key)return true;
    this._state=state;this._terrain=state.terrain;this._revision=state.terrain.structureRevision;this._key=key;this._origin=origin;this._visibleQueries.clear();
    this.view={minX:p.x-w*.5,minY:p.y-h*.5,maxX:p.x+w*.5,maxY:p.y+h*.5};
    const bounds=state.bounds,view=this.view,b={minX:Math.max(bounds.minX,view.minX),minY:Math.max(bounds.minY,view.minY),maxX:Math.min(bounds.maxX,view.maxX),maxY:Math.min(bounds.maxY,view.maxY)};
    if(!within(origin.x,origin.y,b)){this.polygon=[];return true;}
    const record=this._record(state),walls=record.walls.filter(c=>{const a=c.obstacle.bounds;return a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;});
    const angles=[],add=a=>{for(const delta of [-EPSILON,0,EPSILON])angles.push(((a+delta)%TAU+TAU)%TAU);};
    for(let i=0;i<96;i++)angles.push(i*TAU/96);
    for(const [x,y] of [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]])add(Math.atan2(y-origin.y,x-origin.x));
    for(const point of record.junctions)if(within(point.x,point.y,b))add(Math.atan2(point.y-origin.y,point.x-origin.x));
    for(const wall of walls){
      for(const [x,y] of [[wall.ax,wall.ay],[wall.bx,wall.by]]){
        const angle=Math.atan2(y-origin.y,x-origin.x),distance=Math.hypot(x-origin.x,y-origin.y);
        if(distance>wall.r){const tangent=Math.asin(wall.r/distance);add(angle-tangent);add(angle+tangent);}
        // Side/cap seams retain accurate short, nearby wall silhouettes.
        for(const sign of [-1,1])add(Math.atan2(y+wall.ux*wall.r*sign-origin.y,x-wall.uy*wall.r*sign-origin.x));
      }
    }
    angles.sort((a,b)=>a-b);
    const polygon=[];let previous=-1;
    for(const angle of angles){
      if(angle-previous<1e-9)continue;previous=angle;
      const dx=Math.cos(angle),dy=Math.sin(angle);let length=rectHit(origin.x,origin.y,dx,dy,b);
      for(const wall of walls)length=Math.min(length,capsuleHit(origin.x,origin.y,dx,dy,wall));
      // Tiny inset puts rendered pixels on the same free side as the LOS test.
      length=Math.max(0,length-.015);polygon.push({x:origin.x+dx*length,y:origin.y+dy*length});
    }
    this.polygon=polygon;this.stats={...this.stats,rebuilds:this.stats.rebuilds+1,rays:polygon.length,walls:walls.length,exploredTiles:record.count};
    return true;
  }
  isVisible(x,y,r=0){
    if(typeof x==='object'){r=x.r??r;y=x.y;x=x.x;}
    if(!Number.isFinite(x)||!Number.isFinite(y)||!this.ensureCurrent())return !this.dungeon.active;
    const radius=Math.max(0,Number.isFinite(r)?r:0),key=`${x},${y},${radius}`;
    if(this._visibleQueries.has(key))return this._visibleQueries.get(key);
    const p=this._origin,v=this.view,b=this._state.bounds,terrain=this._state.terrain;
    const clear=(px,py)=>within(px,py,v)&&within(px,py,b)&&!terrain.firstBlocker(p.x,p.y,px,py,0,'sight');
    let visible=clear(x,y);
    if(!visible&&radius>0){
      const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,sample=Math.min(radius*.85,d);
      visible=clear(x+nx*sample,y+ny*sample)||clear(x-ny*sample,y+nx*sample)||clear(x+ny*sample,y-nx*sample)||clear(x-nx*sample,y-ny*sample);
    }
    // A frozen view can be queried indefinitely without growing a render cache.
    if(this._visibleQueries.size>=2048)this._visibleQueries.clear();
    this._visibleQueries.set(key,visible);return visible;
  }
  update(){
    if(!this.ensureCurrent())return;
    const state=this._state,record=this._record(state);if(record.discoverKey===this._key)return;
    record.discoverKey=this._key;
    const polygon=this.polygon,b=state.bounds,v=this.view;
    // Scanline rasterization visits visible tile centres without one ray per
    // tile. Only static floor memory is coarse; dynamic clipping stays precise.
    const fromRow=clamp(Math.floor((v.minY-b.minY)/TILE),0,record.rows-1),toRow=clamp(Math.floor((v.maxY-b.minY)/TILE),0,record.rows-1);
    for(let row=fromRow;row<=toRow;row++){
      const y=b.minY+(row+.5)*TILE,crossings=[];
      for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
        const a=polygon[j],z=polygon[i];if((a.y>y)!==(z.y>y))crossings.push(a.x+(y-a.y)*(z.x-a.x)/(z.y-a.y));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){
        const start=clamp(Math.ceil((crossings[i]-b.minX)/TILE-.5),0,record.cols-1),end=clamp(Math.floor((crossings[i+1]-b.minX)/TILE-.5),0,record.cols-1);
        for(let col=start;col<=end;col++){const index=row*record.cols+col;if(!record.seen[index]){record.seen[index]=1;record.count++;record.dirty=true;}}
      }
    }
    for(const piece of record.pieces){
      if(piece.seen)continue;
      if(this.isWallSegmentVisible(piece)){piece.seen=true;const segment={id:piece.id,ax:piece.ax,ay:piece.ay,bx:piece.bx,by:piece.by,r:piece.r};record.known.push(segment);if(!record.knownByWall.has(piece.wallId))record.knownByWall.set(piece.wallId,[]);record.knownByWall.get(piece.wallId).push(segment);}
    }
    this.stats.exploredTiles=record.count;
  }
  isWallSegmentVisible(piece){
    if(!this.ensureCurrent())return true;
    const x=(piece.ax+piece.bx)*.5,y=(piece.ay+piece.by)*.5,dx=this._origin.x-x,dy=this._origin.y-y;
    const tx=piece.bx-piece.ax,ty=piece.by-piece.ay,length=Math.hypot(tx,ty);
    // At an L-junction, a 24px end piece's midpoint can sit inside the
    // perpendicular wall even though its inner edge is plainly visible.
    // Sample a few points along the SAME near face, retaining exact LOS.
    // This never grants vision through a wall or discovers an entire room.
    let nx,ny;
    if(length>1e-6){nx=-ty/length;ny=tx/length;const side=dx*nx+dy*ny<0?-1:1;nx*=side;ny*=side;}
    else{const distance=Math.hypot(dx,dy)||1;nx=dx/distance;ny=dy/distance;}
    for(const t of [.5,.12,.88]){
      const px=piece.ax+tx*t+nx*(piece.r+.75),py=piece.ay+ty*t+ny*(piece.r+.75);
      if(this.isVisible(px,py))return true;
    }
    return false;
  }
  isExplored(x,y){
    if(typeof x==='object'){y=x.y;x=x.x;}
    const state=this.dungeon.active;if(!state)return true;
    const record=this._record(state),b=state.bounds;if(!within(x,y,b))return false;
    const col=Math.floor((x-b.minX)/TILE),row=Math.floor((y-b.minY)/TILE);
    return col>=0&&col<record.cols&&row>=0&&row<record.rows&&!!record.seen[row*record.cols+col];
  }
  knownWallSegments(wallId){const state=this.dungeon.active;if(!state)return [];const record=this._record(state);return wallId===undefined?record.known:record.knownByWall.get(wallId)||[];}
  getExploredRects(){
    const state=this.dungeon.active;if(!state)return [];
    const record=this._record(state);if(!record.dirty)return record.rects;
    const rects=[],b=state.bounds;
    for(let row=0;row<record.rows;row++)for(let col=0;col<record.cols;col++){
      if(!record.seen[row*record.cols+col])continue;
      const start=col;while(col+1<record.cols&&record.seen[row*record.cols+col+1])col++;
      rects.push({x:b.minX+start*TILE,y:b.minY+row*TILE,width:Math.min((col-start+1)*TILE,b.maxX-(b.minX+start*TILE)),height:Math.min(TILE,b.maxY-(b.minY+row*TILE))});
    }
    record.rects=rects;record.dirty=false;return rects;
  }
  clipVisible(ctx,offsetX=0,offsetY=0){
    this.ensureCurrent();ctx.beginPath();appendPolygon(ctx,this.polygon,offsetX,offsetY);ctx.clip();
  }
  drawFog(ctx,offsetX=0,offsetY=0,width,height){
    if(!this.ensureCurrent())return;
    const v=this.view,x=Number.isFinite(width)?0:v.minX+offsetX,y=Number.isFinite(height)?0:v.minY+offsetY,w=width??v.maxX-v.minX,h=height??v.maxY-v.minY;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);appendPolygon(ctx,this.polygon,offsetX,offsetY);ctx.clip('evenodd');
    ctx.fillStyle='rgba(4,8,12,.72)';ctx.fillRect(x,y,w,h);
    ctx.beginPath();ctx.rect(x,y,w,h);
    for(const r of this.getExploredRects())ctx.rect(r.x+offsetX,r.y+offsetY,r.width,r.height);
    ctx.clip('evenodd');ctx.fillStyle='#080c10';ctx.fillRect(x,y,w,h);ctx.restore();
  }
}
