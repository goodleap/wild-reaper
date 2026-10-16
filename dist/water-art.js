import { REGIONS, worldForId } from './world-definitions.js';
// The visible shore and gameplay water share one contour. Large pools are
// rasterized in small world-space tiles, never as an enlarged tiny puddle.
import { getWaterContours, traceWaterPath, waterBounds, containsWater } from './water-geometry.js';
import { paintSnowSurface } from './snow-surface-art.js';

const TAU=Math.PI*2,TILE=192,BLEED=2,PAD=24,PIXEL_LIMIT=2*1024*1024;
const WORLD_WATER=Object.freeze(Object.fromEntries(REGIONS.filter(world=>world.art.water).map(world=>[world.id,world.art.water])));
const random=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function stroke(c,points,color,width=1){c.beginPath();for(let i=0;i<points.length;i++)c[i?'lineTo':'moveTo'](points[i][0],points[i][1]);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function oval(c,x,y,rx,ry,color,angle=0){c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fillStyle=color;c.fill();}
function leaf(c,x,y,length,width,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(-length*.5,0);c.quadraticCurveTo(0,-width,length*.5,0);c.quadraticCurveTo(0,width,-length*.5,0);c.fillStyle=color;c.fill();c.restore();}
function reed(c,x,y,seed,marsh){const r=random(seed),h=8+r()*10;for(let i=0;i<4;i++){const dx=(i-1.5)*1.5,lean=(i-1.5)*2.8,hh=h*(.65+r()*.45);c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx+lean*.3,y-hh*.64,x+dx+lean,y-hh);c.quadraticCurveTo(x+dx+lean*.12,y-hh*.42,x+dx+.7,y);c.fillStyle=[marsh?'#526d4d':'#537651','#81915d','#3a5e45','#6c8959'][i];c.fill();if(i===2&&r()>.43){stroke(c,[[x+dx,y],[x+dx+lean,y-hh-2]],'#89916a',.65);stroke(c,[[x+dx+lean,y-hh-2],[x+dx+lean+.3,y-hh-5]],'#998b5b',1.6);}}}
function shorelinePoints(points,spacing=14){const result=[];let carry=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;for(let d=carry;d<length;d+=spacing)result.push({x:a.x+dx*d/length,y:a.y+dy*d/length,nx:dy/length,ny:-dx/length});carry=(carry-length)%spacing;if(carry<0)carry+=spacing;}return result;}
function valid(mud){return mud&&[mud.x,mud.y,mud.rx,mud.ry].every(Number.isFinite)&&mud.rx>0&&mud.ry>0;}

