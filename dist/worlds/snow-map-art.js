import { WorldArt } from '../world-art.js';
import { RiftCollision } from '../rift-collision.js';
import { paintSnowGround, paintSnowIceTexture, SNOW_GROUND_COLOR, SNOW_ICE_COLOR } from '../snow-surface-art.js';
import { drawSnowBridge, drawSnowCliffs } from '../snow-structure-art.js';

// Authored snow worlds reuse the public snow painters. This module decorates
// the collision union; it owns no alternate geometry or full-world bitmap.
export const SNOW_MAP_PALETTE=Object.freeze({ground:SNOW_GROUND_COLOR,forest:'#526e6c',rock:'#6f8791',ice:SNOW_ICE_COLOR,water:'#254a60',waterEdge:'#b8d2da',path:'#a0b5b5'});
const TAU=Math.PI*2,GROUND_TILE=256;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
function trace(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=point(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function rings(c,boundaries,begin=true){if(begin)c.beginPath();for(const boundary of boundaries)trace(c,boundary.points||boundary,false);}
function bounds(points){return points.reduce((b,value)=>{const p=point(value);return {minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const prepared=new WeakMap();
function prepare(layout){
  let data=prepared.get(layout);if(data)return data;
  const records=items=>(items||[]).map(value=>({value,bounds:bounds(value.points)}));
  data={collision:new RiftCollision(layout),areas:records(layout.areas),patches:records(layout.patches),lakes:records(layout.lakes),bridges:[]};
  for(const passage of layout.passages||[]){
    if(passage.kind!=='bridge'||passage.deck?.length!==2)continue;
    const [a,b]=passage.deck,angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle)*passage.width/2,ny=Math.cos(angle)*passage.width/2;
    const bridge={...passage,points:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]};
    data.bridges.push({value:bridge,bounds:bounds(bridge.points)});
  }
  prepared.set(layout,data);return data;
}
function nearestArea(layout,x,y){let nearest=layout.areas[0],best=Infinity;for(const area of layout.areas){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<best){best=d;nearest=area;}}return nearest;}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function snowBase(c,layout,view,{overview=false}={}){
  const data=prepare(layout),p=SNOW_MAP_PALETTE;
  c.fillStyle=p.forest;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  // Subdued rock fields distinguish long ridges from continuous pine forest.
  for(const {value:area,bounds:b}of data.areas){
    if(area.material!=='rock'||!overlaps(b,view,600))continue;
    const radius=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.8;
    const gradient=c.createRadialGradient(area.center.x,area.center.y,radius*.3,area.center.x,area.center.y,radius);
    gradient.addColorStop(0,p.rock);gradient.addColorStop(1,'#6f879100');c.fillStyle=gradient;c.fillRect(b.minX-600,b.minY-600,b.maxX-b.minX+1200,b.maxY-b.minY+1200);
  }
  for(const {value:lake,bounds:b}of data.lakes){
    if(!overlaps(b,view,20))continue;lakePath(c,lake);c.fillStyle=p.water;c.fill('evenodd');
    c.save();lakePath(c,lake);c.clip('evenodd');c.strokeStyle='#6998ab80';c.lineWidth=overview?30:18;c.stroke();c.restore();
  }
  rings(c,layout.boundaries);c.fillStyle=p.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries);c.clip('evenodd');
  if(!overview){
    // The same finite ground tiles serve legacy snow and this authored world.
    for(let ty=Math.floor(view.minY/GROUND_TILE);ty<=Math.floor(view.maxY/GROUND_TILE);ty++)for(let tx=Math.floor(view.minX/GROUND_TILE);tx<=Math.floor(view.maxX/GROUND_TILE);tx++){
      c.save();c.translate(tx*GROUND_TILE,ty*GROUND_TILE);paintSnowGround(c,{variant:Math.floor(hash(tx+11,ty+29)*3),zone:2});c.restore();
    }
  }
  for(const {value:area,bounds:b}of data.areas){
    if(!overlaps(b,view,5))continue;
    if(area.snowTerrain==='ice'){
      trace(c,area.points);c.fillStyle=p.ice;c.fill();
      if(!overview){c.save();trace(c,area.points);c.clip();paintSnowIceTexture(c,view,{seed:.521});trace(c,area.points);c.strokeStyle='#e7f0e7aa';c.lineWidth=11;c.stroke();c.restore();}
    }else if(overview){
      trace(c,area.points);c.fillStyle=area.material==='rock'?'#c4d2d6':'#dce7df';c.fill();
    }
  }
  // Worn routes stay inside the reserved corridor, rather than suggesting a
  // second shortcut through the collision wall. Main legs are more visible.
  c.save();
  // Continuous ice has pressure cracks, rather than painted snow roads.
  rings(c,layout.boundaries);for(const {value:area}of data.areas)if(area.snowTerrain==='ice')trace(c,area.points,false);c.clip('evenodd');
  for(const main of [false,true]){
    c.save();c.globalAlpha*=overview?(main?.48:.27):(main?.075:.045);c.beginPath();
    for(const route of layout.routes||[]){
      if(Boolean(route.mainRoute)!==main)continue;
      const b={minX:Math.min(route.ax,route.bx),minY:Math.min(route.ay,route.by),maxX:Math.max(route.ax,route.bx),maxY:Math.max(route.ay,route.by)};
      if(!overlaps(b,view,route.r))continue;c.moveTo(route.ax,route.ay);c.lineTo(route.bx,route.by);
    }
    c.strokeStyle=overview&&main?'#849e96':p.path;c.lineWidth=overview?(main?64:35):(main?24:15);c.lineCap='round';c.lineJoin='round';c.stroke();c.restore();
  }
  c.restore();
  for(const {value:patch,bounds:b}of data.patches){
    if(!overlaps(b,view))continue;trace(c,patch.points);c.save();c.globalAlpha*=overview?.25:.12;c.fillStyle='#6b9990';c.fill();c.restore();
  }
  c.restore();
  // Lake rims follow the actual deep-water polygons; a pale crack in solid
  // walkable ice is never promoted to a deep-water obstacle by this painter.
  for(const {value:lake,bounds:b}of data.lakes){if(!overlaps(b,view,10))continue;lakePath(c,lake);c.strokeStyle=p.waterEdge;c.lineWidth=overview?10:4;c.stroke();}
  drawSnowCliffs(c,layout.solidBoundaries||layout.boundaries,{viewBounds:view,overview,shouldDraw:q=>nearestArea(layout,q.x,q.y)?.material==='rock'});
  for(const {value:bridge,bounds:b}of data.bridges)if(overlaps(b,view,20))drawSnowBridge(c,bridge,{overview});
}

export class SnowMapArt{
  constructor(makeCanvas){this.scenery=new WorldArt(makeCanvas);}
  get cacheStats(){return this.scenery.cacheStats;}
  paintTile(c,layout,view){
    const data=prepare(layout);snowBase(c,layout,view);
    // Far scenery is clipped to the blocked side; full near-edge props use
    // the regular raised queue for character and attack depth occlusion.
    c.save();c.beginPath();c.rect(view.minX-160,view.minY-160,view.maxX-view.minX+320,view.maxY-view.minY+320);rings(c,layout.solidBoundaries||layout.boundaries,false);c.clip('evenodd');
    for(let gy=Math.floor((view.minY-150)/85);gy<=Math.floor((view.maxY+150)/85);gy++)for(let gx=Math.floor((view.minX-80)/83);gx<=Math.floor((view.maxX+80)/83);gx++){
      const n=hash(gx+23,gy-11),m=hash(gy-7,gx+17),x=(gx+.12+n*.72)*83,y=(gy+.1+m*.8)*85;
      if(data.collision.high.inside(x,y)||(data.collision.high.nearest(x,y,80)?.distance??Infinity)<54)continue;
      const area=nearestArea(layout,x,y),rock=area?.material==='rock';
      this.scenery.drawProp(c,rock?{type:'rock',variant:n>.55?'world-ice':'world-snowrock',x,y,r:30+n*17,rockForm:Math.floor(m*5),region:'snow'}:{type:'tree',variant:'world-snowpine',x,y,scale:.83+n*.29,treeForm:Math.floor(m*5)});
    }
    c.restore();
    c.save();rings(c,layout.boundaries);c.clip('evenodd');
    for(const {value:patch,bounds:b}of data.patches){
      if(!overlaps(b,view,30))continue;c.save();trace(c,patch.points);c.clip();
      for(let gy=Math.floor(view.minY/78)-1;gy<=Math.floor(view.maxY/78)+1;gy++)for(let gx=Math.floor(view.minX/89)-1;gx<=Math.floor(view.maxX/89)+1;gx++){
        const n=hash(gx+71,gy+19);if(n<.62)continue;
        this.scenery.drawProp(c,{type:'tree',variant:'world-snowgrass',x:(gx+.1+n*.8)*89,y:(gy+.1+hash(gy,gx)*.8)*78,scale:.45+n*.25,treeForm:Math.floor(n*5)});
      }c.restore();
    }c.restore();
    // Planks belong above banks and far scenery, with exactly the same deck.
    for(const {value:bridge,bounds:b}of data.bridges)if(overlaps(b,view,20))drawSnowBridge(c,bridge);
  }
}

export function drawSnowOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  const view=viewBounds||layout.bounds;c.save();c.lineCap='round';c.lineJoin='round';snowBase(c,layout,view,{overview:true});
  if(landmarks){
    for(const [key,mark]of Object.entries(layout.landmarks||{})){
      if(!Number.isFinite(mark.x)||!Number.isFinite(mark.y))continue;
      const size=6/scale;c.save();c.translate(mark.x,mark.y);
      if(/^boss/.test(key)){c.fillStyle='#b54e59';c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=(i%2?.48:1)*size;c[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
      else if(/^cave/.test(key)){c.fillStyle='#21465b';c.beginPath();c.arc(0,0,size,Math.PI,0);c.lineTo(size,size*.65);c.lineTo(-size,size*.65);c.closePath();c.fill();}
      else if(/^treasure/.test(key)){c.fillStyle='#c0984e';c.fillRect(-size*.7,-size*.5,size*1.4,size);}
      c.restore();
    }
    c.fillStyle='#5d946c';const p=layout.spawn;c.beginPath();c.arc(p.x,p.y,6/scale,0,TAU);c.fill();
  }
  if(labels){c.textAlign='center';c.textBaseline='middle';c.font=`600 ${11/scale}px "PingFang SC",system-ui,sans-serif`;c.lineWidth=3/scale;c.strokeStyle='#f2f6ee';c.fillStyle='#294653';for(const area of layout.areas){const p=area.label||area.center;c.strokeText(`${area.id} ${area.name}`,p.x,p.y);c.fillText(`${area.id} ${area.name}`,p.x,p.y);}}
  c.restore();return true;
}
