import { WorldArt } from '../world-art.js';
import { drawCityBridge } from '../city-structure-art.js';
import { drawCitySampleGround, drawCitySampleBlockedHouse } from './city-sample-ground.js';

// Floor tiles and the small map consume the baked union. Raised buildings are
// deliberately left to Terrain's shared depth queue, including roof fading.
export const CITY_PALETTE=Object.freeze({ground:'#969c86',street:'#a4aa96',grass:'#8caa70',forest:'#415b48',roof:'#547181',roofDark:'#344f5d',wall:'#acb09a',water:'#3b7988',waterLight:'#80aaa5'});
const TILE=256,FONT='"PingFang SC",system-ui,sans-serif';
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const xy=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
function trace(c,points,begin=true){if(begin)c.beginPath();points.forEach((p,i)=>{p=xy(p);c[i?'lineTo':'moveTo'](p.x,p.y);});c.closePath();}
function rings(c,items){c.beginPath();for(const item of items||[])trace(c,item.points||item,false);}
function lakePath(c,lake){trace(c,lake.points);for(const hole of lake.holes||[])trace(c,hole.points||hole,false);}
function bounds(points){return points.reduce((b,p)=>{p=xy(p);return{minX:Math.min(b.minX,p.x),minY:Math.min(b.minY,p.y),maxX:Math.max(b.maxX,p.x),maxY:Math.max(b.maxY,p.y)};},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
const overlaps=(a,b,pad=0)=>!b||a.maxX+pad>=b.minX&&a.minX-pad<=b.maxX&&a.maxY+pad>=b.minY&&a.minY-pad<=b.maxY;
const prepared=new WeakMap();
function records(layout){let data=prepared.get(layout);if(data)return data;data={lakes:(layout.lakes||[]).map(value=>({value,bounds:bounds(value.points)})),patches:(layout.patches||[]).map(value=>({value,bounds:bounds(value.points)})),bridges:(layout.passages||[]).filter(p=>p.kind==='bridge').map(value=>({value,bounds:bounds(value.points)})),structures:(layout.cityStructures||[]).map(value=>({value,bounds:{minX:value.x-value.width/2,minY:value.y-value.depth/2,maxX:value.x+value.width/2,maxY:value.y+value.depth/2}}))};prepared.set(layout,data);return data;}
function route(c,passage){const points=passage.waypoints||[];c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));}
function gardenFloor(c,layout,view,overview){
  for(const area of layout.areas||[]){if(!['02','13'].includes(area.id)||!overlaps(bounds(area.points),view))continue;
    c.save();trace(c,area.points);c.clip();c.fillStyle=area.id==='02'?'#96a47c':overview?'#98a784':'#90a17699';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
    if(!overview)for(let gy=Math.floor(view.minY/43);gy<=Math.floor(view.maxY/43);gy++)for(let gx=Math.floor(view.minX/47);gx<=Math.floor(view.maxX/47);gx++){const n=hash(gx+21,gy+17),x=(gx+n)*47,y=(gy+hash(gy,gx))*43;c.strokeStyle=n>.5?'#c3cd9a66':'#627f5655';c.lineWidth=1;c.beginPath();c.moveTo(x-2,y+2);c.lineTo(x,y-3);c.lineTo(x+1,y+2);c.moveTo(x+1,y);c.lineTo(x+5,y-2);c.stroke();}
    c.restore();
  }
}
function blockedMass(c,layout,view,overview,art){
  const p=CITY_PALETTE;c.fillStyle=p.forest;c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  // Unentered blocks are continuous masonry and overgrown ruins. Clip them to
  // the blocked complement; no painted house closes an authored street.
  c.save();c.beginPath();c.rect(view.minX-1,view.minY-1,view.maxX-view.minX+2,view.maxY-view.minY+2);for(const ring of layout.solidBoundaries||layout.boundaries)trace(c,ring.points||ring,false);c.clip('evenodd');
  for(let gy=Math.floor(view.minY/192)-1;gy<=Math.floor(view.maxY/192);gy++)for(let gx=Math.floor(view.minX/240)-1;gx<=Math.floor(view.maxX/240);gx++){
    const x=gx*240,y=gy*192,n=hash(gx+17,gy+91),urban=x>-5400&&x<5800&&y>-4900&&y<4100;
    if(urban){
      const inset=8+Math.floor(n*4)*3,w=240-inset*2;
      c.fillStyle=n>.5?'#7d8978':'#748371';c.fillRect(x,y,240,192);
      if(art){if(!drawCitySampleBlockedHouse(c,layout,x,y)){const house=art._building(Math.floor(n*5));c.drawImage(house.canvas,x+inset-9,y-22,258-inset*2,218);}}
      else{const yy=y+12+hash(gy+7,gx)*18,h=138+hash(gx+9,gy)*22;c.fillStyle=CITY_PALETTE.wall;c.fillRect(x+inset,yy,w,h+22);c.fillStyle=['#597784','#4c697a','#63808a','#55727d'][Math.floor(n*4)];c.beginPath();c.moveTo(x+inset,yy+18);c.lineTo(x+inset+12,yy);c.lineTo(x+inset+w-12,yy);c.lineTo(x+inset+w,yy+18);c.lineTo(x+inset+w,yy+h);c.lineTo(x+inset,yy+h);c.closePath();c.fill();c.strokeStyle=p.roofDark;c.lineWidth=3;c.stroke();c.strokeStyle='#b4c0b0';c.lineWidth=2;c.beginPath();c.moveTo(x+inset+12,yy+2);c.lineTo(x+inset+w-12,yy+2);c.stroke();}
    }else{
      c.fillStyle='#415f48';c.fillRect(x,y,240,192);
      if(art){for(let i=0;i<4;i++){const px=x+(i%2)*120+hash(gx+i,gy)*28,py=y+Math.floor(i/2)*96+hash(gy+i,gx)*26;const tree=art._tree('world-pine',Math.floor(hash(gx+7,gy+i)*5),true);c.drawImage(tree.canvas,px-31,py-62,145,145);}}
      else{for(let i=0;i<7;i++){const px=x+hash(gx+i*13,gy)*240,py=y+hash(gy+i*19,gx)*192;c.fillStyle=i%2?'#4c7151':'#567b52';c.beginPath();c.ellipse(px,py,52+hash(gx+i,7)*30,34+hash(gy+i,9)*24,-.3,0,Math.PI*2);c.fill();}}
    }
  }c.restore();
}
function water(c,layout,view,overview){for(const {value:lake,bounds:b}of records(layout).lakes){if(!overlaps(b,view,16))continue;lakePath(c,lake);c.fillStyle=CITY_PALETTE.water;c.fill('evenodd');c.save();lakePath(c,lake);c.clip('evenodd');c.strokeStyle='#a8bdaf55';c.lineWidth=overview?15:8;c.stroke();if(!overview){for(let y=Math.floor(view.minY/44)*44;y<view.maxY;y+=44)for(let x=Math.floor(view.minX/89)*89;x<view.maxX;x+=89){const n=hash(x,y);c.strokeStyle='#bdd4b83a';c.lineWidth=1;c.beginPath();c.moveTo(x+n*31,y);c.lineTo(x+19+n*31,y-1);c.stroke();}}c.restore();}}
function overviewRoof(c,s){const x=s.x-s.width/2,y=s.y-s.depth/2;if(s.solid){c.fillStyle=s.cityKind==='wall'||s.cityKind==='tower'?'#b8bca4':CITY_PALETTE.roof;c.fillRect(x,y,s.width,s.depth);c.strokeStyle='#334f53';c.lineWidth=10;c.strokeRect(x,y,s.width,s.depth);c.strokeStyle='#b6c8c0';c.lineWidth=5;c.beginPath();c.moveTo(x+4,y+4);c.lineTo(x+s.width-4,y+4);c.stroke();}else if(!['gate','arcade'].includes(s.cityKind)){c.fillStyle='#9b997a';c.fillRect(x,y,s.width,s.depth);}}

