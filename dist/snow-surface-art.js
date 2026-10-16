import { traceWaterPath } from './water-geometry.js';

// Shared snow artwork. The painters own no geometry, cache or simulation state;
// both the legacy snow region and authored snow worlds can reuse these surfaces.
export const SNOW_GROUND_COLOR='#dbe5e2';
export const SNOW_ICE_COLOR='#b5d4d7';
const TAU=Math.PI*2;
const random=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const stroke=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fillStyle=color;c.fill();};

function drift(c,x,y,length,height,color,width=1){
  c.beginPath();c.moveTo(x-length*.5,y+height*.35);c.bezierCurveTo(x-length*.2,y-height,x+length*.12,y-height*.6,x+length*.5,y);c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function softPatch(c,x,y,rx,ry,color,alpha){
  // Nested translucent ellipses also work in small fallback/mock canvases.
  // All layers fade inward rather than leaving a filled biome rectangle.
  c.save();c.globalAlpha*=alpha;
  for(let i=0;i<5;i++)oval(c,x,y,rx*(1-i*.13),ry*(1-i*.13),color,-.12);
  c.restore();
}

export function paintSnowGround(c,{variant=0,zone=0,size=256,surface='snow'}={}){
  c.save();c.beginPath();c.rect(0,0,size,size);c.clip();
  c.fillStyle=surface==='ice'?SNOW_ICE_COLOR:SNOW_GROUND_COLOR;c.fillRect(0,0,size,size);
  if(surface==='ice'){iceTexture(c,{minX:0,minY:0,maxX:size,maxY:size},Math.round(variant*193));c.restore();return;}
  const scale=size/256;
  c.scale(scale,scale);c.lineCap='round';c.lineJoin='round';
  // The same periodic microtexture crosses every tile edge, even when the
  // neighboring tile chooses another variant or biome. Only interior features
  // vary. Biome transitions therefore never expose a 256-unit color boundary.
  const grain=random(4289);
  for(let i=0;i<230;i++){
    const x=grain()*256,y=grain()*256,w=.4+grain()*1.2,h=.35+grain()*.55;
    c.fillStyle=i%4?'#f8f8ed24':'#6c8e9a13';
    for(const dx of [-256,0,256])for(const dy of [-256,0,256])c.fillRect(x+dx,y+dy,w,h);
  }
  const wind=random(791);
  for(let i=0;i<7;i++){
    const x=wind()*256,y=wind()*256,length=24+wind()*48,height=2+wind()*3;
    for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
      drift(c,x+dx,y+dy,length,height,'#7898a014',1.6);
      drift(c,x+dx,y+dy-1,length*.82,height,'#fffff32a',1.05);
    }
  }
  const r=random(8129+Math.trunc(variant)*193+Math.trunc(zone)*419),pine=zone===0,ice=zone===1,path=surface==='path';
  for(let i=0;i<4;i++){
    const x=70+r()*116,y=64+r()*128,rx=20+r()*31,ry=8+r()*13;
    softPatch(c,x,y,rx,ry,path?'#8eaaa9':pine?'#6f8990':ice?'#87b8c1':'#ffffff',path?.018:pine?.012:ice?.014:.025);
  }
  for(let i=0;i<(path?9:pine?8:ice?5:11);i++){
    const x=43+r()*170,y=39+r()*178,length=12+r()*34,height=1+r()*4;
    drift(c,x,y,length,height,path?'#819b9b28':ice?'#85aab91b':'#78959c20',.7+r()*.6);
    drift(c,x,y-1.3,length*.88,height,'#fffef152',.65+r()*.6);
    if(pine&&i%3===0)stroke(c,[[x-3,y+4],[x+2,y+3.4],[x+5,y+4]],'#65807834',.55);
  }
  c.restore();
}

