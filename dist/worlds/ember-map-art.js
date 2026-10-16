import { drawEmberProp, drawEmberLandmark, emberVisual, drawEmberCanopy, drawEmberUnderbrush, drawEmberRock } from '../ember-art.js';
import { SceneryArt } from '../scenery-art.js';
import { RiftCollision } from '../rift-collision.js';
import { createEmberScenery, emberSceneryTone } from './ember-scenery.js';
import { traceWaterPath, waterBounds } from '../water-geometry.js';

const TILE=384,BLEED=2,PIXEL_LIMIT=6*1024*1024,TAU=Math.PI*2;
const prepared=new WeakMap();
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function trace(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=xy(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function rings(c,values,begin=true){if(begin)c.beginPath();for(const item of values||[])trace(c,item.points||item,false);}
function polygonBounds(points){return points.reduce((b,p)=>{p=xy(p);return {minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const SOILS=Object.freeze({
  'ash-camp':'#e4c69b',grove:'#c4c18c',quarry:'#c9a789',basin:'#ead0a1',sulfur:'#d8ce91',obsidian:'#aaa499',mine:'#c4ad8c',oasis:'#c2cda0',terracotta:'#d7ad8a',crater:'#bda997',charred:'#c8bea1',basalt:'#b5b1a5',ruins:'#d2c6a7',foundry:'#d9bd97',cavern:'#bdae99',forecourt:'#e2caa2',crystal:'#b9c7b0'
});
function closestArea(layout,x,y){let area=null,best=Infinity;for(const a of layout.areas||[]){const d=(a.center.x-x)**2+(a.center.y-y)**2;if(d<best){best=d;area=a;}}return area;}
function roadSamples(road,fadeStart=false,fadeEnd=false){
  const points=(road.points||road.waypoints||[]).map(xy),smooth=[];let along=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[Math.max(0,i-1)],b=points[i],d=points[i+1],e=points[Math.min(points.length-1,i+2)],steps=Math.max(2,Math.ceil(Math.hypot(d.x-b.x,d.y-b.y)/23));
    for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t,coord=k=>.5*((2*b[k])+(-a[k]+d[k])*t+(2*a[k]-5*b[k]+4*d[k]-e[k])*t2+(-a[k]+3*b[k]-3*d[k]+e[k])*t3),p={x:coord('x'),y:coord('y')};
      if(smooth.length)along+=Math.hypot(p.x-smooth.at(-1).x,p.y-smooth.at(-1).y);smooth.push({...p,along});
    }
  }
  if(points.length){const p=points.at(-1);if(smooth.length)along+=Math.hypot(p.x-smooth.at(-1).x,p.y-smooth.at(-1).y);smooth.push({...p,along});}
  const seed=points.length?hash(points[0].x,points[0].y)*TAU:0;
  return smooth.map((p,i)=>{const a=smooth[Math.max(0,i-1)],b=smooth[Math.min(smooth.length-1,i+1)],length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length,wave=Math.sin(p.along/137+seed)*3+Math.sin(p.along/53+seed*2)*1.5;
    const edge=Math.min(1,fadeStart?p.along/140:1,fadeEnd?(along-p.along)/140:1),fade=edge*edge*(3-2*edge);return {...p,x:p.x+nx*wave,y:p.y+ny*wave,nx,ny,fade,half:(road.width||110)*(.39+Math.sin(p.along/109+seed)*.045+Math.sin(p.along/47+seed*.3)*.021)};
  });
}
function records(layout){let value=prepared.get(layout);if(value)return value;
  const scene=layout.emberScene||{},ground=scene.groundRings||layout.boundaries||[],high=scene.highOpenRings||layout.solidBoundaries||ground;
  const lakes=scene.lavaRings||layout.lakes||[],roads=scene.roads||[];
  const looseEnd=(road,last)=>{const points=road.points||road.waypoints||[],p=xy(last?points.at(-1):points[0]);return p&&!roads.some(other=>other!==road&&(other.points||other.waypoints||[]).some(q=>{q=xy(q);return Math.hypot(q.x-p.x,q.y-p.y)<60;}));};
  const bridges=scene.bridges|| (scene.bridge?[scene.bridge]:(layout.passages||[]).filter(p=>p.kind==='bridge'));
  const zones=(scene.zones||layout.areas||[]).filter(z=>z.points?.length).map(z=>({value:z,bounds:polygonBounds(z.points),color:SOILS[z.paletteKind||z.kind]||SOILS.basin}));
  const details=(scene.details||[]).filter(d=>d.points?.length).map(d=>({value:d,bounds:polygonBounds(d.points)}));
  value={scene,ground,high,layout,collision:new RiftCollision(layout),lakes:lakes.map(p=>({value:p,bounds:polygonBounds(p.points||p)})),surfaces:(scene.surfaces||[]).map(p=>({value:p,bounds:waterBounds(p)})),roads:roads.map(r=>({value:r,bounds:polygonBounds(r.points||r.waypoints||[]),samples:roadSamples(r,looseEnd(r,false),looseEnd(r,true))})),bridges,zones,details,rimBuckets:new Map()};
  for(const ring of high){const points=ring.points||ring;let carry=23;for(let i=0;i<points.length;i++){const a=xy(points[i]),b=xy(points[(i+1)%points.length]),length=Math.hypot(b.x-a.x,b.y-a.y);if(length>0){for(let d=carry;d<length;d+=33){const x=a.x+(b.x-a.x)*d/length,y=a.y+(b.y-a.y)*d/length,key=`${Math.floor(x/TILE)}:${Math.floor(y/TILE)}`;let bucket=value.rimBuckets.get(key);if(!bucket){bucket=[];value.rimBuckets.set(key,bucket);}bucket.push({x,y,tx:(b.x-a.x)/length,ty:(b.y-a.y)/length});}carry=(carry-length)%33;if(carry<0)carry+=33;}}}
  prepared.set(layout,value);return value;
}
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function roadOutline(c,record,pad){
  const pts=record.samples;if(pts.length<2)return;const radius=p=>Math.max(0,p.half+pad)*p.fade,left=pts.map(p=>({x:p.x+p.nx*radius(p),y:p.y+p.ny*radius(p)})),right=pts.map(p=>({x:p.x-p.nx*radius(p),y:p.y-p.ny*radius(p)}));
  const first=pts[0],last=pts.at(-1),outline=[...left],endAngle=Math.atan2(last.ny,last.nx),startAngle=Math.atan2(-first.ny,-first.nx);
  for(let j=1;j<5;j++){const a=endAngle-Math.PI*j/4;outline.push({x:last.x+Math.cos(a)*radius(last),y:last.y+Math.sin(a)*radius(last)});}
  outline.push(...right.reverse());for(let j=1;j<5;j++){const a=startAngle-Math.PI*j/4;outline.push({x:first.x+Math.cos(a)*radius(first),y:first.y+Math.sin(a)*radius(first)});}
  const a=outline.at(-1),b=outline[0];c.moveTo((a.x+b.x)/2,(a.y+b.y)/2);for(let i=0;i<outline.length;i++){const p=outline[i],q=outline[(i+1)%outline.length];c.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2);}c.closePath();
}
function softPolygon(c,points){const pts=points.map(xy);c.beginPath();if(!pts.length)return;const last=pts.at(-1),first=pts[0];c.moveTo((last.x+first.x)/2,(last.y+first.y)/2);for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];c.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}c.closePath();}
function lakePath(c,lake){trace(c,lake.points||lake);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function clipBlocked(c,data,view){c.beginPath();c.rect(view.minX-3,view.minY-3,view.maxX-view.minX+6,view.maxY-view.minY+6);rings(c,data.high,false);c.clip('evenodd');}
function roads(c,data,view,overview){
  const visible=data.roads.filter(({value:r,bounds})=>overlaps(bounds,view,(r.width||110)/2+55));
  // The complete route network is one translucent worn-soil surface. Its
  // uneven contour fades through many fine layers; no edge stroke or parallel
  // outline survives at bends, route ends or crossing corridors.
  c.save();const opacity=c.globalAlpha,layers=overview?5:18;
  for(let i=0;i<layers;i++){c.beginPath();for(const r of visible)roadOutline(c,r,25-i*42/(layers-1));c.fillStyle='#eed8b3';c.globalAlpha=opacity*(overview?.17:.055);c.fill();}c.restore();
  if(overview)return;
  for(const {samples}of visible)for(const p of samples){
    if(p.x<view.minX-100||p.x>view.maxX+100||p.y<view.minY-100||p.y>view.maxY+100)continue;
    const n=hash(p.x+27,p.y-13),side=n>.5?1:-1,offset=p.half+hash(p.x-41,p.y)*27-6,x=p.x+p.nx*offset*side,y=p.y+p.ny*offset*side;
    if(n<.18){c.beginPath();c.ellipse(x,y,1.8+n*7,1+n*3,.3,0,TAU);c.fillStyle='#9d917351';c.fill();line(c,[[x-1.5,y-.5],[x+2,y-.8]],'#f4ddb270',.8);}
    else if(n>.71){
      for(let j=0;j<3;j++){const xx=x+(j-1)*4,yy=y+(j%2)*2;line(c,[[xx,yy],[xx-2+(j-1),yy-3-n*3]],j%2?'#a79e7165':'#b6ad796a',.9);}
    }
  }
}
function ground(c,layout,data,view,overview){
  c.fillStyle='#565b43';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  rings(c,data.ground);c.fillStyle='#e1c7a2';c.fill('evenodd');
  c.save();rings(c,data.ground);c.clip('evenodd');
  // Region colors are broad translucent soil washes. Their world-space
  // gradients never reveal polygon partitions or cached tile rectangles.
  for(const {value:z,bounds,color}of data.zones){
    const rx=(bounds.maxX-bounds.minX)*.58,ry=(bounds.maxY-bounds.minY)*.58,cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2;
    if(!overlaps({minX:cx-rx,minY:cy-ry,maxX:cx+rx,maxY:cy+ry},view))continue;
    c.save();c.translate(cx,cy);c.scale(rx,ry);const wash=c.createRadialGradient(0,0,.12,0,0,1);wash.addColorStop(0,color+'a8');wash.addColorStop(.55,color+'77');wash.addColorStop(1,color+'00');c.fillStyle=wash;c.fillRect(-1,-1,2,2);c.restore();
  }
  const step=245;
  for(let gy=Math.floor((view.minY-210)/step);gy<=Math.ceil((view.maxY+210)/step);gy++)for(let gx=Math.floor((view.minX-210)/step);gx<=Math.ceil((view.maxX+210)/step);gx++){
    const n=hash(gx+27,gy-11),x=gx*step+hash(gx-7,gy)*80,y=gy*step+hash(gy+42,gx)*90,radius=155+n*52,g=c.createRadialGradient(x,y,8,x,y,radius);
    g.addColorStop(0,n>.5?'#f6e0b223':'#aa916b16');g.addColorStop(1,n>.5?'#f6e0b200':'#aa916b00');c.fillStyle=g;c.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  roads(c,data,view,overview);
  if(!overview){
    const spacing=36;
    for(let gy=Math.floor(view.minY/spacing)-1;gy<=Math.ceil(view.maxY/spacing)+1;gy++)for(let gx=Math.floor(view.minX/spacing)-1;gx<=Math.ceil(view.maxX/spacing)+1;gx++){
      const n=hash(gx+71,gy+19);if(n<.26)continue;const x=(gx+.15+hash(gx+13,gy)*.7)*spacing,y=(gy+.15+hash(gy+7,gx)*.7)*spacing;
      c.beginPath();c.ellipse(x,y,.7+n*2,.4+n*.4,-.3,0,TAU);c.fillStyle=n>.72?'#fff0cd80':'#9d835548';c.fill();
      if(n>.84)line(c,[[x-3,y+3],[x+3,y+2]],'#f7e6bf70',.75);
      if(n>.66&&n<.84){line(c,[[x-3,y],[x-4,y-4]],'#9d9e6970',.9);line(c,[[x,y],[x+2,y-5]],'#a8b07b90',1);}
      if(n>.94){trace(c,[[x-3,y+2],[x+1,y-1],[x+4,y+1],[x+1,y+3]]);c.fillStyle='#ae937255';c.fill();}
    }
  }
  c.restore();
}
function cliffs(c,data,view,overview,scenery){
  c.save();clipBlocked(c,data,view);
  c.fillStyle='#575b45';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  for(const area of data.layout.areas||[]){
    const b=polygonBounds(area.points),radius=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.72;if(!overlaps({minX:area.center.x-radius,minY:area.center.y-radius,maxX:area.center.x+radius,maxY:area.center.y+radius},view))continue;
    const g=c.createRadialGradient(area.center.x,area.center.y,30,area.center.x,area.center.y,radius),color=area.material==='forest'?'#596240':'#635c53';g.addColorStop(0,color);g.addColorStop(.55,color+'e0');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(area.center.x-radius,area.center.y-radius,radius*2,radius*2);
  }
  c.restore();
  if(overview){c.save();clipBlocked(c,data,view);rings(c,data.high);c.strokeStyle='#898b5d';c.lineWidth=15;c.stroke();c.restore();return;}
  // Continuous deep masses reuse the same full painted silhouettes as the
  // depth-sorted rim. There is no giant flat cliff plate or nested edge band.
  const mask=data.collision.high;
  for(let gy=Math.floor((view.minY-145)/64);gy<=Math.floor((view.maxY+145)/64);gy++)for(let gx=Math.floor((view.minX-140)/75);gx<=Math.floor((view.maxX+140)/75);gx++){
    const n=hash(gx+13,gy+11),m=hash(gy-33,gx+4),x=(gx+.15+n*.7)*75,y=(gy+.1+m*.8)*64;
    if(mask.inside(x,y)||(mask.nearest(x,y,95)?.distance??Infinity)<52)continue;
    const area=closestArea(data.layout,x,y),seed=gx*37+gy*59,forest=area?.material==='forest',tone=area?emberSceneryTone(area,n):'amber';
    if(!forest&&n<.84){drawEmberRock(c,{x,y:y+15,width:82+n*42,depth:44+n*17,height:54+m*43,seed,tone},scenery);if(n>.66)drawEmberUnderbrush(c,{x:x-27,y:y+31,width:45+n*17,height:25,seed,tone:'charred'},scenery);}
    else drawEmberCanopy(c,{x,y,width:128+n*30,height:91+m*22,seed,tone},scenery);
  }
  // Fine rooted cover conceals the soil/mask seam, while complete raised
  // trees and boulders at this edge remain in the world's depth queue.
  for(let by=Math.floor((view.minY-65)/TILE);by<=Math.floor((view.maxY+65)/TILE);by++)for(let bx=Math.floor((view.minX-65)/TILE);bx<=Math.floor((view.maxX+65)/TILE);bx++)for(const p of data.rimBuckets.get(`${bx}:${by}`)||[]){
    const n=hash(p.x+13,p.y-27),nx=-p.ty,ny=p.tx,side=mask.inside(p.x+nx*3,p.y+ny*3)?-1:1,x=p.x+nx*side*(9+n*8),y=p.y+ny*side*(9+n*8);
    if(mask.inside(x,y))continue;const area=closestArea(data.layout,x,y),tone=area?emberSceneryTone(area,n):'basalt';
    if(area?.material!=='forest'&&n<.65)drawEmberRock(c,{x,y,width:15+n*18,depth:9+n*10,height:8+n*12,seed:p.x*.13+p.y*.37,tone},scenery);
    else drawEmberUnderbrush(c,{x,y,width:32+n*23,height:15+n*9,seed:p.x*.13+p.y*.37,tone},scenery);
  }
}
function sceneDetails(c,data,view,overview){
  c.save();rings(c,data.ground);c.clip('evenodd');
  for(const {value:p,bounds}of data.details){if(!overlaps(bounds,view,(p.width||40)+20))continue;const pts=p.points||[],width=p.width||36;
    if(p.kind==='rail'){
      if(pts.length<2)continue;const half=width/2;
      for(let i=1;i<pts.length;i++){const a=xy(pts[i-1]),b=xy(pts[i]),len=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x);if(!len)continue;
        c.save();c.translate(a.x,a.y);c.rotate(angle);for(let d=8;d<len;d+=25){c.fillStyle='#927b66';c.fillRect(d-3,-half-5,6,width+10);if(!overview)line(c,[[d-1,-half-3],[d-1,half+3]],'#c5a57a',1.2);}
        for(const side of[-1,1]){line(c,[[0,side*(half-4)],[len,side*(half-4)]],'#696570',overview?3:3.5);if(!overview)line(c,[[0,side*(half-4)-.6],[len,side*(half-4)-.6]],'#b5aea5',1.1);}c.restore();
      }
    }else if(p.kind==='steps'){
      for(let i=1;i<pts.length;i++){const a=xy(pts[i-1]),b=xy(pts[i]),len=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x);c.save();c.translate(a.x,a.y);c.rotate(angle);rounded(c,0,-width/2,len,width,4,'#b8aa98');for(let d=8;d<len;d+=Math.max(28,width*.7))line(c,[[d,-width/2+3],[d,width/2-3]],'#e0c9a9',2);c.restore();}
    }else if(p.kind==='spring'){
      softPolygon(c,pts);c.fillStyle='#abb59b';c.fill();c.strokeStyle='#d2caa0';c.lineWidth=12;c.stroke();softPolygon(c,pts);c.fillStyle='#8eb8ad';c.fill();c.strokeStyle='#dcdfb8';c.lineWidth=3;c.stroke();
      const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2;
      for(let i=0;i<3;i++){const y=cy+(i-1)*18;line(c,[[cx-22-i*3,y],[cx+14+i*4,y-2]],'#d2e6c4',2.2);}
    }else if(p.kind==='workyard'||p.kind==='altar'){
      if(p.kind==='altar'){trace(c,pts);c.fillStyle='#b5ad8e';c.fill();c.strokeStyle='#7e7d67';c.lineWidth=3;c.stroke();}else{const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2,radius=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)*.6,g=c.createRadialGradient(cx,cy,10,cx,cy,radius);g.addColorStop(0,'#a78d6235');g.addColorStop(1,'#a78d6200');c.fillStyle=g;c.fillRect(cx-radius,cy-radius,radius*2,radius*2);}
      c.save();trace(c,pts);c.clip();const step=p.kind==='altar'?58:72;
      for(let gy=Math.floor(bounds.minY/step);gy<=Math.ceil(bounds.maxY/step);gy++)for(let gx=Math.floor(bounds.minX/step);gx<=Math.ceil(bounds.maxX/step);gx++){
        const n=hash(gx+12,gy+32);if(p.kind==='workyard'&&n<.7)continue;const x=gx*step+(gy%2?step/2:0),y=gy*step;
        line(c,[[x+5,y+4],[x+(p.kind==='altar'?step-4:step*.45),y+4]],p.kind==='altar'?'#d1c1ab':'#e2c29b66',1.7);
        if(p.kind==='altar')line(c,[[x+step-4,y+4],[x+step-4,y+step-5]],'#817986',1.5);
      }c.restore();
    }
  }c.restore();
}
function rounded(c,x,y,w,h,r,color){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();}
function bridgeShoreGap(point,bridges){
  return bridges.some(bridge=>{const deck=bridge.deck||bridge.waypoints||[],a=deck[0],b=deck.at(-1);if(!a||!b)return false;const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,along=((point.x-a.x)*dx+(point.y-a.y)*dy)/length,across=Math.abs((point.x-a.x)*dy-(point.y-a.y)*dx)/length;return along>=-14&&along<=length+14&&across<=(bridge.width||160)/2+15;});
}
function lavaShorePath(c,lake,bridges){
  c.beginPath();for(const ring of [lake.points||lake,...(lake.holes||[]).map(h=>h.points||h)]){
    let linked=false;for(let i=0;i<ring.length;i++){const a=xy(ring[i]),b=xy(ring[(i+1)%ring.length]),steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/20));
      for(let j=0;j<steps;j++){const p={x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps},q={x:a.x+(b.x-a.x)*(j+1)/steps,y:a.y+(b.y-a.y)*(j+1)/steps};
        // A bridge is an opening across the lava, not a second rectangular
        // shoreline. Omit its cutout rim while retaining the natural banks.
        if(bridgeShoreGap({x:(p.x+q.x)/2,y:(p.y+q.y)/2},bridges)){linked=false;continue;}
        if(!linked)c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);linked=true;
      }
    }
  }
}
function lava(c,data,view,overview){
  for(const {value:lake,bounds}of data.lakes){if(!overlaps(bounds,view,20))continue;
    c.save();lakePath(c,lake);c.fillStyle='#db8355';c.fill('evenodd');lakePath(c,lake);c.clip('evenodd');
    const g=c.createLinearGradient(bounds.minX,bounds.minY,bounds.maxX,bounds.maxY);g.addColorStop(0,'#d8784e');g.addColorStop(.45,'#ec9a5d');g.addColorStop(1,'#c76d4d');c.fillStyle=g;c.fillRect(bounds.minX,bounds.minY,bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
    if(!overview){
      // Broken floating crust and sparse molten curls replace uniform stripes.
      // All marks are cold-tile world-space samples and remain on the low lava
      // mask, including around bridge approaches and shore indentations.
      const step=102;
      for(let gy=Math.floor((view.minY-100)/step);gy<=Math.ceil((view.maxY+100)/step);gy++)for(let gx=Math.floor((view.minX-100)/step);gx<=Math.ceil((view.maxX+100)/step);gx++){
        const n=hash(gx+61,gy+19),m=hash(gy+23,gx-7),x=(gx+.12+n*.76)*step,y=(gy+.13+m*.73)*step;
        if(n<.25){
          const rx=29+m*47,ry=11+n*71,pts=[];for(let j=0;j<12;j++){const a=j*TAU/12,rr=.48+hash(gx+j,gy+41)*.52;pts.push([x+Math.cos(a)*rx*rr,y+Math.sin(a)*ry*rr]);}
          trace(c,pts);c.fillStyle=n<.11?'#78594a':'#9c664d';c.fill();
          line(c,[pts[2],pts[3],pts[4]],'#eaa56860',1);line(c,[[x-rx*.4,y-ry*.3],[x+rx*.2,y-ry*.6],[x+rx*.55,y-ry*.25]],'#bb82574d',1.2);
          for(let k=0;k<6;k++){const xx=x+(hash(gx+k,gy+71)-.5)*rx*.7,yy=y+(hash(gy+k,gx+13)-.5)*ry*.7;line(c,[[xx,yy],[xx+3,yy-1]],k%2?'#513e3540':'#cf9b6840',.8);}
        }else if(n>.66){
          const length=28+m*71,bend=(hash(gx+27,gy+91)-.5)*31,angle=Math.PI/2+(hash(gx-41,gy+17)-.5)*1.1;
          c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(-length*.5,0);c.bezierCurveTo(-length*.28,-bend*.8,length*.12,bend,length*.5,bend*.3);c.strokeStyle=n>.88?'#ffd18a70':'#f5b36d50';c.lineWidth=1.1+m*1.4;c.stroke();
          if(n>.92){c.beginPath();c.moveTo(-length*.22,7);c.quadraticCurveTo(length*.04,bend*.36+9,length*.23,6);c.strokeStyle='#ffce864a';c.lineWidth=.8;c.stroke();}c.restore();
          if(n>.94){c.beginPath();c.ellipse(x+10,y+20,1.2+m*1.5,1,0,0,TAU);c.fillStyle='#ffe1a86a';c.fill();}
        }
      }
    }
    lavaShorePath(c,lake,data.bridges);c.strokeStyle='#805b4b';c.lineWidth=overview?12:17;c.stroke();c.strokeStyle='#b56d4d';c.lineWidth=overview?6:8;c.stroke();c.strokeStyle='#efaa69';c.lineWidth=2;c.stroke();c.restore();
  }
}
function shallowSurfaces(c,data,view,overview){
  for(const {value:p,bounds}of data.surfaces){if(!overlaps(bounds,view,10))continue;
    c.save();rings(c,data.ground);c.clip('evenodd');traceWaterPath(c,p);c.fillStyle=p.kind==='lava'?'#e99960':'#a4b49b';c.fill('evenodd');traceWaterPath(c,p);c.clip('evenodd');
    c.strokeStyle=p.kind==='lava'?'#be8969':'#c9ceaa';c.lineWidth=12;c.stroke();
    if(p.kind==='lava'){
      for(let yy=Math.floor(bounds.minY/48)*48;yy<bounds.maxY;yy+=48){const x=p.x+Math.sin(yy/71+(p.seed||0))*p.rx*.38;line(c,[[x-24,yy],[x+7,yy-6],[x+35,yy-2]],'#ffcf86',overview?6:9);}
    }
    c.restore();
  }
}
function bridgePoints(p){if(p.points?.length)return p.points;const [a,b]=p.deck||[];if(!a||!b)return [];const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length*(p.width||160)/2,ny=(b.x-a.x)/length*(p.width||160)/2;return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];}
function bridge(c,p,view,overview){
  const points=bridgePoints(p);if(!points.length||!overlaps(polygonBounds(points),view,24))return;
  const [a,b]=p.deck||p.waypoints||[],length=Math.hypot(b.x-a.x,b.y-a.y),width=p.width||160,angle=Math.atan2(b.y-a.y,b.x-a.x);
  if(!overview){
    // Shallow load-bearing stonework hangs below the near edge. The complete
    // traversable deck above retains its exact authored width and endpoints.
    const side=Math.cos(angle)>=0?1:-1,nx=-Math.sin(angle)*side,ny=Math.cos(angle)*side,fa={x:a.x+nx*width/2,y:a.y+ny*width/2},fb={x:b.x+nx*width/2,y:b.y+ny*width/2},depth=10;
    line(c,[[fa.x+3,fa.y+depth+4],[fb.x-3,fb.y+depth+4]],'#3f3a3035',8);
    trace(c,[fa,fb,{x:fb.x,y:fb.y+depth},{x:fa.x,y:fa.y+depth}]);c.fillStyle='#777963';c.fill();line(c,[[fa.x,fa.y+depth],[fb.x,fb.y+depth]],'#484d3f',1.4);
    for(let d=0;d<length;d+=43){const stop=Math.min(length,d+43),t=d/length,u=stop/length,xx=fa.x+(fb.x-fa.x)*t,yy=fa.y+(fb.y-fa.y)*t,x2=fa.x+(fb.x-fa.x)*u,y2=fa.y+(fb.y-fa.y)*u;
      trace(c,[[xx+.6,yy+1],[x2-.6,y2+1],[x2-.6,y2+depth-1],[xx+.6,yy+depth-1]]);c.fillStyle=hash(d,p.width)>.5?'#85856b':'#777b63';c.fill();line(c,[[xx+1,yy+2],[x2-1,y2+2]],'#b9b18b80',.8);line(c,[[xx,yy+1],[xx,yy+depth]],'#515b474f',.8);
    }
  }
  c.save();trace(c,points);c.fillStyle='#777b67';c.fill();c.clip();c.translate(a.x,a.y);c.rotate(angle);
  const tones=['#b2ae91','#c1b797','#ada98e','#bab496','#c7bc9a','#b9b194'];
  for(let row=-Math.ceil(width/60);row<=Math.ceil(width/60);row++)for(let x=-44+(Math.abs(row)%2)*22;x<length+44;x+=44){
    const n=hash(x+17,row+13),m=hash(x+43,row-31),y=row*30,cut=2+n*2,stone=[[x+cut,y+1],[x+40,y+1.5+m],[x+43,y+cut+2],[x+42,y+27],[x+38,y+29],[x+3,y+28],[x+.8,y+23],[x+1,y+cut+2]];
    trace(c,stone);c.fillStyle=tones[Math.floor(n*tones.length)];c.fill();line(c,[[x+cut+1,y+2.2],[x+39,y+2.7+m]],'#e3d7b087',1.1);line(c,[[x+3,y+27],[x+38,y+28]],'#68745e60',1);
    if(!overview){
      for(let k=0;k<5;k++){const px=x+5+hash(x+k,row+71)*32,py=y+5+hash(x+k,row+23)*18;line(c,[[px,py],[px+1+hash(k+x,row)*2,py-.4]],k%2?'#f1dfb638':'#5c684332',.7);}
      if(n>.81)line(c,[[x+31,y+2],[x+26,y+6],[x+28,y+10]],'#69765b60',.8);
    }
  }
  c.restore();
  c.save();c.translate(a.x,a.y);c.rotate(angle);
  for(const side of[-1,1])for(let x=0;x<length;x+=43){const end=Math.min(length,x+43),yy=side*width/2,outer=yy+side*4,n=hash(x,p.width+side);
    trace(c,[[x+.5,yy],[end-.5,yy],[end-.5,outer],[x+.5,outer]]);c.fillStyle=n>.5?'#b5af8c':'#a5a384';c.fill();line(c,[[x+1,outer],[end-1,outer]],side<0?'#d9cda578':'#4c584555',.8);
  }
  c.restore();
}

