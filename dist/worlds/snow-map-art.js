import { WorldArt } from '../world-art.js';
import { RiftCollision } from '../rift-collision.js';
import { SnowPropArt } from '../snow-art.js';

export const SNOW_GROUND=Object.freeze({ground:'#d8e3dd',groundLight:'#edf0e5',wet:'#b4cecf',grass:'#9ab7af',forest:'#486c65',ridge:'#8faeb3',water:'#4b7c90',deep:'#315b74',shallow:'#8ebbc4',foam:'#e3eee3'});
const TAU=Math.PI*2,CELL=384,prepared=new WeakMap();
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
const overlaps=(a,b,pad=0)=>a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
function trace(c,points,begin=true){if(begin)c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.closePath();}
function rings(c,items){c.beginPath();for(const item of items||[]){trace(c,item.points||item,false);for(const hole of item.holes||[])trace(c,hole.points||hole,false);}}
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function nearest(layout,x,y){let best=layout.areas[0],distance=Infinity;for(const area of layout.areas){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<distance){best=area;distance=d;}}return best;}
class Index{
  constructor(){this.cells=new Map();}
  add(value,b,pad=0){for(let x=Math.floor((b.minX-pad)/CELL);x<=Math.floor((b.maxX+pad)/CELL);x++)for(let y=Math.floor((b.minY-pad)/CELL);y<=Math.floor((b.maxY+pad)/CELL);y++){const key=`${x}:${y}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(value);}}
  query(b,pad=0){const found=new Set();for(let x=Math.floor((b.minX-pad)/CELL);x<=Math.floor((b.maxX+pad)/CELL);x++)for(let y=Math.floor((b.minY-pad)/CELL);y<=Math.floor((b.maxY+pad)/CELL);y++)for(const value of this.cells.get(`${x}:${y}`)||[])found.add(value);return found;}
}
function records(layout){
  let data=prepared.get(layout);if(data)return data;data={layout,collision:new RiftCollision(layout),areas:new Index(),patches:new Index(),bridges:new Index(),waterEdges:new Index(),rockEdges:new Index()};
  for(const name of['areas','patches'])for(const value of layout[name]||[]){const b=bounds(value.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.64;data[name].add(value,name==='areas'?{minX:value.center.x-r,minY:value.center.y-r,maxX:value.center.x+r,maxY:value.center.y+r}:b,30);}
  for(const p of layout.passages||[])if(p.kind==='bridge')data.bridges.add(p,bounds(p.points),35);
  for(const lake of layout.lakes||[])for(const ring of[lake.points,...(lake.holes||[]).map(h=>h.points||h)])for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];if(a.x===b.x&&a.y===b.y)continue;data.waterEdges.add({a,b},bounds([a,b]),100);
  }
  // Small ground-level stones follow the actual blocked contour, including
  // narrow tips where a full scenery capsule cannot fit. Indexed once.
  for(const shape of layout.solidBoundaries||layout.boundaries)for(const ring of[shape.points,...(shape.holes||[]).map(h=>h.points||h)]){
    let carry=0;for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      let offset=carry;for(;offset<length;){const x=a.x+dx*offset/length,y=a.y+dy*offset/length,n=hash(x+83,y+59),nx=-dy/length,ny=dx/length;
        for(const side of[-1,1]){const xx=x+nx*side*11,yy=y+ny*side*11;if(!data.collision.high.inside(xx,yy)&&xx>layout.bounds.minX+3&&xx<layout.bounds.maxX-3&&yy>layout.bounds.minY+3&&yy<layout.bounds.maxY-3){data.rockEdges.add({x:xx,y:yy+3,seed:Math.floor(n*4)/4,forest:nearest(layout,x,y).material==='forest'}, {minX:xx,minY:yy,maxX:xx,maxY:yy},30);break;}}
        offset+=21+n*11;
      }
      carry=offset-length;
    }
  }
  prepared.set(layout,data);return data;
}
function clipGround(c,data){rings(c,data.layout.boundaries);c.clip('evenodd');}
function clipBlocked(c,data,view){c.beginPath();c.rect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);for(const ring of data.layout.solidBoundaries||data.layout.boundaries)trace(c,ring.points,false);c.clip('evenodd');}
function shorePath(c,data,view){c.beginPath();for(const edge of data.waterEdges.query(view,100)){c.moveTo(edge.a.x,edge.a.y);c.lineTo(edge.b.x,edge.b.y);}}
function water(c,data,view,overview){
  const P=SNOW_GROUND,b=data.layout.bounds,g=c.createLinearGradient(b.minX,b.maxY,b.maxX,b.minY);g.addColorStop(0,P.water);g.addColorStop(1,P.deep);c.fillStyle=g;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  if(!data.layout.lakes?.length)return;c.save();rings(c,data.layout.lakes);c.clip('evenodd');shorePath(c,data,view);
  if(overview){for(const [width,color]of [[100,'#578b9d'],[40,'#91bcc2'],[9,'#dcece2']]){c.strokeStyle=color;c.lineWidth=width;c.stroke();}}
  else{for(let width=132;width>=4;width-=4){c.strokeStyle='#d5f2ec07';c.lineWidth=width;c.stroke();}c.strokeStyle='#edf3e780';c.lineWidth=2;c.stroke();}
  if(!overview)for(let gy=Math.floor((view.minY-20)/63);gy<=Math.floor((view.maxY+20)/63);gy++)for(let gx=Math.floor((view.minX-48)/97);gx<=Math.floor((view.maxX+48)/97);gx++){
    const n=hash(gx+21,gy+13);if(n<.38)continue;const x=(gx+.12+n*.73)*97,y=(gy+.15+hash(gy+7,gx+11)*.7)*63,w=14+n*24;c.beginPath();c.moveTo(x-w/2,y);c.quadraticCurveTo(x,y+1.7,x+w/2,y-.6);c.strokeStyle=n>.83?'#bedddb55':'#a1cfdb2b';c.lineWidth=.9;c.stroke();
  }c.restore();
}
function valley(c,data,view,overview){
  const P=SNOW_GROUND;rings(c,data.layout.boundaries);c.fillStyle=P.ground;c.fill('evenodd');c.save();clipGround(c,data);
  for(const area of data.areas.query(view,30)){
    const b=bounds(area.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.64,g=c.createRadialGradient(area.center.x,area.center.y,20,area.center.x,area.center.y,r);
    g.addColorStop(0,area.kind==='quarry'?'#9fc9d2bd':area.material==='forest'?'#9ebfb08c':area.kind==='pass'?'#bdd3d789':'#f4f0dfb8');g.addColorStop(1,'#d8e3dd00');c.fillStyle=g;c.fillRect(area.center.x-r,area.center.y-r,r*2,r*2);
  }
  for(const patch of data.patches.query(view,30)){const b=bounds(patch.points),x=(b.minX+b.maxX)/2,y=(b.minY+b.maxY)/2,r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.65,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#8fada330');g.addColorStop(1,'#8fada300');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  shorePath(c,data,view);c.strokeStyle='#eaf1e5a0';c.lineWidth=overview?14:8;c.stroke();
  if(!overview){
    for(let gy=Math.floor((view.minY-25)/71);gy<=Math.floor((view.maxY+25)/71);gy++)for(let gx=Math.floor((view.minX-70)/107);gx<=Math.floor((view.maxX+70)/107);gx++){
      const n=hash(gx+37,gy+23),x=(gx+.15+n*.7)*107,y=(gy+.1+hash(gx+5,gy+13)*.8)*71;if(!data.collision.ground.inside(x,y))continue;
      if(n>.36){c.beginPath();c.moveTo(x-21,y);c.bezierCurveTo(x-9,y-3,x+8,y-3,x+29,y-1);c.strokeStyle=n>.7?'#f8f8ec88':'#6e9da32c';c.lineWidth=n>.7?1.2:.8;c.stroke();}
      if(n>.88){line(c,[{x:x+8,y:y+6},{x:x+10,y:y+2},{x:x+12,y:y+6}],'#8da5a176',.75);line(c,[{x:x-7,y:y+3},{x:x-6,y:y+1}],'#ffffffc0',.8);}
      if(n>.84&&nearest(data.layout,x,y).kind==='quarry'){
        line(c,[{x:x-30,y:y+8},{x:x-8,y:y+4},{x:x+3,y:y+9},{x:x+20,y:y+6}],'#5d919d3c',.85);line(c,[{x:x-8,y:y+4},{x:x-3,y:y-5}],'#6a9ca43c',.7);line(c,[{x:x-25,y:y+10},{x:x-8,y:y+6}],'#ecf6ed7b',.8);
      }
    }
  }c.restore();
}
function barriers(c,data,view,overview,scenery,props){
  c.save();clipBlocked(c,data,view);c.fillStyle=SNOW_GROUND.ridge;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  for(const area of data.layout.areas)if(area.material==='forest'){
    const b=bounds(area.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*1.05;if(!overlaps({minX:area.center.x-r,maxX:area.center.x+r,minY:area.center.y-r,maxY:area.center.y+r},view))continue;
    const g=c.createRadialGradient(area.center.x,area.center.y,r*.2,area.center.x,area.center.y,r);g.addColorStop(0,'#43675e');g.addColorStop(.64,'#4c726ab0');g.addColorStop(1,'#4c726a00');c.fillStyle=g;c.fillRect(area.center.x-r,area.center.y-r,r*2,r*2);
  }
  if(overview){c.restore();return;}
  // Deep ridge dressing is painted once into visible ground tiles. Raised
  // edge scenery is rendered separately in the ordinary depth queue.
  for(let gy=Math.floor((view.minY-150)/77);gy<=Math.floor((view.maxY+165)/77);gy++)for(let gx=Math.floor((view.minX-150)/99);gx<=Math.floor((view.maxX+150)/99);gx++){
    const n=hash(gx+77,gy+17),x=(gx+.12+n*.76)*99,y=(gy+.12+hash(gy+11,gx+21)*.76)*77;if(data.collision.high.inside(x,y))continue;const edge=data.collision.high.nearest(x,y,105);if(edge&&edge.distance<49)continue;
    const area=nearest(data.layout,x,y),seed=hash(gx+23,gy+15);
    if(area.material==='forest'){
      if(n>.19)scenery.drawProp(c,{type:'tree',variant:'world-snowpine',x,y:y+20,scale:.75+Math.floor(n*4)*.1,seed,treeForm:Math.floor(seed*5),region:'snow'});
      else props.drawProp(c,{variant:'snow-native',snowKind:'drift',x,y:y+9,width:78,depth:48,height:18,angle:0,seed:Math.floor(seed*4)/4});
    }else props.drawProp(c,{variant:'snow-native',snowKind:n>.32?'ledge':'rock',x,y,width:n>.32?168:92,depth:n>.32?74:68,height:n>.32?46:42,angle:Math.floor(seed*2)*Math.PI/4,seed:Math.floor(seed*4)/4});
  }
  for(const p of data.rockEdges.query(view,30))props.drawProp(c,{variant:'snow-native',snowKind:p.forest?'drift':'rock',x:p.x,y:p.y,width:31,depth:25,height:18,angle:0,seed:p.seed});
  c.restore();
}
function bridge(c,p,overview){
  if(!p.deck||p.deck.length!==2)return;const [a,b]=p.deck,len=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x),w=p.width;c.save();c.translate(a.x,a.y);c.rotate(angle);c.fillStyle='#5f7673';c.fillRect(0,-w/2,len,w);c.fillStyle='#abb6a5';c.fillRect(0,-w/2+7,len,w-14);
  const spacing=overview?66:40;for(let i=0;i<Math.ceil(len/spacing);i++){const x=i*spacing,n=hash(i,p.width);c.fillStyle=n>.5?'#bec4b1':'#a9b7a8';c.fillRect(x+1,-w/2+7,Math.min(spacing-2,len-x-1),w-14);line(c,[{x:x+2,y:-w/2+8},{x:x+2,y:w/2-8}],'#4f716b70',1);if(!overview){line(c,[{x:x+10,y:-w/2+18},{x:x+13,y:-8},{x:x+10,y:w/2-19}],'#6d8c7940',1);line(c,[{x:x+26,y:-w/2+21},{x:x+23,y:w/2-24}],'#dae0c34d',.8);}}
  for(const sign of[-1,1]){const y=sign*(w/2-5);line(c,[{x:0,y},{x:len,y}],'#537773',overview?9:8);line(c,[{x:0,y:y-3},{x:len,y:y-3}],'#ecf1e2',overview?4:4);for(let x=10;x<len;x+=86){c.fillStyle='#668b82';c.fillRect(x-3,y-5,6,10);c.fillStyle='#e9eee2';c.fillRect(x-3,y-5,6,3);}}
  if(!overview){line(c,[{x:5,y:-w/2+12},{x:len-5,y:-w/2+12}],'#e7f0e2a0',9);line(c,[{x:5,y:w/2-11},{x:len-5,y:w/2-11}],'#d4e6dcaa',6);}c.restore();
}
export class SnowMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.scenery=new WorldArt(makeCanvas);this.props=new SnowPropArt(makeCanvas);}
  get cacheStats(){const a=this.scenery.cacheStats,b=this.props.cacheStats;return{entries:a.entries+b.entries,pixels:a.pixels+b.pixels,bytes:a.bytes+b.bytes,limitBytes:a.limitBytes+b.limitBytes,builds:a.builds+b.builds};}
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineJoin='round';c.lineCap='round';water(c,data,view,false);valley(c,data,view,false);barriers(c,data,view,false,this.scenery,this.props);for(const p of data.bridges.query(view,35))bridge(c,p,false);c.restore();return true;}
}
export function drawSnowOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='snow')return false;const data=records(layout),view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';water(c,data,view,true);valley(c,data,view,true);barriers(c,data,view,true);for(const p of data.bridges.query(view,20))bridge(c,p,true);
  if(landmarks)for(const[key,p]of Object.entries(layout.landmarks||{})){if(!/^cave|^treasure|^boss/.test(key)||!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.beginPath();c.arc(p.x,p.y,4/scale,0,TAU);c.fillStyle=key.startsWith('boss')?'#c78061':key.startsWith('cave')?'#376b7c':'#c9ab6a';c.fill();c.strokeStyle='#edf4e8';c.lineWidth=1/scale;c.stroke();}
  if(labels){c.font=`600 ${11/scale}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#eef4e8';c.fillStyle='#355f69';c.lineWidth=3/scale;for(const area of layout.areas){const p=area.label||area.center;if(!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  c.restore();return true;
}
