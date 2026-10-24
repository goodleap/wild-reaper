import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { INITIAL_WEAPON_IDS, UPGRADE_DEFS, ENDLESS_UPGRADES } from './dist/combat-catalog.js';
import { STAGES } from './dist/stage-definitions.js';
import { groundOffset } from './dist/terrain.js';

let seed=248601;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const owner=(game,choice)=>game.build.getWeapon(choice.ownerId)||game.build.getSkill(choice.ownerId);
const fresh=options=>new Game({mode:'world',companions:false,encounters:false,questStorage:null,...options});
const roll=game=>{game._choices=null;return game.getUpgradeChoices();};
const seenOffers=(game,count=100)=>{
  const seen=new Set();
  for(let i=0;i<count;i++)for(const choice of roll(game))seen.add(choice.id);
  return seen;
};

for(const initialWeaponId of INITIAL_WEAPON_IDS){
  const game=fresh({initialWeaponId});
  for(let i=0;i<100;i++){
    const choices=roll(game);
    assert.equal(choices.length,3);assert.equal(new Set(choices.map(choice=>choice.id)).size,3);
    assert(choices.some(choice=>choice.category==='weapon'&&choice.ownerId===initialWeaponId));
    assert(choices.every(choice=>choice.category==='attribute'||owner(game,choice)?.acquired),'world choices never introduce unlearned abilities or modifiers');
    assert.equal(game.getUpgradeChoices(),choices,'inspection retains the same three cards');
  }
  game.dispose('test-complete');
}

// Buy at the real town shop, then strengthen that exact ability with crystals.
const world=fresh();world.gold=500;
const shop=world.settlements.sites.find(site=>site.worldFacility==='skills');assert(shop);
const beforeShop=seenOffers(world);
for(const id of ['barrier','pulse','fireball','frostbolt','lightning','arrow','rapid','orbit','super:meteor'])assert(!beforeShop.has(id));
world.player.x=shop.door.x;world.player.y=shop.door.y-groundOffset(world.player,true);
assert(world.requestInteraction(shop.id));
for(let i=0;world.sceneTransition.active&&i<30;i++)world.sceneTransition.update(.05);
const merchant=world.dungeon.active.merchant;
world.player.x=merchant.interaction.x;world.player.y=merchant.interaction.y-groundOffset(world.player,true);
assert(world.interact(merchant.id));
assert(!world.getShopItems().some(item=>item.id==='frostbolt'),'the first town keeps its authored regional assortment');
const goldBefore=world.gold;assert(world.buyShopItem('pulse'));assert(world.gold<goldBefore);
assert.equal(world.build.getSkill('pulse').baseRank,1);assert.equal(world.buyShopItem('pulse'),false);
world.closeShop();
assert(seenOffers(world).has('pulse'),'a shop acquisition joins the reinforcement pool');
world.crystals=world.crystalsNext;world.status='upgrade';
for(let i=0;i<100&&!roll(world).some(choice=>choice.id==='pulse');i++){}
const cost=world.crystalsNext;assert(world.chooseUpgrade('pulse'));
assert.equal(world.build.getSkill('pulse').baseRank,2);assert.equal(world.crystals,0);assert(cost>0);

// A pending or fabricated card cannot bypass learning through a stale offer.
world.status='upgrade';world.crystals=world.crystalsNext;world._choices=[UPGRADE_DEFS.find(choice=>choice.id==='fireball')];
const before=world.crystals;assert.equal(world.chooseUpgrade('fireball'),false);assert.equal(world.crystals,before);assert.equal(world.build.getSkill('fireball').baseRank,0);

// Exploration/Boss rewards remain an acquisition source; only later crystal
// improvements are gated on their ownership.
world._choices=null;world.status='playing';assert(world.superSkills.offer('region'));world.status='super';
assert(world.superSkills.choose('runeArrow'));assert(world.build.getWeapon('arrow').acquired);
assert(seenOffers(world).has('rapid'));assert(seenOffers(world).has('arrowRune'));
world.superSkills.owned.meteor=1;assert(seenOffers(world,180).has('super:meteor'));
world.levels.sword=4;world._choices=null;
assert.equal(world.getUpgradeChoices().filter(choice=>choice.weaponId==='sword'&&choice.branch).length,2,'the primary weapon retains both exclusive branches');
world.dispose('test-complete');

// Exhausting learned abilities never turns crystals into a hidden source of
// unlearned skills, and does not leave a one-card or empty panel.
const capped=fresh();capped.levels.sword=4;assert(capped.build.selectBranch('sword','sweep'));
for(const definition of UPGRADE_DEFS)if(definition.category==='attribute'||owner(capped,definition)?.acquired)capped.levels[definition.id]=definition.cap;
const fallback=roll(capped);
assert.equal(fallback.length,3);assert(fallback.every(choice=>ENDLESS_UPGRADES.some(definition=>definition.id===choice.id)));
assert.equal(capped.build.getSkill('fireball').baseRank,0);capped.dispose('test-complete');

// Independent challenge and story paths retain their acquisition pool.
for(const options of [{mode:'dungeon',dungeonId:'survival'},{mode:'dungeon',stageId:STAGES[0].id},{mode:'story'}]){
  const game=fresh(options),seen=seenOffers(game);
  for(const id of ['arrow','barrier','fireball','frostbolt'])assert(seen.has(id),`${JSON.stringify(options)} retains ${id} acquisition`);
  game.dispose('test-complete');
}
const debug=fresh({debug:true,debugOptions:{fullLoadout:true}});
assert(debug.build.getSkill('fireball').acquired);assert(debug.build.getWeapon('arrow').acquired);debug.dispose('test-complete');
console.log('World acquisition: learned-only crystal offers, shops, regional stock, Boss grants, branches, fallback cards, stale rejection and unchanged challenges/story/debug passed.');
