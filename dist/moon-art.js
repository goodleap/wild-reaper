const TAU=Math.PI*2,TILE=384,BLEED=4,GROUND_PIXELS=5*1024*1024,PROP_PIXELS=4*1024*1024;
const P=Object.freeze({dust:'#b6bbb3',dustLight:'#d2d4c4',edge:'#465766',rock:'#8e9d9e',rockLight:'#c3cbc1',rockDark:'#637783',pit:'#4c6172',pitDark:'#394d61',metal:'#a7bbb6',metalDark:'#526f79',gold:'#c3ae79',goldLight:'#e1c894',lamp:'#c9efe1'});
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,x,y,xx,yy,color,width=1)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const oval=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();};
function trace(c,points,dx=0,dy=0){c.beginPath();points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x+dx,p.y+dy));c.closePath();}
function poly(c,points,color,edge=null,width=1){trace(c,points.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p));if(color){c.fillStyle=color;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function scaled(points,x,y,k,dy=0){return points.map(p=>({x:x+(p.x-x)*k,y:y+(p.y-y)*k+dy}));}
const visible=(p,v,pad=0)=>p.x+(p.width||p.rx*2||0)/2+pad>=v.minX&&p.x-(p.width||p.rx*2||0)/2-pad<=v.maxX&&p.y+(p.depth||p.ry*2||0)/2+pad>=v.minY&&p.y-(p.depth||p.ry*2||0)/2-pad<=v.maxY;
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}

