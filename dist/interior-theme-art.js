// Paint-only theme vocabulary. These hooks run while baking small cached
// textures and sprites; collision and room topology remain authored data.
const TAU=Math.PI*2;
const rng=seed=>{let n=(seed*2654435761)>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};};
const themes={
  forest:{floor:'#8b8768',light:'#b2ad82',dark:'#647552',ink:'#3c5842',wall:'#6e7d59',cap:'#a2ac7e',shine:'#ced3a2',accent:'#7b9758',wood:'#8c7950',water:'#719b8160',void:'#263c2c'},
  marsh:{floor:'#748777',light:'#a6b499',dark:'#496d5e',ink:'#35574e',wall:'#698474',cap:'#a1b09a',shine:'#d0d7b6',accent:'#84a17a',wood:'#786e49',water:'#81b1a174',void:'#243e37'},
  ruins:{floor:'#aaa48a',light:'#d0c5a4',dark:'#848c71',ink:'#526953',wall:'#879477',cap:'#b8b99a',shine:'#ddd8b5',accent:'#83996a',wood:'#967c55',water:'#8ba89b56',void:'#3b493b'},
  beach:{floor:'#b8aa87',light:'#ddd0a9',dark:'#938c71',ink:'#5f7161',wall:'#a29b7e',cap:'#c6bc96',shine:'#e7dab2',accent:'#a3b4a0',wood:'#a18b65',water:'#81b5ac74',void:'#3b4f49'},
  mountain:{floor:'#94998c',light:'#bcc3af',dark:'#6f7c73',ink:'#485e55',wall:'#788c80',cap:'#acb8a3',shine:'#d4ddc6',accent:'#91aaa0',wood:'#95876b',water:'#8aadb173',void:'#2c403a'},
  snow:{floor:'#b1c5c2',light:'#e0ece0',dark:'#87a7ab',ink:'#557d83',wall:'#86a8ae',cap:'#c8ded5',shine:'#f0f5e4',accent:'#b3d5da',wood:'#9a9881',water:'#91becb55',void:'#304d55'},
  city:{floor:'#a99b83',light:'#ccbea0',dark:'#847e68',ink:'#596151',wall:'#938f74',cap:'#bdb69a',shine:'#e0d3b1',accent:'#978963',wood:'#9d8058',water:'#7d9e9760',void:'#3c4238'},
  ember:{floor:'#888076',light:'#b0a08c',dark:'#655f59',ink:'#4b5048',wall:'#78786a',cap:'#a09b84',shine:'#c4b797',accent:'#bf8e5f',wood:'#8b7454',water:'#a5907750',void:'#343b34'}
};
export const INTERIOR_THEME_PROP_RADII=Object.freeze({rootCluster:22,iceSpire:23,oreCluster:24,shellPile:20,brokenColumn:23});
export function interiorTheme(theme){return themes[theme]||null;}
const stroke=(c,p,color,width=1)=>{c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const poly=(c,p,color,edge=null,width=1)=>{c.beginPath();p.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,color,angle=0)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),angle,0,TAU);c.fillStyle=color;c.fill();};
function patch(c,x,y,rx,ry,seed){const r=rng(seed),pts=Array.from({length:14},(_,i)=>{const a=i*TAU/14,s=.9+r()*.12;return[x+Math.cos(a)*rx*s,y+Math.sin(a)*ry*s];});const last=pts.at(-1),first=pts[0];c.beginPath();c.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);pts.forEach(([x,y],i)=>{const q=pts[(i+1)%pts.length];c.quadraticCurveTo(x,y,(x+q[0])/2,(y+q[1])/2);});c.closePath();}
function root(c,x,y,length,angle,p,width=3){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(-length/2,0);c.bezierCurveTo(-length*.18,-7,length*.15,8,length/2,0);c.strokeStyle=p.ink;c.lineWidth=width+1;c.stroke();c.strokeStyle=p.wood;c.lineWidth=width;c.stroke();c.beginPath();c.moveTo(length*.05,1);c.quadraticCurveTo(length*.2,-7,length*.26,-16);c.strokeStyle=p.wood;c.lineWidth=Math.max(1,width*.5);c.stroke();c.restore();}
function shell(c,x,y,s,p){poly(c,[[x-s,y+1],[x-s*.7,y-s*.5],[x,y-s*.8],[x+s*.7,y-s*.5],[x+s,y+1],[x,y+s*.4]],p.light,p.dark,.65);for(const dx of [-.5,0,.5])stroke(c,[[x,y+s*.25],[x+dx*s,y-s*.55]],p.dark+'80',.55);}
function crystal(c,x,y,w,h,p){poly(c,[[x-w,y],[x-w*.7,y-h*.7],[x,y-h],[x+w*.8,y-h*.65],[x+w,y],[x,y+w*.4]],p.cap,p.ink,1);poly(c,[[x,y-h],[x+w*.8,y-h*.65],[x+w,y],[x,y+w*.4]],p.wall);poly(c,[[x-w*.7,y-h*.7],[x,y-h],[x,y+w*.4],[x-w,y]],p.shine+'b0');stroke(c,[[x-w*.7,y-h*.7],[x,y-h],[x+w*.8,y-h*.65]],p.shine,1);}