function iceTexture(c,tile,seed){
  const cell=104,reach=86;
  for(let gy=Math.floor((tile.minY-reach)/cell);gy<=Math.floor((tile.maxY+reach)/cell);gy++)for(let gx=Math.floor((tile.minX-reach)/cell);gx<=Math.floor((tile.maxX+reach)/cell);gx++){
    const r=random(seed+gx*9277+gy*17491+137),x=gx*cell+12+r()*80,y=gy*cell+10+r()*82;
    // Long empty areas alternate with narrow branched pressure cracks. These
    // remain hairlines on walkable ice, visibly distinct from deep-water cuts.
    if(r()>.39){
      const a=-.65+r()*1.15,length=25+r()*49,dx=Math.cos(a)*length,dy=Math.sin(a)*length,bend=(r()-.5)*18;
      const points=[[x-dx*.54,y-dy*.54],[x-dx*.15,y-dy*.15+bend],[x+dx*.11,y+dy*.11+bend*.3],[x+dx*.5,y+dy*.5]];
      stroke(c,points,'#548b9d51',1.15);stroke(c,points.map(([xx,yy])=>[xx,yy-1]),'#f5fffa94',.75);
      if(r()>.36)stroke(c,[[x-dx*.15,y-dy*.15+bend],[x-dx*.13-6,y-dy*.15+bend-12],[x-dx*.13-2,y-dy*.15+bend-22]],'#5d93a044',.7);
      if(r()>.78)stroke(c,[[x+dx*.11,y+dy*.11+bend*.3],[x+dx*.11+8,y+dy*.11+bend*.3+10]],'#f2fff46e',.8);
    }
    if(r()>.48){drift(c,x-12,y+24,25+r()*26,2,'#e2f4ed35',1.5);drift(c,x+8,y+27,12+r()*22,2,'#4b849522',.7);}
    if(r()>.76){oval(c,x+6,y-6,6+r()*6,1.8+r()*2,'#edf8ef26',-.22);oval(c,x+13,y-2,1.4,1,'#edf8ef43');}
  }
}
// For authored polygon lakes, the caller clips its own exact walkable polygon
// and fills SNOW_ICE_COLOR once. This world-coordinate pass shares the same
// crack scale as legacy pools and remains continuous across cache tiles.
export function paintSnowIceTexture(c,tile,{seed=0}={}){
  c.save();c.lineCap='round';c.lineJoin='round';iceTexture(c,tile,Math.round(seed*1e6));c.restore();
}
function snowTexture(c,tile,seed){
  const cell=76,reach=54;
  for(let gy=Math.floor((tile.minY-reach)/cell);gy<=Math.floor((tile.maxY+reach)/cell);gy++)for(let gx=Math.floor((tile.minX-reach)/cell);gx<=Math.floor((tile.maxX+reach)/cell);gx++){
    const r=random(seed+gx*6971+gy*11287+617),x=gx*cell+12+r()*51,y=gy*cell+13+r()*47,length=25+r()*38;
    if(r()>.18){drift(c,x,y,length,3+r()*3,'#90aeb637',2+r()*1.4);drift(c,x,y-2,length*.9,3,'#ffffef97',1.3);}
    if(r()>.65)drift(c,x-10,y+10,length*.43,2,'#a1bac029',.8);
  }
}
function waterTexture(c,tile,seed,deep){
  const cell=64,reach=22;
  for(let gy=Math.floor((tile.minY-reach)/cell);gy<=Math.floor((tile.maxY+reach)/cell);gy++)for(let gx=Math.floor((tile.minX-reach)/cell);gx<=Math.floor((tile.maxX+reach)/cell);gx++){
    const r=random(seed+gx*9277+gy*17491+419),x=gx*cell+r()*cell,y=gy*cell+r()*cell;
    if(r()>.31){stroke(c,[[x-12,y],[x-4,y-.8],[x+6,y-.2],[x+14,y-1]],deep?'#b5d7db28':'#e7f9ec42',.7);stroke(c,[[x-2,y+5],[x+10,y+4.4]],'#102e421b',.65);}
    for(let i=0;i<5;i++){const xx=gx*cell+r()*cell,yy=gy*cell+r()*cell;c.fillStyle=i%2?'#d2eee61b':'#112d3f17';c.fillRect(xx,yy,.55+r()*1.3,.4+r()*.7);}
  }
}

export function paintSnowSurface(c,shape,tile){
  const {local,b,shore}=shape,ice=local.kind==='ice',snow=local.kind==='snow',deep=local.deep===true,seed=Math.round((local.seed||0)*1e6);
  c.save();c.lineCap='round';c.lineJoin='round';
  traceWaterPath(c,local,{local:true});c.lineWidth=deep?18:snow?10:12;c.strokeStyle=deep?'#526f7a73':snow?'#9cb6bd37':'#829fa957';c.stroke();
  c.lineWidth=deep?7:snow?4:5;c.strokeStyle=deep?'#d8e5df':snow?'#edf0e3':'#e8eee2';c.stroke();
  const fill=c.createLinearGradient(b.minX,b.minY,b.maxX,b.maxY);
  const colors=snow?['#e4ebe0','#d4e1dd','#bfd1d2']:ice?['#c9e1df','#a5cbd1','#bad8d8']:deep?['#365b6c','#1b3748','#294e60']:['#9cc6ce','#689da9','#8dbac1'];
  colors.forEach((color,i)=>fill.addColorStop(i*.5,color));
  traceWaterPath(c,local,{local:true});c.fillStyle=fill;c.fill();c.save();c.clip();
  // This is the exact gameplay contour, including its counter-wound holes.
  // Inner sediment/ice bands are clipped; no second visual-only shoreline.
  c.lineWidth=ice?8:snow?10:deep?10:7;c.strokeStyle=ice?'#f3f5e96b':snow?'#afc5cb25':deep?'#7eacb341':'#b5d8d35a';c.stroke();
  if(ice)iceTexture(c,tile,seed);else if(snow)snowTexture(c,tile,seed);else waterTexture(c,tile,seed,deep);
  c.restore();
  // A few broken snow lips soften the bank. Their projection stays within the
  // existing WaterArt cull pad and is decoration, never additional collision.
  for(let i=0;i<shore.length;i++){
    const p=shore[i];if(p.x<tile.minX-20||p.x>tile.maxX+20||p.y<tile.minY-20||p.y>tile.maxY+20)continue;
    const r=random(seed+i*191+319),angle=Math.atan2(p.ny,p.nx)+Math.PI*.5;
    if(r()>.77){
      const x=p.x+p.nx*2,y=p.y+p.ny*2,rx=7+r()*10,ry=1.1+r()*1.8;
      oval(c,x+.5,y+1.1,rx+1,ry+.8,'#6888942b',angle);oval(c,x,y,rx,ry,'#e5ece1d9',angle);oval(c,x-.5,y-.7,rx*.72,ry*.45,'#fcfbeeae',angle);
    }
    if(!snow&&i%5===1){const xx=p.x-p.nx*1.5,yy=p.y-p.ny*1.5;stroke(c,[[xx-3,yy],[xx+2,yy-.8],[xx+5,yy]],ice?'#ecf7ec89':'#b5d4d47a',.8);}
  }
  c.restore();
}
