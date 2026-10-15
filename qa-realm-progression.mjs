import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, xpCost } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { validateRealms } from './dist/config-validation/realms.js';

const config=JSON.parse(readFileSync(new URL('./dist/config/realms.json',import.meta.url),'utf8'));
validateRealms({realms:config});
for(const mutate of [c=>c.definitions[1].minLevel=10,c=>c.definitions[3].maxLevel=40,c=>c.definitions[1].id=c.definitions[0].id,c=>c.trial.warning=10,c=>c.trial.boltRadius=200,c=>c.materials.damageReductionEach=1,c=>c.materials.starter=0,c=>c.enabledModes=['world','dungeon']]) {
  const invalid=structuredClone(config);mutate(invalid);assert.throws(()=>validateRealms({realms:invalid}),/Invalid realm configuration/);
}

function arena(mode='world') {
  const g=new Game({mode,terrain:new Terrain({obstacles:[]}),adventure:true,environment:false,encounters:false,settlements:false,companions:false,elites:false});
  assert(g.realms,'Game integrates RealmProgression');
  g.enemies=[];g.settlements.sites=[];g.regionGrace=0;g.regionTransition=null;g.nextBossAt=Infinity;
  g._spawn=Infinity;g._shot=Infinity;g._updatePressure=()=>{};g.events=[];g.effects=[];
  return g;
}
const totalXp=(first,last)=>Array.from({length:last-first+1},(_,i)=>xpCost(first+i)).reduce((a,b)=>a+b,0);
function ready(g=arena()) {g.addExperience(totalXp(1,10)+100000);assert.equal(g.player.level,10);assert.equal(g.player.xp,g.player.xpNext);return g;}
function tick(g,seconds,move=null) {
  for(let i=0;i<Math.ceil(seconds/.05);i++) {
    move?.(g,i);g.player.hurtFlash=Math.max(0,g.player.hurtFlash-.05);g.realms.update(.05);
  }
}

const cap=ready();
assert.equal(cap.realms.label,'练气');assert.equal(cap.realms.getState().nextRealmName,'筑基');
assert.equal(cap.player.maxHp,130,'XP levels retain ordinary health growth and the prince health modifier');assert.equal(cap.skillLevel,1);
assert.equal(cap.realms.talismans,3,'first full bottleneck supplies one useful set of materials');
for(let i=0;i<5;i++)cap.addExperience(50000);
assert.equal(cap.player.level,10);assert.equal(cap.player.xp,cap.player.xpNext);assert.equal(cap.realms.talismans,3,'capped XP neither leaks nor repeatedly grants supplies');
cap.addCrystals(cap.crystalsNext);assert(cap.progression.tryUpgrade(),'world skill cards remain independent from realm XP');
assert.equal(cap.status,'upgrade');cap.status='playing';cap.crystals=0;

const disabled=arena('dungeon');disabled.addExperience(totalXp(1,31));
assert.equal(disabled.player.level,32,'extreme challenge preserves unrestricted original XP growth');assert.equal(disabled.realms.enabled,false);assert.equal(disabled.realms.getAction(),null);
const mathematical=new Game({terrain:new Terrain({obstacles:[]}),adventure:false,environment:false,encounters:false,settlements:false,companions:false});
mathematical.addExperience(totalXp(1,10));assert.equal(mathematical.player.level,11,'legacy timed/isolated combat fixtures retain their original uncapped math');

const invalid=ready();
for(const amount of [-1,4,1.5,NaN,Infinity])assert.equal(invalid.realms.start(amount),false);
assert.equal(invalid.realms.talismans,3);assert.equal(arena().realms.start(0),false,'trial requires a full bottleneck');
invalid.story={active:true};assert.match(invalid.realms.getAction().reason,/序章/);assert.equal(invalid.realms.start(0),false);invalid.story=null;
invalid.dungeon.active={id:'cave'};assert.match(invalid.realms.getAction().reason,/室外/);invalid.dungeon.active=null;
invalid.enemies=[{id:1,hp:10,x:30,y:0,type:'slime',r:10,guardActive:true}];assert.match(invalid.realms.getAction().reason,/战斗/);invalid.enemies=[];
invalid.settlements.sites=[{type:'angel',x:0,y:groundOffset(invalid.player,true),guardRadius:300}];assert.match(invalid.realms.getAction().reason,/天使/);invalid.settlements.sites=[];
const originalFree=invalid.terrain.isFree;invalid.terrain.isFree=()=>false;assert.match(invalid.realms.getAction().reason,/开阔/);invalid.terrain.isFree=originalFree;

const death=ready();death.realms.talismans=0;death.player.invuln=999;death.player.defense=99999;
death.barrier.absorbDamage=()=>0;death.abilities.absorbDamage=()=>0;
assert(death.realms.start(0),'materials assist rather than prohibit attempts without them');tick(death,9.1);
assert.equal(death.status,'dead','three unavoided unassisted strikes are lethal despite ordinary immunity and barriers');
assert.equal(death.realms.active,null);assert.equal(death.player.level,10);assert.equal(death.realms.lastResult.reason,'death');

