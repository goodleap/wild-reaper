import assert from 'node:assert/strict';
import { Game } from './dist/engine.js';
let seed=61851;
Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const finite = (g) => {
  for (const thing of [g.player,...g.enemies,...g.bullets,...g.gems,...g.effects,...g.orbitals])
    assert(Number.isFinite(thing.x)&&Number.isFinite(thing.y),'non-finite coordinates');
  for(const e of g.enemies) assert(Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&Number.isFinite(e.damage));
  assert(g.player.hp>=0&&g.player.hp<=g.player.maxHp);
  assert(Number.isFinite(g.player.maxHp)&&Number.isFinite(g.stats.damage));
  assert(g.enemies.length<=181,'enemy count stays bounded');
  assert(g.enemies.filter(e=>e.type==='boss'&&e.hp>0).length<=1,'only one living boss');
  assert(g.bullets.length<=60&&g.orbitals.length<=6&&g.effects.length<=201&&g.gems.length<=500);
  assert(['playing','upgrade','dead'].includes(g.status),'no terminal win state');
};
const dash = new Game();
dash.update(.02,{x:1,y:0,dash:true});
assert(dash.player.x>10&&dash.player.invuln>0&&dash.player.dashCooldown>2.9);
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
    g.update(1/30,{x:vx/l,y:vy/l,dash:g.player.hp<30&&g.player.dashCooldown<=0});
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
