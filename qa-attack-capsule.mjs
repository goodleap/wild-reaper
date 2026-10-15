import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {beamCapsule,capsuleHitsCircle} from './dist/attack-capsule.js';
for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const u={x:Math.cos(angle),y:Math.sin(angle)},to=(along,side)=>({x:u.x*along-u.y*side,y:u.y*along+u.x*side});
  const capsule=beamCapsule(0,0,angle,200,30);
  for(const [along,side,hit] of [[100,29,true],[100,31,false],[1,0,true],[199,0,true],[201,0,false],[1,29,false],[199,29,false]]){
    const p=to(along,side);assert.equal(capsuleHitsCircle(capsule,p.x,p.y),hit,'rounded footprint has safe corners and full center reach');
    const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
    g.enemies=[];g.player.r=.1;g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);g.player.invuln=0;
    const caster=g._spawnEnemy('slime');Object.assign(caster,{x:0,y:-groundOffset(g.player,true),guardActive:true,hp:10000});
    const before=g.player.hp;assert(g.abilities.cast('beam',caster,{angle,range:200,radius:30,damage:10,windup:.2}));
    const windup=g.abilities.effects[0].windup;g.abilities.update(windup/2);assert.equal(g.player.hp,before,'the rounded attack keeps its windup');g.abilities.update(windup/2+.01);
    assert.equal(g.player.hp<before,hit,'real beam execution uses the same capsule');
  }
}
console.log('Attack capsules: four directions, rounded safe corners, center reach and real delayed beam damage passed.');
