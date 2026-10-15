const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,x1,y1,x2,y2,color,width=1)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
const polygon=(c,points,color,edge=null)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}};
const label=(c,text,x,y,color='#e2d7b5')=>{c.font='600 13px "PingFang SC",system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(text,x,y);};

function drawSea(c,view,time){
  c.fillStyle='#294c58';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  for(let y=Math.floor(view.minY/64)*64;y<view.maxY+64;y+=64)for(let x=Math.floor(view.minX/180)*180;x<view.maxX+180;x+=180){
    const phase=hash(x,y)*TAU,dy=Math.sin(time*.8+phase)*3,xx=x+hash(y,x)*100;
    c.beginPath();c.moveTo(xx-50,y+dy);c.bezierCurveTo(xx-23,y-5+dy,xx+9,y+6+dy,xx+53,y+dy);c.strokeStyle='#8db5b125';c.lineWidth=2;c.stroke();
  }
}
function shipGround(c,d,view,time){
  drawSea(c,view,time);const b=d.bounds;
  polygon(c,[[b.minX-40,b.minY-30],[b.maxX-80,b.minY-30],[b.maxX+150,0],[b.maxX-80,b.maxY+30],[b.minX-40,b.maxY+30],[b.minX-80,0]],'#4e4337','#ac9161');
  c.fillStyle='#94774f';c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  c.save();c.beginPath();c.rect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);c.clip();
  for(let y=b.minY;y<b.maxY;y+=29){
    c.fillStyle=['#957750','#9b8057','#a1875e','#8f744e'][Math.round((y-b.minY)/29)%4];c.fillRect(Math.max(view.minX,b.minX),y,Math.min(view.maxX,b.maxX)-Math.max(view.minX,b.minX),28);
    line(c,b.minX,y,b.maxX,y,'#564a373d',1);line(c,b.minX,y+2,b.maxX,y+2,'#e6cb9145');
    for(let x=Math.floor(view.minX/184)*184-184;x<view.maxX+184;x+=184){const xx=x+Math.round((y-b.minY)/29)%2*92;line(c,xx,y,xx,y+28,'#4b433a70');for(const dx of [-4,4]){oval(c,xx+dx,y+6,1,1,'#433e3580');oval(c,xx+dx,y+22,1,1,'#433e3580');}line(c,xx+19,y+14,xx+76,y+13,'#cfb47b32');}
  }
  c.restore();
  for(const y of [b.minY+12,b.maxY-12]){line(c,b.minX,y,b.maxX,y,'#4e4333',13);line(c,b.minX,y-2,b.maxX,y-2,'#c4a16a',4);}
  for(let x=b.minX+30;x<b.maxX;x+=150)for(const y of [b.minY+12,b.maxY-12]){c.fillStyle='#61503a';c.fillRect(x-6,y-9,12,18);line(c,x-5,y-9,x+5,y-9,'#d2b176',2);}
  // A clear central strip and subtle arrows communicate the route without a HUD overlay.
  for(let x=-930;x<1250;x+=240){line(c,x-14,-8,x,0,'#e9d3a354',2);line(c,x,0,x-14,8,'#e9d3a354',2);}
}
function crater(c,x,y,r){
  oval(c,x,y,r+5,r*.63+4,'#c4c4b721');oval(c,x,y+3,r,r*.62,'#4b525b');oval(c,x,y+6,r-5,Math.max(1,r*.54),'#6c737a');
  c.beginPath();c.ellipse(x,y,r,r*.62,0,Math.PI,TAU);c.strokeStyle='#cad0c74d';c.lineWidth=3;c.stroke();
  oval(c,x-r*.3,y+5,r*.34,r*.16,'#555d657a');
}
function moonGround(c,d,view){
  const b=d.bounds;c.fillStyle='#424a54';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  c.fillStyle='#828a90';c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  c.save();c.beginPath();c.rect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);c.clip();
  for(let y=Math.floor(view.minY/82)*82;y<view.maxY+82;y+=82)for(let x=Math.floor(view.minX/90)*90;x<view.maxX+90;x+=90){
    const value=hash(x,y),px=x+value*50,py=y+hash(y,x)*50;
    if(Math.abs(px)>125&&value>.37)crater(c,px,py,12+value*31);
    for(let i=0;i<5;i++){const xx=x+hash(x+i*13,y)*90,yy=y+hash(y+i*29,x)*82;line(c,xx,yy,xx+3+value*6,yy-1,i%2?'#c9d0cc43':'#424d5a46',1);}
  }
  c.restore();
  for(const x of [b.minX,b.maxX]){
    line(c,x,b.minY,x,b.maxY,'#b5bdb458',4);
    for(let y=b.minY;y<b.maxY;y+=94){const side=x<0?-1:1;polygon(c,[[x,y],[x+side*25,y-17],[x+side*53,y+20],[x+side*29,y+68],[x,y+94]],'#58616b','#46505b');}
  }
  for(const y of [b.minY,b.maxY])line(c,b.minX,y,b.maxX,y,'#c2c9c17a',5);
  for(let y=20;y>-2050;y-=240){line(c,-8,y+12,0,y,'#d0d8c95e',2);line(c,0,y,8,y+12,'#d0d8c95e',2);}
  for(const y of [-120,-780,-1440,-2060])for(const x of [-110,110]){oval(c,x,y,6,3,'#3e4953');line(c,x,y,x,y-17,'#5e6e77',3);oval(c,x,y-17,3,2,'#c6d9c3');}
}
function survivalGround(c,d,view){
  const b=d.bounds;c.fillStyle='#304536';c.fillRect(view.minX,view.minY,view.maxX-view.minX,view.maxY-view.minY);
  c.fillStyle='#58664a';c.fillRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  for(let y=Math.floor(view.minY/74)*74;y<view.maxY+74;y+=74)for(let x=Math.floor(view.minX/84)*84;x<view.maxX+84;x+=84){
    if(x<b.minX||x>b.maxX||y<b.minY||y>b.maxY)continue;
    const r=hash(x,y);oval(c,x+17,y+21,14+r*25,8+r*11,r>.5?'#78906122':'#2b443b24');line(c,x+14,y+7,x+16,y,'#97a27355');line(c,x+16,y+1,x+20,y+3,'#97a27355');
  }
  c.strokeStyle='#a2ae734f';c.lineWidth=8;c.strokeRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  oval(c,0,0,120,75,'#8c7c5445');oval(c,0,0,57,35,'#4b493b70');
  for(let i=0;i<12;i++){const a=i*TAU/12;oval(c,Math.cos(a)*60,Math.sin(a)*37,6,4,'#a0a085');}
  label(c,'守夜营地',0,63,'#d1d6ac');
}
function drawObjectives(c,run,time){
  const d=run.definition,b=d.bounds;
  for(const group of run.groups){
    const gate=group.definition.gate,closed=!group.cleared,color=closed?'#e2ba7b':'#bcdba2';
    c.save();c.globalAlpha=closed?.78:.24;
    if(d.axis==='x'){line(c,gate,b.minY+20,gate,b.maxY-20,color,closed?5:2);for(let y=b.minY+45;y<b.maxY-20;y+=36)line(c,gate-5,y-7,gate+5,y+7,color,2);}
    else{line(c,b.minX+20,gate,b.maxX-20,gate,color,closed?5:2);for(let x=b.minX+45;x<b.maxX-20;x+=36)line(c,x-7,gate-5,x+7,gate+5,color,2);}
    c.restore();
    if(closed&&group.index===run.currentSegment){const x=d.axis==='x'?gate-42:0,y=d.axis==='x'?b.minY+72:gate+42;label(c,'清理敌群后通行',x,y,'#ecddb4');}
  }
  const exit=d.exit,open=run.exitOpen;
  c.save();c.translate(exit.x,exit.y);oval(c,0,0,exit.r,exit.r*.68,open?'#c5e0a51f':'#152a342d');
  c.beginPath();c.ellipse(0,0,exit.r,exit.r*.68,0,0,TAU);c.strokeStyle=open?'#d5edb4':'#9aa4a065';c.lineWidth=open?3:1.5;c.stroke();
  if(open){const r=exit.r+6+Math.sin(time*2)*3;c.beginPath();c.ellipse(0,0,r,r*.68,0,0,TAU);c.strokeStyle='#d5edb451';c.lineWidth=2;c.stroke();}
  polygon(c,[[0,-20],[11,0],[0,20],[-11,0]],open?'#e0edb8':'#7c8985');
  label(c,open?'进入光圈 · 完成副本':'目标完成后开放',0,exit.r+22,open?'#e3edbf':'#b9c2b6');c.restore();
}

