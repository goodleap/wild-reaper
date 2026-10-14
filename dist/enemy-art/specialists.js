import { TAU, clamp, poly, line, oval, grad, leaf, star } from './drawing.js';

// Species silhouettes are painted into MonsterArt's bounded pose cache.
// Only the small casting accents below are drawn dynamically.
const eyes=(c,x,y,gap=5,color='#182b30')=>{for(const side of [-1,1]){oval(c,x+side*gap,y,1.7,2.1,color);oval(c,x+side*gap+.45,y-.6,.48,.65,'#f5f3d5');}};
const foot=(c,x,y,p,color='#44544a')=>poly(c,[[x-4,y-9],[x+3,y-9],[x+5+p,y-1],[x+3+p,y+1],[x-6+p,y+1]],color,'#263d37',.8);
const jewel=(c,x,y,r,color='#c5eced')=>{poly(c,[[x,y-r],[x+r*.6,y],[x,y+r],[x-r*.6,y]],color,'#476473',.8);line(c,[[x,y-r],[x,y],[x+r*.6,y]],'#effffe',.7);};
function profile(e,{playerX,facings}){
  const attack=e.specialAttack||(e.specialist?.phase==='windup'||e.specialist?.phase==='active'?e.specialist:null);
  const angle=Number.isFinite(attack?.angle)?attack.angle:Number.isFinite(e.visualFacing)?e.visualFacing:Math.atan2(0,playerX-e.x),dx=Math.cos(angle);
  const direction=Math.abs(dx)<.12?(facings?.get(e)||1):dx<0?-1:1;
  facings?.set(e,direction);return direction;
}
const walk=e=>Math.sin(Number.isFinite(e.walkPhase)?e.walkPhase:0);
const still=e=>e.specialist?.phase==='windup'||e.specialist?.phase==='recovery'||(e.specialAttack&&e.specialAttack.phase!=='rush')||e.specialRecovery>0;
function casterOverlay(color,x,y){return(c,e,{dense})=>{const state=e.specialist;if(state?.phase!=='windup')return;const t=clamp(1-state.timer/(state.maxTime||1),0,1);oval(c,x,y,2.2+t*1.6,2.2+t*1.6,color);star(c,x,y,2.2+t*1.4,'#fff5df');if(!dense){line(c,[[x-7,y],[x-4,y]],color,1);line(c,[[x+4,y],[x+7,y]],color,1);}};}
function rootbinder(c,p){
  for(const s of [-1,1]){line(c,[[s*7,7],[s*11,14+p*s],[s*21,19],[s*25,18]],'#40513a',5);line(c,[[s*7,7],[s*11,14+p*s],[s*21,19]],'#93a566',1.2);line(c,[[s*12,-4],[s*22,1-p],[s*25,9]],'#667f49',4);leaf(c,s*22,1,12,4,s*.7,'#a4ba6f');}
  poly(c,[[-13,12],[-16,-9],[-10,-23],[2,-29],[14,-19],[16,8],[7,18],[-5,17]],grad(c,-16,18,13,-27,['#465842','#829364','#c2bd83']),'#304735',1.4);
  for(const x of [-8,0,8])line(c,[[x,-17],[x-2,-4],[x+1,10]],'#536c427f',1.3);
  for(const [x,y,a]of[[-12,-21,-.8],[-4,-28,-.5],[6,-27,.5],[14,-19,.8]])leaf(c,x,y,17,5,a,'#88a55f');
  eyes(c,0,-7,5,'#233b29');line(c,[[-4,1],[1,3],[6,0]],'#3b5333',1.2);
}
function boglurker(c,p,flip){c.save();c.scale(flip,1);
  for(const s of [-1,1])poly(c,[[-17,s<0?5:10],[-25,11],[-29+p*s,15],[-17,16],[-9,11]],'#3a6460','#244846',1);
  oval(c,-7,0,22,14,grad(c,-26*flip,14,20*flip,-20,['#315b55','#61877a','#a2ad80']));
  poly(c,[[-26,2],[-35,4],[-29,8],[-15,7]],'#456b5d','#2f4b41',.8);
  oval(c,13,-3,15,10,'#8ba184');oval(c,25,1,8,6,'#91a88b');
  poly(c,[[1,-9],[4,-21],[12,-15],[17,-17],[21,-9]],'#5e8771','#355c50',1);
  oval(c,14,-10,3.4,3.6,'#c6c78a');oval(c,15,-10,1.4,2.5,'#263d34');
  line(c,[[11,4],[22,6],[30,3]],'#385148',1.3);for(const x of [20,26])poly(c,[[x,5],[x+2,5],[x+1,8]],'#e7dfae');
  for(let i=0;i<5;i++)oval(c,-19+i*5,-6+(i%2)*3,2.8,1.6,'#a5b28c');
  foot(c,4,16,p*2,'#517b65');c.restore();
}
function prismguard(c,p){
  for(const s of [-1,1]){foot(c,s*9,19,p*s,'#566d83');poly(c,[[s*13,-6],[s*23,-2],[s*24,10],[s*17,13],[s*13,4]],'#738e9d','#3c5266',1);jewel(c,s*21,4,5,'#c5e3ec');}
  poly(c,[[-15,-10],[-8,-21],[9,-21],[16,-9],[13,12],[0,18],[-13,12]],grad(c,-16,17,15,-21,['#4d637c','#8ba0b1','#d3dce0']),'#344b64',1.3);
  poly(c,[[-12,-9],[0,-17],[12,-9],[0,5]],'#4b647d');jewel(c,0,-5,13,'#a7e2e3');
  poly(c,[[-10,-22],[0,-34],[11,-22],[8,-14],[-7,-14]],'#8da9b7','#39556c',1);line(c,[[-5,-22],[5,-22]],'#ecfff4',2);
}
function tidepriest(c,p){
  for(const s of [-1,1])foot(c,s*6,18,p*s,'#5b7979');
  poly(c,[[-10,-8],[9,-8],[15,16],[1,19],[-16,14]],grad(c,-15,18,13,-12,['#3a687b','#629aab','#b5d6cc']),'#345865',1.2);
  line(c,[[-7,-5],[-4,12],[3,16],[10,12]],'#e1d7ad',1.5);line(c,[[0,-6],[1,15]],'#397687',1);
  oval(c,0,-15,10,11,'#a8c1b1');poly(c,[[-13,-16],[-10,-29],[0,-23],[9,-31],[13,-17],[5,-21],[-4,-20]],'#5f8e9c','#3c616b',1);eyes(c,0,-14,4);
  line(c,[[12,1],[20,-2],[20,-19]],'#52767b',3);line(c,[[20,-19],[20,-30]],'#a7cecf',2);
  poly(c,[[15,-27],[17,-34],[20,-30],[23,-34],[25,-27],[20,-23]],'#b7e1dc','#528f99',1);
}
function shieldguard(c,p){
  for(const s of [-1,1])foot(c,s*8,21,p*s,'#6c6f6c');
  poly(c,[[-13,-10],[12,-10],[16,11],[8,16],[-13,12]],grad(c,-14,15,14,-13,['#515f68','#899392','#c3c3af']),'#374852',1.2);
  oval(c,0,-17,10,10,'#aab3af');poly(c,[[-12,-19],[-10,-29],[0,-33],[11,-28],[12,-17],[4,-16],[3,-24],[-4,-24],[-4,-16]],'#879da3','#3f535d',1.1);line(c,[[-4,-19],[4,-19]],'#2b3b40',2);
  line(c,[[20,-10],[22,12]],'#849799',3);poly(c,[[20,-18],[24,-10],[21,1],[17,-10]],'#cfdbd8','#4e646b',.8);
  poly(c,[[-26,-10],[-9,-14],[-2,-7],[-5,12],[-16,20],[-27,10]],grad(c,-27,18,-3,-14,['#425b69','#798d96','#afc1bf']),'#2f4757',1.4);poly(c,[[-22,-7],[-11,-10],[-7,-5],[-9,9],[-16,14],[-23,7]],'#637e8c','#c2c9a9',1.2);jewel(c,-16,0,5,'#d8bc83');
}
function stoneape(c,p){
  for(const s of [-1,1]){foot(c,s*10,22,p*s*2,'#5f6054');poly(c,[[s*13,-13],[s*26,-7],[s*31,12+p*s],[s*24,18],[s*16,13],[s*16,0]],grad(c,-30,17,30,-15,['#4e594f','#7d8068','#afb090']),'#3a4941',1.3);}
  oval(c,0,-2,19,24,grad(c,-19,22,19,-29,['#5b6353','#888b6d','#b9b894']));oval(c,0,2,11,14,'#9b9b7d');
  poly(c,[[-15,-18],[-10,-29],[4,-33],[15,-24],[13,-11],[0,-8],[-13,-12]],'#7d846b','#414f43',1.2);oval(c,1,-17,11,8,'#b5b391');eyes(c,0,-19,4);oval(c,0,-13,4,2.4,'#646b55');line(c,[[-5,-9],[4,-9]],'#475441',1.3);
  poly(c,[[18,5],[28,3],[34,10],[30,20],[19,18],[15,12]],grad(c,16,20,32,4,['#68756b','#9ba59a','#d2d0b9']),'#4e5c53',1.2);line(c,[[20,6],[23,12],[32,10]],'#d8d8c3',1);
}
function windhunter(c,p,flip){c.save();c.scale(flip,1);
  for(const s of [-1,1])poly(c,[[s*5,-11],[s*22,-27-p*4],[s*37,-18-p*4],[s*31,-12],[s*22,-14],[s*29,-5],[s*18,-8],[s*14,2]],grad(c,-37*flip,3,37*flip,-33,['#506c7d','#83a5b4','#d0e1db']),'#3a566b',1.1);
  poly(c,[[-7,-7],[-4,7],[-12,9],[-2,13],[4,9],[7,-9]],'#6b8b98','#38596c',1);oval(c,2,-8,8,14,'#91b2bc');oval(c,4,-20,8,8,'#c1d5cf');poly(c,[[10,-22],[19,-18],[10,-15]],'#dcce94','#7d866c',.8);oval(c,7,-21,1.8,2,'#273e4d');line(c,[[1,-25],[9,-25]],'#486c83',1.2);c.restore();
}
function frostmage(c,p){
  for(const s of [-1,1])foot(c,s*6,18,p*s,'#536b85');
  poly(c,[[-10,-8],[9,-8],[15,16],[1,19],[-15,15]],grad(c,-15,19,13,-10,['#4d698f','#799ebc','#c0d9dd']),'#344e73',1.2);
  poly(c,[[-10,-6],[0,3],[10,-6],[5,10],[0,15],[-5,10]],'#b8d6df','#648ca6',.8);
  oval(c,0,-15,9,10,'#bed6d2');poly(c,[[-15,-19],[-7,-28],[-2,-37],[7,-32],[10,-20],[16,-17],[0,-16]],'#739db9','#3f638b',1.2);poly(c,[[-7,-27],[-2,-36],[0,-24]],'#d1e5e5');eyes(c,0,-14,4);
  line(c,[[11,-1],[19,-6],[20,-27]],'#7395a9',3);jewel(c,20,-29,7,'#d2f7f5');
}
function flamelizard(c,p,flip){c.save();c.scale(flip,1);
  poly(c,[[-16,1],[-31,-2],[-38,4],[-31,9],[-14,12]],'#92674c','#5a4b3e',1);oval(c,-3,1,21,13,grad(c,-25*flip,14,23*flip,-15,['#8a5643','#bf8055','#e2b478']));
  for(const x of [-18,-9,0,9])poly(c,[[x-5,-8],[x,-19+(x%3)],[x+5,-8]],'#d69a58','#936344',.7);
  oval(c,20,-3,13,9,'#c48a5c');poly(c,[[26,-7],[35,-3],[35,4],[23,7],[14,2]],'#d9a169','#805b42',1);
  oval(c,21,-9,2.5,2.4,'#f4dc9d');oval(c,21.7,-9,1,1.9,'#493d33');line(c,[[24,3],[33,3]],'#78503c',1.1);for(const x of [-12,11])foot(c,x,17,p*(x<0?-2:2),'#9a6747');c.restore();
}
function broodmother(c,p){
  for(const s of [-1,1])for(let i=0;i<4;i++){const y=-17+i*10,a=p*s*(i%2?1:-1);line(c,[[s*17,y],[s*(39+i*4),y-13+a],[s*(63+i*3),y+9+a],[s*(60+i*3),y+20]],'#403f47',8-i*.7);line(c,[[s*19,y-1],[s*(39+i*4),y-14+a],[s*(63+i*3),y+8+a]],'#a39c91',2);}
  oval(c,0,-15,31,29,grad(c,-30,15,28,-43,['#4b4950','#817481','#baa098']));
  for(const s of [-1,1])poly(c,[[s*5,-37],[s*20,-31],[s*24,-11],[s*12,-15]],'#c3b3a2','#756877',1);
  oval(c,0,14,25,19,grad(c,-23,32,22,-5,['#45444b','#8e8584','#c0b29e']));
  for(const [x,y,r]of[[-13,7,3.4],[-5,5,3],[5,5,3],[13,7,3.4],[-18,13,2.2],[18,13,2.2]]){oval(c,x,y,r,r*1.15,'#edb29d');oval(c,x+.5,y-1,.8,1,'#fff1d1');}
  for(const s of [-1,1])poly(c,[[s*6,24],[s*16,25],[s*10,37],[s*7,29]],'#e3d5b7','#766e64',1);
  jewel(c,0,-24,10,'#c4a7ba');
}
function spiderling(c,p){
  for(const side of [-1,1])for(let i=0;i<3;i++){const y=-4+i*4,step=p*side*(i%2?1:-1);line(c,[[side*6,y],[side*15,y-4+step],[side*21,y+5+step]],'#5b5a5b',2.2);line(c,[[side*7,y],[side*15,y-4+step]],'#a79f8e',.65);}
  oval(c,0,-6,9,10,grad(c,-9,4,8,-16,['#4e4f51','#81777f','#b3a596']));oval(c,0,5,7,6,'#9c9586');eyes(c,0,4,3,'#382f35');line(c,[[-3,10],[-2,12]],'#dcd1b8',1.3);line(c,[[3,10],[2,12]],'#dcd1b8',1.3);
}
function deepcaller(c,p){
  for(let i=0;i<6;i++){const x=(i-2.5)*13,s=x<0?-1:1,y=14+(i%2)*5;const endX=x+s*(18+Math.abs(x)*.3),endY=29+(i%2)*6;c.strokeStyle='#345d72';c.lineWidth=13;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+s*13,39+p*s,endX,40,endX,25+p*s);c.stroke();c.strokeStyle='#86bcc4';c.lineWidth=7;c.stroke();for(let k=0;k<3;k++)oval(c,x+s*(8+k*5),y+10+k*2,1.8,1.4,'#d1d9bd');}
  oval(c,0,-9,37,39,grad(c,-35,29,30,-49,['#3c6b83','#6d9da9','#b2d3cc']));
  poly(c,[[-27,-24],[-20,-48],[-9,-43],[0,-59],[10,-44],[23,-49],[28,-25]],'#79a9b8','#345b76',1.5);line(c,[[-20,-35],[-12,-27],[0,-30],[13,-26],[21,-36]],'#d3ddd1',1.8);
  for(const s of [-1,1]){oval(c,s*13,1,7,8,'#dce7d1');oval(c,s*12,2,2.7,5,'#244657');line(c,[[s*6,-7],[s*20,-10]],'#487c91',2.5);}
  oval(c,0,18,6,4,'#42677a');jewel(c,0,-27,9,'#e4d4a2');
}
function frostcrown(c,p,flip){c.save();c.scale(flip,1);
  for(const x of [-27,-8,16,33]){const step=p*(x%2?-1:1)*2;poly(c,[[x-4,8],[x+5,8],[x+3+step,33],[x+7+step,36],[x-5+step,37]],'#81a7b7','#3f637d',1.1);line(c,[[x,12],[x+step,30]],'#d2e7e4',1.6);}
  oval(c,-5,-3,42,24,grad(c,-46*flip,23,42*flip,-29,['#557b98','#97bcc7','#e0ebe0']));poly(c,[[-40,-6],[-53,-10],[-56,-7],[-43,1]],'#b9d2d2','#557d91',.9);
  poly(c,[[21,3],[23,-29],[33,-45],[46,-40],[47,-13],[35,8]],grad(c,21*flip,9,47*flip,-43,['#7199af','#b2d0d2','#edf3e4']),'#476b85',1.4);
  oval(c,49,-32,18,11,'#c5dcd8');poly(c,[[60,-36],[70,-31],[65,-24],[52,-24]],'#a7c7cc','#547c92',1);oval(c,52,-36,2.5,2.6,'#26475d');
  for(const [x,s]of[[34,-1],[44,1]]){line(c,[[x,-39],[x+s*4,-51],[x+s*12,-62]],'#bfdde1',4);line(c,[[x+s*4,-50],[x+s*15,-49],[x+s*19,-57]],'#b0d4df',3);line(c,[[x+s*10,-60],[x+s*7,-67]],'#e0efeb',2.6);}
  poly(c,[[22,-13],[29,-25],[36,-13],[31,2]],'#cae6e8');jewel(c,32,-13,8,'#e6fbef');c.restore();
}
function furnace(c,p){
  for(const s of [-1,1]){foot(c,s*21,40,p*s*2,'#575856');poly(c,[[s*30,-21],[s*45,-14],[s*51,8+p*s],[s*48,24],[s*35,27],[s*29,13]],grad(c,-50,28,49,-25,['#3a4446','#6f7370','#a8a28b']),'#29373b',1.8);line(c,[[s*37,-8],[s*40,8],[s*43,15]],'#e2a05e',2);}
  poly(c,[[-29,-27],[-15,-36],[18,-36],[31,-25],[35,23],[21,36],[-21,36],[-35,23]],grad(c,-35,35,32,-36,['#394647','#6a7470','#aba88e']),'#283a3d',2);
  poly(c,[[-20,-10],[-11,-19],[12,-19],[21,-9],[18,16],[0,23],[-18,16]],'#323b3a','#b59d75',2);
  oval(c,0,1,15,17,'#b9663d');poly(c,[[-9,12],[-12,2],[-4,-5],[-2,-14],[7,-6],[10,5],[4,14]],'#efad5e');poly(c,[[-4,12],[-5,3],[2,-3],[5,8],[1,14]],'#ffe2a0');
  for(const x of [-10,0,10])line(c,[[x,-14],[x,19]],'#52605b',3.4);
  poly(c,[[-17,-36],[-16,-52],[-7,-60],[11,-61],[21,-50],[18,-34]],'#829087','#3d504d',1.6);line(c,[[-11,-44],[-3,-42]],'#ffdc94',3);line(c,[[7,-42],[15,-45]],'#ffdc94',3);
  poly(c,[[-27,-27],[-31,-51],[-24,-54],[-17,-34]],'#657873','#394e4d',1.2);poly(c,[[20,-34],[25,-54],[33,-50],[30,-24]],'#87968a','#3e5350',1.2);
}
const phaseNames=Object.freeze({web:'织网',summon:'召集幼蛛',leap:'跃袭',tentacles:'触腕拍击',wave:'潮汐横扫',frost:'冰棱散射',frostCharge:'霜径冲锋',shatter:'碎冰震荡',furnaceMarch:'炽热踏步',eruption:'熔压喷发',domain:'荒野领域',vortex:'虚空漩涡',frostRing:'寒霜环',flameStream:'焰流',tidalWave:'潮汐波',fireball:'火球术',frostbolt:'冰霜术'});
function bossOverlay(kind,color){return(c,e,{dense})=>{if(e.bossKind!==kind)return;if(e.specialAttack?.phase==='windup'){star(c,0,-30,5,color);if(!dense){line(c,[[-12,-30],[-7,-30]],color,1.5);line(c,[[7,-30],[12,-30]],color,1.5);}}else if(e.specialRecovery>0){line(c,[[-7,-19],[-3,-17]],'#e7d9b6',1.3);line(c,[[3,-17],[7,-19]],'#e7d9b6',1.3);}};}
const bossArt=(kind,paint,color,extra={})=>Object.freeze({paint,isStill:still,poseWave:walk,frequency:3,overlay:bossOverlay(kind,color),windingUp:e=>e.bossKind===kind&&e.specialAttack?.phase==='windup',phaseLabel:e=>e.bossKind!==kind?null:e.specialAttack?`${phaseNames[e.specialAttack.kind]||'首领攻击'}${e.specialAttack.phase==='windup'?' · 蓄力':''}`:e.specialRecovery>0?(phaseNames[e.specialPose]||'攻击间歇'):null,...extra});
export const SPECIALIST_ART=Object.freeze({
  rootbinder:Object.freeze({paint:rootbinder,isStill:still,poseWave:walk,overlay:casterOverlay('#bfd88b',0,-20)}),
  boglurker:Object.freeze({paint:boglurker,isStill:still,poseWave:walk,facing:profile,overlay(c,e,{flip}){if(e.specialist?.phase==='windup'){c.save();c.scale(flip,1);oval(c,15,-10,2.1,2.1,'#eddf9d');c.restore();}}}),
  prismguard:Object.freeze({paint:prismguard,isStill:still,poseWave:walk,overlay:casterOverlay('#b9f3ed',0,-5)}),
  tidepriest:Object.freeze({paint:tidepriest,isStill:still,poseWave:walk,overlay:casterOverlay('#bbf1e9',20,-28)}),
  shieldguard:Object.freeze({paint:shieldguard,isStill:still,poseWave:walk,overlay(c,e){if(e.specialist?.phase==='active')line(c,[[-26,-10],[-9,-14],[-2,-7],[-5,12],[-16,20]],'#e8d6a0',1.7);}}),
  stoneape:Object.freeze({paint:stoneape,isStill:still,poseWave:walk,overlay:casterOverlay('#e9d5ad',24,10)}),
  windhunter:Object.freeze({paint:windhunter,facing:profile,frequency:13}),
  frostmage:Object.freeze({paint:frostmage,isStill:still,poseWave:walk,overlay:casterOverlay('#defbff',20,-29)}),
  flamelizard:Object.freeze({paint:flamelizard,isStill:still,poseWave:walk,facing:profile,overlay(c,e,{flip}){if(e.specialist?.phase==='windup'){c.save();c.scale(flip,1);star(c,33,0,3,'#ffe5a4');c.restore();}}}),
  spiderling:Object.freeze({paint:spiderling,poseWave:walk,frequency:14}),
  broodmother:bossArt('broodmother',broodmother,'#e7b7a8'),
  deepcaller:bossArt('deepcaller',deepcaller,'#bcebea'),
  frostcrown:bossArt('frostcrown',frostcrown,'#e1f9ff',{facing:profile}),
  furnace:bossArt('furnace',furnace,'#ffd699')
});
