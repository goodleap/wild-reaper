import assert from 'node:assert/strict';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Game } from './dist/engine.js';

const fixed=(spec)=>new Terrain({obstacles:Array.isArray(spec)?spec:[spec]});
const circle={id:'rock',type:'rock',x:0,y:0,r:36};
const types=['slime','bat','beetle','brute','boss'];
const foot=(e,player=false)=>({x:e.x,y:e.y+groundOffset(e,player)});
const place=(e,x,y,player=false)=>{e.x=x;e.y=y-groundOffset(e,player);};
const safe=(terrain,e,player=false)=>{const p=foot(e,player);assert(terrain.isFree(p.x,p.y,e.r),`${e.type||'player'} penetrated terrain at ${p.x},${p.y}`);};
const arena=(terrain)=>{
  const g=new Game({terrain});g.enemies=[];g._shot=g._spawn=1e8;g.nextBossAt=1e8;g.player.invuln=1e8;return g;
};

// World generation is independent of visit order, including negative cells.
const world=new Terrain({cacheLimit:24});
const signature=()=>world.query(-1100,-1100,1100,1100).map(o=>({...o}));
const first=signature();
assert.deepEqual(new Set(first.map(o=>o.type)),new Set(['tree','rock','log']));
assert(world.isFree(0,0,185),'starting clearing must be traversable');
assert(first.some(o=>Math.hypot(o.x,o.y)<400),'terrain is discoverable near spawn');
for(let i=0;i<180;i++)world.query(i*1000,-i*700,i*1000+800,-i*700+800);
assert(world.cacheSize<=world.cacheLimit,'infinite travel must not grow the terrain cache');
assert.deepEqual(signature(),first,'returning to an evicted area preserves terrain');
assert.deepEqual(new Terrain().query(-1100,-1100,1100,1100),first);
const generated=new Terrain();
const props=generated.query(-2400,-2400,2400,2400);
for(const a of props) {
  const nearby=props.filter(b=>b!==a);
  const half=a.type==='log'?a.halfLength:0;
  // Both endpoints and center keep a full boss-width gap to neighboring props.
  for(const t of [-1,0,1]) {
    const x=a.x+Math.cos(a.angle)*half*t,y=a.y+Math.sin(a.angle)*half*t;
    for(const b of nearby) {const q=generated.closestPoint(b,x,y);assert(Math.hypot(x-q.x,y-q.y)>a.r+b.r+98,'procedural terrain must leave a boss-width passage');}
  }
}

// Circles and rotated capsules stop a fast movement at their near side.
for(const type of ['tree','rock','log'])for(const angle of [0,Math.PI/4,Math.PI/2]) {
  const o={...circle,type,angle,r:type==='tree'?24:type==='log'?16:36,halfLength:62};
  const terrain=fixed(o),nx=-Math.sin(angle),ny=Math.cos(angle);
  for(const r of [11,15,49]) {
    const result=terrain.moveCircle(-nx*210,-ny*210,nx*420,ny*420,r);
    assert(result.blocked);assert(terrain.isFree(result.x,result.y,r));
    assert(result.x*nx+result.y*ny<=-(o.r+r)+.1,'large step must not tunnel through an obstacle');
    const resolved=terrain.resolveCircle(0,0,r);
    assert(Number.isFinite(resolved.x)&&Number.isFinite(resolved.y));
    assert(terrain.isFree(resolved.x,resolved.y,r),'deeply overlapping spawn gets relocated');
    assert(terrain.firstBlocker(-nx*210,-ny*210,nx*210,ny*210,r));
    assert.equal(terrain.firstBlocker(-nx*210+Math.cos(angle)*180,-ny*210+Math.sin(angle)*180,nx*210+Math.cos(angle)*180,ny*210+Math.sin(angle)*180,r),null);
  }
}
const rock=fixed(circle);
let sliding={x:-110,y:-25};
for(let i=0;i<100;i++)sliding=rock.moveCircle(sliding.x,sliding.y,3,-1.5,15);
assert(sliding.x>100&&sliding.y<-110,'diagonal input should slide around an edge');

// Exercise actual update movement, knockback, separation and every spawn type.
const moving=arena(rock);place(moving.player,-150,0,true);
moving.player.speed=6000;moving.update(1,{x:1});safe(rock,moving.player,true);
assert(moving.player.x<=-50.9,'player cannot cross a boulder at boosted speed');
const knock=arena(rock);place(knock.player,-180,0,true);knock._spawnEnemy('slime');
const victim=knock.enemies[0];place(victim,-70,0);victim.hp=victim.maxHp=1000;
knock.player.y=victim.y;
knock._hurtEnemy(victim,1,200);safe(rock,victim);assert(victim.x<0,'knockback stops at terrain');
const separating=arena(rock);place(separating.player,-300,0,true);
for(let i=0;i<12;i++){separating._spawnEnemy('slime');const e=separating.enemies.at(-1);place(e,-53-i*.2,(i-6)*1.5);e.speed=0;}
for(let i=0;i<80;i++){separating.update(1/60);for(const e of separating.enemies)safe(rock,e);}
const originalRandom=Math.random;
try {
  Math.random=()=>0;
  const spawning=arena(fixed({...circle,x:100}));place(spawning.player,0,0,true);
  for(const type of types){spawning._spawnEnemy(type,100);safe(spawning.terrain,spawning.enemies.at(-1));}
} finally {Math.random=originalRandom;}

// All enemies can get around the near side instead of pushing into it forever.
let detourCases=0,maxDetourTime=0;
for(const type of types)for(const obstacleType of ['tree','rock','log'])for(const direction of [0,Math.PI/2,Math.PI*.83]) {
  const terrain=fixed({...circle,type:obstacleType,r:obstacleType==='tree'?24:obstacleType==='log'?17:40,halfLength:64,angle:.35});
  const g=arena(terrain),dx=Math.cos(direction),dy=Math.sin(direction);
  place(g.player,dx*220,dy*220,true);g._spawnEnemy(type);
  const e=g.enemies[0];place(e,-dx*220,-dy*220);e.hp=e.maxHp=10000;e.speed=85;
  let reached=false;
  for(let frame=0;frame<60*18;frame++) {
    g.update(1/60);safe(terrain,e);safe(terrain,g.player,true);
    if(Math.hypot(e.x-g.player.x,e.y-g.player.y)<e.r+g.player.r+5){reached=true;maxDetourTime=Math.max(maxDetourTime,g.time);break;}
  }
  assert(reached,`${type} failed to navigate around ${obstacleType} from ${direction}`);detourCases++;
}

// Obstacles affect movement, while the screen-wide skill still hits through them.
const thunder=arena(rock);place(thunder.player,-130,0,true);thunder._spawnEnemy('brute');
const target=thunder.enemies[0];place(target,130,0);target.speed=0;target.hp=target.maxHp=200;
thunder.update(0,{skill:true});assert.equal(target.hp,40);assert.equal(thunder.storm.targets.length,1);
console.log(JSON.stringify({terrain:'passed',deterministicProps:first.length,detourCases,maxDetourSeconds:+maxDetourTime.toFixed(2),cacheBound:world.cacheLimit}));
