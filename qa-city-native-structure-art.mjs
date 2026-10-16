import assert from 'node:assert/strict';
import {createRiftLayout} from './dist/worlds/rift-layout.js';
import {RiftCollision} from './dist/rift-collision.js';
import {CITY_ART_SPRITES} from './dist/city-art-manifest.js';
import {CITY_NATIVE_PRESERVED_IDS,createNativeCityProps,decorateNativeCityProp,createNativeCityBridgeProps,nativeCityVisual,CityNativeStructureArt,drawNativeCityBridge} from './dist/city-native-structure-art.js';

const layout=createRiftLayout('clockshadow-city'),before=JSON.stringify(layout.cityStructures),props=createNativeCityProps(layout),collision=new RiftCollision(layout),originals=new Map(layout.cityStructures.map(prop=>[prop.id,prop]));
assert.equal(originals.size,377);assert.equal(props.length,366,'canonical render carriers merge only the complete keep and the two wings');
assert.equal(JSON.stringify(layout.cityStructures),before,'native assembly does not mutate a canonical foundation or its configuration');
assert(Object.isFrozen(props)&&props.every(prop=>Object.isFrozen(prop)&&Object.isFrozen(prop.cityArt.layers)));
assert.deepEqual(createNativeCityProps({worldId:'forest',artTheme:'city'}),[],'native city art cannot enter another world');
const covered=props.flatMap(prop=>prop.canonicalIds);assert.equal(new Set(covered).size,covered.length,'no canonical structure is drawn twice');
const omitted=[...originals.keys()].filter(id=>!covered.includes(id));
assert.deepEqual(omitted.sort(),[...CITY_NATIVE_PRESERVED_IDS,'gate:g1','gate:g2','gate:g3'].sort(),'the original sample stays separate and other gate openings receive no fake tower mass');
const keep=props.find(prop=>prop.sourceId==='castle:主堡');assert(keep);assert.equal(keep.width,700);assert.equal(keep.depth,400);assert.equal(keep.cityArt.sprite,'keep');assert.equal(keep.cityArt.layers.length,1,'the main keep uses one complete native keep image');assert.equal(keep.canonicalIds.length,4);
assert.deepEqual(props.filter(prop=>prop.cityArt.layers.some(layer=>CITY_ART_SPRITES[layer.sprite].asset==='keepLarge')).map(prop=>prop.sourceId),['castle:主堡'],'the broad complete keep artwork appears only on the real 700x400 main keep');
for(const side of['西','东']){const wing=props.find(prop=>prop.sourceId===`castle:${side}翼`);assert.equal(wing.width,230);assert.equal(wing.depth,300);assert.equal(wing.cityArt.sprite,'house');assert.equal(wing.canonicalIds.length,2);assert.equal(wing.cityArt.layers.length,1);}
const church=props.find(prop=>prop.sourceId==='cathedral:nave-east');assert.equal(church.cityArt.sprite,'church');assert.equal(church.width,320);assert.equal(church.depth,240);assert.equal(church.height,240,'the main chapel keeps a tall native silhouette');
for(const id of['cathedral:nave-west','cathedral:choir']){const side=props.find(prop=>prop.sourceId===id);assert.equal(side.cityArt.sprite,'church','side halls use the tall gothic source instead of a stretched wide keep');assert.equal(side.height,130,'lower gothic side halls frame the taller main chapel');}
for(const id of['cathedral:west-tower','cathedral:east-tower'])assert.equal(props.find(prop=>prop.sourceId===id).cityArt.sprite,'belltower');
assert(collision.high.inside(5650,-4030),'the original U-shaped cathedral courtyard stays walkable');
assert.equal(props.find(prop=>prop.sourceId==='infill:08:5:3').cityArt.sprite,'belltower','钟楼广场 contains a real tower on an existing solid foundation');
assert.equal(props.find(prop=>prop.sourceId==='infill:13:3:2').cityArt.sprite,'fountain');assert.equal(props.find(prop=>prop.sourceId==='block:13:1:1').cityArt.sprite,'statue');
for(const barracks of props.filter(prop=>prop.cityKind==='barracks')){
  assert.equal(barracks.cityArt.sprite,'house');assert.equal(barracks.cityArt.layers.length,barracks.width>300?2:1,'wide barracks combine complete smaller houses');
  if(barracks.width>300){
    const [left,right]=barracks.cityArt.layers;assert(left.offsetX<0&&right.offsetX>0);assert(left.footprintWidth<=174.001&&right.footprintWidth<=174.001,'each long-barracks section keeps a normal house width');assert.equal(left.footprintDepth,barracks.depth);assert.equal(right.footprintDepth,barracks.depth);
    assert(left.drawWidth/left.drawHeight<1.25&&right.drawWidth/right.drawHeight<1.25,'small square-source facades are not stretched into a wide castle strip');
  }
}

