const KEY=/^[a-z][a-z0-9-]{0,71}$/;
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const entries=value=>plain(value)?Object.entries(value).filter(([key])=>KEY.test(key)&&!['constructor','prototype','__proto__'].includes(key)).slice(0,96):[];
export function cleanSidequestState(value){
  const state={flags:{},values:{},choices:{},actors:{}};
  for(const [key,item] of entries(value?.flags))if(typeof item==='boolean')state.flags[key]=item;
  for(const [key,item] of entries(value?.values))if(Number.isFinite(item)&&Math.abs(item)<=1e9)state.values[key]=item;
  for(const [key,item] of entries(value?.choices))if(typeof item==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(item))state.choices[key]=item;
  for(const [key,item] of entries(value?.actors).slice(0,32))if(plain(item)&&['x','y'].every(axis=>Number.isFinite(item[axis])&&Math.abs(item[axis])<=50000)){
    state.actors[key]={x:item.x,y:item.y};
    if(Number.isFinite(item.facing)&&Math.abs(item.facing)<=Math.PI*4)state.actors[key].facing=item.facing;
  }
  return state;
}
