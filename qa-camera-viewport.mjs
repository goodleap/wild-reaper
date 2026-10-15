import assert from 'node:assert/strict';
import { cameraViewport } from './dist/camera-viewport.js';
import { Game, HEROES } from './dist/engine.js';
import { Terrain } from './dist/terrain.js';
import { resolveCharacterStats, weaponStats, skillStats } from './dist/combat-stats.js';

const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,`${message}: ${actual} != ${expected}`);
const portraitSizes=[[320,568],[360,640],[393,717],[430,932],[540,960],[599,1065]];
for(const [width,height] of portraitSizes){
  const view=cameraViewport({width,height,coarse:true});
  assert.equal(view.width,540,'supported portrait phones share the same horizontal world span');
  near(view.width*view.zoom,width,'world width maps onto CSS width');
  near(view.height*view.zoom,height,'world height maps onto CSS height');
  const player={x:123,y:-45};
  near((player.x-(player.x-view.width/2))*view.zoom,width/2,'player remains horizontally centered');
  near((player.y-(player.y-view.height/2))*view.zoom,height/2,'player remains vertically centered');
  for(const dpr of [1,1.5,2,3,4])assert.deepEqual(cameraViewport({width,height,coarse:true,dpr,devicePixelRatio:dpr}),view,'backing-pixel density never changes the world view');
  assert.deepEqual(cameraViewport({width,height,coarse:true,mode:'native',customWidth:600}),{width,height,zoom:1},'native override restores CSS/world 1:1 on a phone');
}

// Input capability and orientation are independent of screen size: a narrow
// desktop window retains its old camera, as do tablets and landscape screens.
for(const [width,height,coarse] of [[393,717,false],[1512,850,false],[1920,1080,false],[600,960,true],[768,1024,true],[717,393,true],[568,320,true]]){
  assert.deepEqual(cameraViewport({width,height,coarse}),{width,height,zoom:1});
}
assert.deepEqual(cameraViewport({width:393,height:717}),{width:393,height:717,zoom:1},'absent pointer capability preserves the desktop default');

for(const [width,height,coarse] of [[393,717,true],[1512,850,false]]){
  const input={width,height,coarse},fallback=cameraViewport(input);
  for(const customWidth of [240,480,540,600,1600]){
    const view=cameraViewport({...input,mode:'custom',customWidth});
    assert.equal(view.width,customWidth);
    near(view.width*view.zoom,width,'custom width uses the same CSS canvas');
    near(view.height*view.zoom,height,'custom width preserves aspect ratio');
  }
  for(const customWidth of [undefined,null,0,-1,239,1601,540.5,NaN,Infinity,'540',{},[]]){
    assert.deepEqual(cameraViewport({...input,mode:'custom',customWidth}),fallback,'invalid overrides safely return to this device default');
  }
  assert.deepEqual(cameraViewport({...input,mode:'unrecognized',customWidth:600}),fallback,'unknown modes do not enable an override');
  assert.deepEqual(cameraViewport({...input,mode:'default',customWidth:600}),fallback,'stored custom width does not override default mode');
}
for(const dimensions of [{},{width:0,height:0},{width:NaN,height:Infinity},{width:-1,height:-2},{width:'393',height:'717'}]){
  const view=cameraViewport(dimensions);
  for(const value of Object.values(view))assert(Number.isFinite(value)&&value>0,'unmeasured canvas dimensions remain safe');
}

const snapshot=game=>({
  hero:game.player.heroId,appearance:game.player.appearanceId,radius:game.player.r,
  character:resolveCharacterStats(game),build:game.build.serialize(),
  weapons:['sword','arrow','orbit'].map(id=>weaponStats(game,id)),
  skills:['lightning','pulse','fireball','frostbolt','barrier','storm'].map(id=>skillStats(game,id))
});
for(const hero of HEROES){
  const game=new Game({hero:hero.id,terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false,companions:false});
  game.player.x=123;game.player.y=-45;
  for(const id of ['sword','arrow','orbit','lightning','pulse','fireball','frostbolt','barrier'])game.levels[id]=3;
  const original=snapshot(game),native=cameraViewport({width:393,height:717,coarse:true,mode:'native'});
  const target={x:game.player.x+250,y:game.player.y,r:12};
  game.viewWidth=native.width;game.viewHeight=native.height;
  assert.equal(game._inView(target),false,'native phone crop excludes a unit at 250 world units');
  const expanded=cameraViewport({width:393,height:717,coarse:true});
  game.viewWidth=expanded.width;game.viewHeight=expanded.height;
  assert.equal(game._inView(target),true,'540-world camera makes that same unit visible');
  for(const view of [native,expanded,cameraViewport({width:430,height:932,coarse:true}),cameraViewport({width:1512,height:850})]){
    game.viewWidth=view.width;game.viewHeight=view.height;
    const x=game.player.x+view.width/2,y=game.player.y+view.height/2;
    assert(game._inView({x:x+12,y:game.player.y,r:12}),'right-edge contact includes the unit radius');
    assert(!game._inView({x:x+12.01,y:game.player.y,r:12}),'right-edge exclusion follows the current camera');
    assert(game._inView({x:game.player.x,y:y+12,r:12}),'bottom-edge contact follows the expanded world height');
    assert(!game._inView({x:game.player.x,y:y+12.01,r:12}),'bottom-edge exclusion follows the current camera');
    assert(game._inView({x:x+3,y:y+4,r:5}),'corner culling uses circular contact with the camera rectangle');
    assert(!game._inView({x:x+3.01,y:y+4,r:5}),'a circle outside the corner remains culled');
    assert(game._inView({x:x+20,y:game.player.y,r:0},20),'existing world-space culling margins still apply');
    assert(!game._inView({x:x+20.01,y:game.player.y,r:0},20));
    assert.deepEqual(snapshot(game),original,'camera dimensions do not rescale character, movement, health, weapon or skill values');
  }
}
console.log('Camera viewport: portrait sizes, CSS/DPR separation, native desktop, safe overrides, centered projection, real visibility edges and unchanged combat values passed.');
