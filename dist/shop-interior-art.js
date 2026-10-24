// A small open-roof shop shares its floor, wall and furniture footprint with
// movement. Product displays are baked once; actors keep their existing art.
const TAU=Math.PI*2,LIMIT_BYTES=6*1024*1024,INK='#465348',WOOD='#94734d',LIGHT='#d0ad78',DARK='#62543e';
const noise=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const line=(c,points,color,width=1)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
const poly=(c,points,fill,edge=null,width=1.3)=>{c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}};
const oval=(c,x,y,rx,ry,fill,edge=null)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=fill;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1;c.stroke();}};
const round=(c,x,y,w,h,r,fill,edge=null)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1.4;c.stroke();}};
const palettes={forest:{wall:'#c2c2a0',light:'#e1d9b0',shade:'#929b7c',rug:'#7c9178'},marsh:{wall:'#b8c3ab',light:'#d9dec0',shade:'#869e88',rug:'#688e83'},ruins:{wall:'#c8c1a3',light:'#e7dcb7',shade:'#9c9e81',rug:'#84947d'},beach:{wall:'#d1c9ab',light:'#eee2bf',shade:'#aaa889',rug:'#79a49b'},mountain:{wall:'#bdc5b3',light:'#dfe3cb',shade:'#899d8f',rug:'#829998'},snow:{wall:'#c6d9cf',light:'#edf0d9',shade:'#97b5af',rug:'#86a6aa'},city:{wall:'#cfc3a6',light:'#e9dcb7',shade:'#a79e82',rug:'#a27c65'},ember:{wall:'#c4b89b',light:'#dfcba4',shade:'#9c957c',rug:'#a18d72'}};
const palette=theme=>palettes[theme]||palettes.forest;
function blade(c,x,y,angle=0,s=1){c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s);poly(c,[[-2,-2],[-3,-28],[0,-35],[3,-28],[2,-2]],'#baccc0',INK);line(c,[[0,-31],[0,-3]],'#eff0d6',1);line(c,[[-7,0],[7,0]],LIGHT,3);line(c,[[0,2],[0,11]],DARK,4);oval(c,0,11,2.7,2.5,LIGHT);c.restore();}
function shield(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-12,-17],[0,-21],[12,-17],[10,2],[0,12],[-10,2]],'#789580',INK,1.5);poly(c,[[0,-17],[8,-14],[7,1],[0,8]],'#b2bf98');line(c,[[0,-16],[0,7]],LIGHT,1.5);oval(c,0,-5,3,3,LIGHT,INK);c.restore();}
function book(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-16,-8],[-5,-10],[0,-6],[5,-10],[16,-8],[15,10],[5,8],[0,12],[-5,8],[-15,10]],'#e7dcb5',DARK,1.2);line(c,[[0,-6],[0,10]],'#ab9870');for(const yy of [-3,2,6]){line(c,[[-11,yy],[-4,yy-1]],'#8f9b7f',.8);line(c,[[4,yy-1],[11,yy]],'#8f9b7f',.8);}c.restore();}
function scroll(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);round(c,-13,-9,26,17,3,'#e3d0a0',DARK);for(const xx of [-13,12]){round(c,xx-2,-10,4,20,2,'#cbb383',DARK);oval(c,xx,-10,3,2,LIGHT,DARK);}line(c,[[-7,-4],[6,-4]],'#a1a082');line(c,[[-7,0],[3,0]],'#a1a082');line(c,[[-7,4],[7,4]],'#a1a082');c.restore();}
function flask(c,x,y,color,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-3,-18],[3,-18],[3,-12],[8,-7],[8,4],[4,8],[-4,8],[-8,4],[-8,-7],[-3,-12]],'#b8ceba',INK,1.1);poly(c,[[-6,-3],[6,-3],[6,3],[3,6],[-3,6],[-6,3]],color);round(c,-4,-20,8,4,1,WOOD,INK);line(c,[[-4,-10],[-5,0]],'#e9eed6',1.2);c.restore();}
function basket(c,x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);poly(c,[[-18,-8],[18,-8],[14,10],[-14,10]],WOOD,DARK);oval(c,0,-8,18,6,LIGHT,DARK);for(const xx of [-10,-3,4,11])line(c,[[xx,-5],[xx*.8,8]],'#b79662',1);for(const yy of [0,5])line(c,[[-15,yy],[15,yy]],DARK,.8);for(const [xx,yy]of[[-10,-11],[0,-15],[10,-10]]){oval(c,xx,yy,7,4,'#d8bc7f',DARK);line(c,[[xx-3,yy-2],[xx+1,yy+1]],'#efdb9e',1);}c.restore();}
function furnitureBody(c,w,d,h){const L=-w/2,R=w/2,side=Math.min(10,w*.12);round(c,L,-d,w,d,4,'#4b503d33');poly(c,[[R-side,-h],[R,-d-h],[R,-d],[R-side,0]],DARK,INK);round(c,L,-h,w-side,h,3,WOOD,INK);poly(c,[[L,-h],[L+side,-d-h],[R,-d-h],[R-side,-h]],LIGHT,INK);line(c,[[L+2,-h-2],[R-side-2,-h-2]],'#e6c693',1.5);line(c,[[L+2,-3],[R-side-2,-3]],LIGHT,1.2);return{L,R:R-side};}
function paintFurniture(c,item,shopKind,p){
  const {kind}=item,w=item.width||88,d=item.depth||34;
  if(kind==='rug'){
    round(c,-w/2,-d,w,d,5,p.rug,DARK);round(c,-w/2+6,-d+6,w-12,d-12,3,p.rug,LIGHT);poly(c,[[-w*.2,-d/2],[0,-d*.78],[w*.2,-d/2],[0,-d*.22]],'#d1bd8a77',LIGHT,1);for(let x=-w/2+9;x<w/2-5;x+=8){line(c,[[x,-d-4],[x,-d+1]],LIGHT,1.3);line(c,[[x,-1],[x,4]],LIGHT,1.3);}return;
  }
  if(kind==='lamp'){
    oval(c,0,-3,Math.min(12,w/2),5,DARK,INK);line(c,[[0,-5],[0,-44]],WOOD,5);line(c,[[-1,-7],[-1,-43]],LIGHT,1.4);round(c,-10,-61,20,22,4,'#c3ae76',INK);round(c,-7,-58,14,14,2,'#eddd9b',DARK);line(c,[[0,-59],[0,-40]],LIGHT,1.3);poly(c,[[-12,-62],[0,-70],[12,-62]],p.rug,INK);return;
  }
  const counter=kind==='counter',h=counter?28:48,{L,R}=furnitureBody(c,w,d,h);
  if(counter){
    for(const xx of [L+9,L+w*.51]){round(c,xx,-h+6,w*.37,h-12,2,'#a38457',DARK);line(c,[[xx+3,-h+8],[xx+w*.37-3,-h+8]],LIGHT,1);oval(c,xx+w*.185,-h*.5,2,1.4,DARK);}
    if(shopKind==='weapons'){blade(c,-w*.25,-h-d*.45,.85,.65);shield(c,w*.2,-h-d*.42,.65);}
    else if(shopKind==='skills'){book(c,-w*.21,-h-d*.45,.9);scroll(c,w*.2,-h-d*.48,.6);}
    else{basket(c,-w*.23,-h-d*.42,.75);flask(c,w*.13,-h-d*.46,'#b58d6f',.64);flask(c,w*.29,-h-d*.38,'#8ca978',.58);}
    oval(c,R-12,-h-8,5,2.4,'#e3c581',DARK);return;
  }
  // Shelves have visible feet and a shallow solid cabinet. Nothing below a
  // hanging blade implies a separate obstacle beyond this shared footprint.
  if(kind==='weaponRack'){
    round(c,L+4,-h+4,w-18,h-9,2,'#6b6650',DARK);for(const xx of [L+9,R-10]){line(c,[[xx,-h+5],[xx,-5]],WOOD,3);}
    blade(c,L+w*.25,-13,-.12,.75);blade(c,L+w*.49,-14,.13,.72);shield(c,L+w*.76,-20,.64);line(c,[[L+5,-8],[R-4,-8]],LIGHT,3);
    // A little bow rests on the top shelf alongside a bundled spear.
    c.beginPath();c.moveTo(-23,-h-5);c.quadraticCurveTo(-39,-h-d*.75,-18,-h-d+5);c.strokeStyle=DARK;c.lineWidth=2.8;c.stroke();line(c,[[-23,-h-5],[-18,-h-d+5]],'#e9d5aa',.7);line(c,[[8,-h-7],[24,-h-d+6]],DARK,2);poly(c,[[21,-h-d+9],[25,-h-d+3],[27,-h-d+9]],'#bfcdc0',INK,.7);
  }else{
    for(const yy of [-h+5,-h*.45])round(c,L+5,yy,w-20,h*.39,1,'#68634b',DARK);
    if(kind==='scrollShelf'){
      for(let i=0;i<6;i++){const x=L+10+i*(w-26)/6,hh=13+(i%3)*3;round(c,x,-h*.47-hh,7,hh,1,['#8fa48c','#ac8767','#b9b17d'][i%3],DARK);line(c,[[x+2,-h*.47-hh+3],[x+2,-h*.47-2]],'#e2cca0',.7);}
      scroll(c,-w*.2,-12,.62);book(c,w*.2,-12,.48);scroll(c,0,-h-d*.5,.8);
    }else{
      for(const [i,x]of[-w*.26,0,w*.25].entries()){flask(c,x,-h*.5,['#92ae84','#c0a36b','#a78c80'][i],.6);flask(c,x,-7,['#ba9679','#87aaa1','#b3b57c'][i],.48);}
      basket(c,-w*.18,-h-d*.48,.6);flask(c,w*.23,-h-d*.48,'#9fb485',.65);
    }
    line(c,[[L+3,-h*.44],[R-2,-h*.44]],LIGHT,3);line(c,[[L+3,-3],[R-2,-3]],LIGHT,3);
  }
}