export function paintInteriorFloor(c,theme,variant,size=256){
  const p=themes[theme];if(!p)return false;const r=rng(211+variant*103);c.fillStyle=p.floor;c.fillRect(0,0,size,size);
  if(theme==='city'||theme==='ruins'){
    const brick=theme==='city',bw=brick?64:85.333,bh=brick?32:64;
    for(let row=0,y=0;y<size;y+=bh,row++)for(let x=-bw;x<size;x+=bw){const xx=x+(row%2)*bw/2,gap=brick?1.4:2;
      poly(c,[[xx+gap,y+gap],[xx+bw-gap,y+gap],[xx+bw-gap,y+bh-gap],[xx+gap,y+bh-gap]],r()>.4?p.light+'66':p.dark+'22');stroke(c,[[xx+3,y+3],[xx+bw-3,y+3]],p.light+'80',1);stroke(c,[[xx+bw-gap,y+4],[xx+bw-gap,y+bh-gap],[xx+3,y+bh-gap]],p.dark+'80',.8);
      if(!brick&&r()>.73)stroke(c,[[xx+20,y+2],[xx+15,y+11],[xx+23,y+19],[xx+19,y+25]],p.ink+'60',.9);
      if(brick&&r()>.82)stroke(c,[[xx+8,y+12],[xx+bw-12,y+13]],p.dark+'40',.6);
    }
  }else if(theme==='snow'){
    for(let i=0;i<9;i++){const x=r()*size,y=r()*size,w=28+r()*48,h=18+r()*27;poly(c,[[x-w,y],[x-w*.4,y-h],[x+w*.65,y-h*.8],[x+w,y+h*.2],[x,y+h]],i%2?p.light+'25':p.dark+'18');stroke(c,[[x-w*.4,y-h],[x+w*.65,y-h*.8]],p.light+'60',1);}
    for(let i=0;i<28;i++){const x=r()*size,y=r()*size;stroke(c,[[x,y],[x+8+r()*18,y-2]],p.light+'4d',.9);}
  }else if(theme==='beach'){
    for(let i=0;i<23;i++){const x=r()*size,y=r()*size;c.beginPath();c.moveTo(x-16,y);c.quadraticCurveTo(x,y-4,x+18+r()*14,y-1);c.strokeStyle=p.light+'56';c.lineWidth=1.1;c.stroke();}
    for(let i=0;i<6;i++)shell(c,12+r()*(size-24),12+r()*(size-24),1.5+r()*2,p);
  }else if(theme==='mountain'||theme==='ember'){
    for(let i=0;i<10;i++){const x=r()*size,y=r()*size,w=15+r()*39,h=10+r()*21;poly(c,[[x-w,y-3],[x-w*.4,y-h],[x+w*.5,y-h*.8],[x+w,y],[x+w*.4,y+h],[x-w*.5,y+h*.7]],i%2?p.dark+'18':p.light+'18');}
    for(let i=0;i<7;i++){const x=15+r()*(size-35),y=12+r()*(size-35),d=6+r()*12;stroke(c,[[x-d,y-d],[x,y-2],[x+3,y+6],[x+d,y+d]],p.ink+'4d',.9);if(theme==='mountain')stroke(c,[[x-d+1,y-d],[x+1,y-2],[x+4,y+6]],p.light+'55',.7);}
  }else{
    for(let i=0;i<11;i++){const x=r()*size,y=r()*size;patch(c,x,y,22+r()*42,10+r()*26,i+31);c.fillStyle=i%2?p.dark+'16':p.light+'15';c.fill();}
    if(theme==='forest')for(let i=0;i<5;i++)root(c,20+r()*(size-40),20+r()*(size-40),16+r()*24,r()*2,p,1.1);
    if(theme==='marsh')for(let i=0;i<9;i++){const x=12+r()*(size-24),y=12+r()*(size-24);stroke(c,[[x-7,y],[x+6,y-1]],p.water,.9);}
  }
  for(let i=0;i<95;i++){const x=r()*size,y=r()*size;oval(c,x,y,.5+r()*1.4,.35+r()*.65,i%3?p.light+'32':p.ink+'25');}
  return true;
}

