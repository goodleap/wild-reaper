// Shared tip-origin art for the waiting formation, flight, and legacy impact.
// Dimensions retain the old sprite's coordinate space at 80% of its draw size.
export const ROYAL_SWORD_SIZE=Object.freeze({
  waiting:Object.freeze({width:47*.8,height:20*.8}),
  flight:Object.freeze({width:128.8*.8,height:55.2*.8}),
});
const nativePath=()=>typeof Path2D==='function'?new Path2D():null;
const polygon=points=>[...points.map(([x,y],i)=>[i?'lineTo':'moveTo',x,y]),['closePath']];
const lines=segments=>segments.flatMap(([x1,y1,x2,y2])=>[['moveTo',x1,y1],['lineTo',x2,y2]]);
// The blade is parallel from the guard to x=-10; only the last ten units taper.
// All layers stop at x=0 so the visible point is exactly the simulated point.
const layers=[
  ['#657880',polygon([[-65,-5],[-10,-5],[0,0],[-10,5],[-65,5]])],
  ['#fff4cc',polygon([[-64,-4.3],[-10,-4.3],[0,0],[-64,0]])],
  ['#b1c4bf',polygon([[-64,0],[0,0],[-10,4.3],[-64,4.3]])],
  ['#e0ead7',polygon([[-64,0],[0,0],[-10,1.3],[-64,1.3]])],
  ['#fff9e3',lines([[-60,-.35,-11,-.35]]),.65],
  ['#9e8754',polygon([[-70,-3],[-77,-11],[-69,-9],[-64,-5],[-64,5],[-69,9],[-77,11],[-70,3]])],
  ['#f0d78f',polygon([[-73,-8],[-69,-9],[-64,-5],[-64,5],[-69,9],[-73,8],[-67,3],[-67,-3]])],
  ['#6c706b',polygon([[-85,-2],[-70,-2],[-70,2],[-85,2]])],
  ['#d6bc75',lines(Array.from({length:5},(_,i)=>[-84+i*3,-2,-82.5+i*3,2])),1],
  ['#e8d09a',polygon([[-92,0],[-87,-5],[-83,0],[-87,5]])],
  ['#e1ffff',[
    ['moveTo',-64.2,0],['bezierCurveTo',-64.2,1.767,-65.453,3.2,-67,3.2],
    ['bezierCurveTo',-68.547,3.2,-69.8,1.767,-69.8,0],
    ['bezierCurveTo',-69.8,-1.767,-68.547,-3.2,-67,-3.2],
    ['bezierCurveTo',-65.453,-3.2,-64.2,-1.767,-64.2,0],['closePath'],
  ]],
  ['#c3b976',lines([[-56,-2,-52,0],[-52,0,-56,2],[-49,-2,-45,0],[-45,0,-49,2]]),.7],
];

export class RoyalSwordArt{
  constructor({makePath=nativePath}={}){
    this.pathBuilds=0;this.commandCount=0;
    this.layers=layers.map(([color,commands,width=0])=>{
      const path=makePath();if(path)for(const [method,...args] of commands)path[method](...args);
      this.pathBuilds++;this.commandCount+=commands.length;
      return{color,width,path,commands:path?null:commands};
    });
  }
  get stats(){return{pathBuilds:this.pathBuilds,commands:this.commandCount};}
  draw(ctx,width=ROYAL_SWORD_SIZE.flight.width,height=ROYAL_SWORD_SIZE.flight.height){
    ctx.save();ctx.scale(width/112,height/48);ctx.lineJoin='miter';ctx.lineCap='butt';
    for(const layer of this.layers){
      if(!layer.path){ctx.beginPath();for(const [method,...args] of layer.commands)ctx[method](...args);}
      if(layer.width){ctx.strokeStyle=layer.color;ctx.lineWidth=layer.width;layer.path?ctx.stroke(layer.path):ctx.stroke();}
      else{ctx.fillStyle=layer.color;layer.path?ctx.fill(layer.path):ctx.fill();}
    }
    ctx.restore();
  }
}