// Screen-coordinate ground pass. Actors and attacks retain the ordinary
// depth queue; only the static floor and route marks are replaced here.
export function drawExpeditionGround(c,game,camX,camY,width,height){
  const run=game?.expedition;if(!run)return false;
  const view={minX:camX-width/2,minY:camY-height/2,maxX:camX+width/2,maxY:camY+height/2};
  c.save();c.translate(width/2-camX,height/2-camY);
  if(run.id==='ship')shipGround(c,run.definition,view,game._clock||0);
  else if(run.id==='moon')moonGround(c,run.definition,view);
  else survivalGround(c,run.definition,view);
  drawObjectives(c,run,game._clock||0);c.restore();return true;
}

export function drawExpeditionProp(c,prop){
  if(!['expedition-cargo','expedition-mast','expedition-moonrock'].includes(prop.variant))return false;
  const r=prop.r;c.save();c.translate(prop.x,prop.y);
  if(prop.variant==='expedition-cargo'){
    polygon(c,[[-r,-r*.7],[r,-r*.7],[r,r*.6],[-r,r*.6]],'#80603e','#493e32');
    polygon(c,[[-r,-r*.7],[-r*.65,-r*1.45],[r*1.2,-r*1.45],[r,-r*.7]],'#bb9962','#69543b');
    polygon(c,[[r,-r*.7],[r*1.2,-r*1.45],[r*1.2,-r*.15],[r,r*.6]],'#614b36','#493e32');
    line(c,-r+4,-r*.65,r-4,r*.5,'#b7955d',4);line(c,-r+4,r*.5,r-4,-r*.65,'#b7955d',4);
    for(const x of [-r*.7,r*.7])line(c,x,-r*.65,x,r*.5,'#4f5549',4);
  }else if(prop.variant==='expedition-mast'){
    oval(c,0,0,r,r*.7,'#5f4d35');oval(c,0,-3,r*.72,r*.46,'#b59660');
    polygon(c,[[-9,0],[-7,-104],[6,-104],[10,0]],'#665039','#3f3930');line(c,-4,-5,-3,-100,'#c6a475',3);
    line(c,-51,-78,51,-78,'#5d4935',5);polygon(c,[[-47,-76],[46,-76],[40,-38],[7,-29],[-41,-39]],'#ded0a5','#9c8f6c');
    line(c,-4,-76,-1,-31,'#97886780');line(c,-36,-42,-24,0,'#d5bc7c',1.3);line(c,35,-42,24,0,'#d5bc7c',1.3);
  }else{
    polygon(c,[[-r,r*.2],[-r*.82,-r*.55],[-r*.23,-r*1.15],[r*.52,-r*.94],[r,-r*.13],[r*.68,r*.54],[-r*.32,r*.65]],'#808890','#46515c');
    polygon(c,[[-r*.82,-r*.55],[-r*.23,-r*1.15],[r*.52,-r*.94],[r*.1,-r*.35],[-r*.2,-r*.52]],'#b3b8b4');
    polygon(c,[[r*.1,-r*.35],[r*.52,-r*.94],[r,-r*.13],[r*.68,r*.54],[r*.04,r*.4]],'#626e7b');
    line(c,-r*.7,-r*.17,-r*.37,r*.4,'#d1d4c652',1.3);line(c,r*.07,-r*.3,r*.12,r*.35,'#35465380',1.5);
  }
  c.restore();return true;
}