export function paintInteriorDetail(c,type,theme,variant=0){
  const p=themes[theme];if(!p)return false;const r=rng(811+variant*73);
  if(type==='water'){
    for(let i=0;i<3;i++){patch(c,0,0,114-i*8,70-i*7,31+variant);c.fillStyle=i===2?p.water:p.dark+(i?'16':'0c');c.fill();}
    for(let i=0;i<15;i++){const x=-82+r()*164,y=-40+r()*80;if((x*x)/8100+(y*y)/2304>1)continue;stroke(c,[[x-3,y],[x+5+r()*8,y-1]],p.light+'68',.9);}
  }else if(type==='roots'){
    for(let i=0;i<5;i++)root(c,-65+i*30,-15+r()*35,50+r()*40,-.8+r()*1.6,p,2.6);
    for(let i=0;i<20;i++){const x=-88+r()*176,y=-48+r()*96;oval(c,x,y,2+r()*4,.8+r(),p.accent+'66',r()*2);}
  }else if(type==='ice'){
    patch(c,0,0,112,66,31+variant);c.fillStyle=p.water;c.fill();
    for(let i=0;i<7;i++){const x=-78+r()*150,y=-42+r()*84;poly(c,[[x-18,y],[x-6,y-13],[x+26,y-11],[x+14,y+12]],p.shine+'3b');stroke(c,[[x-18,y],[x-6,y-13],[x+26,y-11]],p.shine+'8c',1);}
    stroke(c,[[-78,15],[-31,-5],[-12,7],[28,-17],[67,-9]],p.ink+'48',.9);
  }else if(type==='mosaic'){
    c.save();patch(c,0,0,101,63,51+variant);c.clip();
    for(let y=-65;y<65;y+=13)for(let x=-100;x<100;x+=16){const ring=Math.abs(x)/1.6+Math.abs(y),shade=ring>61&&ring<77?p.accent:ring<22?p.dark:p.light;poly(c,[[x+1,y+1],[x+14,y+1],[x+14,y+11],[x+1,y+11]],shade+'99');}
    c.restore();stroke(c,[[-71,-24],[-40,-12],[-27,12],[-3,20]],p.ink+'70',1.3);
  }else if(type==='moss'){
    for(let i=0;i<6;i++){patch(c,0,0,110-i*6,65-i*4,18+variant);c.fillStyle=p.accent+'0b';c.fill();}
    for(let i=0;i<65;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=Math.cos(a)*100*rr,y=Math.sin(a)*54*rr;oval(c,x,y,2+r()*4,.6+r()*1.2,(i%3?p.accent:p.light)+'48',-.5+r());}
  }else if(type==='rug'){
    poly(c,[[-80,-65],[80,-65],[80,65],[-80,65]],theme==='city'?'#79625c':'#786f54',p.light,2);c.strokeStyle=p.light+'bb';c.lineWidth=1;c.strokeRect(-73,-58,146,116);
    poly(c,[[0,-30],[32,0],[0,30],[-32,0]],p.accent,p.light,1);poly(c,[[0,-15],[16,0],[0,15],[-16,0]],p.ink+'bb');for(let x=-72;x<=72;x+=10){stroke(c,[[x,-68],[x,-64]],p.light,1.5);stroke(c,[[x,65],[x,69]],p.light,1.5);}
  }else if(type==='ash'){
    for(let i=0;i<5;i++){patch(c,0,0,110-i*8,62-i*5,31+variant);c.fillStyle=p.ink+'0c';c.fill();}
    for(let i=0;i<32;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=Math.cos(a)*97*rr,y=Math.sin(a)*52*rr;poly(c,[[x-3,y],[x,y-2],[x+4,y],[x,y+2]],i%5?p.dark+'a0':p.accent+'70');}
  }else{
    for(let i=0;i<20;i++){const a=r()*TAU,rr=Math.sqrt(r()),x=Math.cos(a)*97*rr,y=Math.sin(a)*52*rr,w=3+r()*7,h=2+r()*4;
      if(type==='shells'){shell(c,x,y,3+r()*3,p);continue;}
      poly(c,[[x-w,y],[x-w*.4,y-h],[x+w*.6,y-h*.7],[x+w,y+h*.5],[x,y+h]],(i%3?p.cap:p.wall)+'bb',p.ink+'66',.65);stroke(c,[[x-w*.4,y-h],[x+w*.6,y-h*.7]],p.shine+'88',.8);
      if(type==='ore'&&i%3===0)poly(c,[[x-2,y],[x,y-4],[x+4,y-2],[x+2,y+2]],p.accent);
    }
  }
  return true;
}

