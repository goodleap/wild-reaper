import assert from 'node:assert/strict';
import {Island} from './dist/islands.js';
import {Terrain} from './dist/terrain.js';
import {ClockshadowBuildingArt} from './dist/clockshadow-building-art.js';
import {createNativeCityProps} from './dist/city-native-structure-art.js';

const island=new Island({region:'clockshadow-city',seed:8}),terrain=new Terrain({region:'clockshadow-city',seed:8,island}),layout=island.layout;
const structures=layout.cityStructures,gates=structures.filter(s=>s.cityKind==='gate'),piers=structures.filter(s=>s.id.startsWith('city:gate-pier:'));
assert.equal(gates.length,4);assert(piers.length>=4,'real grounded piers mark unobstructed gate ends');
for(const s of structures.filter(s=>['wall','tower'].includes(s.cityKind))){
  assert.equal(s.solid,true,`${s.id}: every solid-looking defensive structure owns a solid foundation`);
  for(const dx of [-.45,0,.45])for(const dy of [-.45,0,.45])for(const profile of ['ground','air','projectile','sight'])assert(!terrain.isFree(s.x+s.width*dx,s.y+s.depth*dy,0,profile),`${s.id}: its actual body blocks ${profile}`);
}
for(const gate of gates){
  assert.equal(gate.solid,false,'the overhead gate span does not close the opening');
  const vertical=gate.depth>gate.width,n=vertical?{x:1,y:0}:{x:0,y:1};
  for(const radius of [15,24,49]){
    const a={x:gate.x-n.x*100,y:gate.y-n.y*100},b={x:gate.x+n.x*100,y:gate.y+n.y*100};
    assert(terrain.isFree(a.x,a.y,radius));assert(!terrain.firstBlocker(a.x,a.y,b.x,b.y,radius),`${gate.id}: the intended opening retains full-body clearance`);
    const moved=terrain.moveCircle(a.x,a.y,b.x-a.x,b.y-a.y,radius);assert(Math.hypot(moved.x-b.x,moved.y-b.y)<.02);
  }
}
function coveredAxis({axis,at,from,to}){
  const spans=structures.filter(s=>s.solid&&['wall','tower'].includes(s.cityKind)&&Math.abs((axis==='y'?s.x:s.y)-at)<.01).map(s=>axis==='y'?[s.y-s.depth/2,s.y+s.depth/2]:[s.x-s.width/2,s.x+s.width/2]).sort((a,b)=>a[0]-b[0]);
  let end=from;
  for(const [lo,hi]of spans){if(hi<end)continue;if(lo>end+.03)break;end=Math.max(end,hi);}
  assert(end>=to-.03,`the actual solid foundations join along ${axis}=${from}..${to}, without dropping the remainder of a wall tile`);
}
// These seams were genuinely open in the old map: replacing a 240-unit wall
// with a 120-unit tower discarded 60/80-unit pieces beside the west gate.
coveredAxis({axis:'y',at:-4500,from:50,to:272});
coveredAxis({axis:'y',at:-4500,from:528,to:900});
coveredAxis({axis:'x',at:-2990,from:160,to:322});
coveredAxis({axis:'x',at:-2990,from:578,to:740});

// The false north pier of the south entry stood on the real turning road.
// Its removal must not be "fixed" by making that route collide instead.
assert(!piers.some(s=>s.id==='city:gate-pier:south:1'));
assert.equal(gates.find(g=>g.id==='city:gate:south').y,3550,'the south opening follows the road crossing, not the outside of its earlier turn');
for(const y of [3570,3686,3800])assert(terrain.isFree(-4530,y,49),'the entry turn retains its original wide traversable road');
assert(terrain.isFree(-4500,3686,15),'the formerly painted fake pier has no new invisible replacement');

// Record actual gate painting, independently of collision metadata. A
// vertical gate contributes no fake wall geometry. Horizontal gates contain
// only an elevated arch; their two solid piers are separate scene records.
const contexts=[];
function makeCanvas(){const canvas={width:0,height:0,getContext(){const paths=[],c={paths,globalAlpha:1,getImageData(x,y,w,h){return{data:new Uint8ClampedArray(w*h*4)};}};contexts.push(c);return new Proxy(c,{get:(o,k)=>k in o?o[k]:(...args)=>{if(['fillRect','strokeRect','moveTo','lineTo','quadraticCurveTo','ellipse'].includes(k))paths.push({method:k,args});}});}};return canvas;}
const painter=new ClockshadowBuildingArt({makeCanvas}),props=createNativeCityProps(layout);
for(const gate of gates){
  const before=contexts.length;painter._stamp(props.find(p=>p.sourceId===gate.id));const paths=contexts.slice(before).flatMap(c=>c.paths);
  if(gate.depth>gate.width){assert.equal(gate.visual,false,'an open vertical span does not allocate an empty in-game stamp');assert.equal(paths.length,0,'non-colliding north/south gateway records do not draw solid-looking wall stubs');}
  else{
    assert(paths.length>0,'the east/west gate retains its supported arch');
    assert(!paths.some(p=>p.method==='fillRect'||p.method==='strokeRect'),'the non-colliding span contains no separately painted grounded posts');
    for(const path of paths)for(let i=1;i<path.args.length;i+=2)assert(path.args[i]<0,'the retained arch stays above the ground opening');
    for(const side of [-1,1])assert(piers.some(p=>p.id===`city:gate-pier:north:${side}`),'both arch supports have real blocking foundations');
  }
}
painter.clear();
console.log(JSON.stringify({cityDefenses:'passed',gates:gates.length,realPiers:piers.length,walls:structures.filter(s=>s.cityKind==='wall').length,towers:structures.filter(s=>s.cityKind==='tower').length,coverage:'joined wall/tower seams; solid piers; open full-body gates; original turning road; no visual-only posts'}));
