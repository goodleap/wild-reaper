import { WORLD_ARCHIVE_WORLDS, WORLD_ARCHIVE_LOCATIONS } from './world-archive.js';
import { SceneryArt } from './scenery-art.js';
import { RegionalArt } from './regional-art.js';
import { WorldArt } from './world-art.js';
import { WaterArt } from './water-art.js';
import { RelicArt } from './relic-art.js';
import { EncounterArt } from './encounter-art.js';
import { WorldSiteArt } from './world-site-art.js';
import { CompanionArt } from './companion-art.js';
import { HumanoidArt } from './humanoid-art.js';
import { PropArt } from './prop-art.js';
import { SETTLEMENT_DEFINITIONS, RELIC_SITE_DEFINITIONS, RELIC_SITE_TYPES, WORLD_RELIC_DEFINITIONS } from './site-definitions.js';
import { WORLD_SITE_FEATURES } from './world-sites.js';
import { worldForId } from './world-definitions.js';
import { createRiftLayout } from './worlds/rift-layout.js';
import { drawRiftOverview } from './worlds/rift-art.js';

const WIDTH=480,HEIGHT=300,CACHE_LIMIT=16;
const OPTIONS=Object.freeze({time:0,reduced:true,pixelRatio:2});
const TYPES={scenery:SceneryArt,regional:RegionalArt,world:WorldArt,water:WaterArt,relic:RelicArt,encounter:EncounterArt,site:WorldSiteArt,companion:CompanionArt,human:HumanoidArt,prop:PropArt};
const entries=new Map([...WORLD_ARCHIVE_WORLDS.map(item=>[`world:${item.id}`,{...item,kind:'world'}]),...WORLD_ARCHIVE_LOCATIONS.map(item=>[`location:${item.id}`,{...item,kind:'location'}])]);

function terrain(c,id,art){
  if(id==='forest')art('scenery').drawGround(c,160,100,240,150);
  else if(id==='marsh'||id==='ruins')art('regional').drawGround(c,id,160,100,240,150);
  else art('world').drawGround(c,id,140,140,240,150,{seed:0});
}
function water(c,id,art,kind='water',x=151,y=106,rx=64,ry=30){
  art('water').draw(c,{x,y,rx,ry,kind,shape:'ellipse',seed:.23,angle:-.15},{...OPTIONS,region:id});
}
function worldPortrait(c,id,art){
  if(worldForId(id).authored?.worldId===id){
    const layout=createRiftLayout(id),b=layout.bounds,scale=Math.min(232/(b.maxX-b.minX),142/(b.maxY-b.minY));
    c.save();c.translate(120,75);c.scale(scale,scale);c.translate(-(b.minX+b.maxX)/2,-(b.minY+b.maxY)/2);
    drawRiftOverview(c,layout,{scale,labels:false,landmarks:true});c.restore();return;
  }
  terrain(c,id,art);
  const tree=(x,y,variant,scale=.7)=>{
    const prop={type:'tree',x,y,variant,scale,treeForm:0,seed:.2};
    if(id==='forest')art('scenery').drawTree(c,prop);
    else if(id==='marsh')art('regional').drawDeadTree(c,prop);
    else art('world').drawProp(c,prop);
  };
  const rock=(x,y,variant,r=21)=>art('world').drawProp(c,{type:'rock',x,y,variant,region:id,r,rockForm:0,seed:.3});
  if(id==='forest'){
    water(c,id,art);tree(45,112,null,.82);tree(204,68,null,.52);
    art('scenery').drawRock(c,{x:100,y:68,r:13,rockForm:1});
  }else if(id==='marsh'){
    water(c,id,art,'water',151,105,68,34);tree(48,123,null,.77);tree(216,63,null,.4);
  }else if(id==='ruins'){
    art('regional').drawRuinsStone(c,{x:58,y:127,r:24,rockForm:0,variant:'pillar'});
    art('regional').drawRuinsWall(c,{x:163,y:62,halfLength:48,r:14,angle:0,seed:.2});
    art('regional').drawRuinsStone(c,{x:203,y:128,r:17,rockForm:1});
  }else if(id==='beach'){
    water(c,id,art,'water',205,127,92,49);tree(63,128,'world-palm',.93);rock(180,73,'world-reef',16);
  }else if(id==='city'){
    art('world').drawProp(c,{type:'log',x:93,y:113,variant:'world-building',halfLength:24,r:21,treeForm:0});
    art('world').drawProp(c,{type:'log',x:205,y:66,variant:'world-city-wall',halfLength:34,r:9,angle:0,seed:.1,region:id});
  }else if(id==='mountain'){
    art('world').drawProp(c,{type:'log',x:167,y:77,variant:'world-ridge',halfLength:38,r:15,angle:0,seed:.2,region:id});
    tree(57,131,'world-pine',.76);rock(178,124,'world-reef',19);
  }else if(id==='snow'){
    water(c,id,art,'ice',161,107,60,28);tree(54,131,'world-snowpine',.79);rock(207,62,'world-ice',15);
  }else if(id==='volcano'){
    water(c,id,art,'lava',180,110,76,30);tree(44,131,'world-charred',.75);rock(102,75,'world-basalt',21);
  }
}
function actor(c,kind,art,x=0,y=-20,state='trapped'){
  c.save();c.translate(x,y);
  art(['dog','owl','golem'].includes(kind)?'companion':'human').draw(c,kind,{...OPTIONS,entity:{id:1,kind,heroId:kind,facing:0,state}});
  c.restore();
}
function relicPortrait(c,entry,art){
  let definition=RELIC_SITE_DEFINITIONS.find(item=>item.key===entry.id);
  if(entry.id==='rune')definition=WORLD_RELIC_DEFINITIONS.ruins[0];
  if(entry.id==='icealtar')definition=WORLD_RELIC_DEFINITIONS.snow[0];
  if(!definition)return false;
  const site={...RELIC_SITE_TYPES[definition.type],...definition,id:`archive:${entry.id}`,x:0,y:0,state:'ready',gateOpen:false};
  const scale=entry.id==='hunt'?.28:entry.id==='golemaltar'?.89:entry.id==='dogcamp'?1.15:site.type==='rescue'||site.type==='stonevault'?.55:.75;
  c.save();c.translate(120,entry.id==='hunt'?79:entry.id==='dogcamp'?102:88);c.scale(scale,scale);
  if(site.type==='hunt'){
    art('encounter').drawGround(c,site,OPTIONS);
    for(const prop of art('encounter').props(site))art('encounter').drawMarker(c,prop,OPTIONS);
  }else if(entry.id==='golemaltar'||entry.id==='dogcamp'){
    art('companion').drawGround(c,site,OPTIONS);actor(c,site.kind,art,0,entry.id==='golemaltar'?-22:-11,entry.id==='golemaltar'?'dormant':'ready');
  }else{
    const special=site.type==='stonevault';
    if(!art('site').drawGround(c,site,OPTIONS))art(special?'companion':'relic').drawGround(c,site,OPTIONS);
    const props=art(special?'companion':'relic').props(site).slice().sort((a,b)=>a.sortY-b.sortY);
    const draw=prop=>{
      if(art('site').drawProp(c,prop,OPTIONS)||art('companion').drawProp(c,prop,OPTIONS))return;
      if(prop.type==='treasure')art('prop').drawProp(c,prop,OPTIONS);else art('relic').drawProp(c,prop,OPTIONS);
    };
    for(const prop of props.filter(prop=>prop.sortY<=0))draw(prop);
    if(site.kind)actor(c,site.kind,art);
    for(const prop of props.filter(prop=>prop.sortY>0))draw(prop);
  }
  c.restore();return true;
}
function locationPortrait(c,entry,art){
  const region={shipwreck:'beach',belltower:'city',mine:'mountain',icealtar:'snow',furnace:'volcano',rune:'ruins'}[entry.id]||'forest';
  terrain(c,region,art);
  if(relicPortrait(c,entry,art))return;
  if(entry.id==='merchant'||entry.id==='angel'){
    c.save();c.translate(120,106);c.scale(1.38,1.38);actor(c,entry.id,art,0,0,'ready');c.restore();return;
  }
  const feature=WORLD_SITE_FEATURES[entry.id],definition=feature||SETTLEMENT_DEFINITIONS.find(item=>item.type===entry.id);
  if(!definition)return;
  const site={...definition,id:`archive:${entry.id}`,type:definition.type,featureId:feature?.id,x:0,y:0,region,state:'ready',name:''};
  c.save();c.translate(120,entry.id==='castle'||entry.id==='belltower'||entry.id==='furnace'?132:entry.id==='mine'?120:126);
  const scale=entry.id==='castle'?.76:entry.id==='belltower'?.68:entry.id==='furnace'?.76:entry.id==='shipwreck'?1:1.18;
  c.scale(scale,scale);
  if(feature)art('site').drawSettlement(c,site,OPTIONS);
  else if(entry.id==='castle')art('regional').drawCastle(c,site);
  else art('scenery').drawHut(c,site);
  c.restore();
}

