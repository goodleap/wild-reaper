import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from './dist/engine.js';
import { MoonTerrain } from './dist/moon-terrain.js';
import { groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { terrainNavigation } from './dist/terrain-navigation.js';
import { getExpeditionDefinition } from './dist/expedition-definitions.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateContentPack } from './dist/content-schema.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const source=JSON.parse(readFileSync(new URL('./dist/config/stages.json',import.meta.url)));
const {expeditions,...trials}=source;
assert.equal(hash(trials),'fe95a603017db97ea7e75fd15681c9f0ee6489d83e0f4c0f98f73f06861c8676','the eight trials retain their source');
assert.equal(hash(expeditions.filter(d=>d.id!=='moon')),'c34b03b73a0326c4bddf6896252be4dff1c5cfeae7b22c1b81fe28f64bc86ebd','ship and survival remain unchanged');
assert.equal(hash(JSON.parse(readFileSync(new URL('./dist/config/worlds.json',import.meta.url)))),'4886ad69f6c7e43fcdeff80666c5a313b9bb3d3a2665ed1f7980706f7604e92d','all twelve worlds remain unchanged');

const d=getExpeditionDefinition('moon'),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
assert.deepEqual(d.reward,{gold:80,crystals:95});
assert.deepEqual(d.supplies.map(s=>s.drop).sort(),['herb','herb','magnet']);
assert.equal(hash(d.segments.map(({enemies,healthMultiplier,triggerRadius})=>({enemies,healthMultiplier,triggerRadius}))),'a49c698220002fd80d36dab6b32cafc7eb211698c9f2548a523238d1ac0580db','the existing encounter population and strength are preserved');
assert.equal(d.axis,'y');assert.equal(d.scenes,undefined,'the lunar route is one continuous landscape');
assert(d.landform.outline.length>4&&d.landform.solids.length>0,'authored landforms replace the old rectangle');
for(const kind of ['ridge','crater','wreck','equipment'])assert(d.landform.solids.some(s=>s.kind===kind),`${kind} has an actual footprint`);

let seed=82537;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const g=new Game({mode:'dungeon',dungeonId:'moon'});g.player.invuln=Infinity;g.player.xpNext=g.crystalsNext=Infinity;return g;};
const foot=(g,e=g.player)=>({x:e.x,y:e.y+groundOffset(e,e===g.player||!!e.isCompanion)});
let moves=0,walked=0,targets=0,slides=0,gateSamples=0;
function walk(g,target){
  assert(g.terrain.isFree(target.x,target.y,g.player.r),`free destination ${JSON.stringify(target)}`);
  for(let leg=0;distance(foot(g),target)>.04&&leg<80;leg++){
    const origin=foot(g),path=terrainNavigation(g.terrain).find(origin,target,g.player.r,'ground');
    assert(path?.length,`a physical route exists from ${JSON.stringify(origin)} to ${JSON.stringify(target)}`);
    for(const point of path){
      assert(!g.terrain.firstBlocker(foot(g).x,foot(g).y,point.x,point.y,g.player.r),'waypoints cannot cross a landform');
      for(let step=0;distance(foot(g),point)>.025&&step<3000;step++){
        const before=foot(g),remaining=distance(before,point),length=Math.min(g.player.speed/30,remaining);
        g._moveEntity(g.player,(point.x-before.x)*length/remaining,(point.y-before.y)*length/remaining,true);
        const after=foot(g),advance=distance(before,after);moves++;walked+=advance;
        assert(advance>.0001,'walking does not stick');assert(advance<=length+.01,'walking does not teleport across landforms');
        assert(g.terrain.isFree(after.x,after.y,g.player.r),'the whole hero stays on reachable ground');
      }
      assert(distance(foot(g),point)<.04,'each physical route leg finishes');
    }
    assert(distance(origin,foot(g))>.01,'route makes progress');
  }
  assert(distance(foot(g),target)<.04,'the exact authored objective is reached');targets++;
}

// The complete paths are checked with the static landforms alone; the actual
// encounter sequence below checks the same movement with its closed gates.
const roaming=make();roaming.terrain=new MoonTerrain(d);roaming._rebuildGrid();
for(const route of d.paths){
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];
    assert(!roaming.terrain.firstBlocker(a.x,a.y,b.x,b.y,24),'every marked path admits a companion-sized body');
  }
  for(const point of route.points)walk(roaming,point);
}
for(const point of [d.start,...d.supplies,...d.segments.map(s=>s.center),d.exit,d.start])walk(roaming,point);

