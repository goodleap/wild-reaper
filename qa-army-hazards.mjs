import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { Environment } from './dist/environment.js';
import { ANGEL_RULES } from './dist/settlements.js';
import { defenseDamageMultiplier } from './dist/combat-stats.js';

function arena(){
  const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,settlements:false});
  g.enemies=[];g.events=[];g.effects=[];g.nextBossAt=Infinity;g._spawn=Infinity;g.player.xpNext=Infinity;g.crystalsNext=Infinity;
  g.player.x=0;g.player.y=-groundOffset(g.player,true);g.environment=new Environment(g,{generation:false});
  return g;
}
const place=(entity,x,y=0)=>{entity.x=x;entity.y=y-groundOffset(entity,!!entity.isCompanion);};
const recruit=(g,kind,x=0)=>g.companions.recruit(kind,{x,y:0});
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,message||`${actual} differs from ${expected}`);
const expectedLoss=(entity,amount)=>amount*defenseDamageMultiplier(entity.defense||0);
const wall=()=>new Terrain({obstacles:[{id:'qa-wall',type:'log',x:48,y:0,r:8,halfLength:100,angle:Math.PI/2,structureType:'castle-wall'}]});

// One explosion resolves through every friendly's ordinary defense/recovery
// path, with the same physical wall test used for hostile bodies.
const blast=arena(),dog=recruit(blast,'dog',20),owl=recruit(blast,'owl',-20),behind=recruit(blast,'stormcaller',80);
blast.terrain=wall();
const enemy=blast._spawnEnemy('slime',1);Object.assign(enemy,{x:80,y:-groundOffset(enemy),hp:1000,maxHp:1000});
blast.environment._explode({x:0,y:0,state:'armed',blastRadius:100});
close(blast.player.hp,88,'the hero receives one explosion hit');
close(dog.hp,dog.maxHp-expectedLoss(dog,12));close(owl.hp,owl.maxHp-expectedLoss(owl,12),'an airborne blast also reaches the low-flying owl');
assert.equal(behind.hp,behind.maxHp,'a tall wall shields a companion from the explosion');assert.equal(enemy.hp,1000,'the same wall shields the enemy');

// Overlapping gas clouds use independent per-body cooldowns. Entering a
// cloud halfway through the hero's clock gives a new ally its own first hit.
const poison=arena(),hound=recruit(poison,'dog',20),scout=recruit(poison,'owl',-20),late=recruit(poison,'stormcaller',200),gas=poison.environment.mechanisms;
gas.props=[0,1].map(id=>({id:`gas:${id}`,type:'gas',x:0,y:0,r:70,state:'active',remaining:10}));
gas._gasDamage(0);
close(poison.player.hp,94);close(hound.hp,hound.maxHp-expectedLoss(hound,6));close(scout.hp,scout.maxHp-expectedLoss(scout,6),'poison gas is not a ground-only hazard');assert.equal(late.hp,late.maxHp);
place(late,0);for(const entity of [poison.player,hound,scout,late])entity.invuln=0;
gas._gasDamage(.5);close(poison.player.hp,94);close(hound.hp,hound.maxHp-expectedLoss(hound,6));close(late.hp,late.maxHp-expectedLoss(late,6),'a late entrant does not borrow another body’s cooldown');
for(const entity of [poison.player,hound,scout,late])entity.invuln=0;
gas._gasDamage(.5);close(poison.player.hp,88);close(hound.hp,hound.maxHp-expectedLoss(hound,12));close(late.hp,late.maxHp-expectedLoss(late,6));
const beforePause=[poison.player,hound,scout,late].map(entity=>entity.hp),cooldowns=[...gas._gasAllyCooldowns.values()];poison.status='paused';gas.update(.05);
assert.deepEqual([poison.player,hound,scout,late].map(entity=>entity.hp),beforePause);assert.deepEqual([...gas._gasAllyCooldowns.values()],cooldowns);poison.status='playing';
poison.companions.dismiss(late.id);gas._gasDamage(0);assert(!gas._gasAllyCooldowns.has(late),'departed members do not accumulate in hazard clocks');
const safe=arena(),sheltered=recruit(safe,'dog',80);safe.terrain=wall();safe.environment.mechanisms.props=[{type:'gas',x:0,y:0,r:100,state:'active'}];safe.environment.mechanisms._gasDamage(0);assert.equal(sheltered.hp,sheltered.maxHp,'gas never leaks through a castle wall');

// Angel healing remains continuous, nonstacking and blocked by foundations.
// It helps active companions without skipping their downed recovery phase.
const haven=arena(),friends=['dog','owl','stormcaller','golem'].map((kind,i)=>recruit(haven,kind,[-20,20,80,180][i]));haven.terrain=wall();
for(const entity of [haven.player,...friends])entity.hp=entity.maxHp*.5;
haven.settlements.sites=[0,1].map(i=>({id:`angel:${i}`,type:'angel',x:0,y:i*5,state:'ready',flying:true,_attack:1}));
const prior=[haven.player,...friends].map(entity=>entity.hp);haven.settlements.update(2);
close(haven.player.hp,prior[0]+haven.player.maxHp*ANGEL_RULES.healingPerSecond*2);
for(let i=0;i<2;i++)close(friends[i].hp,prior[i+1]+friends[i].maxHp*ANGEL_RULES.healingPerSecond*2,'overlapping angels heal each active teammate only once');
assert.equal(friends[2].hp,prior[3],'a wall blocks companion healing');assert.equal(friends[3].hp,prior[4],'outside the guardian radius gives no healing');
friends[0].hp=0;friends[0].state='recovering';haven.settlements.update(1);assert.equal(friends[0].hp,0);assert.equal(friends[0].state,'recovering','the aura cannot resurrect a recovering member');

// Foot coordinates and water masks follow each natural body shape, not the
// old human-only silhouette. Flight remains exempt from ground effects.
const wet=arena(),waterDog=recruit(wet,'dog'),golem=recruit(wet,'golem'),waterOwl=recruit(wet,'owl');
wet.environment.muds=[{id:'qa-water',type:'mud',x:0,y:0,rx:180,ry:120,seed:.5}];
wet.environment.mechanisms.props=[{type:'vine',x:0,y:0,r:100,state:'active'}];
for(const member of [waterDog,golem,waterOwl])place(member,0);
const dogWater=wet.environment.getImmersion(waterDog),golemWater=wet.environment.getImmersion(golem);
close(dogWater.sink,10.5);close(golemWater.sink,18);assert.equal(dogWater.footY,0);assert.equal(golemWater.footY,0);assert(dogWater.width<golemWater.width);
assert.equal(wet.environment.getImmersion(waterOwl),null);assert.equal(wet.environment.movementMultiplier(waterOwl),1);assert.equal(wet.environment.movementMultiplier(waterDog),.6);assert.equal(wet.environment.movementMultiplier(golem),.6);
console.log('Army hazards: shared explosion path, independent nonstacking poison clocks, flying exemptions, wall isolation, pause/departure cleanup, active-only angel healing and natural immersion passed.');
