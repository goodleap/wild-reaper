import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CharacterSprites,characterSprites,CHARACTER_SPRITES} from './dist/character-sprites.js';

assert.equal(characterSprites.ready,false,'importing the optional renderer does not load any image');
assert.equal(Object.keys(CHARACTER_SPRITES).length,8);
const atlas={path:'./assets/units/test.png',width:160,height:100};
const definitions={test:{frame:{x:40,y:10,w:80,h:80},anchor:{x:25,y:74},worldHeight:54,referenceScale:1.1}};
const sprites=new CharacterSprites({atlas,definitions}),image={width:160,height:100,decode:async()=>{}};let loads=0;
const first=sprites.preload({load:async()=>{loads++;return image;}}),second=sprites.preload({load:async()=>{throw Error('duplicate decode');}});
assert.equal(first,second);await first;await sprites.preload({load:()=>{throw Error('warm decode');}});
assert.equal(loads,1);assert.equal(sprites.diagnostics.decodes,1);assert.equal(sprites.diagnostics.decodedBytes,64000);
const entity={characterSpriteId:'test',facing:0},actor={entity,x:100,footY:200,scale:1.1};
const before=JSON.stringify(actor),right=sprites.geometry(actor);assert.equal(right.bottom-right.top,54);
assert.equal(right.left,100-25*54/80);assert.equal(right.top,200-74*54/80);
entity.facing=Math.PI;const left=sprites.geometry(actor);assert.equal(left.flip,-1);
assert.equal(left.right,100+25*54/80,'asymmetric source feet remain planted when mirrored');
assert.equal(left.top,right.top);entity.facing=0;
const calls=[],stack=[];const context={globalAlpha:.8,imageSmoothingEnabled:false,
 save(){stack.push([this.globalAlpha,this.imageSmoothingEnabled]);},restore(){[this.globalAlpha,this.imageSmoothingEnabled]=stack.pop();},translate(...args){calls.push(['translate',...args]);},scale(...args){calls.push(['scale',...args]);},drawImage(...args){calls.push(['image',...args]);}};
assert(sprites.draw(context,actor));assert.equal(JSON.stringify(actor),before,'rendering never moves the gameplay body or changes collision');
assert.deepEqual(calls[0],['translate',100,200]);assert.deepEqual(calls[1],['scale',1,1]);
assert.deepEqual(calls[2].slice(2,6),[40,10,80,80]);assert.equal(context.globalAlpha,.8);assert.equal(context.imageSmoothingEnabled,false);
for(const id of ['missing','constructor','__proto__'])assert.equal(sprites.draw(context,{...actor,entity:{characterSpriteId:id}}),false);

const invalid=new CharacterSprites({atlas,definitions});
await assert.rejects(invalid.preload({load:async()=>({width:159,height:100})}),/dimensions/);
assert.equal(invalid.ready,false);await invalid.preload({load:async()=>image});assert(invalid.ready,'a failed optional load can be retried');
const late=new CharacterSprites({atlas,definitions});let resolveLate;
await assert.rejects(late.preload({load:()=>new Promise(resolve=>{resolveLate=resolve;}),decodeTimeoutMs:5}),/timed out/);
resolveLate(image);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(late.ready,false,'timed-out work cannot replace the current atlas');
assert.throws(()=>new CharacterSprites({atlas,definitions:{bad:{...definitions.test,frame:{x:100,y:0,w:80,h:80}}}}),/Invalid character sprite frame/);

// Exercise the production opt-in branch while confirming the actual hero still
// takes the existing directional/weapon animation path even if marked by a test.
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function drawActorBody('),source.indexOf('function drawActor(actor)'));
const hero={characterSpriteId:'test'},npc={characterSpriteId:'test',isTownNpc:true},events=[];
const draw=new Function('game','drawCharacterSpriteActor','player','clock','ctx',`${body};return drawActorBody;`)(
 {player:hero},a=>{events.push(['sprite',a.entity]);return true;},(...args)=>events.push(['hero',args.at(-1)]),0,{});
draw({entity:npc,x:0,y:0,scale:1.1,isPlayer:true});draw({entity:hero,x:0,y:0,scale:1.1,isPlayer:true});
assert.deepEqual(events,[['sprite',npc],['hero',hero]]);
console.log('Character sprites passed: opt-in loading, one decode, foot anchors, mirroring, failure retry, state isolation and unchanged hero rendering.');
