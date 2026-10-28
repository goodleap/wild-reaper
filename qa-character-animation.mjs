import assert from 'node:assert/strict';
import {CharacterSprites,characterSprites,CHARACTER_SPRITES,CHARACTER_SPRITE_ATLASES} from './dist/character-sprites.js';
import {ROYAL_ART,sampleRoyalCharacterPose} from './dist/enemy-art/royal.js';
import {MonsterArt} from './dist/monster-art.js';

const frame=(x,y,w=20,h=28)=>({frame:{x,y,w,h},anchor:{x:8,y:26}});
const clips=y=>({idle:[frame(0,y)],walk:[20,40,60,80].map(x=>frame(x,y)),windup:[frame(100,y,28,32)],active:[frame(132,y,32,32)],recovery:[frame(164,y)],hit:[frame(184,y)]});
const atlases={a:{path:'./assets/units/a.png',width:256,height:128},b:{path:'./assets/units/b.png',width:256,height:128}};
const definition={atlas:'a',worldHeight:54,referenceScale:1.1,pixelHeight:28,clips:{front:clips(0),back:clips(40)}};
const definitions={test:definition,other:{...definition,atlas:'b'}},sprites=new CharacterSprites({atlases,definitions});
assert.equal(sprites.ready,false);assert.equal(characterSprites.ready,false,'import never downloads art');
let loads=0;const load=async(url,atlas,id)=>{loads++;assert.equal(atlases[id],atlas);return {width:atlas.width,height:atlas.height};};
const first=sprites.atlasAssets[0].assets.preload({load}),again=sprites.atlasAssets[0].assets.preload({load});
assert.equal(first,again,'concurrent requests share the same atlas decode');await first;
assert(sprites.readyFor('test'));assert(!sprites.readyFor('other'));assert(!sprites.ready);
await sprites.preload({load});assert(sprites.ready);assert.equal(loads,2);assert.equal(sprites.diagnostics.decodes,2);
await sprites.preload({load:()=>{throw Error('unexpected warm decode');}});

const entity={characterSpriteId:'test',moving:true,walkSpeed:320,walkPhase:0,visualFacing:0};
const actor={entity,x:123,footY:456,scale:1.1},initial=JSON.stringify(actor),bounds=sprites.geometry(actor);
const calls=[],context={globalAlpha:1,save(){},restore(){},translate(...args){calls.push(['translate',...args]);},scale(...args){calls.push(['scale',...args]);},drawImage(...args){calls.push(['image',...args]);}};
assert(sprites.draw(context,actor));assert.equal(JSON.stringify(actor),initial,'presentation never changes gameplay data');
assert.deepEqual(calls[0],['translate',123,456]);
const walking=new Set();
for(let i=0;i<4;i++){
  entity.walkPhase=i*Math.PI/2;const pose=sprites.sample(entity);walking.add(pose.frame.x);
  const geometry=sprites.geometry(actor);assert.equal(geometry.scale,bounds.scale);assert.equal(geometry.top,bounds.top);assert.equal(geometry.left,bounds.left);
}
assert.equal(walking.size,4,'walking uses four different authored source frames');
entity.moving=false;assert.equal(sprites.sample(entity).clip,'idle','blocked/stopped actors immediately plant their feet');
entity.visualFacing=-Math.PI/2;assert.equal(sprites.sample(entity).direction,'back');
entity.visualFacing=.01;assert.equal(sprites.sample(entity).direction,'back','horizontal steering dead zone preserves the last back view');
entity.visualFacing=.4;assert.equal(sprites.sample(entity).direction,'front');
entity.visualFacing=Math.PI;const left=sprites.sample(entity);assert.equal(left.flip,-1);
entity.visualFacing=-Math.PI/2;entity.moving=true;entity.walkPhase=0;
const frozen=sprites.sample(entity,{frozen:true});assert.equal(frozen,left,'freeze keeps the exact rendered frame and direction');
assert.equal(sprites.sample(entity).direction,'back');
entity.moving=false;entity.visualFacing=0;entity.hit=.1;assert.equal(sprites.sample(entity).clip,'hit');delete entity.hit;
for(const clip of ['windup','active','recovery','hit']){
  const sampled=sprites.sample(entity,{pose:{mode:clip,progress:.5}}),geometry=sprites.geometry(actor,{sample:sampled});
  assert.equal(sampled.clip,clip);assert.equal(geometry.scale,bounds.scale,'weapon extent never changes body scale');
  assert.equal(geometry.top,bounds.top,'name/culling bounds do not jump between combat poses');
}
for(const id of ['missing','constructor','__proto__'])assert.equal(sprites.readyFor(id),false);
const failed=new CharacterSprites({atlases,definitions});
await assert.rejects(failed.atlasAssets[0].assets.preload({load:async()=>({width:1,height:1})}),/dimensions/);
assert(!failed.readyFor('test'));await failed.atlasAssets[0].assets.preload({load});assert(failed.readyFor('test'));
const late=new CharacterSprites({atlases,definitions});let finish;
await assert.rejects(late.atlasAssets[0].assets.preload({load:()=>new Promise(resolve=>{finish=resolve;}),decodeTimeoutMs:1}),/timed out/);
finish({width:256,height:128});await new Promise(resolve=>setTimeout(resolve,0));assert(!late.readyFor('test'),'late decoder cannot mark a failed load ready');
const broken={...definition,clips:{...definition.clips,front:{...definition.clips.front,idle:[frame(250,0)]}}};
assert.throws(()=>new CharacterSprites({atlases,definitions:{broken}}),/Invalid character sprite frame/);