export function paintInteriorWallTheme(c,theme,{half,r,angle,surface='body'}){
  const p=themes[theme];if(!p)return;const ux=Math.cos(angle),uy=Math.sin(angle),rand=rng(211+Math.round(half)*11),cap=surface==='cap',project=cap?35:0;
  const at=(t,n,lift=0)=>[ux*t-uy*n,uy*t+ux*n-project-lift];
  if(theme==='forest'||theme==='marsh'){
    for(let t=-half+11;t<half;t+=58){const [x,y]=at(t,cap?-r*.2:0,cap?0:22);if(theme==='forest')root(c,x,y,cap?35:24,cap?angle:1.5,p,cap?2.8:2.2);else{oval(c,x,y,cap?9:5,cap?3:10,p.accent+'50',cap?angle:0);stroke(c,[[x+4,y-8],[x+5,y+7]],p.ink+'55',1);}}
  }else if(theme==='snow'){
    for(let t=-half;t<half;t+=31){const a=at(t,-r*.7,cap?0:28),b=at(t+24,-r*.7,cap?0:31),d=at(t+14,r*.65,cap?0:5);poly(c,[a,b,d],p.shine+'66');stroke(c,[a,b,d],p.shine+'70',.8);}
  }else if(theme==='mountain'||theme==='ember'){
    for(let t=-half+8;t<half;t+=43){const [x,y]=at(t,0,cap?0:27),s=cap?9:15;stroke(c,[[x-4,y-s*.3],[x+3,y],[x-2,y+s*.5],[x+5,y+s]],p.ink+'a0',1.1);if(theme==='mountain'){stroke(c,[[x-2,y-s*.3],[x+5,y],[x,y+s*.5]],p.accent+'b0',1.3);if(cap)poly(c,[[x-3,y-4],[x,y-7],[x+5,y-2],[x+1,y+2]],p.shine+'88');}else if(!cap&&Math.floor(t/43)%3===0)stroke(c,[[x+3,y],[x-2,y+s*.5]],p.accent+'80',.8);}
  }else if(theme==='beach'){
    for(const n of cap?[-r*.5,r*.2]:[8,19,29])stroke(c,[at(-half,cap?n:0,cap?0:n),at(-half*.2,cap?n+1:0,cap?0:n+2),at(half,cap?n:0,cap?0:n)],p.shine+'55',1.5);
    for(let t=-half+15;t<half;t+=71){const [x,y]=at(t,0,cap?0:10);oval(c,x,y,3,1.7,p.shine+'b0');}
  }else if(theme==='ruins'||theme==='city'){
    const step=theme==='city'?33:51;
    for(let t=-half+12;t<half;t+=step){if(cap){stroke(c,[at(t,-r),at(t,r)],p.ink+'70',1);if(theme==='ruins'&&rand()>.6){const [x,y]=at(t+9,0);stroke(c,[[x-3,y-3],[x+3,y-3],[x+3,y+3],[x-3,y+3]],p.shine+'80',1);}}else for(const lift of [8,20,32]){const [x,y]=at(t+(lift===20?step*.45:0),0,lift);stroke(c,[[x,y],[x,y+10]],p.ink+'65',1);}}
  }
}

