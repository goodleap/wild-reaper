import assert from 'node:assert/strict';
import { CombatBuild } from './dist/combat-build.js';
import { WorldShops, worldFacilitySites } from './dist/world-shops.js';
import { buyShopItem, getShopItems, activateSettlement } from './dist/sites/settlement-content.js';
import { Terrain } from './dist/terrain.js';
import { getConfigSnapshot } from './dist/content-config.js';
import { validateContent } from './dist/config-validation/content.js';
import { Game } from './dist/engine.js';
import { groundOffset } from './dist/terrain.js';
import { terrainNavigation } from './dist/terrain-navigation.js';

const events=[];
const game={mode:'world',worldId:'rift-forest',status:'playing',gold:1000,progressionTier:3,crystals:77,crystalsNext:100,
  player:{x:0,y:-19.8,r:15,hp:100,maxHp:100,heroId:'traveler',invuln:0},build:new CombatBuild(),
  adventure:{magnetTime:0,furyTime:0},gems:[{x:5,y:5}],terrain:new Terrain({obstacles:[]}),
  _effect(){},_emit:(type,data)=>events.push({type,...data}),_refreshStats(){},_refreshWeapons(){},_syncEvolutions(){},
  companions:{members:[]},worldTravel:{setRestAnchor(site){this.anchor={x:site.x,y:site.y,worldId:game.worldId};return true;}}};
game.relics={wardAmount:0,grantWard(amount){if(this.wardAmount>=amount)return false;this.wardAmount=amount;return true;}};
const facilities=['weapons','skills','supplies','rest'].map(kind=>({id:`test:${kind}`,worldFacility:kind,type:'supply',region:game.worldId,
  name:kind,x:0,y:-30,width:120,depth:65,door:{x:0,y:0},interactRadius:82,state:'ready'}));
game.settlements={game,sites:facilities,activeShop:null,closeShop(){this.activeShop=null;game.status='playing';return true;}};
const shops=game.worldShops=new WorldShops(game),[weapons,skills,supplies,rest]=facilities;
function open(site){game.status='playing';assert.ok(activateSettlement(game.settlements,site));assert.equal(game.status,'shop');}
open(weapons);
assert.equal(getShopItems(game.settlements).find(item=>item.id==='sword').reason,'已掌握');
assert.equal(buyShopItem(game.settlements,'sword'),false);
const before={gold:game.gold,crystals:game.crystals,tier:game.progressionTier};
assert.ok(buyShopItem(game.settlements,'arrow'));assert.equal(game.build.getWeapon('arrow').baseRank,1);
assert.equal(game.gold,before.gold-36);assert.equal(game.crystals,before.crystals);assert.equal(game.progressionTier,before.tier);
assert.equal(game.status,'shop');assert.equal(weapons.state,'ready');
assert.equal(buyShopItem(game.settlements,'arrow'),false);assert.equal(game.gold,before.gold-36);
assert.equal(buyShopItem(game.settlements,'meteor'),false);
assert.ok(buyShopItem(game.settlements,'orbit'));assert.equal(game.build.getWeapon('orbit').baseRank,1);
open(skills);assert.ok(buyShopItem(game.settlements,'pulse'));assert.equal(game._pulse,.15);
assert.equal(game.build.getSkill('pulse').baseRank,1);assert.equal(buyShopItem(game.settlements,'pulse'),false);
assert.equal(buyShopItem(game.settlements,'frostbolt'),false,'region assortment excludes unsupplied skills');
assert.equal(buyShopItem(game.settlements,'super:meteor'),false);
open(supplies);
for(const id of ['heal','heal','magnet','fury','shield'])assert.ok(buyShopItem(game.settlements,id));
assert.equal(game.player.hp,100);assert.equal(shops.inventory.heal,2,'full health still allows carrying supplies');
assert.equal(shops.useConsumable('heal'),false,'cannot consume while shopping');
game.settlements.closeShop();assert.equal(shops.useConsumable('heal'),false);assert.equal(shops.inventory.heal,2);
game.player.hp=40;assert.ok(shops.useConsumable('heal'));assert.equal(game.player.hp,75);assert.equal(shops.inventory.heal,1);
assert.ok(shops.useConsumable('magnet'));assert.equal(game.adventure.magnetTime,8);assert.equal(game.gems[0].attracted,true);
assert.ok(shops.useConsumable('fury'));assert.equal(game.adventure.furyTime,8);
assert.ok(shops.useConsumable('shield'));assert.equal(game.relics.wardAmount,18);
open(supplies);for(const id of ['magnet','fury','shield'])assert.ok(buyShopItem(game.settlements,id));
game.settlements.closeShop();for(const id of ['magnet','fury','shield']){assert.equal(shops.useConsumable(id),false);assert.equal(shops.inventory[id],1);}
assert.equal(shops.useConsumable('unknown'),false);
const snapshot=shops.serialize(),fresh=new WorldShops(game);assert.ok(fresh.restore(snapshot));assert.deepEqual(fresh.serialize(),snapshot);
snapshot.inventory.heal=98;assert.notEqual(shops.inventory.heal,98,'snapshot is detached');
const intact=fresh.serialize();assert.equal(fresh.restore({inventory:{heal:-1,magnet:0,fury:0,shield:0}}),false);assert.deepEqual(fresh.serialize(),intact);
assert.equal(fresh.restore({inventory:{heal:1,magnet:0,fury:0,shield:0,extra:1}}),false);
open(supplies);shops.inventory.heal=99;const balance=game.gold;assert.equal(buyShopItem(game.settlements,'heal'),false);assert.equal(game.gold,balance);
shops.inventory.heal=1;game.gold=0;assert.equal(buyShopItem(game.settlements,'heal'),false);assert.equal(shops.inventory.heal,1);
game.gold=balance;game.player.x=300;assert.equal(buyShopItem(game.settlements,'heal'),false,'stale remote shop cannot sell');game.player.x=0;
game.settlements.closeShop();game.player.hp=20;
game.companions.members=[{id:'test-ally',hp:0,maxHp:80,state:'recovering',r:15,isCompanion:true,x:100,y:100,groundOffset:19.8}];
assert.ok(activateSettlement(game.settlements,rest));assert.equal(game.player.hp,100);assert.equal(game.companions.members[0].hp,80);
assert.equal(game.companions.members[0].state,'active');assert.deepEqual(game.worldTravel.anchor,{x:0,y:0,worldId:'rift-forest'});
assert.equal(game.status,'playing');assert.equal(game.gold,balance);

