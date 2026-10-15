// The authored valley uses the very same polygons for art, collision and maps.
// These small raster tiles are presentation only; no scenery is generated here.
export const RIFT_PALETTE=Object.freeze({ground:'#f3e4b9',groundShade:'#dfd2a9',grass:'#b4ca88',grassLight:'#c7d79e',forest:'#244337',forestDark:'#172f29',forestLight:'#335647',cliff:'#68615a',cliffLight:'#91877b',cliffDark:'#454540',water:'#226a96',waterDeep:'#1d5982',waterEdge:'#438eb4',bridge:'#bb894c',bridgeLight:'#e2b879',bridgeDark:'#644b32'});
const TAU=Math.PI*2,TILE=384,BLEED=2,PIXEL_LIMIT=6*1024*1024,FONT='"PingFang SC",system-ui,sans-serif';
const preparedLayouts=new WeakMap();
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
function trace(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=point(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function rings(c,boundaries){c.beginPath();for(const boundary of boundaries)trace(c,boundary.points||boundary,false);}
function bounds(points){return points.reduce((b,p)=>{p=point(p);b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);return b;},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,margin=0)=>!b||a.maxX+margin>=b.minX&&a.minX-margin<=b.maxX&&a.maxY+margin>=b.minY&&a.minY-margin<=b.maxY;
function prepared(layout){let data=preparedLayouts.get(layout);if(data)return data;const records=items=>(items||[]).map(value=>({value,bounds:bounds(value.points||[])}));data={areas:records(layout.areas),patches:records(layout.patches),lakes:records(layout.lakes),bridges:records((layout.passages||[]).filter(p=>p.kind==='bridge').map(p=>{if(!p.deck?.length)return p;const [a,b]=p.deck,angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle)*p.width/2,ny=Math.cos(angle)*p.width/2;return {...p,waypoints:p.deck,points:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]};}))};
  const rocky=new Set(['03','06','09','11','13','14','17']);data.banks=[];
  for(const boundary of layout.solidBoundaries||layout.boundaries||[]){const points=boundary.points||boundary;for(let i=0;i<points.length;i++){const a=point(points[i]),b=point(points[(i+1)%points.length]),x=(a.x+b.x)/2,y=(a.y+b.y)/2;let nearest=null,distance=Infinity;for(const area of layout.areas||[]){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<distance){distance=d;nearest=area;}}data.banks.push({a,b,bounds:bounds([a,b]),forest:!rocky.has(nearest?.id),seed:data.banks.length});}}
  preparedLayouts.set(layout,data);return data;}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function strokeLine(c,ax,ay,bx,by,color,width){c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function bridge(c,p,{overview=false}={}){
  const colors=RIFT_PALETTE;c.save();trace(c,p.points);c.fillStyle=colors.bridgeDark;c.fill();c.clip();
  c.fillStyle=colors.bridge;c.fillRect(...(()=>{const b=bounds(p.points);return [b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY];})());
  const route=p.waypoints||[];
  for(let i=1;i<route.length;i++){
    const a=point(route[i-1]),b=point(route[i]),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),width=p.width||130;
    if(length<1)continue;const angle=Math.atan2(dy,dx),spacing=overview?38:17;c.save();c.translate(a.x,a.y);c.rotate(angle);
    for(let x=0;x<length+spacing;x+=spacing){const n=hash(x+p.width,i);c.fillStyle=n>.5?'#c49354':'#af7e45';c.fillRect(x+1,-width*.5,spacing-2,width);strokeLine(c,x+2,-width*.5,x+2,width*.5,colors.bridgeLight,overview?5:1.5);if(!overview)strokeLine(c,x+6,-width*.3,x+7,width*.3,'#815d383e',.8);}
    for(const side of [-1,1]){const y=side*(width*.5-8);strokeLine(c,0,y,length,y,colors.bridgeDark,overview?12:8);strokeLine(c,0,y-2,length,y-2,colors.bridgeLight,overview?5:2.5);for(let x=12;x<length;x+=74){c.fillStyle=colors.bridgeDark;c.fillRect(x-5,y-8,10,16);c.fillStyle=colors.bridgeLight;c.fillRect(x-3,y-8,6,4);}}
    c.restore();
  }
  c.restore();trace(c,p.points);c.strokeStyle=colors.bridgeDark;c.lineWidth=overview?9:2;c.stroke();
}
function base(c,layout,{viewBounds,overview=false}={}){
  const p=RIFT_PALETTE,data=prepared(layout),b=viewBounds||layout.bounds;c.fillStyle=p.forest;c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  // The long banks occupy blocked land. The walkable union is painted last,
  // so neither a decorative edge nor an overlapping region moves a doorway.
  paintBanks(c,layout,viewBounds,false);
  for(const {value:lake,bounds:b}of data.lakes){if(!overlaps(b,viewBounds,10))continue;lakePath(c,lake);c.fillStyle=p.water;c.fill('evenodd');c.strokeStyle=p.waterEdge;c.lineWidth=overview?16:7;c.stroke();}
  rings(c,layout.boundaries||[]);c.fillStyle=p.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries||[]);c.clip('evenodd');
  c.strokeStyle=p.grass;c.lineWidth=32;c.stroke();c.strokeStyle='#d7dca2';c.lineWidth=10;c.stroke();
  for(const {value:area,bounds:b}of data.areas){if(!overlaps(b,viewBounds))continue;if(area.kind==='quarry'||area.id==='03'){trace(c,area.points);c.fillStyle='#ede0bd';c.fill();}else if(area.kind==='ruins'||area.id==='11'||area.id==='17'){trace(c,area.points);c.fillStyle='#e4ddbd';c.fill();}}
  for(const {value:patch,bounds:b}of data.patches){if(!overlaps(b,viewBounds))continue;trace(c,patch.points);c.fillStyle=p.grass;c.fill();if(!overview){c.strokeStyle=p.grassLight;c.lineWidth=4;c.stroke();}}
  c.restore();
  for(const {value:p,bounds:b}of data.bridges)if(overlaps(b,viewBounds,10))bridge(c,p,{overview});
}
function leafMass(c,x,y,r,seed){
  const p=RIFT_PALETTE;c.fillStyle=p.forestDark;c.beginPath();c.ellipse(x,y+7,r*.94,r*.69,0,0,TAU);c.fill();
  for(let i=0;i<5;i++){const a=i*TAU/5,xx=x+Math.cos(a)*r*.34,yy=y+Math.sin(a)*r*.22;c.fillStyle=i<2?p.forestLight:i<4?'#2b4e3e':p.forest;c.beginPath();c.ellipse(xx,yy,r*(.51+hash(seed,i)*.16),r*.4,-.2,0,TAU);c.fill();}
  for(let i=0;i<6;i++){const xx=x+(hash(seed+i,18)-.5)*r*1.2,yy=y+(hash(i,seed)-.5)*r*.7;strokeLine(c,xx,yy,xx+4,yy-2,'#55715566',1.2);}
}
function paintBanks(c,layout,view,detail){
  const p=RIFT_PALETTE,data=prepared(layout);rings(c,layout.solidBoundaries||layout.boundaries||[]);c.strokeStyle=p.forestDark;c.lineWidth=122;c.stroke();c.strokeStyle=p.cliff;c.lineWidth=98;c.stroke();c.strokeStyle=p.cliffDark;c.lineWidth=12;c.stroke();
  for(const {a,b,bounds:box,forest,seed}of data.banks){if(!overlaps(box,view,90))continue;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    if(forest){strokeLine(c,a.x,a.y,b.x,b.y,p.forestDark,124);strokeLine(c,a.x,a.y,b.x,b.y,p.forestLight,92);strokeLine(c,a.x,a.y,b.x,b.y,p.forest,65);}
    if(!detail)continue;
    for(let d=0;d<len;){const n=hash(seed,d),step=24+n*25,x=a.x+dx*d/len,y=a.y+dy*d/len;if(!view||x>=view.minX-70&&x<=view.maxX+70&&y>=view.minY-70&&y<=view.maxY+70){
      if(forest){for(const side of [-1,1])leafMass(c,x+nx*side*(29+n*9),y+ny*side*(29+n*9),35+n*13,seed+d);}
      else for(const side of [-1,1]){const wide=31+n*17,ex=x+dx*Math.min(step,len-d)/len,ey=y+dy*Math.min(step,len-d)/len;c.beginPath();c.moveTo(x+nx*side*7,y+ny*side*7);c.lineTo(ex+nx*side*(8+n*5),ey+ny*side*(8+n*5));c.lineTo(ex+nx*side*wide,ey+ny*side*wide);c.lineTo(x+nx*side*(wide-4)+dx/len*8,y+ny*side*(wide-4)+dy/len*8);c.closePath();c.fillStyle=['#847c6d','#6f6a5e','#918674','#777369'][Math.floor(n*4)];c.fill();strokeLine(c,x+nx*side*10,y+ny*side*10,x+nx*side*wide+dx/len*8,y+ny*side*wide+dy/len*8,'#3d453c88',1.7);strokeLine(c,x+nx*side*(wide-3)+dx/len*8,y+ny*side*(wide-3)+dy/len*8,ex+nx*side*wide,ey+ny*side*wide,'#c2b39777',1.2);}
    }d+=step;}
  }
}
function groundDetails(c,layout,view){
  const p=RIFT_PALETTE,data=prepared(layout);
  c.save();rings(c,layout.boundaries||[]);c.clip('evenodd');
  for(let gy=Math.floor(view.minY/39)-1;gy<=Math.floor(view.maxY/39)+1;gy++)for(let gx=Math.floor(view.minX/39)-1;gx<=Math.floor(view.maxX/39)+1;gx++){
    const n=hash(gx+17,gy),x=(gx+hash(gx,gy+7))*39,y=(gy+hash(gy,gx+39))*39;
    c.fillStyle=n>.5?'#8a835c30':'#fff6d777';c.beginPath();c.ellipse(x,y,1+n*2,.5+n*.5,-.2,0,TAU);c.fill();
    if(n>.78){strokeLine(c,x+5,y-1,x+8,y-5,'#99a56777',1);strokeLine(c,x+7,y,x+12,y-3,'#8ca26477',1);}
  }
  for(const {value:patch,bounds:b}of data.patches){if(!overlaps(b,view))continue;c.save();trace(c,patch.points);c.clip();
    for(let gy=Math.floor(Math.max(view.minY,b.minY)/28)-1;gy<=Math.floor(Math.min(view.maxY,b.maxY)/28)+1;gy++)for(let gx=Math.floor(Math.max(view.minX,b.minX)/28)-1;gx<=Math.floor(Math.min(view.maxX,b.maxX)/28)+1;gx++){
      const n=hash(gx,gy+91),x=(gx+.15+n*.7)*28,y=(gy+.1+hash(gy,gx)*.8)*28;if(n<.35)continue;
      for(let i=0;i<3;i++)strokeLine(c,x+i*2,y,x-2+i*4,y-3-n*5,i%2?'#718e536f':'#dbe5b180',.9);
    }
    // Low fern clumps sit beneath the sparse, depth-sorted trees supplied by
    // terrain. They are floor cover and do not imply another solid obstacle.
    for(let gy=Math.floor(Math.max(view.minY,b.minY)/83)-1;gy<=Math.floor(Math.min(view.maxY,b.maxY)/83)+1;gy++)for(let gx=Math.floor(Math.max(view.minX,b.minX)/83)-1;gx<=Math.floor(Math.min(view.maxX,b.maxX)/83)+1;gx++){
      const n=hash(gx+41,gy-19);if(n<.38)continue;const x=(gx+.2+n*.6)*83,y=(gy+.15+hash(gy+9,gx)*.7)*83;
      c.fillStyle='#7b965242';c.beginPath();c.ellipse(x,y+1,12+n*6,5,0,0,TAU);c.fill();
      for(let i=0;i<5;i++){const xx=x+(i-2)*6,yy=y-5-Math.sin(i*Math.PI/4)*(7+n*6);strokeLine(c,x,y,xx,yy,'#69894f',1);c.beginPath();c.ellipse((x+xx)/2,(y+yy)/2,7+n*2,2.6,Math.atan2(yy-y,xx-x),0,TAU);c.fillStyle=i%2?'#8eaf65':'#a5be7b';c.fill();}
    }c.restore();
  }c.restore();
  for(const {value:lake,bounds:b}of data.lakes){if(!overlaps(b,view))continue;c.save();lakePath(c,lake);c.clip('evenodd');
    for(let gy=Math.floor(view.minY/50)-1;gy<=Math.floor(view.maxY/50)+1;gy++)for(let gx=Math.floor(view.minX/61)-1;gx<=Math.floor(view.maxX/61)+1;gx++){
      const n=hash(gx+71,gy),x=(gx+n)*61,y=(gy+hash(gy,gx+31))*50;strokeLine(c,x,y,x+11+n*22,y-1,'#8ac6cc30',1);strokeLine(c,x+4,y+4,x+10+n*10,y+3,'#103e6c33',1.5);
    }c.restore();
  }
  // Dense crowns and rock facets stay strictly outside the walkable union.
  // The outer rectangle makes this an inverse mask without another collision
  // approximation or thousands of individual obstacle props.
  c.save();c.beginPath();c.rect(view.minX-4,view.minY-4,view.maxX-view.minX+8,view.maxY-view.minY+8);for(const boundary of layout.solidBoundaries||layout.boundaries||[])trace(c,boundary.points||boundary,false);c.clip('evenodd');
  for(let gy=Math.floor((view.minY-58)/67);gy<=Math.floor((view.maxY+58)/67);gy++)for(let gx=Math.floor((view.minX-58)/75);gx<=Math.floor((view.maxX+58)/75);gx++){
    const n=hash(gx+13,gy+11),x=(gx+.15+n*.7)*75,y=(gy+.1+hash(gy,gx)*.8)*67;leafMass(c,x,y,28+n*15,gx*37+gy*59);
  }
  paintBanks(c,layout,view,true);
  c.restore();
  for(const {value:p,bounds:b}of data.bridges)if(overlaps(b,view,10))bridge(c,p);
}