// Production metadata has real front/back walking and combat source frames.
for(const [id,definition] of Object.entries(CHARACTER_SPRITES))for(const direction of ['front','back']){
  const frameKey=f=>JSON.stringify(f.frame);
  assert.equal(new Set(definition.clips[direction].walk.map(frameKey)).size,definition.clips[direction].walk.length,`${id}/${direction}: no repeated crops masquerading as walking`);
  assert.notEqual(frameKey(definition.clips.front.idle[0]),frameKey(definition.clips.back.idle[0]),`${id}: authored back view`);
}
await characterSprites.preload({load:async(url,atlas)=>({width:atlas.width,height:atlas.height})});
assert.equal(characterSprites.diagnostics.decodes,Object.keys(CHARACTER_SPRITE_ATLASES).length);
const mage={type:'royalmage',x:0,y:0,hp:100,moving:false,walkPhase:0,visualFacing:0,specialist:{phase:'windup',timer:.05,maxTime:.9,angle:0},_visualCast:{phase:'windup',progress:.99,angle:0,abilityId:'fireball'}};
assert.equal(sampleRoyalCharacterPose('royalmage',mage).sprite.clip,'windup');
mage._visualCast.phase='active';mage._visualCast.progress=0;
assert.equal(sampleRoyalCharacterPose('royalmage',mage).sprite.clip,'active','actual fireball release wins even before the human state enters recovery');
mage._visualCast.phase='recovery';assert.equal(sampleRoyalCharacterPose('royalmage',mage).sprite.clip,'recovery');
const marshal={type:'boss',bossKind:'escortmarshal',x:0,y:0,hp:100,moving:false,walkPhase:0,visualFacing:-Math.PI/2,specialAttack:{kind:'royalSweep',phase:'windup',life:.001,maxLife:.85,angle:-Math.PI/2}};
assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal).sprite.clip,'windup','no early melee release');
marshal.specialAttack=null;marshal.specialPose='royalSweep';marshal.specialRecovery=marshal.specialRecoveryMax=1.15;
assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal).sprite.clip,'active','melee contact frame starts exactly with existing recovery');
marshal.specialRecovery=.85;assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal).sprite.clip,'recovery');
marshal.specialRecovery=0;marshal.hit=.12;assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal).sprite.clip,'hit');
marshal.hit=0;marshal.moving=true;marshal.walkPhase=Math.PI;
const beforeFreeze=sampleRoyalCharacterPose('escortmarshal',marshal).sprite;
marshal.walkPhase=0;marshal.visualFacing=Math.PI/2;assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal,{frozen:true}).sprite,beforeFreeze);
assert.equal(sampleRoyalCharacterPose('escortmarshal',marshal).sprite.direction,'front');

// The shared cache stays finite across changing times/angles, while front/back
// and attacks never alias into the same body canvas. Horizontal flip is outside.
const noop=()=>{},paint={save:noop,restore:noop,translate:noop,scale:noop,drawImage:noop};
const art=new MonsterArt(()=>({width:0,height:0,getContext:()=>paint})),seen=new Set();
for(let i=0;i<400;i++){
  marshal.walkPhase=(i%4)*Math.PI/2;marshal.visualFacing=Math.floor(i/4)%2?-.6:.6;
  const pose=ROYAL_ART.escortmarshal.samplePose(marshal,{time:i/60});seen.add(pose.key);assert(art.draw(paint,marshal,{time:i/60}));
}
assert.equal(seen.size,8);assert.equal(art.diagnostics.builds,8,'only the eight visited direction/frame combinations are cached');
const warmBuilds=art.diagnostics.builds;marshal.visualFacing=-2.5;marshal.walkPhase=3;
for(let i=0;i<20;i++)art.draw(paint,marshal,{time:i,frozen:true});
assert.equal(art.diagnostics.builds,warmBuilds,'frozen movement/facing does not build new frames');
assert(art.diagnostics.bytes<=art.diagnostics.limitBytes);
console.log('Character animation passed: independent atlases, real gait crops, front/back/flip, stop/freeze, stable anchors, cast/melee contact timing, hit poses and bounded cache.');
