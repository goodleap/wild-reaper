import { DUNGEON_RULES, HUT_RULES, INTERIOR_REWARDS } from '../interior-profiles.js';
import { createHutState, populateHut, claimHutChest } from '../hut-interior.js';
import { seedFor } from './interior-seed.js';

export const INTERIOR_SCENES=Object.freeze({
  castle:Object.freeze({
    maxStates:DUNGEON_RULES.maxStates,
    create:(dungeon,site)=>dungeon._makeState(site),
    populate:(dungeon,state)=>dungeon._populate(state),
    claimChest(dungeon,state,chest){
      const g=dungeon.game;chest.state='claimed';g.grantResources(INTERIOR_REWARDS.castleSide,'castleSideChest');g.adventure?.dropPickup('herb',chest.x,chest.y+28);g._effect(chest.x,chest.y,'ring',.7,65,'#edca85');g._emit('dungeonChest');return true;
    },
    roomCleared(dungeon,state,room){
      if(room.kind==='boss'||room.rewarded)return;
      room.rewarded=true;const cell=state.cells[room.cellId],g=dungeon.game;
      g.dropCrystals(cell.x,cell.y,DUNGEON_RULES.roomCrystals);
      if(room.heal)g.adventure?.dropPickup('herb',cell.x,cell.y+28);
      g._effect(cell.x,cell.y,'ring',.7,75,'#b9e4c4');g._emit('dungeonRoomCleared',{cellId:room.cellId,crystals:DUNGEON_RULES.roomCrystals,heal:room.heal});
    }
  }),
  hut:Object.freeze({
    maxStates:HUT_RULES.maxStates,
    create:(dungeon,site)=>createHutState(dungeon.game,site,seedFor(`${dungeon.game.regionIndex}:${site.id}:${site.seed??0}`)),
    populate:(dungeon,state)=>populateHut(dungeon.game,state),
    claimChest:(dungeon,state,chest)=>claimHutChest(dungeon.game,state,chest),
    roomCleared(dungeon,state,room){room.rewarded=true;state.site.state='cleared';dungeon.game._emit('houseCleared',{name:state.name});}
  })
});
export const interiorSceneFor=state=>INTERIOR_SCENES[typeof state==='string'?state:state?.kind||'castle'];
