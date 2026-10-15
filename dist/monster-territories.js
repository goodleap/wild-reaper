import { getConfigSection } from './content-config.js';
import { groundOffset } from './terrain.js';
import { ordinaryEnemyType } from './encounter-definitions.js';
import { enemyDefinition } from './enemy-definitions.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=enemy=>({x:enemy.x,y:enemy.y+groundOffset(enemy)});
const hash=n=>{const value=Math.sin(n*127.1+41.7)*43758.5453;return value-Math.floor(value);};
export const TERRITORY_RULES=getConfigSection('difficulty').territories;

// Groups belong to a map snapshot, not to the camera or an elapsed-time spawn
// budget. Keeping the live member objects also distinguishes kills from a
// temporary scene change without repopulating an already cleared clearing.
export class MonsterTerritories {
  constructor(game,{generation=game._worldExploration&&!game.debugOptions?.allMonsters}={}) {
    this.game=game;this.groups=[];this.byId=new Map();
    if(generation)this._generate();
  }
  _safe(x,y,r=22) {
    const g=this.game;
    return g.terrain.isFree(x,y,r+4)&&g.terrain.island?.isDry(x,y,r+12)!==false&&
      g.environment?.isHazardFree?.(x,y,r+8)!==false&&
      g.settlements?.isSafePoint?.(x,y,r+25)!==false&&
      g.relicSites?.isSafePoint?.(x,y,r+25)!==false;
  }
  _generate() {
    if(this.game.terrain.island?.layout?.encounters?.length){this._generateLayout();return;}
    const g=this.game,seed=g.terrain.island?.seed??g.regionIndex,plans=Object.values(g.terrain.island?.plan??{}),rotation=hash(seed+77)*TAU;
    for(const [ring,radius] of TERRITORY_RULES.ringRadii.entries()) {
      const slots=6+ring*3;
      for(let slot=0;slot<slots&&this.groups.length<TERRITORY_RULES.maxGroups;slot++) {
        const angle=rotation+slot*TAU/slots+ring*.31,x=Math.round(Math.cos(angle)*radius),y=Math.round(Math.sin(angle)*radius);
        if(g.terrain.island?.isDry(x,y,TERRITORY_RULES.radius+80)===false||!this._safe(x,y)||plans.some(p=>distance(p,{x,y})<p.r+TERRITORY_RULES.radius+50)||this.groups.some(group=>distance(group,{x,y})<TERRITORY_RULES.spacing))continue;
        const id=`territory:${g.mapId}:${ring}:${slot}`,group={id,x,y,radius:TERRITORY_RULES.radius,members:[],memberIds:[],cleared:false,announced:false};
        for(let member=0;member<TERRITORY_RULES.baseMembers+ring%3;member++) {
          const n=seed*419+ring*173+slot*31+member,context={region:g.region,enemies:g.enemies,time:0,_difficultyTime:()=>TERRITORY_RULES.typeBaseTime+ring*TERRITORY_RULES.typeRingTime};
          const type=ordinaryEnemyType(context,hash(n+131)),r=enemyDefinition(type).r;
          let home=null;
          for(let attempt=0;attempt<24;attempt++) {
            const a=hash(n+attempt*13)*TAU,d=35+hash(n+attempt*17+1)*110,point={x:x+Math.cos(a)*d,y:y+Math.sin(a)*d};
            if(this._safe(point.x,point.y,r)&&group.members.every(enemy=>distance(foot(enemy),point)>enemy.r+r+8)){home=point;break;}
          }
          if(!home)continue;
          const enemy=g._spawnEnemy(type,1),strength=1+ring*TERRITORY_RULES.ringStrength;
          enemy.hp*=strength;enemy.maxHp=enemy.hp;enemy.damage*=strength;
          enemy.x=home.x;enemy.y=home.y-groundOffset(enemy);enemy.territoryId=id;enemy.territoryHome=home;
          enemy.territoryState='idle';enemy.guardActive=false;enemy._territoryOrder=member;enemy._territoryAway=0;
          group.members.push(enemy);group.memberIds.push(enemy.id);
        }
        if(group.members.length){
          if(g._features.elites&&ring>=TERRITORY_RULES.eliteStartRing&&this.groups.length%TERRITORY_RULES.eliteGroupInterval===0) {
            const affix=TERRITORY_RULES.eliteAffixes[Math.floor(hash(seed+slot+ring*17)*TERRITORY_RULES.eliteAffixes.length)];
            for(const enemy of group.members)if(g.elites.promote(enemy,affix)){enemy.territoryHome=foot(enemy);break;}
          }
          this.groups.push(group);this.byId.set(id,group);
        }
      }
    }
  }
  _generateLayout() {
    const g=this.game,island=g.terrain.island,seed=island.seed;
    for(const [slot,point] of island.layout.encounters.entries()) {
      if(point.kind==='secret'||!this._safe(point.x,point.y,point.kind==='boss'?55:26))continue;
      const tier=Math.max(0,Math.min(4,point.tier??Math.floor(Math.hypot(point.x,point.y)/800)));
      const id=`territory:${g.mapId}:${point.id}`,boss=point.kind==='boss';
      const group={id,x:point.x,y:point.y,radius:TERRITORY_RULES.radius,kind:point.kind||'combat',name:boss?'荒野首领':point.kind==='guard'?'路口守卫':undefined,members:[],memberIds:[],cleared:false,announced:false};
      const count=boss?1:TERRITORY_RULES.baseMembers+tier%3;
      for(let member=0;member<count;member++) {
        const n=seed*419+slot*173+member,context={region:g.region,enemies:g.enemies,time:0,_difficultyTime:()=>TERRITORY_RULES.typeBaseTime+tier*TERRITORY_RULES.typeRingTime};
        const type=boss?'boss':ordinaryEnemyType(context,hash(n+131)),definition=enemyDefinition(type),r=definition.r;
        let home=boss?{x:point.x,y:point.y}:null;
        for(let attempt=0;!home&&attempt<32;attempt++) {
          const a=hash(n+attempt*13)*TAU,d=35+hash(n+attempt*17+1)*110,p={x:point.x+Math.cos(a)*d,y:point.y+Math.sin(a)*d};
          if(this._safe(p.x,p.y,r)&&group.members.every(enemy=>distance(foot(enemy),p)>enemy.r+r+8))home=p;
        }
        if(!home)continue;
        const enemy=g._spawnEnemy(type,1),strength=boss?(g.region.danger||1):1+tier*TERRITORY_RULES.ringStrength;
        if(boss){
          // Field difficulty belongs to its location, regardless of how many
          // guardians were fought before first visiting this world.
          enemy.bossIndex=1;enemy.hp=(g.easy?(definition.easyHp??definition.baseHp):definition.baseHp)*strength;
          enemy.damage=definition.damage*strength*(g.easy?getConfigSection('difficulty').enemyGrowth.easyDamageMultiplier:1);
          enemy.xp=Math.round(definition.xp*strength);
        }else{enemy.hp*=strength;enemy.damage*=strength;}
        enemy.maxHp=enemy.hp;
        enemy.x=home.x;enemy.y=home.y-groundOffset(enemy);enemy.territoryId=id;enemy.territoryHome=home;
        enemy.territoryState='idle';enemy.guardActive=false;enemy._territoryOrder=member;enemy._territoryAway=0;
        if(boss){enemy.worldBoss=true;g._initializeRegionalBoss(enemy,point.bossKind);}
        group.members.push(enemy);group.memberIds.push(enemy.id);
      }
      if(!group.members.length)continue;
      if(!boss&&g._features.elites&&(point.kind==='guard'||tier>=TERRITORY_RULES.eliteStartRing&&slot%TERRITORY_RULES.eliteGroupInterval===0)) {
        const affix=TERRITORY_RULES.eliteAffixes[Math.floor(hash(seed+slot)*TERRITORY_RULES.eliteAffixes.length)];
        for(const enemy of group.members)if(g.elites.promote(enemy,affix)){enemy.territoryHome=foot(enemy);break;}
      }
      this.groups.push(group);this.byId.set(id,group);
    }
  }
  _playerFoot(){const p=this.game.player;return {x:p.x,y:p.y+groundOffset(p,true)};}
  _stop(enemy) {
    this.game._clearRegionalBossAttacks?.(enemy);enemy.specialist=null;enemy._friendlyTargetId=null;
    if(enemy.affix){enemy.affix.phase='idle';enemy.affix.life=0;}
  }
  _activate(enemy,group) {
    enemy.territoryState='chasing';enemy.guardActive=true;enemy.guardReturnTarget=null;enemy._territoryAway=0;
    enemy._navTimer=0;enemy._coastTarget=null;
    if(enemy.worldBoss&&!enemy._worldBossAnnounced){enemy._worldBossAnnounced=true;this.game.bossCount++;this.game.bossSpawned=true;this.game.bossDefeated=false;this.game._emit('boss');}
    if(!group.announced){group.announced=true;this.game._emit('territoryAlert',{territoryId:group.id,enemyId:enemy.id});}
  }
  awaken(enemy) {
    const group=this.byId.get(enemy.territoryId);if(!group||enemy.hp<=0)return false;
    enemy._territoryProvokedUntil=this.game._clock+TERRITORY_RULES.provokedDuration;
    this._activate(enemy,group);this._rally(group,enemy);return true;
  }
  _rally(group,source) {
    for(const enemy of group.members)if(enemy.hp>0&&enemy.territoryState==='idle') {
      enemy.territoryState='alert';enemy._territoryAlertAt=this.game._clock+TERRITORY_RULES.rallyDelay+distance(foot(enemy),foot(source))/TERRITORY_RULES.rallySpeed;
    }
  }
  update(dt=0) {
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active||g.sceneKind==='dungeon')return;
    // A territorial summoner's reinforcements obey the same home and retreat
    // rules; temporary summons never become unowned cross-world pursuers.
    for(const enemy of g.enemies)if(enemy.hp>0&&enemy.summonerId&&!enemy.territoryId) {
      const owner=g.enemies.find(candidate=>candidate.id===enemy.summonerId),group=this.byId.get(owner?.territoryId);
      if(!group)continue;
      enemy.territoryId=group.id;enemy.territoryHome={...owner.territoryHome};enemy._territoryOrder=group.members.length;
      enemy.territoryState=owner.territoryState;enemy.guardActive=owner.guardActive;enemy._territoryAway=0;
      group.members.push(enemy);group.memberIds.push(enemy.id);
    }
    const p=this._playerFoot();
    for(const group of this.groups) {
      if(group.cleared)continue;
      const alive=group.members.filter(enemy=>enemy.hp>0);
      if(!alive.length){group.cleared=true;g._emit('territoryCleared',{territoryId:group.id});continue;}
      const playerDistance=distance(p,group);
      // Discovery is local: no event from another group enters this decision.
      if(g.regionGrace<=0&&playerDistance<=group.radius) {
        const nearest=alive.filter(enemy=>enemy.territoryState==='idle').sort((a,b)=>distance(foot(a),p)-distance(foot(b),p))[0];
        if(nearest&&distance(foot(nearest),p)<=TERRITORY_RULES.notice){this._activate(nearest,group);this._rally(group,nearest);}
      }
      for(const enemy of alive) {
        if(enemy.territoryState==='alert'&&g._clock>=enemy._territoryAlertAt) {
          if(playerDistance<=TERRITORY_RULES.leash)this._activate(enemy,group);
          else {enemy.territoryState='idle';enemy.guardActive=false;}
        }
        if(enemy.territoryState!=='chasing')continue;
        const provoked=(enemy._territoryProvokedUntil||0)>g._clock;
        const outside=playerDistance>TERRITORY_RULES.leash||distance(foot(enemy),group)>TERRITORY_RULES.enemyLeash;
        enemy._territoryAway=outside&&!provoked?(enemy._territoryAway||0)+dt:0;
        if(enemy._territoryAway>=TERRITORY_RULES.disengageDelay) {
          enemy.territoryState='returning';enemy.guardActive=false;enemy.guardReturnTarget=enemy.territoryHome;
          enemy._navTimer=0;enemy._coastTarget=null;this._stop(enemy);
        }
      }
    }
  }
  updateEnemy(enemy,dt) {
    const group=this.byId.get(enemy.territoryId);if(!group)return false;
    if(enemy.territoryState==='chasing')return false;
    enemy.guardActive=false;this._stop(enemy);
    const position=foot(enemy),home=enemy.territoryHome;
    if(enemy.territoryState==='returning') {
      if(distance(position,home)>TERRITORY_RULES.returnArrival)this.game._moveEnemy(enemy,dt,home);
      else {enemy.territoryState='idle';enemy.guardReturnTarget=null;enemy._territoryAway=0;}
      return true;
    }
    if(enemy.territoryState==='alert'||distance(position,this._playerFoot())>TERRITORY_RULES.simulationRange)return true;
    if(enemy.worldBoss)return true;
    const angle=this.game._clock*.18+enemy._territoryOrder*2.4,target={x:home.x+Math.cos(angle)*TERRITORY_RULES.patrolRadius,y:home.y+Math.sin(angle)*TERRITORY_RULES.patrolRadius};
    if(distance(position,target)>5&&this._safe(target.x,target.y,enemy.r)) {
      const speed=enemy.speed;enemy.speed*=TERRITORY_RULES.patrolSpeed;this.game._moveEnemy(enemy,dt,target);enemy.speed=speed;
    }
    return true;
  }
  suspend() {
    for(const group of this.groups)for(const enemy of group.members)if(enemy.hp>0&&enemy.territoryState!=='idle') {
      enemy.territoryState='returning';enemy.guardActive=false;enemy.guardReturnTarget=enemy.territoryHome;this._stop(enemy);
    }
  }
}
