import { getConfigSection } from './content-config.js';
import { defineStage } from './stages/define-stage.js';

export const STAGES=Object.freeze(getConfigSection('stages').definitions.map(defineStage));
const BY_ID=new Map(STAGES.map(stage=>[stage.id,stage]));
if(BY_ID.size!==STAGES.length)throw new Error('Duplicate stage identity');
const mapIds=STAGES.flatMap(stage=>stage.islands.map(map=>map.id));
if(new Set(mapIds).size!==mapIds.length)throw new Error('Duplicate stage map identity');
export const getStageDefinition=id=>BY_ID.get(id)||null;