// The previous one-purchase wandering merchant remains independent.
game.mode='dungeon';assert.deepEqual(worldFacilitySites(game),[]);assert.deepEqual(shops.getInventoryItems(),[]);
assert.equal(activateSettlement(game.settlements,weapons),false);
const merchant={id:'old-merchant',type:'merchant',state:'ready',stock:{heal:1,magnet:1,fury:1,shield:1,relic:0}};
game.settlements.sites.push(merchant);game.player.hp=30;
assert.ok(activateSettlement(game.settlements,merchant));assert.ok(buyShopItem(game.settlements,'heal'));
assert.equal(merchant.state,'spent');assert.equal(merchant.stock.heal,0);assert.equal(game.status,'playing');
assert.equal(game.player.hp,65);assert.ok(events.some(event=>event.type==='merchantDeparted'));

const sections=structuredClone(getConfigSnapshot().sections);
sections.economy.worldShops.skillPrices.storm=1;
assert.throws(()=>validateContent(sections),/base ability/,'innate and special skills are not shop stock');

let actualFacilities=0,actualNpcs=0;
for(const entry of getConfigSnapshot().sections.worlds.travel.regions){
  const actual=new Game({mode:'world',worldId:entry.worldId,debug:true,debugOptions:{extraGold:true},companions:false,encounters:false,questStorage:null});
  const facilities=actual.settlements.sites.filter(site=>site.worldFacility);
  assert.equal(facilities.length,4,`${entry.worldId}: all authored facilities exist`);
  assert.equal(new Set(facilities.map(site=>site.id)).size,4,'facility IDs never collide');
  assert.equal(actual.settlements.sites.some(site=>site.type==='merchant'),false,'world uses its fixed shops');
  const start={x:actual.player.x,y:actual.player.y+groundOffset(actual.player,true)},navigation=terrainNavigation(actual.terrain);
  assert.ok(actual.terrain.isFree(start.x,start.y,actual.player.r));
  for(const site of facilities){
    const label=`${entry.worldId}:${site.worldFacility}`;
    assert.ok(actual.terrain.isFree(site.door.x,site.door.y,18),`${label}: door fits the complete player`);
    assert.equal(actual.terrain.isFree(site.x,site.y-site.depth/2,0),false,`${label}: painted foundation blocks movement`);
    for(const sample of [{x:site.x,y:site.y+18},{x:site.x,y:site.y-site.depth-18},
      {x:site.x-site.width/2-18,y:site.y-site.depth/2},{x:site.x+site.width/2+18,y:site.y-site.depth/2}])
      assert.ok(actual.terrain.isFree(sample.x,sample.y,15),`${label}: outside the foundation has no roof collision`);
    assert.ok(navigation.clearSegment(start,site.door,18)||navigation.find(start,site.door,18,'ground',4096),`${label}: arrival connects to the door`);
    actual.player.x=site.door.x;actual.player.y=site.door.y-groundOffset(actual.player,true);actual.touchInteractions.latched=null;
    assert.equal(actual.getInteraction()?.id,site.id,`${label}: doorway selects its own facility`);
    if(site.worldFacility==='rest')actual.player.hp-=10;
    assert.ok(actual.touchInteractions.update(),`${label}: contact performs its action`);
    assert.equal(actual.sceneTransition.active,false);assert.equal(actual.dungeon.active,null);
    if(site.worldFacility==='rest'){
      assert.equal(actual.player.hp,actual.player.maxHp);
      assert.equal(actual.worldTravel.getRestAnchor().facilityId,site.id);
    }else{
      assert.equal(actual.status,'shop');
      const id=site.worldFacility==='weapons'?'arrow':site.worldFacility==='skills'?'barrier':'heal';
      assert.ok(actual.buyShopItem(id),`${label}: a real purchase succeeds`);
      assert.equal(actual.status,'shop');assert.equal(site.state,'ready');
      if(site.worldFacility==='supplies')assert.equal(actual.worldShops.inventory.heal,1);
      else assert.equal(actual.buyShopItem(id),false,`${label}: cannot buy an acquired base rank twice`);
      actual.closeShop();actual.touchInteractions.update();assert.equal(actual.status,'playing','closing retains doorway contact latch');
    }
    actualFacilities++;
  }
  for(const npc of actual.settlements.sites.filter(site=>site.type==='angel')){
    assert.ok(actual.terrain.isFree(npc.x,npc.y,npc.r||15),`${entry.worldId}: guardian feet do not overlap buildings`);actualNpcs++;
  }
  actual.dispose('qa-world-shops');
}
assert.equal(actualFacilities,36);
console.log(JSON.stringify({worldShops:'passed',purchases:events.filter(event=>event.type==='shopBought').length,inventory:'roundtrip',ordinaryUpgrades:'unchanged',actualFacilities,actualNpcs}));
