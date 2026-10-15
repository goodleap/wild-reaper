import assert from 'node:assert/strict';
import { LEVEL_CAPS } from './dist/combat-catalog.js';
import { portalDoor } from './dist/portal-geometry.js';
import { Game, xpCost, crystalCost, BALANCE } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
import { movementProfile } from './dist/height-rules.js';
import { applyHeroStat } from './dist/heroes.js';
let seed=61851;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const finite = (g) => {
  for (const thing of [g.player,...g.enemies,...g.bullets,...g.enemyBullets,...g.gems,...g.effects,...g.orbitals])
    assert(Number.isFinite(thing.x)&&Number.isFinite(thing.y),'non-finite coordinates');
  for(const e of g.enemies) assert(Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&Number.isFinite(e.damage));
  assert(g.player.hp>=0&&g.player.hp<=g.player.maxHp);
  assert(Number.isFinite(g.player.maxHp)&&Number.isFinite(g.stats.damage));
  assert(g.player.skillCooldown>=0&&g.player.skillCooldown<=g.player.skillCooldownMax);
  if(g.storm) {assert(g.storm.targets.length<=181);for(const t of g.storm.targets)assert(Number.isFinite(t.x)&&Number.isFinite(t.y));}
  assert(g.terrain.isFree(g.player.x,g.player.y+groundOffset(g.player,true),g.player.r),'player feet stay outside terrain');
  for(const e of g.enemies)assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r,movementProfile(e)),`${e.type} feet stay outside terrain`);
  assert(g.terrain.cacheSize<=g.terrain.cacheLimit,'terrain cache stays bounded');
  assert(g.enemies.length<=181,'enemy count stays bounded');
  assert(g.enemyBullets.length<=BALANCE.maxEnemyBullets,'enemy projectile count stays bounded');
  assert(g.enemies.filter(e=>e.type==='boar').length<=BALANCE.boarCap);
  assert(g.enemies.filter(e=>e.type==='spore').length<=BALANCE.sporeCap);
  if(g.adventure){assert(g.adventure.props.length<=18&&g.adventure.pickups.length<=24);assert(g.enemies.filter(e=>e.elite&&e.hp>0).length<=1);}
  assert(g.enemies.filter(e=>e.type==='boss'&&e.hp>0).length<=1,'only one living boss');
  assert(g._pulseEchoes.length<=1,'delayed echoes stay bounded');
  for(const echo of g._pulseEchoes)assert(Number.isFinite(echo.x)&&Number.isFinite(echo.y)&&Number.isFinite(echo.damage));
  if(g.encounters?.active) {
    const event=g.encounters.active;assert(event.life>0&&Number.isFinite(event.x)&&Number.isFinite(event.y));
    assert(g.enemies.filter(e=>e.eventId).length<=1,'one optional encounter actor');
  }
  assert(g.bullets.length<=60&&g.orbitals.length<=6&&g.effects.length<=201&&g.gems.length<=500);
  assert(['playing','upgrade','super','dead'].includes(g.status),'no terminal win state');
};
// Isolate active skill behavior from passive shots, spawns and movement.
const skillArena=()=>{const g=new Game({terrain:new Terrain({obstacles:[]}),adventure:false});g.build.setEquipped('sword',false);g.enemies=[];g._spawn=10000;g._shot=10000;g.viewWidth=400;g.viewHeight=300;g.player.xpNext=Infinity;g.crystalsNext=Infinity;return g;};
const target=(g,x,y,{type='slime',hp=100,r=10}={})=>{
  g._spawnEnemy(type);const e=g.enemies.at(-1);Object.assign(e,{x,y,r,hp,maxHp:hp,speed:0});return e;
};
const skill=skillArena();
const inside=[target(skill,190,140),target(skill,-190,140),target(skill,190,-140),target(skill,-190,-140)];
const edge=target(skill,208,155); // Circle intersects the top-right corner.
const outside=[target(skill,211,0),target(skill,0,161),target(skill,208,158)]; // Corner AABB alone is insufficient.
skill.update(0,{skill:true});
assert.equal(skill.kills,5);assert.equal(skill.gems.length,5);
assert.equal(skill.gems.reduce((n,g)=>n+g.value,0),inside.reduce((n,e)=>n+e.xp,0)+edge.xp);
assert(outside.every(e=>e.hp===100),'offscreen enemies stay unharmed');
assert.equal(skill.storm.targets.length,5);assert.equal(skill.storm.x,0);assert.equal(skill.storm.y,0);
assert.equal(skill.player.skillCooldown,15);assert.equal(skill.player.invuln,0);
assert.equal(skill.player.x,0);assert.equal(skill.player.y,0);
assert.equal(skill.events.filter(e=>e.type==='skill').length,1);
assert(!('dashCooldown' in skill.player)&&!('dashDuration' in skill.player));
const bossSkill=skillArena();bossSkill.levels.power=2;
const skillBoss=target(bossSkill,100,0,{type:'boss',hp:2000,r:35});
bossSkill.update(0,{skill:true});
assert.equal(skillBoss.hp,1760,'boss receives scaled damage, not an instant kill');
bossSkill.update(.05,{skill:true});assert.equal(skillBoss.hp,1760,'held/repeated input respects cooldown');
assert.equal(bossSkill.bossKills,0);assert.equal(bossSkill.kills,0);
bossSkill.enemies=[];
for(let i=0;i<298;i++)bossSkill.update(.05,{});
assert(bossSkill.player.skillCooldown>0,'not ready before fifteen seconds');
bossSkill.update(0,{skill:true});assert.equal(bossSkill.events.filter(e=>e.type==='skill').length,1);
for(let i=0;i<2;i++)bossSkill.update(.05,{});
bossSkill.update(0,{skill:true});assert.equal(bossSkill.events.filter(e=>e.type==='skill').length,2);
const empty=skillArena();empty.update(.02,{x:1,y:0,skill:true});
assert.equal(empty.player.x,empty.player.speed*.02,'cast has no movement boost');assert.equal(empty.player.invuln,0);
assert.equal(empty.player.skillCooldown,15);assert.equal(empty.storm.targets.length,0);
assert.equal(empty.storm.x,empty.player.x,'empty storm stores the cast position');
const skillFrozen={time:empty.time,life:empty.storm.life,cooldown:empty.player.skillCooldown};
empty.status='upgrade';empty.update(.05,{skill:true});
assert.deepEqual({time:empty.time,life:empty.storm.life,cooldown:empty.player.skillCooldown},skillFrozen,'paused upgrades freeze storm and cooldown');
const save=skillArena();save.player.hp=1;target(save,0,0);
save.update(.02,{skill:true});assert.equal(save.status,'playing');assert.equal(save.player.hp,1);
assert.equal(save.kills,1);assert.equal(save.player.xp,4,'contact threat dies first, with immediate kill XP');
const dense=skillArena();
for(let i=0;i<180;i++)target(dense,-180+(i%18)*20,-135+Math.floor(i/18)*28);
dense.update(0,{skill:true});
assert.equal(dense.storm.targets.length,180,'storm preserves every target beyond generic effect cap');
assert.equal(dense.kills,180);assert(dense.effects.length<=201);
const pause = new Game({adventure:false});
pause.crystals=crystalCost(1)+crystalCost(2)+5;pause.update(.02,{});
assert.equal(pause.status,'upgrade');assert.equal(pause.getUpgradeChoices().length,3);
assert.equal(pause.chooseUpgrade('invalid'),false);
const frozen=pause.time;pause.update(.05,{x:1});assert.equal(pause.time,frozen);
assert(pause.chooseUpgrade(pause.getUpgradeChoices()[0].id));
assert.equal(pause.status,'upgrade','carry-over crystals must create another skill choice');
assert.equal(pause.skillLevel,2);assert.equal(pause.player.level,1);
const death=new Game({adventure:false});death.player.hp=1;
death.enemies[0].x=death.player.x;death.enemies[0].y=death.player.y;
death.update(.02,{});assert.equal(death.status,'dead');
const waves=new Game({adventure:false});waves.time=19.99;waves.update(.02,{});
assert.equal(waves.pressurePhase,'warning');assert.equal(waves.wave,1);assert.equal(waves.events.filter(e=>e.type==='wave').length,1);
waves.events.length=0;waves.update(.02,{});assert(!waves.events.some(e=>e.type==='wave'));
const boss=new Game({adventure:false});boss.crystalsNext=Infinity;assert.equal(boss.nextBossAt,120);
boss.time=119.99;boss.player.invuln=1000;boss.update(.02,{});
const firstBoss=boss.enemies.find(e=>e.type==='boss');
assert(firstBoss&&boss.bossCount===1);assert(boss.nextBossAt>270);
assert.equal(firstBoss.bossKind,'ancient');
boss.time=boss.nextBossAt+.01;boss.update(.02,{});
assert.equal(boss.bossCount,1,'overdue boss waits for current boss');
boss._hurtEnemy(firstBoss,firstBoss.hp+1);
assert.equal(boss.bossKills,1);assert(boss.events.some(e=>e.type==='bossKill'));
boss.update(.02,{});assert.equal(boss.bossCount,1,'a pending region reward holds the next Boss');
boss.player.x=boss.portal.x;boss.player.y=portalDoor(boss.portal).y-groundOffset(boss.player,true);assert(boss.chooseSuper(boss.getSuperChoices()[0].id));assert(boss.enterPortal());
for(let i=0;i<101;i++)boss.update(.02,{});
assert.equal(boss.bossCount,2);assert.equal(boss.enemies.filter(e=>e.type==='boss').length,1);
const secondBoss=boss.enemies.find(e=>e.type==='boss');
assert.equal(secondBoss.bossKind,'bloom','scheduled bosses alternate attack patterns');
assert(secondBoss.hp>firstBoss.maxHp&&secondBoss.damage>firstBoss.damage,'successive bosses get stronger');
assert(Math.abs(boss.nextBossAt-boss.time-150)<.03);assert.equal(boss.status,'playing');
const progression=new Game({adventure:false});progression.time=180;progression.bossDefeated=true;
progression.player.invuln=100;progression.update(.03,{});
assert(progression.time>180&&progression.status==='playing');
const capped=new Game({adventure:false});
Object.assign(capped.branches,{sword:'sweep',arrow:'pierce',pulse:'echoes',lightning:'chain'});
Object.assign(capped.levels,LEVEL_CAPS);
for(const id of ['endlessPower','endlessVitality','endlessRegen','endlessPower','endlessRegen']) {
  capped.crystals=capped.crystalsNext;capped.update(.02,{});
  // Endless growth has more eligible cards than slots. Resample only in this
  // fixture to exercise each requested paid upgrade through a real offer.
  let choices;
  for(let attempt=0;attempt<100;attempt++) {
    capped._choices=null;choices=capped.getUpgradeChoices();
    if(choices.some(choice=>choice.id===id))break;
  }
  assert.equal(choices.length,3);assert.equal(new Set(choices.map(c=>c.id)).size,3);
  assert(choices.every(c=>c.kind==='无尽属性强化'));
  assert(choices.some(choice=>choice.id===id),'requested eligible endless card appears in a real offer');
  assert(capped.chooseUpgrade(id));assert.equal(capped.status,'playing');
}
assert.equal(capped.levels.endlessPower,2);assert.equal(capped.levels.endlessRegen,2);
assert.equal(capped.player.maxHp,Math.round(applyHeroStat(capped.hero,'maxHealth',100+5*25+12)),'paid health upgrades retain the selected hero health modifier');finite(capped);
const late=new Game({adventure:false});late.time=720;late._spawnEnemy('slime');
assert(late.enemies.at(-1).hp>late.enemies[0].hp*2&&late.enemies.at(-1).damage>late.enemies[0].damage);

