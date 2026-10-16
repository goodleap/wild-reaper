import assert from 'node:assert/strict';
import {paintSnowPine,paintSnowRock,paintSnowShrub,paintSnowGrass,paintSnowLog,SNOW_SCENERY_BOUNDS,SNOW_ROCK_PROFILES} from './dist/snow-scenery-art.js';

function recording(){
  const calls=[],stack=[],state={lineWidth:1,globalAlpha:.63,fillStyle:'#123456',strokeStyle:'#654321',lineCap:'butt',lineJoin:'miter'};
  const initial={...state};let bounds=null;
  const point=(x,y,padding=0)=>{assert(Number.isFinite(x)&&Number.isFinite(y),'art coordinates stay finite');if(bounds){assert(x-padding>=bounds.left-1e-6&&x+padding<=bounds.right+1e-6,`x ${x} remains in sprite bounds ${JSON.stringify(bounds)}`);assert(y-padding>=bounds.top-1e-6&&y+padding<=bounds.bottom+1e-6,`y ${y} remains in sprite bounds ${JSON.stringify(bounds)}`);}};
  const c=new Proxy(state,{get(o,key){
    if(key in o)return o[key];
    if(key==='save')return()=>{stack.push({...state});calls.push(['save']);};
    if(key==='restore')return()=>{assert(stack.length,'every restore has a matching save');Object.assign(state,stack.pop());calls.push(['restore']);};
    if(key==='createLinearGradient'||key==='createRadialGradient')throw Error('source sprites need no unbounded gradient caches');
    return(...args)=>{
      for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),`${String(key)} coordinates are finite`);
      if(['moveTo','lineTo','quadraticCurveTo','bezierCurveTo'].includes(key))for(let i=0;i<args.length;i+=2)point(args[i],args[i+1]);
      if(key==='ellipse'){const[x,y,rx,ry]=args;point(x-rx,y-ry);point(x+rx,y+ry);}
      calls.push([key,...args,state.fillStyle,state.strokeStyle,state.lineWidth]);
    };
  },set(o,key,value){assert(!['shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY'].includes(key),'cast shadows belong to the common shadow renderer');o[key]=value;return true;}});
  return{c,calls,setBounds:value=>{bounds=value;},finish:()=>{assert.equal(stack.length,0,'source painters balance canvas state');assert.deepEqual(state,initial,'source painters preserve caller styles and alpha');}};
}

const signatures={pine:new Set(),rock:new Set(),shrub:new Set(),grass:new Set()};let renders=0;
const originalRandom=Math.random;
try{
  Math.random=()=>{throw Error('shared artwork must not advance gameplay randomness');};
  for(let v=0;v<5;v++){
    for(const [name,paint]of [['pine',c=>{paintSnowPine(c,v,false);paintSnowPine(c,v,true);}],['rock',c=>paintSnowRock(c,v)],['shrub',c=>paintSnowShrub(c,v)],['grass',c=>paintSnowGrass(c,v)]]){
      const first=recording(),again=recording();for(const r of[first,again]){r.setBounds(SNOW_SCENERY_BOUNDS[name]);paint(r.c);r.finish();renders++;}
      assert.deepEqual(first.calls,again.calls,`${name} form ${v} has deterministic source pixels`);
      signatures[name].add(JSON.stringify(first.calls.filter(([kind])=>['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','ellipse'].includes(kind))));
    }
    for(const l of[8,35,55,120])for(const r of[3,12,24]){
      const rec=recording();rec.setBounds({left:-l-.85*r,right:l+.85*r,top:-1.6*r,bottom:.95*r});paintSnowLog(rec.c,v,l,r);rec.finish();renders++;
    }
    const rock=recording(),profile=SNOW_ROCK_PROFILES[v];rock.setBounds({left:-profile.halfWidth,right:profile.halfWidth,top:-profile.top,bottom:profile.bottom});paintSnowRock(rock.c,v);rock.finish();renders++;
    const a=recording(),b=recording();paintSnowPine(a.c,v-5,true);paintSnowPine(b.c,v+5,true);assert.deepEqual(a.calls,b.calls,'arbitrary form integers normalize to a finite five-sprite set');a.finish();b.finish();
  }
}finally{Math.random=originalRandom;}
for(const [name,forms]of Object.entries(signatures))assert.equal(forms.size,5,`${name} variants change geometry, not only colors`);
const trunk=recording(),crown=recording();paintSnowPine(trunk.c,0,false);paintSnowPine(crown.c,0,true);assert.notDeepEqual(trunk.calls,crown.calls,'trunk and crown remain independent for canopy alpha');trunk.finish();crown.finish();
console.log(JSON.stringify({snowScenery:'passed',renders,forms:5,deterministic:true,preservesCanvasState:true,fitsExistingSpriteBounds:true,castShadows:false}));
