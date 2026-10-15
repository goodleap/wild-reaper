// Deterministic, world-space discharge snapshots shared by all storm layers.
// Only presentation is clustered: the engine still settles each target once.
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hash=(x,y=0)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const cache=new WeakMap();
export const STORM_MIN_BOLTS=8;
export const STORM_CLUSTER_RADIUS=45;
export const STORM_WAVE_STEP=.042;
export const STORM_WAVES=5;
export const STORM_DURATION=.82;
export function lightningPath(start,end,seed,depth=5,roughness=.2){
  const points=[start];
  function split(a,b,level,key){
    if(level<=0){points.push(b);return;}
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
    const along=.4+hash(seed,key)*.2,offset=(hash(seed+19,key)-.5)*d*roughness*2;
    const midpoint={x:a.x+dx*along-dy/d*offset,y:a.y+dy*along+dx/d*offset};
    split(a,midpoint,level-1,key*2+1);split(midpoint,b,level-1,key*2+2);
  }
  split(start,end,depth,1);return points;
}
function clusterTargets(targets){
  const clusters=[],cells=new Map(),radius=STORM_CLUSTER_RADIUS;
  // Big targets anchor their cluster; ties retain the snapshot order.
  const ordered=targets.map((target,index)=>({target,index})).sort((a,b)=>(b.target.r||0)-(a.target.r||0)||a.index-b.index);
  for(const entry of ordered){
    const {target}=entry,cx=Math.floor(target.x/radius),cy=Math.floor(target.y/radius);let nearest=null,distance=radius*radius;
    for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const candidate of cells.get(`${x},${y}`)||[]){
      const d=(target.x-candidate.target.x)**2+(target.y-candidate.target.y)**2;
      if(d<=distance){nearest=candidate;distance=d;}
    }
    if(nearest){nearest.members.push(entry);continue;}
    const cluster={...entry,members:[entry]};clusters.push(cluster);
    const key=`${cx},${cy}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(cluster);
  }
  return clusters;
}
function spreadSelection(clusters,limit,w,h){
  if(clusters.length<=limit)return clusters;
  const selected=[],remaining=new Set(clusters),distances=new Map();let next=clusters[0];
  while(selected.length<limit&&remaining.size){
    selected.push(next);remaining.delete(next);let farthest=-1,candidate=null;
    for(const cluster of remaining){
      const d=((cluster.target.x-next.target.x)/w)**2+((cluster.target.y-next.target.y)/h)**2;
      const nearest=Math.min(distances.get(cluster)??Infinity,d);distances.set(cluster,nearest);
      if(nearest>farthest){farthest=nearest;candidate=cluster;}
    }
    next=candidate;
  }
  return selected;
}
function fillerTarget(storm,w,h,occupied,index){
  const margin=Math.min(26,w*.12,h*.12),usableW=w-2*margin,usableH=h-2*margin;
  let best={x:storm.x,y:storm.y,r:14,seed:9001+index},bestDistance=-1;
  // Fixed jittered candidates give sparse casts broad coverage, without any
  // gameplay RNG or a random-search loop. Fillers remain inside both the cast
  // view and its fixed attack radius.
  for(let i=0;i<48;i++){
    const x=storm.x-w/2+margin+((i%8+.2+hash(i,index+37)*.6)/8)*usableW;
    const y=storm.y-h/2+margin+((Math.floor(i/8)+.2+hash(i,index+61)*.6)/6)*usableH;
    let distance=(x-storm.x)**2+(y-storm.y)**2;
    if(Number.isFinite(storm.radius)&&distance>storm.radius**2)continue;
    for(const point of occupied)distance=Math.min(distance,(x-point.x)**2+(y-point.y)**2);
    if(distance>bestDistance){best={x,y,r:14,seed:9001+index};bestDistance=distance;}
  }
  return best;
}
function makeBolt(target,index,empty,cluster){
  const seed=(target.seed||index+1)*13.7,end={x:target.x,y:target.y+3};
  return{target,index,empty,cluster,seed,end,delay:index%STORM_WAVES*STORM_WAVE_STEP};
}
export function getStormGeometry(storm){
  if(cache.has(storm))return cache.get(storm);
  const targets=storm.targets||[],w=Math.max(1,storm.viewWidth||1100),h=Math.max(1,storm.viewHeight||700),boltLimit=w<600?24:32;
  const clusters=clusterTargets(targets),selected=spreadSelection(clusters,boltLimit,w,h);
  const mainBolts=selected.map((cluster,index)=>makeBolt(cluster.target,index,false,cluster));
  const occupied=[...targets];
  while(mainBolts.length<STORM_MIN_BOLTS){const target=fillerTarget(storm,w,h,occupied,mainBolts.length);occupied.push(target);mainBolts.push(makeBolt(target,mainBolts.length,true,null));}
  for(const bolt of mainBolts){
    const {target,end,seed}=bolt;
    const start={x:target.x+(hash(seed,2)-.5)*Math.min(160,w*.32),y:Math.min(storm.y-h/2-40,end.y-170)};
    bolt.trunk=lightningPath(start,end,seed,5,.16);bolt.branches=[];
    for(let i=0;i<2;i++){
      const origin=bolt.trunk[9+i*9+Math.floor(hash(seed,i+4)*4)];
      const side=hash(seed,i+11)>.5?1:-1,length=30+hash(seed,i+17)*48;
      const tip={x:origin.x+side*length*.72,y:origin.y+length*(.55+hash(seed,i+20)*.55)};
      bolt.branches.push(lightningPath(origin,tip,seed+i*23+3,3,.24));
    }
  }
  const waves=Array.from({length:STORM_WAVES},(_,index)=>({delay:index*STORM_WAVE_STEP,mainBolts:[],links:[],impacts:[]}));
  for(const bolt of mainBolts)waves[bolt.index%STORM_WAVES].mainBolts.push(bolt);
  const impacts=targets.map((target,index)=>{
    let nearest=null,distance=Infinity;
    for(const bolt of mainBolts)if(!bolt.empty){const d=(target.x-bolt.target.x)**2+(target.y-bolt.target.y)**2;if(d<distance){nearest=bolt;distance=d;}}
    const hero=nearest?.target===target,seed=target.seed||index+1,radius=clamp((target.r||14)*.65+7,13,35),paths=[];
    const delay=nearest?.delay||0,wave=waves[Math.round(delay/STORM_WAVE_STEP)];
    // Dense neighbours share one sky stroke. Only short links are drawn;
    // overflow targets retain a full local hit rather than crossing the screen.
    if(nearest&&!hero&&distance<=72*72&&distance>4){
      wave.links.push(lightningPath(nearest.end,{x:target.x,y:target.y+3},seed+811,3,.14));
    }else if(distance>72*72){
      wave.links.push(lightningPath({x:target.x-5,y:target.y-39},{x:target.x,y:target.y+3},seed+811,3,.18));
    }
    const count=hero?4:2;
    for(let i=0;i<count;i++){
      const angle=(i/count+hash(seed,i)*.19)*TAU,length=radius*(.75+hash(seed,i+6)*.55),dx=Math.cos(angle),dy=Math.sin(angle)*.48;
      paths.push([{x:target.x+dx*3,y:target.y+3+dy*3},{x:target.x+dx*length*.45-dy*5,y:target.y+3+dy*length*.45+dx*3},{x:target.x+dx*length*.7+dy*3,y:target.y+3+dy*length*.7-dx*2},{x:target.x+dx*length,y:target.y+3+dy*length}]);
    }
    const impact={x:target.x,y:target.y+3,r:radius,seed,paths,hero,delay,targetIndex:index};wave.impacts.push(impact);return impact;
  });
  const geometry={mainBolts,impacts,waves,targetCount:targets.length,clusterCount:clusters.length,boltLimit};
  cache.set(storm,geometry);return geometry;
}
export function stormAge(storm){return Math.max(0,storm.maxLife-storm.life);}
export function stormBrightness(storm,calm=false,delay=0){
  const age=stormAge(storm)-delay;if(age<0)return 0;
  const remaining=Math.max(.01,storm.maxLife-delay),progress=clamp(age/remaining);
  if(calm)return .8*(1-progress);
  const first=age<.045?1:Math.exp(-(age-.045)*18);
  const returnStroke=.32*Math.exp(-(((age-.155)/.026)**2));
  return clamp(first+returnStroke+.14*(1-progress));
}
export function stormImpactBrightness(storm,calm=false,delay=0){
  const age=stormAge(storm);
  // Damage is immediate. A small contact spark acknowledges every victim
  // before its short, staggered main discharge lands, including dead targets.
  if(age<delay)return (calm?.22:.35)*Math.max(.2,1-age/.22);
  const progress=clamp((age-delay)/Math.max(.01,storm.maxLife-delay));
  return Math.max(stormBrightness(storm,calm,delay)*.8,(calm?.4:.62)*(1-progress)**1.5);
}