function pebble(c,x,y,r,n=0){
  poly(c,[[x-r,y],[x-r*.65,y-r*.68],[x+r*.2,y-r*.94],[x+r*.92,y-r*.3],[x+r*.7,y+r*.45],[x-r*.45,y+r*.55]],n>.5?'#93a19e':'#a5afa7');
  poly(c,[[x-r*.65,y-r*.68],[x+r*.2,y-r*.94],[x+r*.92,y-r*.3],[x+r*.12,y-r*.2]],'#d4d6c0a0');
  line(c,x-r*.48,y+r*.45,x+r*.5,y+r*.48,'#536c7666',Math.max(.6,r*.1));
}
function dustCrater(c,x,y,rx,ry,seed=0){
  const points=Array.from({length:22},(_,i)=>{const a=i*TAU/22,k=.96+hash(i,seed)*.065;return {x:x+Math.cos(a)*rx*k,y:y+Math.sin(a)*ry*k};});
  poly(c,points,'#89999466');poly(c,scaled(points,x,y,.84,2),'#a5b0a7');poly(c,scaled(points,x,y,.67,ry*.13),'#b4beb0');
  c.save();trace(c,points);c.clip();
  c.beginPath();c.ellipse(x,y+3,rx*.94,ry*.91,0,Math.PI,TAU);c.strokeStyle='#60798866';c.lineWidth=4;c.stroke();
  c.beginPath();c.ellipse(x,y+1,rx*.92,ry*.91,0,0,Math.PI);c.strokeStyle='#e2e0c591';c.lineWidth=3;c.stroke();c.restore();
}
function crater(c,s){
  const p=s.points,{x,y,width:w,depth:d}=s;
  // The actual walk boundary is the outer lip. The bowl lies entirely inside it.
  poly(c,p,'#bdc4b4','#6e8388',1.1);
  const shoulder=p.map((q,i)=>({x:x+(q.x-x)*(.91+hash(i,s.seed)*.045),y:y+(q.y-y)*(.9+hash(i+4,s.seed)*.05)}));
  const basin=p.map((q,i)=>({x:x+(q.x-x)*(.64+hash(i+6,s.seed)*.12),y:y+(q.y-y)*(.64+hash(i+9,s.seed)*.12)+d*.09}));
  poly(c,shoulder,'#849898');poly(c,basin,'#6e858a');
  for(let i=0;i<p.length;i++){
    const next=(i+1)%p.length,n=hash(i,s.seed),light=(p[i].y-y)/d*.5-(p[i].x-x)/w*.17;
    poly(c,[shoulder[i],shoulder[next],basin[next],basin[i]],light>.08?['#9bab9f','#a2afa1','#a7b2a2'][Math.floor(n*3)]:['#71898b','#758c8d','#6e878a'][Math.floor(n*3)]);
  }
  c.save();trace(c,scaled(p,x,y,.89));c.clip();
  const glow=c.createLinearGradient(x-w/2,y-d/2,x+w/2,y+d/2);glow.addColorStop(0,'#27475560');glow.addColorStop(.56,'#526d7900');glow.addColorStop(1,'#c4cab222');c.fillStyle=glow;c.fillRect(x-w/2,y-d/2,w,d);
  for(let i=0;i<13;i++){const a=i*2.399963,rad=.2+hash(i,s.seed)*.52,xx=x+Math.cos(a)*w*.44*rad,yy=y+Math.sin(a)*d*.38*rad+d*.1;pebble(c,xx,yy,3+hash(s.seed,i)*8,i%2);}
  for(let i=0;i<24;i++){const xx=x+(hash(i,s.seed)-.5)*w*.7,yy=y+(hash(s.seed,i)-.5)*d*.52+d*.08;line(c,xx,yy,xx+8+hash(i,1)*12,yy-2,'#bfd0ba20',1);}
  c.restore();
  // Broken ledges follow the authored rim, with quiet ejecta rather than circles.
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy),count=Math.max(1,Math.floor(n/38));
    for(let j=0;j<count;j++){const t=(j+.38)/count,xx=a.x+dx*t,yy=a.y+dy*t,inner={x:x+(xx-x)*.93,y:y+(yy-y)*.93};if(i%3===0)line(c,xx,yy,inner.x,inner.y,'#617c7b77',1);if(j%2===0)pebble(c,inner.x,inner.y,3+hash(j,i)*6,hash(i,j));}
    if(i%3===0)line(c,a.x+(b.x-a.x)*.13,a.y+(b.y-a.y)*.13,b.x-(b.x-a.x)*.15,b.y-(b.y-a.y)*.15,a.y>y?'#dbdac0':'#a3b4a8',a.y>y?3:1.3);
  }
}
function edgeScree(c,outline,view){
  // The route runs through connected rocky highlands, never a floating island
  // over blue space. The cliff foot follows the same collision outline.
  c.save();c.beginPath();c.rect(view.minX-180,view.minY-180,view.maxX-view.minX+360,view.maxY-view.minY+360);traceAppend(c,outline);c.clip('evenodd');
  c.fillStyle='#8b9b9a';c.fillRect(view.minX-180,view.minY-180,view.maxX-view.minX+360,view.maxY-view.minY+360);
  for(let gy=Math.floor(view.minY/115)-3;gy<=Math.floor(view.maxY/115)+3;gy++)for(let gx=Math.floor(view.minX/155)-3;gx<=Math.floor(view.maxX/155)+3;gx++){
    const n=hash(gx,gy),x=gx*155+(gy%2)*64+(n-.5)*80,y=gy*115+(hash(gy,gx)-.5)*64;
    rock(c,x,y,118+n*88,65+n*43,44+hash(gx+8,gy)*80,n);
    if(hash(gx+29,gy)>.28)rock(c,x+65+hash(gx,gy+8)*30,y+45,47+hash(gx,gy+17)*40,30+hash(gy,gx+1)*24,18+hash(gx+11,gy)*28,hash(gx+9,gy+3));
  }
  trace(c,outline);c.strokeStyle='#5c7782';c.lineWidth=13;c.stroke();c.restore();
  c.save();trace(c,outline);c.clip();trace(c,outline);c.strokeStyle='#526e7633';c.lineWidth=13;c.stroke();c.restore();
}
function traceAppend(c,points){points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.closePath();}
function floorDetail(c,s){
  const {x,y,rx=60,ry=40}=s;
  if(s.kind==='crater'){dustCrater(c,x,y,rx,ry,x+y);return;}
  if(s.kind==='tracks'){
    const length=ry*2;
    for(let i=0;i<length/13;i++)for(const side of [-1,1]){const yy=y-ry+i*13,xx=x+side*Math.min(16,rx*.3)+Math.sin(i*.19)*rx*.18;c.save();c.translate(xx,yy);c.rotate(side*.13);poly(c,[[-3,-4],[3,-4],[4,3],[-3,4]],'#687f832c');c.restore();}return;
  }
  if(s.kind==='landing'){
    oval(c,x,y,rx,ry,'#85938726');
    for(const side of [-1,1]){line(c,x+side*rx*.7,y-ry*.43,x+side*rx*.7,y+ry*.43,'#e3dfba99',4);line(c,x+side*rx*.7,y+ry*.43,x+side*rx*.45,y+ry*.43,'#e3dfba99',4);}
    for(let i=0;i<12;i++){const a=i*TAU/12;line(c,x+Math.cos(a)*rx*.5,y+Math.sin(a)*ry*.5,x+Math.cos(a)*rx*.58,y+Math.sin(a)*ry*.58,'#6d858238',2);}
    poly(c,[[x-14,y-4],[x,y-22],[x+14,y-4],[x+5,y-4],[x+5,y+17],[x-5,y+17],[x-5,y-4]],'#d3d8be80');
  }else if(s.kind==='beacon'){
    const shape=Array.from({length:8},(_,i)=>({x:x+Math.cos(i*TAU/8)*rx,y:y+Math.sin(i*TAU/8)*ry}));
    poly(c,shape,'#a6b5a94d','#d5dbc19c',2);poly(c,scaled(shape,x,y,.76),'#b8c9b92a','#64838566',1);
    for(let i=0;i<8;i++){const a=i*TAU/8;line(c,x+Math.cos(a)*rx*.82,y+Math.sin(a)*ry*.82,x+Math.cos(a)*rx*.96,y+Math.sin(a)*ry*.96,'#e4dcaa',4);}
  }else if(s.kind==='scuff'){
    for(let i=0;i<15;i++){const xx=x+(hash(i,x)-.5)*rx*1.5,yy=y+(hash(i,y)-.5)*ry*1.4;line(c,xx,yy,xx+14+hash(y,i)*24,yy-3,'#67818020',1.2);}
  }else if(s.kind==='rubble'){
    for(let i=0;i<18;i++){const a=i*2.399963,k=.25+hash(x,i)*.7;pebble(c,x+Math.cos(a)*rx*k,y+Math.sin(a)*ry*k,3+hash(y,i)*9,hash(i,x));}
  }else if(s.kind==='wreckage'){
    oval(c,x,y,rx,ry,'#697e7b20');
    for(let i=0;i<14;i++){const xx=x+(hash(i,x)-.5)*rx*1.7,yy=y+(hash(i,y)-.5)*ry*1.7,k=4+hash(x,i)*8;poly(c,[[xx-k,yy-2],[xx+k*.7,yy-k*.5],[xx+k,yy+3],[xx-k*.3,yy+5]],i%3?'#758c8b':'#b4ba9c','#64797b55',.6);if(i%3===0)line(c,xx-k*.5,yy,xx+k*.4,yy-2,'#d8d2a9',1);}
  }
}
function floor(c,d,v){
  const ring=d.landform.outline;
  c.fillStyle='#8b9b9a';c.fillRect(v.minX,v.minY,v.maxX-v.minX,v.maxY-v.minY);
  // Broad terrain colour varies at low frequency; dense grain is baked once.
  c.save();trace(c,ring);c.clip();c.fillStyle=P.dust;c.fillRect(v.minX,v.minY,v.maxX-v.minX,v.maxY-v.minY);
  // Neighbouring global cells contribute marks across tile edges. Generating
  // the same two-cell halo on both sides avoids chopped colour patches.
  for(let gy=Math.floor(v.minY/170)-2;gy<=Math.floor(v.maxY/170)+2;gy++)for(let gx=Math.floor(v.minX/190)-2;gx<=Math.floor(v.maxX/190)+2;gx++){
    const x=gx*190+hash(gx,gy)*60,y=gy*170+hash(gy,gx)*50,n=hash(gx+6,gy+2);
    c.save();c.translate(x,y);c.scale(1,.64);const tint=c.createRadialGradient(0,0,12,0,0,148+n*44);tint.addColorStop(0,n>.5?'#7e99991c':'#e4debc1c');tint.addColorStop(1,n>.5?'#7e999900':'#e4debc00');c.fillStyle=tint;c.fillRect(-194,-194,388,388);c.restore();
    for(let i=0;i<19;i++){const xx=gx*190+hash(i+gx*17,gy)*190,yy=gy*170+hash(i+gy*19,gx)*170;line(c,xx,yy,xx+2+hash(i,gy)*5,yy-.7,i%3?'#657f7e28':'#f0e7c14b',.8);}
    if(n>.9)dustCrater(c,x+34,y-13,11+n*14,6+n*7,gx*17+gy);
    if(n<.5)for(let i=0;i<4;i++)pebble(c,x+(hash(i,gx)-.5)*42,y+(hash(i,gy)-.5)*20,2+hash(gx,i)*4,n);
  }
  for(const route of d.paths||[]){c.beginPath();route.points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.strokeStyle='#e4dec109';c.lineWidth=route.width*.65;c.lineCap='round';c.lineJoin='round';c.stroke();}
  for(const detail of d.details||[])if(visible(detail,v,40))floorDetail(c,detail);
  for(const s of d.landform.solids)if(s.kind==='crater'&&visible(s,v,40))crater(c,s);
  c.restore();edgeScree(c,ring,v);
}

