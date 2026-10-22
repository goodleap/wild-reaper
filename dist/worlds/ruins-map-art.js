import { SceneryArt } from '../scenery-art.js';
import { RiftCollision } from '../rift-collision.js';
import { RuinsPropArt } from '../ruins-art.js';

export const RUINS_GROUND=Object.freeze({soil:'#ded7b8',dust:'#d0ccb0',paving:'#c7c8ad',moss:'#a1b47d',forest:'#4c654c',stone:'#8c9780',water:'#568e89',waterDeep:'#3d716d',waterEdge:'#8bb3a0'});
const TAU=Math.PI*2,GRID=384,prepared=new WeakMap();
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
const overlaps=(a,b,pad=0)=>a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
function trace(c,points,begin=true){if(begin)c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.closePath();}
function rings(c,items){c.beginPath();for(const ring of items||[])trace(c,ring.points||ring,false);}
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function rectangle(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function nearest(layout,x,y){let best=layout.areas[0],distance=Infinity;for(const area of layout.areas){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<distance){best=area;distance=d;}}return best;}
class Index{
  constructor(){this.cells=new Map();}
  add(value,b,pad=0){for(let x=Math.floor((b.minX-pad)/GRID);x<=Math.floor((b.maxX+pad)/GRID);x++)for(let y=Math.floor((b.minY-pad)/GRID);y<=Math.floor((b.maxY+pad)/GRID);y++){const key=`${x}:${y}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(value);}}
  query(b,pad=0){const found=new Set();for(let x=Math.floor((b.minX-pad)/GRID);x<=Math.floor((b.maxX+pad)/GRID);x++)for(let y=Math.floor((b.minY-pad)/GRID);y<=Math.floor((b.maxY+pad)/GRID);y++)for(const item of this.cells.get(`${x}:${y}`)||[])found.add(item);return found;}
}
function records(layout){
  let data=prepared.get(layout);if(data)return data;data={layout,collision:new RiftCollision(layout),areas:new Index(),patches:new Index(),lakes:new Index(),bridges:new Index(),routes:new Index()};
  for(const name of ['areas','patches','lakes'])for(const value of layout[name]||[])data[name].add(value,bounds(value.points),32);
  for(const passage of layout.passages||[]){if(passage.kind==='bridge')data.bridges.add(passage,bounds(passage.points),30);for(let i=1;i<passage.waypoints.length;i++){const a=passage.waypoints[i-1],b=passage.waypoints[i];data.routes.add({a,b,width:passage.width},bounds([a,b]),passage.width);}}
  prepared.set(layout,data);return data;
}
function clipGround(c,data){rings(c,data.layout.boundaries);c.clip('evenodd');}
function clipBlocked(c,data,view){c.beginPath();c.rect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);for(const ring of data.layout.solidBoundaries||data.layout.boundaries)trace(c,ring.points,false);c.clip('evenodd');}
function soil(c,data,view,overview){
  const P=RUINS_GROUND;rectangle(c,view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY,P.forest);
  // All open floor and its tiny edge wear follow the movement geometry.
  rings(c,data.layout.boundaries);c.fillStyle=P.soil;c.fill('evenodd');c.save();clipGround(c,data);
  c.strokeStyle='#8b9f7360';c.lineWidth=overview?32:18;c.stroke();
  for(const area of data.areas.query(view,20)){
    const b=bounds(area.points);if(!overlaps(b,view,40))continue;
    if(overview){trace(c,area.points);c.fillStyle=area.material==='forest'?'#b9c598':'#d9d5b7';c.fill();continue;}
    const radius=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.62,g=c.createRadialGradient(area.center.x,area.center.y,30,area.center.x,area.center.y,radius);g.addColorStop(0,area.material==='forest'?'#a9bd8866':'#f1e9cb44');g.addColorStop(1,'#d3d1b000');c.fillStyle=g;c.fillRect(b.minX-50,b.minY-50,b.maxX-b.minX+100,b.maxY-b.minY+100);
  }
  for(const patch of data.patches.query(view,24)){trace(c,patch.points);c.fillStyle='#a7b98a60';c.strokeStyle='#a7b98a25';c.lineWidth=24;c.fill();c.stroke();}
  if(overview)for(const route of data.routes.query(view,20))line(c,[route.a,route.b],'#e6ddbc',route.width*.48);
  if(!overview){
    // Surviving paving forms connected, eroded patches. A coherent field
    // exposes soil between patches rather than scattering a tile icon grid.
    for(let gy=Math.floor((view.minY-55)/39);gy<=Math.floor((view.maxY+55)/39);gy++)for(let gx=Math.floor((view.minX-70)/59);gx<=Math.floor((view.maxX+70)/59);gx++){
      const x=gx*59+(gy%2)*29.5,y=gy*39,n=hash(gx+71,gy+39),area=nearest(data.layout,x,y);if(area.material==='forest'||!data.collision.ground.inside(x,y))continue;
      const weather=Math.sin(x/227+Math.sin(y/301)*.7)*.44+Math.cos(y/193)*.33+Math.sin((x-y)/389)*.28,central=area.id==='11'&&Math.abs(x-area.center.x)<190&&Math.abs(y-area.center.y)<130,field=central?Math.max(.61,weather):weather;
      if(field<.19||n<.06)continue;const alpha=Math.min(.86,(field-.13)*1.45),w=57,h=37,j=hash(gx,gy+12),pts=[{x:x-w/2+2+j*3,y:y-h/2},{x:x+w/2-2,y:y-h/2+1},{x:x+w/2,y:y+h/2-2-j*4},{x:x+w/2-4-j*2,y:y+h/2},{x:x-w/2,y:y+h/2-1},{x:x-w/2,y:y-h/2+5}];
      c.save();c.globalAlpha*=alpha;trace(c,pts);c.fillStyle=['#c0c3a5','#c8c9ad','#d4d0b3','#bfc4a7'][Math.floor(n*4)];c.fill();line(c,pts.slice(0,3),'#e6dfc1',.9);line(c,pts.slice(2),'#8c9a7c88',.85);
      if(n>.88)line(c,[{x:x-7,y:y-h*.4},{x:x-2,y:y+1},{x:x+7,y:y+h*.35}],'#84957888',.8);
      if(n>.62&&field<.4){line(c,[{x:x-w/2+2,y:y+h/2-2},{x:x-4,y:y+h/2-1}],'#9daf7a',2);}
      c.restore();
    }
    const temple=data.layout.areas.find(a=>a.id==='11');
    if(temple&&overlaps({minX:temple.center.x-220,maxX:temple.center.x+220,minY:temple.center.y-200,maxY:temple.center.y+200},view)){
      const {x,y}=temple.center;c.save();c.globalAlpha*=.38;
      for(const inset of[0,13]){const r=151-inset;c.beginPath();c.moveTo(x-r,y-91+inset);c.lineTo(x+105,y-91+inset);c.moveTo(x+r,y-63);c.lineTo(x+r,y+80-inset);c.lineTo(x-113,y+80-inset);c.moveTo(x-r,y+53);c.lineTo(x-r,y-91+inset);c.strokeStyle=inset?'#b5b899':'#869a79';c.lineWidth=inset?2:3;c.stroke();}
      line(c,[{x:x-59,y},{x,y:y-44},{x:x+59,y},{x,y:y+44},{x:x-59,y}],'#829773',3);line(c,[{x:x-38,y},{x,y:y-27},{x:x+38,y},{x,y:y+27},{x:x-38,y}],'#d9d5b5',3);c.restore();
    }
    for(let gy=Math.floor(view.minY/34)-1;gy<=Math.floor(view.maxY/34)+1;gy++)for(let gx=Math.floor(view.minX/38)-1;gx<=Math.floor(view.maxX/38)+1;gx++){
      const n=hash(gx+27,gy+41),x=(gx+.15+n*.7)*38,y=(gy+.2+hash(gy,gx+19)*.65)*34;if(!data.collision.ground.inside(x,y))continue;
      if(n>.91){line(c,[{x:x-2,y},{x:x-4,y:y-4}],'#8eaa6c77',1);line(c,[{x,y:y+1},{x:x+2,y:y-4}],'#a2b67b88',1);}
      else if(n>.3){line(c,[{x,y},{x:x+2+n*3,y:y+.7}],'#9ca18350',.9);line(c,[{x:x+.5,y:y-1},{x:x+2+n*3,y:y-.5}],'#f3eccd6b',.7);}
    }
  }c.restore();
}
function water(c,data,view,overview){
  const lakes=[...data.lakes.query(view,30)];if(!lakes.length)return;
  c.save();rings(c,data.layout.lakes);c.fillStyle=RUINS_GROUND.water;c.fill('evenodd');c.clip('evenodd');
  c.strokeStyle=RUINS_GROUND.waterDeep;c.lineWidth=overview?35:32;c.stroke();c.strokeStyle=RUINS_GROUND.waterEdge;c.lineWidth=overview?16:10;c.stroke();
  if(!overview)for(let gy=Math.floor(view.minY/46)-1;gy<=Math.floor(view.maxY/46)+1;gy++)for(let gx=Math.floor(view.minX/68)-1;gx<=Math.floor(view.maxX/68)+1;gx++){
    const n=hash(gx+7,gy+21),x=(gx+n)*68,y=(gy+hash(gx+15,gy))*46;line(c,[{x,y},{x:x+12+n*19,y:y-1}],'#c0d3b649',1);if(n>.75)line(c,[{x:x+4,y:y+3},{x:x+12,y:y+3}],'#32636042',1);
  }c.restore();
}
function barriers(c,data,view,overview,scenery,props){
  c.save();clipBlocked(c,data,view);
  if(overview){
    for(const area of data.layout.areas){const b=bounds(area.points),radius=Math.max(b.maxX-b.minX,b.maxY-b.minY);if(!overlaps({minX:area.center.x-radius,minY:area.center.y-radius,maxX:area.center.x+radius,maxY:area.center.y+radius},view))continue;const g=c.createRadialGradient(area.center.x,area.center.y,50,area.center.x,area.center.y,radius);g.addColorStop(0,area.material==='forest'?'#476447':'#929d80');g.addColorStop(1,'#4d674900');c.fillStyle=g;c.fillRect(area.center.x-radius,area.center.y-radius,radius*2,radius*2);}
    c.restore();return;
  }
  for(let gy=Math.floor((view.minY-120)/73);gy<=Math.floor((view.maxY+150)/73);gy++)for(let gx=Math.floor((view.minX-140)/94);gx<=Math.floor((view.maxX+140)/94);gx++){
    const n=hash(gx+91,gy+27),x=(gx+.15+n*.7)*94,y=(gy+.12+hash(gy+19,gx)*.76)*73;if(data.collision.high.inside(x,y))continue;
    const area=nearest(data.layout,x,y),forest=area.material==='forest',seed=hash(gx+27,gy+15),edge=data.collision.high.nearest(x,y,100);if(edge&&edge.distance<49)continue;
    if(forest){
      if(n>.33)scenery.drawTree(c,{x,y:y+20,scale:.93+n*.34,seed,treeForm:Math.floor(seed*5),riftPalette:true});
      else scenery.drawShrub(c,{x,y:y+12,scale:.82+n*.35,seed,riftPalette:true});
    }else{
      const p={variant:'ruins-native',ruinsKind:n>.78?'wall':'rubble',x,y,width:n>.78?150:104,depth:n>.78?44:68,height:n>.78?52:36,angle:0,seed:Math.floor(seed*4)/4};props.drawProp(c,p);
      if(n>.42&&n<.73)scenery.drawShrub(c,{x:x-20,y:y+25,scale:.6+n*.2,seed,riftPalette:true});
    }
  }
  c.restore();
}
function bridge(c,p,overview){
  if(!p.deck||p.deck.length!==2)return;const [a,b]=p.deck,angle=Math.atan2(b.y-a.y,b.x-a.x),len=Math.hypot(b.x-a.x,b.y-a.y),w=p.width;
  c.save();c.translate(a.x,a.y);c.rotate(angle);
  rectangle(c,0,-w/2,len,w,'#8e9980');rectangle(c,0,-w/2+8,len,w-16,'#c6c8aa');
  const rowH=overview?40:28,colW=overview?78:53;
  c.save();c.beginPath();c.rect(0,-w/2+7,len,w-14);c.clip();
  for(let row=0;row<Math.ceil(w/rowH);row++)for(let col=-1;col<=Math.ceil(len/colW);col++){
    const x=col*colW+(row%2)*colW/2,y=-w/2+7+row*rowH,n=hash(col+17,row+9),points=[{x:x+1,y:y+1},{x:x+colW-3,y:y+1},{x:x+colW-1,y:y+rowH-3},{x:x+colW-5,y:y+rowH-1},{x:x+1,y:y+rowH-2}];
    trace(c,points);c.fillStyle=['#c5c7a8','#d4cfb0','#b9c1a0','#c9c9a9'][Math.floor(n*4)];c.fill();line(c,points.slice(0,3),'#e3ddbd',.9);line(c,points.slice(2),'#81916e',1);
    if(!overview&&n>.91)line(c,[{x:x+colW*.42,y:y+2},{x:x+colW*.5,y:y+rowH*.5},{x:x+colW*.7,y:y+rowH-3}],'#7a8d6d8c',1);
  }c.restore();
  for(const sign of[-1,1]){
    const y=sign*(w/2-5);rectangle(c,0,y-4,len,8,'#6f7e66');
    for(let x=0;x<len;x+=67){rectangle(c,x+1,y-3,Math.min(64,len-x-1),6,'#afb99a');line(c,[{x:x+3,y:y-3},{x:Math.min(x+61,len),y:y-3}],'#d9d8b8',1);}
  }
  c.restore();
}
export class RuinsMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.scenery=new SceneryArt(makeCanvas);this.props=new RuinsPropArt(makeCanvas);}
  get cacheStats(){const a=this.scenery.cacheStats,b=this.props.cacheStats;return {entries:a.entries+b.entries,pixels:a.pixels+b.pixels,bytes:a.bytes+b.bytes,limitBytes:a.limitBytes+b.limitBytes,builds:a.builds+b.builds};}
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineJoin='round';c.lineCap='round';soil(c,data,view,false);water(c,data,view,false);barriers(c,data,view,false,this.scenery,this.props);for(const p of data.bridges.query(view,30))bridge(c,p,false);c.restore();return true;}
}
export function drawRuinsOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='ruins')return false;const data=records(layout),view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';soil(c,data,view,true);water(c,data,view,true);barriers(c,data,view,true);for(const p of data.bridges.query(view))bridge(c,p,true);
  if(landmarks)for(const [key,p]of Object.entries(layout.landmarks||{})){if(!/^cave|^treasure|^boss/.test(key)||!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.beginPath();c.arc(p.x,p.y,4/scale,0,TAU);c.fillStyle=key.startsWith('boss')?'#bc745e':key.startsWith('cave')?'#53694f':'#ddbb6f';c.fill();c.strokeStyle='#f4e8c2';c.lineWidth=1/scale;c.stroke();}
  if(labels){c.font=`600 ${11/scale}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#f1e7c9';c.fillStyle='#455641';c.lineWidth=3/scale;for(const area of layout.areas){const p=area.label||area.center;if(!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  c.restore();return true;
}
