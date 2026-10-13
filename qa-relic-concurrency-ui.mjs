import assert from 'node:assert/strict';
import { harness } from './qa-app-harness.mjs';
import { AdventureArchive } from './dist/adventure-archive.js';

const h=harness('?debug');
h.run(`startGame();game.enemies=[];game.relicSites.sites=[];
  game.companions.camps=[
    {id:'far',kind:'stormcaller',name:'唤雷者',x:game.player.x+170,y:game.player.y+19.8,state:'trapped',siteId:'far-site',guardIds:[],guardTotal:6,remainingGuards:6,life:70},
    {id:'near',kind:'warden',name:'守林人',x:game.player.x+40,y:game.player.y+19.8,state:'ready',siteId:'near-site',guardIds:[],guardTotal:6,remainingGuards:0,life:70}
  ];
  game.encounters.activities=[{id:'hunt',siteId:'hunt-site',type:'hunt',x:game.player.x+300,y:game.player.y,r:245,progress:4,goal:24,life:70}];
  updateEncounterHUD();`);
assert.equal(h.nodes['encounter-name'].textContent,'营救守林人','HUD selects the nearest engaged challenge, not the first stored camp');
const rendered=JSON.parse(h.run(`JSON.stringify((()=>{const kinds=[],original=drawCompanion;drawCompanion=actor=>{if(actor.entity.isCaptive)kinds.push(actor.entity.kind);};shippedRenderGame();drawCompanion=original;return kinds;})())`));
assert(rendered.includes('stormcaller')&&rendered.includes('warden'),'all visible concurrent captives are rendered');
h.run(`game.player.x+=300;updateEncounterHUD();`);
assert.equal(h.nodes['encounter-name'].textContent,'林间狩猎','HUD can select an encounter while camps remain active');

const archive=new AdventureArchive({storage:{getItem(){return null;},setItem(){}}});
const game={difficulty:'normal',debug:true,runTime:0,kills:0,bossKills:0,player:{level:1},companions:{members:[],camps:[{kind:'stormcaller',visible:false},{kind:'warden',visible:true}]},relicSites:{sites:[]},_inView:entity=>entity.visible};
archive.begin(game);archive.observe(game);
assert(!archive.data.entries['companion:stormcaller']);
assert(archive.data.entries['companion:warden']?.seen,'a visible later camp unlocks without disclosing hidden camps');
console.log('Concurrent relic UI: nearest HUD objective, multiple captive actors, encounter selection and visibility-gated archive discovery passed.');
