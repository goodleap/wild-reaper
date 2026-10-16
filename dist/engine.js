import { CombatBuild } from './combat-build.js';
import { CombatAttacks, circleImpact, obstacleImpact } from './combat-attacks.js';
import { CombatResolution } from './combat-resolution.js';
import { CombatProgression } from './combat-progression.js';
import { GuardianBarrier } from './guardian-barrier.js';
import { AbilityRuntime } from './ability-runtime.js';
import { resolveCharacterStats, resolveMaxHealth, maxHealthGrowth, skillStats } from './combat-stats.js';
import { EVOLUTIONS, normalizeInitialWeaponId } from './combat-catalog.js';
export { EVOLUTIONS } from './combat-catalog.js';
import { Terrain, groundOffset } from './terrain.js';
import { terrainNavigation } from './terrain-navigation.js';
import { blocksObstacle, isGrounded, movementProfile } from './height-rules.js';
import { Island } from './islands.js';
import { waterIntersectsCircle } from './water-geometry.js';
import { Adventure } from './adventure.js';
import { Encounters } from './encounters.js';
import { initBoss, updateBoss, resolveBossSlams, resolveBossPhase, clearBossAttacks } from './bosses.js';
import { enemyDefinition } from './enemy-definitions.js';
import { initializeEnemyBehavior, updateEnemyBehavior, resolveEnemyBehavior, updateBoar, updateSpore } from './enemy-behaviors.js';
import { SPECIAL_ENEMY_CAPS } from './encounter-definitions.js';
import { HEROES, getHero, getHeroAppearance, applyHeroStat } from './heroes.js';
import { CombatStatus } from './combat-status.js';
import { Environment } from './environment.js';
import { REGIONS, Regions, regionFor, regionEnemyType } from './regions.js';
import { Elites } from './elites.js';
import { Relics, RELICS } from './relics.js';
import { Companions, COMPANIONS } from './companions.js';
import { WEAPON_BRANCHES, branchDefinition } from './weapon-branches.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { usesEnemyLocomotion, updateEnemyLocomotion } from './enemy-animation.js';
import { SuperSkills, SUPER_SKILLS } from './super-skills.js';
import { Dungeon } from './dungeon.js';
import { Settlements } from './settlements.js';
import { WaveDirector } from './wave-director.js';
import { StageRun } from './stage-run.js';
import { ExpeditionRun } from './expedition-run.js';
import { MonsterTerritories } from './monster-territories.js';
import { RiftExploration } from './rift-exploration.js';
import { StoryRun } from './story-run.js';
import { SceneContent } from './scene-content.js';
import { RealmProgression } from './realm-progression.js';
import { RelicSites } from './relic-sites.js';
import { TouchInteractions } from './touch-interactions.js';
import { portalDoor } from './portal-geometry.js';
import { SceneTransition } from './scene-transition.js';
import { updateDebugMonsterStream } from './debug-wave.js';
import { normalizeDebugOptions } from './debug-mode.js';
import { applyFullDebugBuild, spawnDebugTrainingDummy, spawnDebugBosses } from './debug-training.js';
import { updateWeaponKnockback } from './weapon-knockback.js';
import { friendlyTargets, friendlyFoot, isFriendlyActive, selectFriendlyTarget, damageFriendly, clearFriendlyPath } from './friendly-combat.js';
import { getConfigSection, getConfigSnapshot } from './content-config.js';
export { HEROES, REGIONS, RELICS, COMPANIONS, WEAPON_BRANCHES, SUPER_SKILLS };

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sq = (v) => v * v;
const dist2 = (a, b) => sq(a.x - b.x) + sq(a.y - b.y);
const decorativeEffects=new Set(['hit','damage','defeat','arrowRicochet']);
const protectedEffect=e=>e.type==='rescueWarning'||(e.type==='defeat'&&e.boss);
// Visual variation must never consume the combat/loot random stream.
const feedbackSeed = (x,y,time,id=0) => (Math.imul(Math.round(x*16),73856093)^Math.imul(Math.round(y*16),19349663)^Math.imul(Math.round(time*1000),83492791)^Math.imul(id|0,2654435761))>>>0;
const DIFFICULTY=getConfigSection('difficulty'),PRESSURE=DIFFICULTY.pressure,ENEMY_GROWTH=DIFFICULTY.enemyGrowth,EXPLORATION_SPAWN=DIFFICULTY.explorationSpawn;
const HERO_DEFAULTS=getConfigSection('heroes').defaults,COMBAT_RULES=getConfigSection('combat').stats,ATTACK_DEFAULTS=COMBAT_RULES.attackDefaults;
export const BALANCE=Object.freeze({...DIFFICULTY.balance,arrowDamage:ATTACK_DEFAULTS.arrowDamage,arrowInterval:ATTACK_DEFAULTS.arrowInterval,arrowRange:ATTACK_DEFAULTS.arrowRange,magnet:ATTACK_DEFAULTS.magnet,boarCap:SPECIAL_ENEMY_CAPS.boar,sporeCap:SPECIAL_ENEMY_CAPS.spore});
export function xpCost(level) {
  if(level<=1)return BALANCE.firstXp;
  const n=level-2;return Math.round(BALANCE.xpBase+BALANCE.xpLinear*n+BALANCE.xpCurve*Math.pow(n,DIFFICULTY.xp.exponent));
}
// Crystals retain the measured skill-choice pacing independently of kill XP.
export const crystalCost=(skillLevel)=>xpCost(skillLevel);
export class Game {
  constructor({difficulty='normal',hero='traveler',appearanceId=null,initialWeaponId='sword',terrain=null,adventure=true,encounters=adventure,environment=adventure,elites=adventure,companions=adventure,settlements=adventure,debug=false,debugOptions=null,debugWorld=null,worldId='forest',stageId=null,mode=null,dungeonId=null,storyId='prologue'}={}) {
    if(mode==='story'){hero='traveler';appearanceId=null;initialWeaponId='sword';stageId=null;dungeonId=null;worldId='forest';debug=false;}
    this.configVersion=getConfigSnapshot().contentVersion;
    this.debug=debug===true;
    this.debugOptions=normalizeDebugOptions(debugOptions,this.debug);
    this.debugFull=this.debugOptions.fullLoadout;
    this.mode=mode==='story'?'story':stageId||dungeonId||mode==='dungeon'?'dungeon':'world';
    this.dungeonId=this.mode==='dungeon'?dungeonId:null;
    this._worldExploration=['world','story'].includes(this.mode)&&!!adventure;
    if(['world','dungeon','story'].includes(mode))difficulty='normal';
    this.stage=stageId&&!dungeonId?new StageRun(this,stageId):null;
    this.expedition=dungeonId?new ExpeditionRun(this,dungeonId):null;
    const selectedWorld=this.debug&&debugWorld?debugWorld:worldId;
    this.regionIndex=this.stage?.currentIsland.themeIndex??(this.mode==='world'?Math.max(0,REGIONS.findIndex(region=>region.id===selectedWorld)):0);
    this.mapId=this.stage?.currentMapId??this.regionIndex;
    this.region=regionFor(this.regionIndex);
    this.worldId=this.region.id;this.startWorldId=this.worldId;
    const seed=this.stage?.currentIsland.seed??this.regionIndex;
    this.terrain=terrain??new Terrain({region:this.region.id,seed,island:new Island({region:this.region.id,seed,map:this.stage?.currentIsland})});
    this.sceneContent=new SceneContent(this,{story:this.mode==='story'});
    const worldContent=this.sceneContent.allows('worldContent');
    this._islandWorlds=!!this.terrain.island;
    this.portal=null;this.regionGrace=0;this.regionTransition=null;
    this._features={adventure:!!adventure,encounters:!!encounters,environment:!!environment,elites:!!elites,settlements:!!settlements,companions:!!companions};this._interactHeld=false;
    this.difficulty = difficulty;
    this.easy = difficulty === 'casual' || difficulty === 'easy';
    this.hero=getHero(hero);
    this.appearanceId=getHeroAppearance(hero,appearanceId).id;
    this.status = 'playing'; this.time = 0; this.runTime=0; this.kills = 0; this.wave = 1;
    this.pressurePhase='steady';this.phaseEndsAt=20;
    this.viewWidth = 1100; this.viewHeight = 650;
    const baseMaxHp=this.easy?HERO_DEFAULTS.easyBaseHealth:HERO_DEFAULTS.baseHealth,maxHp=Math.max(1,Math.round(applyHeroStat(this.hero,'maxHealth',baseMaxHp)));
    this.player = {x:0,y:0,r:15,hp:maxHp,maxHp,speed:this.hero.baseSpeed,heroId:this.hero.id,level:1,xp:0,xpNext:xpCost(1),invuln:0,hurtFlash:0,hurtFace:0,castFace:0,skillCooldown:0,skillCooldownMax:this.debugOptions.zeroStormCooldown?0:this.hero.skillCooldown,facing:0};
    this.player.appearanceId=this.appearanceId;
    const worldSpawn=this.terrain.island?.layout?.spawn;
    if(worldSpawn){this.player.x=worldSpawn.x;this.player.y=worldSpawn.y-groundOffset(this.player,true);}
    resetLocomotion(this.player);
    this.initialWeaponId=normalizeInitialWeaponId(initialWeaponId);
    this.build=new CombatBuild({initialWeaponId:this.initialWeaponId,heroId:this.hero.id});
    this.levels=this.build.levels;this.branches=this.build.branches;this.evolutions=this.build.evolutions;
    for(const [name,key] of [['progressionTier','progressionTier'],['skillLevel','progressionTier'],['rescuePower','rescuePower']])Object.defineProperty(this,name,{enumerable:true,get:()=>this.build[key],set:value=>{this.build[key]=value;}});
    // Store the common base, so role multipliers apply once to later growth too.
    this.player.baseMaxHp=baseMaxHp;
    Object.defineProperty(this.player,'maxHp',{enumerable:true,get:()=>resolveMaxHealth(this),set:value=>{
      const modifier=this.hero.statModifiers.maxHealth;
      this.player.baseMaxHp=(value-modifier.fixed)/modifier.multiplier-maxHealthGrowth(this);
    }});
    this.skillLevel=1;this.crystals=0;this.crystalsNext=crystalCost(1);this.gold=0;this.coins=[];
    this.enemies = []; this.bullets = []; this.enemyBullets=[];this.gems = []; this.effects = []; this.orbitals = []; this.events = [];
    this.storm = null;
    this.bossSpawned = false; this.bossDefeated = false;
    this.nextBossAt = BALANCE.firstBossAt; this.bossCount = 0; this.bossKills = 0;
    this.rescuePower=0;
    this.weapons=[];this.skills=[];
    this.stats = {damage:1,fireRate:1,moveSpeed:1,magnet:BALANCE.magnet};
    this._id = 0; this._clock = 0; this._shot = .15; this._spawn = .4;
    this._pulse = 1; this._lightning = 1; this._choices = null;
    this._pulseEchoes=[];
    this._branchOfferCursor=0;this._branchOfferWeapon=null;
    this._refreshStats();this._refreshWeapons();
    this._grid = new Map(); this._cell = 86; this._pendingLevels = 0;
    this._moveEntity(this.player,0,0,true);
    if(worldContent&&!this._worldExploration&&!this.expedition)for(let i=0;i<EXPLORATION_SPAWN.initialCount;i++)this._spawnEnemy(EXPLORATION_SPAWN.initialType,adventure?undefined:EXPLORATION_SPAWN.testStartRadius+i*EXPLORATION_SPAWN.testRadiusStep);
    this.adventure=null;
    this.encounters=encounters?new Encounters(this,{generation:worldContent}):null;
    this.combat=new CombatResolution(this);this.attacks=new CombatAttacks(this);
    this.combatStatus=new CombatStatus(this);
    // Reserve the nearby debug entrance before environmental hazards choose
    // their positions. The ordinary world keeps its original generation order.
    if(this.debugOptions.testFacilities&&settlements)this.settlements=new Settlements(this);
    this.environment=environment?new Environment(this,{generation:worldContent}):null;
    // Natural water is fixed before smaller supplies choose their habitat.
    this.adventure=adventure?new Adventure(this,{generation:worldContent}):null;
    this.relics=new Relics(this);this.barrier=new GuardianBarrier(this);this.regions=new Regions(this);this.elites=new Elites(this,{generation:worldContent&&elites});
    this.companions=new Companions(this,{generation:worldContent&&companions});
    this.superSkills=new SuperSkills(this);this.progression=new CombatProgression(this,{costForTier:crystalCost});this.dungeon=new Dungeon(this);this.sceneTransition=new SceneTransition(this);this.touchInteractions=new TouchInteractions(this);
    this.abilities=new AbilityRuntime(this);this._abilityCooldowns={fireball:.4,frostbolt:.7};
    this.settlements??=new Settlements(this,{generation:worldContent&&settlements});
    this.waveDirector=new WaveDirector(this);
    this.discoveredMap=new Set();if(worldContent)this.regions.initialize();
    this.riftExploration=new RiftExploration(this,{generation:worldContent});
    this.relicSites=new RelicSites(this,{generation:!!(worldContent&&adventure&&(encounters||companions))});
    if(this.mode!=='story')this.settlements.ensureAngels?.();
    this.territories=new MonsterTerritories(this,worldContent?{}:{generation:false});
    this.expedition?.initialize();
    // Keep debug entry immediately playable. Shop gold is granted once;
    // crystals earned later still use the ordinary upgrade thresholds.
    if(this.debugOptions.extraGold)this.grantResources({gold:500},'debugStart');
    applyFullDebugBuild(this);spawnDebugTrainingDummy(this);spawnDebugBosses(this);
    this.realms=new RealmProgression(this,{costForLevel:xpCost});
    this.story=this.mode==='story'?new StoryRun(this,{id:storyId}):null;
    this.story?.initialize();
  }

