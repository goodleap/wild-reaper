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
    if(entry.id==='false-orders'){
      validateChapter(entry,layout,sections,fail,path);continue;
    }
    if(entry.id!=='prologue')fail(`${path}.id`);
    for(const key of ['wakeArea','meetingArea','refugeArea'])if(!layout?.areas?.some(area=>area.id===entry.anchors?.[key]))fail(`${path}.anchors.${key}`);
    for(const key of ['entryPassage','searchPassage','escapePassage'])if(!layout?.passages?.some(passage=>passage.id===entry.anchors?.[key]))fail(`${path}.anchors.${key}`);
    const rules=entry.rules;
    for(const key of ['noticeRange','arrivalRadius','pillDuration','moveSpeedBonus','damageReductionBonus','damageReductionCap','guardRadius','guardReduction','guardHealing','sanctuaryWaveSeconds','judgmentDamage','judgmentDuration','judgmentWindup','prayerDuration','prayerRadius','arrivalDuration'])if(!Number.isFinite(rules?.[key])||rules[key]<=0)fail(`${path}.rules.${key}`);
    if(rules.judgmentWindup>=rules.judgmentDuration)fail(`${path}.rules.judgmentWindup`);
    if(typeof entry.summonLine!=='string'||!entry.summonLine.trim()||entry.summonLine.length>48||/[\r\n<>]/.test(entry.summonLine))fail(`${path}.summonLine`);
    if(rules.damageReductionBonus>=1||rules.damageReductionCap>=1||rules.damageReductionBonus>rules.damageReductionCap||rules.guardReduction>=1||rules.guardHealing>1||rules.pillDuration>120||rules.judgmentDamage!==9999)fail(`${path}.rules`);
    validateStoryPursuit(entry.pursuit,steps,sections,rules);
    if(!entry.dialogue||typeof entry.dialogue!=='object')fail(`${path}.dialogue`);
    const scopes=entry.dialogueScopes;
    if(!scopes||typeof scopes!=='object'||Array.isArray(scopes))fail(`${path}.dialogueScopes`);
    for(const [step,scope] of Object.entries(scopes))if(!steps.includes(step)||!Object.hasOwn(entry.dialogue,step)||!['stage','chapter'].includes(scope))fail(`${path}.dialogueScopes.${step}`);
    for(const [step,lines] of Object.entries(entry.dialogue)) {
      if(!steps.includes(step)||!Array.isArray(lines)||!lines.length||lines.length>12)fail(`${path}.dialogue.${step}`);
      if(!Object.hasOwn(scopes,step))fail(`${path}.dialogueScopes.${step}`);
      for(const line of lines)if(!['player','princess','angel','searcher'].includes(line?.speaker)||typeof line.text!=='string'||!line.text.trim()||line.text.length>48||/[\r\n<>]/.test(line.text))fail(`${path}.dialogue.${step}`);
    }
  }
  for(const entry of definitions)if(entry.requiredChapterId&&!ids.has(entry.requiredChapterId))fail(`definitions.${entry.id}.requiredChapterId`);
  return true;
}

