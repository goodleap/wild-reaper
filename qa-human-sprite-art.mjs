import assert from 'node:assert/strict';
import { characterSprites, CHARACTER_SPRITES, CHARACTER_SPRITE_ATLAS } from './dist/character-sprites.js';
import { ROYAL_ART, paintRoyalUnit } from './dist/enemy-art/royal.js';
import { ENEMY_VISUALS } from './dist/enemy-visuals.js';
import { MonsterArt } from './dist/monster-art.js';

function recordingContext(){
  let matrix=[1,0,0,1,0,0];const stack=[],calls=[],images=[];
  const multiply=([a,b,c,d,e,f])=>{const [A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];};
  const point=(x,y)=>({x:matrix[0]*x+matrix[2]*y+matrix[4],y:matrix[1]*x+matrix[3]*y+matrix[5]});
  const ctx={globalAlpha:1,imageSmoothingEnabled:true,
    save(){stack.push({matrix:[...matrix],alpha:this.globalAlpha});},restore(){assert(stack.length);const saved=stack.pop();matrix=saved.matrix;this.globalAlpha=saved.alpha;},
    translate(x,y){multiply([1,0,0,1,x,y]);},scale(x,y){multiply([x,0,0,y,0,0]);},transform(...m){multiply(m);},
    rotate(a){multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},
    drawImage(image,...args){
      assert(args.every(Number.isFinite));const [x,y,w,h]=args.length===8?args.slice(4):args;
      images.push({image,args,corners:[point(x,y),point(x+w,y),point(x,y+h),point(x+w,y+h)]});
    },
    createLinearGradient(){return {addColorStop(){}};}
  };
  for(const name of ['beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','ellipse','fill','stroke','clip','fillRect'])ctx[name]=(...args)=>{
    for(const value of args)if(typeof value==='number')assert(Number.isFinite(value),`${name} finite coordinates`);
    calls.push([name,...args]);
  };
  return {ctx,calls,images,get depth(){return stack.length;}};
}
const canvases=[],art=new MonsterArt(()=>{const record=recordingContext(),canvas={width:0,height:0,record,getContext:()=>record.ctx};canvases.push(canvas);return canvas;});
const entity=kind=>({id:1,type:kind==='escortmarshal'?'boss':kind,bossKind:kind==='escortmarshal'?kind:undefined,x:0,y:0,r:ENEMY_VISUALS[kind].radius,hp:100,maxHp:100,hit:0,visualFacing:0,walkPhase:0,guardActive:true});
const output=recordingContext();
for(const kind of ['royalmage','escortmarshal'])assert.equal(art.draw(output.ctx,entity(kind)),false);
assert.equal(art.diagnostics.builds,0,'unloaded artwork cannot cache an invisible enemy');
assert.equal(canvases.length,0,'unloaded artwork allocates no pose canvases');
assert(art.draw(output.ctx,entity('royalguard')),'unmapped human art remains available independently');

