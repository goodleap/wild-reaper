import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneEntityVisible } from './dist/scene-rendering.js';

// Exercise the application's real projectile admission, without a DOM mock.
const source=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function drawSwordEnergyWaves('),source.indexOf('function drawCoins('));
const waves=[
  {id:'visible',x:50,y:-20,groundY:0,r:20,delay:0,life:.3},
  {id:'waiting',x:50,y:-20,groundY:0,r:20,delay:.03,life:.3},
  {id:'expired',x:50,y:-20,groundY:0,r:20,delay:0,life:0},
  {id:'hidden-room',x:50,y:-20,groundY:150,r:20,delay:0,life:.3},
  {id:'offscreen',x:700,y:-20,groundY:0,r:20,delay:0,life:.3},
];
const game={attacks:{sword:{energyWaves:waves}}},drawn=[],before=structuredClone(waves);
const ctx={},combatOptions={reduced:false,dense:false};
const bindings={game,ctx,combatOptions,
  sceneVisible:wave=>sceneEntityVisible(wave,{isVisible:(x,y)=>y<100}),
  effectInView:wave=>Math.abs(wave.x)<300,
  drawSwordEnergy:(context,wave,options)=>{assert.equal(context,ctx);assert.equal(options,combatOptions);drawn.push(wave.id);},
};
const draw=new Function(...Object.keys(bindings),`${body};return drawSwordEnergyWaves;`)(...Object.values(bindings));
draw();assert.deepEqual(drawn,['visible']);assert.deepEqual(waves,before,'rendering cannot move or activate sword energy');
game.attacks.sword.energyWaves=[];draw();assert.equal(drawn.length,1,'scene-cleared waves disappear immediately');
delete game.attacks;draw();assert.equal(drawn.length,1,'no weapon owner is a harmless empty render pass');
console.log('Sword energy render: scene/viewport admission, delayed launch, expiry and immutable drawing passed.');
