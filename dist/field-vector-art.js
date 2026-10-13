// Fixed field silhouettes are compiled once. Gameplay transforms these paths;
// only the low-opacity halo is a bitmap in SuperArt.
const clampVariant=value=>Number.isFinite(value)?((Math.trunc(value)%3)+3)%3:0;
const noise=(seed,i)=>{let n=Math.imul((seed|0)^0x4f1bbcdc,i+31);n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return((n^(n>>>16))>>>0)/4294967296;};
const nativePath=()=>typeof Path2D==='function'?new Path2D():null;

function pen(commands,x=0,y=0,a=0){
  const c=Math.cos(a),s=Math.sin(a),point=(u,v)=>[x+u*c-v*s,y+u*s+v*c];
  return{
    move(u,v){commands.push(['moveTo',...point(u,v)]);},
    line(u,v){commands.push(['lineTo',...point(u,v)]);},
    quad(u,v,ex,ey){commands.push(['quadraticCurveTo',...point(u,v),...point(ex,ey)]);},
    cubic(ax,ay,bx,by,ex,ey){commands.push(['bezierCurveTo',...point(ax,ay),...point(bx,by),...point(ex,ey)]);},
    close(){commands.push(['closePath']);},
  };
}
function poly(p,points){points.forEach(([x,y],i)=>p[i?'line':'move'](x,y));p.close();}
function oval(p,x,y,rx,ry){const k=.552284749831;p.move(x+rx,y);p.cubic(x+rx,y+ry*k,x+rx*k,y+ry,x,y+ry);p.cubic(x-rx*k,y+ry,x-rx,y+ry*k,x-rx,y);p.cubic(x-rx,y-ry*k,x-rx*k,y-ry,x,y-ry);p.cubic(x+rx*k,y-ry,x+rx,y-ry*k,x+rx,y);p.close();}
function foliage(paths,x,y,a,size){
  let p=pen(paths.leaf,x,y,a);p.move(0,0);p.quad(size*.25,-size*.8,size*1.5,0);p.quad(size*.48,size*.61,0,0);p.close();
  p=pen(paths.leafLight,x,y,a);p.move(0,0);p.quad(size*.25,-size*.8,size*1.5,0);p.quad(size*.65,-size*.1,0,0);p.close();
  p=pen(paths.vein,x,y,a);p.move(size*.2,0);p.quad(size*.7,-size*.06,size*1.23,0);
}
function smoothLine(p,points,move=true){
  if(move)p.move(...points[0]);
  for(let i=1;i<points.length-1;i++)p.quad(...points[i],(points[i][0]+points[i+1][0])/2,(points[i][1]+points[i+1][1])/2);
  p.line(...points.at(-1));
}