export class WaterArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this._shapes=new WeakMap();}
  get cacheStats(){return{entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  _shape(mud){
    const seed=Math.floor((mud.seed||0)*3)/3,key=[mud.kind||'water',mud.shape||'ellipse',mud.rx,mud.ry,mud.angle||0,mud.island?1:0,mud.deep?1:0,seed].join(':');
    const previous=this._shapes.get(mud);if(previous?.key===key)return previous;
    const local={...mud,x:0,y:0,seed},contours=getWaterContours(local,{local:true}),b=waterBounds(local),shore=[...shorelinePoints(contours.outer),...contours.holes.flatMap(p=>shorelinePoints(p,13))];
    const r=random(613+Math.round(seed*1e6)),ripples=[];
    for(let i=0;i<80&&ripples.length<3;i++){const x=b.minX+r()*(b.maxX-b.minX),y=b.minY+r()*(b.maxY-b.minY);if(containsWater(local,x,y)&&ripples.every(p=>Math.hypot(p.x-x,p.y-y)>28))ripples.push({x,y});}
    const result={key,local,contours,b,shore,ripples};this._shapes.set(mud,result);return result;
  }
  _tile(shape,region,tx,ty,dpr){
    const key=`${shape.key}:${region}:${tx}:${ty}:${dpr}`;let item=this.cache.get(key);
    if(item){this.cache.delete(key);this.cache.set(key,item);return item;}
    const b=shape.b,x=Math.max(tx*TILE,Math.floor(b.minX-PAD)),y=Math.max(ty*TILE,Math.floor(b.minY-PAD)),w=Math.min((tx+1)*TILE,Math.ceil(b.maxX+PAD))-x,h=Math.min((ty+1)*TILE,Math.ceil(b.maxY+PAD))-y,canvas=this.makeCanvas();
    canvas.width=(w+BLEED*2)*dpr;canvas.height=(h+BLEED*2)*dpr;const c=canvas.getContext('2d');
    c.setTransform(dpr,0,0,dpr,(BLEED-x)*dpr,(BLEED-y)*dpr);c.lineCap='round';c.lineJoin='round';
    this._paint(c,shape,region,{minX:x-BLEED,minY:y-BLEED,maxX:x+w+BLEED,maxY:y+h+BLEED});
    item={canvas,x,y,w,h,pixels:canvas.width*canvas.height};
    while(this.pixels+item.pixels>PIXEL_LIMIT&&this.cache.size){const first=this.cache.keys().next().value;this.pixels-=this.cache.get(first).pixels;this.cache.delete(first);}
    this.cache.set(key,item);this.pixels+=item.pixels;this.builds++;return item;
  }
  _paint(c,shape,region,tile){
    if(region==='snow'&&shape.local.kind!=='lava'){paintSnowSurface(c,shape,tile);return;}
    if(WORLD_WATER[region]||['ice','lava','snow'].includes(shape.local.kind)){this._paintTheme(c,shape,region,tile);return;}
    const {local,b,shore}=shape,marsh=region==='marsh',deep=local.deep===true,seed=Math.round((local.seed||0)*1e6);
    // A narrow dry earthen bank is outside the exact water contour. The broad
    // filled region and all reflective details are clipped to playable water.
    traceWaterPath(c,local,{local:true});c.lineWidth=deep?20:14;c.strokeStyle=deep?'#293e3baa':marsh?'#304a346e':'#49613c75';c.stroke();
    traceWaterPath(c,local,{local:true});c.lineWidth=deep?9:5;c.strokeStyle=deep?'#78836bbf':marsh?'#526447c2':'#627451b5';c.stroke();
    const water=c.createLinearGradient(b.maxX,b.minY,b.minX,b.maxY);
    water.addColorStop(0,deep?(marsh?'#3e5b56':'#3b626c'):marsh?'#496b56':'#52796a');water.addColorStop(.38,deep?'#244750':marsh?'#345748':'#325f58');water.addColorStop(.78,deep?'#203b47':marsh?'#2d493e':'#2d524b');water.addColorStop(1,deep?'#304d58':marsh?'#3e5944':'#426456');
    traceWaterPath(c,local,{local:true});c.fillStyle=water;c.fill();c.save();c.clip();
    // The inner band shows shallow sediment; broken highlights prevent the
    // contour from looking like a uniform UI ring around the pool.
    c.lineWidth=7;c.strokeStyle=marsh?'#88906525':'#a5ac7828';c.stroke();c.lineWidth=1.3;c.strokeStyle=marsh?'#1b392d80':'#203f3470';c.stroke();
    const reflection=c.createLinearGradient(b.maxX,b.minY,b.minX,b.maxY);
    reflection.addColorStop(0,marsh?'#bdd2a723':'#b8dccb2b');reflection.addColorStop(.43,'#b8caa907');reflection.addColorStop(1,'#a6b89500');c.fillStyle=reflection;c.fillRect(tile.minX,tile.minY,tile.maxX-tile.minX,tile.maxY-tile.minY);
    // Texture cells are in world units. A lake gets more little details rather
    // than giant reeds, pebbles or magnified brush pixels. Grid RNG is stable
    // across tile seams and never consumes simulation randomness.
    const cell=48;
    for(let gy=Math.floor((tile.minY-20)/cell);gy<=Math.floor((tile.maxY+20)/cell);gy++)for(let gx=Math.floor((tile.minX-20)/cell);gx<=Math.floor((tile.maxX+20)/cell);gx++){
      const r=random(711+seed+gx*9277+gy*17491),xx=gx*cell,yy=gy*cell;
      for(let i=0;i<20;i++){const x=xx+r()*cell,y=yy+r()*cell;c.fillStyle=i%3?marsh?'#aabb8615':'#c2d0a815':'#132f2727';c.fillRect(x,y,.5+r()*1.5,.4+r()*.65);}
      for(let i=0;i<2;i++){const x=xx+r()*cell,y=yy+r()*cell,n=3+r()*13;stroke(c,[[x,y],[x+n*.43,y-.6],[x+n,y]],marsh?'#b8c39b24':'#c5deca28',.5+r()*.35);}
      if(r()<.38){const x=xx+r()*cell,y=yy+r()*cell;stroke(c,[[x-3,y+3],[x,y],[x+1,y-4],[x+4,y-6]],marsh?'#193d2960':'#1c493e50',.7);}
      if(r()<(marsh?.16:.23)){const x=xx+r()*cell,y=yy+r()*cell,rx=2.3+r()*2.7;oval(c,x,y,rx,rx*.44,marsh?'#719257':'#7b9b64',-.12);stroke(c,[[x-rx*.4,y-.5],[x+rx*.4,y-.8]],'#c3cb925c',.65);stroke(c,[[x,y],[x+rx,y+.5]],'#39583b80',.55);}
    }
    c.restore();
    // Only shoreline fragments in this tile are painted. Vegetation projects
    // upward by at most 20 world pixels, covered by the conservative cull pad.
    for(let i=0;i<shore.length;i++){
      const p=shore[i];if(p.x<tile.minX-18||p.x>tile.maxX+18||p.y<tile.minY-5||p.y>tile.maxY+24)continue;
      const r=random(seed+i*919+281),x=p.x+p.nx*(r()*3),y=p.y+p.ny*(r()*3),n=3+r()*6;
      const tangent=Math.atan2(p.ny,p.nx)+Math.PI*.5;
      if(deep&&i%3===0){const xx=x+p.nx*4,yy=y+p.ny*4,rr=3+r()*4;oval(c,xx,yy,rr,rr*.55,'#46594f',tangent);oval(c,xx+.6,yy-1.1,rr*.88,rr*.32,'#a0a68a',tangent);}
      if(i%3!==0){oval(c,x+p.nx*3,y+p.ny*3,3+r()*5,1.3+r()*2.2,marsh?'#435b3894':'#60744989',tangent);for(let j=0;j<3;j++)leaf(c,x+p.nx*3+(r()-.5)*8,y+p.ny*3+(r()-.5)*4,4+r()*6,.7+r(),tangent+(r()-.5),[marsh?'#7088559e':'#8795579c','#38523ac0','#99a3746b'][j]);}
      leaf(c,x,y,n,.7+r()*1.5,tangent+(r()-.5),[marsh?'#6a8151b8':'#718858bf','#455c3cbd','#a1a06d66'][i%3]);
      if(r()<(marsh?.38:.23))reed(c,x,y,seed+i*327+11,marsh);
      else if(r()<.22){const rr=1.7+r()*2.7;oval(c,x,y,rr,rr*.62,'#566b50');oval(c,x+.45,y-.75,rr*.8,rr*.36,marsh?'#92967c':'#aaa68b');stroke(c,[[x-rr*.5,y-.6],[x+rr*.5,y-rr*.3]],'#d3cfad70',.55);}
      if(i%3===1){const next=shore[(i+1)%shore.length];if(Math.hypot(next.x-p.x,next.y-p.y)<24){const light=clamp((p.nx-p.ny)*.5+.5,.15,1);c.save();c.globalAlpha*=light;stroke(c,[[p.x,p.y],[p.x+(next.x-p.x)*.42,p.y+(next.y-p.y)*.42]],marsh?'#c0c59a52':'#c4d1ae57',.6);c.restore();}}
    }
  }
  _paintTheme(c,shape,region,tile){
    const {local,b,shore}=shape,kind=local.kind||'water',ice=kind==='ice',lava=kind==='lava',snow=kind==='snow',deep=local.deep===true,p=WORLD_WATER[region]||WORLD_WATER.snow,seed=Math.round((local.seed||0)*1e6);
    traceWaterPath(c,local,{local:true});c.lineWidth=deep?20:12;c.strokeStyle=lava?'#1c2225b5':snow?'#91b1b445':p.bank;c.stroke();
    c.lineWidth=deep?8:4;c.strokeStyle=lava?'#66605b':snow?'#dbe8dc':p.rim;c.stroke();
    const gradient=c.createLinearGradient(b.minX,b.minY,b.maxX,b.maxY);
    gradient.addColorStop(0,lava?'#be703f':snow?'#e6eddf':ice?'#c5e3df':deep?'#3b6671':p.top);gradient.addColorStop(.45,lava?'#aa4b31':snow?'#d2e0d8':ice?'#8abfc4':deep?'#244653':p.deep);gradient.addColorStop(1,lava?'#71372d':snow?'#b7d0cf':ice?'#a8d4d0':deep?'#315561':p.top);
    traceWaterPath(c,local,{local:true});c.fillStyle=gradient;c.fill();c.save();c.clip();
    const cell=48;
    for(let gy=Math.floor(tile.minY/cell)-1;gy<=Math.floor(tile.maxY/cell)+1;gy++)for(let gx=Math.floor(tile.minX/cell)-1;gx<=Math.floor(tile.maxX/cell)+1;gx++){
      const r=random(seed+gx*9277+gy*17491+731),x=gx*cell,y=gy*cell;
      for(let i=0;i<12;i++){c.fillStyle=lava?(i%3?'#d789432b':'#fbd17c2b'):i%3?p.light+'34':'#477f841b';c.fillRect(x+r()*cell,y+r()*cell,.5+r()*2,.5+r());}
      if(lava){
        const xx=x+5+r()*29,yy=y+5+r()*28,rx=12+r()*12,ry=8+r()*10;
        c.beginPath();c.moveTo(xx-rx,yy);c.lineTo(xx-rx*.6,yy-ry);c.lineTo(xx+rx*.45,yy-ry*.8);c.lineTo(xx+rx,yy+ry*.2);c.lineTo(xx+rx*.3,yy+ry);c.lineTo(xx-rx*.8,yy+ry*.7);c.closePath();c.fillStyle=['#403b3c','#514340','#663f34'][Math.floor(r()*3)];c.fill();c.strokeStyle='#e99c536e';c.lineWidth=1.4;c.stroke();stroke(c,[[xx-rx*.5,yy-ry*.6],[xx+rx*.3,yy-ry*.5]],'#a47c5360',.8);
        stroke(c,[[x+3,y+7],[x+12,y+10],[x+20,y+6]],'#ffcf8266',1.7);
      }else if(ice){
        if(r()>.35){const xx=x+5+r()*27,yy=y+5+r()*27;stroke(c,[[xx-18,yy+8],[xx-4,yy-1],[xx+2,yy+1],[xx+16,yy-9]],'#f0ffe4a3',1.1);stroke(c,[[xx-4,yy-1],[xx-7,yy-8],[xx-3,yy-14]],'#3e8d9c51',.7);}
        if(r()>.75)stroke(c,[[x+8,y+15],[x+32,y+6]],'#f0fff162',2.5);
      }else if(snow){
        const xx=x+9+r()*28,yy=y+10+r()*27;c.beginPath();c.moveTo(xx-19,yy);c.quadraticCurveTo(xx,yy-5,xx+18,yy-1);c.strokeStyle='#f9fae977';c.lineWidth=1.4;c.stroke();
      }else{
        const xx=x+r()*cell,yy=y+r()*cell;stroke(c,[[xx-8,yy],[xx,yy-.6],[xx+12,yy]],p.light+'42',.7);if(r()>.82){oval(c,xx+8,yy+12,2.3,1.1,region==='beach'?'#d4cbab60':'#87b09640');}
      }
    }
    c.restore();
    for(let i=0;i<shore.length;i++){
      const q=shore[i];if(q.x<tile.minX-8||q.x>tile.maxX+8||q.y<tile.minY-8||q.y>tile.maxY+8)continue;
      const r=random(seed+i*191+319),angle=Math.atan2(q.ny,q.nx)+Math.PI*.5;
      if(deep&&i%3===0){const xx=q.x+q.nx*4,yy=q.y+q.ny*4,rr=3+r()*4;oval(c,xx,yy,rr,rr*.6,lava?'#313135':'#4c6664',angle);oval(c,xx+.4,yy-1.1,rr*.84,rr*.3,lava?'#8b7866':region==='snow'?'#c5d7cf':'#a5ad92',angle);}
      if(lava){oval(c,q.x+q.nx*2,q.y+q.ny*2,3+r()*4,1.5+r()*2,'#57504b',angle);if(i%4===0)stroke(c,[[q.x-2,q.y],[q.x+2,q.y-1]],'#eeae6f8c',.8);}
      else if(ice||snow){if(i%3===0)leaf(c,q.x,q.y,7+r()*7,1.1+r()*2,angle,'#edf6e6c0');}
      else if(i%3===0){oval(c,q.x+q.nx*2,q.y+q.ny*2,2+r()*3,1+r(),region==='beach'?'#d3c499':'#a2b69a',angle);}
    }
  }
  draw(c,mud,options={}){
    if(!valid(mud))return false;
    const snowTheme=options.theme==='snow'||worldForId(options.region)?.authored?.artTheme==='snow';
    const shape=this._shape(mud),region=snowTheme?'snow':(options.region==='marsh'||WORLD_WATER[options.region])?options.region:'forest',b=shape.b;
    // Small and medium shores are retina crisp. Broad water uses the same
    // world-pixel density as the ground, preventing a lake from evicting its
    // own tiles on every frame. Edge tiles allocate only their actual extent.
    const area=(b.maxX-b.minX+PAD*2)*(b.maxY-b.minY+PAD*2),dpr=Number.isFinite(options.pixelRatio)&&options.pixelRatio>1&&area<=80_000?2:1;
    const view=options.viewBounds;
    const minX=Math.max(b.minX-PAD,view?view.minX-mud.x:-Infinity),maxX=Math.min(b.maxX+PAD,view?view.maxX-mud.x:Infinity),minY=Math.max(b.minY-PAD,view?view.minY-mud.y:-Infinity),maxY=Math.min(b.maxY+PAD,view?view.maxY-mud.y:Infinity);
    if(minX>=maxX||minY>=maxY)return true;
    c.save();c.translate(mud.x,mud.y);
    for(let ty=Math.floor(minY/TILE);ty<=Math.floor((maxY-1e-8)/TILE);ty++)for(let tx=Math.floor(minX/TILE);tx<=Math.floor((maxX-1e-8)/TILE);tx++){
      const image=this._tile(shape,region,tx,ty,dpr);
      // Bleed is sampled for antialiasing but only the tile interior is drawn,
      // so translucent banks never darken at seams from overlapping images.
      c.drawImage(image.canvas,BLEED*dpr,BLEED*dpr,image.w*dpr,image.h*dpr,image.x,image.y,image.w,image.h);
    }
    if(['ice','snow','lava'].includes(mud.kind)){c.restore();return true;}
    const time=options.reduced?0:(Number.isFinite(options.time)?options.time:0),count=Math.min(shape.ripples.length,options.dense?1:3);
    traceWaterPath(c,shape.local,{local:true});c.clip();c.strokeStyle=WORLD_WATER[region]?.light||(region==='marsh'?'#c2d2a7':'#d0e5cc');c.lineWidth=.65;
    for(let i=0;i<count;i++){const p=shape.ripples[i],phase=((time*.17+(mud.seed||0)*3+i*.37)%1+1)%1;c.save();c.globalAlpha*=.2*(1-phase);c.beginPath();c.ellipse(p.x,p.y,3+phase*15,1.4+phase*3.8,0,.12,Math.PI*.92);c.stroke();c.restore();}
    c.restore();return true;
  }
}
