import { getConfigSection } from './content-config.js';
import { WAVE_PATTERNS, SPECIAL_ENEMY_CAPS, waveEnemyType, cappedEncounterType } from './encounter-definitions.js';
import { optionalFightNearby } from './event-scheduling.js';

// Small, finite attacks give the player an approach to read, a group to defeat,
// and a genuine pause. Ordinary exploration spawns remain owned by Game.
const content=getConfigSection('encounters');
export const WAVE_RULES=Object.freeze({...content.waveRules,boarCap:SPECIAL_ENEMY_CAPS.boar,sporeCap:SPECIAL_ENEMY_CAPS.spore});
const DIRECTIONS=content.waveDirections;
const PATTERNS=WAVE_PATTERNS.map(pattern=>pattern.name);

export class WaveDirector {
  constructor(game) {
    this.game=game;this.count=0;this.members=new Set();this.killed=new Set();
    this.reset();
  }
  reset() {
    this.members.clear();this.killed.clear();this.total=0;this.spawned=0;
    this.pattern=0;this.direction=DIRECTIONS[this.count%DIRECTIONS.length];this.cleared=false;this.timedOut=false;
    this.blocked=false;this._spawnUntil=0;this._nextBatchAt=0;this._batchSize=0;
    this._setPhase('steady',this.count?WAVE_RULES.exploration:WAVE_RULES.initialRest);
  }
  _setPhase(phase,duration) {
    this.game.pressurePhase=phase;this.game.phaseEndsAt=this.game.time+duration;
  }
  _bossBlocks() {
    const g=this.game;
    return g.enemies.some(e=>e.type==='boss'&&!e.debugBoss&&e.hp>0&&e.guardActive!==false)||
      (!g.regions?.guarded&&(!g.portal||g.portal.state==='locked')&&Number.isFinite(g.nextBossAt)&&(g.nextBossAt<=g.time||
        (g.pressurePhase==='steady'&&g.nextBossAt-g.time<WAVE_RULES.warning+WAVE_RULES.attackLimit+WAVE_RULES.bossWarningPadding)));
  }
  _warn() {
    const g=this.game;
    const start=this.count%DIRECTIONS.length;
    const available=Array.from({length:DIRECTIONS.length},(_,i)=>DIRECTIONS[(start+i)%DIRECTIONS.length]);
    const direction=!g.terrain?.island?available[0]:available.find(d=>WAVE_RULES.probeAngles.some(spread=>g._findSpawnPoint?.('brute',d.angle+spread)));
    if(!direction){this._setPhase('steady',WAVE_RULES.blockedRetry);return;}
    this.count++;g.wave=this.count;this.pattern=(this.count-1)%PATTERNS.length;
    this.direction=direction;
    const tier=g._waveTier?.(),growth=tier==null?(this.count-1)*WAVE_RULES.waveSizeStep:tier*WAVE_RULES.tierSizeStep;
    this.total=Math.max(1,Math.round(Math.min(WAVE_RULES.maxWaveSize,WAVE_RULES.firstWaveSize+growth)*(g.easy?WAVE_RULES.easySizeMultiplier:1)));
    this.spawned=0;this.members.clear();this.killed.clear();this.cleared=false;this.timedOut=false;
    this._setPhase('warning',WAVE_RULES.warning);
    g._emit?.('wave',{wave:this.count,name:PATTERNS[this.pattern],direction:this.direction.id,directionLabel:this.direction.label,total:this.total});
  }
  _attack() {
    const g=this.game;
    this._setPhase('siege',WAVE_RULES.attackLimit);
    this._spawnUntil=g.time+WAVE_RULES.spawnWindow;
    // Six modest batches, normally complete after six seconds. A blocked batch
    // retries only within the same eight-second budget, never all in one frame.
    this._batchSize=Math.ceil(this.total/WAVE_RULES.batches);this._nextBatchAt=g.time;
    g._emit?.('siege',{wave:this.count,direction:this.direction.id,directionLabel:this.direction.label});
  }
  _type(index) {
    const g=this.game;return waveEnemyType(this.pattern,index,g._difficultyTime?.()??g.time);
  }
  _spawnBatch() {
    const g=this.game;
    this._nextBatchAt=g.time+WAVE_RULES.batchInterval;
    for(let i=0;i<this._batchSize&&this.spawned<this.total&&g.enemies.length<WAVE_RULES.maxEnemies;i++) {
      let type=this._type(this.spawned);
      if(SPECIAL_ENEMY_CAPS[type]!=null)type=cappedEncounterType(type,{[type]:g.enemies.filter(e=>e.type===type&&e.hp>0).length},'wave');
      // Alternate ranks across a 69-degree entry corridor. The opposite side
      // stays open instead of surrounding the player with a random ring.
      const slot=(this.spawned*WAVE_RULES.entryStride)%WAVE_RULES.entrySlots,spread=(slot-(WAVE_RULES.entrySlots-1)/2)*WAVE_RULES.entryAngleStep;
      let enemy=g._spawnEnemy(type,undefined,this.direction.angle+spread);
      if(!enemy&&g.terrain?.island)for(const alternate of WAVE_RULES.alternateAngles) {
        enemy=g._spawnEnemy(type,undefined,this.direction.angle+alternate);if(enemy)break;
      }
      if(!enemy||enemy.id==null)break;
      enemy.pressureWave=this.count;this.members.add(enemy.id);this.spawned++;
    }
  }
  _attractLoot() {
    const g=this.game,p=g.player,r2=WAVE_RULES.lootRadius**2;
    for(const drop of [...(g.gems||[]),...(g.coins||[])]) {
      if(drop.value>0&&(drop.x-p.x)**2+(drop.y-p.y)**2<=r2)drop.attracted=true;
    }
  }
  _relief(cleared) {
    const g=this.game;
    this.cleared=cleared;this.timedOut=!cleared;
    this._setPhase('relief',cleared?WAVE_RULES.clearRest:WAVE_RULES.escapeRest);
    // The collection window is useful even when the player chose to escape.
    // Only actual defeat of every planned member earns the extra reward.
    this._attractLoot();
    if(cleared) {
      const crystals=Math.min(WAVE_RULES.rewardCrystalsMax,WAVE_RULES.rewardCrystalsBase+Math.floor((this.count-1)/WAVE_RULES.rewardWaveStep)*WAVE_RULES.rewardCrystalsStep);
      g.addCrystals(crystals);g._emit?.('waveCleared',{wave:this.count,crystals});
    }
    g._emit?.('relief',{wave:this.count,cleared});
  }
  onEnemyKilled(enemy) {
    if(this.game.pressurePhase==='siege'&&enemy?.hp<=0&&this.members.has(enemy.id))this.killed.add(enemy.id);
  }
  update(dt=0) {
    const g=this.game;
    if(g.stage?.isBossIsland){this._setPhase('steady',WAVE_RULES.exploration);return;}
    // The overworld clock freezes inside a castle, and its surviving wave is
    // restored on exit. The brief exit grace pauses that wave rather than
    // cancelling earned progress. Region changes explicitly call reset().
    if(g.regionGrace>0) {
      const pause=Number.isFinite(dt)?Math.max(0,dt):0;
      g.phaseEndsAt+=pause;this._spawnUntil+=pause;this._nextBatchAt+=pause;return;
    }
    if(this._bossBlocks()) {
      if(!this.blocked) {
        this.members.clear();this.killed.clear();this.total=0;this.spawned=0;this.cleared=false;this.timedOut=false;
      }
      this.blocked=true;this._setPhase('steady',WAVE_RULES.exploration);return;
    }
    if(this.blocked) {this.blocked=false;this._setPhase('steady',WAVE_RULES.exploration);return;}
    if(g.pressurePhase==='steady') {
      if(g.time>=g.phaseEndsAt) {
        if(optionalFightNearby(g))this._setPhase('steady',WAVE_RULES.blockedRetry);
        else this._warn();
      }
      return;
    }
    if(g.pressurePhase==='warning') {
      if(g.time>=g.phaseEndsAt)this._attack();
      return;
    }
    if(g.pressurePhase==='siege') {
      if(this.spawned===this.total&&this.killed.size===this.total) {this._relief(true);return;}
      if(g.time>=g.phaseEndsAt) {this._relief(false);return;}
      if(this.spawned<this.total&&g.time<=this._spawnUntil&&g.time>=this._nextBatchAt)this._spawnBatch();
      return;
    }
    if(g.pressurePhase==='relief') {
      this._attractLoot();
      if(g.time>=g.phaseEndsAt)this._setPhase('steady',WAVE_RULES.exploration);
    }
  }
  summary() {
    return {name:PATTERNS[this.pattern],direction:this.direction.angle,directionId:this.direction.id,directionLabel:this.direction.label,
      remaining:Math.max(0,this.total-this.killed.size),total:this.total,phase:this.game.pressurePhase,
      seconds:Math.max(0,Math.ceil(this.game.phaseEndsAt-this.game.time)),cleared:this.cleared,timedOut:this.timedOut};
  }
}
