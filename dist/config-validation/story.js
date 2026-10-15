export function validateStory(sections) {
  const definitions=sections.story?.definitions;
  const fail=path=>{throw new TypeError(`Invalid story.${path}`);};
  if(!Array.isArray(definitions)||!definitions.length||definitions.length>64)fail('definitions');
  const ids=new Set();
  for(const entry of definitions) {
    const path=`definitions.${entry?.id??'unknown'}`;
    if(typeof entry?.id!=='string'||!/^[a-z][a-z0-9-]{0,48}$/.test(entry.id)||ids.has(entry.id))fail(path);ids.add(entry.id);
    if(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>40)fail(`${path}.name`);
    const world=sections.worlds?.definitions?.find(world=>world.id===entry.worldId);
    if(!world)fail(`${path}.worldId`);
    if(!Array.isArray(entry.heroIds)||!entry.heroIds.length||entry.heroIds.some(id=>!sections.heroes?.definitions?.some(hero=>hero.id===id)))fail(`${path}.heroIds`);
    if(!Array.isArray(entry.weaponIds)||!entry.weaponIds.length||entry.weaponIds.some(id=>!['sword','arrow','orbit'].includes(id)))fail(`${path}.weaponIds`);
    const steps=entry.steps;
    if(!Array.isArray(steps)||steps.length<2||new Set(steps).size!==steps.length||steps.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]*$/.test(id)))fail(`${path}.steps`);
    const layout=world.authored;
    for(const key of ['wakeArea','meetingArea','refugeArea'])if(!layout?.areas?.some(area=>area.id===entry.anchors?.[key]))fail(`${path}.anchors.${key}`);
    for(const key of ['searchPassage','escapePassage'])if(!layout?.passages?.some(passage=>passage.id===entry.anchors?.[key]))fail(`${path}.anchors.${key}`);
    const rules=entry.rules;
    for(const key of ['noticeRange','arrivalRadius','pillDuration','moveSpeedBonus','damageReductionBonus','damageReductionCap','guardRadius','guardReduction','guardHealing','sanctuaryWaveSeconds','judgmentDamage','judgmentDuration','judgmentWindup'])if(!Number.isFinite(rules?.[key])||rules[key]<=0)fail(`${path}.rules.${key}`);
    if(rules.damageReductionBonus>=1||rules.damageReductionCap>=1||rules.damageReductionBonus>rules.damageReductionCap||rules.guardReduction>=1||rules.guardHealing>1||rules.pillDuration>120||rules.judgmentDamage!==9999)fail(`${path}.rules`);
    validateStoryPursuit(entry.pursuit,steps,sections,rules);
    if(!entry.dialogue||typeof entry.dialogue!=='object')fail(`${path}.dialogue`);
    const scopes=entry.dialogueScopes;
    if(!scopes||typeof scopes!=='object'||Array.isArray(scopes))fail(`${path}.dialogueScopes`);
    for(const [step,scope] of Object.entries(scopes))if(!steps.includes(step)||!Object.hasOwn(entry.dialogue,step)||!['stage','chapter'].includes(scope))fail(`${path}.dialogueScopes.${step}`);
    for(const [step,lines] of Object.entries(entry.dialogue)) {
      if(!steps.includes(step)||!Array.isArray(lines)||!lines.length||lines.length>12)fail(`${path}.dialogue.${step}`);
      if(!Object.hasOwn(scopes,step))fail(`${path}.dialogueScopes.${step}`);
      for(const line of lines)if(!['player','princess','angel'].includes(line?.speaker)||typeof line.text!=='string'||!line.text.trim()||line.text.length>48||/[\r\n<>]/.test(line.text))fail(`${path}.dialogue.${step}`);
    }
  }
  return true;
}

const positive=n=>Number.isFinite(n)&&n>0;
export function validateStoryPursuit(config,steps,sections,rules={}) {
  const fail=()=>{throw new TypeError('Invalid story pursuit configuration');};
  if(!config||!config.profiles||!config.stages)fail();
  for(const key of ['totalLimit','leaderLimit','activeRadius','retireRadius','retireSeconds','spawnMargin','admissionSeconds'])if(!positive(config[key]))fail();
  if(!Number.isInteger(config.totalLimit)||config.totalLimit>80||!Number.isInteger(config.leaderLimit)||config.leaderLimit>3||config.retireRadius<=config.activeRadius)fail();
  for(const profile of Object.values(config.profiles)){
    if(!sections.enemies?.definitions?.[profile.type]||!['chase','native'].includes(profile.behavior))fail();
    for(const key of ['hp','speed','damage','xp'])if(!positive(profile[key]))fail();
    if(profile.hp>=9999||profile.speed>640||(profile.type==='boss')!==(profile.leader===true)||profile.type==='boss'&&!sections.enemies?.bosses?.[profile.bossKind])fail();
  }
  for(const [stage,configStage] of Object.entries(config.stages)){
    if(!steps.includes(stage)||!Number.isInteger(configStage.target)||configStage.target<0||configStage.target>config.totalLimit-config.leaderLimit)fail();
    if(configStage.ramp){
      const ramp=configStage.ramp;
      if(!Number.isInteger(ramp.from)||ramp.from<0||!Number.isInteger(ramp.to)||ramp.to<ramp.from||ramp.to>config.totalLimit-config.leaderLimit||!positive(ramp.duration))fail();
      if(ramp.startedAt!==undefined&&ramp.startedAt!=='_medicineReceivedAt')fail();
    }
    if(configStage.endWindow){
      const window=configStage.endWindow;
      // These names refer to actual chapter timing fields. Typos must fail a
      // build instead of leaving a reinforcement source open indefinitely.
      if(window.startedAt!=='_judgmentStartedAt'||window.durationRule!=='judgmentDuration'||!positive(rules[window.durationRule])||!positive(window.stopBeforeEndSeconds)||window.stopBeforeEndSeconds>=rules[window.durationRule])fail();
    }
    if(!configStage.target)continue;
    if(!positive(configStage.interval)||!Number.isInteger(configStage.batch)||configStage.batch<=0||configStage.batch>configStage.target)fail();
    if(!Array.isArray(configStage.roster)||!configStage.roster.length||configStage.roster.some(id=>!config.profiles[id]||config.profiles[id].leader))fail();
    if(configStage.leader&&(!config.profiles[configStage.leader]?.leader||!positive(configStage.leaderInterval)))fail();
    if(configStage.leaderCount!==undefined&&(!configStage.leader||!Number.isInteger(configStage.leaderCount)||configStage.leaderCount<1||configStage.leaderCount>config.leaderLimit))fail();
  }
  return true;
}
