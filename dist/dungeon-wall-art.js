// Dungeon walls are painted once in the same depth order as actors. Their
// raised faces use discovered ground segments rather than the live floor clip.
// Disjoint sprite strips prevent repeated alpha blending at shared corners.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
const FADE_SECONDS=.105;
function pixelRect(rect,transform){
  // Shared strip boundaries land on the same device pixel. Independent
  // antialiased rectangle clips would otherwise leave a moving dark seam.
  if(!transform||Math.abs(transform.b)>1e-8||Math.abs(transform.c)>1e-8||!transform.a||!transform.d)return rect;
  const snapX=x=>(Math.round(x*transform.a+transform.e)-transform.e)/transform.a;
  const snapY=y=>(Math.round(y*transform.d+transform.f)-transform.f)/transform.d;
  const x=snapX(rect.x),y=snapY(rect.y);
  return {x,y,width:snapX(rect.x+rect.width)-x,height:snapY(rect.y+rect.height)-y};
}

function wallGeometry(prop){
  const vertical=Math.abs(Math.sin(prop.angle||0))>.5,half=prop.halfLength||0,r=prop.r||14,hut=prop.variant==='hut-wall';
  const baseLength=half>75?360:90,scale=half*2/baseLength;
  return {vertical,half,r,hut,projection:hut?25:vertical?35*scale:35,pad:hut?r+5:vertical?r+5:Math.max(r+5,18*scale)};
}
// Spatial fading has no binary threshold when the player crosses a wall's
// raised face. Full-depth sorting still decides which actor is in front.
export function wallOcclusionOpacity(prop,player){
  if(!player)return 1;
  const g=wallGeometry(prop),footY=player.y+19.8;
  const minX=prop.x-(g.vertical?g.r:g.half+g.r),maxX=prop.x+(g.vertical?g.r:g.half+g.r);
  const minY=prop.y-(g.vertical?g.half:g.r)-g.projection,maxY=prop.y+(g.vertical?g.half:g.r);
  const xCoverage=smooth((player.x-(minX-16))/22)*smooth(((maxX+16)-player.x)/22);
  const yCoverage=smooth((footY-(minY-15))/22)*smooth(((maxY+17)-footY)/22);
  return 1-.58*xCoverage*yCoverage;
}

export class DungeonWallArt {
  constructor(){this._scenes=new WeakMap();}
  _scene(vision){
    const state=vision?.dungeon?.active;if(!state)return null;
    let cache=this._scenes.get(state);if(!cache){cache=new Map();this._scenes.set(state,cache);}return cache;
  }
  plan(prop,player,vision,time=0){
    const cache=this._scene(vision);if(!cache)return [];
    const known=vision.knownWallSegments(prop.id);if(!known.length)return [];
    let wall=cache.get(prop.id);
    if(!wall){wall=new Map();cache.set(prop.id,wall);}
    const g=wallGeometry(prop),opacity=wallOcclusionOpacity(prop,player),parts=[];
    const start=(g.vertical?prop.y:prop.x)-g.half,end=start+g.half*2;
    const now=Number.isFinite(time)?time:0;
    for(const piece of known){
      const x=(piece.ax+piece.bx)*.5,y=(piece.ay+piece.by)*.5;
      const side=g.vertical?Math.sign(player.x-x)||1:Math.sign(player.y+19.8-y)||1;
      const visible=vision.isWallSegmentVisible?vision.isWallSegmentVisible(piece):vision.isVisible(x+(g.vertical?side*(piece.r+.75):0),y+(!g.vertical?side*(piece.r+.75):0));
      const target=visible?1:.25;
      let state=wall.get(piece.id);
      if(!state){state={alpha:target,time:now};wall.set(piece.id,state);}
      // Simulation time makes pause/redraw bit-stable. The ease affects wall
      // lighting only: combat, discovery, and monster visibility remain exact.
      if(now>state.time){const dt=Math.min(.1,now-state.time);state.alpha+=(target-state.alpha)*(1-Math.exp(-dt/FADE_SECONDS));state.time=now;}
      else if(now<state.time){state.time=now;state.alpha=target;}
      const a=g.vertical?Math.min(piece.ay,piece.by):Math.min(piece.ax,piece.bx),b=g.vertical?Math.max(piece.ay,piece.by):Math.max(piece.ax,piece.bx);
      const first=Math.abs(a-start)<.01,last=Math.abs(b-end)<.01;
      let rect;
      if(g.vertical){
        const top=a-g.projection-(first?5:0),bottom=last?b+5:b-g.projection;
        rect={x:prop.x-g.pad,y:top,width:g.pad*2,height:Math.max(0,bottom-top)};
      }else{
        const left=a-(first?g.pad:0),right=b+(last?g.pad:0);
        rect={x:left,y:prop.y-80,width:right-left,height:100};
      }
      parts.push({id:piece.id,rect,alpha:state.alpha*opacity});
    }
    return parts;
  }
  draw(ctx,prop,player,vision,time,drawRawWall){
    const parts=this.plan(prop,player,vision,time);if(!parts.length)return;
    // Equal adjacent strips share one clip and sprite draw. Different strips
    // never overlap, so no pixel receives two wall coats or frame-dependent
    // darkness when neighbouring pieces change from visible to remembered.
    const groups=[];
    for(const part of parts){
      let group=groups.find(item=>Math.abs(item.alpha-part.alpha)<.00001);
      if(!group){group={alpha:part.alpha,rects:[]};groups.push(group);}group.rects.push(part.rect);
    }
    for(const group of groups){
      ctx.save();ctx.beginPath();const transform=ctx.getTransform?.();for(const rect of group.rects){const r=pixelRect(rect,transform);ctx.rect(r.x,r.y,r.width,r.height);}ctx.clip();
      ctx.globalAlpha*=group.alpha;drawRawWall(ctx,prop);ctx.restore();
    }
  }
}