  onEnemyDefeated(enemy){this.story?.onEnemyDefeated?.(enemy);this.realms?.onEnemyDefeated(enemy);this.onArchiveDefeat?.(enemy);}
  dispose(reason='exit') {this.story?.cleanup(reason);this.sceneContent.dispose();this.realms?.dispose();}

  _createStoryExplorationContent() {
    const desired={x:this.player.x,y:this.player.y},spawn=this.terrain.island?.layout?.spawn;
    // Place authored world content from its usual origin, independently of
    // where the chapter ended. Arrival is resolved against the completed world.
    this.player.x=spawn?.x??0;this.player.y=spawn?spawn.y-groundOffset(this.player,true):0;
    this.enemies=[];this._grid.clear();this.portal=null;
    this.environment=null;this.adventure=null;this.encounters=null;this.settlements=null;this.relicSites=null;this.riftExploration=null;
    this.regions=new Regions(this);
    this.companions.camps=[];this.companions.generation=this._features.companions;this.companions.nextAt=this.time+35;
    this.elites.generation=this._features.elites;
    if(this._features.encounters)this.encounters=new Encounters(this);
    if(this._features.environment)this.environment=new Environment(this);
    if(this._features.adventure)this.adventure=new Adventure(this);
    this.settlements=new Settlements(this,{generation:this._features.settlements});
    this.regions.initialize();this.riftExploration=new RiftExploration(this);
    this.relicSites=new RelicSites(this,{generation:!!(this._features.adventure&&(this._features.encounters||this._features.companions))});
    this.territories=new MonsterTerritories(this);this.settlements.ensureAngels();
    this.player.x=desired.x;this.player.y=desired.y;
    this.nextBossAt=this.time+BALANCE.firstBossAt;this._spawn=2;this.waveDirector.reset();
    // A chapter's old attacks cannot immediately hit the restored residents.
    this.attacks.clearScene();this.superSkills.clearScene();this.barrier.clearScene();this.abilities.clearScene();
    this.bullets=[];this.enemyBullets=[];this.effects=[];this.orbitals=[];this.storm=null;this._pulseEchoes=[];
  }

