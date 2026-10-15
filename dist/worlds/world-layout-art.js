import { traceWaterPath } from '../water-geometry.js';
import { RiftArt, drawRiftOverview } from './rift-art.js';

const TAU=Math.PI*2,TILE=256,BLEED=2,PIXEL_LIMIT=6*1024*1024;
const PALETTES=Object.freeze({
  forest:{bed:'#203b2c',edge:'#557146',leaf:'#799153',path:'#8e805b',pathEdge:'#172e2355',grass:['#526f42','#6e8951','#91a262'],mapForest:'#203f2c',mapBrush:'#597447',mapPath:'#a29b70'},
  marsh:{bed:'#263d35',edge:'#596d48',leaf:'#8b9a69',path:'#8a8463',pathEdge:'#1d383355',grass:['#526d4d','#798760','#9fa16b'],mapForest:'#283e35',mapBrush:'#68794d',mapPath:'#a1a080'},
  ruins:{bed:'#485440',edge:'#758168',leaf:'#a9af86',path:'#aaa68a',pathEdge:'#35463855',grass:['#60744b','#839360','#a2aa73'],mapForest:'#4b6347',mapBrush:'#7e8e5c',mapPath:'#b2af95'},
  beach:{bed:'#8f9570',edge:'#abae7c',leaf:'#c5bc83',path:'#d4bd85',pathEdge:'#7c805433',grass:['#78905b','#a1a36a','#c5bc83'],mapForest:'#6a8657',mapBrush:'#9eaa6f',mapPath:'#ddca98'},
  city:{bed:'#60685b',edge:'#838a70',leaf:'#b0b18d',path:'#a6a58d',pathEdge:'#414c4855',grass:['#617951','#87966b','#a6ac7b'],mapForest:'#435f49',mapBrush:'#7a8c5e',mapPath:'#b6b59b'},
  mountain:{bed:'#5b6d5b',edge:'#809178',leaf:'#b0b69a',path:'#afa48b',pathEdge:'#3e51443d',grass:['#657e56','#879568','#a6ad7e'],mapForest:'#3f6048',mapBrush:'#768b5e',mapPath:'#c0b59a'},
  snow:{bed:'#92afb0',edge:'#b8ceca',leaf:'#e8ecda',path:'#a4b9b6',pathEdge:'#6b939126',grass:['#718f87','#a5bbb0','#dae2cd'],mapForest:'#6a9185',mapBrush:'#adc3af',mapPath:'#dce2cb'},
  volcano:{bed:'#292e30',edge:'#524d49',leaf:'#9c8666',path:'#84735f',pathEdge:'#20252b70',grass:['#665e47','#8b7952','#ab9063'],mapForest:'#454b3f',mapBrush:'#635d46',mapPath:'#a18c70'}
});
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const overlaps=(a,b)=>a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxY>=b.minY&&a.minY<=b.maxY;
const mapObstacles=new WeakMap();
const patchBounds=p=>{const a=p.angle||0,c=Math.cos(a),s=Math.sin(a),rx=Math.hypot(p.rx*c,p.ry*s),ry=Math.hypot(p.rx*s,p.ry*c);return {minX:p.x-rx-14,minY:p.y-ry-30,maxX:p.x+rx+14,maxY:p.y+ry+14};};
const routeBounds=p=>({minX:Math.min(p.ax,p.bx)-p.r,minY:Math.min(p.ay,p.by)-p.r,maxX:Math.max(p.ax,p.bx)+p.r,maxY:Math.max(p.ay,p.by)+p.r});
function inPatch(p,x,y,margin=0){const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0),dx=x-p.x,dy=y-p.y;return ((dx*c+dy*s)/(p.rx+margin))**2+((-dx*s+dy*c)/(p.ry+margin))**2<=1;}
function nearRoute(p,x,y){const dx=p.bx-p.ax,dy=p.by-p.ay,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-p.ax)*dx+(y-p.ay)*dy)/length)):0;return (x-p.ax-dx*t)**2+(y-p.ay-dy*t)**2<(p.r*.68)**2;}
function path(c,route){c.beginPath();c.moveTo(route.ax,route.ay);c.lineTo(route.bx,route.by);}
function obstaclesFor(layout){
  let records=mapObstacles.get(layout);if(records)return records;
  records=(layout.obstacles||[]).filter(p=>p.type!=='tree'&&p.visual!==false).map(p=>{
    const angle=p.angle||0,half=p.type==='log'?(p.halfLength||0):0,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half;
    const shape={ax:p.x-dx,ay:p.y-dy,bx:p.x+dx,by:p.y+dy,r:p.r,angle};return {...shape,bounds:routeBounds(shape)};
  });mapObstacles.set(layout,records);return records;
}
function obstaclePath(c,p){
  const nx=-Math.sin(p.angle)*p.r,ny=Math.cos(p.angle)*p.r;
  c.beginPath();c.moveTo(p.ax+nx,p.ay+ny);c.lineTo(p.bx+nx,p.by+ny);c.arc(p.bx,p.by,p.r,p.angle+Math.PI/2,p.angle-Math.PI/2,true);c.lineTo(p.ax-nx,p.ay-ny);c.arc(p.ax,p.ay,p.r,p.angle-Math.PI/2,p.angle-Math.PI*1.5,true);c.closePath();
}
function ellipse(c,p,scale=1){c.beginPath();c.ellipse(p.x,p.y,p.rx*scale,p.ry*scale,p.angle||0,0,TAU);}
function routeContour(c,route,width){
  const dx=route.bx-route.ax,dy=route.by-route.ay,length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length,steps=Math.max(2,Math.ceil(length/38)),left=[],right=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,x=route.ax+dx*t,y=route.ay+dy*t,n=hash(i+route.ax,route.by),w=width*(.45+n*.055),drift=(hash(i+route.by,route.ax)-.5)*5;
    left.push([x+nx*(w+drift),y+ny*(w+drift)]);right.push([x-nx*(w-drift),y-ny*(w-drift)]);
  }
  c.moveTo(...left[0]);for(const point of left.slice(1))c.lineTo(...point);for(const point of right.reverse())c.lineTo(...point);c.closePath();
  for(const [x,y]of [[route.ax,route.ay],[route.bx,route.by]]){c.moveTo(x+width*.46,y);c.arc(x,y,width*.46,0,-TAU,true);c.closePath();}
}
function tuft(c,x,y,size,seed,colors,reed=false){
  for(let i=0;i<4;i++){const dx=(i-1.5)*size*.8,h=size*(2.4+hash(i+seed,81)*2.8),lean=(i-1.5)*size;
    c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx+lean*.3,y-h*.58,x+dx+lean,y-h);c.quadraticCurveTo(x+dx+lean*.15,y-h*.35,x+dx+size*.7,y);c.fillStyle=colors[i%colors.length];c.fill();
    if(reed&&i===2){c.beginPath();c.moveTo(x+dx+lean,y-h);c.lineTo(x+dx+lean,y-h-3);c.strokeStyle=colors[2];c.lineWidth=1.2;c.stroke();}
  }
}
function pebble(c,x,y,size,seed,p){
  c.beginPath();c.moveTo(x-size,y);c.lineTo(x-size*.65,y-size*.6);c.lineTo(x+size*.4,y-size*.8);c.lineTo(x+size,y-size*.1);c.lineTo(x+size*.7,y+size*.35);c.lineTo(x-size*.6,y+size*.4);c.closePath();c.fillStyle=seed>.5?p.edge:p.bed;c.fill();
  c.beginPath();c.moveTo(x-size*.6,y-size*.5);c.lineTo(x+size*.3,y-size*.7);c.strokeStyle=p.leaf;c.lineWidth=.6;c.stroke();
}

