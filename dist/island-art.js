// Coast geometry comes from Islands: the surf marks the walkable outer edge,
// the inner 100 units are shallow water, and the next 35 units are dry beach.
// Textures are sampled only in visible world-space cells. No island bitmap.
const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const PALETTES={
  forest:{deep:'#193e48',sea:'#25535a',shallow:'#537e71',sand:'#97996d',grain:'#d8cc98',surf:'#c3dec8',path:'#9a9d70'},
  marsh:{deep:'#213e48',sea:'#30555a',shallow:'#57796b',sand:'#858e69',grain:'#bbc49a',surf:'#bfd6c0',path:'#99a684'},
  ruins:{deep:'#243e51',sea:'#345967',shallow:'#668a85',sand:'#aaa995',grain:'#d5d1b5',surf:'#d6e1d1',path:'#aaa797'},
};
export function traceIslandContour(ctx,points){ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](points[i].x,points[i].y);ctx.closePath();}
function fragments(points,spacing){const result=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);for(let t=0;t<length;t+=spacing)result.push({x:a.x+dx*t/length,y:a.y+dy*t/length,tx:dx/length,ty:dy/length,seed:i*719+Math.round(t)});}return result;}
function stroke(c,x,y,tx,ty,length,color,width=1){c.beginPath();c.moveTo(x,y);c.lineTo(x+tx*length,y+ty*length);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
export class IslandArt {
  constructor(){this.cache=new WeakMap();}
  _shape(island){let shape=this.cache.get(island);if(!shape){shape={outer:island.points,shallow:island.contour(island.shallowWidth||100),grass:island.contour((island.shallowWidth||100)+35),foam:fragments(island.contour(9),25),shore:fragments(island.contour((island.shallowWidth||100)-4),18),beach:fragments(island.contour((island.shallowWidth||100)+17),16),fringe:fragments(island.contour((island.shallowWidth||100)+35),9)};this.cache.set(island,shape);}return shape;}
  _routes(ctx,island,view,palette){
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(const route of island.routes||[]){if(Math.max(route.ax,route.bx)<view.minX-100||Math.min(route.ax,route.bx)>view.maxX+100||Math.max(route.ay,route.by)<view.minY-100||Math.min(route.ay,route.by)>view.maxY+100)continue;ctx.beginPath();ctx.moveTo(route.ax,route.ay);ctx.lineTo(route.bx,route.by);ctx.strokeStyle=palette.path;ctx.globalAlpha=.10;ctx.lineWidth=26;ctx.stroke();ctx.globalAlpha=.055;ctx.lineWidth=48;ctx.stroke();}ctx.restore();
  }
  draw(ctx,island,{camX=0,camY=0,width=1100,height=700,time=0,reduced=false,dense=false}={},drawLand=()=>{}){
    if(!island?.points?.length)return false;
    const shape=this._shape(island),palette=PALETTES[island.region]||PALETTES.forest,clock=reduced?0:time;
    const view={minX:camX-width/2,minY:camY-height/2,maxX:camX+width/2,maxY:camY+height/2};
    if(island.contains(camX,camY,Math.hypot(width/2,height/2)+135)){drawLand();ctx.save();ctx.translate(width/2-camX,height/2-camY);this._routes(ctx,island,view,palette);ctx.restore();return true;}
    ctx.save();ctx.translate(width/2-camX,height/2-camY);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.fillStyle=palette.deep;ctx.fillRect(view.minX,view.minY,width,height);
    // A translucent water shelf follows the exact playable outline. Deep sea
    // remains visibly darker without adding a hard UI-like boundary ring.
    traceIslandContour(ctx,shape.outer);ctx.fillStyle=palette.sea;ctx.fill();
    ctx.save();ctx.clip();const wash=ctx.createLinearGradient(island.bounds.minX,island.bounds.minY,island.bounds.maxX,island.bounds.maxY);wash.addColorStop(0,'#a4c2ad16');wash.addColorStop(1,'#203e4408');ctx.fillStyle=wash;ctx.fillRect(view.minX,view.minY,width,height);
    ctx.restore();
    // Paint only the visible coastal quads, with a continuous depth gradient.
    // Uniform nested color bands would look like parallel roads at this scale.
    for(let i=0;i<shape.outer.length;i++){const a=shape.outer[i],b=shape.outer[(i+1)%shape.outer.length],d=shape.shallow[i],e=shape.shallow[(i+1)%shape.shallow.length];if(Math.max(a.x,b.x,d.x,e.x)<view.minX-2||Math.min(a.x,b.x,d.x,e.x)>view.maxX+2||Math.max(a.y,b.y,d.y,e.y)<view.minY-2||Math.min(a.y,b.y,d.y,e.y)>view.maxY+2)continue;const gradient=ctx.createLinearGradient((a.x+b.x)*.5,(a.y+b.y)*.5,(d.x+e.x)*.5,(d.y+e.y)*.5);gradient.addColorStop(0,palette.sea);gradient.addColorStop(.46,palette.shallow);gradient.addColorStop(1,island.region==='marsh'?'#728c75':island.region==='ruins'?'#8aa399':'#779b85');ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(e.x,e.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();}
    // Subtle world-anchored sea ripples use simulation time: a paused game and
    // reduced-motion setting hold exactly the same shoreline and reflection.
    const cell=76;
    for(let gy=Math.floor(view.minY/cell)-1;gy<=Math.floor(view.maxY/cell);gy++)for(let gx=Math.floor(view.minX/cell)-1;gx<=Math.floor(view.maxX/cell);gx++){
      const seed=hash(gx+island.seed,gy),xx=gx*cell+seed*45,yy=gy*cell+hash(gy,gx+9)*63;
      if(island.isDry(xx,yy))continue;
      const phase=clock*.72+seed*TAU,span=10+seed*25,alpha=.045+(Math.sin(phase)+1)*.018;
      ctx.globalAlpha=alpha;stroke(ctx,xx,yy+Math.sin(phase)*1.2,1,-.025,span,'#d8edda',.8);stroke(ctx,xx+span*.2,yy+4,1,-.025,span*.43,'#101f30',1.1);ctx.globalAlpha=1;
    }
    traceIslandContour(ctx,shape.shallow);ctx.fillStyle=palette.sand;ctx.fill();
    // Paint the game's established ground within the dry interior. The beach
    // is an actual walkable strip, not a new collision outline made by art.
    ctx.save();traceIslandContour(ctx,shape.grass);ctx.clip();ctx.translate(camX-width/2,camY-height/2);drawLand();ctx.restore();
    ctx.save();traceIslandContour(ctx,shape.grass);ctx.clip();this._routes(ctx,island,view,palette);ctx.restore();
    // Small facets break up the land/beach transition. Their size is constant
    // in world pixels, so a large island does not acquire giant brush marks.
    for(let gy=Math.floor(view.minY/19);gy<=Math.floor(view.maxY/19);gy++)for(let gx=Math.floor(view.minX/19);gx<=Math.floor(view.maxX/19);gx++){
      const seed=hash(gx+17,gy+island.seed),xx=gx*19+seed*18,yy=gy*19+hash(gx-31,gy)*18;
      if(!island.contains(xx,yy,101)||island.contains(xx,yy,139))continue;
      ctx.fillStyle=palette.grain;ctx.globalAlpha=.3;ctx.fillRect(xx,yy,1.4+seed*2,.8);ctx.globalAlpha=.22;stroke(ctx,xx+5,yy+3,1,.18,3+seed*4,'#3d5049',.8);ctx.globalAlpha=1;
    }
    const visible=p=>p.x>=view.minX-35&&p.x<=view.maxX+35&&p.y>=view.minY-35&&p.y<=view.maxY+35;
    for(const p of shape.fringe){if(!visible(p))continue;const seed=hash(p.seed+27,island.seed),nx=-p.ty,ny=p.tx,xx=p.x-nx*(2+seed*5),yy=p.y-ny*(2+seed*5);ctx.save();ctx.globalAlpha=.5+seed*.3;ctx.beginPath();ctx.ellipse(xx,yy,3+seed*6,1.1+seed*2.4,Math.atan2(p.ty,p.tx),0,TAU);ctx.fillStyle=island.region==='marsh'?'#465846':island.region==='ruins'?'#626b57':'#415439';ctx.fill();stroke(ctx,xx,yy,p.tx,p.ty,2+seed*5,palette.grain,.5);ctx.restore();}
    for(const p of shape.beach){if(!visible(p))continue;const seed=hash(p.seed,island.seed);if(seed>.64)continue;ctx.globalAlpha=.14+seed*.2;stroke(ctx,p.x,p.y,p.tx,p.ty,3+seed*8,palette.grain,.7+seed*1.8);ctx.globalAlpha=1;}
    for(const [kind,points] of [[0,shape.foam],[1,shape.shore]])for(let i=0;i<points.length;i++){
      const p=points[i];if(!visible(p)||(dense&&i%2))continue;const seed=hash(p.seed+17,island.seed),phase=clock*.65+seed*TAU,drift=kind?Math.sin(phase)*2.8:Math.sin(phase)*1.2;
      const xx=p.x-p.ty*drift,yy=p.y+p.tx*drift;ctx.globalAlpha=(kind?.27:.17)+Math.sin(phase)*.055;stroke(ctx,xx,yy,p.tx,p.ty,5+seed*(kind?10:13),palette.surf,kind?1.25:.9);
      if(kind&&seed>.48){ctx.globalAlpha=.12;stroke(ctx,xx-p.ty*4,yy+p.tx*4,p.tx,p.ty,4+seed*7,palette.surf,.7);}ctx.globalAlpha=1;
    }
    ctx.restore();return true;
  }
}
