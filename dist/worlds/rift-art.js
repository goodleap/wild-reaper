import { SceneryArt } from '../scenery-art.js';
import { RegionalArt } from '../regional-art.js';
import { RiftCollision } from '../rift-collision.js';
import { CityMapArt, drawCityOverview } from './city-map-art.js';
import { paintCityGround, paintCityWall } from '../city-scenery-art.js';
import { drawCityLandmark } from '../city-structure-art.js';
import { EmberMapArt, drawEmberOverview } from './ember-map-art.js';
// The authored valley uses the same polygons for art, collision and maps.
// Detailed floor and deep forest are rasterized only in visible, bounded tiles.
// The complete trees and shrubs at the forest edge use the world depth queue.
export const RIFT_PALETTE=Object.freeze({ground:'#f3e4b9',groundShade:'#dfd2a9',grass:'#b4ca88',grassLight:'#c7d79e',forest:'#2c4e3d',forestDark:'#1d3a2e',forestLight:'#426750',cliff:'#68615a',cliffLight:'#91877b',cliffDark:'#454540',water:'#226a96',waterDeep:'#1d5982',waterEdge:'#438eb4',bridge:'#bb894c',bridgeLight:'#e2b879',bridgeDark:'#644b32'});
export const MARSH_PALETTE=Object.freeze({ground:'#a2ab84',groundShade:'#879675',grass:'#91a36f',grassLight:'#b6c293',forest:'#365c48',forestDark:'#294a3d',forestLight:'#53765a',cliff:'#738477',cliffLight:'#a0aa8b',cliffDark:'#485d51',water:'#426f69',waterDeep:'#315852',waterEdge:'#799b83',bridge:'#a48c60',bridgeLight:'#d0bf8e',bridgeDark:'#56604c'});
const paletteFor=layout=>layout?.artTheme==='marsh'?MARSH_PALETTE:RIFT_PALETTE;
const TAU=Math.PI*2,TILE=384,BLEED=2,PIXEL_LIMIT=6*1024*1024,FONT='"PingFang SC",system-ui,sans-serif';
const preparedLayouts=new WeakMap();
const ROCK_KINDS=new Set(['quarry','ravine','pass','ruins','fortress']);
function rockyArea(layout,area){
  if(area?.material==='rock')return true;if(area?.material==='forest')return false;
  // Preserve the original world's hand-picked geology while new worlds use
  // their region material/kind rather than a coincidental numeric area ID.
  if(layout.id==='rift-forest:1')return area?.id==='09'||area?.kind!=='ravine'&&ROCK_KINDS.has(area?.kind);
  return ROCK_KINDS.has(area?.kind);
}
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
function trace(c,points,begin=true){if(begin)c.beginPath();for(let i=0;i<points.length;i++){const p=point(points[i]);c[i?'lineTo':'moveTo'](p.x,p.y);}c.closePath();}
function rings(c,boundaries){c.beginPath();for(const boundary of boundaries)trace(c,boundary.points||boundary,false);}
function bounds(points){return points.reduce((b,p)=>{p=point(p);b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);return b;},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,margin=0)=>!b||a.maxX+margin>=b.minX&&a.minX-margin<=b.maxX&&a.maxY+margin>=b.minY&&a.minY-margin<=b.maxY;
function prepared(layout){let data=preparedLayouts.get(layout);if(data)return data;const records=items=>(items||[]).map(value=>({value,bounds:bounds(value.points||[])}));data={areas:records(layout.areas),patches:records(layout.patches),lakes:records(layout.lakes),bridges:records((layout.passages||[]).filter(p=>p.kind==='bridge').map(p=>{if(!p.deck?.length)return p;const [a,b]=p.deck,angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle)*p.width/2,ny=Math.cos(angle)*p.width/2;return {...p,waypoints:p.deck,points:[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}]};}))};
  data.collision=new RiftCollision(layout);
  data.undergrowth=[];
  for(const boundary of layout.solidBoundaries||layout.boundaries){const ring=boundary.points||boundary;let carry=0;
    for(let i=0;i<ring.length;i++){const a=point(ring[i]),b=point(ring[(i+1)%ring.length]),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      for(let d=carry;d<length;d+=29){const x=a.x+dx*d/length,y=a.y+dy*d/length,n=hash(x+12,y-7),nx=-dy/length,ny=dx/length,side=data.collision.high.inside(x+nx*3,y+ny*3)?-1:1,px=x+nx*side*(8+n*8),py=y+ny*side*(8+n*8);
        if(data.collision.high.inside(px,py)||data.bridges.some(p=>overlaps(p.bounds,{minX:px,minY:py,maxX:px,maxY:py},65)))continue;
        let nearest=null,best=Infinity;for(const area of layout.areas){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<best){best=d;nearest=area;}}
        data.undergrowth.push({x:px,y:py,n,stone:nearest?.material==='rock'||nearest?.material!=='forest'&&['quarry','ravine','pass'].includes(nearest?.kind)});
      }carry=(carry-length)%29;if(carry<0)carry+=29;
    }
  }
  data.shores=[];
  for(const lake of layout.lakes||[])for(const ring of [lake.points,...(lake.holes||[]).map(h=>h.points||h)]){
    let carry=0;
    for(let i=0;i<ring.length;i++){const a=point(ring[i]),b=point(ring[(i+1)%ring.length]),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
      for(let d=carry;d<length;d+=33){const x=a.x+dx*d/length,y=a.y+dy*d/length,n=hash(x+4,y+17),nx=-dy/length,ny=dx/length;let side=0;
        for(const sign of [-1,1])if(data.collision.ground.inside(x+nx*sign*17,y+ny*sign*17)){side=sign;break;}
        if(side&&!data.bridges.some(p=>overlaps(p.bounds,{minX:x,minY:y,maxX:x,maxY:y},26)))data.shores.push({x,y,n,nx:nx*side,ny:ny*side});
      }carry=(carry-length)%33;if(carry<0)carry+=33;
    }
  }
  preparedLayouts.set(layout,data);return data;}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function strokeLine(c,ax,ay,bx,by,color,width){c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function bridge(c,p,{overview=false,colors=RIFT_PALETTE}={}){
  c.save();trace(c,p.points);c.fillStyle=colors.bridgeDark;c.fill();c.clip();
  c.fillStyle=colors.bridge;c.fillRect(...(()=>{const b=bounds(p.points);return [b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY];})());
  const route=p.waypoints||[];
  for(let i=1;i<route.length;i++){
    const a=point(route[i-1]),b=point(route[i]),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),width=p.width||130;
    if(length<1)continue;const angle=Math.atan2(dy,dx),spacing=overview?38:17;c.save();c.translate(a.x,a.y);c.rotate(angle);
    for(let x=0;x<length+spacing;x+=spacing){const n=hash(x+p.width,i);c.fillStyle=colors===MARSH_PALETTE?(n>.5?'#ad9971':'#95835d'):(n>.5?'#c49354':'#af7e45');c.fillRect(x+1,-width*.5,spacing-2,width);strokeLine(c,x+2,-width*.5,x+2,width*.5,colors.bridgeLight,overview?5:1.5);if(!overview)strokeLine(c,x+6,-width*.3,x+7,width*.3,'#815d383e',.8);}
    for(const side of [-1,1]){const y=side*(width*.5-8);strokeLine(c,0,y,length,y,colors.bridgeDark,overview?12:8);strokeLine(c,0,y-2,length,y-2,colors.bridgeLight,overview?5:2.5);for(let x=12;x<length;x+=74){c.fillStyle=colors.bridgeDark;c.fillRect(x-5,y-8,10,16);c.fillStyle=colors.bridgeLight;c.fillRect(x-3,y-8,6,4);}}
    c.restore();
  }
  c.restore();trace(c,p.points);c.strokeStyle=colors.bridgeDark;c.lineWidth=overview?9:2;c.stroke();
}
function base(c,layout,{viewBounds,overview=false}={}){
  const p=paletteFor(layout),marsh=layout.artTheme==='marsh',data=prepared(layout),b=viewBounds||layout.bounds;c.fillStyle=p.forest;c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  // A subdued soil seam sits below full vegetation silhouettes. It is not a
  // painted cliff strip; the landform's material comes from actual scenery.
  if(overview){rings(c,layout.solidBoundaries||layout.boundaries||[]);c.strokeStyle='#364a32';c.lineWidth=20;c.stroke();}
  for(const {value:lake,bounds:b}of data.lakes){if(!overlaps(b,viewBounds,10))continue;lakePath(c,lake);c.fillStyle=p.water;c.fill('evenodd');if(!overview){c.save();lakePath(c,lake);c.clip('evenodd');c.strokeStyle='#5b98a324';c.lineWidth=70;c.stroke();c.strokeStyle='#81b1ad39';c.lineWidth=30;c.stroke();c.strokeStyle='#add0be75';c.lineWidth=6;c.stroke();c.restore();}else{c.strokeStyle=p.waterEdge;c.lineWidth=16;c.stroke();}}
  rings(c,layout.boundaries||[]);c.fillStyle=p.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries||[]);c.clip('evenodd');
  c.strokeStyle=overview?p.grass:marsh?'#71856866':'#9caf6b66';c.lineWidth=overview?26:14;c.stroke();
  for(const {value:area,bounds:b}of data.areas){if(!overlaps(b,viewBounds))continue;const quarry=area.kind==='quarry',ruin=['ruins','fortress','pass'].includes(area.kind);if(!quarry&&!ruin)continue;
    if(overview){trace(c,area.points);c.fillStyle=marsh?'#b1b394':quarry?'#ede0bd':'#e4ddbd';c.fill();}
    else{const radius=Math.max(b.maxX-b.minX,b.maxY-b.minY)*.58,g=c.createRadialGradient(area.center.x,area.center.y,20,area.center.x,area.center.y,radius);g.addColorStop(0,marsh?'#b5b69a6b':quarry?'#c5bea744':'#c6ccb75c');g.addColorStop(.65,marsh?'#b1b29432':quarry?'#d4c8a82c':'#cbd2b33b');g.addColorStop(1,'#ddd4b300');c.fillStyle=g;c.fillRect(area.center.x-radius,area.center.y-radius,radius*2,radius*2);}}
  for(const {value:patch,bounds:b}of data.patches){if(!overlaps(b,viewBounds,12))continue;trace(c,patch.points);if(!overview){c.strokeStyle=marsh?'#91a36f44':'#b4ca8844';c.lineWidth=18;c.stroke();}c.fillStyle=p.grass;c.fill();}
  c.restore();
  for(const {value:passage,bounds:b}of data.bridges)if(overlaps(b,viewBounds,10))bridge(c,passage,{overview,colors:p});
}
// Deep thickets are full painted scenery, not ellipses clipped to the path.
// Anchors are evaluated against the same indexed mask as movement. Near-edge
// scenery is reserved for the depth-sorted props; far crowns are cheap stamps.
function blockedScenery(c,layout,view,scenery,regional){
  const data=prepared(layout),mask=data.collision.high;
  for(let gy=Math.floor((view.minY-150)/62);gy<=Math.floor((view.maxY+150)/62);gy++)for(let gx=Math.floor((view.minX-150)/71);gx<=Math.floor((view.maxX+150)/71);gx++){
    const n=hash(gx+13,gy+11),m=hash(gy-33,gx+4),x=(gx+.15+n*.7)*71,y=(gy+.1+m*.8)*62;
    if(mask.inside(x,y))continue;const edge=mask.nearest(x,y,100),distance=edge?.distance??Infinity;if(distance<52)continue;
    let nearest=null,best=Infinity;for(const area of layout.areas){const d=(area.center.x-x)**2+(area.center.y-y)**2;if(d<best){best=d;nearest=area;}}
    const stony=rockyArea(layout,nearest),seed=gx*37+gy*59;
    if(stony&&n<.81){scenery.drawRock(c,{x,y:y+16,r:36+n*24,rockForm:[0,1,2,4][Math.floor(m*4)],riftPalette:true});if(n>.55)scenery.drawShrub(c,{x:x-18,y:y+27,scale:.55+n*.22,seed,riftPalette:true});}
    else if(regional&&n<.19&&distance>150){regional.drawDeadTree(c,{x,y:y+46,scale:.86+m*.2,treeForm:Math.floor(m*5)});scenery.drawShrub(c,{x:x-12,y:y+48,scale:.57+n*.5,seed,riftPalette:true});}
    else scenery.drawCanopy(c,{x,y,scale:.81+n*.35,treeForm:Math.floor(m*5),riftPalette:true});
  }
}
function undergrowth(c,layout,view,scenery){
  for(const {x,y,n,stone}of prepared(layout).undergrowth){if(x<view.minX-65||x>view.maxX+65||y<view.minY-25||y>view.maxY+65)continue;
    if(stone&&n<.7)scenery.drawRock(c,{x,y,r:9+n*10,rockForm:n<.36?3:1,riftPalette:true});
    else scenery.drawShrub(c,{x,y,scale:.34+n*.24,seed:x*.13+y*.37,riftPalette:true});
  }
}
function shoreDetails(c,layout,view){
  for(const {x,y,n,nx,ny}of prepared(layout).shores){if(x<view.minX-35||x>view.maxX+35||y<view.minY-35||y>view.maxY+55)continue;
    const xx=x+nx*7,yy=y+ny*7;
    // Small warm stones and short reeds bridge water, wet earth and grass.
    if(n<.33){for(let i=0;i<3;i++){const px=xx+(hash(x+i,y)-.5)*21,py=yy+(hash(y+i,x)-.5)*10;c.beginPath();c.moveTo(px-3,py);c.quadraticCurveTo(px-4,py-4,px,py-4.5);c.quadraticCurveTo(px+5,py-3,px+4,py+1);c.quadraticCurveTo(px,py+3,px-3,py);c.fillStyle=i%2?'#8b967f':'#b5b79b';c.fill();strokeLine(c,px-1,py-3,px+3,py-2,'#e1d9b178',.8);}}
    else if(layout.artTheme==='marsh')marshReeds(c,xx,yy,.83+n*.3,x+y);
    else if(n>.53){for(let i=0;i<5;i++){const px=xx+(i-2)*3,py=yy+(i%2)*2,h=7+hash(i+x,y)*17;c.strokeStyle=i%2?'#7e9d5b':'#507651';c.lineWidth=1.2;c.beginPath();c.moveTo(px,py);c.quadraticCurveTo(px+(i-2)*.9,py-h*.55,px+(i-2)*2,py-h);c.stroke();if(i===1||i===3)strokeLine(c,px+(i-2)*2,py-h,px+(i-2)*2+.5,py-h+5,'#78684a',2.3);}}
  }
}
function marshReeds(c,x,y,s,seed){
  // Short rooted fans are floor cover, painted once into the terrain tile.
  for(let i=0;i<5;i++){const dx=(i-2)*2.2*s,lean=(i-2)*3*s,h=(12+hash(seed+i,13)*19)*s;
    c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx+lean*.25,y-h*.68,x+dx+lean,y-h);c.quadraticCurveTo(x+dx+lean*.12,y-h*.4,x+dx+1.3*s,y);c.fillStyle=['#597852','#788e60','#a6b37a','#66855a','#92a46e'][i];c.fill();
    if(i===1||i===3)strokeLine(c,x+dx+lean,y-h,x+dx+lean+.4*s,y-h-5*s,'#a49c69',2*s);
  }
}
function marshFloorPatches(c,layout,view,regional){
  // Transparent peat, moss and worn masonry share the established regional
  // sprites. Jittered world anchors keep the cached tiles seamless in motion.
  const spacing=340,reach=200;
  for(let gy=Math.floor((view.minY-reach)/spacing);gy<=Math.floor((view.maxY+reach)/spacing);gy++)for(let gx=Math.floor((view.minX-reach)/spacing);gx<=Math.floor((view.maxX+reach)/spacing);gx++){
    const n=hash(gx+91,gy-37);if(n<.27)continue;
    const x=(gx+.12+hash(gx-8,gy+31)*.76)*spacing,y=(gy+.12+hash(gy+6,gx-71)*.76)*spacing,s=.8+n*.52;
    if(x+146*s<view.minX||x-146*s>view.maxX||y+108*s<view.minY||y-108*s>view.maxY)continue;
    const image=regional._patch('marsh',Math.floor(n*3));c.drawImage(image.canvas,x-146*s,y-108*s,292*s,216*s);
  }
  for(const {value:area,bounds:b}of prepared(layout).areas){
    if(!['ruins','fortress','village'].includes(area.kind)||!overlaps(b,view,200))continue;
    const offsets=[[-280,100],[-95,175],[170,115],[290,-120],[80,-210],[-220,-175]],seed=Number(area.id)||0;
    for(let i=0;i<offsets.length;i++){
      const [dx,dy]=offsets[i],n=hash(seed*17+i,83),x=area.center.x+dx+(n-.5)*70,y=area.center.y+dy+(hash(i+31,seed)-.5)*65,s=.9+n*.36;
      if(x+146*s<view.minX||x-146*s>view.maxX||y+108*s<view.minY||y-108*s>view.maxY)continue;
      const image=regional._patch('ruins',i%3);c.drawImage(image.canvas,x-146*s,y-108*s,292*s,216*s);
    }
  }
}
function groundDetails(c,layout,view,scenery,regional){
  const p=paletteFor(layout),marsh=layout.artTheme==='marsh',data=prepared(layout);
  c.save();rings(c,layout.boundaries||[]);c.clip('evenodd');
  if(marsh&&regional)marshFloorPatches(c,layout,view,regional);
  for(let gy=Math.floor(view.minY/39)-1;gy<=Math.floor(view.maxY/39)+1;gy++)for(let gx=Math.floor(view.minX/39)-1;gx<=Math.floor(view.maxX/39)+1;gx++){
    const n=hash(gx+17,gy),x=(gx+hash(gx,gy+7))*39,y=(gy+hash(gy,gx+39))*39;
    c.fillStyle=marsh?(n>.5?'#4c665b32':'#e1ddba65'):(n>.5?'#8a835c30':'#fff6d777');c.beginPath();c.ellipse(x,y,1+n*2,.5+n*.5,-.2,0,TAU);c.fill();
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
      if(marsh&&n>.57)marshReeds(c,x,y,.65+n*.25,gx*17+gy*23);
      else for(let i=0;i<5;i++){const xx=x+(i-2)*6,yy=y-5-Math.sin(i*Math.PI/4)*(7+n*6);strokeLine(c,x,y,xx,yy,'#69894f',1);c.beginPath();c.ellipse((x+xx)/2,(y+yy)/2,7+n*2,2.6,Math.atan2(yy-y,xx-x),0,TAU);c.fillStyle=i%2?'#8eaf65':'#a5be7b';c.fill();}
    }c.restore();
  }c.restore();
  for(const {value:lake,bounds:b}of data.lakes){if(!overlaps(b,view))continue;c.save();lakePath(c,lake);c.clip('evenodd');
    for(let gy=Math.floor(view.minY/50)-1;gy<=Math.floor(view.maxY/50)+1;gy++)for(let gx=Math.floor(view.minX/61)-1;gx<=Math.floor(view.maxX/61)+1;gx++){
      const n=hash(gx+71,gy),x=(gx+n)*61,y=(gy+hash(gy,gx+31))*50;strokeLine(c,x,y,x+11+n*22,y-1,marsh?'#b1c6a437':'#8ac6cc30',1);strokeLine(c,x+4,y+4,x+10+n*10,y+3,marsh?'#254c4538':'#103e6c33',1.5);
      if(marsh&&n>.9){for(let i=0;i<3;i++){const xx=x+(i-1)*10,yy=y+(i%2)*5,rx=4+hash(gx+i,gy)*4;c.beginPath();c.ellipse(xx,yy,rx,rx*.48,-.12,0,TAU);c.fillStyle=i%2?'#8da374':'#708f68';c.fill();strokeLine(c,xx,yy,xx+rx,yy+.5,'#365f4e',.8);}}
    }c.restore();
  }
  blockedScenery(c,layout,view,scenery,regional);
  undergrowth(c,layout,view,scenery);
  shoreDetails(c,layout,view);
  for(const {value:passage,bounds:b}of data.bridges)if(overlaps(b,view,10))bridge(c,passage,{colors:p});
}

