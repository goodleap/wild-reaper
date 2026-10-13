import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c){
    // A wet, folded silhouette and embedded leaves distinguish sap from a disk.
    const body=()=>{c.beginPath();c.moveTo(-18,8);c.bezierCurveTo(-20,2,-16,-3,-15,-6);c.bezierCurveTo(-11,-18,-1,-20,6,-16);c.bezierCurveTo(14,-16,17,-6,17,0);c.bezierCurveTo(18,4,21,8,17,10);c.quadraticCurveTo(12,14,6,12);c.quadraticCurveTo(-1,16,-7,12);c.quadraticCurveTo(-15,14,-18,8);c.closePath();};
    body();c.fillStyle=grad(c,-12,13,12,-18,['#4b7043','#84a55b','#c3d88b']);c.fill();c.strokeStyle='#304e35';c.lineWidth=1.4;c.stroke();c.save();body();c.clip();
    c.fillStyle='#d0e2944a';c.beginPath();c.moveTo(-9,-7);c.bezierCurveTo(-6,-18,10,-20,14,-7);c.bezierCurveTo(10,-11,-2,-8,-9,-7);c.fill();
    c.fillStyle='#2b553c4d';c.beginPath();c.moveTo(-18,4);c.quadraticCurveTo(-10,7,-10,0);c.quadraticCurveTo(-7,10,2,9);c.quadraticCurveTo(10,6,18,6);c.lineTo(20,16);c.lineTo(-20,16);c.fill();
    for(let i=0;i<21;i++){const x=-14+hash(i,31)*28,y=-13+hash(i,39)*23;oval(c,x,y,.4+hash(i,18)*1.2,.6+hash(i,28)*1.4,i%2?'#d9e9a23d':'#325d3833');}
    leaf(c,9,5,6,1.7,-.9,'#4a784854');leaf(c,-12,1,4,1.5,.6,'#59834066');c.restore();
    oval(c,6,-12,4.1,1.9,'#eff9c786',-.35);oval(c,11,-8,1.4,2,'#f4f9c299',-.4);line(c,[[9,11],[14,10],[16,8]],'#c2dd9080',.9);
    for(const x of [-5,5]){oval(c,x,0,2.1,3.1,'#233f30');oval(c,x+.4,-1.1,.65,.9,'#e5efb3');}c.strokeStyle='#34533b';c.lineWidth=1.1;c.beginPath();c.moveTo(-2,6);c.quadraticCurveTo(0,7,2,5.8);c.stroke();
  }

export default Object.freeze({paint});