// Static, deliberately simpler versions for preparation cards.
export function drawExpeditionPreview(c,id,width,height){
  c.save();c.clearRect(0,0,width,height);c.scale(width/280,height/150);
  if(id==='ship'){
    c.fillStyle='#294c58';c.fillRect(0,0,280,150);
    for(let y=22;y<150;y+=29)line(c,8,y,272,y-3,'#91b2ab35',2);
    polygon(c,[[30,49],[222,49],[261,78],[222,111],[30,111],[19,79]],'#a18353','#cfb17a');
    for(let y=58;y<108;y+=9)line(c,33,y,224,y,'#715739',1);
    for(const x of [89,174]){line(c,x,88,x,24,'#4a3d31',5);polygon(c,[[x-22,32],[x+22,32],[x+18,63],[x-18,65]],'#ddd0a4','#a89972');}
    line(c,34,110,220,110,'#584633',5);
  }else if(id==='moon'){
    c.fillStyle='#263442';c.fillRect(0,0,280,150);
    for(let i=0;i<27;i++){c.fillStyle=i%3?'#d8dccc':'#9eaec0';c.fillRect(hash(i,3)*280,hash(i,8)*65,1,1);}
    oval(c,221,25,12,12,'#779ba5');oval(c,217,22,7,10,'#a5b9a5');
    polygon(c,[[0,76],[41,59],[87,78],[133,58],[188,68],[231,53],[280,72],[280,150],[0,150]],'#7f8991');
    for(const [x,y,r]of [[32,109,20],[87,84,11],[199,121,29],[246,85,15]])crater(c,x,y,r);
    line(c,140,124,140,73,'#b5c0ba',2);oval(c,140,72,4,3,'#def0d4');oval(c,140,129,18,7,'#b1cbb055');
  }else{
    c.fillStyle='#253c36';c.fillRect(0,0,280,150);oval(c,140,93,82,45,'#596748');oval(c,140,95,37,20,'#8d7e55');
    for(let i=0;i<9;i++){const a=i*TAU/9,x=140+Math.cos(a)*111,y=83+Math.sin(a)*53;oval(c,x,y,8,6,'#a0b576');oval(c,x-2,y-2,1.3,1.3,'#e1ddac');}
    polygon(c,[[140,64],[151,92],[140,103],[129,92]],'#f0cc87');
  }
  c.restore();return true;
}