export function drawRiftOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  if(layout?.kind!=='rift-forest')return false;c.save();c.lineJoin='round';c.lineCap='round';base(c,layout,{viewBounds,overview:true});
  if(landmarks){for(const [key,mark]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(mark.x)||!Number.isFinite(mark.y)||viewBounds&&!overlaps({minX:mark.x,minY:mark.y,maxX:mark.x,maxY:mark.y},viewBounds))continue;
    if(/^boss/.test(key)){c.save();c.translate(mark.x,mark.y);c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=(i%2?3:7)/scale;c[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fillStyle='#d85742';c.strokeStyle='#713e31';c.lineWidth=1/scale;c.fill();c.stroke();c.restore();}
    else if(/^cave/.test(key)){c.save();c.translate(mark.x,mark.y);c.fillStyle='#1c2d26';c.strokeStyle='#aaa28e';c.lineWidth=2/scale;c.beginPath();c.arc(0,0,5/scale,Math.PI,0);c.lineTo(5/scale,4/scale);c.lineTo(-5/scale,4/scale);c.closePath();c.fill();c.stroke();c.restore();}
    else if(/^treasure/.test(key)){c.fillStyle='#edc560';c.strokeStyle='#7e6935';c.lineWidth=1/scale;c.fillRect(mark.x-4/scale,mark.y-3/scale,8/scale,6/scale);c.strokeRect(mark.x-4/scale,mark.y-3/scale,8/scale,6/scale);}
  }const start=layout.areas?.find(area=>area.id==='01')?.center;if(start){c.fillStyle='#e7ca72';c.strokeStyle='#594c2f';c.lineWidth=1/scale;c.fillRect(start.x-4/scale,start.y-4/scale,8/scale,8/scale);c.strokeRect(start.x-4/scale,start.y-4/scale,8/scale,8/scale);}}
  if(labels){c.textAlign='center';c.textBaseline='middle';c.font=`600 ${11/scale}px ${FONT}`;c.lineWidth=3/scale;c.strokeStyle='#f8efd8';c.fillStyle='#22352a';for(const area of layout.areas||[]){const p=area.label||area.center;if(!p||viewBounds&&!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},viewBounds))continue;const name=`${area.id} ${area.name}`;c.strokeText(name,p.x,p.y);c.fillText(name,p.x,p.y);}}
  c.restore();return true;
}

