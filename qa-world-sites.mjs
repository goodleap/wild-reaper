import assert from 'node:assert/strict';
import {Game} from './dist/engine.js';
import {Terrain,groundOffset} from './dist/terrain.js';
import {REGIONS} from './dist/world-definitions.js';
import {WORLD_SITE_FEATURES,worldSettlementDefinition} from './dist/world-sites.js';
import {WorldSiteArt} from './dist/world-site-art.js';
import {HutArt} from './dist/hut-art.js';
import {RelicArt} from './dist/relic-art.js';

const feet=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const foot=e=>({x:e.x,y:e.y+groundOffset(e)});
function arena(world){const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false});g.regionIndex=REGIONS.findIndex(item=>item.id===world);g.region=REGIONS[g.regionIndex];g.enemies=[];g._shot=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;}
for(const feature of Object.values(WORLD_SITE_FEATURES).filter(item=>item.type!=='rune')){
  const g=arena(feature.world),site={...worldSettlementDefinition(feature.world,{type:feature.type,width:54,depth:28}),id:`qa:${feature.id}`,x:0,y:0,door:{x:0,y:30},state:'ready'};
  feet(g,site.door);assert(g.dungeon.enter(site),`${feature.id} enters through existing finite-scene path`);const state=g.dungeon.active;
  assert.equal(state.featureId,feature.id);assert.equal(state.name,feature.name);assert.equal(state.treasureName,feature.treasureName);
  assert.equal(state.distances.size,state.cells.length,'all authored rooms remain connected');
  for(const enemy of g.enemies)assert(state.terrain.isFree(enemy.x,foot(enemy).y,enemy.r),'guards are clear of walls and ore');
  if(feature.type==='occupied'){
    assert.equal(g.enemies.length,feature.guardTypes.length);assert.equal(state.props.some(prop=>prop.type==='bed'),false,'special sites are not furnished as bedrooms');
    for(const enemy of g.enemies)assert(Math.hypot(enemy.x-g.player.x,foot(enemy).y-(g.player.y+19.8))>125,'entry has a safe approach');
    feet(g,state.chests[0]);assert.equal(g.dungeon.interact(state.chests[0].id),false,'guards protect their reward');
  }else{
    assert.equal(state.cells.length,feature.cols*feature.rows);assert(state.distances.get(state.bossRoom.id)<=feature.bossDistance);
    assert.equal(g.enemies.find(e=>e.dungeonBoss).name,feature.bossName);
    if(feature.shieldRooms)assert(g.enemies.some(e=>e.affix?.id==='shield'),'clock tower has actual shield guards');
  }
  const killed=g.enemies[0];feet(g,foot(killed));g.dungeon.awaken(killed);if(killed.affix)killed.affix.shield=0;g._hurtEnemy(killed,killed.hp+1);assert(killed.hp<=0);
  const survivor=g.enemies.find(e=>e.hp>0);survivor.hp-=1;const savedHp=survivor.hp;
  feet(g,state.entrance);assert(g.dungeon.exit());feet(g,site.door);assert(g.dungeon.enter(site));assert.equal(g.dungeon.active,state);assert.equal(survivor.hp,savedHp,'retreat retains damage');assert(!g.enemies.some(e=>e.id===killed.id&&e.hp>0),'retreat does not respawn guards');
  for(const enemy of [...g.enemies])if(enemy.hp>0){feet(g,foot(enemy));g.dungeon.awaken(enemy);if(enemy.affix)enemy.affix.shield=0;g._hurtEnemy(enemy,enemy.hp+1);assert(enemy.hp<=0);}
  const chest=state.treasure||state.chests[0];feet(g,chest);assert(g.dungeon.interact(chest.id));
  if(feature.type==='castle'){assert.equal(g.status,'super');assert(g.chooseSuper(g.getSuperChoices()[0].id));}
  assert.equal(state.rewardClaimed,true);assert.equal(g.gold,feature.reward.gold);assert.equal(g.crystals,feature.reward.crystals);const rewardGold=g.gold;
  feet(g,state.entrance);assert(g.dungeon.exit());feet(g,site.door);assert(g.dungeon.enter(site));assert.equal(g.dungeon.active,state);assert.equal(state.rewardClaimed,true);assert.equal(g.gold,rewardGold,'revisit never duplicates treasure');
}

const snow=new Game({debug:true,debugWorld:'snow'}),altar=snow.relicSites.sites.find(site=>site.featureId==='icealtar');assert(altar,'snow generates its permanent frost support at the rune plan');assert.equal(altar.mechanism.element,'frost');snow.enemies=[];feet(snow,altar.door);assert(snow.relicSites.interact(altar.id));assert.equal(altar.state,'active');
for(let i=0;i<260;i++)snow.relicSites.update(.05);assert.equal(altar.state,'cleared');assert.equal(snow.relicSites.interact(altar.id),false,'spent altar cannot be reactivated');

const stack=[],ops=[];
function context(){return new Proxy({globalAlpha:.8},{get(o,k){if(k in o)return o[k];if(k==='save')return()=>stack.push(o.globalAlpha);if(k==='restore')return()=>{assert(stack.length);o.globalAlpha=stack.pop();};if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>{for(const n of args)if(typeof n==='number')assert(Number.isFinite(n));ops.push(k);};}});}
const makeCanvas=()=>({width:0,height:0,getContext:()=>context()}),art=new WorldSiteArt(makeCanvas),hutArt=new HutArt(makeCanvas),relicArt=new RelicArt(makeCanvas),c=context();
for(const feature of Object.values(WORLD_SITE_FEATURES)){
 const site={...feature,featureId:feature.id,x:0,y:0,state:'ready'};
 if(feature.type==='rune'){assert(art.drawGround(c,site));for(const prop of relicArt.props(site))assert(art.drawProp(c,prop));}
 else {assert(art.drawSettlement(c,site));site.explored=true;assert(art.drawSettlement(c,site,{player:{x:0,y:-30}}));}
}
hutArt.floor('mine');for(const type of ['cargo','barrel','minecart'])hutArt.drawProp(c,{type,x:0,y:0});const warm=art.cache.size;
for(let i=0;i<30;i++)for(const feature of Object.values(WORLD_SITE_FEATURES))art.drawSettlement(c,{...feature,featureId:feature.id,x:i,y:i,state:'ready'});
assert.equal(art.cache.size,warm,'static landmarks do not add frame-dependent cache keys');assert.equal(c.globalAlpha,.8);assert.equal(stack.length,0);assert(ops.includes('drawImage'));
console.log('World sites: four distinct finite layouts, safe guards, connected routes, actual rewards, retreat/reward persistence, frost altar one-use and cached landmark rendering passed.');
