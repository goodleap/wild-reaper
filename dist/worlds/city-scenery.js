// Baked rectangular foundations already belong to both city collision masks.
// Their depth-sorted artwork is a separate, immutable view of the same records.
import { RiftCollision, riftPointInPolygon } from '../rift-collision.js';
const cache=new WeakMap();
const identity=text=>[...String(text)].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,17);
const hash=n=>{const value=Math.sin(n*127.1+41.7)*43758.5453;return value-Math.floor(value);};
const polygonBounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function createCityScenery(layout,collision,island){
  if(cache.has(layout))return cache.get(layout);
  const props=(layout.cityStructures??[]).map(structure=>{
    const {width,depth}=structure,long=Math.max(width,depth),short=Math.min(width,depth),square=width===depth;
    // This capsule is an indexing bound only. Use its long axis so that a
    // narrow north/south wall is not lost when the camera queries its end.
    // Square pieces use rock: obstacle() intentionally defaults zero log
    // halfLength to 55 for legacy logs, which would enlarge square bounds.
    return Object.freeze({...structure,
      region:layout.worldId,type:square?'rock':'log',variant:'city-structure',
      r:short/2,halfLength:square?0:(long-short)/2,angle:depth>width?Math.PI/2:0,
      scale:1,seed:identity(structure.id)/4294967296,
      collision:false,heightBand:'high',sortY:structure.y+depth/2
    });
  });
  const mask=collision??new RiftCollision(layout),vegetation=[];
  const onFoundation=(x,y,pad=0)=>(layout.cityStructures??[]).some(s=>Math.abs(x-s.x)<=s.width/2+pad&&Math.abs(y-s.y)<=s.depth/2+pad);
  const wet=(x,y)=>(layout.lakes??[]).some(lake=>riftPointInPolygon({x,y},lake.points)&&!(lake.holes??[]).some(h=>riftPointInPolygon({x,y},h.points??h)));
  const nearTarget=(p,r)=>distance(p,layout.spawn)<260+r||Object.values(layout.plan??{}).some(q=>distance(p,q)<(q.r??90)+r)||(layout.encounters??[]).some(q=>distance(p,q)<(q.r??145)+r);
  const safeShrub=(p,patch)=>riftPointInPolygon(p,patch.points)&&mask.circleFree(p.x,p.y,28,'ground')&&!onFoundation(p.x,p.y,35)&&!nearTarget(p,24)&&!island?.isReservedCapsule?.(p.x,p.y,p.x,p.y,22)&&vegetation.every(q=>distance(p,q)>45);
  // Low rooted sprays may dress passable ground, but never add a trunk that
  // walkers could pass through. The few campside patches are view decoration,
  // not new authored geometry or new reservations.
  const patches=(layout.patches??[]).filter(p=>/:02:|:13:/.test(p.id));
  const camp=layout.areas?.find(a=>a.id==='01');
  if(camp){const p=camp.center;for(const [dx,dy]of[[-239,-183],[239,-183],[-239,183],[239,183]])patches.push({id:`city-camp-brush:${dx}:${dy}`,points:[{x:p.x+dx-25,y:p.y+dy-25},{x:p.x+dx+25,y:p.y+dy-25},{x:p.x+dx+25,y:p.y+dy+25},{x:p.x+dx-25,y:p.y+dy+25}],single:true});}
  for(const patch of patches){
    const b=polygonBounds(patch.points),seed=identity(patch.id),target=patch.single?1:3+Math.floor(hash(seed+9)*2);let placed=0;
    for(let attempt=0;attempt<180&&placed<target;attempt++){
      const n=seed+attempt*37,p={x:b.minX+hash(n)*(b.maxX-b.minX),y:b.minY+hash(n+13)*(b.maxY-b.minY)};
      if(!safeShrub(p,patch))continue;
      vegetation.push(Object.freeze({id:`city-brush:${patch.id}:${placed++}`,type:'tree',...p,r:8,scale:.38+hash(n+5)*.16,seed:hash(n+3),riftShrub:true,cityAmbient:true,collision:false,heightBand:'low'}));
    }
  }
  // Complete trees only stand in already blocked land along the outer camp
  // and orchard. Their full root disks are outside the walkable high mask.
  for(const area of layout.areas??[]){
    if(!['01','02'].includes(area.id))continue;let placed=0;
    for(let i=0;i<area.points.length&&placed<14;i++){
      const a=area.points[i],b=area.points[(i+1)%area.points.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
      for(let d=90;d<len&&placed<14;d+=420){
        const n=identity(`${area.id}:${i}:${d}`);if(hash(n)<.2)continue;
        for(const side of[-1,1]){
          const x=a.x+dx*d/len-dy/len*side*34,y=a.y+dy*d/len+dx/len*side*34;
          if(x>-5400&&y<4100||onFoundation(x,y,78)||wet(x,y)||island&&!island.contains(x,y,18))continue;
          if([[0,0],[-12,0],[12,0],[0,-12],[0,12]].some(([ox,oy])=>mask.high.inside(x+ox,y+oy)))continue;
          if(vegetation.some(p=>Math.hypot(x-p.x,y-p.y)<105))continue;
          vegetation.push(Object.freeze({id:`city-edge:${area.id}:${placed++}`,type:'tree',x,y,r:12,scale:.72+hash(n+7)*.18,seed:hash(n+3),treeForm:Math.floor(hash(n+4)*5),cityAmbient:true,cityEdge:true,collision:false,heightBand:'high'}));break;
        }
      }
    }
  }
  const result=Object.freeze([...props,...vegetation]);cache.set(layout,result);return result;
}
