const fail=(path,message)=>{throw new TypeError(`Content config abilities.${path}: ${message}`);};
const object=(v,p)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(p,'expected object');return v;};
const numeric=(v,p,min=0,max=1e6)=>{if(!Number.isFinite(v)||v<min||v>max)fail(p,'invalid numeric value');};
const families=new Set(['weapon','general','exclusive']);
const actors=new Set(['player','companion','enemy','boss']);
const shapes=new Set(['projectile','shield','ring','zone','cone','wave','field','beam']);
const profiles=new Set(['ground','projectile']);
const rules=['maxEffects','maxHostileEffects','maxFields','maxFieldsPerCaster','maxStatuses','minimumEnemyWindup','maxFreeze','maxFriendlyFreeze','friendlyFreezeImmunity','minSlowMultiplier','maxPullSpeed','maxPushDistance'];
const parameters=new Set(['speed','range','radius','duration','damage','windup','burnDamage','burnDuration','burnInterval','slowMultiplier','slowDuration','freezeChance','freezeDuration','freezeImmunity','bossFreezeMultiplier','bossFreezeImmunity','shield','knockback','tickInterval','spread','pullSpeed']);
export function validateAbilities(sections){
  const config=object(sections.abilities,'root'),limits=object(config.rules,'rules'),defs=object(config.definitions,'definitions');
  for(const key of rules)numeric(limits[key],`rules.${key}`,0,10000);
  for(const key of ['maxEffects','maxHostileEffects','maxFields','maxFieldsPerCaster','maxStatuses'])if(!Number.isInteger(limits[key])||limits[key]<1||limits[key]>1000)fail(`rules.${key}`,'invalid bounded capacity');
  numeric(limits.minimumEnemyWindup,'rules.minimumEnemyWindup',.15,3);numeric(limits.minSlowMultiplier,'rules.minSlowMultiplier',.2,1);numeric(limits.maxFreeze,'rules.maxFreeze',0,3);numeric(limits.maxFriendlyFreeze,'rules.maxFriendlyFreeze',0,.5);numeric(limits.friendlyFreezeImmunity,'rules.friendlyFreezeImmunity',1,30);
  const ownerIds=new Set([...(sections.heroes?.definitions||[]).map(v=>v.id),...Object.keys(sections.enemies?.definitions||{}),...Object.keys(sections.enemies?.bosses||{}),...Object.keys(sections.companions?.definitions||{})]);
  for(const [id,def] of Object.entries(defs)){
    object(def,`definitions.${id}`);if(def.id!==id||!/^[a-zA-Z][a-zA-Z0-9]*$/.test(id))fail(id,'invalid stable ID');
    if(typeof def.name!=='string'||!def.name.length||def.name.length>100)fail(id,'invalid name');
    if(!families.has(def.family)||!shapes.has(def.shape)||!profiles.has(def.profile))fail(id,'unknown classification or behavior');
    if(!Array.isArray(def.allowedActors)||!def.allowedActors.length||def.allowedActors.some(v=>!actors.has(v)))fail(id,'invalid actor permissions');
    if(!Array.isArray(def.exclusiveOwnerIds)||def.exclusiveOwnerIds.some(v=>typeof v!=='string'||!v.length))fail(id,'invalid owner IDs');
    if(def.exclusiveOwnerIds.some(v=>!ownerIds.has(v)))fail(id,'unknown exclusive owner');
    if(def.family!=='exclusive'&&def.exclusiveOwnerIds.length)fail(id,'only exclusive abilities bind an owner');
    const p=object(def.parameters,`${id}.parameters`);
    for(const [key,value] of Object.entries(p)){if(!parameters.has(key))fail(id,`unknown parameter ${key}`);numeric(value,`${id}.${key}`,0,10000);}
    for(const key of ['duration','damage','windup'])numeric(p[key],`${id}.${key}`);
    if(p.duration<=0||p.duration>30)fail(id,'duration outside effect budget');
    if(['projectile','wave'].includes(def.shape)&&(!(p.speed>0)||!(p.range>0)))fail(id,'moving attack requires speed and range');
    if(def.shape!=='shield'&&!(p.radius>0))fail(id,'requires radius');
    if(['field','cone'].includes(def.shape)&&!(p.tickInterval>=.1))fail(id,'continuous damage requires bounded interval');
    for(const key of ['freezeChance','slowMultiplier','bossFreezeMultiplier'])if(p[key]!==undefined)numeric(p[key],`${id}.${key}`,0,1);
    if(p.burnDamage>0&&!(p.burnInterval>=.1))fail(id,'burn interval required');
  }
  for(const id of ['fireball','frostbolt','barrier','pulse','lightning','storm','meteor','swords','domain','vortex','frostRing','flameStream','tidalWave'])if(!defs[id])fail(id,'missing required ability');
  for(const id of ['domain','vortex','frostRing','flameStream','tidalWave'])if(defs[id].allowedActors.some(actor=>actor!=='boss'))fail(id,'this ability is reserved for Boss actors');
  return true;
}
