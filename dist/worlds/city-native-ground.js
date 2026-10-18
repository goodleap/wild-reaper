// Small world-anchored slabs are rasterized by RiftArt's bounded floor cache.
// A world coordinate always receives the same stone, including across tiles.
export const CITY_NATIVE_GROUND_TILE=320;
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
export function drawCityNativeGround(c,layout,view){
  if(layout.worldId!=='clockshadow-city')return false;
  c.save();c.beginPath();c.rect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);c.clip();
  c.fillStyle='#d5ccb0';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  const width=41,height=27,colors=['#dcd3b7','#d9d0b4','#d8cfb3','#ded6ba','#d7ceb2'];
  for(let gy=Math.floor(view.minY/height)-1;gy<=Math.ceil(view.maxY/height);gy++)for(let gx=Math.floor(view.minX/width)-2;gx<=Math.ceil(view.maxX/width);gx++){
    const x=gx*width+(Math.abs(gy%2)?width/2:0),y=gy*height,n=hash(gx,gy);let area=null,best=Infinity;
    for(const a of layout.areas||[]){const d=(a.center.x-x)**2+(a.center.y-y)**2;if(d<best){best=d;area=a;}}
    const formal=['08','10','14'].includes(area?.id),pair=Math.floor(gx/2),wide=formal||hash(pair+97,gy+18)>.69;
    if(wide&&Math.abs(gx%2)===1)continue;
    const w=wide?width*2:width,j=.55+n*.25;
    c.beginPath();c.moveTo(x+j+2,y+j);c.lineTo(x+w-j-2,y+j);c.quadraticCurveTo(x+w-j,y+j,x+w-j,y+j+2);c.lineTo(x+w-j,y+height-j-2);c.quadraticCurveTo(x+w-j,y+height-j,x+w-j-2,y+height-j);c.lineTo(x+j,y+height-j);c.lineTo(x+j,y+j+2);c.closePath();c.fillStyle=colors[Math.floor(n*colors.length)];c.fill();
    c.strokeStyle='#f4e8c72c';c.lineWidth=.55;c.beginPath();c.moveTo(x+4,y+1.3);c.lineTo(x+w-5,y+1.3);c.stroke();
    if(n>.93){c.strokeStyle='#9da08432';c.lineWidth=.55;c.beginPath();c.moveTo(x+11,y+height-2);c.lineTo(x+13,y+height-7);c.lineTo(x+11,y+height-10);c.stroke();}
  }
  // Broad weathering crosses the slab grid in world space, never at a cached
  // tile border. It supplies dirt and age without increasing seam contrast.
  const step=210;
  for(let gy=Math.floor((view.minY-160)/step);gy<=Math.ceil((view.maxY+160)/step);gy++)for(let gx=Math.floor((view.minX-160)/step);gx<=Math.ceil((view.maxX+160)/step);gx++){
    const n=hash(gx+29,gy-17),x=(gx+.15+n*.7)*step,y=(gy+.1+hash(gy+53,gx)*.7)*step,r=85+n*63;
    const g=c.createRadialGradient(x,y,5,x,y,r);g.addColorStop(0,n>.55?'#c2bb9940':'#ebe0bd46');g.addColorStop(.5,n>.55?'#c2bb9920':'#ebe0bd22');g.addColorStop(1,'#d1c6a600');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  c.restore();return true;
}

export function drawCityNativeBridgeDeck(c,layout,passage,view){
  const deck=passage.deck||[];if(deck.length<2)return false;let drawn=false;
  for(let i=1;i<deck.length;i++){
    const a=deck[i-1],b=deck[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
    const nx=-dy/length*passage.width/2,ny=dx/length*passage.width/2;
    const points=[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
    const bounds={minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))};
    if(view&&(bounds.maxX<view.minX||bounds.minX>view.maxX||bounds.maxY<view.minY||bounds.minY>view.maxY))continue;
    const visible=view?{minX:Math.max(bounds.minX,view.minX),minY:Math.max(bounds.minY,view.minY),maxX:Math.min(bounds.maxX,view.maxX),maxY:Math.min(bounds.maxY,view.maxY)}:bounds;
    c.save();c.beginPath();points.forEach((p,index)=>c[index?'lineTo':'moveTo'](p.x,p.y));c.closePath();c.clip();drawCityNativeGround(c,layout,visible);c.restore();drawn=true;
  }return drawn;
}