const priority=['orbit','pulse','lightning','multishot','power','rapid','vitality','magnet','regen','speed','endlessPower','endlessVitality','endlessRegen'];
const sim=(difficulty,seconds,immortal=false)=>{
  // Keep the long-run numeric bot independent of authored navigation targets.
  // Guarded portal exploration and return travel are covered in qa-portals.
  const g=new Game({difficulty,adventure:false,terrain:new Terrain({obstacles:[]})});let frames=0,upgrades=0,killsAt180=0,levelAt180=1,maxEnemies=0,maxBullets=0,maxGems=0;
  while(['playing','upgrade','super'].includes(g.status)&&g.time<seconds&&frames++<30*(seconds+10)) {
    if(g.status==='super'){assert(g.chooseSuper(g.getSuperChoices()[0].id));continue;}
    if(g.status==='upgrade') {
      const choices=[...g.getUpgradeChoices()];assert.equal(choices.length,3);
      const score=c=>priority.indexOf(c.id)+(g.levels[c.id]||0)*2;
      choices.sort((a,b)=>score(a)-score(b));g.chooseUpgrade(choices[0].id);upgrades++;continue;
    }
    if(immortal)g.player.invuln=.3;
    const p=g.player;let target=null,distance=Infinity;
    for(const gem of g.gems){const d=Math.hypot(gem.x-p.x,gem.y-p.y);if(d<distance){distance=d;target=gem;}}
    if(g.portal&&!g.sceneTransition.active){const door=portalDoor(g.portal);target={x:door.x,y:door.y-groundOffset(p,true)};distance=Math.hypot(target.x-p.x,target.y-p.y);if(g.canEnterPortal(g.portal.id)){assert(g.enterPortal(g.portal.id));continue;}}
    let vx=target?(target.x-p.x)/(distance||1):Math.cos(g.time*.7)*.2;
    let vy=target?(target.y-p.y)/(distance||1):Math.sin(g.time*.7)*.2;
    for(const e of g.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;if(d<105){const force=(105-d)/105*2;vx+=dx/d*force;vy+=dy/d*force;}}
    // Contact now travels automatically. Keep this farming bot away from the
    // return gate; intentional bidirectional travel is covered in qa-portals.
    for(const gate of g.regions.portals)if(gate.direction==='back'){
      const dx=p.x-gate.x,dy=p.y+groundOffset(p,true)-gate.y,d=Math.hypot(dx,dy)||1;
      if(d<180){const force=(180-d)/180*4;vx+=dx/d*force;vy+=dy/d*force;}
    }
    const l=Math.hypot(vx,vy)||1;
    g.update(1/30,{x:vx/l,y:vy/l,skill:g.player.skillCooldown<=0&&g.enemies.length>=8});
    if(g.time<180){killsAt180=g.kills;levelAt180=g.player.level;}
    maxEnemies=Math.max(maxEnemies,g.enemies.length);maxBullets=Math.max(maxBullets,g.bullets.length);maxGems=Math.max(maxGems,g.gems.length);
    if(frames%60===0)finite(g);
    assert(!g.events.some(e=>e.type==='win'));
    g.events.length=0;
  }
  finite(g);
  return {status:g.status,time:Math.round(g.time),wave:g.wave,kills:g.kills,killsAfter180:g.kills-killsAt180,level:g.player.level,levelsAfter180:g.player.level-levelAt180,hp:Math.round(g.player.hp),bossCount:g.bossCount,bossKills:g.bossKills,upgrades,maxEnemies,maxBullets,maxGems};
};
if(!process.argv.includes('--focused')) {
const full=sim('normal',720,true);
assert(full.time>=720&&full.killsAfter180>100&&full.levelsAfter180>=6,'combat and character growth continue well beyond the opening');
assert(full.bossCount>=3&&full.bossKills>=2,'repeated boss lifecycle');
assert.equal(full.status,'playing');
console.log(JSON.stringify({checks:'pass',endless12Minutes:full,normal:sim('normal',240),casual:sim('casual',240)},null,2));

} else console.log('Focused engine checks pass');