export class EmberMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.scenery=new SceneryArt(makeCanvas);this.cache=new Map();this.pixels=0;this.builds=0;this.ids=new WeakMap();this.nextId=0;}
  get cacheStats(){const sprites=this.scenery.cacheStats;return {entries:this.cache.size+sprites.entries,pixels:this.pixels+sprites.pixels,bytes:this.pixels*4+sprites.bytes,limitBytes:PIXEL_LIMIT*4+sprites.limitBytes,builds:this.builds+sprites.builds};}
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,false);sceneDetails(c,data,view,false);lava(c,data,view,false);shallowSurfaces(c,data,view,false);cliffs(c,data,view,false,this.scenery);for(const p of data.bridges)bridge(c,p,view,false);c.restore();return true;}
  _tile(layout,tx,ty){let id=this.ids.get(layout);if(!id){id=++this.nextId;this.ids.set(layout,id);}const key=`${id}:${tx}:${ty}`;let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas(),side=TILE+BLEED*2;canvas.width=canvas.height=side;const c=canvas.getContext('2d');c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);this.paintTile(c,layout,{minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED});image={canvas,pixels:side*side};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  drawGround(c,island,{camX=0,camY=0,width=1100,height=700}={}){const layout=island?.layout;if(layout?.artTheme!=='ember')return false;const left=camX-width/2,top=camY-height/2;c.save();for(let ty=Math.floor(top/TILE);ty<=Math.floor((top+height)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((left+width)/TILE);tx++){const image=this._tile(layout,tx,ty);c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE-left,ty*TILE-top,TILE,TILE);}c.restore();return true;}
}

