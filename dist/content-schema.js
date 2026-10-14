import { validateCombat } from './config-validation/combat.js';
import { validateWorlds } from './config-validation/worlds.js';
import { validateContent } from './config-validation/content.js';
import { validateEnemies } from './config-validation/enemies.js';
import { validateAbilities } from './config-validation/abilities.js';

export const CONTENT_SCHEMA_VERSION=2;
export const CONTENT_SECTION_IDS=Object.freeze(['heroes','combat','enemies','encounters','difficulty','worlds','stages','geography','sites','companions','economy','codex','abilities']);
const forbidden=new Set(['__proto__','prototype','constructor']);
const rgbTuple=value=>/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value)&&value.split(',').every(n=>Number(n)<=255);
function validColor(value){
  if(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))return true;
  const match=/^rgba\(\s*(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/.exec(value);
  return !!match&&rgbTuple(match[1]);
}
function validateText(value,path){
  if(value.length>20000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error(`Invalid text at ${path}`);
  const worldArt=path.startsWith('config.sections.worlds.')&&path.includes('.art.');
  if(worldArt&&path.endsWith('.rgb')){
    if(!rgbTuple(value))throw new Error(`Invalid RGB tuple at ${path}`);
  }else if(/(?:\.color|Color)$/.test(path)||path.includes('.colors.')||(worldArt&&!path.endsWith('.id'))){
    // CSS custom properties and Canvas palettes accept colors, never arbitrary
    // declarations or URLs. Prose remains ordinary text, escaped by its view.
    if(!validColor(value))throw new Error(`Invalid color at ${path}`);
  }
}
function validateJSON(value,path='config',depth=0,budget={remaining:200000}) {
  if(depth>32||--budget.remaining<0)throw new Error('Content configuration is too large');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error(`Non-finite number at ${path}`);return;}
  if(typeof value==='string'){validateText(value,path);return;}
  if(Array.isArray(value)){for(let i=0;i<value.length;i++)validateJSON(value[i],`${path}[${i}]`,depth+1,budget);return;}
  if(typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`Expected JSON data at ${path}`);
  for(const [key,item] of Object.entries(value)){
    if(forbidden.has(key))throw new Error(`Unsupported key at ${path}.${key}`);
    validateJSON(item,`${path}.${key}`,depth+1,budget);
  }
}
export function validateContentPack(pack) {
  validateJSON(pack);
  if(pack.schemaVersion!==CONTENT_SCHEMA_VERSION)throw new Error('Unsupported content schema version');
  if(typeof pack.contentVersion!=='string'||!/^[-a-zA-Z0-9._]{1,80}$/.test(pack.contentVersion))throw new Error('Invalid content version');
  const sections=pack.sections;
  if(!sections||Array.isArray(sections)||Object.keys(sections).length!==CONTENT_SECTION_IDS.length||CONTENT_SECTION_IDS.some(id=>!sections[id]||typeof sections[id]!=='object'||Array.isArray(sections[id])))throw new Error('Incomplete content pack');
  validateCombat(sections);validateAbilities(sections);validateEnemies(sections);validateWorlds(sections);validateContent(sections);
  return pack;
}
export function freezeContent(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freezeContent(child);
    Object.freeze(value);
  }
  return value;
}
