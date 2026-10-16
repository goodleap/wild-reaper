import { RiftCollision } from '../rift-collision.js';

const cache=new WeakMap();
const hash=n=>{const value=Math.sin(n*127.1+41.7)*43758.5453;return value-Math.floor(value);};
const distanceToSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
export const emberSceneryTone=(area,seed=0)=>area.id==='08'?'oasis':area.id==='11'?'charred':area.material==='forest'?'amber':area.id==='03'&&seed<.6?'terracotta':'basalt';

// Only authored ground capsules add collisions. Raised crowns and contour
// dressing use the same depth/fading queue while the merged outline remains
// the sole physical boundary, so a long tree/rock edge has no collider seams.
export function createEmberScenery(layout){
  if(cache.has(layout))return cache.get(layout);
  const props=(layout.emberScene?.props??[]).map(prop=>({...prop}));
  const collision=new RiftCollision(layout),b=layout.bounds;
  for(const [ringIndex,ring] of layout.solidBoundaries.entries()){
    let travelled=0,next=19,sample=0;
    for(let i=0;i<ring.points.length;i++){
      const a=ring.points[i],z=ring.points[(i+1)%ring.points.length],dx=z.x-a.x,dy=z.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      const nx=-dy/length,ny=dx/length;
      while(next<travelled+length){
        const t=(next-travelled)/length,n=ringIndex*8731+sample*43,px=a.x+dx*t,py=a.y+dy*t;
        next+=49+hash(n+1)*16;sample++;
        const side=collision.circleFree(px+nx*3,py+ny*3,0,'air')?-1:1;
        const area=layout.areas.reduce((best,item)=>Math.hypot(item.center.x-px,item.center.y-py)<Math.hypot(best.center.x-px,best.center.y-py)?item:best,layout.areas[0]);
        const forest=area.material==='forest',roll=hash(n+11),kind=forest?(roll<.43?'tree':roll<.90?'shrub':'basalt'):(roll<.78?'basalt':roll<.90?'ore':'shrub');
        const offset=kind==='tree'?24+hash(n+8)*15:kind==='shrub'?18+hash(n+8)*9:31+hash(n+8)*8;
        const x=px+nx*side*offset,y=py+ny*side*offset;
        if(x<b.minX||x>b.maxX||y<b.minY||y>b.maxY||collision.circleFree(x,y,0,'air'))continue;
        if(layout.emberScene.bridges.some(bridge=>distanceToSegment({x,y},...bridge.deck)<bridge.width/2+65))continue;
        const width=kind==='tree'?24:kind==='shrub'?42:66+Math.floor(hash(n+14)*18),depth=kind==='tree'?24:kind==='shrub'?30:45;
        const halfLength=(width-depth)/2;
        props.push({id:`ember-edge:${ringIndex}:${sample}`,variant:'ember-native',emberKind:kind,type:halfLength?'log':kind==='tree'?'tree':'rock',x,y,width,depth,height:kind==='tree'?90+hash(n+7)*25:kind==='shrub'?28+hash(n+7)*12:49+hash(n+7)*17,visualWidth:kind==='tree'?95+hash(n+5)*23:kind==='shrub'?69+hash(n+5)*14:width+12,r:depth/2,halfLength,angle:0,scale:1,seed:hash(n+3),collision:false,heightBand:kind==='tree'?'high':'low',area:area.id,tone:emberSceneryTone(area,hash(n+19)),emberEdge:true});
      }
      travelled+=length;
    }
  }
  const result=Object.freeze(props.map(Object.freeze));cache.set(layout,result);return result;
}