// The macro layout supplies all positions. These bounded transparent tiles add
// ground detail only; collision and the raised scenery keep their own geometry.
export class WorldLayoutArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this.layouts=new WeakMap();this.nextLayout=0;this.riftArt=new RiftArt(makeCanvas);}
  get cacheStats(){const rift=this.riftArt.cacheStats;return {entries:this.cache.size+rift.entries,pixels:this.pixels+rift.pixels,bytes:this.pixels*4+rift.bytes,limitBytes:PIXEL_LIMIT*4+rift.limitBytes,builds:this.builds+rift.builds};}
  _layout(island){
    const layout=island.layout;if(!layout)return null;
    let prepared=this.layouts.get(layout);if(prepared)return prepared;
    prepared={id:++this.nextLayout,layout,palette:PALETTES[island.region]||PALETTES.forest,region:island.region,
      patches:(layout.patches||[]).map(p=>({value:p,bounds:patchBounds(p)})),routes:(layout.routes||[]).map(p=>({value:p,bounds:routeBounds(p)}))};
    this.layouts.set(layout,prepared);return prepared;
  }
  _tile(prepared,tx,ty){
    const key=`${prepared.id}:${tx}:${ty}`;let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas(),side=TILE+BLEED*2;canvas.width=side;canvas.height=side;const c=canvas.getContext('2d');
    c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);c.lineCap='round';c.lineJoin='round';
    const view={minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED};
    for(const patch of prepared.patches)if(overlaps(patch.bounds,view))this._patch(c,patch.value,prepared,view);
    this._routes(c,prepared.routes.filter(route=>overlaps(route.bounds,view)).map(route=>route.value),prepared,view);
    image={canvas,pixels:side*side};
    while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const old=this.cache.keys().next().value;this.pixels-=this.cache.get(old).pixels;this.cache.delete(old);}
    this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  _patch(c,patch,prepared,view){
    const p=prepared.palette,kind=patch.kind,vegetation=kind==='forest'||kind==='brush',seed=(patch.seed||0)*1009;
    const routes=prepared.routes.filter(route=>overlaps(route.bounds,view)).map(route=>route.value),clearings=prepared.layout.clearings||[];
    c.save();
    // Layered transparent edges merge with the established hand-painted floor.
    for(let i=0;i<6;i++){ellipse(c,patch,1-i*.035);c.globalAlpha=vegetation?.035:.026;c.fillStyle=p.bed;c.fill();}
    c.globalAlpha=1;
    const spacing=kind==='brush'?25:vegetation?34:42;
    for(let gy=Math.floor(view.minY/spacing)-1;gy<=Math.floor(view.maxY/spacing)+1;gy++)for(let gx=Math.floor(view.minX/spacing)-1;gx<=Math.floor(view.maxX/spacing)+1;gx++){
      const n=hash(gx+seed,gy+17),x=(gx+.15+hash(gx+31,gy+seed)*.7)*spacing,y=(gy+.15+hash(gy+71,gx+seed)*.7)*spacing;
      if(!inPatch(patch,x,y,-7))continue;
      if(routes.some(route=>nearRoute(route,x,y))||clearings.some(clearing=>(x-clearing.x)**2+(y-clearing.y)**2<(clearing.r*.88)**2))continue;
      if(vegetation){
        if(n<.19)continue;
        c.globalAlpha=kind==='brush'?.62:.35;
        tuft(c,x,y,kind==='brush'?1.7+n*2.3:1.3+n*1.5,seed+gx*43+gy*71,p.grass,prepared.region==='marsh');
        if(kind==='forest'&&n>.55){c.globalAlpha=.25;c.strokeStyle=p.leaf;c.lineWidth=.7;c.beginPath();c.moveTo(x-8,y+2);c.lineTo(x+4,y-1);c.stroke();}
      }else if(kind==='ruins'||kind==='city'){
        if(n<.48)continue;c.globalAlpha=.22;const s=8+n*7;
        c.beginPath();c.moveTo(x-s,y-s*.4);c.lineTo(x+s*.7,y-s*.55);c.lineTo(x+s,y+s*.4);c.lineTo(x-s*.8,y+s*.5);c.closePath();c.fillStyle=p.edge;c.fill();c.strokeStyle=p.leaf;c.lineWidth=.75;c.stroke();
      }else if(kind==='ice'){
        if(n<.55)continue;c.globalAlpha=.28;c.strokeStyle=p.leaf;c.lineWidth=1;c.beginPath();c.moveTo(x-11,y+4);c.lineTo(x-2,y);c.lineTo(x+4,y+1);c.lineTo(x+12,y-5);c.stroke();
      }else{
        if(n<.42)continue;c.globalAlpha=.35;pebble(c,x,y,3+n*5,n,p);
      }
    }
    c.restore();
  }
  _routes(c,routes,prepared,view){
    const p=prepared.palette;c.save();
    // One fill per layer avoids darker disks where path segments meet. Small
    // edge variations stay comfortably inside the reserved walking corridor.
    for(const kind of ['main','trail'])for(const layer of [0,1,2]){
      c.beginPath();for(const route of routes)if(route.kind===kind)routeContour(c,route,Math.max(18,route.r*(kind==='main'?.98:.70))*(1-layer*.12));
      c.fillStyle=p.path;c.globalAlpha=kind==='main'?[.055,.055,.04][layer]:[.035,.035,.025][layer];c.fill();
    }
    for(const route of routes){
    const main=route.kind==='main',width=Math.max(18,route.r*(main?1.05:.72));
    const dx=route.bx-route.ax,dy=route.by-route.ay,length=Math.hypot(dx,dy),nx=-dy/(length||1),ny=dx/(length||1),steps=Math.ceil(length/38);
    c.globalAlpha=.18;c.lineWidth=.75;c.strokeStyle=p.leaf;
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,x=route.ax+dx*t,y=route.ay+dy*t;if(x<view.minX-40||x>view.maxX+40||y<view.minY-40||y>view.maxY+40)continue;
      const n=hash(i+route.ax,route.by),side=(n-.5)*width*.9,xx=x+nx*side,yy=y+ny*side;
      if(prepared.region==='city'||prepared.region==='ruins'){c.beginPath();c.moveTo(xx-nx*5,yy-ny*5);c.lineTo(xx+nx*7,yy+ny*7);c.stroke();}
      else{c.beginPath();c.ellipse(xx,yy,1.2+n*2,.5+n,0,0,TAU);c.fillStyle=p.leaf;c.fill();}
    }
    }c.restore();
  }
  drawGround(c,island,{camX=0,camY=0,width=1100,height=700}={}){
    if(island?.layout?.kind==='rift-forest')return this.riftArt.drawGround(c,island,{camX,camY,width,height});
    const prepared=island&&this._layout(island);if(!prepared)return false;
    const left=camX-width/2,top=camY-height/2;
    c.save();
    for(let ty=Math.floor(top/TILE);ty<=Math.floor((top+height)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((left+width)/TILE);tx++){
      const image=this._tile(prepared,tx,ty);c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE-left,ty*TILE-top,TILE,TILE);
    }
    c.restore();return true;
  }
  drawTreeFooting(c,prop){
    if(prop?.type!=='tree'||!prop.layoutPatch||prop.r<28)return false;
    const region=prop.region||'forest',variant=(prop.treeForm||0)%3,key=`root:${region}:${variant}`;let image=this.cache.get(key);
    if(image){this.cache.delete(key);this.cache.set(key,image);}else{
      const canvas=this.makeCanvas();canvas.width=168;canvas.height=128;const target=canvas.getContext('2d');target.setTransform(2,0,0,2,84,84);target.lineCap='round';
      const p=PALETTES[region]||PALETTES.forest,snow=region==='snow';
      target.beginPath();target.ellipse(0,3,28,17,0,0,TAU);target.fillStyle=snow?'#809e9b80':p.bed+'cc';target.fill();
      for(let i=0;i<9;i++){
        const a=i*TAU/9,n=hash(i+variant*31,47),x=Math.cos(a)*(18+n*5),y=3+Math.sin(a)*11;
        if(snow){target.beginPath();target.ellipse(x,y,7+n*3,3+n,0,0,TAU);target.fillStyle=i%2?'#c8d9cc':'#e4e8d5';target.fill();}
        else tuft(target,x,y,2.6+n*1.2,i+variant*41,p.grass,region==='marsh');
      }
      image={canvas,pixels:canvas.width*canvas.height};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;
    }
    const scale=prop.r/28;c.save();c.drawImage(image.canvas,prop.x-42*scale,prop.y-42*scale,84*scale,64*scale);c.restore();return true;
  }
}

