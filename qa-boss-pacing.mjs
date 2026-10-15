import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Compare complete behavior cycles with the previous pacing in isolated module
// graphs: a lower cooldown alone does not prove a Boss attacks more often.
const prior={
  ancient:{cooldown:7},
  bloom:{cooldown:5.2,enragedCooldown:4.8,recovery:1.1,initialCooldown:2},
  broodmother:{initialCooldown:2,cooldown:1.2,recovery:1.1,cycleRecovery:2.5},
  deepcaller:{initialCooldown:2,cooldown:1.1,recovery:1.2,cycleRecovery:3.2},
  frostcrown:{initialCooldown:2,cooldown:1.1,recovery:1.15,cycleRecovery:2.8},
  furnace:{initialCooldown:2.1,cooldown:1.2,recovery:1.3,cycleRecovery:3.4}
};

if(process.argv[2]==='--sample'){
  const {getConfigSnapshot,loadContentConfig}=await import('./dist/content-config.js');
  if(process.argv[3]==='prior'){
    const pack=structuredClone(getConfigSnapshot());
    pack.sections.enemies.definitions.boss.baseSpeed=49;
    for(const [kind,parameters]of Object.entries(prior))Object.assign(pack.sections.enemies.bosses[kind].parameters,parameters);
    await loadContentConfig({url:'qa:previous-boss-pacing',fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(pack)})});
  }
  const {initBoss,updateBoss,resolveBossPhase}=await import('./dist/bosses.js');
  const {bossDefinition}=await import('./dist/boss-definitions.js');
  const {enemyDefinition}=await import('./dist/enemy-definitions.js');
  const {groundOffset}=await import('./dist/terrain.js');
  const results={};
  for(const kind of Object.keys(prior)){
    const e={id:1,type:'boss',x:0,y:0,r:49,hp:5000,maxHp:5000,damage:30,speed:enemyDefinition('boss').baseSpeed,phase:0,guardActive:true};
    initBoss(e,kind);e.y=-groundOffset(e);
    const player={id:0,heroId:'traveler',x:100,y:0,r:14,hp:1000000};
    const starts=[],casts=[],hits=[],dt=.01;
    const g={status:'playing',player,enemies:[e],enemyBullets:[],_id:1,_clock:0,
      terrain:{firstBlocker:()=>null,isFree:()=>true,island:{isDry:()=>true}},
      abilities:{cast(id,owner,options){casts.push({id,options});return true;},isFrozen:()=>false},
      _inView:()=>true,_effect(){},_hurtPlayer(amount){hits.push({at:g._clock,amount});return true;},
      _emit(event){if(event==='bossWindup'||event==='bloomWindup')starts.push(g._clock);},
      _moveEnemy(){},_branchMovementMultiplier:()=>1,
      _moveEntity(who,dx,dy){who.x+=dx;who.y+=dy;return {blocked:false};},
      _spawnEnemy(type){const child={id:++g._id,type,r:11,x:0,y:0,hp:24,maxHp:24,xp:0};g.enemies.push(child);return child;}
    };
    for(let frame=0;frame<120/dt;frame++){
      g._clock=(frame+1)*dt;
      // Measure cadence while every authored step is in reach. The separate
      // range QA verifies approach; this fixture intentionally disables motion.
      player.x=e.x+100;player.y=e.y+groundOffset(e)-groundOffset(player,true);
      const before=e.specialStep;
      updateBoss(g,e,dt);
      if(e.specialStep!==before)starts.push(g._clock);
      resolveBossPhase(g,'slam');resolveBossPhase(g,'ranged');
      g.enemyBullets=[];
    }
    assert(starts.length>=10,`${kind} repeatedly completes real attack sequences`);
    const parameters=bossDefinition(kind).parameters;
    if(kind==='ancient')assert(hits[0].at-starts[0]>=parameters.windup-dt,'slam keeps its complete warning');
    if(parameters.windup)for(const cast of casts)assert.equal(cast.options.windup,parameters.windup,`${kind} forwards the full warning to its spell`);
    results[kind]={count:starts.length,interval:(starts.at(-1)-starts[0])/(starts.length-1),first:starts[0],speed:e.speed};
  }
  console.log(JSON.stringify(results));
}else{
  const sample=mode=>JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--sample',mode],{encoding:'utf8'}));
  const before=sample('prior'),after=sample('current');
  const {getConfigSection}=await import('./dist/content-config.js');
  const enemies=getConfigSection('enemies'),baseSpeed=enemies.definitions.boss.baseSpeed;
  for(const kind of Object.keys(prior)){
    assert(after[kind].interval<before[kind].interval*.92,`${kind} has materially less idle time across its whole attack sequence`);
    assert(after[kind].count>before[kind].count,`${kind} actually attacks more often`);
    assert(after[kind].first<=before[kind].first,`${kind} does not wait longer before engaging`);
    assert.equal(after[kind].speed,baseSpeed,`${kind} receives the shared movement speed once`);
    assert(after[kind].speed>before[kind].speed,`${kind} keeps the increased movement pace`);
  }
  const {Game}=await import('./dist/engine.js');
  const {Terrain,groundOffset}=await import('./dist/terrain.js');
  const {StageRun}=await import('./dist/stage-run.js');
  const {STAGES}=await import('./dist/stage-definitions.js');
  const {initBoss}=await import('./dist/bosses.js');
  let seed=60931;Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  const arena=difficulty=>new Game({difficulty,terrain:new Terrain({obstacles:[]}),adventure:false,encounters:false,environment:false,settlements:false});
  for(const difficulty of ['normal','casual']){
    const g=arena(difficulty);
    const ordinary=g._spawnEnemy('boss',1);
    const expected=baseSpeed*(g.easy?getConfigSection('difficulty').enemyGrowth.easySpeedMultiplier:1);
    assert(Math.abs(ordinary.speed-expected)<1e-8,'ordinary spawns use the stronger base speed');
    const portal={id:`pacing-${difficulty}`,x:1200,y:0};g.regions._spawnGuardian(portal);
    assert.equal(g.enemies.find(e=>e.id===portal.bossId).speed,ordinary.speed,'world guardians do not revert or double the movement increase');
    for(const stage of STAGES){
      const run=new StageRun(g,stage.id);
      for(const map of stage.islands){
        run.currentMapId=map.id;
        g.terrain={island:{plan:{stageBoss:{x:0,y:0}}}};
        g._moveEntity=()=>({blocked:false});g._initializeRegionalBoss=(e,kind)=>initBoss(e,kind);
        const boss=run.spawnBoss();
        assert.equal(boss.bossKind,map.boss.kind);
        assert(Math.abs(boss.speed-baseSpeed*map.boss.speed*(g.easy?.9:1))<1e-8,'every stage keeps its authored multiplier and gains speed exactly once');
        assert.equal(boss.maxHp,g.easy?map.boss.easyHp:map.boss.hp,'normal stage health remains authored independently of debug health');
      }
    }
    const castle=arena(difficulty),site={id:`pacing-castle-${difficulty}`,door:{x:castle.player.x,y:castle.player.y+groundOffset(castle.player,true)}};
    assert(castle.dungeon.enter(site));
    const boss=castle.enemies.find(e=>e.dungeonBoss);
    assert.equal(boss.speed,baseSpeed*(g.easy?62/70:1),'castle interiors retain their difficulty ratio on the shared speed base');
  }
  assert.equal(enemies.definitions.boss.baseHp,2300,'ordinary Boss health is unchanged');
  assert.equal(enemies.definitions.boss.damage,22,'ordinary Boss contact damage is unchanged');
  const protectedTiming={ancient:{windup:1},bloom:{fanWindup:1,burstWindup:1.1,bulletSpeed:150},broodmother:{windup:1,leapDuration:.5},deepcaller:{windup:1.1,strikeInterval:.4,waveGap:110,waveDuration:2.8},frostcrown:{windup:1,chargeLength:220,shatterDelay:1},furnace:{windup:1.1,marchLength:220,eruptionDelay:1.1,flameDuration:1.8}};
  for(const [kind,values]of Object.entries(protectedTiming))for(const [key,value]of Object.entries(values))assert.equal(enemies.bosses[kind].parameters[key],value,`${kind} preserves ${key}`);
  console.log('Boss pacing: six real attack sequences, full warnings, stronger ordinary/world/stage/interior movement, preserved health and damage passed.');
  console.log(JSON.stringify(Object.fromEntries(Object.keys(prior).map(kind=>[kind,{previousInterval:+before[kind].interval.toFixed(2),currentInterval:+after[kind].interval.toFixed(2),attacksIn120Seconds:after[kind].count}]))));
}
