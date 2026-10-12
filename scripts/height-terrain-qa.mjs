import assert from 'node:assert/strict';
import { Terrain } from '../dist/terrain.js';
import { Island } from '../dist/islands.js';
import { blocksObstacle, isGrounded, movementProfile, obstacleHeight } from '../dist/height-rules.js';

const atOrigin={x:0,y:0,r:18};
const low={...atOrigin,type:'log',halfLength:60,heightBand:'low'};
const high={...atOrigin,type:'tree',heightBand:'high'};
let crossingCases=0;
for(const spec of [low,high])for(const angle of [0,Math.PI/4,Math.PI/2])for(const profile of ['ground','air']){
  const terrain=new Terrain({obstacles:[{...spec,angle}]});
  const nx=-Math.sin(angle),ny=Math.cos(angle),pass=spec.heightBand==='low'&&profile==='air';
  const moved=terrain.moveCircle(-nx*200,-ny*200,nx*400,ny*400,11,profile);
  assert.equal(moved.blocked,!pass);
  assert(terrain.isFree(moved.x,moved.y,11,profile));
  if(pass)assert(Math.hypot(moved.x-nx*200,moved.y-ny*200)<.001,'flight crosses the entire low obstacle');
  else assert(moved.x*nx+moved.y*ny<0,'fast movement stops on the entry side');
  const resolved=terrain.resolveCircle(0,0,11,profile);
  if(pass)assert.deepEqual(resolved,{x:0,y:0,blocked:false},'flight above low solid is not pushed sideways');
  else assert(terrain.isFree(resolved.x,resolved.y,11,profile));
  crossingCases++;
}

const mixed=new Terrain({obstacles:[{...low,x:0,id:'low'},{...high,x:120,id:'high'}]});
assert.equal(mixed.firstBlocker(-150,0,250,0,3)?.id,'low');
assert.equal(mixed.firstBlocker(-150,0,250,0,3,'projectile')?.id,'high');
assert.equal(mixed.firstBlocker(-150,0,250,0,3,'air')?.id,'high');
assert.equal(mixed.firstBlocker(-150,0,250,0,0,'sight')?.id,'high');
assert.equal(mixed.firstBlocker(-150,0,80,0,0,'sight'),null,'low cover does not hide units or darken visible floor');
assert.equal(mixed.firstBlocker(-150,0,250,0,3,'overhead'),null);
assert.equal(mixed.query(-150,-150,250,150).length,2,'height filtering never removes physical props from broadphase/vision queries');
assert.equal(mixed.isFree(0,0,5),false,'placement keeps ground clearance by default');
assert.equal(mixed.isFree(0,0,5,'air'),true);
assert.equal(mixed.isFree(120,0,5,'air'),false);

const specimens=[
  [{type:'log',r:20},'low'],
  [{type:'log',variant:'sunken-log',r:20},'low'],
  [{type:'log',variant:'wall',r:20},'low'],
  [{type:'rock',rockForm:1,r:28},'low'],
  [{type:'rock',rockForm:1,r:60},'high'],
  [{type:'rock',rockForm:0,r:22},'low'],
  [{type:'rock',rockForm:2,r:22},'high'],
  [{type:'rock',rockForm:3,r:65},'low'],
  [{type:'rock',variant:'slab',rockForm:1,r:50},'low'],
  [{type:'rock',variant:'slab',rockForm:2,r:50},'high'],
  [{type:'rock',variant:'pillar',rockForm:3,r:15},'high'],
  [{type:'tree',r:15},'high']
];
for(const [spec,height] of specimens)assert.equal(obstacleHeight(spec),height,JSON.stringify(spec));
for(const variant of ['castle-wall','hut-wall','building-wall','rescue-wall','portal-wall']){
  const spec={type:'log',r:8,halfLength:55,variant};
  assert.equal(obstacleHeight(spec),'high',`${variant} capsules remain tall solids`);
  assert.equal(blocksObstacle(spec,'projectile'),true);
}
assert.equal(obstacleHeight({type:'rock',r:300,heightBand:'low'}),'low','explicit classification can describe future prop art');
assert.equal(obstacleHeight({type:'log',heightBand:'high'}),'high');
const structures=new Terrain({obstacles:[]});
structures.setStructures([{...low,heightBand:undefined,structureId:'building',structureType:'hut'}],'fixture');
assert.equal(structures.query(-100,-100,100,100)[0].heightBand,'high');
assert(structures.firstBlocker(-100,0,100,0,1,'projectile'));

for(const entity of [{type:'bat'},{type:'angel'},{kind:'angel'},{townKind:'angel'},{type:'slime',flying:true}]){
  assert.equal(isGrounded(entity),false);
  assert.equal(movementProfile(entity),'air');
}
for(const entity of [{type:'slime'},{type:'boss'},{}]){
  assert.equal(isGrounded(entity),true);
  assert.equal(movementProfile(entity),'ground');
}
assert.equal(movementProfile(null),'ground');

for(const region of ['forest','marsh','ruins']){
  const island=new Island({region}),terrain=new Terrain({island,obstacles:[]});
  const coast=terrain.moveCircle(0,0,island.bounds.maxX+500,0,11,'air');
  assert(coast.blocked,'flight cannot cross the world boundary');
  assert(island.contains(coast.x,coast.y,11));
  assert.equal(terrain.isFree(island.bounds.maxX+500,0,11,'air'),false);
  const restored=terrain.resolveCircle(island.bounds.maxX+500,0,11,'air');
  assert(island.contains(restored.x,restored.y,11));
}

console.log(JSON.stringify({heightTerrain:'passed',crossingCases,classificationCases:specimens.length+7,boundedFlightWorlds:3}));