// Push diagonally into the contour while moving along it. Valid tangents must
// slide smoothly, rather than catching on a succession of decorative circles.
for(const ring of [d.landform.outline,...d.landform.solids.map(s=>s.points)]){
  let checked=0;
  for(let i=0;i<ring.length&&checked<6;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=distance(a,b);if(length<48)continue;
    const tx=(b.x-a.x)/length,ty=(b.y-a.y)/length,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    for(const sign of [-1,1]){
      const nx=-ty*sign,ny=tx*sign,p={x:mx+nx*25,y:my+ny*25},q={x:p.x+tx*12,y:p.y+ty*12};
      if(!roaming.terrain.isFree(p.x,p.y,24)||!roaming.terrain.isFree(q.x,q.y,24))continue;
      const next=roaming.terrain.moveCircle(p.x,p.y,tx*12-nx*8,ty*12-ny*8,24);
      assert(roaming.terrain.isFree(next.x,next.y,24),'sliding retains full-body clearance');
      assert((next.x-p.x)*tx+(next.y-p.y)*ty>5,'a valid contour tangent does not stick');slides++;checked++;break;
    }
  }
}
assert(slides>=12,'sampled independent terrain and internal contour contacts');
const crater=d.landform.solids.find(s=>s.kind==='crater'&&s.heightBand==='low'&&!roaming.terrain.isFree(s.x,s.y,8));
assert(crater,'a deep crater is a real ground obstruction');
assert(roaming.terrain.isFree(crater.x,crater.y,8,'air'),'flying units can cross a low crater');
assert(roaming.terrain.isFree(crater.x,crater.y,8,'projectile'),'a low crater does not create an invisible projectile wall');
const ridge=d.landform.solids.find(s=>s.kind==='ridge'&&s.heightBand==='high'&&!roaming.terrain.isFree(s.x,s.y,8));
assert(ridge);assert(!roaming.terrain.isFree(ridge.x,ridge.y,8,'air'),'high rock formations preserve their height collision');

const game=make(),run=game.expedition;
assert.equal(game.mapId,'expedition:moon');assert.equal(game.waveDirector.count,0);
for(const group of run.groups)for(const enemy of group.members){const at=foot(game,enemy);assert(game.terrain.isFree(at.x,at.y,enemy.r,movementProfile(enemy)),'all enemies spawn with body clearance in their own height layer');}
for(let i=0;i<20;i++)game.update(.05);
assert(run.groups.every(group=>group.members.every(enemy=>enemy.guardActive===false)),'the landing position remains outside encounter activation');
const supplyIds=new Set();
for(const group of run.groups){
  const segment=group.definition,gate=segment.gate,mid=(segment.gateSpan.minX+segment.gateSpan.maxX)/2;
  for(let x=d.bounds.minX;x<=d.bounds.maxX;x+=8){assert(!game.terrain.isFree(x,gate,24),'a closed encounter cannot be bypassed along the edge');gateSamples++;}
  const later=run.groups[group.index+1]?.members[0];if(later){const hp=later.hp;assert.equal(game._hurtEnemy(later,hp+1),0);assert.equal(later.hp,hp,'future encounters cannot be sniped');}
  const lower=group.index?run.groups[group.index-1].definition.gate:d.bounds.maxY;
  for(const supply of [...game.adventure.props].filter(p=>p.y>gate&&p.y<lower)){
    walk(game,supply);assert(game.adventure.hitSupply(supply,supply.hp));assert.equal(game.adventure.hitSupply(supply,999),false,'supplies cannot be harvested twice');
    const pickup=game.adventure.pickups.at(-1);assert(pickup);walk(game,pickup);game.adventure.update(0);assert.equal(pickup.life,0,'the ordinary pickup is actually reachable and collected');supplyIds.add(supply.id);
  }
  walk(game,segment.center);run.update(.05);assert(group.active);assert(group.members.every(enemy=>enemy.guardActive));
  const before={x:mid,y:gate+64},after={x:mid,y:gate-64};walk(game,before);
  assert(game.terrain.firstBlocker(before.x,before.y,after.x,after.y,game.player.r),'the live gate blocks traversal');
  for(const enemy of group.members)if(enemy.hp>0)assert(game._hurtEnemy(enemy,enemy.hp+1)>0);
  run.update(.05);assert(group.cleared);assert.equal(run.currentSegment,group.index+1);assert.equal(game.status,'playing');
  assert(!game.terrain.firstBlocker(before.x,before.y,after.x,after.y,game.player.r),'the cleared gate releases the same physical passage');walk(game,after);
}
assert.equal(supplyIds.size,d.supplies.length,'all three authored supply branches were visited during normal progression');
assert(run.exitOpen);walk(game,d.exit);const rewardBefore={gold:game.gold,crystals:game.crystals};
assert(run.complete());assert.equal(game.status,'victory');assert.equal(game.gold-rewardBefore.gold,80);assert.equal(game.crystals-rewardBefore.crystals,95);
assert.equal(run.complete(),false);assert.equal(game.events.filter(e=>e.type==='victory').length,1,'the full route gives one completion and one reward');
const fresh=make();assert.equal(fresh.expedition.currentSegment,0);assert.equal(fresh.adventure.props.length,3);assert.equal(fresh.enemies.length,51);

for(const mutate of [
  m=>{delete m.landform;},m=>{m.landform.outline[0].x=Infinity;},m=>{m.landform.outline=[];},
  m=>{m.landform.solids[0].points=[];},m=>{m.landform.solids[0].kind='unhandled';},
  m=>{const duplicate=structuredClone(m.landform.solids[0]);duplicate.id+='-overlap';m.landform.solids.push(duplicate);},
  m=>{m.segments[0].gateSpan={minX:0,maxX:1};},m=>{m.segments[1].gate=m.segments[0].gate;},
  m=>{m.start.x=1e9;},m=>{Object.assign(m.supplies[0],{x:crater.x,y:crater.y});},
]){
  const pack=structuredClone(getConfigSnapshot());mutate(pack.sections.stages.expeditions.find(e=>e.id==='moon'));
  assert.throws(()=>validateContentPack(pack),/Invalid world configuration|Non-finite number/,'malformed terrain cannot reach runtime');
}
console.log(JSON.stringify({moonMap:'passed',targets,moves,walked:Math.round(walked),slides,gateSamples,encounters:3,otherWorldsUnchanged:12}));
