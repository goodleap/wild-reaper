import { drawEmberProp, emberVisual, EMBER_PALETTE } from './ember-art.js';
import { relicActivationStrength } from './relic-activation.js';

function body(site){
  if(site?.region!=='ember-realm-large'||!['supply','occupied','castle'].includes(site.type))return null;
  return {variant:'ember-native',emberKind:'shelter',x:site.x,y:site.y-site.depth/2,
    width:site.width,depth:site.depth,height:site.type==='castle'?158:105,
    visualWidth:site.width+26,seed:site.seed||0,sign:true,fortified:site.type==='castle'};
}

export function emberSettlementVisual(site){
  const prop=body(site);if(!prop)return null;
  const visual=emberVisual(prop);
  return {...visual,top:visual.top+site.depth/2,bottom:8,sortY:site.y,
    maxBounds:{minX:site.x-visual.halfWidth,minY:prop.y-visual.top,maxX:site.x+visual.halfWidth,maxY:site.y+8}};
}

export function drawEmberSettlement(c,site,{player,footY=player?.y+19.8}={}){
  const prop=body(site);if(!prop)return false;
  const P=EMBER_PALETTE,w=site.width,d=site.depth,r=Math.min(18,d/2,w/2);
  c.save();
  try{
    // The existing interactive building uses a rounded rectangular foundation,
    // not the scenery capsule. Its complete occupied slab remains visible.
    c.beginPath();c.roundRect(site.x-w/2,site.y-d,w,d,r);
    c.fillStyle='#827c61';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.1;c.stroke();
    c.beginPath();c.moveTo(site.x-w/2+r,site.y-4);c.lineTo(site.x+w/2-r,site.y-4);
    c.strokeStyle='#c5b38b';c.lineWidth=2;c.stroke();
    drawEmberProp(c,prop,{player,footY});
    const strength=relicActivationStrength(site);
    if(strength>0){c.globalAlpha*=strength;c.beginPath();c.ellipse(site.door.x,site.door.y-11,28,8,0,Math.PI,Math.PI*2);c.strokeStyle='#f2cf8f';c.lineWidth=2.5;c.stroke();c.globalAlpha=1;}
    const cleared=site.explored||['spent','claimed'].includes(site.state);
    c.textAlign='center';c.font='600 10px system-ui,sans-serif';c.lineWidth=3;c.strokeStyle='#3c3b3e';c.fillStyle=cleared?'#bbc5a6':'#f4dfb5';
    c.strokeText(site.name,site.x,site.y+25);c.fillText(site.name,site.x,site.y+25);
    if(cleared||site.type==='occupied'&&site.state==='active'){
      c.font='9px system-ui,sans-serif';c.fillStyle=cleared?'#c0c5ac':'#efc29f';c.fillText(cleared?'已探索':'屋内尚有守卫',site.x,site.y+40);
    }
  }finally{c.restore();}
  return true;
}
