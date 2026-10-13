import { ENEMY_ART } from './enemy-art/registry.js';
import { ENEMY_VISUALS, enemyArtId } from './enemy-visuals.js';
import { clamp } from './enemy-art/drawing.js';

const PIXEL_LIMIT=6*1024*1024/4;
// A bounded shared sprite cache. Species painting, poses and overlays live in
// their own modules and have no access to simulation state or randomness.
export class MonsterArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.beetleFacing=new WeakMap();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _sprite(kind,pose,hit,flip){
    const key=`${kind}:${pose}:${hit?1:0}:${flip}`;let image=this.cache.get(key);if(image)return image;
    const visual=ENEMY_VISUALS[kind],[w,h,ox,oy]=visual.box,canvas=this.makeCanvas();canvas.width=w*2;canvas.height=h*2;
    const c=canvas.getContext('2d');c.scale(2,2);c.translate(ox,oy);c.lineJoin='round';c.lineCap='round';
    const phase=visual.frames===1?0:pose/(visual.frames-1)*2-1;
    ENEMY_ART[kind].paint(c,phase,flip);
    if(hit){c.globalCompositeOperation='source-atop';c.globalAlpha=.43;c.fillStyle='#fff5d5';c.fillRect(-ox,-oy,w,h);c.globalCompositeOperation='source-over';c.globalAlpha=1;}
    image={canvas,w,h,ox,oy,pixels:canvas.width*canvas.height};
    while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}
    this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  draw(c,e,{time=0,reduced=false,dense=false,playerX=e.x+1}={}){
    const kind=enemyArtId(e),art=ENEMY_ART[kind],visual=ENEMY_VISUALS[kind];if(!art||!visual)return false;
    const n=visual.frames,still=reduced||art.isStill?.(e),wave=still?0:art.poseWave?art.poseWave(e):Math.sin(time*(art.frequency??10)+(e.id||0));
    const pose=n===1?0:clamp(Math.round((wave+1)*(n-1)*.5),0,n-1),flip=art.facing?.(e,{playerX,facings:this.beetleFacing})??1,image=this._sprite(kind,pose,e.hit>0,flip);
    c.drawImage(image.canvas,-image.ox,-image.oy,image.w,image.h);
    art.overlay?.(c,e,{flip,time,reduced,dense});return true;
  }
  drawTelegraph(ctx,entity,options){ENEMY_ART[enemyArtId(entity)]?.telegraph?.(ctx,entity,options);}
}
