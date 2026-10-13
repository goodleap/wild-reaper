import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p,flip=1){
    // The same ground-level side view as the boar: a domed shell above the
    // visible abdomen, with near feet below it and the far legs mostly hidden.
    // Vertical travel retains this profile instead of rotating the body flat.
    c.save();c.scale(flip,1);
    const light=colors=>grad(c,-24*flip,16,24*flip,-24,colors);
    const leg=(i,far=false)=>{
      const stride=p*(i===1?-1:1)*(far?-1:1),hipX=-13+i*11+(far?2:0),hipY=far?3:5.5;
      const kneeX=hipX+(i-1)*4+stride*1.4,kneeY=far?8.4:11.4;
      const footX=hipX+(i-1)*7+stride*3,footY=(far?14.4:17.1)-Math.max(0,stride)*(far?1.2:2.4);
      line(c,[[hipX,hipY],[kneeX,kneeY],[footX,footY],[footX+2.2,footY+.1]],far?'#354533':'#30422f',far?2.5:3.1);
      line(c,[[hipX+.1,hipY],[kneeX+.25,kneeY-.35],[footX+.35,footY-.45]],far?'#66774a':light(['#69774b','#a99b61','#cec185']),far?.85:1.25);
      oval(c,kneeX,kneeY,far?1.2:1.6,far?1.15:1.5,far?'#596c43':'#9b9960');
      if(!far)line(c,[[footX,footY+.1],[footX+2.2,footY+.1]],'#a6a16b',.8);
    };
    for(let i=0;i<3;i++)leg(i,true);
    // Side abdomen remains visible beneath the wing-case rim. Broad plates
    // read at the normal 60px width; tiny noise is restricted to cached paint.
    oval(c,-7,3.8,17.4,7.4,'#30472f');oval(c,-7,3.2,16.5,6.7,light(['#3b5638','#73804b','#a8a465']));
    for(let i=0;i<5;i++){const x=-20+i*6.1;line(c,[[x,.7],[x-1,4.5],[x+.4,7.8]],'#334d337e',1.1);line(c,[[x+1,2],[x+.35,5.8]],'#c3b87958',.65);}
    const shell=()=>{c.beginPath();c.moveTo(-25,1.6);c.bezierCurveTo(-27,-6.5,-21,-15.5,-10,-17);c.bezierCurveTo(1,-19,10,-11.4,11,-3.3);c.quadraticCurveTo(5,3.2,-9,3.4);c.quadraticCurveTo(-19,3.5,-25,1.6);c.closePath();};
    shell();c.fillStyle=light(['#74613b','#ab8d4f','#d6bc78']);c.fill();c.strokeStyle='#394b33';c.lineWidth=1.4;c.stroke();
    c.save();shell();c.clip();
    // A single near wing case, not a top-view pair split down the centre.
    c.fillStyle='#534e2c44';c.beginPath();c.moveTo(-26,-2);c.quadraticCurveTo(-7,3,12,-7);c.lineTo(13,7);c.lineTo(-27,8);c.closePath();c.fill();
    for(let i=0;i<4;i++){const x=-20+i*7;c.strokeStyle=i%2?'#f0d89438':'#64593342';c.lineWidth=.9;c.beginPath();c.moveTo(x,-12+Math.abs(i-1)*1.8);c.quadraticCurveTo(x+5,-6,x+3,.9);c.stroke();}
    for(let i=0;i<27;i++){const x=-23+hash(i,12)*30,y=-15+hash(i,29)*16;line(c,[[x,y],[x+.8,y+.4]],i%3?'#514b2e32':'#f3e4b34b',.6);}
    const hx=-7+flip*7;
    oval(c,hx,-12.1,6.3,2.1,'#fff0b85c',-.2*flip);oval(c,hx+flip*2,-12.7,2.3,.7,'#fff2cd75',-.2*flip);
    c.restore();line(c,[[-24,1.1],[-14,3],[-2,2.5],[8,-1]],'#d3b979',1.15);
    // Overlapping thorax and forward head break the turtle-like shell outline.
    oval(c,8,-2.7,6.9,7.5,'#344931');oval(c,8.4,-3.2,6.15,6.75,light(['#4b613d','#829451','#b6ba75']));
    line(c,[[5,-8],[5.2,-3],[7,1.8]],'#d0c98775',.8);
    // The far feeler is subdued; the front feeler and eye are crisp profile
    // features. Both stay ahead of the head rather than fanning symmetrically.
    line(c,[[17,-3],[23,-10],[28,-11.5]],'#61764b',1.2);oval(c,28,-11.5,.8,.8,'#92a66d');
    c.fillStyle=light(['#435b38','#819153','#b5b66f']);c.strokeStyle='#334a31';c.lineWidth=1.1;c.beginPath();c.moveTo(11,-5);c.quadraticCurveTo(19,-8,22,-1);c.lineTo(23.5,3);c.quadraticCurveTo(22,7,16,6.1);c.quadraticCurveTo(10,4,11,-5);c.fill();c.stroke();
    poly(c,[[21.5,2.6],[27.8,3.5],[29,1],[28,6.3],[22,6]],light(['#7a744c','#b8a974','#e4cc94']),'#3a4d34',.75);
    poly(c,[[21,5],[26.5,6.4],[28.3,5.1],[26.5,8.2],[21,7]],'#a19963','#3a4d34',.65);
    line(c,[[19,-2],[24.5,-6],[29.4,-5.2]],'#3e5637',1.8);line(c,[[19.2,-2.3],[24.6,-6.3],[29.4,-5.5]],'#b5b87b',.75);oval(c,29.4,-5.3,.85,.85,'#b4c082');
    oval(c,17,-1.5,2.5,2.55,'#334831');oval(c,17.2,-1.7,1.8,1.9,'#ddce90');oval(c,17.6,-1.6,.85,1.3,'#344331');oval(c,17.2+flip*.45,-2.3,.45,.55,'#fff2be');
    for(let i=0;i<3;i++)leg(i,false);
    c.restore();
  }

export function poseWave(entity){return Math.sin(Number.isFinite(entity.walkPhase)?entity.walkPhase:0);}
export function facing(entity,{facings}){
  const dx=Math.cos(Number.isFinite(entity.visualFacing)?entity.visualFacing:0);
  if(Math.abs(dx)>.12)facings.set(entity,dx<0?-1:1);
  return facings.get(entity)||1;
}
export default Object.freeze({paint,poseWave,facing});