let samples=0;
for(const prop of props){
  assert.equal(prop.variant,'city-native');assert.equal(prop.region,'clockshadow-city');assert.equal(prop.collision,false,'native props do not add another collision shape');assert.equal(prop.sortY,prop.y+prop.depth/2);
  const source=prop.canonicalIds.map(id=>originals.get(id));assert(source.every(Boolean));assert.equal(source.reduce((sum,s)=>sum+s.width*s.depth,0),prop.width*prop.depth,'a merged sprite covers exactly its original rectangular union');
  for(const dx of[-.49,0,.49])for(const dy of[-.49,0,.49])for(const mask of[collision.ground,collision.high]){assert(!mask.inside(prop.x+prop.width*dx,prop.y+prop.depth*dy),'the actual visual carrier foot stays in the original blocked union');samples++;}
  for(const layer of prop.cityArt.layers){
    const sprite=CITY_ART_SPRITES[layer.sprite];assert(sprite,'every visible layer is an actual native source cell');
    assert(layer.drawWidth>0&&layer.drawHeight>0);assert(Math.abs(sprite.footprintWidth/sprite.sw*layer.drawWidth-layer.footprintWidth)<1e-8,'source physical width maps to the real ground width');
    assert(sprite.footprintDepth/sprite.sh*layer.drawHeight<=layer.footprintDepth+1e-8,'the measured physical depth never exceeds its real foundation');
    assert(Math.abs(-layer.anchorY+sprite.footY/sprite.sh*layer.drawHeight-layer.footprintDepth/2)<1e-8,'front foot aligns with the depth queue');
    assert(layer.footprintWidth/2+Math.abs(layer.offsetX)<=prop.width/2+1e-8);assert(layer.footprintDepth/2+Math.abs(layer.offsetY)<=prop.depth/2+1e-8);
  }
  const v=nativeCityVisual(prop);assert(v);assert.equal(v.sortY,prop.sortY);assert.equal(v.maxBounds.minX,prop.x+prop.cityArt.bounds.minX);assert.equal(v.maxBounds.maxY,prop.y+prop.cityArt.bounds.maxY);
  for(const field of['halfWidth','top','bottom','canopyX','canopyY','canopyRx','canopyRy','shadowWidth','shadowLength','shadowOffset'])assert(Number.isFinite(v[field]));
  if(prop.cityKind==='ruin'){assert(prop.cityArt.layers.length>=2);assert.equal(prop.cityArt.layers[1].sprite,'rubble','blocked ruins visibly fill the source arch with rubble');}
  if(prop.cityKind==='planter'){assert.deepEqual(prop.cityArt.layers.map(layer=>layer.sprite),['rubble','shrub'],'solid planters have a stone base and dense vegetation');}
  if(prop.sourceId.startsWith('gate-pier:'))assert(['wall','wall-vertical'].includes(prop.cityArt.sprite),'narrow physical gate piers do not stretch a circular tower into a spike');
}
assert(samples>6500);
const ivyHosts=props.filter(prop=>prop.cityArt.layers.some(layer=>layer.sprite==='ivy')),eligibleHosts=props.filter(prop=>['wall','warehouse','ruin'].includes(prop.cityKind)&&prop.width>=100&&prop.depth>=40);
assert(ivyHosts.length>eligibleHosts.length*.2&&ivyHosts.length<eligibleHosts.length*.45,'hanging ivy dresses about one third of suitable facades');
assert(eligibleHosts.some(prop=>!prop.cityArt.layers.some(layer=>layer.sprite==='ivy')),'the same decoration is not pasted onto every wall');
for(const host of ivyHosts){
  const ivy=host.cityArt.layers.find(layer=>layer.sprite==='ivy'),b=host.cityArt.bounds;assert(ivy.wallAttachment);assert(ivy.footprintWidth>=35&&ivy.footprintWidth<=50);assert.equal(ivy.footprintDepth,12);
  assert(Math.abs(ivy.offsetX)>host.width*.15,'ivy hangs toward a facade edge instead of filling a central doorway');
  const top=ivy.offsetY-ivy.anchorY,bottom=top+ivy.drawHeight;assert(bottom<=host.depth/2-3+1e-8,'hanging leaves end above the existing ground contact');assert(ivy.attachmentY<host.depth/2-host.height*.5,'the attachment belongs on the stone facade, not a giant ground leaf');
  assert(b.minY<=top&&b.maxY>=bottom,'the complete ivy image participates in ordinary visual bounds');
  assert(!host.sourceId.startsWith('gate:'),'ivy cannot dress or fill a gate gap');
}
assert.deepEqual(createNativeCityProps(layout).map(prop=>prop.cityArt.layers),props.map(prop=>prop.cityArt.layers),'ivy choice and placement are deterministic from canonical identity/style');

