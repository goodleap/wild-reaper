import { COAST_RULES } from './placement-rules.js';
// Coast geometry comes from Islands: depth colors mark the walkable edge,
// shallow water and the wider dry beach share the placement-rule widths.
// Textures are sampled only in visible world-space cells. No island bitmap.
const TAU=Math.PI*2;
// 304 aligns both sample grids; 256 chunks retain a 4K viewport's working set.
const DETAIL_CHUNK=304,DETAIL_LIMIT=256,GRAIN_CELL=19,SEA_CELL=76;
// A wider sand band keeps roughly the former number of marks per coast length.
// Thin once at chunk creation; visible frames only replay the cached points.
const GRAIN_COVERAGE=Math.min(1,35/COAST_RULES.beachWidth);
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const PALETTES={
  forest:{deep:'#193e48',sea:'#25535a',shallow:'#537e71',sand:'#97996d',grain:'#d8cc98'},
  marsh:{deep:'#213e48',sea:'#30555a',shallow:'#57796b',sand:'#858e69',grain:'#bbc49a'},
  ruins:{deep:'#243e51',sea:'#345967',shallow:'#668a85',sand:'#aaa995',grain:'#d5d1b5'},
};
export function traceIslandContour(ctx,points){ctx.beginPath();for(let i=0;i<points.length;i++)ctx[i?'lineTo':'moveTo'](points[i].x,points[i].y);ctx.closePath();}
function fragments(points,spacing){const result=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);for(let t=0;t<length;t+=spacing)result.push({x:a.x+dx*t/length,y:a.y+dy*t/length,tx:dx/length,ty:dy/length,seed:i*719+Math.round(t)});}return result;}
function stroke(c,x,y,tx,ty,length,color,width=1){c.beginPath();c.moveTo(x,y);c.lineTo(x+tx*length,y+ty*length);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
export class IslandArt {
  constructor(){this.cache=new WeakMap();}
  _shape(island){let shape=this.cache.get(island);if(!shape){const shallow=island.shallowWidth??COAST_RULES.shallowWidth,inland=shallow+COAST_RULES.beachWidth;shape={outer:island.points,shallow:island.contour(shallow),grass:island.contour(inland),fringe:fragments(island.contour(inland),9),details:new Map(),detailBuilds:0};this.cache.set(island,shape);}return shape;}
  detailStats(island){const shape=this.cache.get(island);return {chunks:shape?.details.size||0,limit:DETAIL_LIMIT,builds:shape?.detailBuilds||0,samples:shape?[...shape.details.values()].reduce((n,t)=>n+t.grain.length+t.sea.length,0):0};}
  _detailChunk(island,shape,cx,cy){
    const key=`${cx},${cy}`;let tile=shape.details.get(key);
    if(tile){shape.details.delete(key);shape.details.set(key,tile);return tile;}
    // Static world-space classification is paid only when entering a chunk.
    // Store small point lists, never a full-island or high-DPR texture. Islands
    // are weakly owned and exploration evicts distant detail independently.
    tile={grain:[],sea:[]};
    const shallow=island.shallowWidth??COAST_RULES.shallowWidth,inland=shallow+COAST_RULES.beachWidth;
    for(let gy=cy*16;gy<(cy+1)*16;gy++)for(let gx=cx*16;gx<(cx+1)*16;gx++){
      const seed=hash(gx+17,gy+island.seed),x=gx*GRAIN_CELL+seed*18,y=gy*GRAIN_CELL+hash(gx-31,gy)*18;
      if(hash(gx+103,gy-61)<=GRAIN_COVERAGE&&island.contains(x,y,shallow+1)&&!island.contains(x,y,inland+4))tile.grain.push({gx,gy,seed,x,y});
    }
    for(let gy=cy*4;gy<(cy+1)*4;gy++)for(let gx=cx*4;gx<(cx+1)*4;gx++){
      const seed=hash(gx+island.seed,gy),x=gx*SEA_CELL+seed*45,y=gy*SEA_CELL+hash(gy,gx+9)*63;
      if(!island.isDry(x,y))tile.sea.push({gx,gy,seed,x,y});
    }
    if(shape.details.size>=DETAIL_LIMIT)shape.details.delete(shape.details.keys().next().value);
    shape.details.set(key,tile);shape.detailBuilds++;return tile;
  }
  _samples(island,shape,view,kind){
    const cell=kind==='grain'?GRAIN_CELL:SEA_CELL,margin=kind==='sea'?1:0,span=DETAIL_CHUNK/cell;
    const minX=Math.floor(view.minX/cell)-margin,maxX=Math.floor(view.maxX/cell),minY=Math.floor(view.minY/cell)-margin,maxY=Math.floor(view.maxY/cell),samples=[];
    for(let cy=Math.floor(minY/span);cy<=Math.floor(maxY/span);cy++)for(let cx=Math.floor(minX/span);cx<=Math.floor(maxX/span);cx++){
      for(const p of this._detailChunk(island,shape,cx,cy)[kind])if(p.gx>=minX&&p.gx<=maxX&&p.gy>=minY&&p.gy<=maxY)samples.push(p);
    }
    // Preserve the former cell traversal and paint order, including viewport
    // edge samples and negative coordinates, so moving across chunks is seamless.
    return samples.sort((a,b)=>a.gy-b.gy||a.gx-b.gx);
  }
  draw(ctx,island,{camX=0,camY=0,width=1100,height=700,time=0,reduced=false}={},drawLand=()=>{}){
    if(!island?.points?.length)return false;
    const shape=this._shape(island),palette=PALETTES[island.region]||PALETTES.forest,clock=reduced?0:time;
    const view={minX:camX-width/2,minY:camY-height/2,maxX:camX+width/2,maxY:camY+height/2};
    const shallow=island.shallowWidth??COAST_RULES.shallowWidth,inland=shallow+COAST_RULES.beachWidth;
    if(island.contains(camX,camY,Math.hypot(width/2,height/2)+inland)){drawLand();return true;}
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
    for(const {seed,x:xx,y:yy} of this._samples(island,shape,view,'sea')){
      const phase=clock*.72+seed*TAU,span=10+seed*25,alpha=.045+(Math.sin(phase)+1)*.018;
      ctx.globalAlpha=alpha;stroke(ctx,xx,yy+Math.sin(phase)*1.2,1,-.025,span,'#d8edda',.8);stroke(ctx,xx+span*.2,yy+4,1,-.025,span*.43,'#101f30',1.1);ctx.globalAlpha=1;
    }
    traceIslandContour(ctx,shape.shallow);ctx.fillStyle=palette.sand;ctx.fill();
    // Paint the game's established ground within the dry interior. The beach
    // is an actual walkable strip, not a new collision outline made by art.
    ctx.save();traceIslandContour(ctx,shape.grass);ctx.clip();ctx.translate(camX-width/2,camY-height/2);drawLand();ctx.restore();
    // Small facets break up the land/beach transition. Their size is constant
    // in world pixels, so a large island does not acquire giant brush marks.
    for(const {seed,x:xx,y:yy} of this._samples(island,shape,view,'grain')){
      ctx.fillStyle=palette.grain;ctx.globalAlpha=.3;ctx.fillRect(xx,yy,1.4+seed*2,.8);ctx.globalAlpha=.22;stroke(ctx,xx+5,yy+3,1,.18,3+seed*4,'#3d5049',.8);ctx.globalAlpha=1;
    }
    const visible=p=>p.x>=view.minX-35&&p.x<=view.maxX+35&&p.y>=view.minY-35&&p.y<=view.maxY+35;
    for(const p of shape.fringe){if(!visible(p))continue;const seed=hash(p.seed+27,island.seed),nx=-p.ty,ny=p.tx,xx=p.x-nx*(2+seed*5),yy=p.y-ny*(2+seed*5);ctx.save();ctx.globalAlpha=.5+seed*.3;ctx.beginPath();ctx.ellipse(xx,yy,3+seed*6,1.1+seed*2.4,Math.atan2(p.ty,p.tx),0,TAU);ctx.fillStyle=island.region==='marsh'?'#465846':island.region==='ruins'?'#626b57':'#415439';ctx.fill();stroke(ctx,xx,yy,p.tx,p.ty,2+seed*5,palette.grain,.5);ctx.restore();}
    ctx.restore();return true;
  }
}
