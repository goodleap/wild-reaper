import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {characterSprites,CHARACTER_SPRITES,CHARACTER_SPRITE_ATLASES} from './dist/character-sprites.js';

assert.equal(characterSprites.ready,false,'importing the shared renderer has no image-loading side effects');
assert.equal(Object.keys(CHARACTER_SPRITES).length,9,'eight approved identities and a distinct troupe leader');
for(const [id,atlas] of Object.entries(CHARACTER_SPRITE_ATLASES)){
  const png=readFileSync(new URL(atlas.path,new URL('./dist/',import.meta.url)));
  assert.equal(png.subarray(1,4).toString(),'PNG',`${id}: published asset is PNG`);
  assert.equal(png.readUInt32BE(16),atlas.width,`${id}: source width matches manifest`);
  assert.equal(png.readUInt32BE(20),atlas.height,`${id}: source height matches manifest`);
  assert([4,6].includes(png[25])||png.includes(Buffer.from('tRNS')),`${id}: PNG retains a transparency channel`);
}
for(const [id,definition] of Object.entries(CHARACTER_SPRITES)){
  const entity={characterSpriteId:id,facing:0,moving:false},actor={entity,x:100,footY:200,scale:definition.referenceScale};
  const first=characterSprites.geometry(actor);assert(first&&first.top<actor.footY&&first.bottom>=actor.footY);
  for(const direction of ['front','back'])for(const [clip,frames] of Object.entries(definition.clips[direction]))for(let index=0;index<frames.length;index++){
    const sample={id,direction,clip,index,flip:1,...frames[index]},geometry=characterSprites.geometry(actor,{sample});
    const {frame,anchor}=frames[index],scale=definition.worldHeight/definition.pixelHeight;
    assert(Math.abs(geometry.scale-scale)<1e-12,`${id}: every action uses one body scale`);
    assert(100-anchor.x*scale>=first.left-1e-8&&100+(frame.w-anchor.x)*scale<=first.right+1e-8,`${id}/${clip}: complete frame stays in culling bounds`);
    assert(200-anchor.y*scale>=first.top-1e-8&&200+(frame.h-anchor.y)*scale<=first.bottom+1e-8,`${id}/${clip}: feet and raised props remain in bounds`);
  }
  entity.facing=Math.PI;const mirrored=characterSprites.geometry(actor);assert.equal(mirrored.flip,-1);
  assert.equal(mirrored.top,first.top);assert(Math.abs((mirrored.right-100)-(100-first.left))<1e-8,`${id}: horizontal reflection keeps the authored foot pivot`);
}

// The actual hero keeps the existing directional weapon/hand animation path;
// an NPC with authored frames takes the atlas path instead.
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function drawActorArtwork('),source.indexOf('function actorSpriteGeometry('));
const hero={characterSpriteId:'hunter'},npc={characterSpriteId:'hunter',isTownNpc:true},events=[];
const draw=new Function('game','drawCharacterSpriteActor','player','clock','ctx',`${body};return drawActorArtwork;`)(
 {player:hero},a=>{events.push(['sprite',a.entity]);return true;},(...args)=>events.push(['hero',args.at(-1)]),0,{});
draw({entity:npc,x:0,y:0,scale:1.1,isPlayer:true});draw({entity:hero,x:0,y:0,scale:1.1,isPlayer:true});
assert.deepEqual(events,[['sprite',npc],['hero',hero]]);
console.log('Character sprite assets passed: published atlas dimensions/transparency, nine identities, grounded stable pose bounds and unchanged hero rendering.');
