import { WorldArt } from '../world-art.js';
import { cityArtLibrary } from '../city-art-library.js';
import { drawCityBridge } from '../city-structure-art.js';
import { drawCityNativeGround, drawCityNativeBridgeDeck } from './city-native-ground.js';

// Only diffuse material belongs in cached floor tiles. Every complete raised
// building, wall, plant and bridge rail is supplied to the shared depth queue.
export const CITY_PALETTE=Object.freeze({ground:'#969c86',street:'#a4aa96',grass:'#8caa70',forest:'#415b48',roof:'#547181',roofDark:'#344f5d',wall:'#acb09a',water:'#3b7988',waterLight:'#80aaa5'});
const FONT='"PingFang SC",system-ui,sans-serif';
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
const clamp=n=>Math.max(0,Math.min(1,n));
function trace(c,points,begin=true){if(begin)c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.closePath();}
function rings(c,items){c.beginPath();for(const item of items||[])trace(c,item.points||item,false);}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function bounds(points){return points.reduce((b,p)=>{p=xy(p);return{minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const prepared=new WeakMap();
function records(layout){let data=prepared.get(layout);if(data)return data;
  data={areas:(layout.areas||[]).map(value=>({value,bounds:bounds(value.points)})),lakes:(layout.lakes||[]).map(value=>({value,bounds:bounds(value.points)})),patches:(layout.patches||[]).map(value=>({value,bounds:bounds(value.points)})),bridges:(layout.passages||[]).filter(p=>p.kind==='bridge').map(value=>({value,bounds:bounds(value.deck||value.points)})),structures:(layout.cityStructures||[]).map(value=>({value,bounds:{minX:value.x-value.width/2,minY:value.y-value.depth/2,maxX:value.x+value.width/2,maxY:value.y+value.depth/2}})),routes:[]};
  for(const p of layout.passages||[])for(let i=1;i<(p.waypoints||[]).length;i++)data.routes.push({a:p.waypoints[i-1],b:p.waypoints[i],width:p.width});
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
const GREEN_AREAS=new Map([['01','#a1a679'],['02','#889e68'],['13','#98a779'],['S1','#819968']]);
const OLD_AREAS=new Set(['03','04','05','07','08','09','12','15','16','S2','S3']);
function maskDab(c,x,y,r,opacity){
  if(opacity<=0)return;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#fff');g.addColorStop(.65,'#fff');g.addColorStop(1,'#fff0');
  c.save();c.globalAlpha*=opacity;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
}
function grassMask(c,layout,view){
  const step=72,data=records(layout),areas=data.areas.filter(record=>GREEN_AREAS.has(record.value.id)&&overlaps(record.bounds,view,100)),patches=data.patches.filter(record=>overlaps(record.bounds,view,100));
  for(let gy=Math.floor((view.minY-110)/step);gy<=Math.floor((view.maxY+110)/step);gy++)for(let gx=Math.floor((view.minX-110)/step);gx<=Math.floor((view.maxX+110)/step);gx++){
    const n=hash(gx+53,gy-71),x=(gx+.15+n*.7)*step,y=(gy+.15+hash(gy+37,gx)*.7)*step;
    // Broad grass transitions outside the city replace the old floor-clipped
    // pine crowns. Complete trees are supplied by Terrain instead.
    const outside=Math.max(-5400-x,x-6750,-4900-y,y-4700,0);let strength=clamp(outside/300);
    for(const {value:area}of areas)if(inPolygon(x,y,area.points))strength=Math.max(strength,clamp(edgeDistance(x,y,area.points)/120));
    for(const {value:patch}of patches)if(inPolygon(x,y,patch.points))strength=Math.max(strength,clamp(edgeDistance(x,y,patch.points)/90)*.48);
    if(!strength)continue;
    for(const path of data.routes){const d=segmentDistance(x,y,path.a,path.b);if(d<path.width*.65)strength*=.12+.88*clamp((d-path.width*.2)/(path.width*.45));}
    maskDab(c,x,y,68+n*22,strength);
  }
}
function naturalGround(c,layout,view,makeCanvas){
  const data=records(layout),outside=view.minX<-5400||view.maxX>6750||view.minY<-4900||view.maxY>4700;
  if(!outside&&!data.areas.some(record=>GREEN_AREAS.has(record.value.id)&&overlaps(record.bounds,view,110))&&!data.patches.some(record=>overlaps(record.bounds,view,110)))return false;
  const image=cityArtLibrary.getImage('grassGround');if(!image)throw new Error('Native city grass ground must be preloaded before floor tiles are built.');
  // These two tile-sized intermediates are built only on a cold 384-unit
  // RiftArt tile. They are released immediately; warm frames allocate none.
  const mask=makeCanvas(),layer=makeCanvas(),w=Math.ceil(view.maxX-view.minX),h=Math.ceil(view.maxY-view.minY);mask.width=layer.width=w;mask.height=layer.height=h;
  try{
    const m=mask.getContext('2d'),g=layer.getContext('2d');m.setTransform(1,0,0,1,-view.minX,-view.minY);grassMask(m,layout,view);
    g.setTransform(1,0,0,1,-view.minX,-view.minY);drawCityNativeGround(g,layout,view,{image});g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);c.drawImage(layer,view.minX,view.minY);return true;
  }finally{mask.width=mask.height=layer.width=layer.height=0;}
}
function gardenFloor(c,layout,view,overview){
  if(!overview)return;
  for(const {value:area,bounds:b}of records(layout).areas){const color=GREEN_AREAS.get(area.id);if(!color||!overlaps(b,view))continue;trace(c,area.points);c.fillStyle=color;c.fill();}
}
function agedPaving(c,layout,view){
  for(const {value:area,bounds:b}of records(layout).areas){if(!OLD_AREAS.has(area.id)||!overlaps(b,view,45))continue;
    const step=94;
    for(let gy=Math.floor(Math.max(view.minY-45,b.minY)/step);gy<=Math.floor(Math.min(view.maxY+45,b.maxY)/step);gy++)for(let gx=Math.floor(Math.max(view.minX-45,b.minX)/step);gx<=Math.floor(Math.min(view.maxX+45,b.maxX)/step);gx++){
      const n=hash(gx+221,gy-41);if(n<.79)continue;
      const x=(gx+.1+n*.8)*step,y=(gy+.2+hash(gy+73,gx)*.6)*step;if(!inPolygon(x,y,area.points))continue;
      const strength=clamp(edgeDistance(x,y,area.points)/85);dab(c,x,y,18+n*19,'#789261',strength*.32);
      if(n<.91)continue;c.save();c.globalAlpha*=strength*.33;c.strokeStyle='#4c5846';c.lineWidth=.8;c.beginPath();c.moveTo(x-9,y-7);c.lineTo(x-2,y-3);c.lineTo(x+1,y+3);c.lineTo(x+9,y+6);c.moveTo(x-2,y-3);c.lineTo(x+3,y-7);c.stroke();c.restore();
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
function overviewRoof(c,s){const x=s.x-s.width/2,y=s.y-s.depth/2;if(s.solid){c.fillStyle=s.cityKind==='wall'||s.cityKind==='tower'?'#b8bca4':CITY_PALETTE.roof;c.fillRect(x,y,s.width,s.depth);c.strokeStyle='#334f53';c.lineWidth=10;c.strokeRect(x,y,s.width,s.depth);c.strokeStyle='#b6c8c0';c.lineWidth=5;c.beginPath();c.moveTo(x+4,y+4);c.lineTo(x+s.width-4,y+4);c.stroke();}else if(!['gate','arcade'].includes(s.cityKind)){c.fillStyle='#9b997a';c.fillRect(x,y,s.width,s.depth);}}

export class CityMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.ground=new WorldArt(makeCanvas);}
  get cacheStats(){return this.ground.cacheStats;}
  paintTile(c,layout,view){
    c.save();c.lineCap='round';c.lineJoin='round';blockedMass(c,layout,view);
    // Never clip paving at the collision union: the very same diffuse must
    // continue beneath every foundation and complete depth-sorted sprite.
    drawCityNativeGround(c,layout,view);naturalGround(c,layout,view,this.makeCanvas);agedPaving(c,layout,view);
    water(c,layout,view,false);
    for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,p.width/2))drawCityNativeBridgeDeck(c,layout,p,view);
    c.restore();return true;
  }
}

export function drawCityOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  if(layout?.artTheme!=='city')return false;const view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';blockedMass(c,layout,view,true);water(c,layout,view,true);rings(c,layout.boundaries);c.fillStyle=CITY_PALETTE.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries);c.clip('evenodd');gardenFloor(c,layout,view,true);for(const {value:p,bounds:b}of records(layout).patches)if(overlaps(b,view)){trace(c,p.points);c.fillStyle=CITY_PALETTE.grass;c.fill();}for(const p of layout.passages||[]){if(p.from===p.to)continue;route(c,p);c.strokeStyle=p.mainRoute?'#d4c78c':'#bcc3a3';c.lineWidth=Math.min(p.width*.5,100);c.stroke();}c.restore();
  for(const {value:s,bounds:b}of records(layout).structures)if(overlaps(b,view))overviewRoof(c,s);
  for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,12))drawCityBridge(c,p,{overview:true});
  if(landmarks){for(const [key,p]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const boss=/^boss/.test(key),cave=/^cave/.test(key),treasure=/^treasure/.test(key);if(!boss&&!cave&&!treasure)continue;c.fillStyle=boss?'#aa4d51':cave?'#776389':'#dfbe65';c.strokeStyle='#f3eacb';c.lineWidth=1/scale;c.beginPath();c.arc(p.x,p.y,(boss?6:4)/scale,0,Math.PI*2);c.fill();c.stroke();}}
  if(labels){c.font=`600 ${11/scale}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.lineWidth=3/scale;c.strokeStyle='#f2ebd1';c.fillStyle='#263e3d';for(const area of layout.areas||[]){const p=area.label||area.center;if(!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const name=`${area.id} ${area.name}`;c.strokeText(name,p.x,p.y);c.fillText(name,p.x,p.y);}}
  c.restore();return true;
}