export class RiftArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this.ids=new WeakMap();this.nextId=0;}
  get cacheStats(){return {entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  _tile(layout,tx,ty){let id=this.ids.get(layout);if(!id){id=++this.nextId;this.ids.set(layout,id);}const key=`${id}:${tx}:${ty}`;let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas(),side=TILE+BLEED*2;canvas.width=canvas.height=side;const c=canvas.getContext('2d'),view={minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED};c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);c.lineCap='round';c.lineJoin='round';base(c,layout,{viewBounds:view});groundDetails(c,layout,view);
    image={canvas,pixels:side*side};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  drawGround(c,island,{camX=0,camY=0,width=1100,height=700}={}){const layout=island?.layout;if(layout?.kind!=='rift-forest')return false;const left=camX-width/2,top=camY-height/2;c.save();for(let ty=Math.floor(top/TILE);ty<=Math.floor((top+height)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((left+width)/TILE);tx++){const image=this._tile(layout,tx,ty);c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE-left,ty*TILE-top,TILE,TILE);}c.restore();return true;}
}

// Dynamic doorway/shortcut state is deliberately separate from cached floor.
// Call from the existing world depth queue at the landmark's ground anchor.
export function drawRiftLandmark(c,site){
  if(!['cave','shortcut','exit'].includes(site?.kind))return false;const p=RIFT_PALETTE;c.save();c.translate(site.x,site.y);
  if(site.kind==='cave'){
    c.fillStyle='#34443755';c.beginPath();c.ellipse(0,4,52,15,0,0,TAU);c.fill();
    const blocks=[[-45,-3,14,26],[-37,-28,17,27],[-19,-49,20,23],[8,-51,22,22],[28,-32,18,27],[40,-7,15,27]];
    c.beginPath();c.moveTo(-35,5);c.lineTo(-34,-27);c.bezierCurveTo(-26,-72,25,-72,34,-27);c.lineTo(35,5);c.closePath();c.fillStyle='#182b27';c.fill();
    for(let i=0;i<blocks.length;i++){const [x,y,w,h]=blocks[i];c.beginPath();c.moveTo(x-w*.5,y);c.lineTo(x-w*.55,y-h*.65);c.lineTo(x-w*.2,y-h);c.lineTo(x+w*.48,y-h*.8);c.lineTo(x+w*.5,y-h*.2);c.closePath();c.fillStyle=i%2?p.cliff:p.cliffLight;c.fill();c.strokeStyle=p.cliffDark;c.lineWidth=1.5;c.stroke();strokeLine(c,x-w*.15,y-h+2,x+w*.4,y-h*.8+2,'#bfb397',1);}
    c.fillStyle='#978a6955';c.beginPath();c.ellipse(0,1,23,6,0,0,TAU);c.fill();strokeLine(c,-18,7,20,7,'#c8bc94',2);
  }else if(site.kind==='shortcut'){
    c.rotate(site.angle||0);const width=site.width||(site.halfLength?site.halfLength*2:120),half=width*.5;
    for(const side of [-1,1]){c.fillStyle='#3b392c';c.fillRect(side*half-7,-42,14,48);c.fillStyle='#aa8750';c.fillRect(side*half-4,-42,6,46);c.fillStyle='#cbb584';c.fillRect(side*half-8,-44,16,5);}
    if(!site.open&&!site.gateOpen){for(let x=-half+12;x<half-5;x+=14){c.fillStyle='#5f4b31';c.fillRect(x-4,-35,8,38);c.fillStyle='#b69057';c.fillRect(x-2,-35,3,36);}strokeLine(c,-half,-28,half,-28,'#735635',6);strokeLine(c,-half,-7,half,-7,'#a37d48',6);strokeLine(c,-half+6,-8,half-6,-30,'#c09a60',4);c.fillStyle='#4b645f';c.fillRect(-5,-23,10,12);}
  }else{
    const angle=Number.isFinite(site.angle)?site.angle:-Math.PI/2;c.save();c.rotate(angle);c.fillStyle='#d7c99a';c.beginPath();c.moveTo(25,0);c.lineTo(6,-11);c.lineTo(7,-4);c.lineTo(-15,-4);c.lineTo(-15,4);c.lineTo(7,4);c.lineTo(6,11);c.closePath();c.fill();c.restore();
    c.fillStyle='#4e5038';c.fillRect(31,-39,5,43);c.fillStyle='#bb985c';c.beginPath();c.moveTo(19,-40);c.lineTo(49,-40);c.lineTo(55,-33);c.lineTo(49,-27);c.lineTo(19,-27);c.closePath();c.fill();strokeLine(c,23,-33,43,-33,'#665337',1.5);
  }c.restore();return true;
}

const caveTiles=new Map();
function caveTile(variant){let canvas=caveTiles.get(variant);if(canvas)return canvas;canvas=document.createElement('canvas');canvas.width=canvas.height=384;const c=canvas.getContext('2d');c.fillStyle='#77725e';c.fillRect(0,0,384,384);for(let i=0;i<280;i++){const x=hash(i+variant*13,72)*384,y=hash(i+91,variant)*384,n=hash(i,variant+87);c.fillStyle=i%3?'#a49b7744':'#3e49413b';c.beginPath();c.ellipse(x,y,.7+n*3,.5+n*1.3,-.2,0,TAU);c.fill();if(i%17===0){strokeLine(c,x-5,y,x+7,y-2,'#a5a08160',1);strokeLine(c,x+7,y-2,x+12,y+2,'#4c554756',.8);}}caveTiles.set(variant,canvas);return canvas;}
export function drawRiftCaveGround(c,state,camX,camY,width,height){
  c.save();c.fillStyle='#26352f';c.fillRect(0,0,width,height);const b=state.bounds,left=camX-width/2,top=camY-height/2;if(!b){c.restore();return;}c.beginPath();c.rect(b.minX-left,b.minY-top,b.maxX-b.minX,b.maxY-b.minY);c.clip();for(let ty=Math.floor(Math.max(b.minY,top)/384);ty<=Math.floor(Math.min(b.maxY,top+height)/384);ty++)for(let tx=Math.floor(Math.max(b.minX,left)/384);tx<=Math.floor(Math.min(b.maxX,left+width)/384);tx++)c.drawImage(caveTile(Math.floor(hash(tx+7,ty)*4)),tx*384-left,ty*384-top);c.restore();
}
export function drawRiftCaveExits(c,state){
  for(const exit of state.riftExits||[]){c.save();c.translate(exit.x,exit.y);for(let i=0;i<5;i++){const y=-16+i*7,w=38+i*3;c.fillStyle=['#b2a68a','#a6997e','#9a9075','#89836c','#817e66'][i];c.fillRect(-w*.5,y,w,7);strokeLine(c,-w*.5,y+6,w*.5,y+6,'#4b5547',1);strokeLine(c,-w*.5,y,w*.5,y,'#d1c4a7',.8);}c.textAlign='center';c.font=`600 10px ${FONT}`;c.fillStyle='#e8dab3';c.lineWidth=3;c.strokeStyle='#27372e';c.strokeText(exit.name||'返回地面',0,38);c.fillText(exit.name||'返回地面',0,38);c.restore();}
}
export function drawRiftCaveWall(c,wall){
  const angle=wall.angle||0,half=wall.halfLength||0,r=wall.r||14,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half,nx=-Math.sin(angle)*r,ny=Math.cos(angle)*r,ax=wall.x-dx,ay=wall.y-dy,bx=wall.x+dx,by=wall.y+dy;
  c.save();c.lineCap='round';strokeLine(c,ax,ay,bx,by,'#3b453b',r*2+2);c.beginPath();c.moveTo(ax+nx,ay+ny);c.lineTo(bx+nx,by+ny);c.lineTo(bx+nx,by+ny-32);c.lineTo(ax+nx,ay+ny-32);c.closePath();c.fillStyle='#5c5d4e';c.fill();c.beginPath();c.moveTo(ax-nx,ay-ny);c.lineTo(bx-nx,by-ny);c.lineTo(bx-nx,by-ny-32);c.lineTo(ax-nx,ay-ny-32);c.closePath();c.fillStyle='#686658';c.fill();strokeLine(c,ax,ay-32,bx,by-32,'#9b927c',r*2);strokeLine(c,ax-nx*.5,ay-ny*.5-34,bx-nx*.5,by-ny*.5-34,'#b6aa8e',3);
  const len=half*2||1;for(let d=8;d<len;d+=23){const t=d/len,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,n=hash(d,wall.seed||0);strokeLine(c,x+nx*.7,y+ny*.7-29,x+nx*.8+3,y+ny*.8-6-n*8,'#424b3f88',1.2);strokeLine(c,x-nx*.6,y-ny*.6-33,x+nx*.5,y+ny*.5-34,'#d3c5a466',1);}c.restore();
}
