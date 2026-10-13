const SPACING=1080,SEARCH_MARGIN=850,BASE_SCALE=.5,PADDING=2,PIXEL_LIMIT=4_194_304;
export const MAP_SUN_ANGLE=Math.atan2(325,840);
export const MAP_SUN_DIRECTION=Object.freeze({x:-Math.sin(MAP_SUN_ANGLE),y:Math.cos(MAP_SUN_ANGLE)});
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};

// Geometry is world-fixed. Bounds include both the long beam and its ground
// glow, so a light whose origin is offscreen may still contribute to the view.
export function mapLightPatch(gx,gy){
  const seed=hash(gx+51,gy+93),spread=80+seed*65;
  const x=gx*SPACING+160+hash(gx+7,gy+16)*460+165+spread*.24;
  const y=gy*SPACING+100+hash(gx+34,gy+2)*400-520;
  const endX=x+MAP_SUN_DIRECTION.x/MAP_SUN_DIRECTION.y*840,endY=y+840;
  const nearWidth=spread*.24,farWidth=spread*.65,nx=MAP_SUN_DIRECTION.y,ny=-MAP_SUN_DIRECTION.x;
  const points=[[x-nx*nearWidth,y-ny*nearWidth],[x+nx*nearWidth,y+ny*nearWidth],
    [endX+nx*farWidth,endY+ny*farWidth],[endX-nx*farWidth,endY-ny*farWidth]];
  const glowX=x+(endX-x)*.8,glowY=y+(endY-y)*.8;
  const minX=Math.min(glowX-330,...points.map(p=>p[0])),minY=Math.min(glowY-330,...points.map(p=>p[1]));
  const maxX=Math.max(glowX+330,...points.map(p=>p[0])),maxY=Math.max(glowY+330,...points.map(p=>p[1]));
  return {id:`${gx},${gy}`,x,y,endX,endY,glowX,glowY,alpha:.04+seed*.025,points,minX,minY,maxX,maxY};
}

function spriteBounds(patch,scale){
  const left=Math.floor(patch.minX*scale)-PADDING,top=Math.floor(patch.minY*scale)-PADDING;
  const width=Math.ceil(patch.maxX*scale)+PADDING-left,height=Math.ceil(patch.maxY*scale)+PADDING-top;
  return {x:left/scale,y:top/scale,width,height,pixels:width*height};
}

function paintPatch(target,patch){
  const {x,y,endX,endY,glowX,glowY,alpha,points}=patch;
  const glow=target.createRadialGradient(glowX,glowY,0,glowX,glowY,330);
  glow.addColorStop(0,'#c7d98a12');glow.addColorStop(1,'transparent');
  target.fillStyle=glow;target.fillRect(glowX-330,glowY-330,660,660);
  const beam=target.createLinearGradient(x,y,endX,endY);
  beam.addColorStop(0,'#e3ebaf00');beam.addColorStop(.23,`rgba(225,237,172,${alpha})`);
  beam.addColorStop(.8,`rgba(225,237,172,${alpha*.72})`);beam.addColorStop(1,'#e3ebaf00');
  target.fillStyle=beam;target.beginPath();target.moveTo(...points[0]);
  for(let i=1;i<points.length;i++)target.lineTo(...points[i]);
  target.closePath();target.fill();
}

export class MapLightCache {
  constructor(makeCanvas=()=>document.createElement('canvas')){
    this.makeCanvas=makeCanvas;this.cache=new Map();this.geometry=new Map();this.pixels=0;this.builds=0;
    this.scale=BASE_SCALE;this.viewKey='';
  }
  get cacheStats(){return {entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,
    limitBytes:PIXEL_LIMIT*4,builds:this.builds,scale:this.scale};}
  clear(){
    for(const entry of this.cache.values()){entry.canvas.width=0;entry.canvas.height=0;}
    this.cache.clear();this.geometry.clear();this.pixels=0;this.scale=BASE_SCALE;this.viewKey='';
  }
  _geometry(gx,gy){
    const key=`${gx},${gy}`;let patch=this.geometry.get(key);
    if(patch){this.geometry.delete(key);this.geometry.set(key,patch);return patch;}
    patch=mapLightPatch(gx,gy);
    if(this.geometry.size>=256)this.geometry.delete(this.geometry.keys().next().value);
    this.geometry.set(key,patch);return patch;
  }
  _image(patch,scale){
    const key=`${scale}:${patch.id}`;let entry=this.cache.get(key);
    if(entry){this.cache.delete(key);this.cache.set(key,entry);return entry;}
    const bounds=spriteBounds(patch,scale);
    while(this.pixels+bounds.pixels>PIXEL_LIMIT&&this.cache.size){
      const oldest=this.cache.keys().next().value,old=this.cache.get(oldest);
      this.pixels-=old.pixels;this.cache.delete(oldest);old.canvas.width=0;old.canvas.height=0;
    }
    const canvas=this.makeCanvas();canvas.width=bounds.width;canvas.height=bounds.height;
    const target=canvas.getContext('2d');target.setTransform(scale,0,0,scale,-bounds.x*scale,-bounds.y*scale);
    paintPatch(target,patch);
    entry={...bounds,canvas,scale};this.cache.set(key,entry);this.pixels+=entry.pixels;this.builds++;
    return entry;
  }
  draw(target,{camX,camY,width,height}){
    if(![camX,camY,width,height].every(Number.isFinite)||width<=0||height<=0)return;
    const left=camX-width/2,top=camY-height/2,right=left+width,bottom=top+height,visible=[];
    const firstX=Math.floor((left-SEARCH_MARGIN)/SPACING),lastX=Math.ceil((right+SEARCH_MARGIN)/SPACING);
    const firstY=Math.floor((top-SEARCH_MARGIN)/SPACING),lastY=Math.ceil((bottom+SEARCH_MARGIN)/SPACING);
    // Retain the original x-then-y paint order for overlapping light patches.
    for(let gx=firstX;gx<=lastX;gx++)for(let gy=firstY;gy<=lastY;gy++){
      const patch=this._geometry(gx,gy);
      if(patch.maxX<left||patch.minX>right||patch.maxY<top||patch.minY>bottom)continue;
      visible.push(patch);
    }
    const viewKey=`${width}:${height}`;
    if(viewKey!==this.viewKey){this.viewKey=viewKey;this.scale=BASE_SCALE;}
    // An unusually large desktop must not evict its own visible sprites every
    // frame. Step down only when necessary, then hold until a viewport change.
    while(visible.reduce((sum,patch)=>sum+spriteBounds(patch,this.scale).pixels,0)>PIXEL_LIMIT){
      this.scale*=.5;
    }
    // Touch all visible resident images first, keeping offscreen entries at
    // the front of the LRU while new visible images are constructed.
    for(const patch of visible){const key=`${this.scale}:${patch.id}`,entry=this.cache.get(key);
      if(entry){this.cache.delete(key);this.cache.set(key,entry);}}
    target.save();target.imageSmoothingEnabled=true;target.imageSmoothingQuality='low';
    for(const patch of visible){
      const entry=this._image(patch,this.scale),scale=entry.scale;
      const x=Math.max(left,entry.x),y=Math.max(top,entry.y);
      const endX=Math.min(right,entry.x+entry.width/scale),endY=Math.min(bottom,entry.y+entry.height/scale);
      if(endX<=x||endY<=y)continue;
      target.drawImage(entry.canvas,(x-entry.x)*scale,(y-entry.y)*scale,(endX-x)*scale,(endY-y)*scale,
        x-left,y-top,endX-x,endY-y);
    }
    target.restore();
  }
}