export class FieldVectorArt{
  constructor({makePath=nativePath}={}){this.makePath=makePath;this.cache=new Map();this.pathBuilds=0;this.commandCount=0;}
  get stats(){return{entries:this.cache.size,pathBuilds:this.pathBuilds,commands:this.commandCount};}
  _layer(commands,color,width=0){
    const path=this.makePath();if(path)for(const [method,...args] of commands)path[method](...args);
    this.pathBuilds++;this.commandCount+=commands.length;
    return{path,commands: path?null:commands,color,width};
  }
  _draw(ctx,layers){
    for(const layer of layers){
      if(!layer.path){ctx.beginPath();for(const command of layer.commands)ctx[command[0]](...command.slice(1));}
      if(layer.width){ctx.strokeStyle=layer.color;ctx.lineWidth=layer.width;layer.path?ctx.stroke(layer.path):ctx.stroke();}
      else{ctx.fillStyle=layer.color;layer.path?ctx.fill(layer.path):ctx.fill();}
    }
  }
  _thorns(variant,raised){
    variant=clampVariant(variant);const key=`thorns:${variant}:${raised?1:0}`;if(this.cache.has(key))return this.cache.get(key);
    const paths={shadow:[],crack:[],rim:[],body:[],face:[],ridge:[],tip:[],leaf:[],leafLight:[],vein:[]};
    const clusters=[[-59,25,-.48],[39,47,-2.38],[-12,-54,.92],[62,-20,2.72],[-58,-36,.24]];
    for(let j=0;j<clusters.length;j++){
      const [bx,by,a]=clusters[j],x=bx+(noise(variant,j)-.5)*11,y=by+(noise(variant,j+12)-.5)*10;
      if(!raised){
        oval(pen(paths.shadow),x+1,y+4,13+j%3,4.4);
        let p=pen(paths.crack,x,y);p.move(-16,5);p.line(-8,1);p.line(-3,3);p.line(5,-2);p.line(17,-4);p.move(-4,3);p.line(-2,11);p.line(5,14);
        p=pen(paths.rim,x,y);p.move(-14,7);p.line(-7,4);p.line(-3,6);p.move(7,0);p.line(15,-2);
        for(let k=0;k<3;k++){
          const side=k===1?-1:1,end=30+noise(variant+j,k+20)*22,ey=(k-1)*16,c1=side*(14+k*3),c2=ey-side*15,w=4-k*.65;
          p=pen(paths.body,x,y,a);p.move(-5,w);p.cubic(7,c1+w,end*.48,c2+w*.6,end,ey);p.cubic(end*.48,c2-w*.6,7,c1-w,-5,-w);p.close();
          p=pen(paths.face,x,y,a);p.move(-4,w*.1);p.cubic(7,c1+w*.48,end*.48,c2+w*.3,end,ey);p.cubic(end*.48,c2-w*.42,7,c1-w*.6,-4,-w*.7);p.close();
          p=pen(paths.ridge,x,y,a);p.move(-2,-w*.34);p.cubic(8,c1-w*.4,end*.48,c2-w*.28,end*.93,ey-.3);
          // A short fork, rather than an identical spike at every branch tip.
          p=pen(paths.crack,x,y,a);p.move(end*.58,ey*.55);p.quad(end*.72,ey+side*9,end*.91,ey+side*15);
          if(k!==1){
            const lx=end*.6,ly=ey*.57,c=Math.cos(a),s=Math.sin(a);
            foliage(paths,x+lx*c-ly*s,y+lx*s+ly*c,a+(k?-.5:.8),6.4);
            const tx=end*.83,ty=ey;foliage(paths,x+tx*c-ty*s,y+tx*s+ty*c,a+(k?-1.8:1.8),4.7);
          }
        }
      }else{
        const side=j%2?1:-1,h=20+noise(variant,j+41)*13;
        let p=pen(paths.body,x,y);p.move(-8,5);p.cubic(-3,-4,-8,-h*.54,side*8,-h);p.cubic(side*1,-h*.47,9,-5,7,5);p.close();
        p=pen(paths.face,x,y);p.move(-3,3);p.cubic(-1,-8,-5,-h*.5,side*8,-h);p.cubic(side*1,-h*.49,3,-7,3,3);p.close();
        p=pen(paths.ridge,x,y);p.move(-2,-2);p.quad(-3,-h*.47,side*6,-h*.86);
        poly(pen(paths.tip,x,y),[[side*2,-h*.51],[side*8,-h],[side*5,-h*.52]]);
        poly(pen(paths.face,x,y),[[side*3,-7],[side*12,-14],[side*7,-5]]);
        foliage(paths,x-1,y-h*.35,side>0?2.95:.15,8.5);
        foliage(paths,x+side*2,y-h*.58,side>0?-.32:Math.PI+.32,7);
      }
    }
    const styles=[['shadow','#172b2347'],['crack','#293729c7',1.8],['rim','#b2aa7a',.8],['body','#293b2b'],['face','#7b8b4e'],['ridge','#c6cb88',.85],['tip','#e1dda5'],['leaf','#3c6440'],['leafLight','#94b969'],['vein','#d2dfa2',.65]];
    const layers=styles.filter(([key])=>paths[key].length).map(([key,color,width])=>this._layer(paths[key],color,width));this.cache.set(key,layers);return layers;
  }
  drawThorns(ctx,variant,{raised=false}={}){this._draw(ctx,this._thorns(variant,raised));}
  _ribbon(layer){
    layer=layer?1:0;const key=`ribbon:${layer}`;if(this.cache.has(key))return this.cache.get(key);
    const body=[],face=[],darkEdge=[],lightEdge=[],seam=[];
    for(let arm=0;arm<2;arm++){
      const a0=arm*Math.PI+layer*.58,outer=[],inner=[],bevel=[],middle=[];
      for(let j=0;j<=28;j++){
        const u=j/28,a=a0+u*4.35,shape=Math.sin(Math.PI*u),rr=116-u*91+Math.sin(u*9+arm)*shape*3,w=shape**.8*(.36+layer*.035)+.016;
        outer.push([Math.cos(a)*rr,Math.sin(a)*rr]);inner.push([Math.cos(a+w)*(rr+shape*8),Math.sin(a+w)*(rr+shape*8)]);
        bevel.push([Math.cos(a+w*.77)*(rr+shape*6),Math.sin(a+w*.77)*(rr+shape*6)]);
        if(j>=4&&j<=19)middle.push([Math.cos(a+w*.11)*rr,Math.sin(a+w*.11)*rr]);
      }
      let p=pen(body);smoothLine(p,outer);smoothLine(p,inner.slice().reverse(),false);p.close();
      p=pen(face);smoothLine(p,bevel);smoothLine(p,inner.slice().reverse(),false);p.close();
      smoothLine(pen(darkEdge),inner);smoothLine(pen(lightEdge),outer);smoothLine(pen(seam),middle);
    }
    const layers=[this._layer(body,layer?'#8298d1':'#a89bdb'),this._layer(face,layer?'#415789':'#615188'),this._layer(darkEdge,'#29233b91',2.2),this._layer(lightEdge,layer?'#d2e5f3':'#eee7ff',1.25),this._layer(seam,layer?'#afc9e5':'#d0c1f1',.65)];
    this.cache.set(key,layers);return layers;
  }
  drawVortexRibbon(ctx,layer){this._draw(ctx,this._ribbon(layer));}
  _core(){
    const key='core';if(this.cache.has(key))return this.cache.get(key);
    const floor=[],rim=[],shine=[],star=[];
    oval(pen(floor),0,0,15,12);
    let p=pen(rim);p.move(-17,5);p.cubic(-25,-13,-4,-22,12,-13);p.cubic(24,-6,14,11,4,8);p.cubic(-4,6,-5,-1,0,-5);
    p=pen(shine);p.move(-18,-4);p.cubic(-14,-13,2,-17,11,-11);
    poly(pen(star),[[-5,0],[-1,-1],[0,-6],[1,-1],[5,0],[1,1],[0,5],[-1,1]]);
    const layers=[this._layer(floor,'#342d507d'),this._layer(rim,'#8e7dbb',3.1),this._layer(shine,'#e1d9f5',1),this._layer(star,'#e2d9ef')];this.cache.set(key,layers);return layers;
  }
  drawVortexCore(ctx){this._draw(ctx,this._core());}
}