export function shopFurnitureVisual(item){
  const kind=item.kind||item.type,w=item.width||88,d=item.depth||34,x=item.x||0,y=item.y||0,halfWidth=w/2+8,top=kind==='rug'?d+6:kind==='lamp'?75:d+75,bottom=10;
  return{halfWidth,top,bottom,sortY:y,maxBounds:{minX:x-halfWidth,minY:y-top,maxX:x+halfWidth,maxY:y+bottom}};
}

export class ShopInteriorArt {
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.bytes=0;this.builds=0;}
  get cacheStats(){return{entries:this.cache.size,bytes:this.bytes,limitBytes:LIMIT_BYTES,builds:this.builds};}
  _sprite(key,w,h,ox,oy,paint,ratio=1.5){
    let image=this.cache.get(key);if(image){this.cache.delete(key);this.cache.set(key,image);return image;}
    const canvas=this.makeCanvas();canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,ox*ratio,oy*ratio);c.lineJoin='round';c.lineCap='round';paint(c);image={canvas,w,h,ox,oy,bytes:canvas.width*canvas.height*4};
    while(this.cache.size&&this.bytes+image.bytes>LIMIT_BYTES){const key=this.cache.keys().next().value,old=this.cache.get(key);this.bytes-=old.bytes;old.canvas.width=old.canvas.height=0;this.cache.delete(key);}this.cache.set(key,image);this.bytes+=image.bytes;this.builds++;return image;
  }
  drawGround(c,scene,camX,camY,w,h){
    const room=scene.shopInterior;if(!room)return false;const b=room.bounds||scene.bounds,theme=room.theme||'forest',p=palette(theme),width=b.maxX-b.minX,depth=b.maxY-b.minY,entry=room.entry||{x:0,width:130};
    const image=this._sprite(`floor:${theme}:${width}:${depth}:${entry.x}:${entry.width}`,width,depth,0,0,g=>{
      g.fillStyle='#89704e';g.fillRect(0,0,width,depth);
      for(let row=0;row<Math.ceil(depth/28);row++)for(let col=-1;col<Math.ceil(width/126);col++){
        const x=col*126+(row%2)*63,y=row*28,n=noise(col+17,row+39);round(g,x+1,y+1,124,26,1,['#b5976c','#bba177','#af9369','#b99a70'][Math.floor(n*4)]);line(g,[[x+4,y+2],[x+120,y+2]],'#e2c69280');line(g,[[x+3,y+25],[x+121,y+25]],'#806d4b77');line(g,[[x+16,y+11],[x+45+n*55,y+11.6]],'#806d4b27');for(const xx of [x+6,x+119])oval(g,xx,y+6,.65,.65,'#74644280');
      }
      g.strokeStyle=DARK;g.lineWidth=9;g.strokeRect(6,6,width-12,depth-12);g.strokeStyle=LIGHT;g.lineWidth=2;g.strokeRect(12,12,width-24,depth-24);
      // Sunlight and a short stone threshold establish the open doorway.
      const x=entry.x-b.minX,ew=entry.width||130;g.fillStyle=p.shade;g.fillRect(x-ew/2,depth-22,ew,22);g.fillStyle=p.wall;g.fillRect(x-ew/2+2,depth-20,ew-4,18);for(let xx=x-ew/2+24;xx<x+ew/2;xx+=25)line(g,[[xx,depth-19],[xx,depth-3]],p.shade,.9);line(g,[[x-ew/2+3,depth-20],[x+ew/2-3,depth-20]],p.light,2);
      const glow=g.createRadialGradient(width*.48,depth*.35,20,width*.5,depth*.45,width*.7);glow.addColorStop(0,'#f9e3b214');glow.addColorStop(1,'#3e4d3b1f');g.fillStyle=glow;g.fillRect(0,0,width,depth);
    },1);
    c.save();c.fillStyle='#344339';c.fillRect(0,0,w,h);c.drawImage(image.canvas,b.minX+w/2-camX,b.minY+h/2-camY,width,depth);c.restore();return true;
  }
  drawFurniture(c,item,scene){
    const room=scene?.shopInterior||{},theme=room.theme||item.artTheme||'forest',kind=item.kind||item.type;if(!['counter','weaponRack','scrollShelf','supplyShelf','rug','lamp'].includes(kind))return false;
    const w=item.width||88,d=item.depth||34,shopKind=room.shopKind||scene?.shopKind||item.shopKind||'weapons',{top,halfWidth:ox}=shopFurnitureVisual(item),oy=top,image=this._sprite(`furniture:${kind}:${shopKind}:${theme}:${w}:${d}`,w+16,top+10,ox,oy,g=>paintFurniture(g,{...item,kind,width:w,depth:d},shopKind,palette(theme)));
    c.drawImage(image.canvas,item.x-image.ox,item.y-image.oy,image.w,image.h);return true;
  }
  drawWall(c,prop,behind=false){
    const vertical=Math.abs(Math.sin(prop.angle||0))>.5,half=prop.halfLength||0,r=prop.r||12,theme=prop.artTheme||'forest',p=palette(theme),w=vertical?r*2:half*2+r*2,d=vertical?half*2+r*2:r*2,height=36,ox=w/2+3,oy=d/2+height+3;
    const image=this._sprite(`wall:${vertical}:${half}:${r}:${theme}`,w+6,d+height+6,ox,oy,g=>{
      round(g,-w/2,-d/2-height,w,d+height,Math.min(r,6),p.shade,INK);round(g,-w/2,-d/2-height,w,d,Math.min(r,6),p.light,INK);
      if(vertical){for(let y=-d/2+18;y<d/2-10;y+=40)line(g,[[-w/2+2,y-height],[w/2-2,y-height]],p.shade,1);line(g,[[-w/2+3,-d/2-height+3],[-w/2+3,d/2-height]],'#f0e0b988',1.4);}
      else{round(g,-w/2+1,-d/2-height+5,w-2,height-6,2,p.wall);line(g,[[-w/2+1,-3],[w/2-1,-3]],DARK,7);line(g,[[-w/2+1,-6],[w/2-1,-6]],LIGHT,1.7);for(let x=-w/2+14;x<w/2-7;x+=82){round(g,x,-d/2-height+4,6,height+7,1,WOOD,INK);line(g,[[x+1,-d/2-height+6],[x+1,-7]],LIGHT,1);}}
      line(g,[[-w/2+4,-d/2-height+2],[w/2-4,-d/2-height+2]],'#f1e5bf',1.5);
    },1.25);
    c.save();if(behind)c.globalAlpha*=.4;c.drawImage(image.canvas,prop.x-image.ox,prop.y-image.oy,image.w,image.h);c.restore();return true;
  }
}
