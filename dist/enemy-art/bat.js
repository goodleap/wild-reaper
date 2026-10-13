import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p){const wing=p*6;
    for(const side of [-1,1]){c.save();c.scale(side,1);const points=[[5,-4],[15,-12+wing*.4],[28,-17+wing],[25,-2+wing*.3],[21,5],[16,1],[12,7],[7,7]];poly(c,points,grad(c,5*side,10,28*side,-20,['#4d5264','#858293','#b7aabd']),'#394652',1.2);poly(c,[[7,-2],[15,-10+wing*.4],[24,-13+wing],[19,-4],[16,1],[12,7]],'#bba9bd35');line(c,[[7,-2],[15,-10+wing*.4],[28,-17+wing]],side>0?'#d2becb':'#9c8d9e',1.2);line(c,[[14,-8+wing*.4],[16,1]],'#4b506285',.8);line(c,[[21,-12+wing*.7],[21,4]],'#4a50628a',.8);line(c,[[10,-4],[12,6]],'#4b50627a',.7);poly(c,[[27,-17+wing],[29,-19+wing],[28,-13+wing]],'#e0c9ba');c.restore();}
    poly(c,[[-5,-7],[-7,-17],[-3,-20],[0,-10],[4,-19],[7,-16],[6,-6]],'#555a6b','#344351',1);poly(c,[[-5,-16],[-3,-17],[-1,-10]],'#b393a9');poly(c,[[4,-16],[5,-14],[4,-10]],'#d1b2c1');
    oval(c,0,0,8,11,grad(c,-7,8,7,-12,['#3a4653','#667382','#9da7ae']));poly(c,[[-5,0],[-4,6],[-1,4],[1,7],[5,4],[4,-1]],'#c1c1b43b');
    for(let i=0;i<11;i++){const x=-5+hash(i,75)*10,y=-8+hash(i,47)*16;line(c,[[x,y],[x+.5,y+2]],i%2?'#cad0c936':'#253b4666',.6);}
    for(const x of [-3,3]){oval(c,x,-2,1.65,2.1,'#f1d49b');oval(c,x+.4,-2,.7,1.3,'#393d3c');}poly(c,[[-2,5],[-.6,7],[0,4]],'#e6dfc2');poly(c,[[1,4],[2,6.5],[3,4]],'#e6dfc2');line(c,[[-4,10],[-5,12]],'#b1a79a',1);line(c,[[4,10],[5,12]],'#b1a79a',1);
  }

export default Object.freeze({paint,frequency:18});
