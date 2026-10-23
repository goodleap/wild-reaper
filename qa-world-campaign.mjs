import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { WorldSave, WORLD_SAVE_KEY } from './dist/world-save.js';
import { groundOffset } from './dist/terrain.js';
import { STAGES } from './dist/stage-definitions.js';

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const notices=[],save=new WorldSave({storage,onNotice:notice=>notices.push(notice)});
const game=new Game({...save.startOptions(),questStorage:save.questStorage});
assert(save.attach(game));
const place=(g,point)=>{g.player.x=point.x;g.player.y=point.y-groundOffset(g.player,true);};
const finishTransition=g=>{for(let i=0;i<50&&g.sceneTransition.active;i++)g.update(.05);assert(!g.sceneTransition.active);assert(g.sceneTransition.commitSucceeded);};
const openShop=kind=>{
  const site=game.settlements.sites.find(site=>site.worldFacility===kind);assert(site);
  place(game,site.door);assert(game.requestInteraction(site.id));assert.equal(game.status,'shop');assert(!game.dungeon.active);assert(!game.sceneTransition.active);return site;
};
assert.equal(game.worldId,'rift-forest');
assert(game.worldTravel.activated.has('rift-forest'));
assert(!game.worldTravel.activated.has('verdant-rift'));
const originalTerrain=game.terrain,enemy=game.enemies.find(e=>e.territoryId&&e.type!=='boss');
assert(enemy);enemy.hp-=1;const enemyId=enemy.id,enemyHp=enemy.hp;
game.grantResources({gold:200},'campaign-qa');
openShop('weapons');
const item=game.getShopItems().find(item=>item.available);assert(item);
assert(game.buyShopItem(item.id));assert.equal(game.status,'shop');assert(game.build.getWeapon(item.id).acquired);
assert(!game.buyShopItem(item.id),'a second store cannot repurchase the base ability');
assert(game.closeShop());

game.crystals=game.crystalsNext;assert(game.progression.tryUpgrade());
const choice=game.getUpgradeChoices().find(choice=>choice.ownerId===game.initialWeaponId);assert(choice,'world crystal upgrades retain a primary weapon option');
assert(game.chooseUpgrade(choice.id));assert.equal(game.status,'playing');assert.equal(game.crystals,0);
openShop('supplies');assert(game.buyShopItem('heal'));assert(game.buyShopItem('heal'));assert(game.closeShop());
const inventory=game.worldShops.inventory;
assert.equal(inventory.heal,2);game.player.hp=game.player.maxHp;
assert(!game.worldShops.useConsumable('heal'));assert.equal(inventory.heal,2);
game.player.hp-=45;assert(game.worldShops.useConsumable('heal'));assert.equal(inventory.heal,1);

const outward=game.regions.portals.find(portal=>portal.nextRegion.id==='verdant-rift');assert(outward?.natural);
place(game,outward);assert(game.canEnterPortal(outward.id));assert(game.requestInteraction(outward.id));finishTransition(game);
assert.equal(game.worldId,'verdant-rift');assert(game.worldTravel.discovered.has('verdant-rift'));
assert(!game.worldTravel.activated.has('verdant-rift'),'crossing a region does not activate its distant waypoint');
assert.equal(game.settlements.sites.filter(site=>site.worldFacility).length,4);
const waypoint=game.worldTravel.waypoint;place(game,{x:waypoint.x,y:waypoint.y+30});game.worldTravel.update();
assert(game.worldTravel.activated.has('verdant-rift'));assert(game.worldTravel.canTravel('rift-forest'));
const gold=game.gold;assert(game.worldTravel.requestTravel('rift-forest'));finishTransition(game);
assert.equal(game.terrain,originalTerrain,'return trips reuse the suspended region');
assert.equal(game.enemies.find(e=>e.id===enemyId).hp,enemyHp,'return travel preserves injured field enemies');
assert.equal(game.gold,gold);assert.equal(game.worldShops.inventory.heal,1);assert(game.build.getWeapon(item.id).acquired);

await Promise.resolve();assert(save.capture(game,{reason:'campaign-roundtrip'}));assert.equal(notices.length,0);
const bytes=values.get(WORLD_SAVE_KEY).length;game.dispose('reload');
const reloadedSave=new WorldSave({storage}),reloaded=new Game({...reloadedSave.startOptions(),questStorage:reloadedSave.questStorage});
assert(reloadedSave.attach(reloaded));assert.equal(reloaded.gold,gold);assert.equal(reloaded.worldShops.inventory.heal,1);
assert(reloaded.worldTravel.activated.has('verdant-rift'));assert.equal(reloaded.enemies.find(e=>e.id===enemyId).hp,enemyHp);
assert(reloaded.build.getWeapon(item.id).acquired);assert(reloaded.worldTravel.requestTravel('verdant-rift'));finishTransition(reloaded);
assert.equal(reloaded.worldId,'verdant-rift');assert.equal(reloaded.worldShops.inventory.heal,1);
assert.equal(reloaded.settlements.sites.filter(site=>site.worldFacility).length,4);
reloaded.dispose('qa-complete');

for(const options of [{mode:'dungeon',stageId:STAGES[0].id},{mode:'story'}]){
  const isolated=new Game(options);assert(!isolated.worldTravel.enabled);assert.equal(isolated.settlements.sites.filter(site=>site.worldFacility).length,0);
  assert(!reloadedSave.attach(isolated));assert(!reloadedSave.capture(isolated));
  if(options.mode==='dungeon'){isolated.crystals=isolated.crystalsNext;assert(isolated.progression.tryUpgrade());assert.equal(isolated.status,'upgrade');}
  isolated.dispose('qa-complete');
}
console.log(JSON.stringify({worldCampaign:'passed',flows:['shops','upgrade cards','inventory','natural crossing','waypoint return','reload','mode isolation'],saveBytes:bytes}));