export class CityMapArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.ground=new WorldArt(makeCanvas);}
  get cacheStats(){return this.ground.cacheStats;}
  paintTile(c,layout,view){c.save();c.lineCap='round';c.lineJoin='round';blockedMass(c,layout,view,false,this.ground);water(c,layout,view,false);
    c.save();rings(c,layout.boundaries);c.clip('evenodd');
    for(let ty=Math.floor(view.minY/TILE);ty<=Math.floor(view.maxY/TILE);ty++)for(let tx=Math.floor(view.minX/TILE);tx<=Math.floor(view.maxX/TILE);tx++){const tile=this.ground._tile('city',Math.floor(hash(tx+41,ty+97)*3));c.drawImage(tile.canvas,tx*TILE,ty*TILE);}
    gardenFloor(c,layout,view,false);
    drawCitySampleGround(c,layout,view);
    for(const {value:patch,bounds:b}of records(layout).patches){if(!overlaps(b,view))continue;trace(c,patch.points);c.fillStyle='#8fa66d88';c.fill();}
    c.save();c.beginPath();for(const p of layout.passages||[]){if(p.from===p.to||p.kind==='secret'||p.kind==='cave')continue;route(c,p);c.lineWidth=Math.min(p.width*.7,150);c.strokeStyle=p.mainRoute?'#d1cbb042':'#a7b39138';c.stroke();}c.restore();
    c.restore();for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,12))drawCityBridge(c,p);c.restore();return true;
  }
}