let loads=0;const atlas={width:CHARACTER_SPRITE_ATLAS.width,height:CHARACTER_SPRITE_ATLAS.height};
await characterSprites.preload({load:async()=>{loads++;return atlas;}});
await characterSprites.preload({load:()=>{throw Error('duplicate atlas decode');}});assert.equal(loads,1);
const mappings={royalmage:'emberpriest',escortmarshal:'ironmarshal'};
for(const [kind,id] of Object.entries(mappings)){
  const actor=entity(kind),before=JSON.stringify(actor),record=recordingContext();
  assert(art.draw(record.ctx,actor));assert.equal(JSON.stringify(actor),before,'drawing does not alter combat, collision or coordinates');
  const cached=record.images.at(-1).image,paint=cached.record.images.at(-1),frame=CHARACTER_SPRITES[id].frame;
  assert.equal(paint.image,atlas,'combat uses the approved atlas');
  assert.deepEqual(paint.args.slice(0,4),[frame.x,frame.y,frame.w,frame.h]);
  assert(Math.abs(paint.args[7]-ENEMY_VISUALS[kind].bodyHeight)<1e-9,'combat retains its authored body height');
  const stableBuilds=art.diagnostics.builds;
  for(let i=0;i<30;i++)assert(art.draw(record.ctx,actor,{time:i}));
  assert.equal(art.diagnostics.builds,stableBuilds,'stationary characters reuse a warmed body');
  actor.moving=true;actor.walkPhase=1.4;art.draw(record.ctx,actor);
  const warmImage=record.images.at(-1).image,warmFlip=record.images.at(-1).corners[0].x;
  actor.walkPhase=4.7;actor.visualFacing=Math.PI;art.draw(record.ctx,actor,{frozen:true});
  assert.equal(record.images.at(-1).image,warmImage,'freeze retains its sampled pose');
  assert.equal(record.images.at(-1).corners[0].x,warmFlip,'freeze retains its facing');
  art.draw(record.ctx,actor);assert.notEqual(record.images.at(-1).corners[0].x,warmFlip,'unfrozen facing follows the shared human rule');
  assert.equal(record.depth,0);
  // Inspect all finite shared pose samples against the real cached canvas.
  for(const mode of ['idle','move','windup','active','recovery','hit'])for(let i=0;i<9;i++){
    const sprite=art._sprite(kind,0,false,1,{mode,action:'royalSpell',progress:i/8,cycle:i*Math.PI/4,moving:mode==='move',key:`${mode}:${i}`});
    const visual=ENEMY_VISUALS[kind],ratio=sprite.canvas.width/sprite.w;
    for(const image of sprite.canvas.record.images)for(const point of image.corners){
      const x=point.x/ratio-sprite.ox,y=point.y/ratio-sprite.oy;
      assert(Math.abs(x)<=visual.halfWidth+.001&&y>=-visual.top-.001,`${kind} pose stays inside scene culling/name bounds`);
    }
  }
}
for(const canvas of canvases)for(const image of canvas.record.images)if(image.image===atlas){
  for(const p of image.corners)assert(p.x>=-.001&&p.y>=-.001&&p.x<=canvas.width+.001&&p.y<=canvas.height+.001,`atlas pose remains inside cache: ${JSON.stringify(p)} / ${canvas.width}×${canvas.height}`);
  assert.equal(canvas.record.depth,0);
}
assert(art.diagnostics.bytes<=art.diagnostics.limitBytes,'shared cache stays bounded');
for(const kind of ['royalguard','royallancer','royalarbalist','searchcaptain']){
  const record=recordingContext();paintRoyalUnit(record.ctx,kind,.5,-1,{mode:'windup',progress:.5});
  assert.equal(record.images.length,0,`${kind} keeps its existing weapon/body painter`);assert.equal(record.depth,0);
}
// Human Boss warnings still use their authored melee geometry; the mage's
// fireball warning remains owned by the shared ability system.
const warning=recordingContext(),marshal=entity('escortmarshal');
marshal.specialAttack={kind:'royalVolley',phase:'windup',x:15,y:25,angle:0,reach:235,width:13,life:.5,maxLife:1};
art.drawTelegraph(warning.ctx,marshal,{});assert(warning.calls.some(([name])=>name==='fill'));assert(warning.calls.some(([name])=>name==='arc'));
const mage=entity('royalmage'),mageWarning=recordingContext();mage.specialist={kind:'royalSpell',phase:'windup',life:.5,maxLife:1};
art.drawTelegraph(mageWarning.ctx,mage,{});assert.equal(mageWarning.calls.length,0,'no duplicate spell warning');
const locked=ROYAL_ART.escortmarshal.facing({...marshal,visualFacing:0,specialAttack:{...marshal.specialAttack,angle:Math.PI}},{playerX:100,facings:new WeakMap()});
assert.equal(locked,-1,'windup faces its locked attack, not a moving target');
assert.equal(warning.depth,0);
console.log('Human sprite art passed: approved atlas, unchanged combat size, empty-cache guard, warmed poses, freeze/facing, complete bounds, unaffected troops and existing warning geometry.');
