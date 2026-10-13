// Shared world-space layout. Rendering and solid scenery use these same
// districts; visits and cache eviction never reroll a street or mountain pass.
export const CITY_BLOCK=520;
export const CITY_STREET_HALF_WIDTH=56;
export const BIOME_ZONE_SIZE=1560;
const ZONES=Object.freeze({
  beach:['sands','reefs','palms'],city:['streets','plaza','courtyard'],
  mountain:['foothills','pass','summit'],snow:['pines','icefield','drifts'],
  volcano:['ashfield','basalt','vents']
});
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const mod=(value,size)=>((value%size)+size)%size;
export function cityStreetAt(x,y){
  const dx=mod(x,CITY_BLOCK),dy=mod(y,CITY_BLOCK);
  return Math.min(dx,CITY_BLOCK-dx,dy,CITY_BLOCK-dy)<=CITY_STREET_HALF_WIDTH;
}
export function biomeZone(region,x,y,seed=0){
  const choices=ZONES[region];if(!choices)return {id:region,index:0};
  const tx=Math.floor(x/BIOME_ZONE_SIZE),ty=Math.floor(y/BIOME_ZONE_SIZE);
  const index=Math.floor(hash(tx+seed*17+73,ty+seed*31+113)*choices.length);
  return {id:choices[index],index};
}
