import { EMBER_PALETTE } from '../ember-art.js';

const TILE=384,BLEED=2,PIXEL_LIMIT=6*1024*1024,TAU=Math.PI*2;
const prepared=new WeakMap();
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function trace(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=xy(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function rings(c,values,begin=true){if(begin)c.beginPath();for(const item of values||[])trace(c,item.points||item,false);}
function polygonBounds(points){return points.reduce((b,p)=>{p=xy(p);return {minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
function records(layout){let value=prepared.get(layout);if(value)return value;
  const scene=layout.emberScene||{},ground=scene.groundRings||layout.boundaries||[],high=scene.highOpenRings||layout.solidBoundaries||ground;
  const lakes=scene.lavaRings||layout.lakes||[],roads=scene.roads||[];
  const bridges=scene.bridge?[scene.bridge]:(layout.passages||[]).filter(p=>p.kind==='bridge');
  value={scene,ground,high,lakes:lakes.map(p=>({value:p,bounds:polygonBounds(p.points||p)})),roads,bridges,edges:[],rimMarks:[]};
  for(const ring of high){const points=ring.points||ring;let carry=23;for(let i=0;i<points.length;i++){const a=xy(points[i]),b=xy(points[(i+1)%points.length]),length=Math.hypot(b.x-a.x,b.y-a.y);if(length>0){value.edges.push({a,b,length,bounds:{minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)}});for(let d=carry;d<length;d+=57)value.rimMarks.push({x:a.x+(b.x-a.x)*d/length,y:a.y+(b.y-a.y)*d/length});carry=(carry-length)%57;if(carry<0)carry+=57;}}}
  prepared.set(layout,value);return value;
}
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function pathRoad(c,road){c.beginPath();for(const [i,p]of(road.points||road.waypoints||[]).entries()){const q=xy(p);c[i?'lineTo':'moveTo'](q.x,q.y);}}
function lakePath(c,lake){trace(c,lake.points||lake);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function clipBlocked(c,data,view){c.beginPath();c.rect(view.minX-3,view.minY-3,view.maxX-view.minX+6,view.maxY-view.minY+6);rings(c,data.high,false);c.clip('evenodd');}
function ground(c,layout,data,view,overview){
  const P=EMBER_PALETTE;
  c.fillStyle=P.rock;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  rings(c,data.ground);c.fillStyle=P.earth;c.fill('evenodd');
  c.save();rings(c,data.ground);c.clip('evenodd');
  // Large translucent color shapes provide soil variation without a field of
  // noisy repeated texture. They are generated only on cold cached tiles.
  const step=210;
  for(let gy=Math.floor((view.minY-120)/step);gy<=Math.ceil((view.maxY+120)/step);gy++)for(let gx=Math.floor((view.minX-120)/step);gx<=Math.ceil((view.maxX+120)/step);gx++){
    const n=hash(gx+27,gy-11),x=gx*step+hash(gx-7,gy)*80,y=gy*step+hash(gy+42,gx)*90;
    const radius=145+n*55,g=c.createRadialGradient(x,y,10,x,y,radius);g.addColorStop(0,n>.5?'#f1c99c35':'#ad8c8027');g.addColorStop(1,n>.5?'#f1c99c00':'#ad8c8000');c.fillStyle=g;c.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  for(const road of data.roads){pathRoad(c,road);c.strokeStyle='#c896751c';c.lineWidth=(road.width||110)+20;c.stroke();pathRoad(c,road);c.strokeStyle='#ebc59a';c.lineWidth=road.width||110;c.stroke();pathRoad(c,road);c.strokeStyle='#efd0a4';c.lineWidth=(road.width||110)*.65;c.stroke();}
  if(!overview){
    const spacing=45;
    for(let gy=Math.floor(view.minY/spacing)-1;gy<=Math.ceil(view.maxY/spacing)+1;gy++)for(let gx=Math.floor(view.minX/spacing)-1;gx<=Math.ceil(view.maxX/spacing)+1;gx++){
      const n=hash(gx+71,gy+19);if(n<.57)continue;const x=(gx+.15+hash(gx+13,gy)*.7)*spacing,y=(gy+.15+hash(gy+7,gx)*.7)*spacing;
      c.beginPath();c.ellipse(x,y,1.4+n*2,.6+n*.4,-.3,0,TAU);c.fillStyle=n>.84?'#f9dfb878':'#a7786c3e';c.fill();
      if(n>.9)line(c,[{x:x-2,y:y+3},{x:x+4,y:y+2}],'#f8d8ac60',.8);
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
  if(overview){rings(c,data.high);c.strokeStyle='#a49aa7';c.lineWidth=36;c.stroke();c.restore();return;}
  const step=153;
  for(let gy=Math.floor(view.minY/step)-1;gy<=Math.ceil(view.maxY/step)+1;gy++)for(let gx=Math.floor(view.minX/step)-1;gx<=Math.ceil(view.maxX/step)+1;gx++){
    const n=hash(gx+17,gy-23),x=gx*step+hash(gx+3,gy)*52,y=gy*step+hash(gy+3,gx)*63;
    trace(c,[[x-34,y+26],[x+18,y-5],[x+98,y-20],[x+143,y+17],[x+124,y+79],[x+38,y+96],[x-29,y+71]]);
    c.fillStyle=n>.55?'#928a97':'#827c8d';c.fill();c.strokeStyle='#6b667729';c.lineWidth=2;c.stroke();
    line(c,[{x:x+1,y:y+22},{x:x+29,y:y+7},{x:x+91,y:y-5}],'#b3a8b449',2);
  }
  rings(c,data.high);c.strokeStyle='#a097a2';c.lineWidth=143;c.stroke();
  rings(c,data.high);c.strokeStyle='#7c7588';c.lineWidth=116;c.stroke();
  rings(c,data.high);c.strokeStyle='#726b80';c.lineWidth=40;c.stroke();
  // Wider facets establish individual basalt columns on one continuous mass;
  // these lines are surface marks and never individual collision pieces.
  for(const {x,y}of data.rimMarks){if(x<view.minX-20||x>view.maxX+20||y<view.minY-20||y>view.maxY+90)continue;const n=hash(x+8,y-9);line(c,[{x:x-3,y:y-53-n*18},{x:x+2,y:y-26},{x:x-1,y:y+17}],'#55516695',2);line(c,[{x:x+5,y:y-53-n*18},{x:x+7,y:y-27}],'#b6a9b190',1.5);
  }
  rings(c,data.high);c.strokeStyle='#514d60';c.lineWidth=3;c.stroke();c.restore();
}
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
  paintTile(c,layout,view){const data=records(layout);c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,false);lava(c,data,view,false);cliffs(c,data,view,false);for(const p of data.bridges)bridge(c,p,view,false);c.restore();return true;}
  _tile(layout,tx,ty){let id=this.ids.get(layout);if(!id){id=++this.nextId;this.ids.set(layout,id);}const key=`${id}:${tx}:${ty}`;let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas(),side=TILE+BLEED*2;canvas.width=canvas.height=side;const c=canvas.getContext('2d');c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);this.paintTile(c,layout,{minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED});image={canvas,pixels:side*side};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  drawGround(c,island,{camX=0,camY=0,width=1100,height=700}={}){const layout=island?.layout;if(layout?.artTheme!=='ember')return false;const left=camX-width/2,top=camY-height/2;c.save();for(let ty=Math.floor(top/TILE);ty<=Math.floor((top+height)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((left+width)/TILE);tx++){const image=this._tile(layout,tx,ty);c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE-left,ty*TILE-top,TILE,TILE);}c.restore();return true;}
}

export function drawEmberOverview(c,layout,{viewBounds,scale=1,labels=false,landmarks=false}={}){
  if(layout?.artTheme!=='ember')return false;const data=records(layout),view=viewBounds||layout.bounds;
  c.save();c.lineCap='round';c.lineJoin='round';ground(c,layout,data,view,true);lava(c,data,view,true);cliffs(c,data,view,true);for(const p of data.bridges)bridge(c,p,view,true);
  if(labels){c.textAlign='center';c.textBaseline='middle';c.font=`600 ${11/scale}px system-ui,sans-serif`;c.strokeStyle='#f4e0bb';c.fillStyle='#4e4857';c.lineWidth=3/scale;for(const area of layout.areas||[]){const p=area.label||area.center;if(!p)continue;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  if(landmarks)for(const [name,site]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(site.x)||!Number.isFinite(site.y)||!/^cave|^treasure|^boss/.test(name))continue;c.beginPath();c.arc(site.x,site.y,5/scale,0,TAU);c.fillStyle=/^boss/.test(name)?'#b4645b':/^cave/.test(name)?'#645c79':'#dfb768';c.fill();c.strokeStyle='#f5deb7';c.lineWidth=1/scale;c.stroke();}
  c.restore();return true;
}
