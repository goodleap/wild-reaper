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
game.dungeon={active:null,enter(site){if(!shops.canEnter(site))return false;this.active={kind:'shop',site,merchant:{interaction:{x:0,y:0},interactRadius:82}};return true;}};
assert.equal(shops.open(weapons),false,'the outside door cannot open a transaction');
assert.deepEqual(shops.getItems(weapons),[],'outside buildings cannot expose an active sale');
function open(site){
  game.status='playing';game.settlements.activeShop=null;game.dungeon.active=null;
  assert.ok(activateSettlement(game.settlements,site));assert.equal(game.status,'playing','door changes the scene before any trade');
  assert.ok(shops.open(site));assert.equal(game.status,'shop');
}
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
game.settlements.closeShop();game.dungeon.active=null;game.player.hp=20;
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

const place=(g,p)=>{g.player.x=p.x;g.player.y=p.y-groundOffset(g.player,true);};
const finishTransition=g=>{for(let i=0;g.sceneTransition.active&&i<24;i++)g.update(.05);assert.equal(g.sceneTransition.active,false);};
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
    const surface={terrain:actual.terrain,enemies:actual.enemies,gems:actual.gems,coins:actual.coins,adventure:actual.adventure};
    const beforeEntry={gold:actual.gold,crystals:actual.crystals,build:actual.build.serialize()};
    assert.ok(actual.touchInteractions.update(),`${label}: contact performs its action`);
    if(site.worldFacility==='rest'){
      assert.equal(actual.sceneTransition.active,false);assert.equal(actual.dungeon.active,null);
      assert.equal(actual.player.hp,actual.player.maxHp);
      assert.equal(actual.worldTravel.getRestAnchor().facilityId,site.id);
      assert.equal(actual.dungeon.enter(site),false,'rest facilities never inherit supply-hut rewards');
    }else{
      assert.equal(actual.sceneTransition.active,true);assert.equal(actual.dungeon.active,null,'map switch waits for the opaque frame');
      finishTransition(actual);
      const room=actual.dungeon.active;
      assert.equal(room.kind,'shop');assert.equal(room.shopKind,site.worldFacility);assert.equal(room.site,site);
      assert.equal(actual.status,'playing');assert.notEqual(actual.terrain,surface.terrain);
      assert.deepEqual({gold:actual.gold,crystals:actual.crystals,build:actual.build.serialize()},beforeEntry,'entry grants no items or resources');
      assert.deepEqual([room.chests.length,room.enemies.length,room.gems.length,room.coins.length,room.rooms.size],[0,0,0,0,0]);
      assert.equal(room.treasure,null);assert.equal(room.rewardClaimed,false);
      assert.ok(actual.dungeon.vision.isVisible(room.merchant),'the merchant is visible from the landing');
      assert.ok(actual.terrain.isFree(room.landing.x,room.landing.y,actual.player.r));
      assert.equal(actual.terrain.firstBlocker(room.landing.x,room.landing.y,room.merchant.interaction.x,room.merchant.interaction.y,actual.player.r),null,'entry connects to the counter');
      const counter=room.props.find(prop=>prop.kind==='counter');
      assert.equal(actual.terrain.isFree(counter.x,counter.y-counter.depth/2,0),false,'painted counter has a floor collision');
      assert.equal(actual.buyShopItem('heal'),false,'room entry cannot purchase before trading');
      actual.touchInteractions.update();place(actual,room.merchant.interaction);actual.dungeon.update(0);
      assert.equal(actual.getInteraction()?.id,room.merchant.id);
      assert.ok(actual.touchInteractions.update(),'touching the merchant opens a trade');
      assert.equal(actual.sceneTransition.active,false,'talking at the counter does not change maps');
      assert.equal(actual.status,'shop');
      const id=site.worldFacility==='weapons'?'arrow':site.worldFacility==='skills'?'barrier':'heal';
      assert.ok(actual.buyShopItem(id),`${label}: a real purchase succeeds`);
      assert.equal(actual.status,'shop');assert.equal(site.state,'ready');
      if(site.worldFacility==='supplies')assert.equal(actual.worldShops.inventory.heal,1);
      else assert.equal(actual.buyShopItem(id),false,`${label}: cannot buy an acquired base rank twice`);
      actual.closeShop();actual.touchInteractions.update();assert.equal(actual.status,'playing','closing retains the merchant contact latch');
      assert.equal(actual.dungeon.active,room,'closing a trade stays inside the same room');
      const earned={gold:actual.gold,crystals:actual.crystals,build:actual.build.serialize()},outdoorEnemies=surface.enemies.map(enemy=>[enemy.x,enemy.y,enemy.hp]);
      for(let i=0;i<80;i++)actual.update(.05);
      assert.deepEqual([actual.enemies.length,actual.gems.length,actual.coins.length,actual.adventure.props.length],[0,0,0,0],'shop time cannot generate fights or free rewards');
      assert.deepEqual(surface.enemies.map(enemy=>[enemy.x,enemy.y,enemy.hp]),outdoorEnemies,'surface enemies remain frozen while shopping');
      const exit=()=>{place(actual,room.entrance);actual.dungeon.update(0);assert.ok(actual.requestInteraction(actual.getInteraction().id));finishTransition(actual);actual.touchInteractions.update();};
      exit();
      for(const [key,value] of Object.entries(surface))assert.equal(actual[key],value,`exit restores the same surface ${key}`);
      assert.ok(Math.hypot(actual.player.x-site.door.x,actual.player.y+groundOffset(actual.player,true)-site.door.y)<=150,'exit returns to this physical door');
      place(actual,site.door);assert.ok(actual.requestInteraction(site.id));finishTransition(actual);
      assert.equal(actual.dungeon.active,room,'reentry retains the same shop scene');
      assert.deepEqual({gold:actual.gold,crystals:actual.crystals,build:actual.build.serialize()},earned,'reentry cannot reroll a reward or reset purchases');
      exit();
    }
    actualFacilities++;
  }
  for(const npc of actual.settlements.sites.filter(site=>site.type==='angel')){
    assert.ok(actual.terrain.isFree(npc.x,npc.y,npc.r||15),`${entry.worldId}: guardian feet do not overlap buildings`);actualNpcs++;
  }
  if(entry.worldId==='rift-forest'){
    const hut=actual.settlements.sites.find(site=>site.type==='supply'&&!site.worldFacility);
    place(actual,hut.door);assert.ok(actual.dungeon.enter(hut));const remembered=actual.dungeon.active,chest=remembered.chests[0];
    place(actual,chest);actual.dungeon.update(0);assert.ok(actual.dungeon.interact(chest.id));
    place(actual,remembered.entrance);assert.ok(actual.dungeon.exit());
    const shop=facilities.find(site=>site.worldFacility==='supplies');place(actual,shop.door);assert.ok(actual.dungeon.enter(shop));
    assert.equal(actual.dungeon.states.get(hut.id),remembered,'entering another shop keeps the existing hut scene');
    place(actual,actual.dungeon.active.entrance);assert.ok(actual.dungeon.exit());
    place(actual,hut.door);assert.ok(actual.dungeon.enter(hut));assert.equal(actual.dungeon.active,remembered);
    assert.equal(chest.state,'claimed');assert.equal(remembered.rewardClaimed,true,'shopping cannot reset a previously claimed hut reward');
    place(actual,remembered.entrance);assert.ok(actual.dungeon.exit());
  }
  actual.dispose('qa-world-shops');
}
assert.equal(actualFacilities,36);
console.log(JSON.stringify({worldShops:'passed',purchases:events.filter(event=>event.type==='shopBought').length,inventory:'roundtrip',ordinaryUpgrades:'unchanged',actualFacilities,actualNpcs}));
