import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';

function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  g.enemies=[];g.effects=[];g.events=[];g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  return g;
}
function enemy(g,x,y=0,extra={}){
  const e=g._spawnEnemy(extra.type||'slime');
  Object.assign(e,{x,y,hp:10000,maxHp:10000,speed:0},extra);return e;
}
const foot=e=>({x:e.x,y:e.y+groundOffset(e)});
const samePoint=(field,e)=>assert.deepEqual({x:field.x,y:field.y},foot(e));
function volley(g){
  for(let i=0;i<20;i++)g.superSkills._updateVolleys(.05);
  return g.superSkills.swordFlights.map(f=>f.target);
}

// Identity wins over enormous HP; a distant Boss survives the bounded sample
// even with more than eighteen ordinary enemies in front of it.
for(const skillId of ['swords','meteor']){
  const g=arena(),s=g.superSkills;
  enemy(g,35,0,{trainingDummy:true,hp:1e12,maxHp:1e12});
  for(let i=0;i<35;i++)enemy(g,70+i%7*5,(i%5-2)*5);
  enemy(g,120,0,{affix:{id:'swift'}});enemy(g,-180,0,{elite:true});
  const boss=enemy(g,230,0,{type:'boss',hp:1000});
  assert(s._cast(skillId,1));
  if(skillId==='swords')assert(volley(g).every(target=>target===boss));
  else samePoint(s.fields[0],boss);
  if(skillId==='meteor'){
    assert(s.fields.length===2);assert.equal(s.fields[1].x,120,'other star spreads to the next eligible tier instead of stacking the Boss');
  }
}

// Both natural affixes and authored elites share the intermediate tier. A
// volley fairly distributes peers rather than reading current HP as rank.
{
  const g=arena(),s=g.superSkills;
  enemy(g,30,0,{trainingDummy:true,hp:1e12});
  const affix=enemy(g,250,0,{affix:{id:'swift'},hp:50}),elite=enemy(g,-250,0,{elite:true,hp:50000});
  assert(s._cast('swords',1));const targets=volley(g);
  assert.equal(targets.filter(e=>e===affix).length,2);
  assert.equal(targets.filter(e=>e===elite).length,2);
}

for(const skillId of ['swords','meteor'])for(const reason of ['range','offscreen','grace','wall']){
  const g=arena(),s=g.superSkills,ordinary=enemy(g,60);
  const boss=enemy(g,reason==='range'?300:220,0,{type:'boss'});
  if(reason==='offscreen')g.viewWidth=260;
  if(reason==='grace')boss.rescueSpawnGrace=2;
  if(reason==='wall'){
    g.terrain=new Terrain({obstacles:[{id:'target-wall',type:'log',structureType:'castle-wall',x:160,y:20,r:10,halfLength:220,angle:Math.PI/2}]});
    // Interior falling attacks obey walls as well as projectile/ground casts.
    g.dungeon.active={id:'qa-target-room'};
  }
  assert(s._cast(skillId,1));
  if(skillId==='swords')assert(volley(g).every(target=>target===ordinary),`${skillId}: ${reason}`);
  else samePoint(s.fields[0],ordinary);
}

// Retired player fields cannot reappear through legacy execution helpers.
{
  const g=arena(),s=g.superSkills,ordinary=enemy(g,80),flyingBoss=enemy(g,220,0,{type:'boss',flying:true});
  assert.equal(s._cast('domain',1),false);assert.equal(s._cast('vortex',1),false);
  assert(s._cast('meteor',1));samePoint(s.fields[0],flyingBoss);
  const outside=enemy(g,255);
  assert(!s._targets(s._foot()).includes(outside),'default placement stops at 240');
  assert(s._targets(s._foot(),260,{strongest:true}).includes(outside),'royal swords have their own 260 acquisition range');
  assert.equal(s._targets(s._foot(),260,{skillId:'runeArrow'})[0],ordinary,'ordinary runic acquisition remains nearest-first');
}

// A capped area hit must actually include the high-tier enemies it selected,
// even if more than the limit of ordinary enemies are closer to its center.
for(const skillId of ['meteor']){
  const g=arena(),s=g.superSkills;
  for(let i=0;i<24;i++)enemy(g,30+i%5,(i%4-2)*4);
  const boss=enemy(g,125,0,{type:'boss'}),affix=enemy(g,110,0,{affix:{id:'swift'}}),elite=enemy(g,115,0,{elite:true});
  const field=s._field(skillId,{x:0,y:20},150,skillId==='meteor'?.01:1,{damage:20,tick:0,interval:.4,pull:0});
  const targets=s._areaTargets(field,skillId==='meteor'?12:16);
  assert(targets.includes(boss)&&targets.includes(affix)&&targets.includes(elite));
  s._updateFields(.025);
  assert.equal(boss.hp,9980);assert.equal(affix.hp,9980);assert.equal(elite.hp,9980);
}

{
  const g=arena(),s=g.superSkills,boss=enemy(g,230,0,{type:'boss'});
  assert(s._cast('meteor',1));const points=s.fields.map(({x,y})=>({x,y}));
  boss.x+=100;s._updateFields(.2);
  assert.deepEqual(s.fields.map(({x,y})=>({x,y})),points,'telegraphed meteor points remain fixed');
}
console.log('Super targeting: tier identity, bounded high-priority centers, fair sword peers, existing eligibility/ranges, fixed fields and capped-hit inclusion passed.');
