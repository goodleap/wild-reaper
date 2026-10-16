// Shared snow structures. Geometry, passage state and depth ordering belong to
// their callers; these painters neither add obstacles nor retain sprite images.
const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
export const SNOW_STRUCTURE_PALETTE=Object.freeze({rock:'#617f91',rockDark:'#405d70',rockLight:'#8ca8b6',snow:'#edf5ed',snowShade:'#c1dbe0',snowLight:'#fffef1',ice:'#8bc6d0',iceDark:'#4b839b',wood:'#897c6a',woodDark:'#4c5455',woodLight:'#b6ab8c'});
function path(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=point(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function poly(c,points,fill,edge=null,width=1){path(c,points);if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=1){c.beginPath();points.forEach((p,i)=>{p=point(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function oval(c,x,y,rx,ry,color,angle=0){c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fillStyle=color;c.fill();}
function bounds(points){return points.reduce((b,p)=>{p=point(p);b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);return b;},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
function icicle(c,x,y,length,width=3){poly(c,[[x-width*.5,y],[x+width*.5,y],[x+width*.13,y+length]],'#a8dbe0b8');line(c,[[x-width*.2,y+1],[x+width*.1,y+length*.72]],'#e8fff1c7',.6);}

// The existing WorldArt LRU supplies the canvas and the exact collision-derived
// outline/raised outline. Snow stays inside that supplied footprint and margin.
export function paintSnowRidge(c,{outline,upper,height=58,variant=0,ice=false}={}){
  if(!outline?.length||outline.length!==upper?.length)return false;
  const p=SNOW_STRUCTURE_PALETTE,base=outline.map(point),top=upper.map(point),center=base.reduce((n,p)=>n+p.y,0)/base.length;
  c.save();c.lineJoin='round';c.lineCap='round';poly(c,base,ice?p.iceDark:p.rockDark);
  const faces=[];for(let i=0;i<base.length;i++){const j=(i+1)%base.length;if((base[i].y+base[j].y)*.5<center-.001)continue;faces.push({i,j,y:(base[i].y+base[j].y)*.5});}faces.sort((a,b)=>a.y-b.y);
  for(const {i,j}of faces){const a=base[i],b=base[j],u=top[i],v=top[j],face=[u,v,b,a],n=hash(i+variant*13,73);
    poly(c,face,ice?['#78aebb','#6293ab','#8abfca'][i%3]:['#6d8b9c','#7895a4','#547286'][i%3],ice?'#426b8180':'#425d7180',.7);
    c.save();path(c,face);c.clip();
    for(let k=0;k<4;k++){const t=.16+k*.2,ax=u.x+(a.x-u.x)*t,ay=u.y+(a.y-u.y)*t,bx=v.x+(b.x-v.x)*t,by=v.y+(b.y-v.y)*t;line(c,[[ax,ay],[ax+(bx-ax)*.24,ay+(by-ay)*.24-1.5],[ax+(bx-ax)*.56,ay+(by-ay)*.56+2.5],[bx,by-.7]],k%2?'#cee1de47':'#344f6550',.7+n*.6);}
    const length=Math.hypot(v.x-u.x,v.y-u.y),count=Math.min(10,Math.max(2,Math.ceil(length/27)));
    for(let k=0;k<count;k++){const t=(k+.15+hash(k+i,variant)*.65)/count,x=u.x+(v.x-u.x)*t,y=u.y+(v.y-u.y)*t,drop=height*(.16+hash(k+variant,i)*.53);line(c,[[x,y+8],[x-4+n*8,y+drop*.58],[x+1,y+drop]],ice?'#d7fbf28c':'#3e5d716b',.65);if(k%3===0)line(c,[[x+1,y+9],[x+1,y+drop*.5]],'#b6d1d177',.7);}
    c.restore();
    // Uneven snow lips are attached to the raised rim, never to a new foot.
    c.beginPath();c.moveTo(u.x,u.y);c.lineTo(v.x,v.y);c.lineTo(v.x,v.y+3);c.quadraticCurveTo(u.x+(v.x-u.x)*.72,v.y+6,u.x+(v.x-u.x)*.5,(u.y+v.y)*.5+4);c.quadraticCurveTo(u.x+(v.x-u.x)*.2,u.y+8,u.x,u.y+3);c.closePath();c.fillStyle=p.snowShade;c.fill();
    if(ice||n>.58){const t=.3+n*.4;icicle(c,u.x+(v.x-u.x)*t,u.y+(v.y-u.y)*t+3,5+n*8,2.2+n*1.5);}
  }
  poly(c,top,p.snow, '#c1d9dd',.8);c.save();path(c,top);c.clip();const b=bounds(top);
  for(let k=0;k<7;k++){const x=b.minX+hash(k+variant,17)*(b.maxX-b.minX),y=b.minY+hash(k,variant+29)*(b.maxY-b.minY);c.beginPath();c.moveTo(x-14,y+2);c.quadraticCurveTo(x-2,y-3,x+13,y);c.strokeStyle=k%3?'#ffffffa0':'#8eb7c33d';c.lineWidth=k%3?1.1:2.5;c.stroke();}
  c.restore();line(c,top.slice(0,Math.max(3,Math.ceil(top.length*.45))),p.snowLight,1.3);c.restore();return true;
}

// p.points is the physical deck polygon. All rails and accumulated snow are
// clipped to it, including diagonal bridges and bridges with long approaches.
export function drawSnowBridge(c,p,{overview=false}={}){
  if(!p?.points?.length)return false;const palette=SNOW_STRUCTURE_PALETTE,route=p.deck?.length?p.deck:p.waypoints||[],b=bounds(p.points);c.save();c.lineJoin='round';c.lineCap='round';path(c,p.points);c.fillStyle=palette.woodDark;c.fill();c.clip();c.fillStyle=palette.wood;c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  for(let i=1;i<route.length;i++){const a=point(route[i-1]),b=point(route[i]),length=Math.hypot(b.x-a.x,b.y-a.y),width=p.width||130;if(length<1)continue;c.save();c.translate(a.x,a.y);c.rotate(Math.atan2(b.y-a.y,b.x-a.x));const spacing=overview?38:17;
    for(let x=0;x<length+spacing;x+=spacing){const n=hash(x+width,i+37);c.fillStyle=n>.5?'#948875':'#7f7565';c.fillRect(x+1,-width*.5,spacing-2,width);line(c,[[x+2,-width*.5],[x+2,width*.5]],'#c5b99977',overview?2:1);if(!overview){line(c,[[x+6,-width*.28],[x+8,width*.2]],'#514f4780',.8);line(c,[[x+9,width*.08],[x+11,width*.31]],'#d0c5a344',.7);}
      for(const side of [-1,1]){const y=side*width*.5;c.beginPath();c.moveTo(x,y);c.lineTo(x+spacing,y);c.lineTo(x+spacing,y-side*(10+n*9));c.quadraticCurveTo(x+spacing*.55,y-side*(7+n*15),x,y-side*(8+n*9));c.closePath();c.fillStyle=n>.4?palette.snow:palette.snowShade;c.fill();}
    }
    for(const side of [-1,1]){const y=side*(width*.5-7);line(c,[[0,y],[length,y]],palette.woodDark,overview?10:7);line(c,[[0,y-1],[length,y-1]],'#d5e7e3',overview?6:4);line(c,[[0,y-2],[length,y-2]],palette.snowLight,overview?2:1.2);for(let x=12;x<length;x+=74){c.fillStyle=palette.woodDark;c.fillRect(x-4,y-6,8,13);oval(c,x,y-6,5,2.4,palette.snowLight);}}
    if(!overview)for(let x=26;x<length-12;x+=89){const n=hash(x,i);oval(c,x,-width*.1+(n-.5)*width*.35,2.2,1.2,'#d6e5df75',.2);oval(c,x+7,-width*.1+(n-.5)*width*.35+3,2.2,1.2,'#d6e5df75',-.1);}c.restore();
  }c.restore();c.save();path(c,p.points);c.strokeStyle='#6b8b9799';c.lineWidth=overview?2:1;c.stroke();c.restore();return true;
}

function snowStone(c,x,y,w,h,seed=0){const n=hash(seed,11),top=y-h;poly(c,[[x-w*.5,y],[x-w*.53,top+h*.3],[x-w*.25,top],[x+w*.35,top+h*.08],[x+w*.51,top+h*.4],[x+w*.5,y]],n>.5?'#7896a5':'#6b889b','#476779',.8);poly(c,[[x-w*.25,top],[x+w*.35,top+h*.08],[x+w*.51,top+h*.4],[x+w*.08,top+h*.45],[x-w*.53,top+h*.3]],'#b4cfd7');poly(c,[[x-w*.26,top-1],[x+w*.35,top+h*.08-1],[x+w*.48,top+h*.25],[x+w*.11,top+h*.28],[x-w*.23,top+h*.2],[x-w*.47,top+h*.3]],'#edf5ed');line(c,[[x-w*.2,top],[x+w*.25,top+h*.06]],'#fffef1',1);line(c,[[x+w*.1,top+h*.44],[x+w*.05,y-3]],'#45677970',.8);}
function cave(c){
  oval(c,0,4,48,10,'#bfd8dd');poly(c,[[-35,5],[-34,-27],[-25,-52],[-8,-62],[14,-60],[29,-44],[35,-24],[35,5]],'#18384a');
  poly(c,[[-28,4],[-28,-22],[-19,-43],[-4,-51],[12,-48],[24,-31],[28,4]],'#102b3e');
  const blocks=[[-44,5,18,30],[-37,-18,20,31],[-22,-40,25,29],[3,-51,27,24],[26,-36,22,28],[42,-11,19,31]];
  for(let i=0;i<blocks.length;i++){const [x,y,w,h]=blocks[i];snowStone(c,x,y,w,h,i+19);}
  poly(c,[[-32,-52],[-18,-69],[6,-76],[24,-65],[35,-49],[20,-53],[4,-62],[-11,-60]],'#eaf3ed');line(c,[[-19,-67],[5,-73],[21,-63]],'#fffef1',1.8);
  for(const [x,y,len]of[[-24,-50,9],[-14,-58,15],[7,-61,11],[19,-53,8]])icicle(c,x,y,len,3.5);
  oval(c,0,4,25,5,'#a9ccd3');line(c,[[-25,6],[0,3],[25,6]],'#edf5ec',1.3);
}
function gate(c,site){const half=(site.width||(site.halfLength?site.halfLength*2:120))*.5;c.rotate(site.angle||0);
  for(const side of [-1,1]){const x=side*half;snowStone(c,x,6,17,47,side+15);c.fillStyle='#c0d4d5';c.fillRect(x-9,-43,18,5);oval(c,x,-43,11,3.5,'#f1f7ef');icicle(c,x+side*6,-40,6,2.5);}
  if(!site.open&&!site.gateOpen){for(let x=-half+12;x<half-5;x+=14){poly(c,[[x-4,3],[x-4,-30],[x-1,-36],[x+4,-30],[x+4,3]],'#7e7c6b');line(c,[[x-2,-29],[x-2,0]],'#c4bda07a',1);oval(c,x,-32,4,1.8,'#dbeae3');}line(c,[[-half,-25],[half,-25]],'#545e5d',5);line(c,[[-half,-27],[half,-27]],'#e5f0e8',2);line(c,[[-half,-7],[half,-7]],'#697265',5);line(c,[[-half+6,-9],[half-6,-29]],'#a99f80',3.5);c.fillStyle='#3f7483';c.fillRect(-5,-21,10,11);line(c,[[-3,-19],[3,-19]],'#c9e7df',1);}
}
function stele(c,variant=0){snowStone(c,0,6,42,13,variant+1);poly(c,[[-15,0],[-14,-42],[-8,-55],[9,-58],[17,-46],[15,0]],'#748e9d','#476476',1);poly(c,[[9,-58],[17,-46],[15,0],[8,-5]],'#526f82');poly(c,[[-14,-42],[-8,-55],[9,-58],[15,-48],[4,-48],[-4,-46]],'#e8f2ec');for(let i=0;i<3;i++)line(c,[[-6,-36+i*8],[5,-37+i*8]],'#b7d6d799',1);line(c,[[-1,-45],[-4,-28],[-1,-24],[-4,-7]],'#435f7580',.8);oval(c,-13,6,17,4,'#e0eee8');}
function ruins(c,variant=0){
  for(let i=0;i<3;i++){const y=12-i*7,w=88-i*12;poly(c,[[-w*.5,y-6],[w*.5,y-6],[w*.5,y],[-w*.5,y]],i%2?'#8aa5b0':'#9fbac1');line(c,[[-w*.5,y-6],[w*.5,y-6]],'#eff7ed',2);line(c,[[-w*.5,y],[w*.5,y]],'#587b8d',.8);}
  for(const side of [-1,1]){const x=side*33,h=side<0?52:34;snowStone(c,x,0,22,9,variant+side);poly(c,[[x-8,-8],[x-8,-h],[x-2,-h-4],[x+8,-h+3],[x+8,-8]],'#8ca8b4','#5a7d8f',.8);line(c,[[x-3,-h+3],[x-3,-9]],'#bfd6d88c',1);poly(c,[[x-10,-h],[x-2,-h-5],[x+10,-h+2],[x+8,-h+6],[x,-h+4],[x-8,-h+6]],'#eef5ed');}
  snowStone(c,16,11,24,9,variant+37);line(c,[[-24,7],[-4,7]],'#eaf5eb',2);
}
function sanctuary(c,variant=0){
  oval(c,0,7,49,19,'#accbd4');oval(c,0,3,45,17,'#789bab');oval(c,0,0,42,15,'#e5f1ed');oval(c,0,0,32,10,'#95c6cf');
  for(let i=0;i<8;i++){const a=i*TAU/8,x=Math.cos(a)*37,y=Math.sin(a)*12;line(c,[[x*.88,y*.88],[x,y]],'#4d879a',1.5);}
  for(const side of [-1,1]){const x=side*35;snowStone(c,x,1,15,44,variant+side+9);poly(c,[[x-4,-40],[x-3,-65],[x+2,-71],[x+7,-48],[x+4,-39]],'#a1d4d9','#6197ae',.7);line(c,[[x-2,-61],[x-1,-44]],'#edfff1',1);}
  poly(c,[[-13,-8],[-17,-31],[-4,-62],[11,-50],[17,-25],[8,-7]],'#76c2cd','#457f9a',1);poly(c,[[-4,-62],[2,-33],[-4,-9],[-13,-8],[-17,-31]],'#bfe7e1');poly(c,[[2,-33],[11,-50],[17,-25],[8,-7],[-4,-9]],'#619fb9');line(c,[[-4,-59],[1,-33],[-4,-10]],'#effff2',1.5);poly(c,[[-15,-6],[-7,-9],[4,-7],[13,-9],[18,-4],[6,-1],[-8,-1]],'#ebf6ee');
}
export function drawSnowLandmark(c,site){
  if(!['cave','shortcut','exit','stele','ruins','sanctuary'].includes(site?.kind))return false;
  c.save();c.translate(site.x,site.y);const scale=Number.isFinite(site.scale)?site.scale:1;if(scale!==1)c.scale(scale,scale);c.lineJoin='round';c.lineCap='round';
  if(site.kind==='cave')cave(c);else if(site.kind==='shortcut')gate(c,site);else if(site.kind==='stele')stele(c,site.variant||0);else if(site.kind==='ruins')ruins(c,site.variant||0);else if(site.kind==='sanctuary')sanctuary(c,site.variant||0);else{
    const angle=Number.isFinite(site.angle)?site.angle:-Math.PI/2;c.save();c.rotate(angle);poly(c,[[25,0],[6,-11],[7,-4],[-15,-4],[-15,4],[7,4],[6,11]],'#cae5e2','#719cac',.7);c.restore();c.fillStyle='#64726b';c.fillRect(31,-39,5,43);poly(c,[[19,-40],[49,-40],[55,-33],[49,-27],[19,-27]],'#a49b7e','#607985',.8);poly(c,[[18,-41],[49,-41],[54,-35],[42,-36],[29,-35],[19,-36]],'#ecf5ec');line(c,[[23,-32],[43,-32]],'#60747a',1.5);
  }c.restore();return true;
}

// These are walkable union rings, including holes, from the collision layout.
// Geometry preparation is weakly held and contains no canvases or world bitmap.
const cliffGeometry=new WeakMap();
function contains(rings,x,y){let inside=false;for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=point(ring[i]),b=point(ring[j]);if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function cliffData(boundaries){let data=cliffGeometry.get(boundaries);if(data)return data;const rings=boundaries.map(b=>b.points||b).filter(p=>p.length>2),segments=[];
  for(const boundary of boundaries){const ring=boundary.points||boundary;if(ring.length<3||boundary.material==='forest'||boundary.cliff===false)continue;const local=[];for(let i=0;i<ring.length;i++){const a=point(ring[i]),b=point(ring[(i+1)%ring.length]),length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.01)continue;let nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;const x=(a.x+b.x)*.5,y=(a.y+b.y)*.5;if(contains(rings,x+nx*.5,y+ny*.5)){nx=-nx;ny=-ny;}local.push({a,b,nx,ny,length,bounds:bounds([a,b])});}
    const miter=(a,b)=>{const divisor=Math.max(.48,1+a.nx*b.nx+a.ny*b.ny);return {x:(a.nx+b.nx)/divisor,y:(a.ny+b.ny)/divisor};};
    for(let i=0;i<local.length;i++){const s=local[i];s.offsetA=miter(local[(i+local.length-1)%local.length],s);s.offsetB=miter(s,local[(i+1)%local.length]);segments.push(s);}
  }
  data={rings,segments,bounds:bounds(rings.flat())};cliffGeometry.set(boundaries,data);return data;
}
export function drawSnowCliffs(c,boundaries,{viewBounds,overview=false,shouldDraw}={}){
  if(!boundaries?.length)return false;const data=cliffData(boundaries);if(!data.rings.length||!overlaps(data.bounds,viewBounds,58))return false;const view=viewBounds||data.bounds;
  c.save();c.lineJoin='round';c.lineCap='round';
  // Clip every painted pixel to the blocked side. Even the raised snow cap
  // cannot cover a narrow passage, a bridge landing, or the inside of a bend.
  c.beginPath();c.rect(view.minX-90,view.minY-90,view.maxX-view.minX+180,view.maxY-view.minY+180);for(const ring of data.rings)path(c,ring,false);c.clip('evenodd');
  const selected=data.segments.filter(s=>overlaps(s.bounds,viewBounds,68)&&(!shouldDraw||shouldDraw({x:(s.a.x+s.b.x)*.5,y:(s.a.y+s.b.y)*.5})));
  // Paint each stratum across every segment before the next one. A shared
  // corner must not overpaint a neighbouring segment's completed snow cap.
  for(const [color,width]of [['#47687e',overview?68:75],['#7899aa',overview?52:58],['#4f758d',overview?10:14]]){c.beginPath();for(const {a,b}of selected){c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);}c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  const caps=selected.map(s=>{const {a,b,nx,ny,length,offsetA,offsetB}=s,count=Math.max(1,Math.ceil(length/(overview?85:34))),pts=[];for(let i=0;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,d=28+(hash(x+7,y-19)-.5)*5,ox=i===0?offsetA.x:i===count?offsetB.x:nx,oy=i===0?offsetA.y:i===count?offsetB.y:ny;pts.push({x:x+ox*d,y:y+oy*d});}return pts;});
  for(const [color,width]of [['#abcbd5',overview?20:23],['#e2efea',overview?12:15],['#f9fcf0',overview?3:4]]){c.beginPath();for(const pts of caps)pts.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  if(!overview)for(const {a,b,nx,ny,length}of selected){
    for(let d=9;d<length;d+=24){const t=d/length,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,n=hash(x+11,y-17);line(c,[[x+nx*3,y+ny*3],[x+nx*14+(n-.5)*5,y+ny*14],[x+nx*21,y+ny*21]],'#355a7470',.8);if(n>.62){const ix=x+nx*22,iy=y+ny*22;line(c,[[ix,iy],[ix-nx*10,iy-ny*10]],'#bce0dfbd',1.3);}if(n<.23)oval(c,x+nx*32,y+ny*32,3+n*6,1.5,'#fffef1',Math.atan2(b.y-a.y,b.x-a.x));}
  }c.restore();return true;
}