function overviewLabels(c,layout,{scale=1,labels=false,landmarks=false}={}){
  if(labels){c.textAlign='center';c.textBaseline='middle';c.font=`600 ${11/scale}px system-ui,sans-serif`;c.strokeStyle='#f4e0bb';c.fillStyle='#4e4857';c.lineWidth=3/scale;for(const area of layout.areas||[]){const p=area.label||area.center;if(!p)continue;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  if(landmarks)for(const [name,site]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(site.x)||!Number.isFinite(site.y)||!/^cave|^treasure|^boss/.test(name))continue;c.beginPath();c.arc(site.x,site.y,5/scale,0,TAU);c.fillStyle=/^boss/.test(name)?'#b4645b':/^cave/.test(name)?'#645c79':'#dfb768';c.fill();c.strokeStyle='#f5deb7';c.lineWidth=1/scale;c.stroke();}
}
export function drawEmberOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='ember')return false;const data=records(layout),view=viewBounds||layout.bounds;
  c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,true);sceneDetails(c,data,view,true);lava(c,data,view,true);shallowSurfaces(c,data,view,true);cliffs(c,data,view,true);for(const p of data.bridges)bridge(c,p,view,true);
  overviewLabels(c,layout,{scale,labels,landmarks});
  c.restore();return true;
}