function validateChapter(entry,layout,sections,fail,path){
  if(entry.kind!=='chapter'||entry.chapter!==1||entry.requiredChapterId!=='prologue')fail(`${path}.chapter`);
  const steps=['meeting','notice','witness','scout','infiltrate','rescue','withdraw','debrief','northroad','departure','complete'];
  if(entry.steps.length!==steps.length||steps.some((step,index)=>entry.steps[index]!==step))fail(`${path}.steps`);
  const text=value=>typeof value==='string'&&value.trim()&&value.length<=160&&!/[\r\n<>]/.test(value);
  for(const key of ['summary','completionSummary'])if(!text(entry[key]))fail(`${path}.${key}`);
  for(const key of ['contactArea','levyArea','campArea','exitArea'])if(!layout?.areas?.some(area=>area.id===entry.anchors?.[key]))fail(`${path}.anchors.${key}`);
  if(!layout?.passages?.some(passage=>passage.id===`${entry.anchors.campArea}-${entry.anchors.exitArea}`&&passage.waypoints?.length))fail(`${path}.anchors.reinforcementPassage`);
  for(const key of ['arrivalRadius','interactionRadius','guardNotice'])if(!Number.isFinite(entry.rules?.[key])||entry.rules[key]<=0||entry.rules[key]>1000)fail(`${path}.rules.${key}`);
  if(!Number.isFinite(entry.rules?.recovery)||entry.rules.recovery<=0||entry.rules.recovery>1)fail(`${path}.rules.recovery`);
  const starting=entry.startingBuild;
  if(!starting||typeof starting!=='object'||Array.isArray(starting)||Object.keys(starting).length!==3)fail(`${path}.startingBuild`);
  for(const id of ['sword','barrier','vitality']){
    const max=sections.combat?.weapons?.[id]?.maxBaseRank??sections.combat?.skills?.[id]?.maxBaseRank??20;
    if(!Number.isSafeInteger(starting[id])||starting[id]<1||starting[id]>max)fail(`${path}.startingBuild.${id}`);
  }
  const dialogue=entry.dialogue,keys=['meeting','notice','witness','scout','debrief','departure'];
  if(!dialogue||typeof dialogue!=='object'||Array.isArray(dialogue)||Object.keys(dialogue).length!==keys.length)fail(`${path}.dialogue`);
  const speakers=new Set(['player','princess','elder','villager','worker','officer','document']);
  for(const key of keys){
    const lines=dialogue[key];
    if(!Array.isArray(lines)||!lines.length||lines.length>12)fail(`${path}.dialogue.${key}`);
    for(const line of lines)if(!speakers.has(line?.speaker)||!text(line.text)||line.text.length>48)fail(`${path}.dialogue.${key}`);
  }
  const exact=(value,keys,field)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail(`${path}.${field}`);
  };
  const sceneKeys=['signalDisabled','exposedOfficer','exposedPrincess','withdraw','workerDeparture','recordsTaken','ledgerTaken','workersFreed','healed','officerEscaped','reinforcements','rescueComplete'];
  exact(entry.sceneLines,sceneKeys,'sceneLines');
  for(const key of sceneKeys){
    const line=entry.sceneLines[key];
    if(!speakers.has(line?.speaker)||!text(line.text)||line.text.length>48)fail(`${path}.sceneLines.${key}`);
  }
  const encounters=entry.encounters;
  exact(encounters,['troops','bosses','reinforcement','support'],'encounters');
  for(const [group,ids] of [['troops',['royalguard','royallancer','royalarbalist','royalmage']],['bosses',['escortmarshal','searchcaptain']]]){
    exact(encounters[group],ids,`encounters.${group}`);
    for(const id of ids){
      if(!(group==='troops'?sections.enemies?.definitions:sections.enemies?.bosses)?.[id])fail(`${path}.encounters.${group}.${id}`);
      const profile=encounters[group][id];
      exact(profile,['hp','speed','damage','xp'],`encounters.${group}.${id}`);
      for(const [key,max] of [['hp',9998],['speed',640],['damage',1000],['xp',1000]])if(!Number.isFinite(profile[key])||profile[key]<=0||profile[key]>max)fail(`${path}.encounters.${group}.${id}.${key}`);
    }
  }
  const reinforcement=encounters.reinforcement,support=encounters.support;
  exact(reinforcement,['firstDelay','interval','waves'],'encounters.reinforcement');
  for(const key of ['firstDelay','interval'])if(!Number.isFinite(reinforcement[key])||reinforcement[key]<=0||reinforcement[key]>120)fail(`${path}.encounters.reinforcement.${key}`);
  if(!Number.isSafeInteger(reinforcement.waves)||reinforcement.waves<0||reinforcement.waves>6)fail(`${path}.encounters.reinforcement.waves`);
  exact(support,['damage','interval','range'],'encounters.support');
  for(const [key,max] of [['damage',1000],['interval',30],['range',540]])if(!Number.isFinite(support[key])||support[key]<=0||support[key]>max)fail(`${path}.encounters.support.${key}`);
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
