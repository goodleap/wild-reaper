import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
import { Terrain, groundOffset } from './dist/terrain.js';
let seed=61851;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const finite = (g) => {
  for (const thing of [g.player,...g.enemies,...g.bullets,...g.gems,...g.effects,...g.orbitals])
    assert(Number.isFinite(thing.x)&&Number.isFinite(thing.y),'non-finite coordinates');
  for(const e of g.enemies) assert(Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&Number.isFinite(e.damage));
  assert(g.player.hp>=0&&g.player.hp<=g.player.maxHp);
  assert(Number.isFinite(g.player.maxHp)&&Number.isFinite(g.stats.damage));
  assert(g.player.skillCooldown>=0&&g.player.skillCooldown<=g.player.skillCooldownMax);
  if(g.storm) {assert(g.storm.targets.length<=181);for(const t of g.storm.targets)assert(Number.isFinite(t.x)&&Number.isFinite(t.y));}
  assert(g.terrain.isFree(g.player.x,g.player.y+groundOffset(g.player,true),g.player.r),'player feet stay outside terrain');
  for(const e of g.enemies)assert(g.terrain.isFree(e.x,e.y+groundOffset(e),e.r),`${e.type} feet stay outside terrain`);
  assert(g.terrain.cacheSize<=g.terrain.cacheLimit,'terrain cache stays bounded');
  assert(g.enemies.length<=181,'enemy count stays bounded');
  assert(g.enemies.filter(e=>e.type==='boss'&&e.hp>0).length<=1,'only one living boss');
  assert(g.bullets.length<=60&&g.orbitals.length<=6&&g.effects.length<=201&&g.gems.length<=500);
  assert(['playing','upgrade','dead'].includes(g.status),'no terminal win state');
};
// Isolate active skill behavior from passive shots, spawns and movement.
const skillArena=()=>{const g=new Game({terrain:new Terrain({obstacles:[]})});g.enemies=[];g._spawn=10000;g._shot=10000;g.viewWidth=400;g.viewHeight=300;return g;};
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
assert.equal(empty.player.x,4.4,'cast has no movement boost');assert.equal(empty.player.invuln,0);
assert.equal(empty.player.skillCooldown,15);assert.equal(empty.storm.targets.length,0);
assert.equal(empty.storm.x,empty.player.x,'empty storm stores the cast position');
const skillFrozen={time:empty.time,life:empty.storm.life,cooldown:empty.player.skillCooldown};
empty.status='upgrade';empty.update(.05,{skill:true});
assert.deepEqual({time:empty.time,life:empty.storm.life,cooldown:empty.player.skillCooldown},skillFrozen,'paused upgrades freeze storm and cooldown');
const save=skillArena();save.player.hp=1;target(save,0,0);
save.update(.02,{skill:true});assert.equal(save.status,'playing');assert.equal(save.player.hp,1);
assert.equal(save.kills,1);assert.equal(save.player.xp,4,'contact threat dies first, with normal XP pickup');
const dense=skillArena();
for(let i=0;i<180;i++)target(dense,-180+(i%18)*20,-135+Math.floor(i/18)*28);
dense.update(0,{skill:true});
assert.equal(dense.storm.targets.length,180,'storm preserves every target beyond generic effect cap');
assert.equal(dense.kills,180);assert(dense.effects.length<=201);
const pause = new Game();
pause.player.xp=120;pause.update(.02,{});
assert.equal(pause.status,'upgrade');assert.equal(pause.getUpgradeChoices().length,3);
assert.equal(pause.chooseUpgrade('invalid'),false);
const frozen=pause.time;pause.update(.05,{x:1});assert.equal(pause.time,frozen);
assert(pause.chooseUpgrade(pause.getUpgradeChoices()[0].id));
assert.equal(pause.status,'upgrade','carry-over experience must create another level');
assert.equal(pause.player.level,3);
const death=new Game();death.player.hp=1;
death.enemies[0].x=death.player.x;death.enemies[0].y=death.player.y;
death.update(.02,{});assert.equal(death.status,'dead');
const waves=new Game();waves.time=59.99;waves.update(.02,{});
assert.equal(waves.wave,2);assert.equal(waves.events.filter(e=>e.type==='wave').length,1);
waves.events.length=0;waves.update(.02,{});assert(!waves.events.some(e=>e.type==='wave'));
const boss=new Game();assert.equal(boss.nextBossAt,150);
boss.time=149.99;boss.player.invuln=1000;boss.update(.02,{});
const firstBoss=boss.enemies.find(e=>e.type==='boss');
assert(firstBoss&&boss.bossCount===1);assert(boss.nextBossAt>300);
boss.time=boss.nextBossAt+.01;boss.update(.02,{});
assert.equal(boss.bossCount,1,'overdue boss waits for current boss');
boss._hurtEnemy(firstBoss,firstBoss.hp+1);
assert.equal(boss.bossKills,1);assert(boss.events.some(e=>e.type==='bossKill'));
boss.update(.02,{});
assert.equal(boss.bossCount,2);assert.equal(boss.enemies.filter(e=>e.type==='boss').length,1);
const secondBoss=boss.enemies.find(e=>e.type==='boss');
assert(secondBoss.hp>firstBoss.maxHp&&secondBoss.damage>firstBoss.damage,'successive bosses get stronger');
assert.equal(boss.nextBossAt,boss.time+150);assert.equal(boss.status,'playing');
const progression=new Game();progression.time=180;progression.bossDefeated=true;
progression.player.invuln=100;progression.update(.03,{});
assert(progression.time>180&&progression.status==='playing');
const capped=new Game();
Object.assign(capped.levels,{power:6,rapid:5,multishot:4,orbit:5,pulse:5,lightning:5,speed:4,magnet:4,vitality:5,regen:3});
for(const id of ['endlessPower','endlessVitality','endlessRegen','endlessPower','endlessRegen']) {
  capped.player.xp=capped.player.xpNext;capped.update(.02,{});
  const choices=capped.getUpgradeChoices();
  assert.equal(choices.length,3);assert.equal(new Set(choices.map(c=>c.id)).size,3);
  assert(choices.every(c=>c.kind==='无尽强化'));
  assert(capped.chooseUpgrade(id));assert.equal(capped.status,'playing');
}
assert.equal(capped.levels.endlessPower,2);assert.equal(capped.levels.endlessRegen,2);
assert.equal(capped.player.maxHp,112);finite(capped);
const late=new Game();late.time=720;late._spawnEnemy('slime');
assert(late.enemies.at(-1).hp>late.enemies[0].hp*5&&late.enemies.at(-1).damage>late.enemies[0].damage);

