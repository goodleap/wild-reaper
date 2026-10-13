import { skillStats } from './combat-stats.js';

// Timers belong to the run, while capacity is captured once per activation.
// Refreshing stats or crossing an entrance must never refill an active shield.
export class GuardianBarrier {
  constructor(game) {
    this.game=game;
    this.cooldown=0;this.remaining=0;this.life=0;this._capacity=0;
  }

  get active(){return this.life>0&&this.remaining>0;}
  get ready(){return !!skillStats(this.game,'barrier')?.owned&&this.cooldown<=0&&!this.active;}
  get capacity(){return this.active?this._capacity:skillStats(this.game,'barrier')?.capacity||0;}

  snapshot() {
    const stats=skillStats(this.game,'barrier');
    return {owned:!!stats?.owned,level:stats?.level||0,ready:this.ready,active:this.active,
      cooldown:this.cooldown,cooldownMax:stats?.cooldown||0,remaining:this.remaining,capacity:this.capacity,
      life:this.life,duration:stats?.duration||0};
  }

  update(dt) {
    if(this.game.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.life=Math.max(0,this.life-dt);
    if(this.life===0){this.remaining=0;this._capacity=0;}
  }

  clearScene() {
    this.remaining=0;this.life=0;this._capacity=0;
  }

  absorbDamage(amount) {
    const g=this.game;
    if(g.status!=='playing'||!Number.isFinite(amount)||amount<=0)return amount;
    if(!this.active) {
      const stats=skillStats(g,'barrier');
      if(!stats?.owned||this.cooldown>0||!(stats.capacity>0))return amount;
      this._capacity=stats.capacity;this.remaining=stats.capacity;
      this.life=stats.duration;this.cooldown=stats.cooldown;
      g._effect?.(g.player.x,g.player.y,'barrierTrigger',.42,38,'#b9e6df');
      g._emit?.('barrierTriggered',{capacity:this._capacity});
    }
    const absorbed=Math.min(amount,this.remaining);
    this.remaining=Math.max(0,this.remaining-absorbed);
    if(this.remaining===0) {
      this.life=0;
      g._effect?.(g.player.x,g.player.y,'barrierBreak',.3,38,'#b9e6df');
      g._emit?.('barrierBroken');
    }
    return Math.max(0,amount-absorbed);
  }
}
