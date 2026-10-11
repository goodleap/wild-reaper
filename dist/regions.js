import { groundOffset } from './terrain.js';

export const REGIONS=Object.freeze([
  Object.freeze({id:'forest',name:'低语之森',shortName:'密林',colors:{ground:'#263e30',light:'#35503a',dark:'#182b22',accent:'#a9d991',mist:'#c1d6a9',grass:'#648052',stone:'#788170'},enemyWeights:{slime:1,beetle:1,bat:1,brute:1,boar:1,spore:1}}),
  Object.freeze({id:'marsh',name:'迷雾沼泽',shortName:'沼泽',colors:{ground:'#253c3d',light:'#36504c',dark:'#192d31',accent:'#a0d0c4',mist:'#bbd5d2',grass:'#64877b',stone:'#708c85'},enemyWeights:{slime:1.25,beetle:.8,bat:.7,brute:1.1,boar:.85,spore:1.7}}),
  Object.freeze({id:'ruins',name:'失落遗迹',shortName:'遗迹',colors:{ground:'#41413a',light:'#555345',dark:'#2b302e',accent:'#dbc891',mist:'#dbd2b4',grass:'#858467',stone:'#a09b82'},enemyWeights:{slime:.8,beetle:1.45,bat:.8,brute:1.45,boar:.9,spore:.8}})
]);
export const regionFor=(index)=>REGIONS[((index%REGIONS.length)+REGIONS.length)%REGIONS.length];

// Keep the old forest probabilities and population cap. Other regions change
// the mix of ordinary spawns, never the frequency or unlock time.
export function regionEnemyType(game,roll) {
  const t=game.time,late=Math.max(0,t-150)/60;
  const brute=t>60?Math.min(.15,.07+late*.006):0;
  const bat=t>23?Math.min(.8,.35+late*.033):0;
  const beetle=t>12?Math.max(.65,Math.min(.8,.35+late*.033)+.1):0;
  const boar=t>=30&&game.enemies.filter(e=>e.type==='boar'&&e.hp>0).length<5?.06:0;
  const spore=t>=45&&game.enemies.filter(e=>e.type==='spore'&&e.hp>0).length<4?.05:0;
  if(game.region.id==='forest') {
    let type=roll<brute?'brute':roll<bat?'bat':roll<beetle?'beetle':'slime';
    if(boar&&roll>.89&&roll<=.95)type='boar';
    else if(spore&&roll>.95)type='spore';
    return type;
  }
  const weights={brute,bat:Math.max(0,bat-brute),beetle:Math.max(0,beetle-bat),slime:Math.max(.01,1-beetle-boar-spore),boar,spore};
  let total=0;for(const type of Object.keys(weights)){weights[type]*=game.region.enemyWeights[type];total+=weights[type];}
  let cursor=roll*total;
  for(const [type,weight] of Object.entries(weights)){cursor-=weight;if(cursor<0)return type;}
  return 'slime';
}

export class Regions {
  constructor(game){this.game=game;this._lastBossId=null;}
  _safePoint(enemy) {
    const g=this.game,center={x:enemy.x,y:enemy.y+groundOffset(enemy)},p=g.player;
    const safe=(x,y)=>g.terrain.isFree(x,y,36)&&g.environment?.isHazardFree?.(x,y,45)!==false&&
      !g.environment?.props.some(o=>Math.hypot(o.x-x,o.y-y)<(o.blastRadius||82)+45)&&
      !g.adventure?.props.some(o=>Math.hypot(o.x-x,o.y-y)<65)&&
      (!g.adventure?.treasure||Math.hypot(g.adventure.treasure.x-x,g.adventure.treasure.y-y)>100);
    for(const origin of [center,{x:p.x,y:p.y+groundOffset(p,true)}]) {
      for(const radius of [90,150,220,300,400])for(let i=0;i<16;i++) {
        const a=i*Math.PI/8,x=origin.x+Math.cos(a)*radius,y=origin.y+Math.sin(a)*radius;
        if(safe(x,y))return {x,y};
      }
    }
    // The player's foot point is always reachable even in a deliberately
    // crowded fixture; activation still requires an explicit interaction.
    return {x:p.x,y:p.y+groundOffset(p,true)};
  }
  openPortal(enemy) {
    if(enemy.type!=='boss'||enemy.hp>0||enemy.id===this._lastBossId)return null;
    this._lastBossId=enemy.id;
    const g=this.game,nextRegionIndex=g.regionIndex+1,nextRegion=regionFor(nextRegionIndex);
    g.portal={id:`portal:${enemy.id}`,...this._safePoint(enemy),r:32,interactRadius:70,nextRegion,nextRegionIndex};
    g.relics.offer();
    g._emit('portalOpened',{nextRegionId:nextRegion.id,name:nextRegion.name});
    return g.portal;
  }
  canEnter() {
    const g=this.game,p=g.player,portal=g.portal;
    return !!(portal&&portal.nextRegionIndex===g.regionIndex+1&&g.status==='playing'&&
      !g.enemies.some(e=>e.type==='boss'&&e.hp>0)&&
      Math.hypot(p.x-portal.x,p.y+groundOffset(p,true)-portal.y)<=portal.interactRadius);
  }
}
