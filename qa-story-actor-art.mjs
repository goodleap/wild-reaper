import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { ROYAL_ART } from './dist/enemy-art/royal.js';

const h=harness('',{moduleOverrides:{storyRoyalArt:ROYAL_ART.royalguard}});
h.run(`
  game={player:{x:-200},_clock:0};
  const officer={id:'story-officer',enemyArtId:'royalguard',heroId:'traveler',r:15,x:100,y:80,groundOffset:19.8,hp:1,maxHp:1,facing:0,moving:true,walkPhase:1};
  const originalDraw=monsterArt.draw,originalCanvas=Object.fromEntries(['save','restore','translate','scale'].map(key=>[key,ctx[key]]));
  let matrix={x:0,y:0,sx:1,sy:1};const matrixStack=[],samples=[],facings=new WeakMap();
  ctx.save=()=>matrixStack.push({...matrix});ctx.restore=()=>{matrix=matrixStack.pop();};
  ctx.translate=(x,y)=>{matrix.x+=x*matrix.sx;matrix.y+=y*matrix.sy;};ctx.scale=(x,y)=>{matrix.sx*=x;matrix.sy*=y;};
  monsterArt.draw=(context,visual,options)=>samples.push({visual,scale:matrix.sx,footY:matrix.y+actorShape(visual).foot*matrix.sy,flip:storyRoyalArt.facing(visual,{playerX:options.playerX,facings})});
  const actor=actorVisual(officer,true);drawActorBody(actor);
  officer.facing=Math.PI;game.player.x=300;drawActorBody(actor);
  officer.facing=Math.PI/2;drawActorBody(actor);
  const smaller=actorVisual(officer,true,.9);drawActorBody(smaller);
  monsterArt.draw=originalDraw;Object.assign(ctx,originalCanvas);
`);
assert.equal(h.run('samples[0].flip'),1,'escaping right faces right even when the player is left');
assert.equal(h.run('samples[1].flip'),-1,'escaping left faces left even when the player is right');
assert.equal(h.run('samples[2].flip'),-1,'vertical motion retains the previous facing without recreating the actor cache key');
assert(h.run('samples.every(sample=>sample.visual===samples[0].visual)'),'the art adapter retains actor identity across frames');
assert.equal(h.run('samples[0].scale'),h.run('actor.scale'),'drawing uses the same scale as sorting and shadow projection');
assert(Math.abs(h.run('samples[0].footY-actor.footY'))<1e-9,'painted feet align with the actual actor ground anchor');
assert(Math.abs(h.run('samples[3].footY-smaller.footY'))<1e-9,'an explicit actor scale still preserves its foot anchor');
assert.equal(h.run('Object.hasOwn(officer,"visualFacing")'),false,'rendering does not mutate the scripted movement state');
console.log('Story actor art: movement-owned facing, stable art identity and shared actor scale/feet passed.');
