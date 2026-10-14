import assert from 'node:assert/strict';
import { visitAttackDepthBands } from './dist/attack-depth.js';
import { WeaponTrail, drawWeaponTrail, visitWeaponTrailDepthItems } from './dist/weapon-trails.js';
import { drawSwordFlight, visitSwordFlightDepthItems } from './dist/sword-flight-art.js';
import { RoyalSwordArt } from './dist/royal-sword-art.js';
import { CombatArt } from './dist/combat-art.js';
import { PropArt } from './dist/prop-art.js';

function recorder(){
  const calls=[],state={calls,canvas:{width:640,height:480},getTransform:()=>({a:1.5,b:0,c:0,d:1.5,e:190.25,f:180.625})};
  return new Proxy(state,{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),
    set:(target,key,value)=>{target[key]=value;calls.push(['set',key,value]);return true;}});
}
function collect(visit){const items=[];const count=visit(item=>items.push(item));assert.equal(count,items.length);return items;}
function samePainter(items,draw){
  const original=recorder();draw(original);
  for(const item of items){
    const context=recorder();item.draw(context);
    const clipped=context.calls[3]?.[0]==='clip',calls=clipped?context.calls.slice(4,-1):context.calls;
    assert.deepEqual(calls,original.calls,'each depth band retains the complete original painter and parameters');
    if(clipped){
      const rect=context.calls[2];assert.equal(rect[0],'rect');
      assert(rect.slice(1).every(Number.isFinite),'clip bounds stay finite');
      assert.equal(context.calls.filter(c=>c[0]==='save').length,context.calls.filter(c=>c[0]==='restore').length);
    }
  }
}

// A shallow attack still has to cross the owner's exact ground-depth boundary;
// the ordinary subdivision budget must not swallow that near-body transition.
const effect={x:0,y:0},queried=[],draw=ctx=>ctx.fillRect(-5,-40,10,80);
const split=collect(visit=>visitAttackDepthBands(effect,{minX:-6,maxX:6,minY:-4,maxY:4,groundLift:20,draw,
  depthCutsFor:(minX,maxX)=>{queried.push([minX,maxX]);return [20,20,NaN,1000];}},visit));
assert.deepEqual(queried,[[-6,6]]);assert.equal(split.length,2);assert(split[0].sortY<20&&split[1].sortY>20);
assert(split.every(item=>item.effect===effect));samePainter(split,draw);
const rectangles=split.map(item=>{const ctx=recorder();item.draw(ctx);return ctx.calls.find(c=>c[0]==='rect');});
assert.equal(rectangles[0][2]+rectangles[0][4],rectangles[1][2],'neighboring clips meet without overlap or gap');
const boundary=rectangles[1][2]*1.5+180.625;assert(Math.abs(boundary-Math.round(boundary))<1e-8,'clip seam lands on a device pixel');
assert(rectangles[0][2]<-40&&rectangles[1][2]+rectangles[1][4]>40,'outer bands preserve geometry beyond conservative depth bounds');

const mapped=collect(visit=>visitAttackDepthBands(effect,{minY:0,maxY:10,sortYAt:y=>50-y*2,depthCuts:[40],draw},visit));
assert.equal(mapped.length,2);assert(mapped[0].sortY>40&&mapped[1].sortY<40,'ground cuts follow a reversed linear depth map');
samePainter(mapped,draw);
const budget=collect(visit=>visitAttackDepthBands(effect,{minY:-10000,maxY:10000,maxBands:5,draw},visit));
assert.equal(budget.length,5);
for(const scene of [{depthCuts:[]},{depthCutsFor:()=>[]}]){
  const unobstructed=collect(visit=>visitAttackDepthBands(effect,{minY:-10000,maxY:10000,draw,...scene},visit));
  assert.equal(unobstructed.length,1,'no occluders need no redundant uniform slices');assert.equal(unobstructed[0].draw,draw);
}
const oneOccluder=collect(visit=>visitAttackDepthBands(effect,{minY:-10000,maxY:10000,draw,depthCuts:[20]},visit));
assert.equal(oneOccluder.length,2,'one known occluder requires only its exact cut');
const depthTransform={a:1.5,b:0,c:0,d:1.5,e:190.25,f:180.625};
const crowdedCuts=Array.from({length:500},(_,i)=>-25+i*.1);
const crowded=collect(visit=>visitAttackDepthBands(effect,{minY:-25,maxY:25,draw,depthCuts:crowdedCuts,depthTransform},visit));
assert(crowded.length<=77,'crowded feet sharing a raster row cannot multiply painter calls');
let matrixReads=0;const crowdContext=recorder();crowdContext.getTransform=()=>{matrixReads++;return depthTransform;};
for(const item of crowded)item.draw(crowdContext);
assert.equal(matrixReads,1,'all bands in one world render pass share one viewport transform lookup');
const crowdRectangles=crowdContext.calls.filter(c=>c[0]==='rect');
for(let i=1;i<crowdRectangles.length;i++){
  const previous=crowdRectangles[i-1],current=crowdRectangles[i];
  assert(Math.abs(previous[2]+previous[4]-current[2])<1e-8,'coalescing preserves adjoining raster boundaries');
}
const flat=collect(visit=>visitAttackDepthBands(effect,{minY:7,maxY:7,groundLift:19.8,draw},visit));
assert.equal(flat.length,1);assert.equal(flat[0].draw,draw);assert.equal(flat[0].sortY,26.8);