export function drawRiftOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  if(layout?.artTheme==='ember')return drawEmberOverview(c,layout,{scale,labels,landmarks,viewBounds});
  if(layout?.artTheme==='city')return drawCityOverview(c,layout,{scale,labels,landmarks,viewBounds});
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
  constructor(makeCanvas=()=>document.createElement('canvas'),{now=()=>globalThis.performance?.now?.()??Date.now()}={}){this.makeCanvas=makeCanvas;this.now=now;this.scenery=new SceneryArt(makeCanvas);this.cache=new Map();this.pixels=0;this.builds=0;this.ids=new WeakMap();this.nextId=0;this.motion=null;this.pending=null;this.groundStats={visibleBuilds:0,prefetchBuilds:0,prefetchHits:0,budgetSkips:0,budgetOverruns:0,prefetchMs:0,maxPrefetchMs:0,lastVisibleBuilds:0,lastPrefetchBuilds:0,lastPrefetchMs:0};}
  get cacheStats(){const sources=[this.scenery.cacheStats,this.cityArt?.cacheStats,this.emberArt?.cacheStats,this.marshRegional?.cacheStats].filter(Boolean),sum=key=>sources.reduce((total,source)=>total+(source[key]||0),0);return {entries:this.cache.size+sum('entries'),pixels:this.pixels+sum('pixels'),bytes:this.pixels*4+sum('bytes'),limitBytes:PIXEL_LIMIT*4+sum('limitBytes'),builds:this.builds+sum('builds')};}
  _key(layout,tx,ty){let id=this.ids.get(layout);if(!id){id=++this.nextId;this.ids.set(layout,id);}return `${id}:${tx}:${ty}`;}
  _reserve(pixels,protectedKeys,optional){
    while(this.pixels+pixels>PIXEL_LIMIT&&this.cache.size){let oldest;
      for(const key of this.cache.keys())if(!protectedKeys?.has(key)){oldest=key;break;}
      // An exceptionally large view must still render every tile. Optional
      // work, however, can never evict the current view to make itself fit.
      if(oldest===undefined){if(optional)return false;oldest=this.cache.keys().next().value;}
      this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);
    }return this.pixels+pixels<=PIXEL_LIMIT;
  }
  _tile(layout,tx,ty,protectedKeys,optional=false){const key=this._key(layout,tx,ty);let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const side=TILE+BLEED*2;if(!this._reserve(side*side,protectedKeys,optional))return null;
    const canvas=this.makeCanvas();canvas.width=canvas.height=side;const c=canvas.getContext('2d'),view={minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED};c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);c.lineCap='round';c.lineJoin='round';if(layout.artTheme==='city'){this.cityArt??=new CityMapArt(this.makeCanvas);this.cityArt.paintTile(c,layout,view);}else if(layout.artTheme==='ember'){this.emberArt??=new EmberMapArt(this.makeCanvas);this.emberArt.paintTile(c,layout,view);}else{if(layout.artTheme==='marsh')this.marshRegional??=new RegionalArt(this.makeCanvas);base(c,layout,{viewBounds:view});groundDetails(c,layout,view,this.scenery,layout.artTheme==='marsh'?this.marshRegional:null);}
    image={canvas,pixels:side*side,prefetched:optional};this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  _anticipate(layout,view,visible,now){
    const previous=this.motion;this.motion={layout,...view,now};this.pending=null;
    const elapsed=previous?now-previous.now:0,dx=view.camX-(previous?.camX??view.camX),dy=view.camY-(previous?.camY??view.camY),distance=Math.hypot(dx,dy);
    // A paused view, scene change, resize, teleport or stale frame has no
    // reliable travel direction. There are no timers or background queues.
    if(!previous||previous.layout!==layout||previous.width!==view.width||previous.height!==view.height||elapsed<=0||elapsed>120||distance<.1||distance>TILE*.5)return;
    const capacity=Math.floor(PIXEL_LIMIT/(TILE+BLEED*2)**2),room=Math.min(12,capacity-visible.size);if(room<1)return;
    const vx=dx/distance,vy=dy/distance,lead=Math.min(TILE*1.25,Math.max(TILE*.55,distance/Math.max(.008,elapsed/1000)*.45));
    const left=view.camX-view.width/2,top=view.camY-view.height/2,right=left+view.width,bottom=top+view.height;
    const minX=Math.floor((left+Math.min(0,vx*lead))/TILE),maxX=Math.floor((right+Math.max(0,vx*lead))/TILE),minY=Math.floor((top+Math.min(0,vy*lead))/TILE),maxY=Math.floor((bottom+Math.max(0,vy*lead))/TILE),candidates=[];
    for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++){
      const key=this._key(layout,tx,ty);if(visible.has(key))continue;let enter=-Infinity,exit=Infinity;
      for(const [low,high,tileLow,velocity]of[[left,right,tx*TILE,vx],[top,bottom,ty*TILE,vy]]){
        if(Math.abs(velocity)<1e-6){if(tileLow+TILE<low||tileLow>high){exit=-Infinity;break;}continue;}
        const a=(tileLow-high)/velocity,b=(tileLow+TILE-low)/velocity;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
      }
      if(exit<Math.max(0,enter)||enter>lead)continue;
      candidates.push({tx,ty,key,enter,centerDistance:(tx*TILE+TILE/2-view.camX)**2+(ty*TILE+TILE/2-view.camY)**2});
    }
    candidates.sort((a,b)=>a.enter-b.enter||a.centerDistance-b.centerDistance);
    const ahead=candidates.slice(0,room),protectedKeys=new Set(visible);for(const tile of ahead)protectedKeys.add(tile.key);
    this.pending={layout,now,protectedKeys,tiles:ahead,visibleBuilds:this.groundStats.lastVisibleBuilds};
  }
  cancelGroundPreparation(){this.motion=null;this.pending=null;}
  // Called once after the rest of the scene has rendered, while the caller's
  // render/whole-frame CPU timers are still running. A tile is indivisible:
  // budgetMs is an admission budget, not a promise to interrupt canvas work.
  prepareGround({budgetMs=0,now=this.now()}={}){
    const pending=this.pending;this.pending=null;this.groundStats.lastPrefetchBuilds=0;this.groundStats.lastPrefetchMs=0;
    const idle={built:0,elapsedMs:0,overBudget:false};if(!pending||now-pending.now>120||now<pending.now||pending.visibleBuilds)return idle;
    const tile=pending.tiles.find(tile=>!this.cache.has(tile.key));if(!tile)return idle;
    const budget=Math.max(0,Math.min(3,Number(budgetMs)||0));if(budget<1){this.groundStats.budgetSkips++;return idle;}
    const began=this.now(),image=this._tile(pending.layout,tile.tx,tile.ty,pending.protectedKeys,true),elapsedMs=this.now()-began;if(!image)return idle;
    const overBudget=elapsedMs>budget,stats=this.groundStats;stats.prefetchBuilds++;stats.prefetchMs+=elapsedMs;stats.maxPrefetchMs=Math.max(stats.maxPrefetchMs,elapsedMs);stats.lastPrefetchBuilds=1;stats.lastPrefetchMs=elapsedMs;if(overBudget)stats.budgetOverruns++;
    return {built:1,elapsedMs,overBudget};
  }
  drawGround(c,island,{camX=0,camY=0,width=1100,height=700,prefetch=false}={}){
    const layout=island?.layout;this.pending=null;this.groundStats.lastVisibleBuilds=0;this.groundStats.lastPrefetchBuilds=0;this.groundStats.lastPrefetchMs=0;
    if(layout?.kind!=='rift-forest'){this.motion=null;return false;}
    const active=prefetch&&layout.artTheme==='city'&&layout.artStyle==='clockshadow-renewed',left=camX-width/2,top=camY-height/2,visible=new Set(),tiles=[];
    for(let ty=Math.floor(top/TILE);ty<=Math.floor((top+height)/TILE);ty++)for(let tx=Math.floor(left/TILE);tx<=Math.floor((left+width)/TILE);tx++){visible.add(this._key(layout,tx,ty));tiles.push({tx,ty});}
    const before=this.builds;c.save();for(const {tx,ty}of tiles){const image=this._tile(layout,tx,ty,visible);if(image.prefetched){image.prefetched=false;this.groundStats.prefetchHits++;}c.drawImage(image.canvas,BLEED,BLEED,TILE,TILE,tx*TILE-left,ty*TILE-top,TILE,TILE);}c.restore();
    this.groundStats.lastVisibleBuilds=this.builds-before;this.groundStats.visibleBuilds+=this.groundStats.lastVisibleBuilds;
    if(active)this._anticipate(layout,{camX,camY,width,height},visible,this.now());else this.motion=null;
    return true;
  }
}

