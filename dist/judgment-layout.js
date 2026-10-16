const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const noise=(seed,index)=>{const n=Math.sin(seed*12.9898+index*78.233)*43758.5453;return n-Math.floor(n);};

// Visual scheduling never reads enemy positions or consumes gameplay RNG.
// Stratification reaches the entire view, while the short existing strike
// lifetime and at most 36 slots bound simultaneous bolts to three at 3 s.
export function createJudgmentPlan({width=540,height=960,duration=3,seed=916}={}){
  const columns=clamp(Math.round(width/260)+1,3,6),rows=clamp(Math.round(height/260)+1,3,6),pending=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const index=row*columns+column;
    pending.push({u:.06+column/(columns-1)*.88+(noise(seed,index*2)-.5)*.035,v:.06+row/(rows-1)*.88+(noise(seed,index*2+1)-.5)*.035,seed:seed+index*37});
  }
  const ordered=[];let previous={u:.5,v:.5};
  while(pending.length){
    let index=0,best=-Infinity;
    for(let i=0;i<pending.length;i++){
      const point=pending[i],score=(point.u-previous.u)**2+(point.v-previous.v)**2;
      if(score>best){best=score;index=i;}
    }
    previous=pending.splice(index,1)[0];ordered.push(previous);
  }
  const span=Math.max(0,duration-.24);
  return ordered.map((point,index)=>({...point,at:.02+span*index/(ordered.length-1)}));
}

// Each newly due bolt snapshots its world position. Already-live bolts remain
// fixed even if the camera moves; later ones cover the current viewport.
export function judgmentBatch(plan,from,to,{x,y,width,height}){
  return plan.filter(point=>point.at>from&&point.at<=to).map(point=>({x:x+(point.u-.5)*width,y:y+(point.v-.5)*height,seed:point.seed,at:point.at}));
}
