import { ENEMY_ART } from './enemy-art/registry.js';
import { ENEMY_VISUALS, enemyArtId } from './enemy-visuals.js';
import { clamp } from './enemy-art/drawing.js';
import { enemyAnimationPose, sampleEnemyPose } from './enemy-animation.js';

// Includes every recurring gait of four bosses and ten specialist species,
// including the sixteen-frame ape and the higher-resolution deer texture.
const PIXEL_LIMIT=7*1024*1024/4;
// A bounded shared sprite cache. Species painting, poses and overlays live in
// their own modules and have no access to simulation state or randomness.
export class MonsterArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.beetleFacing=new WeakMap();this.lastPoses=new WeakMap();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _sprite(kind,pose,hit,flip,animation){
    // Animated bodies share canonical facing and use the existing runtime hit
    // recoil/impact feedback instead of multiplying every pose by hit/facing.
    const key=animation?`${kind}:${animation.key}`:`${kind}:${pose}:${hit?1:0}:${flip}`;let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const visual=ENEMY_VISUALS[kind],[w,h,ox,oy]=visual.box,canvas=this.makeCanvas();
    // Large animated bodies have many poses; use a bounded backing resolution
    // so several concurrent encounters fit beside the ordinary-enemy cache.
    const ratio=visual.cacheRatio??(animation?(w>=124?1:1.5):2);
    canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);
    const c=canvas.getContext('2d');c.scale(ratio,ratio);c.translate(ox,oy);c.lineJoin='round';c.lineCap='round';
    const phase=visual.frames===1?0:pose/(visual.frames-1)*2-1;
    ENEMY_ART[kind].paint(c,animation?Math.sin(animation.cycle):phase,animation?1:flip,animation);
    if(hit&&!animation){c.globalCompositeOperation='source-atop';c.globalAlpha=.43;c.fillStyle='#fff5d5';c.fillRect(-ox,-oy,w,h);c.globalCompositeOperation='source-over';c.globalAlpha=1;}
    image={canvas,w,h,ox,oy,pixels:canvas.width*canvas.height};
    while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}
    this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;
  }
  draw(c,e,{time=0,reduced=false,dense=false,frozen=false,playerX=e.x+1}={}){
    const kind=enemyArtId(e),art=ENEMY_ART[kind],visual=ENEMY_VISUALS[kind];if(!art||!visual)return false;
    // An atlas-backed painter must never leave an empty body in the shared
    // pose cache while its single image is still loading.
    if(art.ready&&!art.ready())return false;
    if(art.animated){
      const prior=this.lastPoses.get(e),sharedPose=art.samplePose?.(e,{time,reduced,frozen});
      const animation=sharedPose??(frozen&&prior?prior.animation:sampleEnemyPose(enemyAnimationPose(e,{time,reduced})));
      const flip=sharedPose?art.facing?.(e,{playerX,facings:this.beetleFacing,frozen})??1:
        frozen&&prior?prior.flip:art.facing?.(e,{playerX,facings:this.beetleFacing})??1;
      const paintTime=frozen&&prior?prior.time:time;
      this.lastPoses.set(e,{animation,flip,time:paintTime});
      const image=this._sprite(kind,0,false,1,animation);
      c.save();if(flip<0)c.scale(-1,1);c.drawImage(image.canvas,-image.ox,-image.oy,image.w,image.h);c.restore();
      art.overlay?.(c,e,{flip,time:paintTime,reduced,dense,frozen,pose:animation});return true;
    }
    const n=visual.frames,still=reduced||art.isStill?.(e),wave=still?0:art.poseWave?art.poseWave(e):Math.sin(time*(art.frequency??10)+(e.id||0));
    const pose=n===1?0:clamp(Math.round((wave+1)*(n-1)*.5),0,n-1),flip=art.facing?.(e,{playerX,facings:this.beetleFacing})??1,image=this._sprite(kind,pose,e.hit>0,flip);
    c.drawImage(image.canvas,-image.ox,-image.oy,image.w,image.h);
    art.overlay?.(c,e,{flip,time,reduced,dense});return true;
  }
  drawTelegraph(ctx,entity,options){ENEMY_ART[enemyArtId(entity)]?.telegraph?.(ctx,entity,options);}
}
