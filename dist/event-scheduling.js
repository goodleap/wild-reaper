import { groundOffset } from './terrain.js';

export const OBJECTIVE_RULES=Object.freeze({bossWarning:25,campEngage:240,houseEngage:480});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const feet=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

export function majorFightActive(g) {
  return !!g.dungeon?.active||g.regionGrace>0||g.enemies.some(e=>e.hp>0&&e.type==='boss');
}

export function bossApproaching(g) {
  // A retained portal suspends the next boss, so its overdue timestamp must
  // not freeze optional objectives for the rest of the region.
  return !g.portal&&Number.isFinite(g.nextBossAt)&&g.nextBossAt-g.time<=OBJECTIVE_RULES.bossWarning;
}

export function optionalFightNearby(g,{skipCamp=false,skipEncounter=false,skipSite=null}={}) {
  const p=feet(g),camp=g.companions?.camp,encounter=g.encounters?.active,chest=g.adventure?.treasure;
  if(!skipCamp&&camp?.state==='trapped'&&distance(p,camp)<OBJECTIVE_RULES.campEngage)return true;
  if(!skipEncounter&&encounter&&distance(p,encounter)<(encounter.type==='treasure'?420:encounter.r+80))return true;
  if(g.settlements?.sites.some(site=>site!==skipSite&&site.state==='active'&&distance(p,site.door)<OBJECTIVE_RULES.houseEngage))return true;
  return chest?.state==='active'&&distance(p,chest)<600;
}

export function canStartObjective(g,options) {
  return !majorFightActive(g)&&!bossApproaching(g)&&!optionalFightNearby(g,options);
}

export function objectivePointSafe(g,point,radius=0,{skipCamp=false,skipEncounter=false}={}) {
  // Ignored objectives no longer veto generation, but still reserve their own
  // ground so a new fight does not land on top of a waiting rescue or house.
  const camp=g.companions?.camp,encounter=g.encounters?.active;
  if(!skipCamp&&camp&&distance(point,camp)<(camp.state==='trapped'?330:100)+radius)return false;
  if(!skipEncounter&&encounter&&distance(point,encounter)<encounter.r+80+radius)return false;
  if(g.settlements?.sites.some(site=>site.state==='active'&&distance(point,site.door)<OBJECTIVE_RULES.houseEngage+radius))return false;
  return true;
}