  _emit(type,extra={}) { if (this.events.length < 100) this.events.push({type,...extra}); }
  _effect(x,y,type,life,r,color,text,extra={}) {
    // A screen clear can defeat hundreds of enemies at once. Keep the newest
    // ordinary bursts while allowing a boss's longer farewell to finish.
    if(type==='defeat'&&this.effects.filter(e=>e.type==='defeat').length>=24) {
      let oldest=this.effects.findIndex(e=>e.type==='defeat'&&!e.boss);
      if(oldest<0) {
        if(!extra.boss)return;
        oldest=this.effects.findIndex(e=>e.type==='defeat');
      }
      this.effects.splice(oldest,1);
    }
    while(this.effects.length>=200) {
      // Decorative feedback yields before spawn warnings or a boss farewell.
      let oldest=this.effects.findIndex(e=>decorativeEffects.has(e.type)&&!protectedEffect(e));
      if(oldest<0)oldest=this.effects.findIndex(e=>!protectedEffect(e));
      if(oldest<0){if(!protectedEffect({type,...extra}))return;oldest=0;}
      this.effects.splice(oldest,1);
    }
    this.effects.push({x,y,type,life,maxLife:life,r,color,text,seed:feedbackSeed(x,y,this._clock),...extra});
  }
  _damageMultiplier() { return resolveCharacterStats(this).damageMultiplier; }
  _inView(entity,margin=0) {
    const dx=Math.max(0,Math.abs(entity.x-this.player.x)-this.viewWidth*.5-margin);
    const dy=Math.max(0,Math.abs(entity.y-this.player.y)-this.viewHeight*.5-margin);
    return dx*dx+dy*dy<=sq(entity.r||0);
  }
  _castStorm() { return this.attacks.castStorm(); }
  _nearest(x,y,range=BALANCE.arrowRange,exclude,originEntity=null,options={}) {
    const origin=originEntity||{x,y,groundY:y+groundOffset(this.player,true)};
    let best=null, d=range*range;
    for(const e of this.enemies) if(!exclude?.has(e.id)) {
      const n=sq(e.x-x)+sq(e.y-y);
      if(n<d&&this.combat.canTarget(e,origin,{requireView:true,checkPath:true,source:'arrow',...options})) { d=n; best=e; }
    }
    return best;
  }
  _difficultyTime() {
    if(this._worldExploration)return Math.max(0,(this.region.danger||1)-1)*PRESSURE.dangerSeconds;
    if(this.stage)return Math.max(0,(this.stage.definition.dangerFactor??1)-1)*PRESSURE.dangerSeconds+Math.min(this.time,PRESSURE.timeCap)*PRESSURE.timeFactor;
    // Pressure follows cleared connections and elapsed time, not the world
    // array index. The first three cleared routes start the endless clock.
    if(!this._features.adventure||!this._islandWorlds)return this.time;
    const base=Math.max(0,(this.region.danger||1)-1)*PRESSURE.dangerSeconds+Math.min(PRESSURE.connectionCap,this.regions?.defeatedConnectionsCount||0)*PRESSURE.connectionSeconds+Math.min(this.time,PRESSURE.timeCap)*PRESSURE.timeFactor;
    return base+(this.regions?.endlessUnlocked?Math.max(0,this.time-this.regions.endlessStartedAt):0);
  }
  _waveTier() {
    if(this.stage)return Math.round(Math.max(0,(this.stage.definition.dangerFactor??1)-1)*PRESSURE.waveDanger)+Math.min(PRESSURE.waveTimeCap,Math.floor(this.time/PRESSURE.wavePeriod));
    if(!this._features.adventure||!this._islandWorlds)return null;
    const exploration=Math.round(Math.max(0,(this.region.danger||1)-1)*PRESSURE.waveDanger)+Math.min(PRESSURE.connectionCap,this.regions?.defeatedConnectionsCount||0)*PRESSURE.waveConnection+Math.min(PRESSURE.waveTimeCap,Math.floor(this.time/PRESSURE.wavePeriod));
    return exploration+(this.regions?.endlessUnlocked?Math.floor(Math.max(0,this.time-this.regions.endlessStartedAt)/PRESSURE.endlessWavePeriod):0);
  }
  _findSpawnPoint(type='slime',angle,radius) {
    const r=enemyDefinition(type).r,p=this.player;
    const halfW=Math.max(390,this.viewWidth*.5+65),halfH=Math.max(290,this.viewHeight*.5+65);
    const directed=Number.isFinite(angle),start=directed?angle:rand(0,TAU);
    // A directed warning keeps its side even if the player runs to the coast.
    // Never mirror the announced wave or project an ocean point onto the hero.
    const turns=directed?[0,.075,-.075,.15,-.15]:Array.from({length:32},(_,i)=>i*TAU/32);
    for(const turn of turns) {
      const a=start+turn,ux=Math.cos(a),uy=Math.sin(a);
      const edge=1/Math.max(Math.abs(ux)/halfW,Math.abs(uy)/halfH);
      for(const extra of [0,80,180,300]) {
        const d=Math.max(radius||0,edge)+extra,x=p.x+ux*d,y=p.y+uy*d,footY=y+groundOffset({type,r});
        if(this._inView({x,y,r},36)||!this.terrain.isFree(x,footY,r+4)||this.terrain.island?.isDry(x,footY,r+4)===false)continue;
        if(this.environment?.muds.some(m=>waterIntersectsCircle(m,x,footY,r+5)))continue;
        if(this.environment?.isHazardFree?.(x,footY,r+4)===false)continue;
        return {x,y};
      }
    }
    return null;
  }
  _spawnEnemy(type, radius, angle) {
    const p=this.player,t=this._difficultyTime(),a=Number.isFinite(angle)?angle:rand(0,TAU);
    const halfW=Math.max(390,this.viewWidth*.5+65),halfH=Math.max(290,this.viewHeight*.5+65);
    const edge=1/Math.max(Math.abs(Math.cos(a))/halfW,Math.abs(Math.sin(a))/halfH);
    const distance=radius||edge;
    const definition=enemyDefinition(type),{r,baseSpeed:speed,damage,xp}=definition;
    const hp=this.easy?(definition.easyHp??definition.baseHp):definition.baseHp;
    // Radius 1 is the authored-encounter factory: its owner immediately sets a
    // prevalidated door/room/guardian position. Ordinary spawns must be offscreen.
    const islandSpawn=this.terrain.island&&radius!==1;
    const point=islandSpawn?this._findSpawnPoint(type,Number.isFinite(angle)?angle:undefined,radius):{x:p.x+Math.cos(a)*distance,y:p.y+Math.sin(a)*distance};
    if(!point)return null;
    const lateMinutes=Math.max(0,t-ENEMY_GROWTH.lateAfter)/ENEMY_GROWTH.minute,bossIndex=Math.max(1,this.bossCount);
    const endurance=Math.max(0,t-ENEMY_GROWTH.enduranceAfter)/ENEMY_GROWTH.minute;
    const health=hp*(type==='boss'?1+(bossIndex-1)*ENEMY_GROWTH.bossHealthLinear+sq(bossIndex-1)*ENEMY_GROWTH.bossHealthCurve:1+Math.min(t,ENEMY_GROWTH.healthTimeCap)*ENEMY_GROWTH.healthTimeGrowth+endurance*ENEMY_GROWTH.enduranceLinear+Math.pow(endurance,ENEMY_GROWTH.enduranceExponent)*ENEMY_GROWTH.enduranceCurve);
    const danger=type==='boss'?1+(bossIndex-1)*ENEMY_GROWTH.bossDamageGrowth:1+lateMinutes*ENEMY_GROWTH.damageLateGrowth;
    const enemy={id:++this._id,...point,r,hp:health,maxHp:health,type,hit:0,speed:speed*Math.min(ENEMY_GROWTH.speedMax,1+t*ENEMY_GROWTH.speedTimeGrowth)*(this.easy?ENEMY_GROWTH.easySpeedMultiplier:1),damage:damage*danger*(this.easy?ENEMY_GROWTH.easyDamageMultiplier:1),xp:Math.round(xp*(type==='boss'?1+(bossIndex-1)*ENEMY_GROWTH.bossXpGrowth:1+lateMinutes*ENEMY_GROWTH.xpLateGrowth)),bossIndex:type==='boss'?bossIndex:undefined,wave:this.wave,phase:rand(0,TAU),attackCooldown:0,slamCooldown:0,slamRecovery:0,slam:null,charge:null,chargeCooldown:ENEMY_GROWTH.initialChargeCooldown,cast:null,castCooldown:ENEMY_GROWTH.initialCastCooldown};
    if(!islandSpawn) {
      this._moveEntity(enemy,0,0);
      if(!radius)for(let i=0;i<6&&this._inView(enemy);i++) {
        enemy.x=p.x+Math.cos(a)*(distance+85*(i+1));enemy.y=p.y+Math.sin(a)*(distance+85*(i+1));
        this._moveEntity(enemy,0,0);
      }
    }
    initializeEnemyBehavior(enemy);
    this.enemies.push(enemy);return enemy;
  }
  _hitEnemy(enemy,amount,knockback=0,origin=this.player,source='arrow') {return this.combat.hit(enemy,amount,knockback,origin,source);}
  _hurtEnemy(enemy,amount,knockback=0,origin=this.player,source='raw') {return this.combat.applyEnemyDamage(enemy,amount,knockback,origin,source);}
  _rebuildGrid() {
    this._grid.clear();
    for(const e of this.enemies) if(e.hp>0) {
      const key=`${Math.floor(e.x/this._cell)},${Math.floor(e.y/this._cell)}`;
      if(!this._grid.has(key)) this._grid.set(key,[]);
      this._grid.get(key).push(e);
    }
  }
  _nearby(x,y,r=70) {
    const found=[];
    for(let i=Math.floor((x-r)/this._cell);i<=Math.floor((x+r)/this._cell);i++)
      for(let j=Math.floor((y-r)/this._cell);j<=Math.floor((y+r)/this._cell);j++) {
        const cell=this._grid.get(`${i},${j}`); if(cell) found.push(...cell);
      }
    return found;
  }
  _moveEntity(entity,dx,dy,isPlayer=false) {
    const offset=groundOffset(entity,isPlayer||entity.isCompanion),moved=this.terrain.moveCircle(entity.x,entity.y+offset,dx,dy,entity.r,movementProfile(entity));
    entity.x=moved.x;entity.y=moved.y-offset;return moved;
  }
  _moveEnemy(e,dt,target=null) {
    dt=Math.max(0,dt-(e._weaponPushTime||0));
    if(!(dt>0))return;
    const pursued=target?null:selectFriendlyTarget(this,e),point=pursued?friendlyFoot(pursued):target;
    const x=e.x,y=e.y+groundOffset(e,!!e.isCompanion),rawX=point.x,rawY=point.y;
    if(e._routeTerrain!==this.terrain){Object.defineProperty(e,'_routeTerrain',{value:this.terrain,writable:true,configurable:true,enumerable:false});e._navTimer=0;}
    e._routeTime=(e._routeTime||0)+dt;
    e._navTimer=(e._navTimer||0)-dt;
    if(e._navTimer<=0) {
      e._navTimer=.16+(e.id%4)*.025;e._coastTarget=null;e._routePoint=null;
      const island=this.terrain.island;
      // Bays interrupt a straight pursuit even with no solid tree in the way.
      // The island is star-shaped: a short inland waypoint keeps both legs on
      // land, and ordinary obstacle steering still handles trees along it.
      if(island&&!island.containsCapsule(x,y,rawX,rawY,e.r+3)) {
        for(const factor of [.85,.6,.3,0]) {
          const q={x:(x+rawX)*.5*factor,y:(y+rawY)*.5*factor};
          if(island.containsCapsule(x,y,q.x,q.y,e.r)&&island.containsCapsule(q.x,q.y,rawX,rawY,e.r)){e._coastTarget=q;break;}
        }
      }
      const tx=e._coastTarget?.x??rawX,ty=e._coastTarget?.y??rawY;
      const obstacle=this.terrain.firstBlocker(x,y,tx,ty,e.r+3,movementProfile(e));
      if(obstacle?.id!==e._navObstacle?.id)e._navSide=0;
      e._navObstacle=obstacle;
      if(obstacle)e._routePoint=terrainNavigation(this.terrain).waypoint(e,{x,y},{x:tx,y:ty},e.r+3,movementProfile(e),e._routeTime,this._clock);
      else e._terrainRoute=null;
    }
    const tx=e._routePoint?.x??e._coastTarget?.x??rawX,ty=e._routePoint?.y??e._coastTarget?.y??rawY,dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1;
    let nx=dx/d,ny=dy/d,detouring=!!e._routePoint;
    const obstacle=e._navObstacle;
    if(obstacle&&!e._routePoint) {
      const q=this.terrain.closestPoint(obstacle,x,y),ox=x-q.x,oy=y-q.y,od=Math.hypot(ox,oy)||1;
      const radius=obstacle.r+e.r+8;
      if(od<radius+80) {
        const outwardX=ox/od,outwardY=oy/od;
        if(!e._navSide) {
          const preference=-outwardY*nx+outwardX*ny;
          e._navSide=Math.abs(preference)>.08?Math.sign(preference):e.id%2?1:-1;
        }
        // Continuously advancing a tangent target carries enemies around both
        // circular trunks and a fallen trunk's end caps, instead of parking them.
        const lookahead=clamp(radius*.8,26,62);
        const wx=q.x+outwardX*radius-outwardY*e._navSide*lookahead;
        const wy=q.y+outwardY*radius+outwardX*e._navSide*lookahead;
        const wd=Math.hypot(wx-x,wy-y)||1;nx=(wx-x)/wd;ny=(wy-y)/wd;detouring=true;
      }
    }
    const definition=e.isCompanion?null:enemyDefinition(e.type);
    const wobble=!detouring&&definition?.wobble?Math.sin(this._clock*definition.wobble.frequency+e.phase)*definition.wobble.amplitude:0;
    const speed=e.speed*(definition?.surge&&e.movementSurge!==false?1+Math.max(0,Math.sin(this._clock*definition.surge.frequency))*definition.surge.amplitude:1)*(this.environment?.movementMultiplier(e,!!e.isCompanion)||1)*(this.elites?.movementMultiplier(e)||1)*this._branchMovementMultiplier(e);
    const travel=e._routePoint?Math.min(speed*dt,d):speed*dt;
    this._moveEntity(e,(nx-ny*wobble)*travel,(ny+nx*wobble)*travel);
    if(e._routePoint&&d<=speed*dt+6)e._navTimer=0;
    e._navProgressTimer=(e._navProgressTimer||0)+dt;
    if(e._navProgressTimer>.9) {
      if(detouring&&Number.isFinite(e._navProgressX)&&Math.hypot(e.x-e._navProgressX,e.y-e._navProgressY)<2)e._navSide*=-1;
      e._navProgressX=e.x;e._navProgressY=e.y;e._navProgressTimer=0;
    }
  }
  _updatePressure(dt=0) {
    if(this.debugOptions.allMonsters||this._worldExploration||(this.expedition&&!this.expedition.allowAmbient)){this.pressurePhase='steady';this.phaseEndsAt=this.time;return;}
    this.waveDirector.update(dt);
  }
  _hurtPlayer(amount,origin=null) {return this.combat.damagePlayer(amount,origin);}
  _updateBoss(e,dt) {return updateBoss(this,e,dt);}
  _resolveBossSlams() {resolveBossSlams(this);}
  _updateBoar(e,dt) {return updateBoar(this,e,dt);}
  _updateSpore(e,dt) {return updateSpore(this,e,dt);}
  _resolveEnemyAttacks(dt) {
    const p=this.player,px=p.x,py=p.y+groundOffset(p,true),targets=friendlyTargets(this);
    const context={targets,px,py,maxEnemyBullets:BALANCE.maxEnemyBullets};
    for(const e of this.enemies)if(e.hp>0&&e.guardActive!==false&&!this.abilities.isFrozen(e))resolveEnemyBehavior(this,e,context);
    for(const b of this.enemyBullets) {
      if(b.life<=0)continue;
      const elapsed=Math.min(dt,b.life),dx=b.vx*elapsed,dy=b.vy*elapsed;
      let terrainHit=Infinity;
      for(const o of this.terrain.query(Math.min(b.x,b.x+dx)-b.r,Math.min(b.y,b.y+dy)-b.r,Math.max(b.x,b.x+dx)+b.r,Math.max(b.y,b.y+dy)+b.r))
        if(blocksObstacle(o,'projectile'))terrainHit=Math.min(terrainHit,obstacleImpact(o,b.x,b.y,dx,dy,b.r));
      let victim=null,friendlyHit=Infinity;
      for(const target of targets){
        if(!isFriendlyActive(this,target))continue;
        const foot=friendlyFoot(target),hit=circleImpact(b.x,b.y,dx,dy,foot.x,foot.y,target.r+b.r);
        if(hit<friendlyHit){friendlyHit=hit;victim=target;}
      }
      if(victim&&friendlyHit<terrainHit){damageFriendly(this,victim,b.damage,b);b.life=0;}
      else if(terrainHit<Infinity)b.life=0;
      else{b.x+=dx;b.y+=dy;b.life-=elapsed;}
    }
    this.enemyBullets=this.enemyBullets.filter(b=>b.life>0);
  }

