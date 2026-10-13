// Companion materials are cached once per facing. Gait, flight and expressive
// eyes remain small deterministic transforms, independent of gameplay RNG.
import {RelicArt} from './relic-art.js';
const TAU=Math.PI*2,CACHE_LIMIT=2*1024*1024;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const COMPANION_VISUALS=Object.freeze({
  dog:Object.freeze({radius:12,foot:11,halfWidth:28,top:24,shadowWidth:16,shadowLength:17}),
  owl:Object.freeze({radius:10,foot:13,halfWidth:31,top:33,shadowWidth:14,shadowLength:16}),
  golem:Object.freeze({radius:21,foot:22,halfWidth:31,top:37,shadowWidth:22,shadowLength:25})
});
const BOX={dog:{body:[57,45,28,30],head:[37,35,12,29],leg:[18,25,9,10],tail:[29,34,25,25]},owl:{body:[36,49,18,37],wing:[31,36,6,18],tail:[23,20,12,12]},golem:{body:[53,63,26,41],head:[39,46,19,40],arm:[30,45,15,22],leg:[27,32,13,10]}};
const poly=(c,points,fill,stroke=null,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();paint(c,fill,stroke,width);};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,fill,angle=0,stroke=null,width=1)=>{c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);paint(c,fill,stroke,width);};
function paint(c,fill,stroke=null,width=1){if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function material(c,flip,colors,x=18,top=-25,bottom=16){const g=c.createLinearGradient(-x*flip,bottom,x*flip,top);colors.forEach((v,i)=>g.addColorStop(i/(colors.length-1),v));return g;}
function diamond(c,x,y,r,fill,stroke=null){poly(c,[[x,y-r],[x+r*.7,y],[x,y+r],[x-r*.7,y]],fill,stroke,.8);}
function stone(c,points,flip,tint='normal'){
  const colors=tint==='dark'?['#4f6258','#7a8b77','#adbaa0']:['#596e62','#89977e','#c4c9a7'];
  poly(c,points,material(c,flip,colors,18,-26,19),'#344e43',1.5);
  line(c,points.slice(0,Math.max(2,Math.ceil(points.length/2))), '#d4d5b384',.85);
}
function moss(c,x,y,flip){poly(c,[[x-7,y],[x-5,y-3],[x-2,y-1],[x+1,y-4],[x+4,y-2],[x+7,y-3],[x+6,y+1],[x+1,y+2],[x-1,y+4],[x-4,y+2]],material(c,flip,['#4b6b37','#82984b','#a8b966'],9,y-4,y+4),'#496039',.55);}
function faceState(entity,time,reduced){if(entity.state==='recovering'||entity.hurtFace>0)return 'hurt';if(entity.state==='dormant')return 'sleep';if(reduced)return 'normal';const id=typeof entity.id==='number'?entity.id:17,phase=(Math.max(0,time)+id*.371)%4.7;return phase<.1?'blink':'normal';}

export class CompanionArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=typeof makeCanvas==='function'?makeCanvas:makeCanvas.createCanvas||(()=>document.createElement('canvas'));this.cache=new Map();this.bytes=0;this.builds=0;this.ratio=0;this.siteProps=new WeakMap();this.relicSites=new WeakMap();this.relicArt=new RelicArt(this.makeCanvas);}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,limitBytes:CACHE_LIMIT,builds:this.builds,pixelRatio:this.ratio};}
  _sprite(kind,part,flip,ratio){
    if(this.ratio!==ratio){this.cache.clear();this.bytes=0;this.ratio=ratio;}
    const key=`${kind}:${part}:${flip}`;let image=this.cache.get(key);if(image)return image;
    const [w,h,baseOx,oy]=BOX[kind][part],ox=flip<0?w-baseOx:baseOx,canvas=this.makeCanvas();canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);const c=canvas.getContext('2d');
    c.scale(ratio,ratio);c.translate(ox,oy);c.scale(flip,1);c.lineJoin='round';c.lineCap='round';this[`_${kind}${part}`](c,flip);
    image={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};
    while(this.bytes+image.bytes>CACHE_LIMIT&&this.cache.size){const key=this.cache.keys().next().value;this.bytes-=this.cache.get(key).bytes;this.cache.delete(key);}
    this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;return image;
  }
  _part(c,kind,part,flip,ratio,x=0,y=0){const s=this._sprite(kind,part,flip,ratio);c.drawImage(s.canvas,x-s.ox,y-s.oy,s.w,s.h);}
  draw(c,kind,{pose={},entity={},time=0,reduced=false,pixelRatio=2}={}){
    if(!COMPANION_VISUALS[kind])return false;
    const facing=Number.isFinite(entity.castFacing)&&entity.castFace>0?entity.castFacing:entity.facing||0,flip=Math.cos(facing)<-.1?-1:1,ratio=clamp(Math.ceil(Number.isFinite(pixelRatio)?pixelRatio:2),1,2);
    const moving=!!entity.moving&&Number(entity.walkSpeed??1)>0,step=Number.isFinite(pose.step)?pose.step:moving?Math.sin(entity.walkPhase||0):0,bodyY=Number.isFinite(pose.bodyY)?pose.bodyY:moving?-Math.abs(step)*.9:0;
    c.save();c.lineCap='round';c.lineJoin='round';
    this[`_draw${kind}`](c,{...pose,step,bodyY},entity,time,reduced,flip,ratio);
    c.restore();return true;
  }
  _drawdog(c,p,e,time,reduced,flip,ratio){
    const step=clamp(p.step,-1.2,1.2),bodyY=p.bodyY*.6;
    c.save();c.translate(-16*flip,-4+bodyY);c.rotate((reduced?0:step*.1)*flip);c.scale(.48,.58);this._part(c,'dog','tail',flip,ratio);c.restore();
    // Four planted paws use opposing gait phases; their offsets are driven by
    // actual travelled distance, so standing or pushing a wall never slides.
    for(const back of [true,false]){
      for(const side of [-1,1]){const gait=step*side*(back?-1:1),x=(side<0?-12:10)*flip+(back?-1:1)*2,y=(back?7:10)-Math.max(0,gait)*2.5;
        if(back){c.save();c.globalAlpha*=.82;}
        this._part(c,'dog','leg',flip,ratio,x+gait*1.4,y-9);
        if(back)c.restore();
      }
      if(back)this._part(c,'dog','body',flip,ratio,0,bodyY);
    }
    const sniff=e.scouting||e.sniffing||e.task==='search',headY=bodyY+(sniff?2.2:0);
    c.save();c.translate(9*flip,-4+headY);c.rotate(sniff?.1*flip:0);c.scale(.8,.8);this._part(c,'dog','head',flip,ratio);c.scale(flip,1);
    const state=faceState(e,time,reduced);
    if(state==='normal'){oval(c,2,-8,1.75,2.2,'#263931');oval(c,2.45,-8.7,.53,.65,'#fff4d2');}
    else line(c,[[.5,-8],[2,-7.2],[3.6,-8]],'#263931',1.5);
    line(c,[[8,-1],[9.5,.2],[12,-.3]],'#5b4333',.9);c.restore();
  }
  _dogbody(c,flip){
    c.beginPath();c.moveTo(-20,-10);c.quadraticCurveTo(-11,-19,5,-14);c.quadraticCurveTo(18,-14,20,-4);c.lineTo(16,5);c.quadraticCurveTo(1,11,-17,3);c.quadraticCurveTo(-23,-1,-20,-10);c.closePath();paint(c,material(c,flip,['#875e3f','#ba8b52','#e3bc7b'],23,-15,8),'#584d34',1.5);
    c.beginPath();c.moveTo(11,-13);c.quadraticCurveTo(10,-6,5,-2);c.lineTo(12,7);c.quadraticCurveTo(22,0,19,-6);c.closePath();paint(c,'#e7d4ab');
    poly(c,[[-10,-12],[-3,-15],[1,-13],[-4,-9],[-5,-4],[-12,-5]],'#8c663e80');
    line(c,[[-16,-12],[-10,-14],[-3,-14]],'#f0cea090',1);
    // The scarf is a small strong friendly-color cue, clear at normal zoom.
    poly(c,[[10,-13],[16,-15],[20,-9],[15,-5],[8,-8]],'#ac5748','#674c38',.8);
    poly(c,[[10,-9],[4,-3],[7,3],[11,-1],[14,-7]],'#c5674f','#714c36',.8);
    line(c,[[10,-10],[15,-8],[18,-11]],'#e99a74',1);
  }
  _doghead(c,flip){
    c.beginPath();c.moveTo(-9,-16);c.quadraticCurveTo(0,-23,8,-15);c.lineTo(13,-9);c.quadraticCurveTo(23,-8,21,-2);c.quadraticCurveTo(16,4,5,2);c.quadraticCurveTo(-6,5,-11,-6);c.closePath();paint(c,material(c,flip,['#a67546','#d4a666','#eed2a0'],16,-21,4),'#584b35',1.4);
    c.beginPath();c.moveTo(-6,-17);c.quadraticCurveTo(-16,-19,-12,-6);c.quadraticCurveTo(-8,2,-4,-4);c.lineTo(-1,-15);c.closePath();paint(c,'#8b593c','#60472f',1.2);line(c,[[-10,-15],[-9,-7]],'#c38c58',1);
    c.beginPath();c.moveTo(8,-8);c.quadraticCurveTo(18,-10,20,-4);c.quadraticCurveTo(16,3,6,0);c.closePath();paint(c,'#f1ddb4');
    oval(c,19,-5,3.2,2.3,'#314235');oval(c,19.4,-5.8,1.2,.6,'#76856a');
    line(c,[[5,-16],[8,-13]],'#f7dfb7',1.2);
  }
  _dogleg(c,flip){
    c.beginPath();c.moveTo(-3,-6);c.lineTo(3,-5);c.lineTo(2,5);c.quadraticCurveTo(7,5,6,9);c.lineTo(-3,9);c.quadraticCurveTo(-5,3,-3,-6);c.closePath();paint(c,material(c,flip,['#92673f','#cfac75','#e4cca0'],6,-6,9),'#63543a',.85);line(c,[[0,7],[4,7]],'#f3d8a7',.8);
  }
  _dogtail(c,flip){c.beginPath();c.moveTo(4,1);c.quadraticCurveTo(-7,-1,-13,-10);c.quadraticCurveTo(-18,-19,-21,-16);c.quadraticCurveTo(-24,-9,-18,-3);c.quadraticCurveTo(-9,7,1,8);c.closePath();paint(c,material(c,flip,['#926943','#c2965d','#e4c48f'],20,-17,8),'#5e5034',1.25);poly(c,[[-16,-13],[-21,-16],[-21,-9],[-18,-5],[-14,-4],[-16,-8]],'#ecd5a9');}
  _drawowl(c,p,e,time,reduced,flip,ratio){
    const state=faceState(e,time,reduced),sleep=state==='sleep'||e.state==='recovering',phase=reduced||sleep?0:Math.sin(time*8.5+(Number(e.id)||0)*.2),lift=sleep?6:Math.sin(reduced?0:time*2.1)*1.1;
    c.save();c.translate(0,lift);this._part(c,'owl','tail',flip,ratio,0,0);
    for(const side of [-1,1]){c.save();c.translate(side*10,-13);c.rotate(side*(sleep?.86:.17+phase*.24));c.scale(1,1+Math.abs(phase)*.09);this._part(c,'owl','wing',side,ratio);c.restore();}
    this._part(c,'owl','body',flip,ratio);
    c.scale(flip,1);
    for(const x of [-6.3,6.3]){if(state==='normal'){oval(c,x,-22,3.15,3.7,'#e4c775');oval(c,x+.45,-22,1.95,2.6,'#283c35');oval(c,x+1,-23.2,.75,.85,'#fff7d7');}else line(c,[[x-2,-21.5],[x,-20.5],[x+2,-21.5]],'#3b4b38',1.5);}
    poly(c,[[0,-18.5],[2.5,-16.6],[0,-12.8],[-2.5,-16.6]],'#b08d44','#5c5937',.65);line(c,[[0,-17.5],[.7,-15.4]],'#e8cf7c',.6);
    c.restore();
  }
  _owlbody(c,flip){
    c.beginPath();c.moveTo(-11,-26);c.lineTo(-14,-32);c.quadraticCurveTo(-6,-32,-3,-29);c.quadraticCurveTo(2,-31,8,-29);c.lineTo(14,-33);c.lineTo(13,-24);c.quadraticCurveTo(18,-9,10,0);c.quadraticCurveTo(0,8,-10,0);c.quadraticCurveTo(-17,-9,-11,-26);c.closePath();paint(c,material(c,flip,['#625b43','#97865b','#cbb689'],17,-33,6),'#3f4e3a',1.4);
    c.beginPath();c.moveTo(-11,-23);c.quadraticCurveTo(-9,-30,-1,-26);c.quadraticCurveTo(5,-30,11,-25);c.quadraticCurveTo(15,-17,6,-14);c.quadraticCurveTo(0,-10,-7,-14);c.quadraticCurveTo(-14,-16,-11,-23);c.closePath();paint(c,material(c,flip,['#b8b599','#e4dbc0','#fff0d0'],15,-29,-12),'#7c8264',.7);
    c.beginPath();c.moveTo(-7,-12);c.quadraticCurveTo(1,-16,8,-11);c.lineTo(8,-1);c.quadraticCurveTo(0,5,-8,-1);c.closePath();paint(c,'#d1c6a1');
    for(const [x,y]of [[-4,-8],[3,-7],[-1,-2]])line(c,[[x-1.7,y-1],[x,y+1],[x+1.3,y-1]],'#9b956f',1);
    for(const s of [-1,1]){line(c,[[s*5,2],[s*5.4,5],[s*8,5]],'#b1a474',1.4);line(c,[[s*5.4,4],[s*3.5,5.4]],'#b1a474',1.2);}
    line(c,[[4,-29],[9,-28]],'#eee0b0',.9);
  }
  _owlwing(c,flip){
    c.beginPath();c.moveTo(0,-5);c.quadraticCurveTo(13,-9,23,1);c.lineTo(21,4);c.lineTo(17,3);c.lineTo(17,7);c.lineTo(12,6);c.lineTo(11,10);c.quadraticCurveTo(3,8,-2,2);c.closePath();paint(c,material(c,flip,['#625a40','#99845a','#c1ae7e'],24,-8,12),'#45503b',1.1);
    line(c,[[3,-3],[11,0],[17,4]],'#d9c89b',1);line(c,[[3,0],[7,3],[11,7]],'#c6b589',.9);line(c,[[10,-3],[15,-1],[20,2]],'#bdae7f',.75);
  }
  _owltail(c,flip){poly(c,[[-6,-8],[6,-8],[8,0],[4,-1],[2,3],[-2,1],[-6,3],[-8,0]],material(c,flip,['#6f6142','#ad9767','#d6c591'],10,-10,4),'#43513c',1);line(c,[[0,-7],[0,0]],'#d3c197',.8);}
  _drawgolem(c,p,e,time,reduced,flip,ratio){
    const dormant=e.state==='dormant',state=faceState(e,time,reduced),step=dormant?0:clamp(p.step,-1.1,1.1),bodyY=dormant?2:p.bodyY*.8,cast=clamp((e.castFace||0)/.35,0,1),strike=reduced?cast*.25:Math.sin(cast*Math.PI);
    for(const side of [-1,1])this._part(c,'golem','leg',flip,ratio,side*10+step*side*1.2,11-Math.max(0,step*side)*2.7);
    for(const side of [-1,1]){c.save();c.translate(side*22,bodyY+1);c.rotate(side*(.08+strike*.8)+step*side*.07);this._part(c,'golem','arm',flip,ratio);c.restore();}
    this._part(c,'golem','body',flip,ratio,0,bodyY);
    this._part(c,'golem','head',flip,ratio,0,bodyY+(dormant?3:0));
    c.save();c.translate(0,bodyY);c.scale(flip,1);
    const runeColor=dormant?'#758367':state==='hurt'?'#f0b98b':'#cbe6a0';
    diamond(c,0,-2,5.7,'#344d43','#a3b592');diamond(c,0,-2,3.6,runeColor);line(c,[[-8,-1],[-5,-1],[-4,2]],runeColor,.85);line(c,[[8,-1],[5,-1],[4,-4]],runeColor,.85);
    for(const x of [-5,5]){if(state==='normal'){oval(c,x,-25,1.8,2.25,'#d9edb0');oval(c,x+.4,-25.6,.45,.65,'#fff7d2');}else line(c,[[x-1.6,-24.5],[x+1.6,-24.5]],dormant?'#445d49':'#d0dcaa',1.4);}
    c.restore();
  }
  _golembody(c,flip){
    stone(c,[[-16,-18],[-7,-21],[12,-20],[18,-14],[17,4],[11,13],[-10,13],[-18,6]],flip);
    poly(c,[[8,-19],[16,-15],[16,3],[10,11],[6,10],[10,0]],'#536e5c80');
    line(c,[[-13,-11],[-8,-7],[-11,-3],[-10,2]],'#4d6654',1);
    line(c,[[7,6],[12,5],[15,1]],'#c9cdae',1);
    moss(c,-9,-18,flip);moss(c,11,8,flip);
  }
  _golemhead(c,flip){
    stone(c,[[-12,-33],[-5,-37],[9,-36],[14,-29],[12,-18],[7,-14],[-9,-16],[-14,-24]],flip);
    poly(c,[[-11,-28],[-7,-30],[10,-29],[11,-22],[7,-19],[-8,-20]],'#3e5a4b','#819579',.7);
    poly(c,[[10,-34],[13,-29],[11,-19],[7,-16],[6,-18],[9,-24]],'#586f58');
    line(c,[[-6,-33],[-2,-35],[5,-34]],'#d8d8b7',1);
    moss(c,-5,-35,flip);line(c,[[-1,-18],[4,-18]],'#9bab86',1);
  }
  _golemarm(c,flip){
    stone(c,[[-7,-16],[1,-19],[8,-13],[7,-2],[3,3],[-6,0],[-10,-7]],flip,'dark');
    stone(c,[[-7,-1],[6,-1],[9,5],[8,15],[2,19],[-8,15],[-10,7]],flip);
    line(c,[[-5,10],[-4,15]],'#4d6553',1);line(c,[[0,11],[1,16]],'#4d6553',1);moss(c,-3,-15,flip);
  }
  _golemleg(c,flip){stone(c,[[-7,-9],[4,-9],[7,-3],[6,5],[11,7],[10,11],[-9,11],[-11,6],[-8,2]],flip,'dark');line(c,[[-6,7],[6,7]],'#b1baa0',1.1);line(c,[[1,7],[1,10]],'#475e4e',.8);}
  _siteImage(key,w,h,ox,oy,draw){
    key=`site:${key}`;let image=this.cache.get(key);if(image)return image;
    const ratio=this.ratio||2,canvas=this.makeCanvas();canvas.width=w*ratio;canvas.height=h*ratio;const c=canvas.getContext('2d');c.scale(ratio,ratio);c.translate(ox,oy);c.lineJoin='round';c.lineCap='round';draw(c);
    image={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};while(this.bytes+image.bytes>CACHE_LIMIT&&this.cache.size){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).bytes;this.cache.delete(first);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;return image;
  }
  _stamp(c,image,x,y){c.drawImage(image.canvas,x-image.ox,y-image.oy,image.w,image.h);}
  _vaultSite(site){let proxy=this.relicSites.get(site);if(!proxy){proxy={};this.relicSites.set(site,proxy);}Object.assign(proxy,site,{type:'rescue',gateOpen:true});return proxy;}
  drawGround(c,site,options={}){
    if(site?.type==='stonevault')return this.relicArt.drawGround(c,this._vaultSite(site),options);
    const altar=site?.appearance==='golemaltar',dog=site?.type==='dogcamp';if(!altar&&!dog)return false;
    const image=altar?this._siteImage('altar',166,125,83,64,c=>{
      for(let i=0;i<8;i++){const a=i*TAU/8,x=Math.cos(a)*61,y=Math.sin(a)*43;stone(c,[[x-8,y],[x-5,y-5],[x+7,y-4],[x+9,y+2],[x+4,y+5],[x-7,y+5]],1,'dark');}
      poly(c,[[-40,-24],[0,-43],[40,-24],[45,19],[0,43],[-45,19]],'#526850','#344f3d',1.2);
      poly(c,[[-40,-29],[0,-48],[40,-29],[45,14],[0,38],[-45,14]],'#879376','#425a44',1.1);
      for(const s of [-1,1])line(c,[[s*40,-27],[s*43,12],[0,35]],'#c0c2a1',1);
      poly(c,[[-24,-16],[0,-29],[24,-16],[28,10],[0,26],[-28,10]],'#596f57','#b7bd93',1);
      for(let i=0;i<6;i++){const a=i*TAU/6,x=Math.cos(a)*35,y=Math.sin(a)*25;diamond(c,x,y,3.5,'#a5b589');}
      line(c,[[-10,15],[0,20],[10,15]],'#bac69a',1.1);moss(c,-36,15,1);moss(c,28,-31,1);
    }):this._siteImage('dogcamp',112,89,56,49,c=>{
      poly(c,[[-30,-15],[27,-19],[37,16],[-23,23]],'#6f6850','#3e5138',1);
      poly(c,[[-26,-11],[24,-14],[32,13],[-20,18]],'#af9470');
      for(let i=0;i<5;i++)line(c,[[-26+i*11,-11],[ -20+i*11,18]],'#685f4880',1.4);
      oval(c,30,21,10,5,'#445d48');oval(c,30,19,9,4.8,'#8b9e82',0,'#415c48',1);oval(c,30,19,6.5,2.7,'#bdd7c0');line(c,[[26,18],[29,17],[32,17]],'#e3ebd1',.7);
      poly(c,[[-33,7],[-40,-1],[-37,-15],[-27,-20],[-18,-16],[-20,-1]],'#796c48','#445039',1);poly(c,[[-36,-12],[-27,-15],[-22,-11],[-24,-3],[-34,0]],'#b39a69','#6c6446',.8);line(c,[[-36,-9],[-24,-12]],'#e0bd83',1);moss(c,-31,23,1);
    });
    this._stamp(c,image,site.x,site.y);
    if(altar&&site.state==='active'){
      const t=options.reduced?0:options.time||0,alpha=options.reduced?.72:.64+Math.sin(t*4)*.16;c.save();c.globalAlpha*=alpha;c.translate(site.x,site.y);for(let i=0;i<6;i++){const a=i*TAU/6;diamond(c,Math.cos(a)*35,Math.sin(a)*25,3.5,'#d5edb2');}line(c,[[-10,15],[0,20],[10,15]],'#eaf3cb',1.8);c.restore();
    }
    return true;
  }
  props(site){
    if(site?.type!=='stonevault')return [];
    let props=this.siteProps.get(site);if(!props){props=[{id:`${site.id}:stonegate`,type:'companionSitePart',part:'stonegate',site,x:site.x,y:site.y+61,sortY:site.y+61,r:37,height:55,shadowWidth:40,shadowHeight:35},{id:`${site.id}:treasure`,type:'treasure',site,x:site.x,y:site.y,sortY:site.y,r:24,shadowWidth:24,shadowHeight:20}];this.siteProps.set(site,props);}
    const gate=props[0],open=!!site.gateOpen;Object.assign(gate,{x:site.x,y:site.y+61,sortY:site.y+61,height:open?8:55,shadowHeight:open?4:35,shadowWidth:open?45:40,shadowRevision:open?'opened':'closed'});
    const treasure=props[1];Object.assign(treasure,{x:site.x,y:site.y,sortY:site.y,state:site.state==='cleared'?'opened':open?'unlocked':'locked'});
    return [...this.relicArt.props(this._vaultSite(site)).filter(p=>!p.part.startsWith('gate')),gate,treasure];
  }
  drawProp(c,prop,options={}){
    if(prop?.type!=='companionSitePart')return false;
    const open=!!prop.site?.gateOpen,image=this._siteImage(open?'gate-rubble':'stonegate',116,91,58,72,ctx=>{
      if(open){
        for(const [x,y,w,h] of [[-37,3,13,7],[-23,8,9,5],[30,0,13,8],[43,8,7,4],[16,9,7,4],[-45,12,5,3]]){
          stone(ctx,[[x-w,y],[x-w*.65,y-h],[x+w*.5,y-h*.7],[x+w,y],[x+w*.7,y+h*.45],[x-w*.7,y+h*.5]],1,'dark');
        }
        return;
      }
      stone(ctx,[[-43,1],[-44,-20],[-32,-40],[-12,-52],[11,-51],[33,-37],[44,-16],[42,3],[22,12],[-21,12]],1);
      poly(ctx,[[10,-50],[32,-36],[43,-16],[41,3],[23,11],[8,5],[17,-13]],'#506a5680');
      line(ctx,[[-27,-35],[-10,-45],[5,-44]],'#d5d6b0',1.5);
      line(ctx,[[-11,-50],[-16,-33],[-7,-21],[-11,-5]],'#4c6351',1.5);
      poly(ctx,[[-12,-30],[0,-35],[13,-29],[12,-12],[0,-6],[-14,-13]],'#455e4e','#afbc94',1);
      line(ctx,[[-6,-16],[-6,-26],[0,-30],[6,-26],[6,-16]],'#c1cba3',2);line(ctx,[[-10,-16],[10,-16]],'#c1cba3',2);
      diamond(ctx,0,-22,3,'#839e71');moss(ctx,-25,-35,1);moss(ctx,24,5,1);
    });
    c.save();const breaking=prop.site?.state==='opening',time=options.time||0;c.translate(prop.x+(breaking&&!options.reduced?Math.sin(time*53)*.8:0),prop.y);this._stamp(c,image,0,0);
    if(breaking&&!open){c.globalAlpha*=.4;line(c,[[-11,-50],[-16,-33],[-7,-21],[-11,-5]],'#e7e8bd',2.2);}
    c.restore();return true;
  }
}
