import { EMBER_PALETTE, drawEmberProp, drawEmberLandmark, emberVisual } from '../ember-art.js';
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
  'ash-camp':['#d7b38d','#c4a38b'],grove:['#c9bb92','#afba89'],quarry:['#c69a7d','#ab8374'],basin:['#ddba91','#c3ac8b'],sulfur:['#dbca83','#bfb98a'],obsidian:['#b0a2a0','#958c9a'],mine:['#d3ad83','#ad947f'],oasis:['#c9c79b','#a5b58b'],terracotta:['#d3a083','#ba8c77'],crater:['#c1a18a','#998b85'],charred:['#c1b39a','#a69d8f'],basalt:['#b6a7a1','#99929d'],ruins:['#c5b49b','#a49e91'],foundry:['#ceb397','#ac9585'],cavern:['#c0aa96','#a39b95'],forecourt:['#d3b591','#b6aa8c'],crystal:['#bdc7b7','#9fb5ad']
});
function records(layout){let value=prepared.get(layout);if(value)return value;
  const scene=layout.emberScene||{},ground=scene.groundRings||layout.boundaries||[],high=scene.highOpenRings||layout.solidBoundaries||ground;
  const lakes=scene.lavaRings||layout.lakes||[],roads=scene.roads||[];
  const bridges=scene.bridges|| (scene.bridge?[scene.bridge]:(layout.passages||[]).filter(p=>p.kind==='bridge'));
  const zones=(scene.zones||layout.areas||[]).filter(z=>z.points?.length).map(z=>({value:z,bounds:polygonBounds(z.points),colors:SOILS[z.paletteKind||z.kind]||SOILS.basin}));
  const details=(scene.details||[]).filter(d=>d.points?.length).map(d=>({value:d,bounds:polygonBounds(d.points)}));
  value={scene,ground,high,lakes:lakes.map(p=>({value:p,bounds:polygonBounds(p.points||p)})),surfaces:(scene.surfaces||[]).map(p=>({value:p,bounds:waterBounds(p)})),roads:roads.map(r=>({value:r,bounds:polygonBounds(r.points||r.waypoints||[])})),bridges,zones,details,rimBuckets:new Map()};
  for(const ring of high){const points=ring.points||ring;let carry=23;for(let i=0;i<points.length;i++){const a=xy(points[i]),b=xy(points[(i+1)%points.length]),length=Math.hypot(b.x-a.x,b.y-a.y);if(length>0){for(let d=carry;d<length;d+=71){const x=a.x+(b.x-a.x)*d/length,y=a.y+(b.y-a.y)*d/length,key=`${Math.floor(x/TILE)}:${Math.floor(y/TILE)}`;let bucket=value.rimBuckets.get(key);if(!bucket){bucket=[];value.rimBuckets.set(key,bucket);}bucket.push({x,y,tx:(b.x-a.x)/length,ty:(b.y-a.y)/length});}carry=(carry-length)%71;if(carry<0)carry+=71;}}}
  prepared.set(layout,value);return value;
}
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function pathRoad(c,road){c.beginPath();for(const [i,p]of(road.points||road.waypoints||[]).entries()){const q=xy(p);c[i?'lineTo':'moveTo'](q.x,q.y);}}
function softPolygon(c,points){const pts=points.map(xy);c.beginPath();if(!pts.length)return;const last=pts.at(-1),first=pts[0];c.moveTo((last.x+first.x)/2,(last.y+first.y)/2);for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];c.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}c.closePath();}
function lakePath(c,lake){trace(c,lake.points||lake);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function clipBlocked(c,data,view){c.beginPath();c.rect(view.minX-3,view.minY-3,view.maxX-view.minX+6,view.maxY-view.minY+6);rings(c,data.high,false);c.clip('evenodd');}
function ground(c,layout,data,view,overview){
  const P=EMBER_PALETTE;
  c.fillStyle=P.rock;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  rings(c,data.ground);c.fillStyle=P.earth;c.fill('evenodd');
  c.save();rings(c,data.ground);c.clip('evenodd');
  for(const {value:z,bounds,colors}of data.zones){if(!overlaps(bounds,view))continue;
    c.save();const baseAlpha=c.globalAlpha;trace(c,z.points);c.clip();c.fillStyle=colors[0];c.fillRect(Math.max(view.minX,bounds.minX),Math.max(view.minY,bounds.minY),Math.min(view.maxX,bounds.maxX)-Math.max(view.minX,bounds.minX),Math.min(view.maxY,bounds.maxY)-Math.max(view.minY,bounds.minY));
    // Fade only the natural soil tint back to the common earth at each zone
    // edge. Every band follows the full world-space ring, so adjacent cached
    // tiles render the same transition without blur buffers or tile seams.
    const fade=[.03,.04,.06,.09,.14,.2,.3,.45,.6,1];
    for(let i=0;i<fade.length;i++){trace(c,z.points);c.globalAlpha=baseAlpha*fade[i];c.strokeStyle=P.earth;c.lineWidth=320-i*32;c.stroke();}
    c.restore();
  }
  // Large translucent color shapes provide soil variation without a field of
  // noisy repeated texture. They are generated only on cold cached tiles.
  const step=210;
  for(let gy=Math.floor((view.minY-120)/step);gy<=Math.ceil((view.maxY+120)/step);gy++)for(let gx=Math.floor((view.minX-120)/step);gx<=Math.ceil((view.maxX+120)/step);gx++){
    const n=hash(gx+27,gy-11),x=gx*step+hash(gx-7,gy)*80,y=gy*step+hash(gy+42,gx)*90;
    const radius=145+n*55,g=c.createRadialGradient(x,y,10,x,y,radius);g.addColorStop(0,n>.5?'#f1c99c35':'#ad8c8027');g.addColorStop(1,n>.5?'#f1c99c00':'#ad8c8000');c.fillStyle=g;c.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  for(const {value:road,bounds}of data.roads){if(!overlaps(bounds,view,(road.width||110)/2+20))continue;const color=road.material==='ash'?'#c9c0aa':road.material==='stone'?'#c5b9a6':road.material==='ochre'?'#dfb68c':'#efd0a4';pathRoad(c,road);c.strokeStyle='#a88c7438';c.lineWidth=(road.width||110)+14;c.stroke();pathRoad(c,road);c.strokeStyle=color;c.lineWidth=road.width||110;c.stroke();pathRoad(c,road);c.strokeStyle='#f1d6aa35';c.lineWidth=(road.width||110)*.62;c.stroke();}
  if(!overview){
    const spacing=45;
    for(let gy=Math.floor(view.minY/spacing)-1;gy<=Math.ceil(view.maxY/spacing)+1;gy++)for(let gx=Math.floor(view.minX/spacing)-1;gx<=Math.ceil(view.maxX/spacing)+1;gx++){
      const n=hash(gx+71,gy+19);if(n<.61)continue;const x=(gx+.15+hash(gx+13,gy)*.7)*spacing,y=(gy+.15+hash(gy+7,gx)*.7)*spacing;
      c.beginPath();c.ellipse(x,y,1.4+n*2,.6+n*.4,-.3,0,TAU);c.fillStyle=n>.84?'#f9dfb878':'#a7786c3e';c.fill();
      if(n>.9)line(c,[{x:x-2,y:y+3},{x:x+4,y:y+2}],'#f8d8ac60',.8);
      if(n>.76&&n<.89){line(c,[[x-4,y],[x-5,y-4]],'#96856565',1);line(c,[[x-1,y],[x+1,y-5]],'#a5a27685',1);}
      if(n>.94){trace(c,[[x-5,y+3],[x+1,y-1],[x+5,y+1],[x+1,y+5]]);c.fillStyle='#b98d7155';c.fill();}
    }
  }
  c.restore();
}
function cliffs(c,data,view,overview){
  c.save();clipBlocked(c,data,view);
  // The entire blocked landform is visible. Bands are clipped to its exact
  // solid side, so there is neither exposed soil behind an air wall nor a
  // decorative rock stamp changing the real route width.
  c.fillStyle='#7c7889';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  if(overview){rings(c,data.high);c.strokeStyle='#a49aa7';c.lineWidth=74;c.stroke();rings(c,data.high);c.strokeStyle='#60596e';c.lineWidth=25;c.stroke();c.restore();return;}
  const step=287;
  for(let gy=Math.floor(view.minY/step)-1;gy<=Math.ceil(view.maxY/step)+1;gy++)for(let gx=Math.floor(view.minX/step)-1;gx<=Math.ceil(view.maxX/step)+1;gx++){
    const n=hash(gx+17,gy-23);if(n<.31)continue;const x=gx*step+hash(gx+3,gy)*210,y=gy*step+hash(gy+3,gx)*211,s=.8+n*.6;
    // Large uneven layers interrupt the stone mass. They are intentionally
    // sparse and overlap; a regular grid of rock stamps reads like floor tiles.
    c.beginPath();c.moveTo(x-75*s,y+25);c.bezierCurveTo(x-23*s,y-27*s,x+53*s,y-43*s,x+153*s,y-20);c.lineTo(x+215*s,y+39*s);c.bezierCurveTo(x+119*s,y+75*s,x+45*s,y+64*s,x-75*s,y+90*s);c.closePath();c.fillStyle=n>.55?'#938a9839':'#625d742b';c.fill();
    line(c,[[x-41,y+24],[x+15,y+3],[x+94,y-1]],'#b3a8b43e',2);
    if(n>.5)line(c,[[x+57,y+21],[x+39,y+42],[x+43,y+70]],'#5e586b4f',1.8);
  }
  rings(c,data.high);c.strokeStyle='#a79ca6';c.lineWidth=139;c.stroke();
  rings(c,data.high);c.strokeStyle='#898192';c.lineWidth=112;c.stroke();
  rings(c,data.high);c.strokeStyle='#736b81';c.lineWidth=47;c.stroke();
  // Wider facets establish individual basalt columns on one continuous mass;
  // these lines are surface marks and never individual collision pieces.
  for(let by=Math.floor((view.minY-100)/TILE);by<=Math.floor((view.maxY+100)/TILE);by++)for(let bx=Math.floor((view.minX-100)/TILE);bx<=Math.floor((view.maxX+100)/TILE);bx++)for(const {x,y,tx,ty}of data.rimBuckets.get(`${bx}:${by}`)||[]){
    if(x<view.minX-34||x>view.maxX+34||y<view.minY-30||y>view.maxY+100)continue;const n=hash(x+8,y-9),width=19+n*14;
    line(c,[[x-width*.6,y-56-n*18],[x-width*.5+5,y-28],[x-width*.5+2,y+8]],'#69617560',width);
    line(c,[[x-3,y-54-n*18],[x+2,y-26],[x-1,y+17]],'#554f6590',1.8);
    line(c,[[x+5,y-53-n*18],[x+7,y-27]],'#b6a9b1b0',1.5);
    if(n>.6)line(c,[[x-14,y-32],[x-3,y-36],[x+10,y-33]],'#5c556a90',1.4);
  }
  rings(c,data.high);c.strokeStyle='#514d60';c.lineWidth=3;c.stroke();c.restore();
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
      trace(c,pts);c.fillStyle=p.kind==='altar'?'#b2a49a':'#a5846528';c.fill();if(p.kind==='altar'){c.strokeStyle='#807987';c.lineWidth=5;c.stroke();}
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
function lava(c,data,view,overview){
  for(const {value:lake,bounds}of data.lakes){if(!overlaps(bounds,view,20))continue;
    c.save();lakePath(c,lake);c.fillStyle='#eb8558';c.fill('evenodd');lakePath(c,lake);c.clip('evenodd');
    c.strokeStyle='#a4565066';c.lineWidth=overview?15:24;c.stroke();c.strokeStyle='#ffbd6b';c.lineWidth=overview?7:7;c.stroke();
    if(!overview){
      const step=128;
      for(let gx=Math.floor((view.minX-120)/step);gx<=Math.ceil((view.maxX+120)/step);gx++){
        const anchor=gx*step;
        c.beginPath();for(let y=Math.floor((view.minY-50)/45)*45,i=0;y<=view.maxY+50;y+=45,i++){const x=anchor+Math.sin(y/143+gx*.8)*27+Math.sin(y/351+gx)*20;c[i?'lineTo':'moveTo'](x,y);}
        c.strokeStyle=gx%2?'#ffae67':'#ffd17c';c.lineWidth=gx%2?44:20;c.stroke();
      }
      for(let gy=Math.floor(view.minY/80)-1;gy<=Math.ceil(view.maxY/80)+1;gy++)for(let gx=Math.floor(view.minX/92)-1;gx<=Math.ceil(view.maxX/92)+1;gx++){
        const n=hash(gx+61,gy);if(n<.56)continue;const x=gx*92+n*55,y=gy*80+hash(gy+13,gx)*45;c.beginPath();c.ellipse(x,y,3+n*4,1.8+n*2,.4,0,TAU);c.fillStyle='#ffe2a6a0';c.fill();
      }
    }
    c.restore();
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
  const points=bridgePoints(p);if(!points.length||!overlaps(polygonBounds(points),view,12))return;
  const [a,b]=p.deck||p.waypoints||[],length=Math.hypot(b.x-a.x,b.y-a.y),width=p.width||160,angle=Math.atan2(b.y-a.y,b.x-a.x);
  c.save();trace(c,points);c.fillStyle='#aaa093';c.fill();c.clip();c.translate(a.x,a.y);c.rotate(angle);
  for(let row=-2;row<=2;row++)for(let x=-32+(Math.abs(row)%2)*27;x<length+32;x+=54){c.beginPath();c.roundRect(x+1,row*37-17,52,35,3);c.fillStyle=(Math.floor(x/54)+row)%3===0?'#c8bbaa':'#b8b0a3';c.fill();c.strokeStyle='#92888a';c.lineWidth=1.2;c.stroke();if(!overview)line(c,[{x:x+5,y:row*37-14},{x:x+45,y:row*37-14}],'#ded0b7',1.2);}
  for(const side of[-1,1]){c.fillStyle='#8b8190';c.fillRect(-2,side*width/2-4,length+4,8);c.fillStyle='#c5b9b2';c.fillRect(-2,side*width/2-3,length+4,3);}
  c.restore();trace(c,points);c.strokeStyle='#665d70';c.lineWidth=2;c.stroke();
}

export class EmberMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;this.ids=new WeakMap();this.nextId=0;}
  get cacheStats(){return {entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,false);sceneDetails(c,data,view,false);lava(c,data,view,false);shallowSurfaces(c,data,view,false);cliffs(c,data,view,false);for(const p of data.bridges)bridge(c,p,view,false);c.restore();return true;}
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
  c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,false);sceneDetails(c,data,view,false);lava(c,data,view,false);shallowSurfaces(c,data,view,false);cliffs(c,data,view,false);for(const p of data.bridges)bridge(c,p,view,false);
  const props=(data.scene.props||[]).filter(p=>p.visual!==false&&overlaps({minX:p.x-(emberVisual(p)?.halfWidth||0),maxX:p.x+(emberVisual(p)?.halfWidth||0),minY:p.y-(emberVisual(p)?.top||0),maxY:p.y+(emberVisual(p)?.bottom||0)},view));
  const sites=(layout.interactions?.caves||[]).map(p=>({...p,artTheme:'ember',kind:'cave'}));
  for(const item of [...props,...sites].sort((a,b)=>a.y-b.y)){
    if(item.variant==='ember-native'){
      const visual=emberVisual(item);if(item.emberKind!=='arch-lintel'){c.save();c.globalAlpha=.15;c.fillStyle='#514657';c.beginPath();c.ellipse(item.x+5,item.y+visual.shadowOffset,Math.max(5,visual.shadowWidth),Math.max(4,visual.shadowLength*.45),.2,0,TAU);c.fill();c.restore();}
      drawEmberProp(c,item);
    }else drawEmberLandmark(c,item);
  }
  overviewLabels(c,layout,{scale,labels,landmarks});c.restore();return true;
}