export function drawCityOverview(c,layout,{scale=1,labels=false,landmarks=false,viewBounds}={}){
  if(layout?.artTheme!=='city')return false;const view=viewBounds||layout.bounds;c.save();c.lineJoin='round';c.lineCap='round';blockedMass(c,layout,view,true);water(c,layout,view,true);rings(c,layout.boundaries);c.fillStyle=CITY_PALETTE.ground;c.fill('evenodd');
  c.save();rings(c,layout.boundaries);c.clip('evenodd');gardenFloor(c,layout,view,true);for(const {value:p,bounds:b}of records(layout).patches)if(overlaps(b,view)){trace(c,p.points);c.fillStyle=CITY_PALETTE.grass;c.fill();}for(const p of layout.passages||[]){if(p.from===p.to)continue;route(c,p);c.strokeStyle=p.mainRoute?'#d4c78c':'#bcc3a3';c.lineWidth=Math.min(p.width*.5,100);c.stroke();}c.restore();
  for(const {value:s,bounds:b}of records(layout).structures)if(overlaps(b,view))overviewRoof(c,s);
  for(const {value:p,bounds:b}of records(layout).bridges)if(overlaps(b,view,12))drawCityBridge(c,p,{overview:true});
  if(landmarks){for(const [key,p]of Object.entries(layout.landmarks||{})){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const boss=/^boss/.test(key),cave=/^cave/.test(key),treasure=/^treasure/.test(key);if(!boss&&!cave&&!treasure)continue;c.fillStyle=boss?'#aa4d51':cave?'#776389':'#dfbe65';c.strokeStyle='#f3eacb';c.lineWidth=1/scale;c.beginPath();c.arc(p.x,p.y,(boss?6:4)/scale,0,Math.PI*2);c.fill();c.stroke();}}
  if(labels){c.font=`600 ${11/scale}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.lineWidth=3/scale;c.strokeStyle='#f2ebd1';c.fillStyle='#263e3d';for(const area of layout.areas||[]){const p=area.label||area.center;if(!overlaps({minX:p.x,minY:p.y,maxX:p.x,maxY:p.y},view))continue;const name=`${area.id} ${area.name}`;c.strokeText(name,p.x,p.y);c.fillText(name,p.x,p.y);}}
  c.restore();return true;
}