function rock(c,x,y,w,d,h,n){
  // The established scenery's blunt, varied rock silhouettes are recast as
  // bare lunar mineral: no moss or vegetation, and no uniform paving blocks.
  const forms=[
    [[-35,4],[-32,-21],[-23,-38],[-5,-49],[14,-45],[28,-30],[35,-8],[34,16],[22,29],[3,34],[-20,28],[-34,16]],
    [[-35,1],[-29,-14],[-13,-24],[15,-22],[29,-12],[36,2],[33,19],[15,30],[-12,32],[-31,22]],
    [[-34,13],[-31,-18],[-16,-29],[-5,-61],[14,-53],[26,-28],[33,-11],[35,13],[21,28],[1,35],[-23,27]],
    [[-35,8],[-32,-23],[-22,-46],[-5,-53],[4,-43],[8,-50],[24,-39],[32,-17],[34,13],[25,29],[6,35],[-19,31]],
    [[-35,12],[-33,-6],[-23,-15],[-18,-34],[-3,-44],[16,-40],[27,-21],[29,-7],[35,1],[35,22],[21,29],[3,34],[-20,29]]
  ],v=Math.floor(n*5)%5,top=[-49,-24,-61,-53,-44][v],edge=v===1?-8:-16;
  c.save();c.translate(x,y+d*.4);c.scale(w/72,(d+h)/(35-top));c.translate(0,-35);
  poly(c,forms[v],'#758a8e','#4e6974',.9);c.save();poly(c,forms[v],null);c.clip();
  const light=c.createLinearGradient(-30,32,24,top);light.addColorStop(0,'#627a85');light.addColorStop(.46,'#8b9f9f');light.addColorStop(1,'#b9c6b9');c.fillStyle=light;c.fillRect(-38,top-3,76,-top+41);
  if(v===1){poly(c,[[-34,-5],[-14,-21],[14,-19],[30,-6],[13,3],[-17,4]],'#b5c2b4');poly(c,[[-35,3],[-17,4],[13,3],[12,30],[-17,31]],'#7a9296');poly(c,[[13,3],[34,-1],[33,20],[12,30]],'#9aaba6');}
  else if(v===2){poly(c,[[-31,-18],[-16,-29],[-5,-61],[3,-26],[-7,-10]],'#9fafa9');poly(c,[[-5,-61],[14,-53],[26,-28],[3,-26]],'#c1cbba');poly(c,[[3,-26],[26,-28],[34,-9],[9,1]],'#a9b8ad');poly(c,[[-31,-18],[-7,-10],[9,1],[1,35],[-23,27],[-34,13]],'#738b91');poly(c,[[9,1],[34,-9],[35,13],[21,28],[1,35]],'#8c9f9d');}
  else{poly(c,[[-32,-21],[-23,top+11],[-5,top],[14,top+4],[28,top+19],[34,edge],[7,edge-5],[-11,edge+3]],'#afbcaf');poly(c,[[-32,-21],[-11,edge+3],[4,8],[3,34],[-20,28],[-34,16]],'#718a91');poly(c,[[7,edge-5],[34,edge],[34,16],[22,29],[3,34],[4,8]],'#90a39e');poly(c,[[-23,top+11],[-5,top],[14,top+4],[28,top+19],[3,top+13],[-5,edge-6]],'#c0c9b7');}
  for(let i=0;i<48;i++){const xx=-35+hash(i,n)*70,yy=top+hash(n,i)*(35-top);line(c,xx,yy,xx+.6+hash(i,4)*3,yy-.3,i%3?'#405f6d20':'#e0e0bc40',.55);}
  line(c,-4,edge-8,-10,edge+2,'#42616d66',.9);line(c,-10,edge+2,-4,edge+11,'#42616d66',.9);line(c,-10,edge+2,-20,edge+6,'#42616d55',.65);c.restore();c.restore();
}
function ridge(c,s){
  const points=s.points.map(p=>({x:p.x-s.x,y:p.y-s.y})),stones=[];
  // The low rock bed follows collision exactly. Individual boulder feet fit
  // inside it, while their upper silhouettes remain free of a shared clip.
  poly(c,points,'#849a98','#687f84',1.2);
  const clearance=(x,y)=>{
    if(!inside(x,y,points))return 0;
    let distance=Infinity;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
      distance=Math.min(distance,Math.hypot(x-a.x-dx*t,y-a.y-dy*t));
    }return distance;
  };
  for(let row=0,y=-s.depth/2+13;y<s.depth/2;y+=31,row++)for(let col=0,x=-s.width/2+12;x<s.width/2;x+=43,col++){
    const n=hash(row+s.seed,col+11),xx=x+(row%2)*19+(n-.5)*17,yy=y+(hash(col,s.seed)-.5)*14,room=clearance(xx,yy)-2;
    if(room<4)continue;
    const width=Math.min(42+n*49,room*2),depth=Math.min(23+n*25,room*1.8),scale=Math.min(1,width/48);
    const height=Math.min(s.height*.72,Math.max(8,s.height-depth*.65))*(.6+hash(row,col+4)*.4)*scale;
    stones.push({x:xx,y:yy,width,depth,height,n});
  }
  for(const r of stones.sort((a,b)=>(a.y+a.depth*.4)-(b.y+b.depth*.4)))rock(c,r.x,r.y,r.width,r.depth,r.height,r.n);
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.y-a.y);
    for(let j=0;j<length;j+=18){const t=j/length,x=(a.x+(b.x-a.x)*t)*.96,y=(a.y+(b.y-a.y)*t)*.94,room=clearance(x,y);
      if(room>1.5)pebble(c,x,y,Math.min(room*.85,3+hash(i,j)*4),hash(i,s.seed));
    }
  }
}
function body(c,p,h,fill=P.metal){
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];poly(c,[[a.x,a.y],[b.x,b.y],[b.x,b.y-h],[a.x,a.y-h]],(a.x+b.x)>0?P.metalDark:'#718e91',P.edge,1.2);}
  trace(c,p,0,-h);c.fillStyle=fill;c.fill();c.strokeStyle=P.edge;c.lineWidth=1.6;c.stroke();
}
function solar(c,x,y,w,d){
  poly(c,[[x-w/2,y-d/2],[x+w/2,y-d/2-5],[x+w/2,y+d/2-5],[x-w/2,y+d/2]],'#425f70','#c2c4a5',2);
  for(let i=1;i<5;i++)line(c,x-w/2+i*w/5,y-d/2-1,x-w/2+i*w/5,y+d/2-2,'#91a6a2',1);
  for(let i=1;i<3;i++)line(c,x-w/2+1,y-d/2+i*d/3,x+w/2-1,y-d/2-4+i*d/3,'#91a6a28c',1);
  line(c,x-w/2+3,y-d/2+3,x+w/2-4,y-d/2-1,'#d6e2bb77',1);
}
function wreck(c,s){
  const w=s.width,d=s.depth,h=s.height,p=s.points.map(p=>({x:p.x-s.x,y:p.y-s.y}));
  body(c,p,7,'#788a88');
  // A collapsed, low lander: foil body, inset glass, four splayed landing legs,
  // and a folded instrument panel read as a machine at character scale.
  for(const side of [-1,1])for(const front of [-1,1]){
    const x=side*w*.32,y=front*d*.28;
    line(c,side*w*.18,front*d*.12-h*.35,x,y-5,P.edge,8);line(c,side*w*.18-1,front*d*.12-h*.35,x-1,y-6,'#c4b583',4);
    poly(c,[[x-16,y-5],[x+14,y-5],[x+18,y+3],[x-19,y+3]],'#657e83','#c2bd97',1.3);
  }
  const pod=[{x:-w*.24,y:-d*.26},{x:w*.16,y:-d*.3},{x:w*.29,y:d*.1},{x:w*.1,y:d*.3},{x:-w*.25,y:d*.16}];
  body(c,pod,h*.56,'#c1ae76');
  poly(c,[[-w*.24,-d*.26-h*.56],[-w*.1,-d*.4-h*.8],[w*.15,-d*.36-h*.7],[w*.16,-d*.3-h*.56]],'#dbcea1',P.edge,1.4);
  poly(c,[[-w*.1,-d*.4-h*.8],[w*.15,-d*.36-h*.7],[w*.23,-d*.09-h*.65],[w*.04,-d*.08-h*.67]],'#536f7b','#aebba5',1.5);
  line(c,-w*.055,-d*.35-h*.76,w*.13,-d*.32-h*.68,'#bad4c4',2);
  poly(c,[[-w*.17,d*.06-h*.56],[w*.11,d*.08-h*.56],[w*.1,d*.27-h*.5],[-w*.19,d*.19-h*.5]],'#9a9269',P.edge,1);
  for(let i=0;i<5;i++)line(c,-w*.14+i*w*.045,d*.07-h*.54,-w*.15+i*w*.045,d*.18-h*.51,'#e0cca0aa',1.5);
  solar(c,w*.31,-d*.13-h*.17,w*.3,d*.36);
  line(c,-w*.29,-d*.22-h*.13,-w*.35,-d*.34-h*.62,'#5e7980',5);line(c,-w*.29-1,-d*.22-h*.13,-w*.35-1,-d*.34-h*.62,'#c7d3bd',2);
  oval(c,-w*.35,-d*.34-h*.62,8,4,'#d9d5aa');
  for(const [x,y]of [[-.16,.08],[.09,.1],[-.2,-.2]])oval(c,w*x,d*y-h*.5,2,1.6,'#5d777d');
}
function equipment(c,s){
  const w=s.width,d=s.depth,h=s.height,p=s.points.map(p=>({x:p.x-s.x,y:p.y-s.y}));
  body(c,p,7,'#809995');
  const b=[{x:-w*.28,y:-d*.3},{x:w*.24,y:-d*.3},{x:w*.28,y:d*.27},{x:-w*.25,y:d*.27}];body(c,b,h*.53,'#c3cab3');
  poly(c,[[-w*.2,d*.28-h*.46],[w*.18,d*.28-h*.46],[w*.18,d*.28-h*.18],[-w*.2,d*.28-h*.18]],'#405f6c','#8da69c',1.2);
  for(let i=0;i<3;i++)line(c,-w*.15,d*.28-h*.39+i*5,w*.04,d*.28-h*.39+i*5,'#a1c8ba',1);
  oval(c,w*.13,d*.28-h*.33,2.5,2.5,P.lamp);
  if(hash(s.seed,1)>.44){
    solar(c,0,-d*.2-h*.55,w*.78,d*.55);line(c,0,-h*.4,0,-h*.85,'#4c6b75',5);
    c.beginPath();c.ellipse(0,-h*.87,w*.23,d*.12,-.4,0,TAU);c.fillStyle='#d6d6bb';c.fill();c.strokeStyle=P.edge;c.lineWidth=1.6;c.stroke();line(c,0,-h*.87,w*.12,-h*.99,'#819f9d',2);
  }else{
    line(c,0,-h*.35,0,-h*.94,'#4d717c',9);line(c,-2,-h*.37,-2,-h*.94,'#c7d9c7',3);
    poly(c,[[-w*.18,-h*.75],[w*.18,-h*.75],[w*.18,-h*.96],[-w*.18,-h*.96]],'#a5c4b9',P.edge,1.4);
    poly(c,[[-w*.12,-h*.81],[w*.12,-h*.81],[w*.12,-h*.91],[-w*.12,-h*.91]],P.lamp);
    line(c,-w*.19,-h*.98,w*.19,-h*.98,'#e5d4a4',3);
  }
}

