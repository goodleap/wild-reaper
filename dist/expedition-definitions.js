import { getConfigSection } from './content-config.js';

// Expedition identity is separate from the persistent eight world trials.
export const EXPEDITIONS=Object.freeze(getConfigSection('stages').expeditions||[]);
const BY_ID=new Map(EXPEDITIONS.map(definition=>[definition.id,definition]));
export const getExpeditionDefinition=id=>BY_ID.get(id)||null;
