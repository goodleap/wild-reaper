import { REGIONS, worldForId } from './world-definitions.js';
import { biomeZone, CITY_BLOCK, CITY_STREET_HALF_WIDTH } from './biome-layout.js';
import { paintCityGround, paintCityHouse, paintCityWall } from './city-scenery-art.js';

// Theme artwork is generated once in bounded, world-independent sprite tiles.
// Raised artwork uses the same foot anchors and silhouettes as Terrain.
const TAU=Math.PI*2,TILE=256,PIXEL_LIMIT=3*1024*1024;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const rng=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const poly=(c,points,fill,edge=null,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const stroke=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fillStyle=color;c.fill();};
export const WORLD_ART_PALETTES=Object.freeze(Object.fromEntries(REGIONS.filter(world=>world.art.ground).map(world=>[world.id,world.art.ground])));
const forms=['world-palm','world-pine','world-snowpine','world-charred','world-reef','world-ice','world-basalt','world-building','world-city-wall','world-ridge','world-driftwood'];
function flake(c,x,y,size,color){stroke(c,[[x-size,y],[x+size,y]],color,.6);stroke(c,[[x,y-size*.5],[x,y+size*.5]],color,.6);}
function texturedFace(c,points,r,count,light,dark){c.save();poly(c,points,null);c.clip();for(let i=0;i<count;i++){const x=-100+r()*200,y=-150+r()*190;stroke(c,[[x,y],[x+1+r()*4,y-.5+r()]],i%3?dark:light,.5+r()*.7);}c.restore();}
function wood(c,points,color,r){poly(c,points,color,'#443e32',1);texturedFace(c,points,r,160,'#d0b68a70','#382f2870');}