const success=ready();const health=success.player.hp,maxHealth=success.player.maxHp;
assert(success.realms.start(3));const trialId=success.realms.active.id;
assert.equal(success.realms.talismans,0,'selected materials commit at start');assert.equal(success.realms.start(0),false,'double click cannot start a second trial');
tick(success,2.1);assert(success.realms.getMarkers().some(m=>m.kind==='tribulationWarning'),'one second telegraph precedes the strike');
const mark=success.realms.active.pending;success.player.x=mark.x+100;tick(success,.95);
assert(Math.abs(success.player.hp-(health-maxHealth*.1*.55))<1e-8,'walking outside marked landing avoids direct damage but not trial pressure');
tick(success,6.1);assert.equal(success.realms.active,null);assert.equal(success.realms.label,'筑基');assert.equal(success.player.level,11);assert.equal(success.player.xp,0);
assert.equal(success.player.maxHp,132,'breakthrough uses normal level stats exactly once');assert.equal(success.realms.lastResult.success,true);
assert.equal(success.realms._settle(true,'duplicate',trialId),false);tick(success,1);assert.equal(success.player.level,11,'duplicate completion cannot grant another level');
success.addExperience(1e9);assert.equal(success.player.level,20);assert.equal(success.player.xp,success.player.xpNext);assert.equal(success.realms.talismans,0,'later bottlenecks do not duplicate starter materials');
for(const [nextLevel,nextName,duration] of [[21,'金丹',12],[31,'元婴',15]]) {
  success.player.hp=success.player.maxHp;tick(success,3.6);success.realms.addTalismans(3);assert(success.realms.start(3),success.realms.getAction()?.reason);
  tick(success,duration+.1,g=>{const pending=g.realms.active?.pending;if(pending&&Math.hypot(g.player.x-pending.x,g.player.y+groundOffset(g.player,true)-pending.y)<pending.r+g.player.r+5)g.player.x=g.realms.active.center.x+(g.player.x>=g.realms.active.center.x?-90:90);});
  assert.equal(success.player.level,nextLevel);assert.equal(success.realms.label,nextName);
  if(nextLevel===21)success.addExperience(1e9);
}
assert.equal(success.realms.cap,null);success.addExperience(xpCost(31)+xpCost(32));assert.equal(success.player.level,33,'terminal realm opens ordinary subsequent XP growth');

const flee=ready();flee.realms.start(2);const xp=flee.player.xp;
flee.player.x+=flee.realms.active.radius+1;tick(flee,.05);
assert.equal(flee.realms.lastResult.reason,'left-area');assert.equal(flee.realms.talismans,1);assert.equal(flee.player.level,10);assert.equal(flee.player.xp,xp);
assert.equal(flee.realms.start(1),false);flee.player.x=0;tick(flee,30.1);assert(flee.realms.start(1),'failed trial becomes available after real retry cooldown');

const exit=ready();exit.realms.start(2);tick(exit,3.1);const injured=exit.player.hp;
exit.realms.dispose('exit');assert.equal(exit.realms.active,null);assert.equal(exit.realms.lastResult.reason,'exit');assert.equal(exit.realms.talismans,1);
tick(exit,20);assert.equal(exit.player.level,10);assert.equal(exit.player.hp,injured,'quit does not rewind injury or finish a pending trial');assert.equal(exit.realms.getAction()?.enabled,false);
const transition=ready();transition.realms.start(0);transition.terrain=new Terrain({obstacles:[]});tick(transition,.05);assert.equal(transition.realms.lastResult.reason,'scene-change');

const drops=arena(),elite={id:100,hp:0,affix:{id:'swift'},type:'slime'},boss={id:101,hp:0,type:'boss'};
assert(drops.realms.onEnemyDefeated(elite));assert.equal(drops.realms.talismans,1);assert.equal(drops.realms.onEnemyDefeated(elite),false);
assert.equal(drops.realms.onEnemyDefeated({...elite}),false,'duplicate defeat identity is idempotent even when event objects are copied');
assert(drops.realms.onEnemyDefeated(boss));assert.equal(drops.realms.talismans,3);
for(const e of [{id:102,hp:1,type:'boss'},{id:103,hp:0,type:'boss',summoned:true},{id:104,hp:0,type:'boss',storyEnemy:true},{id:105,hp:0,type:'boss',trainingDummy:true}])assert.equal(drops.realms.onEnemyDefeated(e),false);
assert.equal(drops.realms.talismans,3,'summons, story clear and repeated lethal notifications cannot farm materials');
const actual=arena(),victim=actual._spawnEnemy('slime');actual.elites.promote(victim,'swift');victim.hp=1;actual._hurtEnemy(victim,9999);assert.equal(actual.realms.talismans,1,'real combat defeat hook awards elite materials');actual._hurtEnemy(victim,9999);assert.equal(actual.realms.talismans,1);

const authored=ready(new Game({mode:'world'}));let playableLocation=null;
search:for(const area of authored.terrain.island.layout.areas)for(let dx=-180;dx<=180;dx+=60)for(let dy=-180;dy<=180;dy+=60) {
  authored.player.x=area.center.x+dx;authored.player.y=area.center.y+dy-groundOffset(authored.player,true);
  if(authored.realms.getAction()?.enabled){playableLocation={area:area.id,x:authored.player.x,y:authored.player.y};break search;}
}
assert(playableLocation,'the authored first world contains a legal open trial location outside angel havens and active encounters');
assert(authored.realms.start(3),'real generated world geometry supports starting a trial without modifying terrain');authored.dispose('qa');

console.log('Realm progression: XP caps, ordinary stats/cards, trial telegraphs/avoidance/damage, one-time breakthroughs, risk, materials, cleanup and real kill idempotency passed.');
