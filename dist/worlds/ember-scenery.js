const cache=new WeakMap();

// Every body and its drawing share an authored ground capsule. Raised crowns,
// roof overhangs and shadows are carried separately by the visual profile.
export function createEmberScenery(layout){
  if(cache.has(layout))return cache.get(layout);
  const result=Object.freeze((layout.emberScene?.props??[]).map(prop=>Object.freeze({...prop})));
  cache.set(layout,result);return result;
}
