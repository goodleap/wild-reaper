import { drawEmberProp, emberVisual, EMBER_PALETTE } from './ember-art.js';
import { relicActivationStrength } from './relic-activation.js';

function body(site){
  if(site?.region!=='ember-realm-large'||!['supply','occupied','castle'].includes(site.type))return null;
  return {variant:'ember-native',emberKind:'shelter',x:site.x,y:site.y-site.depth/2,
    width:site.width,depth:site.depth,height:site.type==='castle'?158:105,
    visualWidth:site.width+26,seed:site.seed||0,sign:true};
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
    c.fillStyle='#8e837d';c.fill();c.strokeStyle=P.ink;c.lineWidth=1.8;c.stroke();
    c.beginPath();c.moveTo(site.x-w/2+r,site.y-4);c.lineTo(site.x+w/2-r,site.y-4);
    c.strokeStyle='#bfb09b';c.lineWidth=3;c.stroke();
    drawEmberProp(c,prop,{player,footY});
    if(site.type==='castle'){
      // Chimneys sit on the occupied rear foundation; they add no hidden body.
      for(const sign of [-1,1]){
        const x=site.x+sign*w*.3,y=site.y-d*.74;
        c.beginPath();c.roundRect(x-12,y-139,24,76,3);c.fillStyle=P.rockDark;c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
        c.fillStyle=P.rockLight;c.fillRect(x-15,y-141,30,8);
        c.fillStyle=P.ore;c.fillRect(x-6,y-119,12,15);
      }
    }
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
