const TAU=Math.PI*2,clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const OPTIONS=Object.freeze({time:0,reduced:false,dense:false});

// A few bounded world-space paths, with no per-actor canvas or random state.
// Draw directly after that actor (not as one late water layer), so the next
// foreground actor occludes both its body and its ripples in normal foot order.
export class ImmersionArt {
  drawSurface(ctx,immersion,options=OPTIONS){
    if(!immersion||immersion.depth<=0)return;
    const {x,waterY:y,depth,width,mud}=immersion;
    if(![x,y,depth,width,mud?.x,mud?.y,mud?.rx,mud?.ry].every(Number.isFinite)||mud.rx<=0||mud.ry<=0)return;
    const view=options.view,extent=width+12;
    if(view&&(x+extent<view.left||x-extent>view.right||y+8<view.top||y-8>view.bottom))return;
    const time=options.reduced?0:(Number.isFinite(options.time)?options.time:0);
    const phase=((time*.7+x*.013+y*.017)%1+1)%1,alpha=clamp(depth*1.8,0,1);
    ctx.save();ctx.beginPath();ctx.ellipse(mud.x,mud.y,mud.rx,mud.ry,0,0,TAU);ctx.clip();
    ctx.globalAlpha*=alpha;ctx.lineCap='round';ctx.lineWidth=1;
    // Only the front lip crosses the body, leaving the dry torso readable.
    ctx.strokeStyle='#263e35';ctx.beginPath();ctx.ellipse(x,y-.1,width,2.1,0,.03,Math.PI-.03);ctx.stroke();
    ctx.strokeStyle='#b6c5a0';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(x,y+.8,width+1.3,2.3,0,.15,Math.PI-.15);ctx.stroke();
    ctx.globalAlpha*=.5*(1-phase*.7);ctx.lineWidth=.85;ctx.strokeStyle='#a7baa3';
    ctx.beginPath();ctx.ellipse(x,y+1.4,width+3+phase*6,2.7+phase*1.5,0,.1,Math.PI-.1);ctx.stroke();
    if(!options.dense){
      ctx.globalAlpha*=.65;ctx.beginPath();ctx.ellipse(x,y,width+5+phase*7,3.5+phase*2,0,Math.PI+.18,TAU-.18);ctx.stroke();
    }
    ctx.restore();
  }
}
