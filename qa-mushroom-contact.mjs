import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {Environment,ENVIRONMENT_BALANCE} from './dist/environment.js';
function arena(obstacles=[]){
  const g=new Game({terrain:new Terrain({obstacles}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.environment=new Environment(g,{generation:false});g._spawn=Infinity;g.nextBossAt=Infinity;g._updatePressure=()=>{};
  g.player.x=-200;g.player.y=-groundOffset(g.player,true);g.player.xpNext=g.crystalsNext=Infinity;
  g.environment.props=[{id:'contact-test',type:'mushroom',x:0,y:0,r:17,aimY:-13,state:'idle',fuse:0,maxFuse:ENVIRONMENT_BALANCE.mushroomFuse,blastRadius:82}];
  return g;
}
const at=(e,x,y=0)=>{e.x=x;e.y=y-groundOffset(e,!!(e.heroId||e.isCompanion));};
for(const kind of ['player','warden','slime']){
  const g=arena(),m=g.environment.props[0],e=kind==='player'?g.player:kind==='warden'?g.companions.recruit(kind,{x:0,y:0}):g._spawnEnemy(kind);
  at(e,0);const before=g.player.hp;g.environment.update(.05);
  assert.equal(m.state,'armed',`${kind} contact starts the fuse`);assert.equal(m.source,'contact');
  assert.equal(m.fuse,ENVIRONMENT_BALANCE.mushroomFuse,'a new contact has the full warning delay');assert.equal(g.player.hp,before);
  g.environment.update(.05);const fuse=m.fuse;g.environment.hitAt(0,-13,10,'arrow');assert.equal(m.fuse,fuse,'weapon hits and contact share one timer');
  for(let i=0;i<30;i++)g.environment.update(.05);
  assert.equal(g.events.filter(e=>e.type==='mushroomArmed').length,1);assert.equal(g.events.filter(e=>e.type==='mushroomBlast').length,1);
  assert.equal(g.environment.props.length,0);assert(g.environment._consumed.has(m.id));
}
for(const kind of ['owl','bat']){
  const g=arena(),m=g.environment.props[0],e=kind==='owl'?g.companions.recruit(kind,{x:0,y:0}):g._spawnEnemy(kind);at(e,0);g.environment.update(.05);assert.equal(m.state,'idle','flying over a ground mushroom does not step on it');
}
{
  const g=arena(),m=g.environment.props[0];at(g.player,-45);g.environment.update(.05);at(g.player,45);g.environment.update(.05);
  assert.equal(m.state,'armed','movement crossing the whole contact zone is swept');
}
{
  const g=arena(),m=g.environment.props[0];at(g.player,-400);g.environment.update(.05);at(g.player,400);g.environment.update(.05);assert.equal(m.state,'idle','teleporting past a mushroom does not leave a trigger trail');
  at(g.player,0);g.status='paused';g.environment.update(.05);assert.equal(m.state,'idle');g.status='playing';g.environment.update(.05);assert.equal(m.state,'armed');
}
{
  const wall={id:'contact-wall',type:'log',variant:'castle-wall',x:0,y:0,r:3,halfLength:80,angle:Math.PI/2},g=arena([wall]),m=g.environment.props[0];
  m.x=12;at(g.player,-12);g.environment.update(.05);assert.equal(m.state,'idle','nearby feet behind a wall cannot trigger contact');
}
console.log('Mushroom contact: grounded hero/companions/enemies, swept motion, flight, walls, pause, teleport, one full fuse and permanent consumption passed.');