  _initializeRegionalBoss(boss,kind=null){const footY=boss.y+groundOffset(boss);initBoss(boss,kind);boss.y=footY-groundOffset(boss);}
  _clearRegionalBossAttacks(boss){boss.slam=null;boss.charge=null;boss.cast=null;boss._chargeSegment=null;clearBossAttacks(boss);}
  canEnterPortal(id) { return !this.dungeon.active&&this.regions.canEnter(id); }
  getInteraction() {
    if(this.status!=='playing')return null;
    if(!this.sceneContent.allows('worldContent'))return null;
    if(this.dungeon.active)return this.dungeon.getInteraction();
    const candidates=[];
    const settlement=this.settlements.getInteraction();if(settlement)candidates.push(settlement);
    const portal=this.regions.getInteraction();if(portal)candidates.push(portal);
    const relic=this.relicSites?.getInteraction();if(relic)candidates.push(relic);
    const rift=this.riftExploration?.getInteraction();if(rift)candidates.push(rift);
    const p=this.player,footY=p.y+groundOffset(p,true);
    return candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-footY)-Math.hypot(b.x-p.x,b.y-footY))[0]||null;
  }
  interact(id) {
    if(this.sceneTransition.active&&!this.sceneTransition.committing)return false;
    const interaction=this.getInteraction();
    if(!interaction||interaction.enabled===false||(id!==undefined&&id!==interaction.id))return false;
    if(this.dungeon.active)return this.dungeon.interact(interaction.id);
    if(interaction.category==='rift')return !!this.riftExploration?.interact(interaction.id);
    if(interaction.category==='relic'||interaction.type==='relic')return !!this.relicSites?.interact(interaction.id);
    return interaction.type==='portal'||interaction.type==='stageExit'?this.enterPortal(interaction.id):this.settlements.interact(interaction.id);
  }
  requestInteraction(id) {
    const interaction=this.getInteraction();
    if(!interaction||(id!==undefined&&id!==interaction.id))return false;
    return this.sceneTransition.request(interaction);
  }
  enterPortal(id) {
    if(this.sceneTransition.active&&!this.sceneTransition.committing)return false;
    if(!this.canEnterPortal(id))return false;
    const portal=this.regions._portal(id);
    if(portal.kind==='victory')return this.stage?.complete()??false;
    return this._switchRegion(portal);
  }
  getSuperChoices() {return this.superSkills.getChoices();}
  chooseSuper(id) {
    if(this.status!=='super')return false;
    const pending=this.superSkills.pending;
    if(!pending)return false;
    if(pending.source==='region'&&(!this.regions.rewardPortal||pending.regionId!==this.region.id))return false;
    if(pending.source==='castle'&&(!this.dungeon.active?.bossDefeated||!this.dungeon.active.rewardPending||this.dungeon.active.rewardClaimed))return false;
    if(!this.superSkills.choose(id))return false;
    this._refreshWeapons();
    if(pending.source==='region')this.regions.completeReward();
    else this.dungeon.completeReward();
    if(this.status==='super')this.status='playing';
    this._trySkillUpgrade();return true;
  }
  getShopItems(){return this.settlements.getShopItems();}
  buyShopItem(id){
    if(this.status!=='shop'||!this.settlements.buy(id))return false;
    this._trySkillUpgrade();return true;
  }
  closeShop(){
    if(this.status!=='shop')return false;
    const result=this.settlements.closeShop();this._trySkillUpgrade();return result!==false;
  }
  getRelicChoices() { return this.relics.getChoices(); }
  chooseRelic(id) {
    if(this.status!=='relic'||!this.relics.choose(id))return false;
    this.status='playing';this._trySkillUpgrade();return true;
  }
  _switchRegion(portal=this.portal) {
    if(!this.sceneContent.allows('worldContent'))return false;
    if(!portal||!Number.isInteger(portal.nextRegionIndex)||this.dungeon.active)return false;
    this.realms?.cancel('scene-change');
    const nextIsland=this.stage?this.stage.island(portal.nextMapId):null;
    if(this.stage&&!nextIsland)return false;
    const from=this.region.id,fromIndex=this.regionIndex,fromMapId=this.mapId,p=this.player;
    const furyTime=this.adventure?.furyTime||0,magnetTime=this.adventure?.magnetTime||0;
    // Clear only transient attacks. Persistent sites and surviving objective
    // guards remain in a suspended per-region snapshot for return journeys.
    for(const enemy of this.enemies){this._clearRegionalBossAttacks(enemy);enemy._groupProvokedUntil=0;enemy._navTimer=0;enemy._navObstacle=null;}
    this.territories?.suspend();
    this.superSkills.clearScene();this.barrier.clearScene();this.abilities.clearScene();this.regions.saveWorld();
    this.regionIndex=portal.nextRegionIndex;this.region=regionFor(this.regionIndex);this.worldId=this.region.id;this.portal=null;this.regions.portals=[];
    if(this.stage)this.stage.currentMapId=nextIsland.id;
    this.mapId=nextIsland?.id??this.regionIndex;
    this.status='playing';this.regionGrace=2;this.sceneKind='world';
    this.regionTransition={life:.7,maxLife:.7,name:nextIsland?.name??this.region.name,from,to:this.region.id};
    this.attacks.clearTrails();
    this.bullets=[];this.enemyBullets=[];this.effects=[];this.orbitals=[];this.storm=null;this._pulseEchoes=[];this._grid.clear();this._choices=null;
    this.events=this.events.filter(e=>e.type==='relicChosen'||e.type==='relicSupply'||e.type==='superChosen');
    this._spawn=2;this._shot=BALANCE.arrowInterval/(1+this.levels.rapid*.15);this._pulse=2.6;this._lightning=2.8;
    p.x=0;p.y=0;p.invuln=Math.max(p.invuln,2);p.hurtFlash=0;
    if(!this.regions.restoreWorld(this.mapId)) {
      const seed=nextIsland?.seed??this.regionIndex,generate=!this.stage?.isBossIsland;
      this.terrain=new Terrain({region:this.region.id,seed,island:new Island({region:this.region.id,seed,map:nextIsland})});this.enemies=[];this.gems=[];this.coins=[];
      this.environment=null;this.adventure=null;this.encounters=null;this.settlements=null;this.relicSites=null;this.riftExploration=null;this.discoveredMap=new Set();
      this.companions.camps=[];this.companions.generation=generate&&this._features.companions;this.companions.nextAt=this.time+35;
      this.dungeon.resetRegion();
      const worldSpawn=this.terrain.island?.layout?.spawn;
      if(worldSpawn){p.x=worldSpawn.x;p.y=worldSpawn.y-groundOffset(p,true);}
      this._moveEntity(p,0,0,true);
      if(this._features.environment)this.environment=new Environment(this,{generation:generate});
      if(this._features.adventure)this.adventure=new Adventure(this,{generation:generate});
      if(generate&&this._features.encounters)this.encounters=new Encounters(this);
      this.settlements=new Settlements(this,{generation:generate&&this._features.settlements});
      this.regions.initialize(portal,fromIndex);
      this.riftExploration=new RiftExploration(this);
      this.relicSites=new RelicSites(this,{generation:!!(generate&&this._features.adventure&&(this._features.encounters||this._features.companions))});
      this.territories=new MonsterTerritories(this);
    }
    if(this.adventure){this.adventure.furyTime=furyTime;this.adventure.magnetTime=magnetTime;}
    const arrival=this.regions.portals.find(candidate=>candidate.id===portal.targetPortalId)||this.regions.portals.find(candidate=>this.stage?candidate.nextMapId===fromMapId:candidate.nextRegionIndex===fromIndex);
    if(arrival) {
      // Land just in front of the paired gate, never at a different region's
      // coordinates. The interaction latch prevents an immediate bounce back.
      const point=this.regions.arrivalPoint(arrival,p.r);
      if(point){p.x=point.x;p.y=point.y-groundOffset(p,true);}
    }
    this._moveEntity(p,0,0,true);resetLocomotion(p);
    this._islandWorlds=!!this.terrain.island;
    // A paired gate can be kilometres from the world origin. Populate its
    // visible scene during the fade cut without advancing any hazard timers.
    if(this.environment?.generation)this.environment._refresh(true);
    if(this.environment?.mechanisms.generation)this.environment.mechanisms._refresh(true);
    if(this.environment?.worldHazards?.generation)this.environment.worldHazards._refresh(true);
    if(this.adventure?.generation)this.adventure._refreshSupplies(true);
    this.companions.onSceneChange?.(arrival?{doorway:portalDoor(arrival),direction:arrival.arrivalDirection||{x:0,y:1}}:null);
    this.waveDirector.reset();this.settlements.ensureAngels?.();this._refreshStats();this._refreshWeapons();
    this._emit('regionEnter',{regionId:this.region.id,name:nextIsland?.name??this.region.name,regionIndex:this.regionIndex,mapId:this.mapId});return true;
  }

  update(dt,input={}) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    if(this.status==='dead'){this.story?.cleanup('death');this.realms?.cancel('death');return;}
    if(this.sceneTransition.active){this.sceneTransition.update(dt);return;}
    if(this.story?.dialogueBlocking){this.story.update(dt);return;}
    this.regions.flushReward();
    if(this.status!=='playing') return;
    const interact=!!input.interact,pressed=interact&&!this._interactHeld;this._interactHeld=interact;
    if(pressed&&this.requestInteraction())return;
    const p=this.player;
    const inDungeon=!!this.dungeon.active;
    if(!inDungeon)this.time+=dt;this.runTime+=dt;this._clock+=dt;
    this.story?.update(dt);
    if(this.story?.dialogueBlocking)return;
    if(!this.story?.active)this.realms?.update(dt);
    if(this.status!=='playing')return;
    this.regionGrace=Math.max(0,this.regionGrace-dt);
    if(this.regionTransition){this.regionTransition.life-=dt;if(this.regionTransition.life<=0)this.regionTransition=null;}
    this.relics.update(dt);
    this.barrier.update(dt);
    if(!inDungeon&&this.sceneContent.allows('worldContent')){this.expedition?.update(dt);if(this.status!=='playing')return;this.regions.update(dt);this.territories?.update(dt);this._updatePressure(dt);}
    p.invuln=Math.max(0,p.invuln-dt); p.skillCooldown=this.debugOptions.zeroStormCooldown?0:Math.max(0,p.skillCooldown-dt);
    p.hurtFlash=Math.max(0,(p.hurtFlash||0)-dt);
    p.hurtFace=Math.max(0,(p.hurtFace||0)-dt);p.castFace=Math.max(0,(p.castFace||0)-dt);
    if(this.sceneContent.allows('worldContent'))this.environment?.update(dt);
    if(this.status==='dead')return;
    if(this.storm) { this.storm.life-=dt; if(this.storm.life<=0) this.storm=null; }
    let ix=Number.isFinite(input.x)?input.x:0,iy=Number.isFinite(input.y)?input.y:0;
    const length=Math.hypot(ix,iy); if(length>1) { ix/=length; iy/=length; }
    if(length>.01) p.facing=Math.atan2(iy,ix);
    const movement=(this.environment?.movementMultiplier(p,true)||1)*this.abilities.movementMultiplier(p);
    const oldX=p.x,oldY=p.y;
    this._moveEntity(p,ix*p.speed*movement*dt,iy*p.speed*movement*dt,true);
    updateLocomotion(p,oldX,oldY,dt);
    if(p.moving)p.moveFacing=Math.atan2(p.y-oldY,p.x-oldX);
    this.story?.updateActors?.(dt);
    if(this.sceneContent.allows('worldContent')&&this.touchInteractions.update())return;
    if(this.sceneContent.allows('worldContent'))this.adventure?.update(dt);
    if(this.sceneContent.allows('worldContent'))this.companions.update(dt);
    if(!inDungeon&&this.sceneContent.allows('worldContent')){this.encounters?.update(dt);this.settlements.update(dt);this.relicSites?.update(dt);}
    else if(inDungeon)this.dungeon.update(dt);
    const regen=resolveCharacterStats(this).regen;if(regen)p.hp=Math.min(p.maxHp,p.hp+regen*dt);
    if(!inDungeon)this._spawn-=dt;
    updateDebugMonsterStream(this,dt);
    if(this.sceneContent.allows('worldContent')&&!this._worldExploration&&(!this.expedition||this.expedition.allowAmbient)&&!this.debugOptions.allMonsters&&!inDungeon&&!this.stage?.isBossIsland&&this._spawn<=0&&this.regionGrace<=0&&this.pressurePhase==='steady') {
      // The authored cohort owns assault pressure. Exploration is lighter,
      // and a Boss gets space for its own readable attacks.
      const bossActive=this.enemies.some(e=>e.type==='boss'&&!e.debugBoss&&e.hp>0&&e.guardActive!==false);
      const rate=Math.min(EXPLORATION_SPAWN.maxRate,BALANCE.spawnBase+this._difficultyTime()*EXPLORATION_SPAWN.timeGrowth)*(this.easy?EXPLORATION_SPAWN.easyMultiplier:1)*(bossActive?EXPLORATION_SPAWN.bossMultiplier:1);
      this._spawn=1/rate;
      if(this.enemies.length<EXPLORATION_SPAWN.enemyLimit) {
        const enemy=this._spawnEnemy(regionEnemyType(this,Math.random()));
        if(enemy)this.elites.maybePromote(enemy);
      }
    }
    if(this.sceneContent.allows('worldContent')&&!this._worldExploration&&!this.expedition&&!inDungeon&&!this.stage&&!this.regions.guarded&&(!this.portal||this.portal.state==='locked')&&this.regionGrace<=0&&this.time>=this.nextBossAt && !this.enemies.some(e=>e.type==='boss'&&!e.debugBoss&&e.hp>0)) {
      this.bossSpawned=true; this.bossDefeated=false; this.bossCount++;
      this.nextBossAt=this.time+BALANCE.bossInterval;
      this._spawnEnemy('boss'); this._emit('boss');
    }
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      e.hit=Math.max(0,e.hit-dt); e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      e._weaponPushTime=updateWeaponKnockback(this,e,dt);
      if(!e.trainingDummy&&usesEnemyLocomotion(e)){e._walkStartX=e.x;e._walkStartY=e.y;}
      if(e.trainingDummy||this.abilities.isFrozen(e))continue;
      if(this.story?.active&&this.story.beforeEnemy(e,dt))continue;
      if(inDungeon&&this.dungeon.updateEnemy(e,dt))continue;
      if(!inDungeon&&this.regions.updateEnemy(e,dt))continue;
      if(!inDungeon&&this.territories?.updateEnemy(e,dt))continue;
      if(this.companions.updateEnemy(e,dt))continue;
      if(this.elites.updateEnemy(e,dt))continue;
      if(this.encounters?.updateEnemy(e,dt))continue;
      if(e.guardActive===false) {
        e.charge=null;e.cast=null;e._chargeSegment=null;e.specialist=null;
        if(e.guardReturnTarget)this._moveEnemy(e,dt,e.guardReturnTarget);
        continue;
      }
      const handled=updateEnemyBehavior(this,e,dt);
      if(!handled)this._moveEnemy(e,dt);
    }
    this._rebuildGrid();
    // Soft separation keeps the horde readable while preserving dense swarms.
    for(const e of this.enemies) {
      if(e.hp<=0) continue;
      let count=0;
      for(const n of this._nearby(e.x,e.y,48)) {
        if(n.id<=e.id || count++>8) continue;
        const dx=e.x-n.x,dy=e.y-n.y,d=Math.hypot(dx,dy),overlap=(e.r+n.r)*.76-d;
        if(overlap>0 && d>.1) {
          const force=Math.min(overlap,30*dt)*.5;
          if(e.type!=='boss'&&!e.trainingDummy&&!e.charge&&e.guardActive!==false&&!this.abilities.isFrozen(e))this._moveEntity(e,dx/d*force,dy/d*force);
          if(n.type!=='boss'&&!n.trainingDummy&&!n.charge&&n.guardActive!==false&&!this.abilities.isFrozen(n))this._moveEntity(n,-dx/d*force,-dy/d*force);
        }
      }
    }
    // Sample resolved movement after collisions. Knockback displacement was
    // excluded at the start; airborne attacks and frozen bodies never step.
    for(const e of this.enemies)if(e.hp>0&&!e.trainingDummy&&usesEnemyLocomotion(e)){
      const oldX=e._walkStartX??e.x,oldY=e._walkStartY??e.y;
      updateEnemyLocomotion(e,oldX,oldY,dt,this.abilities.isFrozen(e));
    }
    if(input.skill && p.skillCooldown<=0&&!this.abilities.isFrozen(p)) this._castStorm();
    for(const target of friendlyTargets(this)){
      if(!isFriendlyActive(this,target)||target.invuln>0)continue;
      const foot=friendlyFoot(target);
      for(const e of this._nearby(target.x,target.y,85)) {
        if(e.hp<=0||e.trainingDummy||e.eventRole==='treasure'||e.guardActive===false||e.charge||e._chargeSegment||e.slam||e.slamRecovery>0||e.bloomAttack||e.bloomRecovery>0||e.specialist?.noContact||e.specialAttack||e.specialRecovery>0||this.abilities.isFrozen(e))continue;
        if(!isGrounded(target)&&isGrounded(e))continue;
        const enemyFoot=friendlyFoot(e);
        if((foot.x-enemyFoot.x)**2+(foot.y-enemyFoot.y)**2<sq(target.r+e.r-3)&&clearFriendlyPath(this,e,target,movementProfile(e))){
          damageFriendly(this,target,e.damage,e);
          if(this.status==='dead')return;
          if(target.invuln>0||!isFriendlyActive(this,target))break;
        }
      }
    }
    this.attacks.updateBasic(dt);
    this._updateWeapons(dt);
    this._updateGeneralSkills(dt);
    this.superSkills.update(dt);
    this.combatStatus.update(dt);
    this.abilities.update(dt);
    if(this.status==='dead')return;
    this.companions.resolve();
    this.elites.resolve();
    // Every weapon can interrupt a windup with a killing blow on this frame.
    this._resolveBossSlams();
    resolveBossPhase(this,'ranged');
    this._resolveEnemyAttacks(dt);
    if(this.status==='dead')return;
    this.enemies=this.enemies.filter(e=>e.hp>0 && (e.trainingDummy||e.type==='boss'||e.dungeonId||e.territoryId||e.expeditionId||e.elite||e.guardianId||e.eventId||e.rescueId||dist2(e,p)<sq(Math.max(this.viewWidth,this.viewHeight)*1.5+400)));
    this._collectDrops(this.gems,dt,'crystals');
    this._collectDrops(this.coins,dt,'gold');
    this.gems=this.gems.filter(g=>g.value>0);this.coins=this.coins.filter(c=>c.value>0);
    for(const e of this.effects) {e.life-=dt;if(e.type==='damage'||e.type==='heal')e.y-=dt*(e.riseSpeed??26);}
    this.effects=this.effects.filter(e=>e.life>0);
    this.regions.flushReward();this._trySkillUpgrade();
  }

  _updateArrow(b,dt) {return this.attacks.updateArrow(b,dt);}
  _branchMovementMultiplier(enemy) {
    return (enemy.type!=='boss'&&!enemy.isCompanion&&(enemy.branchSlowUntil||0)>this._clock ? COMBAT_RULES.skillRules.pulse.controlMoveMultiplier : 1)*(this.superSkills?.movementMultiplier(enemy)??1)*(this.abilities?.movementMultiplier(enemy)??1);
  }

  _updateGeneralSkills(dt) {
    if(this.abilities.isFrozen(this.player))return;
    for(const id of ['fireball','frostbolt']) {
      if(!(this.levels[id]>0))continue;
      this._abilityCooldowns[id]-=dt;
      if(this._abilityCooldowns[id]>0)continue;
      const stats=skillStats(this,id),p=this.player;
      const target=this._nearest(p.x,p.y,stats.acquisitionRange,undefined,p,{source:id});
      if(target&&this.abilities.cast(id,p,{...stats,target,rank:stats.level}))this._abilityCooldowns[id]=stats.cooldown;
      else this._abilityCooldowns[id]=.12;
    }
  }

  _updateWeapons(dt) {return this.attacks.updateAbilities(dt);}
  _castPulse(...args) {return this.attacks.castPulse(...args);}
  _syncEvolutions(announce=false) {
    for(const id of Object.keys(EVOLUTIONS)) {
      const definition=branchDefinition(id,this.branches[id]);
      const evolved=this.levels[id]>=5&&(id==='orbit'||!!definition),previous=this.evolutions[id];
      this.evolutions[id]=evolved;
      if(evolved&&!previous) {
        if(id==='orbit')this._orbitEvolutionStartedAt=this._clock;
        if(announce)this._emit('evolution',{weaponId:id,branch:this.branches[id]||null,name:definition?.name||EVOLUTIONS[id].name});
      }
    }
  }
  _refreshStats() {
    const resolved=resolveCharacterStats(this);
    Object.assign(this.stats,resolved,{damage:resolved.damageMultiplier,moveSpeed:resolved.moveSpeed/HERO_DEFAULTS.baseMoveSpeed});
    this.player.speed=resolved.moveSpeed;this.player.attack=resolved.attack;this.player.defense=resolved.defense;
    this.player.skillCooldownMax=resolved.stormCooldown;
    this.player.skillCooldown=Math.min(this.player.skillCooldown,resolved.stormCooldown);
  }
  _refreshWeapons() {
    this.weapons=this.build.getWeaponLoadout();this.skills=this.build.getSkillLoadout();
  }
  setWeaponEquipped(id,equipped) {
    if(this.status!=='playing'||typeof equipped!=='boolean'||!this.build.getWeapon(id)?.acquired)return false;
    if(!equipped&&this.build.isEquipped(id)&&this.weapons.filter(weapon=>this.build.isEquipped(weapon.id)).length<=1)return false;
    if(!this.build.setEquipped(id,equipped))return false;
    if(!equipped) {
      if(id==='sword')this.attacks.sword.clearScene();
      if(id==='arrow')this.bullets=this.bullets.filter(b=>b.weaponId&&b.weaponId!=='arrow');
      if(id==='orbit'){this.orbitals=[];this.attacks.clearOrbit();}
    }
    this._refreshStats();this._refreshWeapons();return true;
  }
  addExperience(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.player.xp+=Math.floor(amount);this._levelUp();return true;
  }
  _levelUp() {
    const p=this.player;let gained=0;
    while(p.xp>=p.xpNext&&this.realms?.canLevelUp()!==false) {
      const previousMax=p.maxHp;
      p.xp-=p.xpNext;p.level++;p.xpNext=xpCost(p.level);
      p.hp=Math.min(p.maxHp,p.hp+Math.max(0,p.maxHp-previousMax));gained++;
    }
    this.realms?.capExperience();
    if(!gained)return false;
    this._refreshStats();this._emit('level',{level:p.level,gained});
    this._effect(p.x,p.y,'ring',.6,75,'#eee0a3');return true;
  }
  addCrystals(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.crystals+=Math.floor(amount);return true;
  }
  addGold(amount) {
    if(!Number.isFinite(amount)||amount<=0)return false;
    this.gold+=Math.floor(amount);return true;
  }
  grantResources({gold=0,crystals=0}={},source='reward') {
    const addedGold=this.addGold(gold),addedCrystals=this.addCrystals(crystals);
    if(addedGold||addedCrystals)this._emit('resources',{source,gold:addedGold?Math.floor(gold):0,crystals:addedCrystals?Math.floor(crystals):0});
    return addedGold||addedCrystals;
  }
  _dropResource(list,x,y,value,r) {
    if(!Number.isFinite(value)||value<=0||!Number.isFinite(x)||!Number.isFinite(y))return null;
    const drop={x,y,r,value:Math.floor(value)};list.push(drop);
    // Bounded loot, conserved value. Merge oldest with its nearest neighbour
    // without moving it toward the player or creating extra reward value.
    const cap=list===this.coins?120:500;
    while(list.length>cap) {
      const first=list.shift();let nearest=null,best=Infinity;
      for(const other of list){const d=dist2(first,other);if(d<best){best=d;nearest=other;}}
      if(nearest){nearest.value+=first.value;nearest.r=Math.min(9,nearest.r+.2);}
    }
    return drop;
  }
  dropCrystals(x,y,value){return this._dropResource(this.gems,x,y,value,value>=60?9:value>=13?7:5);}
  dropGold(x,y,value){return this._dropResource(this.coins,x,y,value,6);}
  _collectDrops(drops,dt,kind) {
    const p=this.player;
    for(const drop of drops) {
      const dx=p.x-drop.x,dy=p.y-drop.y,d=Math.hypot(dx,dy);
      if(d<(this.adventure?.magnetRange(this.stats.magnet)??this.stats.magnet)||drop.attracted) {
        drop.attracted=true;const pull=Math.min(d,(340+Math.max(0,150-d)*5)*dt);
        if(d>0){drop.x+=dx/d*pull;drop.y+=dy/d*pull;}
      }
      if(d<22){if(kind==='gold')this.addGold(drop.value);else this.addCrystals(drop.value);drop.value=0;}
    }
  }
  _trySkillUpgrade() {return this.story?.suppressChoices||this.realms?.active?false:this.progression.tryUpgrade();}
  getUpgradeChoices() {return this.progression.getChoices();}
  chooseUpgrade(id) {return this.progression.choose(id);}
}