// Recorded bends and changing orbit direction use their own world heights,
// while the renderer remains completely read-only and preserves the old path.
for(const kind of ['arrow','orbit'])for(const mode of [{},{reduced:true},{dense:true}]){
  const trail=new WeaponTrail(kind);trail.maxLength=300;
  for(const [i,[x,y]] of [[-14,27],[8,4],[18,-24],[3,-42]].entries())trail.add(x,y,i*.025);
  const weapon={x:3,y:-42,trail,color:'#70b79b',evolved:true},before=structuredClone(weapon),options={...mode,time:.075,groundLift:19.8,depthCuts:[0,19.8]};
  const items=collect(visit=>visitWeaponTrailDepthItems(weapon,options,visit));
  assert(items.length>1);assert(items.some(item=>item.sortY<0)&&items.some(item=>item.sortY>0));
  samePainter(items,ctx=>drawWeaponTrail(ctx,weapon,options));
  assert.deepEqual(structuredClone(weapon),before,'collecting and drawing cannot change simulated samples');
  assert.equal(collect(visit=>visitWeaponTrailDepthItems(weapon,{time:1},visit)).length,0,'expired trails do not enter the scene');
}

const combatArt=new CombatArt(),propArt=new PropArt(()=>({getContext:()=>recorder()}));
for(const kind of ['arrow','orbit'])for(const angle of [-Math.PI/2,-.6,Math.PI/2]){
  const trail=new WeaponTrail(kind);trail.maxLength=300;
  for(let i=0;i<4;i++)trail.add(-Math.cos(angle)*(3-i)*11,-Math.sin(angle)*(3-i)*11,i*.025);
  const weapon={x:0,y:0,angle,heading:angle,evolved:true,trail},before=structuredClone(weapon);
  const drawBody=ctx=>kind==='arrow'?combatArt.drawArrow(ctx,weapon):propArt.drawBlade(ctx,weapon);
  const original=ctx=>{drawWeaponTrail(ctx,weapon);drawBody(ctx);};
  const bodyBounds={minX:-50,maxX:50,minY:-50,maxY:50};
  for(const depthCuts of [[],[-10,10]]){
    const items=collect(visit=>visitWeaponTrailDepthItems(weapon,{drawBody,bodyBounds,depthCuts},visit));
    assert.equal(items.length,depthCuts.length+1);samePainter(items,original);
    assert.deepEqual(structuredClone(weapon),before,'combined body and tail rendering leaves flight state unchanged');
  }
  // The birth frame and expired trails still have a visible weapon body.
  for(const history of [null,new WeaponTrail(kind),trail]){
    const fresh={...weapon,trail:history},body=ctx=>combatArt.drawArrow(ctx,fresh),options={time:1,drawBody:body,bodyBounds,depthCuts:[]};
    const items=collect(visit=>visitWeaponTrailDepthItems(fresh,options,visit));
    assert.equal(items.length,1);samePainter(items,body);
  }
}

// The original whole sword painter remains inside every clip: this preserves
// blade-over-tail ordering when an upward flight has a tail below its tip.
const sword=new RoyalSwordArt({makePath:()=>null}),stats=sword.stats;
for(const angle of [-Math.PI/2,-.4,Math.PI/2])for(const mode of [{},{reduced:true},{dense:true}]){
  const flight={x:18,y:-15,visualY:-35,groundLift:20,visualAngle:angle,angle:0,age:.12,done:false,
    trail:[{x:0,y:34},{x:6,y:12},{x:12,y:-12},{x:18,y:-35}]};
  const before=structuredClone(flight),options={...mode,depthCuts:[0,20]};
  const items=collect(visit=>visitSwordFlightDepthItems(flight,sword,options,visit));
  assert(items.length>1);samePainter(items,ctx=>drawSwordFlight(ctx,flight,sword,options));
  assert.deepEqual(flight,before);assert.deepEqual(sword.stats,stats,'depth drawing reuses the existing vector geometry');
}
assert.equal(collect(visit=>visitSwordFlightDepthItems({done:true},sword,{},visit)).length,0);
console.log('Attack trail depth QA passed: exact actor cuts, bounded redraws, local query bounds, pixel-aligned seams, original tail-before-body ordering, expired trails and immutable flight state.');
