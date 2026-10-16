import assert from 'node:assert/strict';
import { createJudgmentPlan, judgmentBatch } from './dist/judgment-layout.js';

const originalRandom=Math.random;Math.random=()=>{throw Error('visual scheduling must not consume gameplay randomness');};
try{
  for(const [width,height] of [[540,985],[540,830],[1440,900],[2560,1440]]){
    const plan=createJudgmentPlan({width,height,duration:3,seed:916});
    assert.deepEqual(plan,createJudgmentPlan({width,height,duration:3,seed:916}));
    assert(plan.length>=9&&plan.length<=36);
    assert(plan[0].at>=0);assert(plan.at(-1).at+.18<3,'the final short bolt expires before the 3-second presentation ends');
    assert(Math.min(...plan.map(p=>p.u))<.09&&Math.max(...plan.map(p=>p.u))>.91,'both horizontal edges are covered');
    assert(Math.min(...plan.map(p=>p.v))<.09&&Math.max(...plan.map(p=>p.v))>.91,'both vertical edges are covered');
    const cells=new Set(plan.map(p=>`${Math.min(2,Math.floor(p.u*3))}:${Math.min(2,Math.floor(p.v*3))}`));
    assert.equal(cells.size,9,'center, corners and all four sides receive strikes');
    let peak=0;
    for(let t=0;t<=3;t+=1/240)peak=Math.max(peak,plan.filter(p=>p.at<=t&&p.at+.18>t).length);
    assert(peak<=3,`sparse local bolts stay bounded on ${width}x${height}: ${peak}`);
    const view={x:400,y:-300,width,height},fired=[];let last=-1;
    for(let t=0;t<3.1;t+=1/60){fired.push(...judgmentBatch(plan,last,t,view));last=t;}
    assert.equal(fired.length,plan.length,'frame windows neither lose nor duplicate a scheduled strike');
    assert.equal(new Set(fired.map(point=>point.seed)).size,plan.length);
    assert(fired.every(p=>p.x>view.x-width/2&&p.x<view.x+width/2&&p.y>view.y-height/2&&p.y<view.y+height/2));
    const moved=judgmentBatch(plan,-1,3,{...view,x:view.x+200,y:view.y+120});
    assert.equal(moved.length,fired.length);for(let i=0;i<moved.length;i++){assert(Math.abs(moved[i].x-fired[i].x-200)<1e-8);assert(Math.abs(moved[i].y-fired[i].y-120)<1e-8);}
  }
}finally{Math.random=originalRandom;}
console.log('Judgment visuals: phone/desktop full-view coverage, sparse 3-second schedule, bounded simultaneous bolts, frame-rate independent batching and camera-relative future strikes passed.');
