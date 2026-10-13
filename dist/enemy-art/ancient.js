import { TAU, clamp, hash, poly, line, oval, grad, leaf, star } from './drawing.js';

export function paint(c,p){
    // Root feet and jointed bark limbs retain the original 60 x 68 envelope.
    for(const side of [-1,1]){c.save();c.scale(side,1);const a=p*1.2;poly(c,[[11,23],[24,20],[30,34],[31,39],[17,42],[4,39],[8,34]],grad(c,-30*side,42,25*side,22,['#48503a','#736746','#a29561']),'#34452e',1.2);for(let i=0;i<3;i++)line(c,[[12+i*4,30],[11+i*6,39]],'#404d3485',1);poly(c,[[25,-9],[37,-5],[48,17+a],[50,23+a],[55,30+a],[51,37],[43,34],[38,24],[29,19]],grad(c,-45*side,32,49*side,-10,['#4a4f36','#7e7048','#ac9560']),'#33462f',1.5);line(c,[[34,-3],[39,12],[46,23+a],[46,32]],'#c4aa736e',1.4);line(c,[[31,4],[35,16],[41,23]],'#374630ad',1.2);poly(c,[[44,25],[50,27],[53,35],[50,37],[47,32]],'#5c6541');line(c,[[50,28],[51,32]],'#b6a371',1);c.restore();}
    for(const side of [-1,1]){c.save();c.scale(side,1);const antler=[[16,-22],[21,-36],[26,-47],[23,-60],[25,-63],[29,-50],[37,-53],[42,-59],[45,-58],[40,-50],[30,-44],[25,-32],[22,-19]];poly(c,antler,grad(c,18*side,-21,39*side,-62,['#665c3d','#938354','#c3af78']),'#3b4d33',1.1);poly(c,[[23,-40],[17,-49],[16,-56],[19,-54],[21,-47],[26,-44]],'#9a8657','#415035',.8);line(c,[[23,-29],[28,-46],[26,-56]],'#dcc38a74',1.1);leaf(c,37,-52,7,2,-.9,'#83945a');leaf(c,22,-46,6,2,.7,'#6c8950');c.restore();}
    const body=()=>{c.beginPath();c.moveTo(-31,-24);c.lineTo(-20,-32);c.quadraticCurveTo(0,-38,22,-31);c.lineTo(30,-25);c.lineTo(34,-4);c.lineTo(32,8);c.lineTo(36,25);c.quadraticCurveTo(15,39,0,38);c.quadraticCurveTo(-23,36,-35,24);c.lineTo(-30,8);c.lineTo(-34,-5);c.closePath();};
    body();c.fillStyle=grad(c,-31,28,31,-34,['#41553a','#758451','#b1ad6c']);c.fill();c.strokeStyle='#2e482f';c.lineWidth=2.1;c.stroke();c.save();body();c.clip();
    for(let i=0;i<12;i++){const x=-30+i*5.4;poly(c,[[x,-34],[x+5,-30],[x+3,-16],[x+6,-5],[x+2,11],[x+6,33],[x+1,36],[x-2,14],[x+1,-2],[x-3,-16]],i%3?'#39503845':'#c5b47b3d');line(c,[[x,-29],[x+1,-17],[x-1,-4],[x+2,13],[x+1,28]],i%2?'#314b3488':'#c6b37a70',1.1);}
    for(let i=0;i<110;i++){const x=-30+hash(i,194)*60,y=-32+hash(i,222)*65;line(c,[[x,y],[x+hash(i,13)*1.7,y+1+hash(i,193)*2]],i%3?'#233d292b':'#d5c8923e',.7);}
    for(const [x,y]of[[-25,12],[22,19],[-18,-17]]){c.strokeStyle='#314b3470';c.lineWidth=1.4;c.beginPath();c.ellipse(x,y,2,5,.15,0,TAU);c.stroke();line(c,[[x+1,y-3],[x+2,y],[x+1,y+3]],'#bca97366',.75);}c.restore();
    // A jagged moss mantle, not circles stacked around the head.
    for(let i=0;i<26;i++){const x=-30+hash(i,84)*58,y=-31+hash(i,11)*14;leaf(c,x,y,6+hash(i,42)*10,2+hash(i,21)*3,-1+hash(i,44)*2,['#4f7541','#799450','#9dac66','#bbc082','#6b8a4b'][i%5]);}for(const x of [-27,25])line(c,[[x,-17],[x-2,-10],[x,-5]],'#517547',2.6);
    poly(c,[[-23,-11],[-14,-10],[-6,-6],[-9,2],[-22,-1]],'#263b2b');poly(c,[[23,-11],[14,-10],[6,-6],[9,2],[22,-1]],'#263b2b');line(c,[[-20,-4],[-11,-2]],'#eed692',2.5);line(c,[[11,-2],[20,-4]],'#f9dfa0',2.5);line(c,[[-20,-4],[-11,-2]],'#fff0c6',.7);line(c,[[11,-2],[20,-4]],'#fff1c5',.7);poly(c,[[-7,7],[0,4],[7,7],[5,13],[0,11],[-5,13]],'#3b5033');line(c,[[-13,16],[-7,14],[0,17],[8,14],[14,16]],'#364c32',1.5);
    poly(c,[[0,10],[10,20],[1,32],[-10,21]],'#475237','#293f2b',1);poly(c,[[0,13],[7.5,20],[0,29],[-7.5,21]],grad(c,-8,29,7,13,['#aa874c','#e2bc6c','#fff0b6']));poly(c,[[0,13],[1,21],[7.5,20]],'#fff5c6');poly(c,[[1,21],[0,29],[-7.5,21]],'#bd9654');
  }

export function ground(ctx,enemy,{line,diamond}){
    const slam=enemy.slam;if(!slam||slam.life<=0)return;
    const progress=clamp(1-slam.life/slam.maxLife,0,1),{x,y,r}=slam;
    ctx.globalAlpha=.12+progress*.07;ctx.fillStyle='#e36d45';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    ctx.globalAlpha=.92;ctx.strokeStyle='#e79567';ctx.lineWidth=2.6;ctx.stroke();
    ctx.globalAlpha=.7;ctx.strokeStyle='#e7b574';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r-7,0,TAU);ctx.stroke();
    ctx.globalAlpha=.95;ctx.strokeStyle='#ffe1a0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r-4,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
    // Four inward ticks keep the damage boundary readable in dense grass.
    ctx.beginPath();for(let i=0;i<4;i++){const angle=i*Math.PI/2;ctx.moveTo(x+Math.cos(angle)*(r-13),y+Math.sin(angle)*(r-13));ctx.lineTo(x+Math.cos(angle)*(r-20),y+Math.sin(angle)*(r-20));}ctx.lineWidth=2;ctx.stroke();
}
export default Object.freeze({paint,frequency:4,ground,groundOrder:1,phaseLabel:e=>e.slam?.life>0?'震地蓄力':null,sounds:Object.freeze({bossWindup:[145,.24,'sine',.025,210],bossSlam:[90,.28,'triangle',.045,40]})});
