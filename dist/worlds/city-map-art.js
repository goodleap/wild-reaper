import { WorldArt } from '../world-art.js';
import { SceneryArt } from '../scenery-art.js';
import { RiftCollision } from '../rift-collision.js';
import { createCityBlockScenery } from './city-block-scenery.js';
import { drawCityBridge } from '../city-structure-art.js';
import { drawCityNativeGround, drawCityNativeBridgeDeck } from './city-native-ground.js';

// Only diffuse material belongs in cached floor tiles. Every complete raised
// building, wall, plant and bridge rail is supplied to the shared depth queue.
export const CITY_PALETTE=Object.freeze({ground:'#d9d1b2',street:'#e4d8b6',grass:'#a4b884',forest:'#51664b',roof:'#64847e',roofDark:'#405e59',wall:'#c8c2a4',water:'#478b98',waterLight:'#a6c9b5'});
const FONT='"PingFang SC",system-ui,sans-serif';
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
const clamp=n=>Math.max(0,Math.min(1,n));
function trace(c,points,begin=true){if(begin)c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.closePath();}
function rings(c,items){c.beginPath();for(const item of items||[])trace(c,item.points||item,false);}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function bounds(points){return points.reduce((b,p)=>{p=xy(p);return{minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const GRID=384;
class FloorIndex{
  constructor(){this.cells=new Map();}
  add(value,b,pad=0){for(let y=Math.floor((b.minY-pad)/GRID);y<=Math.floor((b.maxY+pad)/GRID);y++)for(let x=Math.floor((b.minX-pad)/GRID);x<=Math.floor((b.maxX+pad)/GRID);x++){const key=`${x}:${y}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(value);}}
  query(b,pad=0){const found=new Set();for(let y=Math.floor((b.minY-pad)/GRID);y<=Math.floor((b.maxY+pad)/GRID);y++)for(let x=Math.floor((b.minX-pad)/GRID);x<=Math.floor((b.maxX+pad)/GRID);x++)for(const item of this.cells.get(`${x}:${y}`)||[])found.add(item);return [...found];}
}
// One synchronous tile painter owns one reusable pair. Growing only when
// needed avoids allocating and immediately destroying two GPU-backed surfaces
// for every newly revealed floor tile. One shared alpha stamp replaces dozens
// of identical radial gradients per tile. Oversize callers use temporary surfaces.
class GroundWorkspace{
  constructor(makeCanvas){this.makeCanvas=makeCanvas;this.mask=null;this.layer=null;this.stamp=null;this.allocations=0;}
  acquire(w,h){
    const temporary=w>1024||h>1024;
    if(temporary){this.allocations+=2;const mask=this.makeCanvas(),layer=this.makeCanvas();mask.width=layer.width=w;mask.height=layer.height=h;return{mask,layer,temporary};}
    if(!this.mask){this.mask=this.makeCanvas();this.layer=this.makeCanvas();this.allocations+=2;}
    for(const canvas of[this.mask,this.layer]){if(canvas.width<w)canvas.width=w;if(canvas.height<h)canvas.height=h;}
    return{mask:this.mask,layer:this.layer,temporary};
  }
  maskStamp(){
    if(!this.stamp){const stamp=this.makeCanvas();this.allocations++;stamp.width=stamp.height=256;const c=stamp.getContext('2d'),g=c.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#fff');g.addColorStop(.65,'#fff');g.addColorStop(1,'#fff0');c.fillStyle=g;c.fillRect(0,0,256,256);this.stamp=stamp;}
    return this.stamp;
  }
  release(){if(this.mask){this.mask.width=this.mask.height=this.layer.width=this.layer.height=0;}if(this.stamp)this.stamp.width=this.stamp.height=0;this.mask=this.layer=this.stamp=null;}
  get pixels(){return(this.mask?this.mask.width*this.mask.height+this.layer.width*this.layer.height:0)+(this.stamp?this.stamp.width*this.stamp.height:0);}

}
const prepared=new WeakMap();
function records(layout){let data=prepared.get(layout);if(data)return data;
  data={areas:(layout.areas||[]).map(value=>({value,bounds:bounds(value.points)})),lakes:(layout.lakes||[]).map(value=>({value,bounds:bounds(value.points)})),patches:(layout.patches||[]).map(value=>({value,bounds:bounds(value.points)})),bridges:(layout.passages||[]).filter(p=>p.kind==='bridge').map(value=>({value,bounds:bounds(value.deck||value.points)})),structures:(layout.cityStructures||[]).map(value=>({value,bounds:{minX:value.x-value.width/2,minY:value.y-value.depth/2,maxX:value.x+value.width/2,maxY:value.y+value.depth/2}})),routes:[]};
  for(const p of layout.passages||[])for(let i=1;i<(p.waypoints||[]).length;i++)data.routes.push({a:p.waypoints[i-1],b:p.waypoints[i],width:p.width});
  data.greenAreas=data.areas.filter(record=>GREEN_AREAS.has(record.value.id));data.routeIndex=new FloorIndex();data.structureIndex=new FloorIndex();
  for(const route of data.routes)data.routeIndex.add(route,{minX:Math.min(route.a.x,route.b.x),minY:Math.min(route.a.y,route.b.y),maxX:Math.max(route.a.x,route.b.x),maxY:Math.max(route.a.y,route.b.y)},route.width*.65);
  for(const item of data.structures)data.structureIndex.add(item,item.bounds,65);
  data.blockRoofs=createCityBlockScenery(layout).filter(p=>['house','ruin','warehouse','workshop','stable'].includes(p.cityArt));data.collision=new RiftCollision(layout);data.shores=new Map();data.wallRims=new Map();data.naturalRims=new Map();
  for(const edge of data.collision.high.edges){const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,len=Math.hypot(dx,dy);if(!len)continue;const count=Math.ceil(len/32);
    for(let i=0;i<count;i++){const t=(i+.5)/count,x=edge.a.x+dx*t,y=edge.a.y+dy*t;let area=null,best=Infinity;for(const a of layout.areas){const d=(a.center.x-x)**2+(a.center.y-y)**2;if(d<best){best=d;area=a;}}
      if(data.structures.some(({bounds:b})=>x>=b.minX-3&&x<=b.maxX+3&&y>=b.minY-3&&y<=b.maxY+3))continue;
      const key=`${Math.floor(x/384)}:${Math.floor(y/384)}`;
      if(GREEN_AREAS.has(area?.id)||x<-5400||x>5800||y<-4900||y>4100){
        if(!data.naturalRims.has(key))data.naturalRims.set(key,[]);data.naturalRims.get(key).push({x:x-edge.nx*10,y:y-edge.ny*10});continue;
      }
      if(!data.wallRims.has(key))data.wallRims.set(key,[]);
      data.wallRims.get(key).push({a:{x:edge.a.x+dx*i/count,y:edge.a.y+dy*i/count},b:{x:edge.a.x+dx*(i+1)/count,y:edge.a.y+dy*(i+1)/count},nx:edge.nx,ny:edge.ny});
    }
  }
  for(const {value:lake}of data.lakes)for(const ring of[lake.points,...(lake.holes||[]).map(h=>h.points||h)]){
    let carry=11;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
      for(let d=carry;d<len;d+=31){const x=a.x+dx*d/len,y=a.y+dy*d/len,nx=-dy/len,ny=dx/len,side=inPolygon(x+nx*5,y+ny*5,lake.points)?-1:1;
        if(data.bridges.some(({value:p})=>p.deck?.length>=2&&segmentDistance(x,y,p.deck[0],p.deck.at(-1))<p.width/2+28))continue;
        const key=`${Math.floor(x/384)}:${Math.floor(y/384)}`;if(!data.shores.has(key))data.shores.set(key,[]);data.shores.get(key).push({x,y,tx:dx/len,ty:dy/len,nx:nx*side,ny:ny*side});
      }carry=(carry-len)%31;if(carry<0)carry+=31;
    }
  }
  prepared.set(layout,data);return data;
}
function route(c,passage){const points=passage.waypoints||[];c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));}
function inPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=xy(points[i]),b=xy(points[j]);if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function segmentDistance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
function edgeDistance(x,y,points){let d=Infinity;for(let i=0;i<points.length;i++)d=Math.min(d,segmentDistance(x,y,xy(points[i]),xy(points[(i+1)%points.length])));return d;}
function dab(c,x,y,r,color,opacity){
  if(opacity<=0)return;
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.38,color);g.addColorStop(1,'#78905b00');
  c.save();c.globalAlpha*=opacity;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
}
const GREEN_AREAS=new Map([['01','#bdc69a'],['02','#a7bd83'],['13','#acc38c'],['S1','#9db47d']]);
const OLD_AREAS=new Set(['03','04','05','07','08','09','12','15','16','S2','S3']);
function maskDab(c,x,y,r,opacity,stamp){
  if(opacity<=0)return;c.save();c.globalAlpha*=opacity;c.drawImage(stamp,x-r,y-r,r*2,r*2);c.restore();
}
function grassMask(c,layout,view,stamp){
  const step=72,data=records(layout),areas=data.greenAreas.filter(record=>overlaps(record.bounds,view,100)),patches=data.patches.filter(record=>overlaps(record.bounds,view,100)),routes=data.routeIndex.query(view,182);
  for(let gy=Math.floor((view.minY-110)/step);gy<=Math.floor((view.maxY+110)/step);gy++)for(let gx=Math.floor((view.minX-110)/step);gx<=Math.floor((view.maxX+110)/step);gx++){
    const n=hash(gx+53,gy-71),x=(gx+.15+n*.7)*step,y=(gy+.15+hash(gy+37,gx)*.7)*step;
    // Broad grass transitions outside the city replace the old floor-clipped
    // pine crowns. Complete trees are supplied by Terrain instead.
    const outside=Math.max(-5400-x,x-5800,-4900-y,y-4100,0);let strength=clamp(outside/300);
    for(const {value:area}of areas)if(inPolygon(x,y,area.points))strength=Math.max(strength,clamp(edgeDistance(x,y,area.points)/120));
    for(const {value:patch}of patches)if(inPolygon(x,y,patch.points))strength=Math.max(strength,clamp(edgeDistance(x,y,patch.points)/90)*.48);
    if(!strength)continue;
    for(const path of routes){const d=segmentDistance(x,y,path.a,path.b);if(d<path.width*.65)strength*=.12+.88*clamp((d-path.width*.2)/(path.width*.45));}
    maskDab(c,x,y,68+n*22,strength,stamp);
  }
}
function naturalGround(c,layout,view,workspace){
  const data=records(layout),outside=view.minX<-5400||view.maxX>5800||view.minY<-4900||view.maxY>4100;
  if(!outside&&!data.greenAreas.some(record=>overlaps(record.bounds,view,110))&&!data.patches.some(record=>overlaps(record.bounds,view,110)))return false;
  const w=Math.ceil(view.maxX-view.minX),h=Math.ceil(view.maxY-view.minY),{mask,layer,temporary}=workspace.acquire(w,h);
  try{
    const m=mask.getContext('2d'),g=layer.getContext('2d');
    for(const [ctx,canvas]of[[m,mask],[g,layer]]){ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,canvas.width,canvas.height);}
    m.setTransform(1,0,0,1,-view.minX,-view.minY);grassMask(m,layout,view,workspace.maskStamp());
    g.fillStyle='#b4c392';g.fillRect(0,0,w,h);g.setTransform(1,0,0,1,-view.minX,-view.minY);
    for(let gy=Math.floor(view.minY/33)-1;gy<=Math.ceil(view.maxY/33);gy++)for(let gx=Math.floor(view.minX/39)-1;gx<=Math.ceil(view.maxX/39);gx++){
      const n=hash(gx+31,gy-47),x=(gx+n)*39,y=(gy+hash(gy,gx))*33;
      if(n<.5){g.fillStyle=n<.25?'#d9dfa350':'#8da27140';g.beginPath();g.ellipse(x,y,2+n*3,1,0,0,Math.PI*2);g.fill();}
      else{g.beginPath();g.moveTo(x-3,y);g.lineTo(x-4,y-4);g.moveTo(x,y+1);g.lineTo(x+2,y-4);g.strokeStyle=n>.8?'#e4e7b177':'#77935f58';g.lineWidth=.9;g.stroke();}
    }
    g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0,w,h,0,0,w,h);c.drawImage(layer,0,0,w,h,view.minX,view.minY,w,h);return true;
  }finally{if(temporary)mask.width=mask.height=layer.width=layer.height=0;}
}
function deepGreen(c,layout,view,scenery){
  const data=records(layout),mask=data.collision.high,structures=data.structureIndex.query(view,218);
  // The rooted low tier makes the real outline readable even on a small
  // garden island. It is cached floor cover; complete trunks stay depth sorted.
  for(let by=Math.floor((view.minY-40)/384);by<=Math.floor((view.maxY+40)/384);by++)for(let bx=Math.floor((view.minX-40)/384);bx<=Math.floor((view.maxX+40)/384);bx++)for(const p of data.naturalRims.get(`${bx}:${by}`)||[]){
    if(mask.inside(p.x,p.y))continue;const n=hash(p.x+19,p.y-7);scenery.drawShrub(c,{x:p.x,y:p.y,scale:.3+n*.13,seed:p.x*.13+p.y*.37,riftPalette:true});
  }
  for(let gy=Math.floor((view.minY-130)/74);gy<=Math.floor((view.maxY+130)/74);gy++)for(let gx=Math.floor((view.minX-130)/88);gx<=Math.floor((view.maxX+130)/88);gx++){
    const n=hash(gx+13,gy+11),m=hash(gy-33,gx+4),x=(gx+.15+n*.7)*88,y=(gy+.1+m*.8)*74;
    if(mask.inside(x,y)||(mask.nearest(x,y,110)?.distance??Infinity)<72)continue;
    let area=null,best=Infinity;for(const a of layout.areas){const d=(a.center.x-x)**2+(a.center.y-y)**2;if(d<best){best=d;area=a;}}
    const natural=GREEN_AREAS.has(area?.id)||x<-5400||x>5800||y<-4900||y>4100;if(!natural)continue;
    if(structures.some(q=>x>q.bounds.minX-65&&x<q.bounds.maxX+65&&y>q.bounds.minY-60&&y<q.bounds.maxY+60))continue;
    const seed=gx*37+gy*59;
    if(n>.83){scenery.drawRock(c,{x,y:y+13,r:24+n*15,rockForm:[0,1,2,4][Math.floor(m*4)],riftPalette:true});scenery.drawShrub(c,{x:x-17,y:y+23,scale:.5,seed,riftPalette:true});}
    else scenery.drawCanopy(c,{x,y,scale:.7+n*.35,treeForm:Math.floor(m*5),riftPalette:true});
  }
}
function gardenFloor(c,layout,view,overview){
  if(!overview)return;
  for(const {value:area,bounds:b}of records(layout).areas){const color=GREEN_AREAS.get(area.id);if(!color||!overlaps(b,view))continue;trace(c,area.points);c.fillStyle=color;c.fill();}
}
function agedPaving(c,layout,view){
  const data=records(layout),step=59;
  // Low moss follows actual wall contacts. Open paving keeps its quiet
  // weathered color instead of receiving regularly spaced circular stains.
  for(let gy=Math.floor((view.minY-14)/step);gy<=Math.ceil((view.maxY+14)/step);gy++)for(let gx=Math.floor((view.minX-14)/step);gx<=Math.ceil((view.maxX+14)/step);gx++){
    const n=hash(gx+221,gy-41);if(n<.45)continue;const x=(gx+.1+n*.8)*step,y=(gy+.2+hash(gy+73,gx)*.6)*step;
    const edge=data.collision.high.nearest(x,y,52);if(!edge||edge.distance>38)continue;
    for(let i=0;i<5;i++){
      const dx=(hash(gx+i*7,gy)-.5)*25,dy=(hash(gy+i*11,gx)-.5)*13,xx=x+dx,yy=y+dy;
      c.beginPath();c.moveTo(xx-3,yy+1);c.lineTo(xx-4,yy-1);c.lineTo(xx-1,yy-3);c.lineTo(xx+2,yy-2);c.lineTo(xx+4,yy);c.lineTo(xx+1,yy+2);c.closePath();c.fillStyle=i%2?'#98aa7559':'#819b6852';c.fill();
      if(i===1){c.beginPath();c.moveTo(xx,yy);c.lineTo(xx-2,yy-5);c.moveTo(xx+2,yy+1);c.lineTo(xx+4,yy-4);c.strokeStyle='#718b5f66';c.lineWidth=.7;c.stroke();}
    }
  }
}
function blockedMass(c,layout,view){c.fillStyle=CITY_PALETTE.forest;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);}
function water(c,layout,view,overview){
  for(const {value:lake,bounds:b}of records(layout).lakes){if(!overlaps(b,view,16))continue;
    lakePath(c,lake);c.fillStyle=CITY_PALETTE.water;c.fill('evenodd');c.save();lakePath(c,lake);c.clip('evenodd');
    if(overview){c.strokeStyle='#a8bdaf55';c.lineWidth=15;c.stroke();c.restore();continue;}
    // Layered wet edges stay wholly inside the original lake polygon. They
    // add material depth without moving the shore or closing any bridge.
    c.strokeStyle='#244d5e24';c.lineWidth=40;c.stroke();c.strokeStyle='#6c9c9435';c.lineWidth=14;c.stroke();c.strokeStyle='#b6c9af77';c.lineWidth=2;c.stroke();
    for(let gy=Math.floor((view.minY-20)/58);gy<=Math.floor((view.maxY+20)/58);gy++)for(let gx=Math.floor((view.minX-38)/85);gx<=Math.floor((view.maxX+38)/85);gx++){
      const n=hash(gx+105,gy+77),x=(gx+.12+n*.72)*85,y=(gy+.15+hash(gy+22,gx)*.7)*58,w=8+n*18;
      c.strokeStyle=n>.48?'#bcd4bd45':'#1f586d45';c.lineWidth=n>.8?1.2:.7;c.beginPath();c.moveTo(x-w,y);c.quadraticCurveTo(x,y-2-n*2,x+w,y-.8);c.stroke();
      if(n>.56){c.strokeStyle='#c6d4b62b';c.lineWidth=.6;c.beginPath();c.moveTo(x-w*.4,y+4);c.quadraticCurveTo(x+3,y+2,x+w*.55,y+3);c.stroke();}
    }
    c.restore();
  }
}
function streetRetainingWalls(c,layout,view){
  const data=records(layout);
  for(let by=Math.floor((view.minY-45)/384);by<=Math.floor((view.maxY+45)/384);by++)for(let bx=Math.floor((view.minX-45)/384);bx<=Math.floor((view.maxX+45)/384);bx++)for(const p of data.wallRims.get(`${bx}:${by}`)||[]){
    const {a,b,nx,ny}=p,height=13,depth=16,n=hash(a.x+13,a.y-5),backA={x:a.x-nx*depth,y:a.y-ny*depth},backB={x:b.x-nx*depth,y:b.y-ny*depth};
    trace(c,[a,b,{x:b.x,y:b.y-height},{x:a.x,y:a.y-height}]);c.fillStyle='#8e987d';c.fill();c.strokeStyle='#647a5c';c.lineWidth=.8;c.stroke();
    trace(c,[{x:a.x,y:a.y-height},{x:b.x,y:b.y-height},{x:backB.x,y:backB.y-height},{x:backA.x,y:backA.y-height}]);c.fillStyle=n>.5?'#c4c4a3':'#b9bea0';c.fill();c.strokeStyle='#7a8c6d';c.lineWidth=.7;c.stroke();
    c.beginPath();c.moveTo(a.x,a.y-height+.9);c.lineTo(b.x,b.y-height+.9);c.strokeStyle='#e2dec0';c.lineWidth=1.1;c.stroke();
    if(n>.63){c.beginPath();c.moveTo(backA.x,backA.y-height);c.lineTo(a.x*.55+b.x*.45,a.y*.55+b.y*.45-height+3);c.strokeStyle='#80966080';c.lineWidth=2;c.stroke();}
  }
}
function shoreDetails(c,layout,view){
  const data=records(layout);
  for(let by=Math.floor((view.minY-35)/384);by<=Math.floor((view.maxY+35)/384);by++)for(let bx=Math.floor((view.minX-35)/384);bx<=Math.floor((view.maxX+35)/384);bx++)for(const p of data.shores.get(`${bx}:${by}`)||[]){
    const n=hash(p.x+14,p.y-27),x=p.x+p.nx*5,y=p.y+p.ny*5;
    c.save();c.translate(x,y);c.rotate(Math.atan2(p.ty,p.tx));
    c.beginPath();c.moveTo(-14,-4);c.lineTo(13,-4);c.lineTo(15,5);c.lineTo(-13,6);c.closePath();c.fillStyle=n>.5?'#b8b99b':'#c3bda0';c.fill();c.strokeStyle='#687e6b80';c.lineWidth=.8;c.stroke();c.beginPath();c.moveTo(-11,-2);c.lineTo(11,-2);c.strokeStyle='#e5dfbc';c.lineWidth=1.2;c.stroke();c.restore();
    if(n>.83){for(let i=0;i<3;i++){const xx=x+p.nx*11+(i-1)*3,yy=y+p.ny*11;c.beginPath();c.moveTo(xx,yy);c.quadraticCurveTo(xx+(i-1)*2,yy-6,xx+(i-1)*3,yy-12-n*6);c.strokeStyle=i%2?'#899b65':'#667e55';c.lineWidth=1.2;c.stroke();}}
  }
}
function overviewRoof(c,s){const x=s.x-s.width/2,y=s.y-s.depth/2;if(s.solid){c.fillStyle=s.cityKind==='wall'||s.cityKind==='tower'?'#b8bca4':CITY_PALETTE.roof;c.fillRect(x,y,s.width,s.depth);c.strokeStyle='#334f53';c.lineWidth=10;c.strokeRect(x,y,s.width,s.depth);c.strokeStyle='#b6c8c0';c.lineWidth=5;c.beginPath();c.moveTo(x+4,y+4);c.lineTo(x+s.width-4,y+4);c.stroke();}else if(!['gate','arcade'].includes(s.cityKind)){c.fillStyle='#9b997a';c.fillRect(x,y,s.width,s.depth);}}

export class CityMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.ground=new WorldArt(makeCanvas);this.scenery=new SceneryArt(makeCanvas);this.workspace=new GroundWorkspace(makeCanvas);}
  get cacheStats(){const a=this.ground.cacheStats,b=this.scenery.cacheStats,result=Object.fromEntries(['entries','pixels','bytes','limitBytes','builds'].map(key=>[key,(a[key]||0)+(b[key]||0)]));const pixels=this.workspace.pixels;return{...result,pixels:result.pixels+pixels,bytes:result.bytes+pixels*4,limitBytes:result.limitBytes+(2*1024*1024+256*256)*4,workingCanvasBytes:pixels*4,workingCanvasAllocations:this.workspace.allocations};}
  releaseWorkingSet(){this.workspace.release();}
  paintTile(c,layout,view){
    c.save();c.lineCap='round';c.lineJoin='round';blockedMass(c,layout,view);
    // Never clip paving at the collision union: the very same diffuse must
    // continue beneath every foundation and complete depth-sorted sprite.
    drawCityNativeGround(c,layout,view);naturalGround(c,layout,view,this.workspace);agedPaving(c,layout,view);
    streetRetainingWalls(c,layout,view);water(c,layout,view,false);shoreDetails(c,layout,view);deepGreen(c,layout,view,this.scenery);
    for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,p.width/2))drawCityNativeBridgeDeck(c,layout,p,view);
    c.restore();return true;
  }
}

export function drawCityOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  if(layout?.artTheme!=='city')return false;const view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';blockedMass(c,layout,view,true);water(c,layout,view,true);rings(c,layout.boundaries);c.fillStyle=CITY_PALETTE.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries);c.clip('evenodd');gardenFloor(c,layout,view,true);for(const {value:p,bounds:b}of records(layout).patches)if(overlaps(b,view)){trace(c,p.points);c.fillStyle=CITY_PALETTE.grass;c.fill();}for(const p of layout.passages||[]){if(p.from===p.to)continue;route(c,p);c.strokeStyle=p.mainRoute?'#d4c78c':'#bcc3a3';c.lineWidth=Math.min(p.width*.5,100);c.stroke();}c.restore();
  for(const p of records(layout).blockRoofs){const b={minX:p.x-p.width/2,minY:p.y-p.depth/2,maxX:p.x+p.width/2,maxY:p.y+p.depth/2};if(overlaps(b,view))overviewRoof(c,{...p,solid:true});}
  for(const {value:s,bounds:b}of records(layout).structures)if(overlaps(b,view))overviewRoof(c,s);
  for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,12))drawCityBridge(c,p,{overview:true});
  if(landmarks){for(const [key,p]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const boss=/^boss/.test(key),cave=/^cave/.test(key),treasure=/^treasure/.test(key);if(!boss&&!cave&&!treasure)continue;c.fillStyle=boss?'#aa4d51':cave?'#776389':'#dfbe65';c.strokeStyle='#f3eacb';c.lineWidth=1/scale;c.beginPath();c.arc(p.x,p.y,(boss?6:4)/scale,0,Math.PI*2);c.fill();c.stroke();}}
  if(labels){c.font=`600 ${11/scale}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.lineWidth=3/scale;c.strokeStyle='#f2ebd1';c.fillStyle='#263e3d';for(const area of layout.areas||[]){const p=area.label||area.center;if(!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const name=`${area.id} ${area.name}`;c.strokeText(name,p.x,p.y);c.fillText(name,p.x,p.y);}}
  c.restore();return true;
}
