import { featureForSite } from './world-sites.js';
import { relicActivationStrength } from './relic-activation.js';

const TAU=Math.PI*2;
const poly=(c,points,fill,stroke,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const line=(c,x,y,xx,yy,color,width=1)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
function arch(c,x,y,w,h,fill,stroke){c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2,y-h+w/2);c.arc(x,y-h+w/2,w/2,Math.PI,0);c.lineTo(x+w/2,y);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=3;c.stroke();}}

// Five finite, high-resolution stamps. No animated blur, particles or new
// terrain query is needed while a landmark remains on screen.
export class WorldSiteArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();}
  _stamp(key,w,h,ox,oy,paint){
    if(this.cache.has(key))return this.cache.get(key);
    const canvas=this.makeCanvas();canvas.width=w*2;canvas.height=h*2;
    const c=canvas.getContext('2d');c.setTransform(2,0,0,2,ox*2,oy*2);c.lineJoin='round';c.lineCap='round';paint(c);
    const sprite={canvas,w,h,ox,oy};this.cache.set(key,sprite);return sprite;
  }
  _building(feature){return this._stamp(feature.id,300,230,150,195,c=>{
    const w=feature.width,d=feature.depth;
    if(feature.id==='shipwreck'){
      oval(c,0,-5,w*.59,16,'#3f514945');
      poly(c,[[-w*.56,-37],[-w*.38,-54],[w*.48,-43],[w*.62,-12],[w*.41,1],[-w*.35,0]],'#725139','#392d28',2);
      poly(c,[[-w*.56,-37],[-w*.44,-12],[-w*.31,0],[-w*.35,-32]],'#a38455');
      for(const y of [-27,-18,-8])line(c,-w*.35,y,w*.48,y+2,'#b89863',1.4);
      poly(c,[[-27,-40],[-13,-57],[20,-48],[29,-35]],'#a99467','#574735',1);
      for(const x of [-20,20]){line(c,x,-35,x+3,0,'#433a2b',4);line(c,x-1,-35,x+2,-1,'#c5ad72',1);}
      line(c,-18,-48,-18,-91,'#5c4633',4);line(c,-18,-91,19,-73,'#7d7052',1);
      poly(c,[[-17,-87],[16,-72],[-9,-71],[-17,-61]],'#d0c5a1','#9f9575');
      arch(c,2,1,26,30,'#222d2d','#c4a66e');line(c,-16,6,19,6,'#a99467',3);
      oval(c,29,-24,5,6,'#223b3a');line(c,-40,-34,-35,-8,'#d5c28b',1.2);
    }else if(feature.id==='mine'){
      poly(c,[[-47,3],[-48,-31],[-30,-63],[-5,-74],[31,-58],[47,-19],[39,3]],'#566562','#303e3d',2);
      poly(c,[[-48,-31],[-30,-63],[-5,-74],[-12,-44],[-32,-21]],'#94a49a');
      poly(c,[[-5,-74],[31,-58],[47,-19],[15,-33],[-12,-44]],'#75877d');
      arch(c,0,1,39,46,'#192725');
      for(const x of [-24,19]){c.fillStyle='#6b5138';c.fillRect(x,-43,6,44);line(c,x+1,-41,x+1,-1,'#b69660',1.3);}
      c.fillStyle='#90734a';c.fillRect(-28,-46,56,9);line(c,-27,-45,26,-45,'#c0a677',2);
      for(const x of [-9,9])line(c,x,1,x*1.5,23,'#a2ada1',2);
      for(const y of [7,15,22])line(c,-16,y,16,y,'#705841',2);
      for(const [x,y] of [[-33,-26],[30,-38]])poly(c,[[x-4,y],[x,y-10],[x+5,y-2],[x+1,y+4]],'#abd4c3','#d0ead6');
    }else if(feature.id==='belltower'){
      poly(c,[[-68,0],[-68,-17],[68,-17],[68,0]],'#565752','#a8a493');
      c.fillStyle='#686d66';c.fillRect(-52,-95,104,91);c.fillStyle='#9b9a84';c.fillRect(-45,-95,40,91);
      for(let row=0;row<6;row++){const y=-91+row*14;line(c,-50,y,49,y,'#454d48',1);for(let col=0;col<4;col++){const x=-45+col*27+(row%2)*13;if(x<50)line(c,x,y,x,y+13,'#62695f',1);}}
      c.fillStyle='#4c554f';c.fillRect(-31,-143,62,49);c.fillStyle='#a5a18a';c.fillRect(-28,-144,10,51);c.fillRect(19,-144,9,51);
      arch(c,0,-104,28,33,'#303f3b');
      poly(c,[[-11,-107],[-8,-127],[8,-127],[11,-107]],'#b39557','#e0c482');oval(c,0,-107,13,3,'#dfc278');line(c,0,-129,0,-134,'#9a8251',3);
      poly(c,[[-41,-143],[0,-166],[41,-143]],'#a16752','#3e4843',2);line(c,-34,-142,34,-142,'#d29772',2);
      arch(c,0,1,40,56,'#253631','#c4bca0');line(c,-28,6,28,6,'#a5a58d',5);
      for(const x of [-48,48]){c.fillStyle='#9a5946';c.fillRect(x-4,-74,8,25);poly(c,[[x-4,-49],[x,-43],[x+4,-49]],'#9a5946');}
    }else if(feature.id==='furnace'){
      poly(c,[[-w/2,0],[-w/2,-24],[-80,-43],[80,-43],[w/2,-24],[w/2,0]],'#373b3b','#82756b',2);
      poly(c,[[-78,-21],[-72,-117],[-40,-135],[40,-135],[72,-117],[78,-21]],'#565252','#272c30',2);
      poly(c,[[-72,-117],[-40,-135],[-42,-25],[-78,-21]],'#736660');
      for(const x of [-85,85]){poly(c,[[x-17,-8],[x-12,-111],[x+9,-111],[x+17,-8]],'#464547','#85715f',2);c.fillStyle='#c26c39';c.fillRect(x-6,-107,9,20);line(c,x-3,-102,x-3,-89,'#ffce83',2);}
      for(const y of [-111,-83,-55,-26])line(c,-64,y,64,y,'#242c2c',2);
      arch(c,0,1,53,70,'#302d29','#987860');arch(c,0,-36,23,27,'#ce733a');arch(c,0,-38,13,22,'#ffe1a0');
      for(const x of [-36,36]){line(c,x,-97,x,-48,'#b06940',3);line(c,x,-88,x,-65,'#f7bb69',1);}
      poly(c,[[-36,-136],[0,-151],[36,-136],[0,-121]],'#78655b','#b18a61',2);poly(c,[[0,-143],[9,-135],[0,-126],[-9,-135]],'#f0b666');
      line(c,-38,6,38,6,'#a28a69',5);
    }
  });}
  drawSettlement(c,site,options={}){
    const feature=featureForSite(site);if(!feature||feature.type==='rune')return false;
    const sprite=this._building(feature),p=options.player,behind=p&&p.y+19.8<site.y+4&&Math.abs(p.x-site.x)<site.width/2+22&&p.y>site.y-sprite.oy;
    c.save();c.globalAlpha*=behind?.48:1;c.drawImage(sprite.canvas,site.x-sprite.ox,site.y-sprite.oy,sprite.w,sprite.h);
    const strength=relicActivationStrength(site);if(strength>0){c.globalAlpha*=strength;c.strokeStyle=feature.id==='furnace'?'#ffe0a6':'#d9f2d1';c.lineWidth=3;c.beginPath();c.ellipse(site.x,site.y+8,feature.type==='castle'?31:18,7,0,Math.PI,TAU);c.stroke();}c.restore();
    const cleared=site.explored||site.state==='spent'||site.state==='claimed';
    c.save();c.textAlign='center';c.font='600 10px system-ui,sans-serif';c.lineWidth=3;c.strokeStyle='#23332e';c.strokeText(site.name,site.x,site.y+(cleared?38:31));c.fillStyle=cleared?'#b4c4b5':'#f3dfaf';c.fillText(site.name,site.x,site.y+(cleared?38:31));
    if(cleared){c.font='9px system-ui,sans-serif';c.fillStyle='#bacbbb';c.fillText('已探索',site.x,site.y+50);}c.restore();return true;
  }
  _iceFloor(){return this._stamp('ice-floor',184,156,92,75,c=>{
    poly(c,[[-65,-29],[-32,-60],[35,-58],[71,-24],[69,32],[34,61],[-34,60],[-70,24]],'#7a9da9','#d9f0ed',2);
    for(let i=0;i<8;i++){const a=i*TAU/8;line(c,Math.cos(a)*27,Math.sin(a)*23,Math.cos(a)*64,Math.sin(a)*51,'#4b7f9288',2);}
    oval(c,0,0,45,35,'#bfdce0');oval(c,0,0,37,29,'#709aaa');
    poly(c,[[0,-24],[21,-11],[21,11],[0,24],[-21,11],[-21,-11]],'#b3dfe5','#e2f9f3',1.5);
    for(let i=0;i<6;i++){const a=i*TAU/6;line(c,0,0,Math.cos(a)*24,Math.sin(a)*21,'#eefcf8',2);}
    poly(c,[[-23,60],[-24,69],[24,69],[23,60]],'#87aebb','#d7edea');
  });}
  drawGround(c,site){if(site?.featureId!=='icealtar')return false;const sprite=this._iceFloor();c.save();c.globalAlpha*=site.state==='cleared'?.65:1;c.drawImage(sprite.canvas,site.x-sprite.ox,site.y-sprite.oy,sprite.w,sprite.h);
    const active=site.state==='active',strength=relicActivationStrength(site);if(active||strength>0){c.globalAlpha*=active?.75:strength;c.strokeStyle='#e8ffff';c.lineWidth=2;c.beginPath();c.ellipse(site.x,site.y,46,35,0,0,TAU);c.stroke();}c.restore();return true;
  }
  drawProp(c,prop){if(prop?.site?.featureId!=='icealtar'||prop.type!=='runeRelicPart')return false;
    const sprite=this._stamp('ice-crystal',44,70,22,59,ctx=>{poly(ctx,[[-16,0],[-11,-14],[13,-14],[17,0]],'#61889b','#b0d3df');poly(ctx,[[-10,-14],[-5,-43],[2,-55],[10,-36],[11,-14]],'#a3dce7','#e8faf8',1.5);poly(ctx,[[2,-55],[2,-16],[-10,-14],[-5,-43]],'#daeff1');line(ctx,2,-52,9,-35,'#ffffff',1);});
    c.save();c.globalAlpha*=prop.site.state==='cleared'?.7:1;c.drawImage(sprite.canvas,prop.x-sprite.ox,prop.y-sprite.oy,sprite.w,sprite.h);c.restore();return true;
  }
}
