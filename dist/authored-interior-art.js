// Authored rooms keep their ground outline, wall footprint and decoration in
// one scene. Only small textures and visible wall sprites enter the raster LRU.
const TAU=Math.PI*2,TILE=256,PIXEL_LIMIT=3*1024*1024;
const noise=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const random=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function polygon(c,points,fill,edge=null,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function oval(c,x,y,rx,ry,color,angle=0){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),angle,0,TAU);c.fillStyle=color;c.fill();}
function lobed(c,x,y,rx,ry,seed=0){
  const points=Array.from({length:16},(_,i)=>{const a=i*TAU/16,r=.91+noise(i,seed)*.12;return[x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r];});
  const last=points.at(-1),first=points[0];c.beginPath();c.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);
  points.forEach(([px,py],i)=>{const q=points[(i+1)%points.length];c.quadraticCurveTo(px,py,(px+q[0])/2,(py+q[1])/2);});c.closePath();
}
function floorPath(target,polygons){for(const polygon of polygons)for(const ring of [polygon.outer,...(polygon.holes||[])]){if(!ring.length)continue;target.moveTo(ring[0][0],ring[0][1]);for(let i=1;i<ring.length;i++)target.lineTo(ring[i][0],ring[i][1]);target.closePath();}}
function capsulePoints(half,r,angle){const ux=Math.cos(angle),uy=Math.sin(angle),points=[];for(let i=0;i<=10;i++){const a=angle-Math.PI/2+i*Math.PI/10;points.push([ux*half+Math.cos(a)*r,uy*half+Math.sin(a)*r]);}for(let i=0;i<=10;i++){const a=angle+Math.PI/2+i*Math.PI/10;points.push([-ux*half+Math.cos(a)*r,-uy*half+Math.sin(a)*r]);}return points;}
function hull(points){
  const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));
}