// A single-frame atlas export uses the same floor and scenery routines as the
// game. Keep it separate from the inexpensive, frequently drawn minimap.
export function drawEmberFullOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='ember')return false;const data=records(layout),view=viewBounds||layout.bounds;
  c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,false);sceneDetails(c,data,view,false);lava(c,data,view,false);shallowSurfaces(c,data,view,false);cliffs(c,data,view,false,new SceneryArt());for(const p of data.bridges)bridge(c,p,view,false);
  const props=createEmberScenery(layout).filter(p=>p.visual!==false&&overlaps({minX:p.x-(emberVisual(p)?.halfWidth||0),maxX:p.x+(emberVisual(p)?.halfWidth||0),minY:p.y-(emberVisual(p)?.top||0),maxY:p.y+(emberVisual(p)?.bottom||0)},view));
  const sites=(layout.interactions?.caves||[]).map(p=>({...p,artTheme:'ember',kind:'cave'}));
  for(const item of [...props,...sites].sort((a,b)=>a.y-b.y)){
    if(item.variant==='ember-native'){
      const visual=emberVisual(item);if(item.emberKind!=='arch-lintel'){c.save();c.globalAlpha=.15;c.fillStyle='#514657';c.beginPath();c.ellipse(item.x+5,item.y+visual.shadowOffset,Math.max(5,visual.shadowWidth),Math.max(4,visual.shadowLength*.45),.2,0,TAU);c.fill();c.restore();}
      drawEmberProp(c,item);
    }else drawEmberLandmark(c,item);
  }
  overviewLabels(c,layout,{scale,labels,landmarks});c.restore();return true;
}
