import { SceneryArt } from '../scenery-art.js';
import { RiftCollision } from '../rift-collision.js';
import { BeachPropArt } from '../beach-art.js';

export const BEACH_GROUND=Object.freeze({sand:'#e9d9ae',sandLight:'#f2e4bf',wet:'#c4cba6',grass:'#aabd82',forest:'#46664c',reef:'#819a87',sea:'#397f91',deep:'#2b6c85',shallow:'#72b4ad',foam:'#d0dfc5'});
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
  let data=prepared.get(layout);if(data)return data;data={layout,collision:new RiftCollision(layout),areas:new Index(),patches:new Index(),bridges:new Index(),shores:new Index(),waterEdges:new Index(),rockEdges:new Index()};
  for(const name of['areas','patches'])for(const value of layout[name]||[])data[name].add(value,bounds(value.points),30);
  for(const p of layout.passages||[])if(p.kind==='bridge')data.bridges.add(p,bounds(p.points),35);
  for(const lake of layout.lakes||[])for(const ring of[lake.points,...(lake.holes||[]).map(h=>h.points||h)]){
    let carry=17;for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;data.waterEdges.add({a,b},bounds([a,b]),100);
      for(let distance=carry;distance<len;distance+=43){const x=a.x+dx*distance/len,y=a.y+dy*distance/len,nx=-dy/len,ny=dx/len;let side=0;for(const sign of[-1,1])if(data.collision.ground.inside(x+nx*sign*6,y+ny*sign*6)){side=sign;break;}if(!side)continue;data.shores.add({x,y,nx:nx*side,ny:ny*side,tx:dx/len,ty:dy/len,n:hash(x+11,y+19)},{minX:x,minY:y,maxX:x,maxY:y},45);}
      carry=(carry-len)%43;if(carry<0)carry+=43;
    }
  }
  // Small ground-level stones follow the actual blocked contour, including
  // narrow tips where a full scenery capsule cannot fit. Indexed once.
  for(const shape of layout.solidBoundaries||layout.boundaries)for(const ring of[shape.points,...(shape.holes||[]).map(h=>h.points||h)]){
    let carry=0;for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      let offset=carry;for(;offset<length;){const x=a.x+dx*offset/length,y=a.y+dy*offset/length,n=hash(x+83,y+59),nx=-dy/length,ny=dx/length;
        if(nearest(layout,x,y).material==='rock')for(const side of[-1,1]){const xx=x+nx*side*11,yy=y+ny*side*11;if(!data.collision.high.inside(xx,yy)&&xx>layout.bounds.minX+3&&xx<layout.bounds.maxX-3&&yy>layout.bounds.minY+3&&yy<layout.bounds.maxY-3){data.rockEdges.add({x:xx,y:yy+3,seed:Math.floor(n*4)/4}, {minX:xx,minY:yy,maxX:xx,maxY:yy},30);break;}}
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
function sea(c,data,view,overview){
  const P=BEACH_GROUND,b=data.layout.bounds,g=c.createLinearGradient(b.minX,b.maxY,b.maxX,b.minY);g.addColorStop(0,P.sea);g.addColorStop(1,P.deep);c.fillStyle=g;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  if(!data.layout.lakes?.length)return;c.save();rings(c,data.layout.lakes);c.clip('evenodd');
  // Shallow water remains inside the exact water contours, including island
  // holes. No water wash is drawn over a bridge or a passable sandbar.
  if(overview){for(const[width,color]of[[110,'#619f9e'],[44,'#86b9aa'],[10,'#c3d9bb']]){c.strokeStyle=color;c.lineWidth=width;c.stroke();}}else{shorePath(c,data,view);for(let width=190;width>=2;width-=4){c.strokeStyle='#b7dec405';c.lineWidth=width;c.stroke();}c.strokeStyle='#d8e5c74d';c.lineWidth=1.5;c.stroke();}
  if(!overview)for(let gy=Math.floor((view.minY-25)/57);gy<=Math.floor((view.maxY+25)/57);gy++)for(let gx=Math.floor((view.minX-50)/89);gx<=Math.floor((view.maxX+50)/89);gx++){
    const n=hash(gx+21,gy+13);if(n<.31)continue;const x=(gx+.12+n*.73)*89,y=(gy+.15+hash(gy+7,gx+11)*.7)*57,w=14+n*24;c.beginPath();c.moveTo(x-w/2,y);c.quadraticCurveTo(x,y+2.4,x+w/2,y-.6);c.strokeStyle=n>.8?'#bdd9bf43':'#a1cfc02b';c.lineWidth=.9;c.stroke();if(n>.84)line(c,[{x:x+3,y:y+4},{x:x+8+n*7,y:y+3}],'#235e7130',1);
  }c.restore();
}
function sand(c,data,view,overview){
  const P=BEACH_GROUND;rings(c,data.layout.boundaries);c.fillStyle=P.sand;c.fill('evenodd');c.save();clipGround(c,data);
  for(const area of data.areas.query(view,30)){
    const b=bounds(area.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.64;if(overview){trace(c,area.points);c.fillStyle=['grove','camp'].includes(area.kind)?'#c9ce9d':area.kind==='pass'?'#cbd0af':P.sandLight;c.fill();continue;}
    const g=c.createRadialGradient(area.center.x,area.center.y,20,area.center.x,area.center.y,r);g.addColorStop(0,area.kind==='grove'?'#9fb9836b':area.kind==='pass'?'#a3b49a60':'#f7eaca6b');g.addColorStop(1,'#ddd5ad00');c.fillStyle=g;c.fillRect(b.minX-40,b.minY-40,b.maxX-b.minX+80,b.maxY-b.minY+80);
  }
  for(const patch of data.patches.query(view,30)){trace(c,patch.points);c.fillStyle='#a9bc8663';c.strokeStyle='#a9bc8624';c.lineWidth=26;c.fill();c.stroke();}
  // A single combined shoreline path avoids overlapping translucent dashes.
  shorePath(c,data,view);for(let width=30;width>=6;width-=6){c.strokeStyle=overview?'#c7d0aa15':'#93ac860b';c.lineWidth=width;c.stroke();}
  for(const p of data.shores.query(view,45)){
    if(overview)continue;
    if(p.n>.87){const xx=p.x+p.nx*18,yy=p.y+p.ny*18;line(c,[{x:xx-6,y:yy+2},{x:xx-1,y:yy-2},{x:xx+6,y:yy+1}],'#779b706d',1.6);line(c,[{x:xx-2,y:yy},{x:xx,y:yy-5}],'#92ab7866',1.2);}
    else if(p.n>.7){const xx=p.x+p.nx*24,yy=p.y+p.ny*24;c.beginPath();c.ellipse(xx,yy,3.3,1.8,-.3,0,TAU);c.fillStyle='#f6e9cb';c.fill();line(c,[{x:xx-2,y:yy+1},{x:xx+2,y:yy+1}],'#a9ae8759',.7);}
  }
  if(!overview){
    for(let gy=Math.floor((view.minY-24)/37);gy<=Math.floor((view.maxY+24)/37);gy++)for(let gx=Math.floor((view.minX-28)/43);gx<=Math.floor((view.maxX+28)/43);gx++){
      const n=hash(gx+37,gy+23),x=(gx+.15+n*.7)*43,y=(gy+.1+hash(gx+5,gy+13)*.8)*37;if(!data.collision.ground.inside(x,y))continue;
      if(n>.94){line(c,[{x:x-2,y},{x:x-4,y:y-5}],'#a2b77a88',.9);line(c,[{x:x+1,y},{x:x+2,y:y-6}],'#98b17477',1);}
      else if(n>.37){line(c,[{x,y},{x:x+1.5+n*2.5,y:y+.3}],'#b3ab8248',.65);if(n>.73)line(c,[{x:x+1,y:y-.7},{x:x+3+n*2,y:y-1}],'#fff1d075',.7);}
    }
    // Wind traces come in sparse, irregular groups, never repeated stripes.
    for(let gy=Math.floor((view.minY-90)/177);gy<=Math.floor((view.maxY+90)/177);gy++)for(let gx=Math.floor((view.minX-130)/219);gx<=Math.floor((view.maxX+130)/219);gx++){
      const n=hash(gx+91,gy+43);if(n<.66)continue;const x=(gx+.2+n*.5)*219,y=(gy+.2+hash(gy,gx)*.5)*177,area=nearest(data.layout,x,y);if(area.kind==='grove')continue;
      for(let i=0;i<2;i++){const yy=y+i*6,w=18+n*26-i*7;c.beginPath();c.moveTo(x-w,yy);c.quadraticCurveTo(x-2,yy+4,x+w*.7,yy-2);c.strokeStyle=i?'#fff0c72b':'#c3b38935';c.lineWidth=1.1;c.stroke();}
    }
    // Near the old harbor, fragments of paving survive among the sand.
    for(const area of data.areas.query(view))if(area.kind==='village'){
      const cx=area.center.x+115,cy=area.center.y-105;for(let row=-2;row<3;row++)for(let col=-3;col<4;col++){
        const n=hash(row+Number(area.id)*17,col+23);if(n<.34)continue;const x=cx+col*47+(row%2)*22,y=cy+row*28;if(!overlaps({minX:x-25,maxX:x+25,minY:y-16,maxY:y+16},view))continue;
        const pts=[{x:x-21,y:y-12},{x:x+21,y:y-11},{x:x+22,y:y+9},{x:x+17,y:y+12},{x:x-21,y:y+11}];trace(c,pts);c.fillStyle='#bbc6aa60';c.fill();line(c,pts.slice(0,3),'#eee5c66b',.8);line(c,pts.slice(2),'#90a58b44',.8);
      }
    }
  }c.restore();
}
function barriers(c,data,view,overview,scenery,props){
  c.save();clipBlocked(c,data,view);c.fillStyle=BEACH_GROUND.forest;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  if(overview){for(const area of data.layout.areas){if(area.material==='forest')continue;const b=bounds(area.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.86;if(!overlaps({minX:area.center.x-r,maxX:area.center.x+r,minY:area.center.y-r,maxY:area.center.y+r},view))continue;const g=c.createRadialGradient(area.center.x,area.center.y,30,area.center.x,area.center.y,r);g.addColorStop(0,'#a0b19a');g.addColorStop(1,'#a0b19a00');c.fillStyle=g;c.fillRect(area.center.x-r,area.center.y-r,r*2,r*2);}c.restore();return;}
  // Exposed reef shelves use stone-colored soil, not a green polygon beneath
  // the rocks. These soft regional washes are baked with the terrain tiles.
  for(const area of data.layout.areas)if(area.material==='rock'){
    const b=bounds(area.points),r=Math.max(b.maxX-b.minX,b.maxY-b.minY)*1.06;if(!overlaps({minX:area.center.x-r,maxX:area.center.x+r,minY:area.center.y-r,maxY:area.center.y+r},view))continue;
    const g=c.createRadialGradient(area.center.x,area.center.y,r*.2,area.center.x,area.center.y,r);g.addColorStop(0,'#b8b99d');g.addColorStop(.7,'#a4b099');g.addColorStop(1,'#a4b09900');c.fillStyle=g;c.fillRect(area.center.x-r,area.center.y-r,r*2,r*2);
  }
  for(let gy=Math.floor((view.minY-40)/47);gy<=Math.floor((view.maxY+40)/47);gy++)for(let gx=Math.floor((view.minX-50)/61);gx<=Math.floor((view.maxX+50)/61);gx++){
    const n=hash(gx+137,gy+69),x=(gx+.1+n*.8)*61,y=(gy+.1+hash(gy+49,gx+31)*.8)*47;if(data.collision.high.inside(x,y)||nearest(data.layout,x,y).material!=='rock')continue;
    if(n>.66)props.drawProp(c,{variant:'beach-native',beachKind:'rock',x,y,width:34,depth:25,height:15,angle:0,seed:Math.floor(n*4)/4});
    else if(n>.4){line(c,[{x:x-7,y},{x:x-1,y:y+2},{x:x+6,y:y+1}],'#6e81695e',1);line(c,[{x:x+1,y:y+1},{x:x+3,y:y-6}],'#8da274',1.1);}
  }
  for(let gy=Math.floor((view.minY-135)/73);gy<=Math.floor((view.maxY+155)/73);gy++)for(let gx=Math.floor((view.minX-150)/93);gx<=Math.floor((view.maxX+150)/93);gx++){
    const n=hash(gx+77,gy+17),x=(gx+.12+n*.76)*93,y=(gy+.12+hash(gy+11,gx+21)*.76)*73;if(data.collision.high.inside(x,y))continue;const edge=data.collision.high.nearest(x,y,105);if(edge&&edge.distance<52)continue;
    const area=nearest(data.layout,x,y),seed=hash(gx+23,gy+15);
    if(area.material==='forest'){if(n>.28)scenery.drawTree(c,{x,y:y+22,scale:.85+n*.4,seed,treeForm:Math.floor(seed*5),riftPalette:true});else scenery.drawShrub(c,{x,y:y+12,scale:.79+n*.4,seed,riftPalette:true});}
    else{props.drawProp(c,{variant:'beach-native',beachKind:n>.46?'reef':'rock',x,y,width:n>.46?112:88,depth:n>.46?72:64,height:n>.46?53:45,angle:0,seed:Math.floor(seed*4)/4});if(n>.68)scenery.drawShrub(c,{x:x-20,y:y+25,scale:.57+n*.15,seed,riftPalette:true});}
  }
  for(const p of data.rockEdges.query(view,30))props.drawProp(c,{variant:'beach-native',beachKind:'rock',x:p.x,y:p.y,width:31,depth:25,height:22,angle:0,seed:p.seed});
  c.restore();
}
function bridge(c,p,overview){
  if(!p.deck||p.deck.length!==2)return;const[a,b]=p.deck,len=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x),w=p.width;c.save();c.translate(a.x,a.y);c.rotate(angle);c.fillStyle='#677a60';c.fillRect(0,-w/2,len,w);c.fillStyle='#baa87b';c.fillRect(0,-w/2+7,len,w-14);
  const spacing=overview?40:19;for(let i=0;i<Math.ceil(len/spacing);i++){const x=i*spacing,n=hash(i,p.width);c.fillStyle=n>.5?'#cdb78c':'#b5a47a';c.fillRect(x+1,-w/2+7,Math.min(spacing-2,len-x-1),w-14);line(c,[{x:x+2,y:-w/2+8},{x:x+2,y:w/2-8}],'#e0cda150',1);if(!overview&&n>.48)line(c,[{x:x+spacing*.4,y:-w*.3},{x:x+spacing*.48,y:w*.22}],'#827a5654',.8);}
  for(const sign of[-1,1]){const y=sign*(w/2-5);line(c,[{x:0,y},{x:len,y}],'#666e50',overview?9:8);line(c,[{x:0,y:y-2},{x:len,y:y-2}],'#d2c196',overview?3:2);for(let x=10;x<len;x+=82){c.fillStyle='#7f7f59';c.fillRect(x-3,y-5,6,10);c.fillStyle='#c6ba89';c.fillRect(x-2,y-5,3,4);}}
  c.restore();
}
export class BeachMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.scenery=new SceneryArt(makeCanvas);this.props=new BeachPropArt(makeCanvas);}
  get cacheStats(){const a=this.scenery.cacheStats,b=this.props.cacheStats;return{entries:a.entries+b.entries,pixels:a.pixels+b.pixels,bytes:a.bytes+b.bytes,limitBytes:a.limitBytes+b.limitBytes,builds:a.builds+b.builds};}
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineJoin='round';c.lineCap='round';sea(c,data,view,false);sand(c,data,view,false);barriers(c,data,view,false,this.scenery,this.props);for(const p of data.bridges.query(view,35))bridge(c,p,false);c.restore();return true;}
}
export function drawBeachOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='beach')return false;const data=records(layout),view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';sea(c,data,view,true);sand(c,data,view,true);barriers(c,data,view,true);for(const p of data.bridges.query(view,20))bridge(c,p,true);
  if(landmarks)for(const[key,p]of Object.entries(layout.landmarks||{})){if(!/^cave|^treasure|^boss/.test(key)||!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.beginPath();c.arc(p.x,p.y,4/scale,0,TAU);c.fillStyle=key.startsWith('boss')?'#c78061':key.startsWith('cave')?'#426c63':'#e3c279';c.fill();c.strokeStyle='#f7eccc';c.lineWidth=1/scale;c.stroke();}
  if(labels){c.font=`600 ${11/scale}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#f6eccb';c.fillStyle='#365d56';c.lineWidth=3/scale;for(const area of layout.areas){const p=area.label||area.center;if(!overlaps({minX:p.x,maxX:p.x,minY:p.y,maxY:p.y},view))continue;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  c.restore();return true;
}
