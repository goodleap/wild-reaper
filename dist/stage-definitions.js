import forest from './stages/forest.js';
import marsh from './stages/marsh.js';
import ruins from './stages/ruins.js';
import beach from './stages/beach.js';
import city from './stages/city.js';
import mountain from './stages/mountain.js';
import snow from './stages/snow.js';
import volcano from './stages/volcano.js';

export const STAGES=Object.freeze([forest,marsh,ruins,beach,city,mountain,snow,volcano]);
const BY_ID=new Map(STAGES.map(stage=>[stage.id,stage]));
if(BY_ID.size!==STAGES.length)throw new Error('Duplicate stage identity');
const mapIds=STAGES.flatMap(stage=>stage.islands.map(map=>map.id));
if(new Set(mapIds).size!==mapIds.length)throw new Error('Duplicate stage map identity');
export const getStageDefinition=id=>BY_ID.get(id)||null;