export class WorldArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;}
  get cacheStats(){return{entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  _image(key,w,h,dpr,paint){let value=this.cache.get(key);if(value){this.cache.delete(key);this.cache.set(key,value);return value;}const canvas=this.makeCanvas();canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.lineCap='round';c.lineJoin='round';paint(c);value={canvas,w,h,pixels:canvas.width*canvas.height};while(this.pixels+value.pixels>PIXEL_LIMIT&&this.cache.size){const first=this.cache.keys().next().value;this.pixels-=this.cache.get(first).pixels;this.cache.delete(first);}this.cache.set(key,value);this.pixels+=value.pixels;this.builds++;return value;}
  _tile(region,v,zone=0,road=false){return this._image(`ground:${region}:${v}:${zone}:${road}`,TILE,TILE,1,c=>{
    if(region==='city'){paintCityGround(c,{variant:v,zone,size:TILE,road});return;}
    const p=WORLD_ART_PALETTES[region],r=rng(801+v*71+zone*313+Object.keys(WORLD_ART_PALETTES).indexOf(region)*191);
    c.fillStyle=p.floor;c.fillRect(0,0,TILE,TILE);
    if(region==='beach'){
      for(let i=0;i<11;i++){const x=r()*256,y=r()*256;c.beginPath();c.moveTo(x-40,y);c.bezierCurveTo(x-19,y-4,x+6,y+4,x+51,y-1);c.strokeStyle=i%2?'#e7d49e32':'#8c856620';c.lineWidth=.7+r()*1.6;c.stroke();}
      for(let i=0;i<7;i++){const x=9+r()*237,y=8+r()*240;if(i%3){oval(c,x,y,1.7+r()*2,.8+r(),i%2?'#ead9b3':'#948e70');}else{c.beginPath();c.moveTo(x-2,y);c.quadraticCurveTo(x-3,y-4,x,y-5);c.quadraticCurveTo(x+4,y-3,x+3,y);c.closePath();c.fillStyle='#ead9b8';c.fill();stroke(c,[[x,y-4],[x,y]],'#ae9a7780',.6);}}
    }else if(region==='snow'){
      for(let i=0;i<9;i++){const x=r()*256,y=r()*256;c.beginPath();c.moveTo(x-28,y);c.bezierCurveTo(x-12,y-6,x+19,y-6,x+41,y);c.strokeStyle=i%2?'#eff4e758':'#71999b23';c.lineWidth=1+r()*2;c.stroke();}
      for(let i=0;i<12;i++)flake(c,r()*256,r()*256,.5+r(),'#f3f7e679');
      if(zone===1)for(let i=0;i<6;i++){const x=r()*256,y=r()*256;stroke(c,[[x,y],[x+3,y-4],[x+8,y-5]],'#607f772c',.8);}
    }else if(region==='mountain'){
      for(let i=0;i<13;i++){const x=r()*256,y=r()*256;poly(c,[[x-7,y],[x-4,y-4],[x+5,y-5],[x+10,y],[x+4,y+3]],i%2?'#9ba59444':'#384f452c');stroke(c,[[x-4,y-4],[x+5,y-5]],'#c0c8b348',.8);}
      for(let i=0;i<9;i++){const x=r()*256,y=r()*256;stroke(c,[[x-7,y+2],[x+10,y-1],[x+19,y]],'#485c4e30',.8);}
    }else{
      for(let i=0;i<9;i++){const x=r()*256,y=r()*256;poly(c,[[x-22,y],[x-12,y-15],[x+11,y-13],[x+24,y+3],[x+4,y+16],[x-16,y+12]],i%2?'#4c4848':'#3a3b3e');stroke(c,[[x-22,y],[x-12,y-15],[x+11,y-13]],'#8775673a',.8);}
      for(let i=0;i<5;i++){const x=r()*256,y=r()*256;stroke(c,[[x-14,y],[x-3,y-5],[x+4,y-3],[x+14,y-8]],'#201f25a0',1.5);stroke(c,[[x-3,y-4],[x+3,y-2]],'#af725640',.65);}
    }
    for(let i=0;i<630;i++){const x=r()*256,y=r()*256;c.fillStyle=i%3?p.light+'17':p.dark+'2c';c.fillRect(x,y,.5+r()*1.5,.4+r()*.7);}
  });}
  drawGround(c,region,camX,camY,w,h,{seed=0}={}){
    if(worldForId(region).authored?.artTheme==='city')region='city';
    if(!WORLD_ART_PALETTES[region])return false;
    c.fillStyle=WORLD_ART_PALETTES[region].floor;c.fillRect(0,0,w,h);
    const ox=w*.5-camX,oy=h*.5-camY,minX=Math.floor(-ox/TILE),maxX=Math.ceil((w-ox)/TILE),minY=Math.floor(-oy/TILE),maxY=Math.ceil((h-oy)/TILE);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){const zone=biomeZone(region,(x+.5)*TILE,(y+.5)*TILE,seed).index||0,image=this._tile(region,Math.floor(hash(x+41,y+97)*3),zone);c.drawImage(image.canvas,x*TILE+ox,y*TILE+oy);}
    if(region==='city'){
      // Street edges are shared with Terrain, so the painted lanes are always clear.
      c.save();c.beginPath();for(let x=Math.floor((-ox-CITY_STREET_HALF_WIDTH)/CITY_BLOCK);x<=Math.ceil((w-ox+CITY_STREET_HALF_WIDTH)/CITY_BLOCK);x++)c.rect(x*CITY_BLOCK+ox-CITY_STREET_HALF_WIDTH,0,CITY_STREET_HALF_WIDTH*2,h);for(let y=Math.floor((-oy-CITY_STREET_HALF_WIDTH)/CITY_BLOCK);y<=Math.ceil((h-oy+CITY_STREET_HALF_WIDTH)/CITY_BLOCK);y++)c.rect(0,y*CITY_BLOCK+oy-CITY_STREET_HALF_WIDTH,w,CITY_STREET_HALF_WIDTH*2);c.clip();for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){const image=this._tile(region,Math.floor(hash(x+41,y+97)*3),0,true);c.drawImage(image.canvas,x*TILE+ox,y*TILE+oy);}c.restore();
    }
    return true;
  }
  _tree(kind,v,crown){return this._image(`tree:${kind}:${v}:${crown}`,184,184,2,c=>{
    c.translate(92,158);const r=rng(717+v*131),palm=kind==='world-palm',snow=kind==='world-snowpine',charred=kind==='world-charred';
    if(!crown){
      const points=palm?[[-10,4],[-4,-27],[2,-52],[1,-77],[12,-83],[14,-55],[7,-24],[9,5]]:[[-12,5],[-7,-18],[-6,-61],[1,-96],[7,-62],[7,-17],[13,6]];
      wood(c,points,charred?'#655c53':palm?'#9b8159':'#796e50',r);
      if(palm)for(let y=-8;y>-78;y-=9)stroke(c,[[y< -40?3:-4,y],[y< -40?12:9,y-2]],'#e0c48b9c',1.5);
      else{stroke(c,[[-2,0],[-1,-58],[2,-79]],charred?'#a4927060':'#bdad7880',1.5);stroke(c,[[6,-8],[4,-50]],'#3f45398c',1);}
      for(const side of [-1,1]){poly(c,[[side*4,-5],[side*18,6],[side*10,8],[side*2,3]],charred?'#4a4b46':'#79704f');stroke(c,[[side*7,0],[side*16,6]],'#baac7c60',.8);}return;
    }
    if(palm){
      const base=[10,-85];for(let i=0;i<9;i++){const angle=-Math.PI+.27+i*.38,extent=42+r()*18,dx=Math.cos(angle)*extent,dy=Math.sin(angle)*22+(i%2?7:-2),end=[base[0]+dx,base[1]+dy+12];
        c.beginPath();c.moveTo(...base);c.bezierCurveTo(base[0]+dx*.24,base[1]-15,base[0]+dx*.81,base[1]+dy-7,...end);c.bezierCurveTo(base[0]+dx*.59,base[1]+dy+4,base[0]+dx*.17,base[1]-3,...base);c.closePath();c.fillStyle=['#41654d','#58815a','#7a995f','#385b47'][i%4];c.fill();
        stroke(c,[base,[base[0]+dx*.48,base[1]+dy*.4-5],end],'#b3b97985',.85);
        for(let k=2;k<8;k++){const t=k/9,x=base[0]+dx*t,y=base[1]+dy*t-6*Math.sin(t*Math.PI);stroke(c,[[x,y],[x-dx*.075,y+5*(1-t)]],'#2b594b90',.7);}
      }oval(c,8,-82,4.3,4.6,'#8d7951');oval(c,15,-82,3.8,4.3,'#ad915c');oval(c,11,-85,2.4,2.8,'#c0a069');
    }else if(charred){
      const paths=[[[0,-55],[-15,-63],[-29,-78],[-38,-98]],[[2,-57],[18,-69],[31,-91]],[[0,-62],[-2,-88],[3,-112]],[[19,-71],[35,-73]],[[0,-87],[-15,-94],[-19,-104]]];for(let i=0;i<paths.length;i++){stroke(c,paths[i],'#30363a',i<3?7:4);stroke(c,paths[i],'#756b5f',i<3?4:2);stroke(c,paths[i].map(([x,y])=>[x-1,y-.5]),'#ab977567',.7);}for(const [x,y]of[[-29,-78],[20,-72],[-3,-88]]){stroke(c,[[x,y],[x+2,y-5]],'#b78a5c90',1);}
    }else{
      const width=42+(v%2)*3;
      for(let tier=0;tier<5;tier++){const y=-43-tier*17,ww=width-tier*7,points=[[0,y-36],[-ww*.38,y-21],[-ww*.3,y-15],[-ww*.79,y-6],[-ww*.69,y-2],[-ww,y+8],[-ww*.38,y+6],[-ww*.12,y+10],[ww*.17,y+6],[ww*.74,y+8],[ww*.64,y+1],[ww,y+4],[ww*.61,y-11],[ww*.36,y-15]];poly(c,points,['#294d43','#2c5749','#35614b','#3d6c4e','#467552'][tier],'#274c415e',.6);poly(c,[[0,y-34],[-ww*.36,y-19],[-ww*.28,y-13],[-ww*.78,y+5],[-ww*.35,y+2],[-ww*.1,y+7],[ww*.08,y+4]],'#7b936c4b');
        for(let j=0;j<10;j++){const x=(r()-.5)*ww*1.45,yy=y-7+r()*12;stroke(c,[[x,yy],[x-3,yy+2],[x+1,yy+1]],'#91aa7957',.75);}
        if(snow){poly(c,[[0,y-33],[-ww*.32,y-21],[-ww*.31,y-16],[-ww*.74,y-5],[-ww*.41,y-6],[-ww*.2,y-2],[0,y-7],[ww*.21,y-3],[ww*.48,y-6],[ww*.34,y-14]],'#d2e3da');stroke(c,[[-ww*.48,y-7],[-ww*.2,y-4],[0,y-9]],'#f5f4df',1.5);poly(c,[[-ww*.83,y+4],[-ww*.46,y+2],[-ww*.34,y+5],[-ww*.55,y+7]],'#b9d3cf');}
      }
    }
  });}
  _stone(kind,v,region){return this._image(`stone:${kind}:${v}:${region}`,108,150,2,c=>{
    c.translate(54,111);const r=rng(119+v*97),ice=kind==='world-ice',reef=kind==='world-reef',mountain=region==='mountain',h=[46,28,58,39,42][v%5],outline=[[-33,7],[-31,-h*.42],[-16,-h],[7,-h-6],[27,-h*.55],[35,5],[22,26],[-6,31]];
    const dark=ice?'#538d98':reef?(mountain?'#52675f':'#686e60'):'#32373b',mid=ice?'#85bec3':reef?(mountain?'#85948a':'#999c84'):'#555557',light=ice?'#d2e9de':reef?(mountain?'#bac5b3':'#cbc5a0'):'#858074';
    poly(c,outline,mid,dark,1.5);poly(c,[[-31,-h*.42],[-16,-h],[7,-h-6],[27,-h*.55],[4,-h*.32],[-9,-h*.5]],light);poly(c,[[4,-h*.32],[27,-h*.55],[35,5],[22,26],[3,26]],dark);poly(c,[[-31,-h*.42],[-9,-h*.5],[4,-h*.32],[3,26],[-6,31],[-33,7]],mid);texturedFace(c,outline,r,240,ice?'#edfff169':'#cfbf9636',ice?'#3f85932a':'#151f244a');stroke(c,[[-31,-h*.42],[-16,-h],[7,-h-6]],light,1.6);
    if(ice){poly(c,[[-16,-h+2],[-7,-h*.51],[-13,16],[-25,5]],'#ecffe738');stroke(c,[[7,-h-4],[4,-h*.35],[13,-1],[8,13]],'#e0faf1bb',1.15);stroke(c,[[4,-h*.35],[-5,-h*.3],[-9,-5]],'#d6f5e799',.8);}
    else if(reef&&!mountain){for(let i=0;i<12;i++){const x=-25+r()*46,y=-h*.4+r()*(h*.4+15);oval(c,x,y,1+r()*2,.7+r(),i%2?'#d5ceac75':'#5b70637c');}for(let i=0;i<5;i++){const x=-26+r()*49,y=18+r()*8;stroke(c,[[x,y],[x+2,y-4],[x+1,y-7]],'#526f5390',1.3);}}
    else{for(let i=0;i<3;i++){const x=-24+i*17;stroke(c,[[x,-h*.4],[x+3,-h*.25],[x+2,18]],'#272c31',1.4);stroke(c,[[x+1,-h*.4],[x+4,-h*.25]],'#b09d7650',.8);}if(v%2)stroke(c,[[-10,-8],[-3,-14],[3,-12]],'#9d674780',1);}
  });}
  _building(v){return this._image(`building:${v}`,218,190,2,c=>paintCityHouse(c,v));}
  _linear(kind,v,angle,halfLength,radius,region){
    const ridge=kind==='world-ridge',volcanic=region==='volcano',wall=kind==='world-city-wall',drift=kind==='world-driftwood',a=angle,l=halfLength,rr=radius;
    const dx=Math.cos(a)*l,dy=Math.sin(a)*l,height=drift?rr*.8:ridge?58:46,halfW=Math.abs(dx)+rr+8,above=Math.abs(dy)+rr+height+8,below=Math.abs(dy)+rr+8;
    return{angle:a,l,rr,anchor:{x:halfW,y:above},image:this._image(`linear:${kind}:${region}:${v}:${a.toFixed(4)}:${l.toFixed(3)}:${rr.toFixed(3)}`,Math.ceil(halfW*2),Math.ceil(above+below),2,c=>{
      c.translate(halfW,above);const random=rng(681+v*73),nx=-Math.sin(a)*rr,ny=Math.cos(a)*rr;
      if(drift){c.save();c.rotate(a);wood(c,[[-l-rr*.8,-rr*.5],[-l+10,-rr],[l,-rr*.8],[l+rr*.5,0],[l,rr*.7],[-l,rr*.6]],'#b8a27a',random);for(let y=-rr*.65;y<rr*.5;y+=rr*.3)stroke(c,[[-l+5,y],[-l*.25,y+2],[l-7,y-1]],'#675f4780',1);oval(c,-l,0,rr*.45,rr*.8,'#d4c297');for(let i=1;i<3;i++){c.beginPath();c.ellipse(-l,0,rr*.11*i,rr*.22*i,0,0,TAU);c.strokeStyle='#96825c';c.lineWidth=.7;c.stroke();}c.restore();return;}
      const outline=ridge?Array.from({length:10},(_,i)=>{const t=i*TAU/10,side=Math.cos(t)<0?-1:1;const along=side*l+Math.cos(t)*rr,across=Math.sin(t)*rr;return[along*Math.cos(a)-across*Math.sin(a),along*Math.sin(a)+across*Math.cos(a)];}):[[-dx-nx,-dy-ny],[-dx+nx,-dy+ny],[dx+nx,dy+ny],[dx-nx,dy-ny]],upper=outline.map(([x,y],i)=>[x,y-height*(ridge?.81+hash(i+v,37)*.18:1)]);
      if(wall&&(region==='city'||worldForId(region).authored?.artTheme==='city')){paintCityWall(c,{outline,upper,height,variant:v});return;}
      poly(c,outline,ridge?(volcanic?'#333337':'#47554f'):'#5e6758','#3f4b41',1.2);
      // Draw visible front faces in ground depth order; the height stays vertical.
      for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;if((outline[i][1]+outline[j][1])*.5<-.001)continue;const pts=[upper[i],upper[j],outline[j],outline[i]];poly(c,pts,ridge?(volcanic?['#51494a','#61544d','#474449'][i%3]:['#6b7971','#7d8d7f','#607367'][i%3]):'#94947c','#404e43',1);texturedFace(c,pts,random,180,'#c8cbb045','#2d3d3557');for(let y=12;y<height;y+=14)stroke(c,[[upper[i][0],upper[i][1]+y],[upper[j][0],upper[j][1]+y]],ridge?'#364a412b':'#4c5c4780',.85);}
      poly(c,upper,ridge?(volcanic?'#817464':'#a3afa0'):'#b6b398','#3d5144',1);stroke(c,[upper[0],upper[1],upper[2]],volcanic?'#c0a78085':'#d4d5bba0',1);if(ridge){for(let i=1;i<upper.length;i+=2){const a=upper[i],b=upper[(i+2)%upper.length];stroke(c,[a,[a[0]*.35,b[1]+5],b],volcanic?'#3e37388c':'#54705b75',1);}}
      for(let i=0;i<6;i++){const t=random(),x=-dx+dx*2*t,y=-dy+dy*2*t-height;stroke(c,[[x-rr*.5,y-2],[x+rr*.3,y+1]],'#465a454d',.75);}
    })};
  }
  drawProp(c,prop,{canopyAlpha=1}={}){
    const kind=prop?.variant;if(!forms.includes(kind))return false;const v=Number.isInteger(prop.treeForm)?prop.treeForm:Number.isInteger(prop.rockForm)?prop.rockForm:Math.floor((prop.seed||0)*5)%5;
    if(prop.type==='tree'){
      const s=prop.scale||1,trunk=this._tree(kind,v,false),crown=this._tree(kind,v,true);c.save();c.translate(prop.x,prop.y);c.scale(s,s);c.drawImage(trunk.canvas,-92,-158,184,184);c.globalAlpha*=Math.max(0,Math.min(1,canopyAlpha));c.drawImage(crown.canvas,-92,-158,184,184);c.restore();
    }else if(kind==='world-building'){
      const image=this._building(v),sx=((prop.halfLength||60)+(prop.r||30))/90,sy=(prop.r||30)/30;c.save();c.globalAlpha*=Math.max(0,Math.min(1,canopyAlpha));c.drawImage(image.canvas,prop.x-109*sx,prop.y-145*sy,image.w*sx,image.h*sy);c.restore();
    }else if(prop.type==='log'){
      const data=this._linear(kind,v,prop.angle||0,prop.halfLength||55,prop.r||16,prop.region),image=data.image;c.drawImage(image.canvas,prop.x-data.anchor.x,prop.y-data.anchor.y,image.w,image.h);
    }else{
      const image=this._stone(kind,v,prop.region),s=(prop.r||36)/36;c.drawImage(image.canvas,prop.x-54*s,prop.y-111*s,image.w*s,image.h*s);
    }return true;
  }
}