// Only completed small portraits survive between panel renders. Gameplay
// painters are temporary; no world generation, simulation or RAF is started.
export class WorldArchiveArt{
  constructor(makeCanvas=()=>document.createElement('canvas')){this.makeCanvas=makeCanvas;this.cache=new Map();this.builds=0;}
  get cacheStats(){return {entries:this.cache.size,bytes:this.cache.size*WIDTH*HEIGHT*4,limitBytes:CACHE_LIMIT*WIDTH*HEIGHT*4,builds:this.builds};}
  draw(container){
    const painters=new Map(),art=kind=>{if(!painters.has(kind))painters.set(kind,new TYPES[kind](this.makeCanvas));return painters.get(kind);};
    for(const canvas of container?.querySelectorAll?.('canvas[data-world-archive-art]')||[]){
      const key=canvas.dataset?.worldArchiveArt,entry=entries.get(key),ctx=canvas.getContext?.('2d');
      if(!entry||!ctx)continue;
      let portrait=this.cache.get(key);
      if(!portrait){
        portrait=this.makeCanvas();portrait.width=WIDTH;portrait.height=HEIGHT;
        const c=portrait.getContext('2d');c.setTransform(2,0,0,2,0,0);c.lineCap='round';c.lineJoin='round';
        if(entry.kind==='world')worldPortrait(c,entry.id,art);else locationPortrait(c,entry,art);
        this.builds++;
      }
      this.cache.delete(key);this.cache.set(key,portrait);
      while(this.cache.size>CACHE_LIMIT)this.cache.delete(this.cache.keys().next().value);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(canvas.width/WIDTH,canvas.height/HEIGHT),width=WIDTH*scale,height=HEIGHT*scale;
      ctx.fillStyle='#14261e';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(portrait,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
    }
  }
}
let portraits;
export function drawWorldArchiveArt(container){
  if(!container?.querySelectorAll?.('canvas[data-world-archive-art]')?.length)return;
  portraits ||= new WorldArchiveArt();portraits.draw(container);
}