// Dynamic doorway/shortcut state is deliberately separate from cached floor.
// Call from the existing world depth queue at the landmark's ground anchor.
export function drawRiftLandmark(c,site){
  if(site?.artTheme==='city')return drawCityLandmark(c,site);
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
function caveTile(variant,theme){const key=theme==='city'?`city:${variant}`:variant;let canvas=caveTiles.get(key);if(canvas)return canvas;canvas=document.createElement('canvas');canvas.width=canvas.height=384;const c=canvas.getContext('2d');if(theme==='city')paintCityGround(c,{variant,zone:1,size:384,road:true});else{c.fillStyle='#77725e';c.fillRect(0,0,384,384);for(let i=0;i<280;i++){const x=hash(i+variant*13,72)*384,y=hash(i+91,variant)*384,n=hash(i,variant+87);c.fillStyle=i%3?'#a49b7744':'#3e49413b';c.beginPath();c.ellipse(x,y,.7+n*3,.5+n*1.3,-.2,0,TAU);c.fill();if(i%17===0){strokeLine(c,x-5,y,x+7,y-2,'#a5a08160',1);strokeLine(c,x+7,y-2,x+12,y+2,'#4c554756',.8);}}}caveTiles.set(key,canvas);return canvas;}
export function drawRiftCaveGround(c,state,camX,camY,width,height){
  c.save();c.fillStyle='#26352f';c.fillRect(0,0,width,height);const b=state.bounds,left=camX-width/2,top=camY-height/2;if(!b){c.restore();return;}c.beginPath();c.rect(b.minX-left,b.minY-top,b.maxX-b.minX,b.maxY-b.minY);c.clip();for(let ty=Math.floor(Math.max(b.minY,top)/384);ty<=Math.floor(Math.min(b.maxY,top+height)/384);ty++)for(let tx=Math.floor(Math.max(b.minX,left)/384);tx<=Math.floor(Math.min(b.maxX,left+width)/384);tx++)c.drawImage(caveTile(Math.floor(hash(tx+7,ty)*4),state.artTheme),tx*384-left,ty*384-top);c.restore();
}
export function drawRiftCaveExits(c,state){
  for(const exit of state.riftExits||[]){c.save();c.translate(exit.x,exit.y);for(let i=0;i<5;i++){const y=-16+i*7,w=38+i*3;c.fillStyle=['#b2a68a','#a6997e','#9a9075','#89836c','#817e66'][i];c.fillRect(-w*.5,y,w,7);strokeLine(c,-w*.5,y+6,w*.5,y+6,'#4b5547',1);strokeLine(c,-w*.5,y,w*.5,y,'#d1c4a7',.8);}c.textAlign='center';c.font=`600 10px ${FONT}`;c.fillStyle='#e8dab3';c.lineWidth=3;c.strokeStyle='#27372e';c.strokeText(exit.name||'返回地面',0,38);c.fillText(exit.name||'返回地面',0,38);c.restore();}
}
export function drawRiftCaveWall(c,wall){
  const angle=wall.angle||0,half=wall.halfLength||0,r=wall.r||14,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half,nx=-Math.sin(angle)*r,ny=Math.cos(angle)*r,ax=wall.x-dx,ay=wall.y-dy,bx=wall.x+dx,by=wall.y+dy;
  if(wall.artTheme==='city'){const outline=[[-dx-nx,-dy-ny],[-dx+nx,-dy+ny],[dx+nx,dy+ny],[dx-nx,dy-ny]],upper=outline.map(([x,y])=>[x,y-32]);c.save();c.translate(wall.x,wall.y);paintCityWall(c,{outline,upper,height:32,variant:Math.floor(hash(wall.x,wall.y)*5)});c.restore();return;}
  c.save();c.lineCap='round';strokeLine(c,ax,ay,bx,by,'#3b453b',r*2+2);c.beginPath();c.moveTo(ax+nx,ay+ny);c.lineTo(bx+nx,by+ny);c.lineTo(bx+nx,by+ny-32);c.lineTo(ax+nx,ay+ny-32);c.closePath();c.fillStyle='#5c5d4e';c.fill();c.beginPath();c.moveTo(ax-nx,ay-ny);c.lineTo(bx-nx,by-ny);c.lineTo(bx-nx,by-ny-32);c.lineTo(ax-nx,ay-ny-32);c.closePath();c.fillStyle='#686658';c.fill();strokeLine(c,ax,ay-32,bx,by-32,'#9b927c',r*2);strokeLine(c,ax-nx*.5,ay-ny*.5-34,bx-nx*.5,by-ny*.5-34,'#b6aa8e',3);
  const len=half*2||1;for(let d=8;d<len;d+=23){const t=d/len,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,n=hash(d,wall.seed||0);strokeLine(c,x+nx*.7,y+ny*.7-29,x+nx*.8+3,y+ny*.8-6-n*8,'#424b3f88',1.2);strokeLine(c,x-nx*.6,y-ny*.6-33,x+nx*.5,y+ny*.5-34,'#d3c5a466',1);}c.restore();
}