const extra={id:'city-native:green:oak:1',sourceId:'green:oak:1',variant:'city-native',region:'clockshadow-city',cityArt:'oak',cityKind:'tree',x:400,y:500,width:20,depth:16,height:110,type:'tree',r:9,sortY:507,heightBand:'high',collision:false,cityBlock:'orchard',treeHeight:110};
const decorated=decorateNativeCityProp(extra);assert.equal(decorated.id,extra.id);assert.equal(decorated.sourceId,extra.sourceId);assert.equal(decorated.type,'tree');assert.equal(decorated.r,9);assert.equal(decorated.sortY,507);assert.equal(decorated.cityBlock,'orchard');assert.equal(decorated.treeHeight,110);assert.equal(decorated.cityArt.sprite,'oak');assert(nativeCityVisual(decorated));assert.equal(extra.cityArt,'oak','decorating another placement module is immutable');assert.equal(decorateNativeCityProp(decorated),decorated);assert.equal(decorateNativeCityProp({...extra,region:'forest'}).cityArt,'oak');
for(const key of['oak','cypress','apple']){
  const tree=decorateNativeCityProp({...extra,id:`tree:${key}`,cityArt:key,width:76,depth:60}),layer=tree.cityArt.layers[0],source=CITY_ART_SPRITES[key],visual=nativeCityVisual(tree);
  assert(layer.drawWidth<=layer.drawHeight*source.sw/source.sh+1e-9,'tree crowns never stretch wider than their source aspect ratio');assert(layer.footprintWidth<=tree.width,'the visually narrowed tree foot cannot exceed its original root');assert.equal(tree.width,76,'tree crown refinement does not change the authored root footprint');assert.equal(visual.shadowWidth,layer.drawWidth*.35);assert.equal(visual.shadowLength,layer.drawHeight*.3);
}

const calls=[],stack=[],c={globalAlpha:.72,save(){stack.push(this.globalAlpha);},restore(){assert(stack.length);this.globalAlpha=stack.pop();}};
let coveredByPixels=false;
const library={draw(ctx,key,rect,{alpha}){assert(CITY_ART_SPRITES[key]);assert([rect.x,rect.y,rect.width,rect.height].every(Number.isFinite));calls.push({key,rect,alpha});ctx.globalAlpha=.22;return true;},coversPlayer(){return coveredByPixels;}};
const art=new CityNativeStructureArt({library});assert.equal(art.drawProp(c,{variant:'world-building'}),false);assert.equal(nativeCityVisual({...keep,region:'forest'}),null);
assert(art.drawProp(c,keep,{canopyAlpha:.35,player:{x:0,y:0}}));assert.equal(calls.at(-1).key,'keep');assert.equal(calls.at(-1).alpha,1,'empty source pixels do not fade a whole building');assert.equal(c.globalAlpha,.72);
coveredByPixels=true;art.drawProp(c,church,{canopyAlpha:.35,player:{x:0,y:0}});assert.equal(calls.at(-1).alpha,.35,'opaque native stone retains normal body occlusion');assert.equal(c.globalAlpha,.72);
const ruin=props.find(prop=>prop.cityKind==='ruin'&&prop.cityArt.layers.length===2);art.drawProp(c,ruin,{canopyAlpha:.35,player:{x:0,y:0}});assert.deepEqual(calls.slice(-2).map(call=>call.key),['ruin','rubble']);assert(calls.slice(-2).every(call=>call.alpha===.35));
for(let frame=0;frame<5;frame++)for(const prop of props)art.drawProp(c,prop,{canopyAlpha:1});assert.equal(art.cacheStats.ownImageBytes,0);assert.equal(art.cacheStats.ownMaskBytes,0,'all shapes share the preloaded atlas and its fixed cell masks');assert(Object.values(art.cacheStats.lastAppliedOpacity).every(Number.isFinite));assert.equal(stack.length,0);assert.equal(c.globalAlpha,.72);
const failedArt=new CityNativeStructureArt({library:{draw(){return false;}}});assert.throws(()=>failedArt.drawProp(c,keep),/not loaded/);assert.equal(failedArt.cacheStats.draws,0);assert.equal(stack.length,0);assert.equal(c.globalAlpha,.72);

const rails=createNativeCityBridgeProps(layout);assert.equal(rails.length,16,'two original 950-unit decks each receive four complete rail sprites per side');
for(const rail of rails){
  const passage=layout.passages.find(p=>p.id===rail.bridgeId),width=passage.width;
  assert.equal(rail.collision,false);assert.equal(rail.heightBand,'low');assert.equal(rail.depth,12);assert.equal(rail.sortY,rail.y+6);assert.equal(rail.cityArt.sprite,'wall');
  const offset=Math.abs(rail.y-passage.deck[0].y);assert.equal(width/2-(offset-rail.depth/2),9,'raised rails occupy only the outer nine units of the existing walkable deck');
  assert(Math.abs(rail.x-(passage.deck[0].x+passage.deck[1].x)/2)+rail.width/2<=475+.001,'no rail extends onto a bridge approach');
  art.drawProp(c,rail,{canopyAlpha:1});
}
assert.equal(drawNativeCityBridge(c,layout.passages.find(p=>p.kind==='bridge'),{library}),true);assert.equal(drawNativeCityBridge(c,layout.passages.find(p=>p.kind==='bridge'),{library,overview:true}),false);assert.equal(stack.length,0);
console.log(`City native structures: 377 immutable foundations, 366 full-image carriers, continuous 700x400 keep/wings, five-part open cathedral, real clock/fountain/statue, ${samples} original-mask samples, unclipped source-foot projections, rubble-filled ruins, shared library/masks, pixel occlusion and 16 depth-sorted edge rails passed.`);
