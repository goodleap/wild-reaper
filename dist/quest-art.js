// Small world fixtures share the ordinary raised-prop depth queue. The bridge
// shutter is split along its footprint so actors can pass behind each section.
const INK='#445046',WOOD='#a58a60',LIGHT='#d1ba88',IRON='#69776c';
function polygon(c,points,fill){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.stroke();}
function line(c,x,y,xx,yy,color=INK,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
function circle(c,x,y,r,fill){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.stroke();}

export function questSceneProps(props){
  return (props||[]).flatMap(prop=>{
    if(prop.kind!=='questBarrier')return [{...prop,isQuest:true,sortY:prop.sortY??prop.y}];
    const half=prop.halfLength??116,count=Math.ceil(half*2/29),step=half*2/count,angle=prop.angle??Math.PI/2;
    const open=prop.open||prop.state==='completed';
    return Array.from({length:count+1},(_,i)=>{const along=-half+i*step;return {...prop,id:`${prop.id}:${i}`,isQuest:true,x:prop.x+Math.cos(angle)*along,y:prop.y+Math.sin(angle)*along,sortY:prop.y+Math.sin(angle)*along+6,segmentLength:!open&&i<count?step:0,end:i===0||i===count};}).filter(part=>!open||part.end);
  });
}

export function drawQuestShadowPath(c,prop,sun){
  if(!prop.isQuest)return false;
  if(prop.kind==='questBarrier'&&(prop.open||prop.state==='completed'))return true;
  const height=prop.kind==='questBoard'?48:prop.kind==='questWinch'?16:30;
  const width=prop.kind==='questBoard'?25:prop.kind==='questWinch'?24:8;
  const dx=prop.kind==='questBarrier'?Math.cos(prop.angle??Math.PI/2)*(prop.segmentLength||0):0;
  const dy=prop.kind==='questBarrier'?Math.sin(prop.angle??Math.PI/2)*(prop.segmentLength||0):0;
  const x=prop.x,y=prop.y,sx=sun.x*height,sy=sun.y*height;
  c.moveTo(x-width,y-3);c.lineTo(x+width+dx,y+dy+3);c.lineTo(x+width+dx+sx,y+dy+sy+3);c.lineTo(x-width+sx,y+sy-3);c.closePath();return true;
}

export function drawQuestProp(c,prop){
  if(!prop.isQuest)return false;
  c.save();c.translate(prop.x,prop.y);c.strokeStyle=INK;c.lineWidth=2;c.lineJoin='round';c.lineCap='round';
  if(prop.kind==='questBoard'){
    polygon(c,[[-20,4],[-15,-3],[18,-3],[23,4],[17,8],[-17,8]],'#8d9274');
    polygon(c,[[-4,1],[-4,-47],[4,-47],[4,1]],WOOD);
    polygon(c,[[-27,-57],[25,-59],[29,-28],[-27,-26]],WOOD);
    polygon(c,[[-29,-58],[-25,-64],[26,-65],[31,-59]],LIGHT);
    polygon(c,[[-18,-52],[17,-53],[16,-31],[-18,-30]],'#e4d6ac');
    line(c,-10,-46,10,-46,'#8c8969',1.5);line(c,-10,-41,7,-41,'#8c8969',1.5);line(c,-10,-36,1,-36,'#8c8969',1.5);
    circle(c,11,-34,3,'#a66d52');
    if(prop.state==='available'){
      circle(c,0,-76,8,'#e4ce8b');line(c,0,-80,0,-76,INK,2);circle(c,0,-72.5,.8,INK);
    }
  }else if(prop.kind==='questWinch'){
    polygon(c,[[-25,-1],[-16,-12],[21,-11],[28,0],[18,10],[-20,9]],'#92957d');
    polygon(c,[[-18,0],[-18,-25],[-10,-29],[-10,0]],WOOD);
    polygon(c,[[13,2],[13,-23],[21,-26],[21,2]],WOOD);
    polygon(c,[[-13,-24],[16,-23],[16,-12],[-13,-13]],IRON);
    for(let x=-8;x<=10;x+=4)line(c,x,-23,x,-13,LIGHT,2);
    circle(c,-17,-20,12,WOOD);circle(c,-17,-20,7,IRON);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;line(c,-17+Math.cos(a)*4,-20+Math.sin(a)*4,-17+Math.cos(a)*11,-20+Math.sin(a)*11,LIGHT,2);}
    line(c,-17,-20,-27,-30,INK,3);circle(c,-27,-30,3,LIGHT);
    if(prop.open||prop.state==='completed'){circle(c,24,-16,4,'#a7c68e');}
    else{line(c,11,-13,29,1,INK,3);line(c,11,-14,29,0,LIGHT,1);}
  }else if(prop.kind==='questBarrier'){
    const open=prop.open||prop.state==='completed',h=open?3:35;
    if(prop.end){polygon(c,[[-12,5],[-12,-h-8],[0,-h-14],[12,-h-8],[12,5],[0,10]],'#909680');line(c,-11,-h-6,11,-h-6,LIGHT,2);}
    else if(!open){polygon(c,[[-7,6],[-7,-h],[6,-h+1],[6,6]],IRON);line(c,-5,-h+3,4,-h+3,LIGHT,2);}
    if(prop.segmentLength>0){
      const dx=Math.cos(prop.angle??Math.PI/2)*prop.segmentLength,dy=Math.sin(prop.angle??Math.PI/2)*prop.segmentLength;
      for(const y of open?[1]:[-24,-8]){line(c,0,y,dx,dy+y,INK,5);line(c,0,y-1,dx,dy+y-1,open?'#999c88':LIGHT,2);}
    }
  }
  c.restore();return true;
}
