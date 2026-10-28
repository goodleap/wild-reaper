import assert from 'node:assert/strict';
import { CharacterShowcase,createCharacterShowcaseTerrain,drawCharacterShowcaseGround } from './dist/character-showcase.js';
import { HERO_CHOICES } from './dist/heroes.js';
import { COMPANION_DEFINITIONS } from './dist/companion-catalog.js';
import { ENEMY_DEFS } from './dist/enemy-definitions.js';
import { BOSS_DEFS } from './dist/boss-definitions.js';
import { CHARACTER_SPRITES } from './dist/character-sprite-manifest.js';
import { groundOffset } from './dist/terrain.js';
import { ACTOR_VISUALS,actorShape } from './dist/actor-visuals.js';
import { COMPANION_VISUALS } from './dist/companion-art.js';
import { CharacterSprites } from './dist/character-sprites.js';

const game={terrain:createCharacterShowcaseTerrain(),player:{x:0,y:0,r:15}};
const showcase=new CharacterShowcase(game),actors=showcase.actors;
assert.deepEqual(showcase.sections.map(s=>s.id),['heroes','npcs','companions','monsters','bosses']);
assert.equal(actors.length,new Set(actors.map(a=>a.key)).size,'one display per actual art identity');
assert(actors.every(a=>a.entity.showcaseActor&&a.entity.name));
assert.equal(game.enemies,undefined,'the catalogue does not register hostile combat targets');
for(const choice of HERO_CHOICES)assert(actors.some(a=>a.entity.appearanceId===choice.appearanceId));
for(const companion of COMPANION_DEFINITIONS)assert(actors.some(a=>a.entity.isCompanion&&a.entity.kind===companion.kind));
for(const type of Object.keys(ENEMY_DEFS).filter(id=>id!=='boss'))assert(actors.some(a=>a.entity.type===type));
for(const kind of Object.keys(BOSS_DEFS))assert(actors.some(a=>a.entity.bossKind===kind));
for(const sprite of Object.keys(CHARACTER_SPRITES))assert(actors.some(a=>a.key===`sprite:${sprite}`));
assert(!actors.some(a=>a.key==='hero:traveler'||a.key==='hero:princess'||a.key==='hero:elder'),'legacy playable appearances stay out');
const sprites=new CharacterSprites();
const widthOf=actor=>{
  const e=actor.entity;
  if(e.characterSpriteId){const geometry=sprites.geometry({entity:e,x:0,footY:0,scale:1.1});return Math.max(-geometry.left,geometry.right);}
  if(e.sideQuestAnimal)return 44;
  const shape=e.isCompanion&&COMPANION_VISUALS[e.kind]||actor.isPlayer&&ACTOR_VISUALS.player||actorShape(e);
  const scale=actor.isPlayer&&!COMPANION_VISUALS[e.kind]?1.1:e.r/shape.radius;
  return shape.halfWidth*scale;
};
for(const actor of actors){
  const route=actor.route,half=Math.max(widthOf(actor),actor.entity.name.length*9/2+3);
  assert(Math.abs(route.home.x)+route.reach*Math.abs(route.dx)+half<=255,
    `${actor.key}: complete silhouette and name fit a centered 540-unit phone row throughout its route`);
  for(const other of actors){
    if(actor===other||actor.category!==other.category||route.home.y!==other.route.home.y)continue;
    const separation=Math.abs(route.home.x-other.route.home.x)-route.reach-Math.abs(other.route.reach);
    assert(separation>widthOf(actor)+widthOf(other)+8,`${actor.key}/${other.key}: neighboring moving bodies keep a clear gap`);
  }
}
const initial=actors.map(a=>({x:a.entity.x,y:a.entity.y,facing:a.entity.facing}));
const traces=actors.map(()=>({left:false,right:false,moving:false,stopped:false}));
for(let frame=0;frame<600;frame++){
  showcase.update(1/60);
  for(const [i,actor]of actors.entries()){
    const e=actor.entity,r=actor.route,t=traces[i];
    assert(Math.abs(r.position)<=r.reach);assert(Number.isFinite(e.walkPhase));
    assert(Math.abs(e.groundY-(e.y+groundOffset(e,actor.isPlayer)))<1e-8);
    assert(game.terrain.isFree(e.x,e.groundY,e.r),'every walker stays on open ground');
    t.left||=r.position<-20;t.right||=r.position>20;t.moving||=e.moving;t.stopped||=!e.moving;
    if(e.moving)assert(e.walkSpeed>0);
  }
}
assert(traces.every(t=>t.left&&t.right&&t.moving&&t.stopped),'all appearances turn, travel both ways, and stop stepping at lane ends');
assert(actors.some((a,i)=>a.entity.facing!==initial[i].facing));
for(const section of showcase.sections){
  assert(showcase.focusSection(section.id));
  assert.equal(game.player.x,section.spawn.x);assert.equal(game.player.y+19.8,section.spawn.y);
  assert.equal(game.player.moving,false);assert.equal(game.player.walkSpeed,0);
  assert(game.terrain.isFree(section.spawn.x,section.spawn.y,game.player.r));
}
const before={x:game.player.x,y:game.player.y};assert(!showcase.focusSection('unknown'));assert.deepEqual({x:game.player.x,y:game.player.y},before);
const b=showcase.bounds;
assert(!game.terrain.isFree(b.minX,0,15));assert(!game.terrain.isFree(b.maxX,0,15));
assert(!game.terrain.isFree(0,b.minY,15));assert(!game.terrain.isFree(0,b.maxY,15));
const end=JSON.stringify(actors);showcase.update(0);showcase.update(NaN);showcase.update(-1);assert.equal(JSON.stringify(actors),end);
const calls=[],ctx={save(){},restore(){},fillRect(){},translate(...v){calls.push(['translate',...v]);},strokeRect(){},fillText(text){calls.push(['label',text]);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
drawCharacterShowcaseGround(ctx,showcase,{camX:0,camY:showcase.spawn.y,width:540,height:1036});
assert.deepEqual(calls[0],['translate',270,518-showcase.spawn.y]);
assert(calls.some(c=>c[0]==='label'&&c[1]==='主角 · 3'));
assert(!calls.some(c=>c[0]==='label'&&c[1].startsWith('Boss')),'offscreen section decoration is culled');
assert.equal(JSON.stringify(actors),end,'drawing does not advance the simulation');
console.log(`Character showcase passed: ${actors.length} unique live appearances, current catalog coverage, shared locomotion, both turn directions, safe jumps, bounds and culled ground labels.`);
