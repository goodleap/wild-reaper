import {TREE_PROFILES,ROCK_FRAGMENTS} from './terrain.js';
// Hand-painted Canvas scenery. The expensive brushwork is rasterized once;
// world rendering only projects and composites these bounded, reusable images.
// No cast shadows are baked here: the shared sunlight/shadow mask owns those.
const TAU=Math.PI*2,PIXEL_LIMIT=3*1024*1024;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const rng=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const poly=(c,points,color,stroke=null,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const stroke=(c,points,color,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill();};
function leaf(c,x,y,length,width,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(-length*.5,0);c.quadraticCurveTo(-length*.03,-width,length*.5,0);c.quadraticCurveTo(length*.03,width,-length*.5,0);c.fill();c.restore();}
function tuft(c,x,y,size,seed,alpha=1){const r=rng(seed+13);c.save();c.globalAlpha*=alpha;for(let i=0;i<5;i++){const dx=(i-2)*size*.5,tip=dx+(r()-.5)*size*2,h=size*(2+r()*2.8);c.fillStyle=['#66835b','#54744d','#789065','#3a5c3e','#82926a'][i];c.beginPath();c.moveTo(x+dx,y);c.quadraticCurveTo(x+dx-size*.9,y-h*.55,x+tip,y-h);c.quadraticCurveTo(x+dx+size*.25,y-h*.45,x+dx+size*.7,y);c.fill();}c.restore();}
function lobedPath(c,x,y,rx,ry,seed,count=28){const points=[];for(let i=0;i<count;i++){const a=i*TAU/count,f=.87+hash(i+seed,seed)*.16;points.push([x+Math.cos(a)*rx*f,y+Math.sin(a)*ry*f]);}c.beginPath();let prev=points.at(-1);c.moveTo((prev[0]+points[0][0])*.5,(prev[1]+points[0][1])*.5);for(let i=0;i<count;i++){const p=points[i],next=points[(i+1)%count];c.quadraticCurveTo(p[0],p[1],(p[0]+next[0])*.5,(p[1]+next[1])*.5);}c.closePath();}

// Low, separated fragments fill the same small collision footprint as a rock.
// Gaps remain transparent; no intact boulder or ground shadow sits behind them.
export function paintRockFragments(c,ruins=false){
  const random=rng(329),pieces=ROCK_FRAGMENTS,tops=ruins?['#a6ad92','#b2b79b','#919f83','#a5ae90','#a1ab8b']:['#9fae8d','#b1b798','#8e9f82','#a2af8d','#99a988'];
  for(let j=0;j<pieces.length;j++){
    const {points,depth}=pieces[j];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];if(b[0]>=a[0])continue;
      poly(c,[a,b,[b[0],b[1]+depth],[a[0],a[1]+depth]],i%2?'#5d755b':'#73846a','#304839',.9);
      stroke(c,[[a[0],a[1]+depth],[b[0],b[1]+depth]],'#2f473877',.7);
    }
    poly(c,points,tops[j],'#40563e',.9);
    c.save();poly(c,points,null);c.clip();
    const ridge=[points.reduce((n,p)=>n+p[0],0)/points.length-2,points.reduce((n,p)=>n+p[1],0)/points.length-3];
    poly(c,[points[0],points[1],ridge,points.at(-1)],ruins?'#879879':'#7f9575');
    poly(c,[points[1],points[2],points[3],ridge],ruins?'#bac1a1':'#b9c2a0');
    poly(c,[ridge,points[3],points[4],points[5]],ruins?'#a3ae8c':'#9eae8c');
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    for(let i=0;i<34;i++){const x=minX+random()*(maxX-minX),y=minY+random()*(maxY-minY);stroke(c,[[x,y],[x+.6+random()*2,y+random()*.65]],i%3?'#2c463226':'#e6dfb352',.5);}
    const [a,b,d]=points;
    stroke(c,[[a[0]+(b[0]-a[0])*.55,a[1]+(b[1]-a[1])*.55],[b[0]+(d[0]-b[0])*.25+3,b[1]+6]],'#667b5970',.75);
    if(j===0||j===4)for(let i=0;i<9;i++){const x=minX+4+random()*(maxX-minX-8),y=minY+4+random()*8;leaf(c,x,y,2+random()*3,.7+random(),random()*TAU,['#657f49','#829751','#afba70'][i%3]);}
    c.restore();
    stroke(c,points.slice(0,4),'#d8d4ac9c',.9);
  }
}

