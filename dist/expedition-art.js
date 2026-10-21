import { getExpeditionDefinition } from './expedition-definitions.js';
import { drawShipGround, drawShipLinks, drawShipProp, drawShipSceneMap } from './ship-art.js';

const TAU=Math.PI*2;
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,x1,y1,x2,y2,color,width=1)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
const polygon=(c,points,color,edge=null)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();c.fillStyle=color;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=2;c.stroke();}};
const label=(c,text,x,y,color='#e2d7b5')=>{c.font='600 13px "PingFang SC",system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(text,x,y);};

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

function drawLayout(c,run,view){
  const d=run.definition,ship=run.id==='ship',moon=run.id==='moon';
  c.save();c.beginPath();c.rect(d.bounds.minX,d.bounds.minY,d.bounds.maxX-d.bounds.minX,d.bounds.maxY-d.bounds.minY);c.clip();
  // Ground marks use the same authored routes as the obstacles. They sit
  // below combat telegraphs and do not add a second actor/depth layer.
  for(const route of d.paths||[]){
    c.beginPath();route.points.forEach((p,index)=>c[index?'lineTo':'moveTo'](p.x,p.y));
    c.lineJoin='round';c.lineCap='round';c.lineWidth=route.width;c.strokeStyle=ship?'#d3b77913':moon?'#c3c7b61e':'#b0a27424';c.stroke();
    c.lineWidth=route.width*.68;c.strokeStyle=ship?'#e2ca9a0a':moon?'#d6d5be0c':'#b5a67712';c.stroke();
  }
  for(const detail of d.details||[]){
    const {x,y,rx,ry,kind}=detail;if(x+rx+20<view.minX||x-rx-20>view.maxX||y+ry+20<view.minY||y-ry-20>view.maxY)continue;
    if(kind==='hatch'){
      c.fillStyle='#3e42351f';c.fillRect(x-rx,y-ry,rx*2,ry*2);c.strokeStyle='#574c3c';c.lineWidth=5;c.strokeRect(x-rx,y-ry,rx*2,ry*2);
      c.strokeStyle='#c8ad7555';c.lineWidth=2;c.strokeRect(x-rx+5,y-ry+5,rx*2-10,ry*2-10);
      for(let xx=x-rx+18;xx<x+rx;xx+=19)line(c,xx,y-ry+7,xx,y+ry-7,'#4a46372b',3);
    }else if(kind==='rope'){
      for(let i=0;i<5;i++){c.beginPath();c.ellipse(x,y,rx-i*5,Math.max(3,ry-i*3),-.2,0,TAU);c.strokeStyle=i%2?'#c5ab76':'#6d593c';c.lineWidth=2.5;c.stroke();}
      line(c,x+rx-6,y+5,x+rx+20,y+18,'#ccb17a',3);
    }else if(kind==='crater'){
      c.save();c.translate(x,y);c.scale(1,ry/(rx*.62));crater(c,0,0,rx);c.restore();
      for(let i=0;i<13;i++){const a=i*TAU/13,v=hash(x+i,y);oval(c,x+Math.cos(a)*(rx+7),y+Math.sin(a)*(ry+5),3+v*4,2+v*3,'#bbc0b53a');}
    }else if(kind==='landing'){
      oval(c,x,y,rx,ry,'#a4aba012');c.save();c.setLineDash([12,14]);c.beginPath();c.ellipse(x,y,rx*.8,ry*.8,0,0,TAU);c.strokeStyle='#d0d8bb57';c.lineWidth=3;c.stroke();c.restore();
      for(const sign of [-1,1]){line(c,x+sign*rx*.7,y-14,x+sign*rx*.7,y+14,'#c9d7b9',3);line(c,x-14,y+sign*ry*.7,x+14,y+sign*ry*.7,'#c9d7b9',3);}
    }else if(kind==='wreckage'){
      oval(c,x,y,rx,ry,'#35444a23');
      for(let i=0;i<8;i++){const a=hash(x+i,y)*TAU,xx=x+Math.cos(a)*rx*.85,yy=y+Math.sin(a)*ry*.85;polygon(c,[[xx-5,yy-4],[xx+9,yy-2],[xx+5,yy+5],[xx-9,yy+2]],i%2?'#adb7b16b':'#4458667d');}
    }else if(kind==='grove'){
      oval(c,x,y,rx,ry,'#203e3431');
      for(let i=0;i<24;i++){const a=i*2.39996,rad=.35+hash(x+i,y)*.65,xx=x+Math.cos(a)*rx*rad,yy=y+Math.sin(a)*ry*rad;oval(c,xx,yy,12+hash(y,i)*15,6+hash(i,x)*7,'#97aa6020');line(c,xx-3,yy+3,xx-7,yy-5,'#a6b27640');line(c,xx+1,yy+3,xx+4,yy-7,'#a6b27640');}
    }else if(kind==='clearing'){
      oval(c,x,y,rx,ry,'#ab9b6712');
    }else if(kind==='camp'){
      oval(c,x,y,rx,ry,'#baa67513');
      for(let i=0;i<3;i++){const xx=x-32+i*30;polygon(c,[[xx-10,y-25],[xx+10,y-25],[xx+13,y+23],[xx-13,y+23]],i%2?'#9c93696b':'#71847779','#55644870');line(c,xx-10,y-17,xx+10,y-17,'#c5bb874f',3);}
    }
  }
  c.restore();
}
function drawObjectives(c,run,time){
  const d=run.definition,b=run.sceneDefinition?.bounds||d.bounds;
  for(const group of run.id==='ship'?[]:run.groups){
    const gate=group.definition.gate,closed=!group.cleared,color=closed?'#e2ba7b':'#bcdba2';
    c.save();c.globalAlpha=closed?.78:.24;
    if(d.axis==='x'){line(c,gate,b.minY+20,gate,b.maxY-20,color,closed?5:2);for(let y=b.minY+45;y<b.maxY-20;y+=36)line(c,gate-5,y-7,gate+5,y+7,color,2);}
    else{line(c,b.minX+20,gate,b.maxX-20,gate,color,closed?5:2);for(let x=b.minX+45;x<b.maxX-20;x+=36)line(c,x-7,gate-5,x+7,gate+5,color,2);}
    c.restore();
    if(closed&&group.index===run.currentSegment){const x=d.axis==='x'?gate-42:0,y=d.axis==='x'?b.minY+72:gate+42;label(c,'清理敌群后通行',x,y,'#ecddb4');}
  }
  const exit=d.exit,open=run.exitOpen;if(run.id==='ship'&&exit.sceneId!==run.currentSceneId)return;
  c.save();c.translate(exit.x,exit.y);oval(c,0,0,exit.r,exit.r*.68,open?'#c5e0a51f':'#152a342d');
  c.beginPath();c.ellipse(0,0,exit.r,exit.r*.68,0,0,TAU);c.strokeStyle=open?'#d5edb4':'#9aa4a065';c.lineWidth=open?3:1.5;c.stroke();
  if(open){const r=exit.r+6+Math.sin(time*2)*3;c.beginPath();c.ellipse(0,0,r,r*.68,0,0,TAU);c.strokeStyle='#d5edb451';c.lineWidth=2;c.stroke();}
  polygon(c,[[0,-20],[11,0],[0,20],[-11,0]],open?'#e0edb8':'#7c8985');
  label(c,open?'进入光圈 · 完成副本':'目标完成后开放',0,exit.r+22,open?'#e3edbf':'#b9c2b6');c.restore();
}

// Screen-coordinate ground pass. Actors and attacks retain the ordinary
// depth queue; only the static floor and route marks are replaced here.
export function drawExpeditionGround(c,game,camX,camY,width,height){
  const run=game?.expedition;if(!run||run.definition.worldMapId)return false;
  const view={minX:camX-width/2,minY:camY-height/2,maxX:camX+width/2,maxY:camY+height/2};
  c.save();c.translate(width/2-camX,height/2-camY);
  if(run.id==='ship'){
    drawShipGround(c,run.sceneDefinition,view,game._clock||0);
    drawShipLinks(c,run);drawObjectives(c,run,game._clock||0);c.restore();return true;
  }
  else if(run.id==='moon')moonGround(c,run.definition,view);
  else survivalGround(c,run.definition,view);
  drawLayout(c,run,view);
  drawObjectives(c,run,game._clock||0);c.restore();return true;
}

// Borrowed world terrain retains the ordinary ground and coast renderer;
// the challenge still owns its existing evacuation marker.
export function drawExpeditionObjectives(c,game,camX,camY,width,height){
  const run=game?.expedition;if(!run)return false;
  c.save();c.translate(width/2-camX,height/2-camY);
  drawObjectives(c,run,game._clock||0);c.restore();return true;
}

export function drawExpeditionProp(c,prop,options){
  if(drawShipProp(c,prop,options))return true;
  if(!['expedition-moonrock','expedition-wreck','expedition-camprock'].includes(prop.variant))return false;
  const r=prop.r;c.save();c.translate(prop.x,prop.y);
  if(prop.variant==='expedition-wreck'){
    polygon(c,[[-r,r*.2],[-r*.9,-r*.7],[-r*.3,-r*1.2],[r*.85,-r*.6],[r,r*.4],[r*.15,r*.65]],'#788c8f','#394f59');
    polygon(c,[[-r*.9,-r*.7],[-r*.3,-r*1.2],[r*.85,-r*.6],[r*.22,-r*.35]],'#b8c2b9','#566c73');
    polygon(c,[[-r*.55,-r*.56],[-r*.25,-r*.82],[r*.35,-r*.53],[r*.07,-r*.19]],'#435966','#9eafa8');
    polygon(c,[[r*.12,-r*.12],[r*.72,-r*.34],[r*.78,r*.27],[r*.18,r*.41]],'#516974','#a6b1a680');
    for(let i=0;i<3;i++)line(c,-r*.7+i*r*.21,r*.08,-r*.62+i*r*.21,r*.4,'#b8bd9a8f',3);
    line(c,-r*.25,-r*.8,-r*.48,-r*1.45,'#b4bfb5',3);oval(c,-r*.48,-r*1.45,4,3,'#c4d7af');
  }else{
    const camp=prop.variant==='expedition-camprock';
    polygon(c,[[-r,r*.2],[-r*.82,-r*.55],[-r*.23,-r*1.15],[r*.52,-r*.94],[r,-r*.13],[r*.68,r*.54],[-r*.32,r*.65]],camp?'#7d8568':'#808890',camp?'#414e42':'#46515c');
    polygon(c,[[-r*.82,-r*.55],[-r*.23,-r*1.15],[r*.52,-r*.94],[r*.1,-r*.35],[-r*.2,-r*.52]],camp?'#a5ac83':'#b3b8b4');
    polygon(c,[[r*.1,-r*.35],[r*.52,-r*.94],[r,-r*.13],[r*.68,r*.54],[r*.04,r*.4]],camp?'#5f7159':'#626e7b');
    line(c,-r*.7,-r*.17,-r*.37,r*.4,'#d1d4c652',1.3);line(c,r*.07,-r*.3,r*.12,r*.35,'#35465380',1.5);
  }
  c.restore();return true;
}

// Static, deliberately simpler versions for preparation cards.
export function drawExpeditionPreview(c,id,width,height){
  c.save();c.clearRect(0,0,width,height);
  c.fillStyle=id==='ship'?'#294c58':id==='moon'?'#263442':'#253c36';c.fillRect(0,0,width,height);
  // Keep the full scene and its proportions in the shared 4:3 card frame.
  const scale=Math.min(width/280,height/210);
  c.translate((width-280*scale)/2,(height-210*scale)/2);c.scale(scale,scale);c.translate(0,30);
  if(id==='ship'){
    const scenes=getExpeditionDefinition('ship').scenes;
    for(const [i,scene]of scenes.entries()){
      const b=scene.bounds,k=Math.min(220/(b.maxX-b.minX),44/(b.maxY-b.minY)),cx=140,cy=-1+i*60;
      c.save();c.translate(cx-(b.minX+b.maxX)*k/2,cy-(b.minY+b.maxY)*k/2);c.scale(k,k);drawShipSceneMap(c,scene,{scale:k});c.restore();
      c.font='600 9px "PingFang SC",system-ui,sans-serif';c.textAlign='left';c.fillStyle='#e0d9b8';c.fillText(`${i+1} · ${scene.name}`,9,cy+27);
      if(i<scenes.length-1){line(c,246,cy+18,246,cy+36,'#c3cda47a',1.3);polygon(c,[[242,cy+32],[246,cy+39],[250,cy+32]],'#c3cda4');}
    }
  }else if(id==='moon'){
    for(let i=0;i<27;i++){c.fillStyle=i%3?'#d8dccc':'#9eaec0';c.fillRect(hash(i,3)*280,hash(i,8)*95-30,1,1);}
    oval(c,221,25,12,12,'#779ba5');oval(c,217,22,7,10,'#a5b9a5');
    polygon(c,[[0,76],[41,59],[87,78],[133,58],[188,68],[231,53],[280,72],[280,180],[0,180]],'#7f8991');
    for(const [x,y,r]of [[32,109,20],[87,84,11],[199,121,29],[246,85,15]])crater(c,x,y,r);
    line(c,140,124,140,73,'#b5c0ba',2);oval(c,140,72,4,3,'#def0d4');oval(c,140,129,18,7,'#b1cbb055');
  }else{
    oval(c,140,93,82,45,'#596748');oval(c,140,95,37,20,'#8d7e55');
    for(let i=0;i<9;i++){const a=i*TAU/9,x=140+Math.cos(a)*111,y=83+Math.sin(a)*53;oval(c,x,y,8,6,'#a0b576');oval(c,x-2,y-2,1.3,1.3,'#e1ddac');}
    polygon(c,[[140,64],[151,92],[140,103],[129,92]],'#f0cc87');
  }
  c.restore();return true;
}