// Called inside the map's existing exploration clip and world transform.
// It only reads permanent layout data: no terrain generation, active-water
// cache, landmark discovery or simulation state is touched while drawing.
export function drawWorldLayoutMap(c,island,{viewBounds,scale=1,labels=false}={}){
  const layout=island?.layout;if(!layout)return false;const p=PALETTES[island.region]||PALETTES.forest;
  if(layout.kind==='rift-forest')return drawRiftOverview(c,layout,{viewBounds,scale,labels});
  c.save();c.lineCap='round';c.lineJoin='round';
  for(const patch of layout.patches||[]){
    if(viewBounds&&!overlaps(patchBounds(patch),viewBounds))continue;
    ellipse(c,patch);c.fillStyle=patch.kind==='forest'?p.mapForest:patch.kind==='brush'?p.mapBrush:patch.kind==='ice'?'#bed8d3':patch.kind==='ash'?'#474044':patch.kind==='city'?'#666e60':p.edge;c.globalAlpha=patch.kind==='forest'?.84:.5;c.fill();
  }
  c.globalAlpha=.72;
  for(const route of layout.routes||[]){if(viewBounds&&!overlaps(routeBounds(route),viewBounds))continue;path(c,route);c.strokeStyle=p.mapPath;c.lineWidth=Math.max(route.kind==='main'?1.1/scale:.65/scale,route.r*(route.kind==='main'?.9:.6));c.stroke();}
  c.globalAlpha=1;
  for(const obstacle of obstaclesFor(layout)){
    if(viewBounds&&!overlaps(obstacle.bounds,viewBounds))continue;
    obstaclePath(c,obstacle);c.fillStyle=p.bed;c.fill();c.strokeStyle=p.leaf;c.lineWidth=.55/scale;c.stroke();
  }
  for(const lake of layout.lakes||[]){
    const r=Math.max(lake.rx,lake.ry);if(viewBounds&&!overlaps({minX:lake.x-r,minY:lake.y-r,maxX:lake.x+r,maxY:lake.y+r},viewBounds))continue;
    traceWaterPath(c,lake);c.fillStyle=lake.kind==='lava'?'#a55b3d':lake.kind==='ice'?'#9bc3cb':'#426c70';c.fill();c.strokeStyle=lake.kind==='lava'?'#ca8b50':lake.kind==='ice'?'#d8e8df':'#85a39a';c.lineWidth=.75/scale;c.stroke();
  }
  c.restore();return true;
}