export class MoonArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.ground=new Map();this.sprites=new Map();this.groundPixels=0;this.spritePixels=0;this.ids=new WeakMap();this.keys=new WeakMap();this.nextId=0;this.builds=0;}
  get cacheStats(){return {entries:this.ground.size+this.sprites.size,bytes:(this.groundPixels+this.spritePixels)*4,limitBytes:(GROUND_PIXELS+PROP_PIXELS)*4,builds:this.builds};}
  clear(){this.ground.clear();this.sprites.clear();this.groundPixels=this.spritePixels=0;}
  put(cache,key,image,field,limit){while(this[field]+image.pixels>limit&&cache.size){const oldest=cache.keys().next().value;this[field]-=cache.get(oldest).pixels;cache.delete(oldest);}cache.set(key,image);this[field]+=image.pixels;this.builds++;return image;}
  tile(d,tx,ty){let id=this.ids.get(d);if(!id){id=++this.nextId;this.ids.set(d,id);}const key=`${id}:${tx}:${ty}`;let image=this.ground.get(key);if(image){this.ground.delete(key);this.ground.set(key,image);return image;}
    const side=TILE+BLEED*2,canvas=this.makeCanvas();canvas.width=canvas.height=side;const c=canvas.getContext('2d'),v={minX:tx*TILE-BLEED,minY:ty*TILE-BLEED,maxX:(tx+1)*TILE+BLEED,maxY:(ty+1)*TILE+BLEED};c.setTransform(1,0,0,1,BLEED-tx*TILE,BLEED-ty*TILE);c.lineJoin='round';c.lineCap='round';floor(c,d,v);return this.put(this.ground,key,{canvas,pixels:side*side},'groundPixels',GROUND_PIXELS);
  }
  drawGround(c,d,v){
    c.fillStyle='#8b9b9a';c.fillRect(v.minX,v.minY,v.maxX-v.minX,v.maxY-v.minY);
    for(let ty=Math.floor(v.minY/TILE);ty<=Math.floor(v.maxY/TILE);ty++)for(let tx=Math.floor(v.minX/TILE);tx<=Math.floor(v.maxX/TILE);tx++){const tile=this.tile(d,tx,ty);c.drawImage(tile.canvas,BLEED,BLEED,TILE,TILE,tx*TILE,ty*TILE,TILE,TILE);}
  }
  sprite(s){let key=this.keys.get(s);if(!key){key=JSON.stringify(s);this.keys.set(s,key);}let image=this.sprites.get(key);if(image){this.sprites.delete(key);this.sprites.set(key,image);return image;}
    const half=s.width/2+12,top=s.depth/2+s.height+14,bottom=s.depth/2+12,w=Math.ceil(half*2),h=Math.ceil(top+bottom),ratio=w*h>110000?1:2,canvas=this.makeCanvas();canvas.width=w*ratio;canvas.height=h*ratio;const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,half*ratio,top*ratio);c.lineJoin='round';c.lineCap='round';
    if(s.kind==='ridge')ridge(c,s);else if(s.kind==='wreck')wreck(c,s);else equipment(c,s);
    return this.put(this.sprites,key,{canvas,w,h,ox:half,oy:top,pixels:canvas.width*canvas.height},'spritePixels',PROP_PIXELS);
  }
  drawProp(c,prop,{player,footY}={}){const s=prop.moonSolid;if(!s)return false;if(s.kind==='crater')return true;const image=this.sprite(s);c.save();if(player&&Number.isFinite(footY)&&footY<s.y+s.depth/2&&Math.abs(player.x-s.x)<s.width/2+12&&footY>s.y-image.oy)c.globalAlpha*=.66;c.drawImage(image.canvas,s.x-image.ox,s.y-image.oy,image.w,image.h);c.restore();return true;}
  drawPreview(c,d,width,height){
    let id=this.ids.get(d);if(!id){id=++this.nextId;this.ids.set(d,id);}const ratio=Math.min(2,900/Math.max(width,height)),w=Math.ceil(width*ratio),h=Math.ceil(height*ratio),key=`preview:${id}:${w}:${h}`;let image=this.sprites.get(key);
    if(image){this.sprites.delete(key);this.sprites.set(key,image);}else{const canvas=this.makeCanvas();canvas.width=w;canvas.height=h;const target=canvas.getContext('2d');target.setTransform(ratio,0,0,ratio,0,0);paintPreview(target,d,width,height);image=this.put(this.sprites,key,{canvas,pixels:w*h},'spritePixels',PROP_PIXELS);}
    c.drawImage(image.canvas,0,0,width,height);return true;
  }
}
let shared;const art=()=>shared??=new MoonArt();
export function clearMoonArtCache(){shared?.clear();shared=null;}
export function moonArtCacheStats(){return shared?.cacheStats??{entries:0,bytes:0,builds:0,limitBytes:(GROUND_PIXELS+PROP_PIXELS)*4};}
export function drawMoonGround(c,d,view){art().drawGround(c,d,view);}
export function drawMoonProp(c,prop,options){return prop?.moonSolid?art().drawProp(c,prop,options):false;}
export function drawMoonMap(c,d,{scale=1,labels=false}={}){
  c.save();c.lineJoin='round';c.lineCap='round';trace(c,d.landform.outline);c.fillStyle='#aeb9ab';c.fill();c.strokeStyle='#d2d6bf';c.lineWidth=1/scale;c.stroke();
  for(const path of d.paths){c.beginPath();path.points.forEach((p,i)=>c[i?'lineTo':'moveTo'](p.x,p.y));c.strokeStyle='#dcd9b54a';c.lineWidth=Math.max(2/scale,path.width*.35);c.stroke();}
  for(const s of d.landform.solids){trace(c,s.points);c.fillStyle=s.kind==='crater'?'#4f6a7a':s.kind==='ridge'?'#788e91':s.kind==='wreck'?'#b8aa7a':'#729d9c';c.fill();c.strokeStyle=s.kind==='crater'?'#d0d0b0':'#ced4b5';c.lineWidth=.65/scale;c.stroke();}
  if(labels){c.font=`600 ${11/scale}px "PingFang SC",system-ui,sans-serif`;c.textAlign='center';c.fillStyle='#e9e8cd';c.strokeStyle='#3e5665';c.lineWidth=2/scale;for(const group of d.segments){c.strokeText(group.name,group.center.x,group.center.y);c.fillText(group.name,group.center.x,group.center.y);}}
  c.restore();return true;
}
export function drawMoonGates(c,run){
  for(const group of run.groups){const s=group.definition,{minX,maxX}=s.gateSpan,locked=!group.cleared;
    for(const x of [minX+9,maxX-9]){c.save();c.translate(x,s.gate);poly(c,[[-12,4],[11,4],[9,-30],[-8,-30]],'#657f83','#3d5968',1.5);poly(c,[[-8,-29],[8,-29],[6,-39],[-6,-39]],'#c7cbb0',P.edge,1);line(c,-5,-31,5,-31,locked?'#dfc18d':'#bfe1bf',4);c.restore();}
    if(locked){line(c,minX+12,s.gate-16,maxX-12,s.gate-16,'#d5d7b541',10);line(c,minX+12,s.gate-16,maxX-12,s.gate-16,'#e3d29e',2);for(let x=minX+30;x<maxX-20;x+=34)line(c,x,s.gate-22,x+8,s.gate-10,'#c4d4bd9e',1.5);}
  }
}
function paintPreview(c,d,width,height){
  c.save();c.fillStyle='#8c9d99';c.fillRect(0,0,width,height);
  const b=d.bounds,k=Math.min((width-28)/(b.maxX-b.minX),(height-14)/(b.maxY-b.minY)),cx=width*.5,cy=height*.5;c.translate(cx-(b.minX+b.maxX)*k/2,cy-(b.minY+b.maxY)*k/2);c.scale(k,k);
  const v={minX:(b.minX+b.maxX)/2-width/(2*k),minY:(b.minY+b.maxY)/2-height/(2*k),maxX:(b.minX+b.maxX)/2+width/(2*k),maxY:(b.minY+b.maxY)/2+height/(2*k)};floor(c,d,v);
  for(const s of d.landform.solids.filter(s=>s.kind!=='crater').sort((a,b)=>a.y+a.depth/2-b.y-b.depth/2)){c.save();c.translate(s.x,s.y);if(s.kind==='ridge')ridge(c,s);else if(s.kind==='wreck')wreck(c,s);else equipment(c,s);c.restore();}
  c.restore();return true;
}
export function drawMoonPreview(c,d,width,height){return art().drawPreview(c,d,width,height);}
