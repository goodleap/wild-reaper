const requiredLines=['angel','angelHeal','merchantFar','merchantNear','captive','rescueReady','recruit','join','stormcallerSupport','wardenSupport','golemJoin','golemSupport','dogHelp','dogJoin','dogSupport','owlHelp','owlJoin','owlSupport','golemHelp','enemyAlert','rootbinder','prismguard','tidepriest','shieldguard','frostmage','brute','boar','stoneape','boglurker','beetle','bat','windhunter','flamelizard','slime','spore','spiderling','ancient','ancientHurt','bloom','bloomHurt','broodmother','broodmotherHurt','deepcaller','deepcallerHurt','frostcrown','frostcrownHurt','furnace','furnaceHurt'];
export function validateDialogueConfig(sites){
  const fail=key=>{throw new TypeError(`Invalid sites.dialogue.${key}`);};
  const dialogue=sites?.dialogue;if(!dialogue||typeof dialogue!=='object'||Array.isArray(dialogue))fail('missing');
  const rules=dialogue.rules;if(!rules||typeof rules!=='object'||Array.isArray(rules))fail('rules');
  for(const key of ['duration','queueDuration','greetingCooldown','supportCooldown','groupCooldown'])if(!Number.isFinite(rules[key])||rules[key]<.2||rules[key]>120)fail(`rules.${key}`);
  if(rules.duration>8||rules.queueDuration>8)fail('rules.duration');
  if(!Number.isFinite(rules.minDuration)||rules.minDuration<.5||rules.minDuration>rules.duration)fail('rules.minDuration');
  if(!Number.isInteger(rules.maxVisible)||rules.maxVisible<1||rules.maxVisible>2)fail('rules.maxVisible');
  if(!Number.isInteger(rules.combatVisible)||rules.combatVisible<1||rules.combatVisible>rules.maxVisible)fail('rules.combatVisible');
  for(const key of ['combatRange','angelNear','angelExit','merchantNear','merchantNearExit','merchantFar','merchantFarExit','captiveNear','captiveExit','rescueReadyRange','supportRange'])if(!Number.isFinite(rules[key])||rules[key]<20||rules[key]>1500)fail(`rules.${key}`);
  for(const [near,far]of [['angelNear','angelExit'],['merchantNear','merchantNearExit'],['merchantFar','merchantFarExit'],['captiveNear','captiveExit'],['rescueReadyRange','captiveExit'],['merchantNear','merchantFar']])if(rules[near]>=rules[far])fail(`rules.${near}`);
  const lines=dialogue.lines;if(!lines||typeof lines!=='object'||Array.isArray(lines))fail('lines');
  for(const key of requiredLines)if(!Array.isArray(lines[key])||!lines[key].length)fail(`lines.${key}`);
  for(const [key,variants]of Object.entries(lines)){
    if(!Array.isArray(variants)||!variants.length||variants.length>8)fail(`lines.${key}`);
    for(const line of variants){
      if(typeof line!=='string'||!line.trim()||line.length>34||/[\r\n<>]/.test(line))fail(`lines.${key}`);
      if(/[{}]/.test(line.replaceAll('{hero}','')))fail(`lines.${key}.placeholder`);
    }
  }
  if(!dialogue.player||typeof dialogue.player!=='object'||Array.isArray(dialogue.player))fail('player');
  {
    const player=dialogue.player;
    if(!player.rules||!player.voices)fail('player');
    for(const key of ['globalCooldown','hurtCooldown','crisisCooldown','spellCooldown','battleCooldown','idleMin','idleMax','repeatCooldown','combatRange'])if(!Number.isFinite(player.rules[key])||player.rules[key]<=0||player.rules[key]>1500)fail(`player.rules.${key}`);
    if(player.rules.idleMin>player.rules.idleMax)fail('player.rules.idleMin');
    for(const hero of ['traveler','princess','elder'])for(const key of ['hurt','alert','surrounded','retreat','determined','encourage','storm','meteor','swords','forest','marsh','ruins','interior']){
      const variants=player.voices[hero]?.[key];
      if(!Array.isArray(variants)||!variants.length||variants.length>8)fail(`player.voices.${hero}.${key}`);
      for(const line of variants)if(typeof line!=='string'||!line.trim()||line.length>34||/[\r\n<>{}]/.test(line))fail(`player.voices.${hero}.${key}`);
    }
  }
  return true;
}