export class SceneryArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.pixels=0;this.builds=0;}
  get diagnostics(){return {entries:this.cache.size,size:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:PIXEL_LIMIT*4,builds:this.builds};}
  get cacheStats(){return this.diagnostics;}
  _image(key,w,h,scale,paint){let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}const canvas=this.makeCanvas();canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const c=canvas.getContext('2d');c.setTransform(scale,0,0,scale,0,0);c.lineCap='round';c.lineJoin='round';paint(c);image={canvas,w,h,pixels:canvas.width*canvas.height};while(this.pixels+image.pixels>PIXEL_LIMIT&&this.cache.size){const oldest=this.cache.keys().next().value;this.pixels-=this.cache.get(oldest).pixels;this.cache.delete(oldest);}this.cache.set(key,image);this.pixels+=image.pixels;this.builds++;return image;}
  _variant(seed,count=5){return Math.floor(hash((seed||0)*913,37)*count);}
  _groundTile(variant){return this._image(`ground:${variant}`,384,384,1,c=>{
    const r=rng(711+variant*67);
    // Fine, low-contrast flecks suggest soil without a repetitive tile border.
    for(let i=0;i<2000;i++){const x=r()*384,y=r()*384;c.fillStyle=i%3?'#a3ae7710':'#142c2319';c.fillRect(x,y,.5+r()*1.4,.4+r()*.7);}
    for(let i=0;i<62;i++){const x=8+r()*368,y=15+r()*357,s=.65+r()*.8;tuft(c,x,y,s,i+variant*100,.32+r()*.25);}
    for(let i=0;i<63;i++){const x=5+r()*374,y=5+r()*374,a=r()*TAU,l=2+r()*5;leaf(c,x,y,l,l*.22,a,['#9d96522a','#a69c6235','#536e4835','#b6ab7330'][i%4]);if(i%5===0)stroke(c,[[x-l*.4,y],[x+l*.3,y+1]],'#25382a50',.6);}
    for(let i=0;i<8;i++){const x=15+r()*350,y=15+r()*350;stroke(c,[[x-7,y-3],[x-1,y],[x+5,y+1]],'#1a30224a',1.5);stroke(c,[[x-6,y-3.5],[x+4,y]],'#9a99722c',.7);}
  });}
  _groundPatch(variant){return this._image(`patch:${variant}`,384,300,1,c=>{
    const r=rng(952+variant*113),moss=variant%2===0;
    // Soft, irregular brush layers, rather than opaque ellipses or flat cells.
    for(let layer=0;layer<11;layer++){const inset=layer*4;c.fillStyle=moss?'#6b7e3d04':'#7d6b4304';lobedPath(c,192,150,184-inset,136-inset,variant*41+9,38);c.fill();}
    for(let i=0;i<95;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=192+Math.cos(a)*156*rr,y=150+Math.sin(a)*111*rr;if(moss){leaf(c,x,y,5+r()*13,2+r()*3,r()*TAU,i%3?'#6a843324':'#8e954226');}else{c.fillStyle=i%2?'#b09a6a15':'#2336241b';c.fillRect(x,y,1+r()*4,.6+r()*1.2);}}
    for(let i=0;i<12;i++){const a=r()*TAU,rr=.6+r()*.3;tuft(c,192+Math.cos(a)*166*rr,150+Math.sin(a)*120*rr,.9+r()*.7,700+i,.5);}
    if(variant===3){for(let i=0;i<8;i++){const x=160+r()*73,y=117+r()*56;poly(c,[[x-3,y],[x-2,y-2],[x+2,y-3],[x+4,y],[x+1,y+2]],'#70765a60');stroke(c,[[x-2,y-2],[x+2,y-3],[x+3,y-1]],'#b2ad7540',.65);}}
  });}
  drawGround(c,camX,camY,w,h){c.fillStyle='#2b4130';c.fillRect(0,0,w,h);const ox=w*.5-camX,oy=h*.5-camY,tile=384;
    const minX=Math.floor(-ox/tile),minY=Math.floor(-oy/tile),maxX=Math.ceil((w-ox)/tile),maxY=Math.ceil((h-oy)/tile);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){const image=this._groundTile(Math.floor(hash(x+19,y-51)*4));c.drawImage(image.canvas,x*tile+ox,y*tile+oy);}
    const spacing=438;
    for(let y=Math.floor((-oy-300)/spacing);y<=Math.ceil((h-oy+300)/spacing);y++)for(let x=Math.floor((-ox-384)/spacing);x<=Math.ceil((w-ox+384)/spacing);x++){const px=x*spacing+hash(x+3,y+11)*240+ox,py=y*spacing+hash(y+7,x+19)*230+oy;if(px+192<0||px-192>w||py+150<0||py-150>h)continue;const image=this._groundPatch(Math.floor(hash(x+81,y+39)*4));c.drawImage(image.canvas,px-192,py-150);}
  }
  _trunk(v){const p=TREE_PROFILES[v],w=Math.ceil(80*p.trunkWidth+16),h=Math.ceil(100*p.trunkHeight+30);return this._image(`trunk:${v}`,w,h,2,c=>{c.translate(w/2,h-28);c.scale(p.trunkWidth,p.trunkHeight);const r=rng(v+418),root=[[-10,-15],[-22,-5],[-24,3],[-12,6],[-17,16],[-11,20],[-2,10],[5,12],[13,19],[19,15],[12,6],[24,0],[20,-5],[9,-16]];
    poly(c,root,'#5e6041','#293d2c',1.5);poly(c,[[-10,-12],[-6,-4],[-19,3],[-14,3]],'#a2935d77');poly(c,[[7,-10],[11,2],[19,0],[13,-4]],'#baa76a65');
    const bark=c.createLinearGradient(-12,0,12,0);bark.addColorStop(0,'#414b31');bark.addColorStop(.45,'#746846');bark.addColorStop(.8,'#a48c59');bark.addColorStop(1,'#796b43');c.fillStyle=bark;c.strokeStyle='#2d3d2c';c.lineWidth=1.2;c.beginPath();c.moveTo(-10,7);c.bezierCurveTo(-7,-11,-12,-39,-7,-66);c.lineTo(3,-76);c.lineTo(11,-71);c.bezierCurveTo(4,-38,7,-13,12,7);c.quadraticCurveTo(1,14,-10,7);c.fill();c.stroke();
    for(const [x,y,dx,dy,w] of [[-5,-39,-31,-65,7],[5,-47,29,-72,8],[-4,-52,-18,-83,5]]){stroke(c,[[x,y],[dx*.7,dy+9],[dx,dy]],'#50573a',w+2);stroke(c,[[x+2,y-1],[dx*.7+1,dy+7],[dx+1,dy]],'#9c8855',w*.52);}
    for(let i=0;i<13;i++){const x=-8+r()*17,y=-8-r()*49,l=5+r()*21;stroke(c,[[x,y],[x+(r()-.5)*2,y-l*.35],[x+(r()-.5)*2,y-l]],i%3?'#3b47368a':'#d0b67770',.55+r()*.85);}
    c.strokeStyle='#3b4333';c.lineWidth=1.5;c.beginPath();c.ellipse(-1,-26,2.3,5.6,.14,0,TAU);c.stroke();stroke(c,[[1,-30],[2,-26],[1,-22]],'#bc9f65',.8);
    for(let i=0;i<11;i++){const x=-12+r()*26,y=3+r()*12;leaf(c,x,y,3+r()*6,1+r()*2,r()*TAU,['#506b39','#779149','#94a553'][i%3]);}
    tuft(c,-19,12,1.15,931+v,.9);tuft(c,16,16,1.2,817+v,.85);
  });}
  _canopy(v){const p=TREE_PROFILES[v],w=Math.ceil(p.rx*2+18),h=Math.ceil(p.ry*2+18);return this._image(`canopy:${v}`,w,h,2,c=>{
    c.translate(w/2,h/2);const r=rng(355+v*37),rx=p.rx,ry=p.ry;
    // Distinct crown structures, not five textures on the same round crown.
    const forms=[
      [[-.97,.15],[-1,-.16],[-.87,-.46],[-.63,-.64],[-.50,-.92],[-.17,-.89],[.05,-1],[.35,-.91],[.50,-.65],[.77,-.67],[.85,-.43],[1,-.15],[.94,.14],[.98,.40],[.76,.63],[.49,.71],[.30,.96],[-.05,.87],[-.24,1],[-.49,.75],[-.79,.69],[-.84,.43]],
      [[0,-1],[.18,-.85],[.33,-.73],[.37,-.48],[.59,-.35],[.57,-.14],[.80,.11],[.70,.30],[1,.51],[.84,.75],[.51,.93],[.19,.87],[-.05,1],[-.40,.91],[-.80,.79],[-1,.56],[-.80,.39],[-.88,.20],[-.63,.02],[-.63,-.18],[-.45,-.35],[-.42,-.55],[-.22,-.74]],
      [[-.92,.25],[-1,-.05],[-.71,-.25],[-.83,-.48],[-.45,-.62],[-.26,-.85],[.03,-.79],[.25,-1],[.50,-.90],[.63,-.63],[.84,-.58],[.83,-.36],[1,-.19],[.91,.15],[.70,.37],[.83,.55],[.47,.67],[.27,.90],[-.02,.78],[-.20,1],[-.56,.75],[-.69,.49]],
      [[-.94,.16],[-.83,-.18],[-.97,-.34],[-.67,-.56],[-.52,-.85],[-.23,-.79],[-.02,-1],[.28,-.89],[.46,-.64],[.76,-.50],[.90,-.18],[.81,.08],[1,.29],[.72,.54],[.57,.84],[.29,.86],[.04,1],[-.26,.81],[-.53,.91],[-.70,.61]],
      [[-.94,.30],[-1,-.02],[-.92,-.38],[-.74,-.54],[-.71,-.85],[-.43,-1],[-.16,-.86],[.07,-.95],[.27,-.66],[.18,-.38],[.45,-.22],[.58,-.38],[.88,-.18],[1,.02],[.85,.24],[.93,.48],[.65,.70],[.40,.68],[.18,1],[-.07,.87],[-.33,.99],[-.51,.68],[-.77,.66]]
    ];
    const outline=forms[v].map(([x,y],i)=>[x*rx+(hash(i+91,v+16)-.5)*2,y*ry+(hash(i+32,v+71)-.5)*2]);
    poly(c,outline,'#1d382b','#142c2355',1.5);const crown=c.createLinearGradient(-rx,ry,rx,-ry);crown.addColorStop(0,'#244a34');crown.addColorStop(.5,'#365c39');crown.addColorStop(1,v===3?'#7b9452':'#6e874a');
    c.save();poly(c,outline,null);c.clip();c.fillStyle=crown;c.fillRect(-rx-4,-ry-4,rx*2+8,ry*2+8);
    const masses=v===1?[[-.42,.46,.52,.29],[.38,.54,.59,.27],[-.28,.02,.47,.33],[.21,-.21,.47,.28],[.02,-.58,.36,.30]]:[[-.58,.06,.36,.45],[-.18,.47,.43,.31],[.38,.42,.48,.34],[-.40,-.49,.34,.35],[.0,-.29,.46,.44],[.42,-.52,.43,.34],[.63,-.03,.34,.39],[.02,.03,.43,.38]];
    for(let i=0;i<masses.length;i++){const [xx,yy,ww,hh]=masses[i],x=xx*rx,y=yy*ry;lobedPath(c,x,y+4,ww*rx+2,hh*ry+2,i+v*23,19);c.fillStyle='#14372965';c.fill();lobedPath(c,x+2,y-2,ww*rx,hh*ry,i+v*23,19);c.fillStyle=['#355e38','#43673c','#4f7240','#527643','#628249','#718d4e','#5f8045','#577a43'][i];c.fill();}
    const leaves=Math.round(rx*ry*.09);
    for(let i=0;i<leaves;i++){const x=-rx+r()*rx*2,y=-ry+r()*ry*2,lit=x/rx-y/ry>.15,l=2.5+r()*5;leaf(c,x,y,l,1+r()*1.4,-.8+r()*1.4,lit?['#adc07173','#8fa45a99','#c0d18548'][i%3]:['#6a8b4760','#20493080','#9aaa5650'][i%3]);if(i%11===0)stroke(c,[[x-3,y+3],[x+4,y-2]],'#173c2950',.8);}
    c.restore();for(let i=0;i<outline.length;i+=2){const [x,y]=outline[i];leaf(c,x,y,4.5,1.4,Math.atan2(y,x),'#496d3a');}
  });}
  _branchFoliage(v){return this._image(`leaf-branches:${v}`,132,106,2,c=>{
    c.translate(66,144);
    if(v===4){
      // A living asymmetrical crown: shorten the old sawn-off snag and join
      // both branch tips to small leaf masses inside the existing envelope.
      stroke(c,[[4,-44],[26,-78],[33,-111],[30,-125]],'#47513a',7);
      stroke(c,[[6,-45],[28,-78],[35,-111],[32,-124]],'#9a8a59',2.6);
      stroke(c,[[29,-101],[44,-110],[47,-119]],'#596344',3.5);
    }
    const clusters=v===4?[[24,-104,15,14],[29,-121,14,13],[45,-113,12,10]]:[[-27,-70,12,9]];
    for(let i=0;i<clusters.length;i++){
      const [x,y,rx,ry]=clusters[i],seed=2081+v*37+i*11,r=rng(seed);
      lobedPath(c,x,y,rx,ry,seed,19);c.fillStyle='#203e2d';c.fill();
      c.save();lobedPath(c,x,y,rx,ry,seed,19);c.clip();
      const tone=c.createLinearGradient(x-rx,y+ry,x+rx,y-ry);tone.addColorStop(0,'#355d38');tone.addColorStop(1,'#748d4f');c.fillStyle=tone;c.fillRect(x-rx,y-ry,rx*2,ry*2);
      for(let j=0;j<3;j++){const xx=x+(j-1)*rx*.45,yy=y+(j%2?-.22:.18)*ry;lobedPath(c,xx,yy,rx*.58,ry*.58,seed+j+3,14);c.fillStyle=['#4a6b3b','#688447','#53773f'][j];c.fill();}
      for(let j=0;j<50;j++){const xx=x-rx+r()*rx*2,yy=y-ry+r()*ry*2;leaf(c,xx,yy,2+r()*3,.6+r(),-.7+r()*1.3,['#b1bd756b','#8fa35e83','#365d3880'][j%3]);}
      c.restore();
    }
  });}
  drawTree(c,prop,canopyAlpha=1){const v=Number.isInteger(prop.treeForm)?prop.treeForm:this._variant(prop.seed),p=TREE_PROFILES[v],s=prop.scale||1,trunk=this._trunk(v),crown=this._canopy(v),cw=prop.crownWidth||1,ch=prop.crownHeight||1;c.save();c.translate(prop.x,prop.y);c.scale(s,s);c.drawImage(trunk.canvas,-trunk.w/2,-trunk.h+28,trunk.w,trunk.h);c.globalAlpha*=Math.max(0,Math.min(1,canopyAlpha));
    if(v===2||v===4){const foliage=this._branchFoliage(v);c.drawImage(foliage.canvas,-66,-144,foliage.w,foliage.h);}
    c.drawImage(crown.canvas,p.x-crown.w*cw/2,p.y-crown.h*ch/2,crown.w*cw,crown.h*ch);c.restore();}
  _rock(v){return this._image(`rock:${v}`,96,120,2,c=>{c.translate(48,72);if(v===3){paintRockFragments(c);return;}const r=rng(148+v*27);
    const forms=[
      [[-35,4],[-32,-21],[-23,-38],[-5,-49],[14,-45],[28,-30],[35,-8],[34,16],[22,29],[3,34],[-20,28],[-34,16]],
      [[-35,1],[-29,-14],[-13,-24],[15,-22],[29,-12],[36,2],[33,19],[15,30],[-12,32],[-31,22]],
      [[-34,13],[-31,-18],[-16,-29],[-5,-61],[14,-53],[26,-28],[33,-11],[35,13],[21,28],[1,35],[-23,27]],
      [[-35,8],[-32,-23],[-22,-46],[-5,-53],[4,-43],[8,-50],[24,-39],[32,-17],[34,13],[25,29],[6,35],[-19,31]],
      [[-35,12],[-33,-6],[-23,-15],[-18,-34],[-3,-44],[16,-40],[27,-21],[29,-7],[35,1],[35,22],[21,29],[3,34],[-20,29]]
    ],outline=forms[v],top=[-49,-24,-61,-53,-44][v],edge=v===1?-8:-16;
    poly(c,outline,'#586b57','#2d4438',1.25);const light=c.createLinearGradient(-34,32,28,top);light.addColorStop(0,'#435d49');light.addColorStop(.43,'#687d65');light.addColorStop(1,'#b5b798');
    c.save();poly(c,outline,null);c.clip();c.fillStyle=light;c.fillRect(-38,top-3,76,top*-1+41);
    if(v===1){poly(c,[[-34,-5],[-14,-21],[14,-19],[30,-6],[13,3],[-17,4]],'#a3ac89');poly(c,[[-35,3],[-17,4],[13,3],[12,30],[-17,31]],'#5c7459');poly(c,[[13,3],[34,-1],[33,20],[12,30]],'#7f9173');stroke(c,[[-31,-4],[-13,-22],[14,-20],[30,-7]],'#d6d2a28a',1.1);}
    else if(v===2){poly(c,[[-31,-18],[-16,-29],[-5,-61],[3,-26],[-7,-10]],'#88977b');poly(c,[[-5,-61],[14,-53],[26,-28],[3,-26]],'#b5b99a');poly(c,[[3,-26],[26,-28],[34,-9],[9,1]],'#97a285');poly(c,[[-31,-18],[-7,-10],[9,1],[1,35],[-23,27],[-34,13]],'#536d56');poly(c,[[9,1],[34,-9],[35,13],[21,28],[1,35]],'#718970');stroke(c,[[-5,-60],[14,-52],[26,-27]],'#e1dcba88',1);}
    else {poly(c,[[-32,-21],[-23,top+11],[-5,top],[14,top+4],[28,top+19],[34,edge],[7,edge-5],[-11,edge+3]],'#99a587');poly(c,[[-32,-21],[-11,edge+3],[4,8],[3,34],[-20,28],[-34,16]],'#536c53');poly(c,[[7,edge-5],[34,edge],[34,16],[22,29],[3,34],[4,8]],'#7e9073');poly(c,[[-23,top+11],[-5,top],[14,top+4],[28,top+19],[3,top+13],[-5,edge-6]],'#b3b897');}
    for(let i=0;i<280;i++){const x=-36+r()*72,y=top+r()*(38-top);stroke(c,[[x,y],[x+.5+r()*2,y-.3+r()*.9]],i%3?'#293f3220':'#dfdeaa35',.4+r()*.7);}
    if(v!==4){stroke(c,[[-4,edge-8],[-10,edge+2],[-4,edge+11],[-9,6],[-6,19]],'#334d3c70',1.1);stroke(c,[[-8,edge+2],[-19,edge+6],[-21,edge+13]],'#3a4c3d60',.75);}
    for(let i=0;i<27;i++){const x=-28+r()*38,y=top+16+r()*13,l=2+r()*4;leaf(c,x,y,l,1+r()*2,r()*TAU,['#607c43','#82974e','#a5ae66','#698541'][i%4]);}c.restore();
    if(v===4){for(const [x,y,k] of [[-21,12,.67],[22,14,.48],[5,24,.35]]){poly(c,[[x-17*k,y+6*k],[x-18*k,y-11*k],[x-9*k,y-24*k],[x+9*k,y-22*k],[x+19*k,y-7*k],[x+16*k,y+11*k],[x,y+17*k]],'#687c60','#304c3a',1);poly(c,[[x-18*k,y-11*k],[x-9*k,y-24*k],[x+9*k,y-22*k],[x+19*k,y-7*k],[x,y-3*k]],'#aab18f');poly(c,[[x,y-3*k],[x+19*k,y-7*k],[x+16*k,y+11*k],[x,y+17*k]],'#879779');stroke(c,[[x-8*k,y-24*k],[x+9*k,y-22*k],[x+17*k,y-9*k]],'#d0ceaa83',.8);}}
    tuft(c,-26,27,.85,v+813,.95);tuft(c,23,29,.75,v+711,.8);
  });}
  drawRock(c,prop){const v=Number.isInteger(prop.rockForm)?prop.rockForm:this._variant(prop.seed),image=this._rock(v),s=prop.r/36;c.drawImage(image.canvas,prop.x-48*s,prop.y-72*s,96*s,120*s);}
  _log(v){return this._image(`log:${v}`,194,60,2,c=>{c.translate(97,31);const r=rng(297+v*41);poly(c,[[-68,-14],[-54,-16],[45,-17],[65,-13],[73,-5],[72,7],[64,15],[-66,14],[-75,6],[-76,-7]],'#5f5538','#2b3b2c',1.3);poly(c,[[-68,-14],[-54,-16],[45,-17],[65,-13],[68,-6],[-67,-4]],'#978051');poly(c,[[-69,6],[67,7],[65,15],[-66,14],[-74,7]],'#464b33');
    for(let i=0;i<21;i++){const y=-13+r()*26,x=-60+r()*94;stroke(c,[[x,y],[x+10+r()*9,y+(r()-.5)*3],[x+25+r()*9,y+(r()-.5)*3]],i%3?'#383f2b90':'#c7a96b85',.55+r()*1.1);}
    if(v%3!==1){poly(c,[[-34,-12],[-27,-26],[-23,-25],[-26,-11]],'#6d5c3c','#33452d',1);poly(c,[[-28,-25],[-26,-28],[-22,-27],[-23,-24]],'#c0a06b');}if(v%3===2){poly(c,[[18,-10],[23,-22],[27,-26],[30,-25],[27,-18],[26,-8]],'#6e6140','#38482e',1);stroke(c,[[25,-22],[28,-25]],'#c7ae78',2);}
    for(const side of [-1,1]){const x=side*67;oval(c,x,0,10.5,14,side>0?'#c0a371':'#a0895c');c.strokeStyle='#6c6441';c.lineWidth=1.2;c.beginPath();c.ellipse(x,0,10.5,14,0,0,TAU);c.stroke();for(let j=1;j<=3;j++){c.strokeStyle=j%2?'#705f3f80':'#e1c28c90';c.lineWidth=.75;c.beginPath();c.ellipse(x+.7,-.4,2+j*2,2+j*3,0,.13,TAU-.1);c.stroke();}stroke(c,[[x,1],[x+4,6],[x+6,11]],'#6a583aa0',.9);stroke(c,[[x,1],[x-1,-5],[x+1,-11]],'#6a583a80',.75);}
    if(v%3===1){oval(c,67,0,6,9,'#393e2e');oval(c,69,-1,3.7,6,'#5b5338');stroke(c,[[63,6],[67,9],[71,7]],'#dfc18a',.8);}
    for(let i=0;i<45;i++){const x=-21+r()*61,y=-15+r()*9;leaf(c,x,y,3+r()*7,1+r()*2,-.3+r()*.6,['#4d713b','#769349','#9eaa61','#60813f'][i%4]);}
    for(const [x,y] of [[-39,-5],[-34,-8]]){stroke(c,[[x,y],[x,y-5]],'#ae9b71',1.7);c.fillStyle='#c7b082';c.beginPath();c.moveTo(x-4,y-5);c.quadraticCurveTo(x,y-11,x+4,y-5);c.quadraticCurveTo(x,y-3,x-4,y-5);c.fill();}
  });}
  drawLog(c,prop){const image=this._log(Number.isInteger(prop.logForm)?prop.logForm:this._variant(prop.seed));c.save();c.translate(prop.x,prop.y);c.rotate(prop.angle||0);c.scale((prop.halfLength||60)/67,prop.r/15);c.drawImage(image.canvas,-97,-31,194,60);c.restore();}
  _hut(region,occupied,spent,depth,width){const key=`hut:${region}:${occupied}:${spent}:${width}:${depth}`;return this._image(key,88,91,2,c=>{c.translate(44,79);const w=width,d=depth,wallTop=-d-8,roofTop=wallTop-24,marsh=region==='marsh',ruins=region==='ruins',r=rng(851+(occupied?9:0));
    // Compact footprint and proportions intentionally match the small v21 hut.
    poly(c,[[-w/2,0],[-w/2,wallTop],[w/2,wallTop],[w/2,0]],ruins?'#777767':marsh?'#6e6f55':'#9a8055','#31432e',1.2);
    if(ruins){for(let row=0;row<4;row++){const y=wallTop+row*9;for(let j=0;j<5;j++){const x=-w/2+j*15-(row%2?7:0),ww=Math.min(14,w/2-x);if(ww>0){c.fillStyle=['#8a8774','#7e826e','#92917a'][(row+j)%3];c.fillRect(Math.max(-w/2,x),y+.8,Math.min(ww,w/2-Math.max(-w/2,x)),7);}}}}else{for(let i=0;i<6;i++){const y=wallTop+i*6;c.fillStyle=['#87734c','#ae9160','#9b8055','#a88a59','#8d764d','#9f8557'][i];c.fillRect(-w/2+1,y+1,w-2,5);stroke(c,[[-w/2+2,y+5],[w/2-2,y+5]],'#554d355f',.7);for(let k=0;k<4;k++){const x=-w/2+2+r()*(w-12);stroke(c,[[x,y+2],[Math.min(w/2-2,x+5+r()*8),y+2.5]],'#d1b2766a',.5);}}}
    // Timber framing and a recessed arched plank door establish real depth.
    for(const x of [-w/2+1,w/2-3]){c.fillStyle='#584d32';c.fillRect(x,wallTop,3,-wallTop);stroke(c,[[x+2,wallTop+2],[x+2,-1]],'#b294607a',.65);}
    c.fillStyle='#253829';c.beginPath();c.moveTo(-8,0);c.lineTo(-8,-21);c.quadraticCurveTo(0,-29,8,-21);c.lineTo(8,0);c.closePath();c.fill();c.strokeStyle='#5a5136';c.lineWidth=2;c.stroke();if(!spent){c.fillStyle='#796545';c.fillRect(-6,-20,11,20);for(const xx of [-3,1])stroke(c,[[xx,-20],[xx,-1]],'#453e2c',.7);stroke(c,[[-5,-19],[4,-19]],'#c2a26b88',.9);oval(c,3,-10,1,1.2,'#dbc688');}else{poly(c,[[-7,-22],[-2,-20],[-2,0],[-7,0]],'#806948');}
    for(const side of [-1,1]){const x=side*w*.33;c.fillStyle='#514c35';c.fillRect(x-5,-29,10,12);const light=c.createLinearGradient(x,-28,x,-18);light.addColorStop(0,spent?'#384837':occupied?'#ba8350':'#efd29a');light.addColorStop(1,spent?'#293b2b':occupied?'#855337':'#ba8f4c');c.fillStyle=light;c.fillRect(x-3.5,-27.5,7,9);stroke(c,[[x,-28],[x,-18]],'#6b5a39',.9);stroke(c,[[x-4,-23],[x+4,-23]],'#6b5a39',.8);stroke(c,[[x-6,-16],[x+6,-16]],'#baa174',1.5);}
    // The chimney is part of the silhouette; no looping smoke obscures combat.
    const chimneyX=w/2-13;c.fillStyle='#727565';c.fillRect(chimneyX,roofTop-7,7,20);for(let yy=roofTop-3;yy<roofTop+11;yy+=5)stroke(c,[[chimneyX,yy],[chimneyX+7,yy]],'#445747',.6);c.fillStyle='#a3a38a';c.fillRect(chimneyX-1.5,roofTop-8,10,3);c.fillStyle='#374236';c.fillRect(chimneyX+.5,roofTop-8,6,1.2);
    const roof=[[-w/2-6,wallTop+3],[-w/2+4,roofTop],[w/2-4,roofTop],[w/2+6,wallTop+3]];poly(c,roof,marsh?'#445f51':ruins?'#57675c':'#4a5b3c','#2b4231',1.5);c.save();poly(c,roof,null);c.clip();
    for(let row=0;row<5;row++){const yy=roofTop+row*5.5;for(let col=0;col<9;col++){const xx=-w/2-10+col*9+(row%2?4.5:0),tone=(row+col+(occupied?1:0))%5;poly(c,[[xx,yy],[xx+8.5,yy],[xx+9,yy+5.2],[xx+1,yy+6]],(marsh?['#627868','#58705e','#758773','#4f6858','#7b8d75']:ruins?['#6c7a6b','#7e8877','#576a61','#87917d','#657469']:['#6a7b50','#7e895b','#596f46','#8b9362','#6f8050'])[tone]);stroke(c,[[xx+1,yy+5.2],[xx+8,yy+4.9]],'#273f2d88',.75);stroke(c,[[xx+1,yy+.7],[xx+7,yy+.7]],'#ccd0a02a',.7);}}
    for(let i=0;i<12;i++){const x=-w*.3+r()*w*.5,y=roofTop+8+r()*14;leaf(c,x,y,2+r()*4,1+r(),r()*TAU,'#a1ac6140');}c.restore();stroke(c,[[-w/2+4,roofTop],[w/2-4,roofTop]],'#b4b48b',1.2);stroke(c,[[-w/2-6,wallTop+3],[w/2+6,wallTop+3]],'#233b2a',2.5);stroke(c,[[-w/2-5,wallTop+2],[w/2+5,wallTop+2]],'#82906499',.8);
    // Moss clings to a few shingles; ivy adds asymmetry without a larger hut.
    for(let i=0;i<8;i++){const y=-27+i*3.7,x=-w/2+4+Math.sin(i)*1.5;leaf(c,x,y,4,1.5,i%2?.5:-.5,['#627b43','#8c9a58','#536d3c'][i%3]);}
  });}
  drawHut(c,site,behind=false){const w=site.width||54,d=site.depth||28,region=site.region||'forest';c.save();c.translate(site.x,site.y);c.fillStyle='#43513b';c.fillRect(-w/2-2,-d,w+4,d+3);for(let i=0;i<2;i++){poly(c,[[-10,i*3],[10,i*3],[11,i*3+3],[-11,i*3+3]],i?'#85896c':'#6c785b');stroke(c,[[-10,i*3],[10,i*3]],'#bbc39b77',.75);}if(region==='marsh')for(const x of [-w/2+3,w/2-3])stroke(c,[[x,-4],[x,5]],'#8f8860',2.5);const image=this._hut(region,site.type==='occupied'&&site.state!=='cleared',site.state==='spent',d,w);if(behind)c.globalAlpha*=.36;c.drawImage(image.canvas,-44,-79,88,91);c.restore();}
}
