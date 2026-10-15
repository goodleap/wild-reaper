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
    for(const key of ['noticeRange','arrivalRadius','pillDuration','moveSpeedBonus','damageReductionBonus','damageReductionCap','guardRadius','guardReduction','guardHealing','sanctuaryWaveSeconds','judgmentDamage','judgmentDuration','maxEnemies'])if(!Number.isFinite(rules?.[key])||rules[key]<=0)fail(`${path}.rules.${key}`);
    if(rules.damageReductionBonus>=1||rules.damageReductionCap>=1||rules.damageReductionBonus>rules.damageReductionCap||rules.guardReduction>=1||rules.guardHealing>1||rules.pillDuration>120||rules.maxEnemies>80||!Number.isInteger(rules.maxEnemies)||rules.judgmentDamage!==9999)fail(`${path}.rules`);
    if(!entry.dialogue||typeof entry.dialogue!=='object')fail(`${path}.dialogue`);
    for(const [step,lines] of Object.entries(entry.dialogue)) {
      if(!steps.includes(step)||!Array.isArray(lines)||!lines.length||lines.length>12)fail(`${path}.dialogue.${step}`);
      for(const line of lines)if(!['player','princess','angel'].includes(line?.speaker)||typeof line.text!=='string'||!line.text.trim()||line.text.length>48||/[\r\n<>]/.test(line.text))fail(`${path}.dialogue.${step}`);
    }
  }
  return true;
}
