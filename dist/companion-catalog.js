import { getConfigSection } from './content-config.js';
const companions=getConfigSection('companions');
export const COMPANION_RULES=companions.rules;
export const COMPANION_FOLLOW_RULES=companions.followRules;
export const COMPANION_DEFINITIONS=companions.definitions;
export const COMPANIONS=COMPANION_DEFINITIONS;
export const companionDefinition=kind=>COMPANION_DEFINITIONS.find(def=>def.kind===kind)||null;
