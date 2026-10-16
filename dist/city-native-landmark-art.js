import { CITY_ART_SPRITES } from './city-art-manifest.js';
import { relicActivationStrength } from './relic-activation.js';

// Exploration sites keep their original interaction identity and ground anchor.
// Their raised entrance artwork uses the same native library as the city.
export function drawNativeCityLandmark(c,site,{library}={}){
  if(site?.artTheme!=='city'||!site.isRiftLandmark||!['cave','dungeon','sewer'].includes(site.kind||site.type)&&site.featureId!=='sewer')return false;
  const sprite=CITY_ART_SPRITES.sewer,width=68,depth=34,drawWidth=sprite.sw*width/sprite.footprintWidth,drawHeight=depth+48*sprite.projectionHeightFactor;
  const rect={x:site.x-sprite.footX/sprite.sw*drawWidth,y:site.y-sprite.footY/sprite.sh*drawHeight+depth/2,width:drawWidth,height:drawHeight};
  return library.draw(c,'sewer',rect);
}

export function nativeCitySettlementVisual(site){
  const tower=site.featureId==='belltower',hut=site.type==='supply'||site.type==='occupied';
  if(!tower&&!hut)return null;
  const key=tower?'belltower':'house',spec=CITY_ART_SPRITES[key],width=site.width,depth=site.depth,height=tower?220:52;
  const drawWidth=spec.sw*width/spec.footprintWidth,drawHeight=depth+height*spec.projectionHeightFactor;
  // Interactive entrances use their existing front-door anchor at site.y.
  const rect={x:site.x-spec.footX/spec.sw*drawWidth,y:site.y-spec.footY/spec.sh*drawHeight,width:drawWidth,height:drawHeight};
  return{sprite:key,rect,halfWidth:Math.max(site.x-rect.x,rect.x+drawWidth-site.x),top:site.y-rect.y,bottom:rect.y+drawHeight-site.y,sortY:site.y,maxBounds:{minX:rect.x,minY:rect.y,maxX:rect.x+drawWidth,maxY:rect.y+drawHeight}};
}

export function drawNativeCitySettlement(c,site,{library,player,footY}={}){
  const visual=nativeCitySettlementVisual(site);if(!visual)return false;
  const {sprite:key,rect}=visual,tower=key==='belltower';
  const standing=Number.isFinite(footY)?footY:player?.y+19.8;
  const behind=player&&standing<site.y+4&&standing>rect.y&&Math.abs(player.x-site.x)<rect.width/2+12;
  const alpha=behind&&library.coversPlayer(key,rect,player,standing)?.48:1;
  library.draw(c,key,rect,{alpha});
  const strength=relicActivationStrength(site);
  if(strength>0){c.save();try{c.globalAlpha*=strength;c.strokeStyle='#d9f2d1';c.lineWidth=3;c.beginPath();c.ellipse(site.x,site.y+8,tower?31:18,7,0,Math.PI,Math.PI*2);c.stroke();}finally{c.restore();}}
  const cleared=site.explored||['spent','claimed'].includes(site.state);
  c.save();try{
    c.textAlign='center';c.font='600 10px system-ui,sans-serif';c.lineWidth=3;c.strokeStyle='#23332e';c.fillStyle=cleared?'#b4c4b5':'#f3dfaf';
    c.strokeText(site.name,site.x,site.y+31);c.fillText(site.name,site.x,site.y+31);
    if(cleared||site.type==='occupied'&&site.state==='active'){
      c.font='9px system-ui,sans-serif';c.fillStyle=cleared?'#bacbbb':'#edc29c';c.fillText(cleared?'已探索':'屋内尚有守卫',site.x,site.y+48);
    }
  }finally{c.restore();}return true;
}
