import { Terrain, groundOffset } from './terrain.js';
import { HERO_CHOICES } from './heroes.js';
import { COMPANION_DEFINITIONS } from './companion-catalog.js';
import { ENEMY_DEFS } from './enemy-definitions.js';
import { BOSS_DEFS, initBoss } from './bosses.js';
import { initializeEnemyBehavior } from './enemy-behaviors.js';
import { resetLocomotion, updateLocomotion } from './locomotion.js';
import { updateEnemyLocomotion } from './enemy-animation.js';
import { CHARACTER_SPRITES } from './character-sprite-manifest.js';

const GROUPS=Object.freeze([
  {id:'heroes',name:'主角'},
  {id:'npcs',name:'NPC'},
  {id:'companions',name:'伙伴'},
  {id:'monsters',name:'怪物'},
  {id:'bosses',name:'Boss'}
]);
// A complete row fits the standard 540-unit phone view at actual body sizes.
// Large bosses get two wider bays rather than shrinking their silhouettes.
const SIDE=255,SECTION_GAP=110,HEADER=210;
// These two atlas bodies are already used by real combat painters. Showing
// them again as neutral PNG actors would duplicate the same appearance.
const COMBAT_SPRITES=Object.freeze({royalmage:'emberpriest',escortmarshal:'ironmarshal'});

function catalogue(){
  const entries=[],seen=new Set();
  const add=(category,key,name,entity,isPlayer=true)=>{
    if(seen.has(key))return;seen.add(key);
    entries.push({category,key,entity:{id:entries.length+1,name,showcaseActor:true,showcaseKey:key,
      hp:100,maxHp:100,r:15,facing:0,hurtFlash:0,hit:0,castFace:0,neutral:true,...entity},isPlayer});
  };
  for(const hero of HERO_CHOICES)add('heroes',`hero:${hero.appearanceId}`,hero.name,
    {type:'player',heroId:hero.heroId,appearanceId:hero.appearanceId,groundOffset:19.8});
  // Current NPC materials that are distinct from the standard playable art.
  // Warden/stormcaller are represented once in the companion section below.
  for(const [kind,name]of [['merchant','商人'],['angel','天使'],['elder','年长居民']])
    add('npcs',`humanoid:${kind}`,name,{type:'player',heroId:kind,kind,appearanceId:kind,
      isTownNpc:true,townKind:kind==='angel'?'angel':'merchant',sideQuestActor:true,groundOffset:19.8});
  const combatSprites=new Set(Object.values(COMBAT_SPRITES));
  for(const [id,sprite]of Object.entries(CHARACTER_SPRITES))if(!combatSprites.has(id))
    add('npcs',`sprite:${id}`,sprite.name,{type:'player',heroId:'merchant',kind:'merchant',appearanceId:'merchant',
      characterSpriteId:id,isTownNpc:true,townKind:'merchant',sideQuestActor:true,groundOffset:19.8});
  for(const [kind,name,r]of [['deer','林鹿',13],['otter','水獭',11]])
    add('npcs',`animal:${kind}`,name,{type:'player',sideQuestAnimal:kind,sideQuestActor:true,groundOffset:12,r},false);
  for(const definition of COMPANION_DEFINITIONS)add('companions',
    ['warden','stormcaller'].includes(definition.kind)?`humanoid:${definition.kind}`:`companion:${definition.kind}`,
    definition.name,{type:'player',kind:definition.kind,heroId:definition.kind,isCompanion:true,state:'active',
      r:definition.r,groundOffset:definition.groundOffset,flying:!!definition.flying});
  for(const definition of Object.values(ENEMY_DEFS)){
    if(definition.id==='boss')continue;
    const key=COMBAT_SPRITES[definition.id]?`sprite:${COMBAT_SPRITES[definition.id]}`:`enemy:${definition.visual}`;
    add('monsters',key,definition.codex.name,{type:definition.id,r:definition.r,damage:0,xp:0,
      flying:definition.movement==='air',guardActive:true},false);
  }
  for(const definition of Object.values(BOSS_DEFS))add('bosses',COMBAT_SPRITES[definition.id]?
    `sprite:${COMBAT_SPRITES[definition.id]}`:`enemy:${definition.visual}`,definition.name,
    {type:'boss',bossKind:definition.id,r:definition.r||ENEMY_DEFS.boss.r,damage:0,xp:0,guardActive:true,bossIndex:1},false);
  return entries;
}

export function createCharacterShowcaseTerrain(){
  return new Terrain({region:'forest',seed:0,obstacles:[]});
}

