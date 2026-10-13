import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p){
    for(const side of [-1,1]){const stride=p*side*1.5;poly(c,[[side*4,13],[side*13,11],[side*18,19+stride],[side*11,23],[side*2,22]],grad(c,-17,23,17,11,['#494d34','#767a48','#aaa773']),'#354630',1.1);line(c,[[side*7,20+stride],[side*12,20+stride]],'#c0b48766',.9);}
    c.fillStyle=grad(c,-19,16,17,-7,['#8b8e63','#c3bf90','#e5d8aa']);c.strokeStyle='#586349';c.lineWidth=1.2;c.beginPath();c.moveTo(-15,-8);c.quadraticCurveTo(0,-11,15,-8);c.bezierCurveTo(12,0,15,9,18,15);c.quadraticCurveTo(1,21,-18,15);c.quadraticCurveTo(-13,5,-15,-8);c.fill();c.stroke();
    for(let i=0;i<10;i++){const x=-13+i*2.7;line(c,[[x,-2],[x*.83,5],[x*1.15,15]],i%3?'#666f4937':'#f6e4b63f',.75);}
    const cap=()=>{c.beginPath();c.moveTo(-30,-7);c.bezierCurveTo(-31,-17,-17,-30,0,-29);c.bezierCurveTo(17,-31,30,-19,30,-8);c.quadraticCurveTo(19,2,0,1);c.quadraticCurveTo(-20,1,-30,-7);c.closePath();};
    cap();c.fillStyle=grad(c,-25,-1,22,-29,['#7c5442','#ad7952','#d6a46e']);c.fill();c.strokeStyle='#5d513a';c.lineWidth=1.3;c.stroke();
    c.save();cap();c.clip();for(let i=0;i<48;i++){const x=-27+hash(i,90)*54,y=-27+hash(i,55)*29;oval(c,x,y,.7+hash(i,34)*1.5,.4+hash(i,41)*.8,i%3?'#533c3424':'#f2d39a3b');}for(const [x,y,rx,ry] of [[-16,-14,6,3],[-3,-23,5,3],[16,-16,7,4],[-22,-6,3,1.8],[4,-8,4,2]]){oval(c,x-.7,y+.8,rx+1,ry+1,'#765c4638');oval(c,x,y,rx,ry,'#ecd2a0b8');line(c,[[x-rx*.4,y-ry*.35],[x+rx*.4,y-ry*.35]],'#fff0c675',.7);}c.restore();
    c.fillStyle='#514c364d';c.beginPath();c.moveTo(-29,-6);c.quadraticCurveTo(0,5,29,-6);c.quadraticCurveTo(10,5,-13,1);c.fill();line(c,[[-20,-1],[-10,1],[1,2],[15,0],[25,-3]],'#e0bc8880',1);for(const x of [-6,6]){oval(c,x,6,2.1,3,'#394735');oval(c,x+.6,5.1,.6,.8,'#e4ddb0');}c.strokeStyle='#69714c';c.lineWidth=1.1;c.beginPath();c.moveTo(-3,12);c.quadraticCurveTo(0,13,3,11.5);c.stroke();
  }

export default Object.freeze({paint});
