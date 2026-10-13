import { ShadowTileCache } from './shadow-tile-cache.js';

const RESOLUTION=.5,TAU=Math.PI*2;
// Keep the raster grid fixed in world space; only the final source crop moves
// fractionally with the camera. Tile edges then meet on exact buffer pixels.
export function shadowFrameBounds(width,height,offsetX,offsetY){
  const minX=Math.floor(-offsetX*RESOLUTION)/RESOLUTION-2;
  const minY=Math.floor(-offsetY*RESOLUTION)/RESOLUTION-2;
  const pixelWidth=Math.ceil(width*RESOLUTION)+4,pixelHeight=Math.ceil(height*RESOLUTION)+4;
  return {minX,minY,maxX:minX+pixelWidth/RESOLUTION,maxY:minY+pixelHeight/RESOLUTION,pixelWidth,pixelHeight,
    sourceX:(-offsetX-minX)*RESOLUTION,sourceY:(-offsetY-minY)*RESOLUTION};
}

export class ShadowGeometryCache{
  constructor(limit=512){this.limit=limit;this.entries=new Map();this.scene=null;}
  clear(){this.entries.clear();this.scene=null;}
  setScene(scene){if(this.scene!==scene){this.clear();this.scene=scene;}}
  get(key,signature,append){
    let entry=this.entries.get(key);
    if(entry?.signature===signature){this.entries.delete(key);this.entries.set(key,entry);return entry;}
    const commands=[],bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    const point=(x,y)=>{bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);};
    const target={
      moveTo(x,y){commands.push(['moveTo',x,y]);point(x,y);},
      lineTo(x,y){commands.push(['lineTo',x,y]);point(x,y);},
      closePath(){commands.push(['closePath']);},
      arc(x,y,r,start,end,ccw=false){commands.push(['arc',x,y,r,start,end,ccw]);point(x-r,y-r);point(x+r,y+r);},
      ellipse(x,y,rx,ry,angle,start,end){commands.push(['ellipse',x,y,rx,ry,angle,start,end]);const c=Math.cos(angle),s=Math.sin(angle),ex=Math.hypot(rx*c,ry*s),ey=Math.hypot(rx*s,ry*c);point(x-ex,y-ey);point(x+ex,y+ey);}
    };
    append(target);
    entry={key,signature,bounds,empty:!commands.length,drawPath(ctx){for(const [method,...args]of commands)ctx[method](...args);}};
    this.entries.delete(key);this.entries.set(key,entry);
    while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);
    return entry;
  }
}

function appendEllipses(ctx,shapes,flying,pixelBounds=null){
  const scale=pixelBounds?RESOLUTION:1,originX=pixelBounds?.minX||0,originY=pixelBounds?.minY||0;
  for(const s of shapes){
    if(flying!==undefined&&s.flying!==flying)continue;
    const x=(s.x-originX)*scale,y=(s.y-originY)*scale,rx=s.rx*scale,ry=s.ry*scale;
    ctx.moveTo(x+rx*Math.cos(s.angle),y+rx*Math.sin(s.angle));ctx.ellipse(x,y,rx,ry,s.angle,0,TAU);ctx.closePath();
  }
}

export class ShadowRenderer{
  constructor(makeCanvas){
    this.mask=makeCanvas();this.maskCtx=this.mask.getContext('2d');
    this.light=makeCanvas();this.lightCtx=this.light.getContext('2d');
    this.staticCache=new ShadowTileCache(makeCanvas);
  }
  clear(){this.staticCache.clear();}
  draw(ctx,{width,height,scaleX=1,scaleY=1,offsetX=0,offsetY=0,actors=[],staticShapes=[],sceneKey=null,decorativeShapes=[],drawLight=null}){
    if(width<=0||height<=0)return;
    const b=shadowFrameBounds(width,height,offsetX,offsetY),w=b.pixelWidth,h=b.pixelHeight;
    const reset=(canvas,target)=>{
      if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
      target.setTransform(1,0,0,1,0,0);target.globalCompositeOperation='source-over';target.globalAlpha=1;target.clearRect(0,0,w,h);
      target.fillStyle='#10271d';target.imageSmoothingEnabled=false;
    };
    const world=target=>target.setTransform(RESOLUTION,0,0,RESOLUTION,-b.minX*RESOLUTION,-b.minY*RESOLUTION);
    const mask=this.maskCtx;reset(this.mask,mask);world(mask);
    this.staticCache.draw(mask,b,staticShapes,sceneKey);
    mask.beginPath();appendEllipses(mask,actors,false);mask.fill('nonzero');
    const flying=actors.some(actor=>actor.flying);
    let output=this.mask,opacity=.3;
    if(drawLight){
      const light=this.lightCtx;reset(this.light,light);
      light.setTransform(RESOLUTION,0,0,RESOLUTION,0,0);
      drawLight(light,{camX:(b.minX+b.maxX)/2,camY:(b.minY+b.maxY)/2,width:w/RESOLUTION,height:h/RESOLUTION});
      light.setTransform(1,0,0,1,0,0);light.globalAlpha=1;light.fillStyle='#10271d';light.globalCompositeOperation='destination-out';light.drawImage(this.mask,0,0);
      if(flying||decorativeShapes.length){
        // Erase in buffer coordinates, matching the ground-mask copy above.
        // Some raster backends misclip destructive fills under a scaled CTM.
        light.beginPath();appendEllipses(light,actors,true,b);appendEllipses(light,decorativeShapes,undefined,b);light.fill('nonzero');
      }
      light.globalCompositeOperation='source-over';
      output=this.light;opacity=1;
    }
    // Drawing lighter flying shadows behind opaque ground coverage gives the
    // same union as the previous flying-first / grounded-last mask.
    if(flying){world(mask);mask.globalCompositeOperation='destination-over';mask.globalAlpha=.55;mask.beginPath();appendEllipses(mask,actors,true);mask.fill('nonzero');mask.globalAlpha=1;mask.globalCompositeOperation='source-over';}
    if(drawLight){const light=this.lightCtx;light.setTransform(1,0,0,1,0,0);light.globalAlpha=.3;light.drawImage(this.mask,0,0);light.globalAlpha=1;}
    ctx.save();ctx.setTransform(scaleX,0,0,scaleY,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=opacity;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
    ctx.drawImage(output,b.sourceX,b.sourceY,width*RESOLUTION,height*RESOLUTION,0,0,width,height);ctx.restore();
  }
}