export class CharacterShowcase{
  constructor(game){
    this.game=game;this.actors=catalogue();this.sections=[];
    let top=0;
    for(const group of GROUPS){
      const actors=this.actors.filter(actor=>actor.category===group.id),bosses=group.id==='bosses';
      const columns=bosses?2:3,columnWidth=bosses?240:160,rowHeight=bosses?240:180;
      const height=HEADER+Math.ceil(actors.length/columns)*rowHeight;
      const section={...group,count:actors.length,x:-SIDE,y:top,width:SIDE*2,height,
        spawn:{x:0,y:top+102}};
      this.sections.push(section);
      for(const [index,actor]of actors.entries()){
        const e=actor.entity,home={x:(index%columns-(columns-1)/2)*columnWidth,y:top+HEADER+Math.floor(index/columns)*rowHeight};
        e.x=home.x;e.y=home.y;
        if(e.type==='boss')initBoss(e,e.bossKind);
        else if(!actor.isPlayer&&!e.sideQuestAnimal)initializeEnemyBehavior(e);
        const offset=groundOffset(e,actor.isPlayer);e.y=home.y-offset;e.groundY=home.y;
        resetLocomotion(e);
        // Keep each lane within its cell; diagonal atlas paths demonstrate
        // both authored directions while the princess keeps her vertical path.
        const angle=actor.category==='heroes'&&index===1?Math.PI/2:e.characterSpriteId||COMBAT_SPRITES[e.bossKind||e.type]?-Math.PI/4:0;
        const reach=actor.category==='bosses'?35:28;
        actor.route={home,dx:Math.cos(angle),dy:Math.sin(angle),reach,position:0,direction:index%2?-1:1,
          speed:actor.category==='bosses'?58:72,pause:0,offset};
        e.facing=e.visualFacing=e.moveFacing=angle+(actor.route.direction<0?Math.PI:0);
      }
      top+=height+SECTION_GAP;
    }
    this.spawn={...this.sections[0].spawn};
    this.bounds=Object.freeze({minX:-SIDE-35,minY:-100,maxX:SIDE+35,maxY:top-SECTION_GAP+100});
    const b=this.bounds,middleX=(b.minX+b.maxX)/2,middleY=(b.minY+b.maxY)/2;
    game.terrain.setStructures([
      {id:'showcase:west',x:b.minX,y:middleY,angle:Math.PI/2,halfLength:(b.maxY-b.minY)/2},
      {id:'showcase:east',x:b.maxX,y:middleY,angle:Math.PI/2,halfLength:(b.maxY-b.minY)/2},
      {id:'showcase:north',x:middleX,y:b.minY,angle:0,halfLength:(b.maxX-b.minX)/2},
      {id:'showcase:south',x:middleX,y:b.maxY,angle:0,halfLength:(b.maxX-b.minX)/2}
    ].map(wall=>({...wall,type:'log',r:16,heightBand:'high',visual:false})), 'character-showcase');
  }
  focusSection(id){
    const section=this.sections.find(section=>section.id===id);if(!section)return false;
    const p=this.game.player;p.x=section.spawn.x;p.y=section.spawn.y-groundOffset(p,true);
    p.groundY=section.spawn.y;resetLocomotion(p);return true;
  }
  update(dt){
    if(!(dt>0)||!Number.isFinite(dt))return;
    dt=Math.min(dt,.05);
    for(const actor of this.actors){
      const e=actor.entity,route=actor.route,oldX=e.x,oldY=e.y;
      if(route.pause>0)route.pause=Math.max(0,route.pause-dt);
      else{
        route.position=Math.max(-route.reach,Math.min(route.reach,route.position+route.direction*route.speed*dt));
        e.x=route.home.x+route.dx*route.position;e.y=route.home.y+route.dy*route.position-route.offset;
        e.facing=e.visualFacing=e.moveFacing=Math.atan2(e.y-oldY,e.x-oldX);
        if(Math.abs(route.position)>=route.reach){route.direction*=-1;route.pause=.32;}
      }
      e.groundY=e.y+route.offset;
      if(actor.isPlayer||e.sideQuestAnimal)updateLocomotion(e,oldX,oldY,dt);
      else updateEnemyLocomotion(e,oldX,oldY,dt);
    }
  }
}

export function drawCharacterShowcaseGround(ctx,showcase,{camX=0,camY=0,width,height}){
  ctx.save();ctx.fillStyle='#e9dfb9';ctx.fillRect(0,0,width,height);
  ctx.translate(width/2-camX,height/2-camY);
  const b=showcase.bounds;ctx.strokeStyle='#9c9b77';ctx.lineWidth=3;
  ctx.strokeRect(b.minX+16,b.minY+16,b.maxX-b.minX-32,b.maxY-b.minY-32);
  for(const section of showcase.sections){
    if(section.y+section.height<camY-height/2||section.y>camY+height/2)continue;
    ctx.fillStyle='#ded8b0';ctx.fillRect(section.x,section.y,section.width,section.height);
    ctx.strokeStyle='#b5b48b';ctx.lineWidth=1;ctx.strokeRect(section.x,section.y,section.width,section.height);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 17px system-ui,sans-serif';ctx.fillStyle='#53634b';
    ctx.fillText(`${section.name} · ${section.count}`,0,section.y+30);
  }
  for(const actor of showcase.actors){
    const route=actor.route,{x,y}=route.home;
    if(Math.abs(x-camX)>width/2+100||Math.abs(y-camY)>height/2+100)continue;
    ctx.strokeStyle='#aaa98766';ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(x-route.dx*route.reach,y-route.dy*route.reach);
    ctx.lineTo(x+route.dx*route.reach,y+route.dy*route.reach);ctx.stroke();
  }
  ctx.restore();
}
