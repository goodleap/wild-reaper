const ink='#555944',wood='#a47c4c',lightWood='#d1b380',paper='#eee3bb';
function path(ctx,points,fill,stroke=ink,width=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(ctx,points,color=ink,width=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function ellipse(ctx,x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function sheet(ctx,x,y,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);path(ctx,[[-11,-10],[10,-10],[12,9],[-10,9]],paper);for(let i=0;i<3;i++)line(ctx,[[-6,-5+i*5],[5,-5+i*5]],'#a5a07c',1);ellipse(ctx,6,6,2.7,2.7,'#9f6953');ctx.restore();}
function sack(ctx,x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.beginPath();ctx.moveTo(-7,-22);ctx.bezierCurveTo(-5,-16,-16,-8,-14,0);ctx.bezierCurveTo(-13,10,15,10,16,0);ctx.bezierCurveTo(18,-8,5,-17,8,-22);ctx.closePath();ctx.fillStyle='#c0ac75';ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.stroke();line(ctx,[[-7,-18],[7,-18]],'#7c7657',2.5);line(ctx,[[-5,-12],[-9,0],[-5,3]],'#d7c58c',2);ctx.restore();}

// Props are drawn in the existing scene depth pass; labels remain in the HUD.
export function drawStoryChapterProp(ctx,prop){
  if(prop.type!=='storyProp')return false;
  ctx.save();ctx.translate(prop.x,prop.y);ctx.lineJoin='round';ctx.lineCap='round';
  const kind=prop.storyProp,used=['taken','used','disabled'].includes(prop.state);
  ellipse(ctx,4,7,kind==='tent'?54:kind==='grain'?35:27,kind==='tent'?18:10,'rgba(44,54,37,.19)');
  if(kind==='notice'){
    for(const x of [-21,21])path(ctx,[[x-3,-43],[x+3,-43],[x+3,5],[x-3,5]],wood);
    path(ctx,[[-30,-49],[30,-49],[30,-14],[-30,-14]],wood);path(ctx,[[-26,-45],[26,-45],[26,-18],[-26,-18]],lightWood);
    ctx.save();ctx.translate(0,-32);ctx.scale(1.4,1.1);sheet(ctx,0,0,-.04);ctx.restore();
    path(ctx,[[-34,-48],[0,-57],[34,-48],[31,-43],[-31,-43]],'#8b744d');
  }else if(kind==='records'){
    for(const x of [-24,20])path(ctx,[[x,-13],[x+5,-13],[x+5,5],[x,5]],wood);
    path(ctx,[[-31,-21],[22,-25],[32,-13],[-22,-9]],lightWood);path(ctx,[[-22,-9],[32,-13],[32,-7],[-22,-3]],wood);
    if(!used){sheet(ctx,-7,-18,-.12);sheet(ctx,10,-16,.13);ellipse(ctx,21,-17,3,4,'#605f4e');}
  }else if(kind==='ledger'||kind==='supplies'){
    path(ctx,[[-22,-17],[21,-17],[21,3],[-22,3]],wood);path(ctx,[[21,-17],[28,-22],[28,-3],[21,3]],'#8d704c');
    path(ctx,[[-22,-17],[-15,-23],[28,-23],[21,-17]],lightWood);
    line(ctx,[[-11,-17],[-11,3]],'#746747',3);line(ctx,[[11,-17],[11,3]],'#746747',3);
    if(kind==='ledger'&&!used){path(ctx,[[-20,-22],[22,-22],[24,-34],[-18,-34]],'#bba273');sheet(ctx,0,-14,-.1);}
    if(kind==='supplies'&&!used){path(ctx,[[-7,-16],[6,-16],[6,-3],[-7,-3]],'#dfd2ab');line(ctx,[[0,-14],[0,-5]],'#718458',2.5);line(ctx,[[-4,-9],[4,-9]],'#718458',2.5);}
    if(used)line(ctx,[[-20,-14],[18,-14]],'#6c6045',3);
  }else if(kind==='signal'){
    path(ctx,[[-6,-8],[0,-61],[6,-8]],wood);line(ctx,[[-20,0],[0,-40],[20,0]],wood,4);line(ctx,[[-20,-47],[25,-47]],wood,4);
    if(!used){path(ctx,[[3,-46],[23,-46],[20,-23],[3,-28]],'#ad6353');line(ctx,[[-16,-44],[-16,-12]],'#baa36e',2);ellipse(ctx,-16,-13,6,5,'#c8ae68');}
    else {line(ctx,[[-16,-44],[-16,-31]],'#baa36e',2);path(ctx,[[7,2],[20,0],[26,5],[14,8]],'#ad6353');}
  }else if(kind==='grain'){
    sack(ctx,-17,0,.9);sack(ctx,13,2,1);sack(ctx,0,-17,.85);
  }else if(kind==='tent'){
    path(ctx,[[-47,3],[-28,-52],[30,-52],[50,3]],'#b7ac83');path(ctx,[[-47,3],[-28,-52],[1,-27],[-4,6]],'#d1c79e');
    path(ctx,[[1,-27],[30,-52],[50,3],[-4,6]],'#918d6a');path(ctx,[[-4,6],[7,-22],[19,5]],'#5e6653');
    path(ctx,[[-53,-9],[-29,-58],[30,-58],[56,-9],[1,-24]],'#c1b58d');
    line(ctx,[[-29,-58],[1,-24],[30,-58]],'#e1d4a4',2);line(ctx,[[-45,4],[-51,-11]],ink,3);line(ctx,[[49,4],[54,-11]],ink,3);
  }else {ctx.restore();return false;}
  if(!used&&['records','ledger'].includes(kind)){ctx.strokeStyle='#ded39b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-37,4,0,Math.PI*2);ctx.stroke();}
  ctx.restore();return true;
}