export class AuthoredInteriorArt {
  constructor(createCanvas=()=>document.createElement('canvas')){this.createCanvas=createCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this.scenes=new WeakMap();}
  get diagnostics(){return {entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  _sprite(key,w,h,paint,scale=1){
    let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.createCanvas();canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const c=canvas.getContext('2d');c.setTransform(scale,0,0,scale,0,0);c.lineCap='round';c.lineJoin='round';paint(c);
    image={canvas,w,h,pixels:canvas.width*canvas.height};while(this.cache.size&&this.pixels+image.pixels>PIXEL_LIMIT){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  _scene(state){
    let record=this.scenes.get(state);if(record)return record;
    const layout=state.authoredLayout,polygons=layout.floorPolygons;
    const path=typeof Path2D==='function'?new Path2D():null;if(path)floorPath(path,polygons);
    record={path,polygons,details:layout.groundDetails||[]};this.scenes.set(state,record);return record;
  }
  _floor(style,variant){return this._sprite(`floor:${style}:${variant}`,TILE,TILE,c=>{
    const r=random(311+variant*71),castle=style==='castle';c.fillStyle=castle?'#9c9a7c':'#85836b';c.fillRect(0,0,TILE,TILE);
    if(castle){
      for(let row=0;row<4;row++)for(let col=-1;col<4;col++){
        const x=col*85+(row%2)*42.5,y=row*64,colors=['#aaa789','#b0ad8d','#a5a48a','#b8b396'];
        polygon(c,[[x+1.5,y+1.5],[x+82,y+1],[x+83.5,y+61],[x+2,y+62]],colors[Math.floor(r()*colors.length)]);
        line(c,[[x+3,y+3],[x+81,y+2]],'#d6ceb05c',1.1);line(c,[[x+83,y+5],[x+83,y+61],[x+3,y+62]],'#6f785d55',1);
        if((row+col+variant)%7===0)line(c,[[x+58,y+2],[x+55,y+9],[x+62,y+15],[x+61,y+20]],'#727b6359',1);
      }
    }else{
      for(let i=0;i<12;i++){const x=r()*TILE,y=r()*TILE;lobed(c,x,y,25+r()*40,12+r()*24,i+variant);c.fillStyle=i%2?'#b6ac8310':'#526b5610';c.fill();}
      for(let i=0;i<18;i++){const x=8+r()*240,y=8+r()*240;line(c,[[x-3,y+2],[x+2,y-1],[x+7,y]],'#bdb28d35',1);if(i%4===0)line(c,[[x,y+4],[x+6,y+2],[x+10,y+4]],'#52614e40',1);}
    }
    for(let i=0;i<180;i++){const x=r()*TILE,y=r()*TILE;oval(c,x,y,.6+r()*1.5,.4+r()*.6,i%3?'#ded2a52b':'#455c4530');}
  });}
  _detail(type,variant=0){return this._sprite(`detail:${type}:${variant}`,240,160,c=>{
    c.translate(120,80);const r=random(811+variant*73);
    if(type==='water'){
      // A wet, walkable rock hollow: no dark centre implying deep water.
      for(const [rx,ry,color] of [[114,70,'#4c716023'],[109,65,'#6c928336'],[100,57,'#719e9855']]){lobed(c,0,0,rx,ry,31+variant);c.fillStyle=color;c.fill();}
      for(let i=0;i<15;i++){const x=-85+r()*170,y=-42+r()*84;if((x*x)/(90*90)+(y*y)/(48*48)>1)continue;line(c,[[x-3,y],[x+4+r()*10,y-1]],i%3?'#bed1b362':'#456d6460',.9);}
      for(let i=0;i<7;i++){const a=r()*TAU,x=Math.cos(a)*102,y=Math.sin(a)*60;oval(c,x,y,3+r()*4,1.6+r()*2,'#75897588');line(c,[[x-2,y-1],[x+2,y-2]],'#bac0a580',.8);}
    }else if(type==='moss'){
      for(let i=0;i<6;i++){lobed(c,0,0,110-i*6,65-i*4,18+variant);c.fillStyle='#5378520b';c.fill();}
      for(let i=0;i<85;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=Math.cos(a)*100*rr,y=Math.sin(a)*54*rr;oval(c,x,y,2+r()*4,.6+r()*1.2,['#72966142','#98aa6644','#4a754b30'][i%3],-.5+r());}
    }else if(type==='rug'){
      polygon(c,[[-80,-65],[80,-65],[80,65],[-80,65]],'#77534b','#b2a373',2);
      c.strokeStyle='#c5b184';c.lineWidth=1;c.strokeRect(-73,-58,146,116);c.strokeStyle='#423e354a';c.strokeRect(-67,-52,134,104);
      polygon(c,[[0,-30],[32,0],[0,30],[-32,0]],'#a48c5e','#c0ae78',1.2);polygon(c,[[0,-15],[16,0],[0,15],[-16,0]],'#767956');
      for(let x=-72;x<=72;x+=10){line(c,[[x,-68],[x,-64]],'#b8a47b',1.5);line(c,[[x,65],[x,69]],'#b8a47b',1.5);}
      for(let i=0;i<9;i++){const x=-70+r()*140,y=-55+r()*110;line(c,[[x,y],[x+4,y+1]],'#302e252c',.9);}
    }else{
      for(let i=0;i<18;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=Math.cos(a)*98*rr,y=Math.sin(a)*52*rr,w=3+r()*8,h=2+r()*5;
        polygon(c,[[x-w,y],[x-w*.4,y-h],[x+w*.6,y-h*.7],[x+w,y+h*.5],[x,y+h]],['#969b7c','#a9ac8d','#798a73'][i%3],'#5a705550',.8);line(c,[[x-w*.4,y-h],[x+w*.6,y-h*.7]],'#d6cfac70',.8);
      }
    }
  });}
  drawGround(c,state,camX,camY,w,h){
    const layout=state.authoredLayout,style=layout.style||state.kind,record=this._scene(state),left=camX-w/2,top=camY-h/2,b=state.bounds;
    c.fillStyle=style==='cave'?'#263c34':'#384438';c.fillRect(0,0,w,h);c.save();c.translate(-left,-top);
    if(record.path)c.clip(record.path,'evenodd');else{c.beginPath();floorPath(c,record.polygons);c.clip('evenodd');}
    for(let y=Math.floor(Math.max(top,b.minY)/TILE);y<Math.ceil(Math.min(top+h,b.maxY)/TILE);y++)for(let x=Math.floor(Math.max(left,b.minX)/TILE);x<Math.ceil(Math.min(left+w,b.maxX)/TILE);x++){const image=this._floor(style,Math.floor(noise(x+19,y+71)*3));c.drawImage(image.canvas,x*TILE,y*TILE);}
    for(let i=0;i<record.details.length;i++){
      const detail=record.details[i],rx=detail.rx||100,ry=detail.ry||65;
      if(detail.x+rx<left||detail.x-rx>left+w||detail.y+ry<top||detail.y-ry>top+h)continue;
      const image=this._detail(detail.type,i%3);c.save();c.translate(detail.x,detail.y);if(detail.angle)c.rotate(detail.angle);c.drawImage(image.canvas,-rx,-ry,rx*2,ry*2);c.restore();
    }
    c.restore();
  }
  _wall(prop){
    const half=prop.halfLength||0,r=prop.r||14,angle=prop.angle||0,style=prop.authoredStyle||'cave',gate=prop.isInteriorGate,variant=Math.floor(noise(prop.seed||0,39)*3);
    const dx=Math.abs(Math.cos(angle)*half),dy=Math.abs(Math.sin(angle)*half),w=2*(dx+r+5),h=2*(dy+r+5)+35,anchorX=w/2,anchorY=dy+r+40;
    const image=this._sprite(`wall:${style}:${gate?1:0}:${half}:${r}:${angle}:${variant}`,w,h,c=>{
      c.translate(anchorX,anchorY);const ux=Math.cos(angle),uy=Math.sin(angle),rand=random(211+variant*83);
      if(gate){
        const count=Math.max(2,Math.ceil(half*2/24));
        for(let i=0;i<=count;i++){const along=-half+i*half*2/count,x=ux*along,y=uy*along,end=i===0||i===count,hw=end?8:3.5,height=end?35:29;
          polygon(c,[[x-hw,y+3],[x-hw,y-height],[x+hw,y-height],[x+hw,y+3]],end?'#858d72':'#66756b','#3e5147',1.3);line(c,[[x-hw+2,y-height+2],[x+hw-1,y-height+2],[x+hw-1,y+1]],end?'#c2bb92':'#a6af93',1);
        }
        for(const lift of [10,25]){line(c,[[-ux*half,-uy*half-lift],[ux*half,uy*half-lift]],'#405044',5);line(c,[[-ux*half,-uy*half-lift-1],[ux*half,uy*half-lift-1]],'#b8a879',2);}
        return;
      }
      const footprint=capsulePoints(half,r,angle),upper=footprint.map(([x,y])=>[x,y-35]),body=hull([...footprint,...upper]);
      polygon(c,body,style==='cave'?'#59695a':'#77826b','#364e40',1.5);
      c.save();polygon(c,body,null);c.clip();
      const light=c.createLinearGradient(0,-dy-35,0,dy+r);light.addColorStop(0,style==='cave'?'#9ba58a':'#b6b493');light.addColorStop(1,style==='cave'?'#586b57':'#7e896e');c.fillStyle=light;c.fillRect(-w/2,-anchorY,w,h);
      if(style==='cave'){
        const count=Math.max(1,Math.ceil(half*2/32)),step=half*2/count;
        for(let i=0;i<=count;i++){
          const along=-half+i*step,x=ux*along,y=uy*along,thick=r*(.75+rand()*.2),lean=(rand()-.5)*6;
          polygon(c,[[x-thick,y+4],[x-thick-2,y-17],[x-thick*.4+lean,y-33],[x+thick*.6,y-34],[x+thick+2,y-15],[x+thick*.7,y+3]],['#677764','#7f8c73','#73836b'][i%3],'#425b4899',1);
          polygon(c,[[x-thick-2,y-17],[x-thick*.4+lean,y-33],[x+thick*.6,y-34],[x+thick*.5,y-19],[x-2,y-15]],'#a0aa8a');
          polygon(c,[[x-2,y-15],[x+thick*.5,y-19],[x+thick+2,y-15],[x+thick*.7,y+3],[x+3,y+1]],'#62775f');
          line(c,[[x-thick*.3,y-32],[x+thick*.5,y-33]],'#ced0ac99',1);
          if(i%3===0){line(c,[[x+2,y-15],[x-2,y-6],[x+1,y+1]],'#405a4880',.9);oval(c,x-thick*.5,y-24,3.5,1.5,'#91a97166');}
        }
      }else{
        for(let row=0;row<3;row++){
          const lift=7+row*12;line(c,[[-ux*(half+r),-uy*(half+r)-lift],[ux*(half+r),uy*(half+r)-lift]],'#53674f88',1);
          for(let along=-half-r+(row%2)*23;along<half+r;along+=46){const x=ux*along,y=uy*along;line(c,[[x,y-lift],[x,y-lift+12]],'#56685099',1);line(c,[[x+1,y-lift+1],[x+1,y-lift+10]],'#c6c3a044',.8);}
        }
      }
      c.restore();
      // The cap stays on the same capsule as the physical wall, with only
      // its vertical projection raised. Corners never acquire invisible bulk.
      polygon(c,upper,style==='cave'?'#829678':'#b1b493','#526b50',1);
      c.save();polygon(c,upper,null);c.clip();
      const length=half*2,step=style==='cave'?31:43;
      for(let along=-half-r;along<half+r;along+=step){const x=ux*along,y=uy*along-35,nx=-uy*r,ny=ux*r;
        if(style==='cave'){
          const length=step*(1.08+rand()*.22),breadth=r*(.87+rand()*.2),offset=(rand()-.5)*4;
          const local=[[-.55,-.12],[-.32,-.91],[.16,-.96],[.57,-.36],[.43,.69],[-.12,.97],[-.58,.42]],points=local.map(([a,b])=>[x+ux*a*length-uy*(b*breadth+offset),y+uy*a*length+ux*(b*breadth+offset)]),ridge=[x-ux*length*.04+uy*breadth*.18,y-uy*length*.04-ux*breadth*.18];
          polygon(c,points,['#96a387','#a3ad8f','#899d7e'][Math.floor(rand()*3)],'#526f5266',.8);
          polygon(c,[points[0],points[1],points[2],ridge,points[6]],'#bdc5a16e');polygon(c,[ridge,points[2],points[3],points[4]],'#748d6b66');
          line(c,[points[1],points[2],points[3]],'#d4d5ae80',.8);
          if(Math.floor(along/step)%3===0){oval(c,x+ux*7,y+uy*7,3,1.7,'#688b4d77');oval(c,x+ux*8+2,y+uy*8-2,2,1.3,'#9eb36b77');}
        }else line(c,[[x-nx,y-ny],[x+nx,y+ny]],'#6e7e615e',1);
      }
      for(let i=0;i<Math.ceil(length/7)+4;i++){const along=-half+rand()*length,side=(rand()-.5)*r*1.6,x=ux*along-uy*side,y=uy*along+ux*side-35;line(c,[[x,y],[x+1+rand()*2,y-.3]],i%3?'#465f4233':'#e0ddba66',.6);}
      c.restore();
    },1);
    return {image,anchorX,anchorY};
  }
  drawWall(c,prop){const {image,anchorX,anchorY}=this._wall(prop);c.drawImage(image.canvas,prop.x-anchorX,prop.y-anchorY,image.w,image.h);}
  _prop(type,opened=false){return this._sprite(`prop:${type}:${opened?1:0}`,110,125,c=>{
    c.translate(55,93);c.lineWidth=1.5;c.strokeStyle='#405446';
    if(type==='interiorWinch'){
      polygon(c,[[-25,0],[-16,-10],[19,-10],[26,0],[18,9],[-18,9]],'#969b7e','#50634e',1.5);
      for(const x of [-18,15]){polygon(c,[[x-4,2],[x-4,-25],[x+4,-29],[x+5,1]],'#987e55','#4a5440',1.4);line(c,[[x-2,-24],[x-2,-1]],'#c6ad77',1.3);}
      polygon(c,[[-16,-25],[17,-24],[17,-14],[-16,-15]],'#65796d','#3e5548',1.2);
      for(let x=-10;x<=10;x+=4)line(c,[[x,-24],[x,-14]],'#c4b083',2);
      oval(c,-19,-20,12,12,'#a28b5e');c.beginPath();c.arc(-19,-20,12,0,TAU);c.strokeStyle='#485c47';c.stroke();oval(c,-19,-20,8,8,'#536e5c');
      for(let i=0;i<4;i++){const a=i*Math.PI/2+(opened?.6:0);line(c,[[-19+Math.cos(a)*3,-20+Math.sin(a)*3],[-19+Math.cos(a)*10,-20+Math.sin(a)*10]],'#d0bd8d',1.8);}
      line(c,[[-19,-20],[-28,-30]],'#4b5942',3);oval(c,-29,-31,3,3,'#d2b77a');
      oval(c,23,-20,4,4,opened?'#b1ce90':'#e7c485');if(!opened){line(c,[[13,-15],[26,0]],'#4d5944',3);line(c,[[14,-15],[27,0]],'#cdb787',1);}
    }else if(type==='castlePillar'){
      polygon(c,[[-22,-1],[-13,-12],[14,-12],[23,0],[14,11],[-14,11]],'#87967a','#4d674e',1.3);
      polygon(c,[[-13,2],[-13,-57],[13,-57],[13,2],[0,9]],'#a4ac8d','#546b51',1.5);polygon(c,[[0,-57],[13,-57],[13,2],[0,9]],'#829676');
      for(const y of [-42,-24,-7])line(c,[[-12,y],[0,y+3],[12,y]],'#657d5d',1);
      polygon(c,[[-18,-57],[-18,-66],[18,-66],[18,-57],[0,-50]],'#bdc2a0','#5b7356',1.3);polygon(c,[[-18,-66],[0,-73],[18,-66],[0,-59]],'#d0cfad','#6e815e',1);
    }else if(type==='wallTorch'){
      polygon(c,[[-6,3],[-6,-23],[6,-23],[6,3]],'#796e4d','#435443',1.3);line(c,[[0,-2],[0,-36]],'#b09a69',4);polygon(c,[[-10,-32],[-7,-19],[7,-19],[10,-32]],'#657466','#3d5143',1.3);
      polygon(c,[[-7,-32],[-10,-39],[-4,-47],[-2,-58],[4,-48],[5,-41],[10,-36],[6,-31]],'#d7ae66');polygon(c,[[-3,-31],[-4,-39],[1,-47],[5,-36],[3,-31]],'#f1d99b');
    }else if(type==='caveMushroom'){
      for(const [x,y,s] of [[-8,2,1],[10,5,.7]]){line(c,[[x,y],[x-1,y-17*s]],'#b6bca2',4*s);c.beginPath();c.moveTo(x-11*s,y-15*s);c.quadraticCurveTo(x-10*s,y-31*s,x,y-29*s);c.quadraticCurveTo(x+10*s,y-28*s,x+12*s,y-16*s);c.quadraticCurveTo(x,y-11*s,x-11*s,y-15*s);c.fillStyle='#7eaaa0';c.fill();c.strokeStyle='#456b5a';c.lineWidth=1;c.stroke();oval(c,x-3*s,y-23*s,3*s,1.5*s,'#c4d1b5');line(c,[[x-7*s,y-15*s],[x+7*s,y-15*s]],'#b1c8ad',1);}
    }else{
      polygon(c,[[-24,5],[-25,-10],[-13,-31],[6,-37],[24,-19],[26,4],[5,15]],'#88977b','#49654c',1.5);
      polygon(c,[[-25,-10],[-13,-31],[6,-37],[3,-12],[-8,-4]],'#b0b89a');polygon(c,[[3,-12],[6,-37],[24,-19],[26,4],[5,15]],'#748b6b');line(c,[[-13,-31],[6,-37],[20,-22]],'#d0d0ad',1);line(c,[[3,-11],[-1,-1],[4,9]],'#516f4e',1);
      for(const [x,y] of [[-12,0],[-18,-10],[12,-18]])oval(c,x,y,3.5,1.7,'#a8b87466');
    }
  },1.5);}
  drawProp(c,prop){
    if(!['interiorWinch','cavernRock','caveMushroom','castlePillar','wallTorch'].includes(prop.type))return false;
    const image=this._prop(prop.type,prop.opened),scale=prop.scale||(prop.type==='cavernRock'?(prop.r||25)/25:prop.type==='castlePillar'?(prop.r||22)/22:1);
    c.drawImage(image.canvas,prop.x-55*scale,prop.y-93*scale,image.w*scale,image.h*scale);return true;
  }
}