const priority=['orbit','pulse','lightning','multishot','power','rapid','vitality','magnet','regen','speed','endlessPower','endlessVitality','endlessRegen'];
const sim=(difficulty,seconds,immortal=false)=>{
  const g=new Game({difficulty});let frames=0,upgrades=0,killsAt180=0,maxEnemies=0,maxBullets=0,maxGems=0;
  while(['playing','upgrade'].includes(g.status)&&g.time<seconds&&frames++<30*(seconds+10)) {
    if(g.status==='upgrade') {
      const choices=g.getUpgradeChoices();assert.equal(choices.length,3);
      const score=c=>priority.indexOf(c.id)+(g.levels[c.id]||0)*2;
      choices.sort((a,b)=>score(a)-score(b));g.chooseUpgrade(choices[0].id);upgrades++;continue;
    }
    if(immortal)g.player.invuln=.3;
    const p=g.player;let target=null,distance=Infinity;
    for(const gem of g.gems){const d=Math.hypot(gem.x-p.x,gem.y-p.y);if(d<distance){distance=d;target=gem;}}
    let vx=target?(target.x-p.x)/(distance||1):Math.cos(g.time*.7)*.2;
    let vy=target?(target.y-p.y)/(distance||1):Math.sin(g.time*.7)*.2;
    for(const e of g.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;if(d<105){const force=(105-d)/105*2;vx+=dx/d*force;vy+=dy/d*force;}}
    const l=Math.hypot(vx,vy)||1;
    g.update(1/30,{x:vx/l,y:vy/l,skill:g.player.skillCooldown<=0&&g.enemies.length>=8});
    if(g.time<180)killsAt180=g.kills;
    maxEnemies=Math.max(maxEnemies,g.enemies.length);maxBullets=Math.max(maxBullets,g.bullets.length);maxGems=Math.max(maxGems,g.gems.length);
    if(frames%60===0)finite(g);
    assert(!g.events.some(e=>e.type==='win'));
    g.events.length=0;
  }
  finite(g);
  return {status:g.status,time:Math.round(g.time),wave:g.wave,kills:g.kills,killsAfter180:g.kills-killsAt180,level:g.player.level,hp:Math.round(g.player.hp),bossCount:g.bossCount,bossKills:g.bossKills,upgrades,maxEnemies,maxBullets,maxGems};
};
const full=sim('normal',720,true);
assert(full.time>=720&&full.killsAfter180>100&&full.level>=30);
assert(full.bossCount>=3&&full.bossKills>=2,'repeated boss lifecycle');
assert.equal(full.status,'playing');
console.log(JSON.stringify({checks:'pass',endless12Minutes:full,normal:sim('normal',240),casual:sim('casual',240)},null,2));