export function paintInteriorThemeProp(c,type,theme){
  const p=themes[theme]||themes.forest;
  if(type==='rootCluster'){
    poly(c,[[-21,4],[-19,-9],[-9,-17],[7,-16],[20,-7],[22,5],[3,13]],p.wall,p.ink,1.2);
    for(const [x,y,len,a] of [[-5,-11,38,-.35],[2,-4,37,.25],[-3,5,35,-.15]])root(c,x,y,len,a,p,5);
    for(const [x,y] of [[-11,-13],[6,-12],[14,2]]){oval(c,x,y,5,2,p.accent,-.5);oval(c,x+4,y-3,4,1.7,p.light+'aa',.6);}
  }else if(type==='iceSpire'){
    oval(c,0,3,23,11,p.cap);crystal(c,-12,4,9,32,p);crystal(c,3,4,12,58,p);crystal(c,14,8,9,28,p);stroke(c,[[-16,9],[0,15],[20,9]],p.shine,1);
  }else if(type==='oreCluster'){
    poly(c,[[-23,5],[-24,-9],[-15,-25],[5,-30],[23,-15],[24,7],[3,15]],p.wall,p.ink,1.3);poly(c,[[-24,-9],[-15,-25],[5,-30],[3,-10],[-6,-4]],p.cap);poly(c,[[3,-10],[5,-30],[23,-15],[24,7],[3,15]],p.dark);
    const ore={...p,cap:p.accent,wall:p.dark,shine:p.light};crystal(c,-10,-2,6,20,ore);crystal(c,4,3,7,28,ore);crystal(c,14,6,5,15,ore);
  }else if(type==='shellPile'){
    oval(c,0,4,20,9,p.dark+'55');for(const [x,y,s] of [[-10,4,9],[8,5,10],[-2,-5,8],[12,-3,6]])shell(c,x,y,s,p);oval(c,-15,-3,4,2,p.cap);oval(c,2,11,4,1.5,p.cap);
  }else if(type==='brokenColumn'){
    poly(c,[[-23,1],[-15,-10],[16,-10],[23,1],[15,13],[-13,13]],p.wall,p.ink,1.3);
    poly(c,[[-15,4],[-15,-29],[-7,-34],[0,-29],[7,-36],[16,-30],[16,5],[0,12]],p.cap,p.ink,1.3);poly(c,[[0,-29],[7,-36],[16,-30],[16,5],[0,12]],p.wall);
    poly(c,[[-15,-29],[-7,-34],[0,-29],[7,-36],[16,-30],[7,-23],[-4,-21]],p.light,p.ink,1);for(const x of [-9,-3,6])stroke(c,[[x,-18],[x,4]],p.dark+'80',1);stroke(c,[[-12,-5],[0,0],[13,-5]],p.ink+'60',.9);
  }else return false;
  return true;
}
