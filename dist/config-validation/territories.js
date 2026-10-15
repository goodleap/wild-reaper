export function validateTerritories(sections) {
  const rules=sections.difficulty?.territories;
  if(!rules||typeof rules!=='object'||Array.isArray(rules))throw new TypeError('Missing difficulty.territories');
  const fail=key=>{throw new TypeError(`Invalid difficulty.territories.${key}`);};
  for(const key of ['maxGroups','radius','spacing','notice','leash','enemyLeash','disengageDelay','returnArrival','patrolRadius','patrolSpeed','simulationRange','baseMembers','typeBaseTime','typeRingTime','rallyDelay','rallySpeed','provokedDuration'])if(!Number.isFinite(rules[key])||rules[key]<=0)fail(key);
  if(!Number.isInteger(rules.maxGroups)||rules.maxGroups>40)fail('maxGroups');
  if(!Number.isInteger(rules.baseMembers)||rules.baseMembers>20)fail('baseMembers');
  if(!Number.isInteger(rules.eliteStartRing)||rules.eliteStartRing<0||!Number.isInteger(rules.eliteGroupInterval)||rules.eliteGroupInterval<1)fail('elites');
  if(!Array.isArray(rules.eliteAffixes)||!rules.eliteAffixes.length||rules.eliteAffixes.some(id=>!['shield','swift','summoner'].includes(id)))fail('eliteAffixes');
  if(!Number.isFinite(rules.ringStrength)||rules.ringStrength<0||rules.ringStrength>2)fail('ringStrength');
  if(rules.patrolSpeed>1||rules.patrolRadius>=rules.radius)fail('patrol');
  if(rules.leash<=rules.radius||rules.enemyLeash<=rules.radius||rules.spacing<=rules.radius*2)fail('boundaries');
  if(!Array.isArray(rules.ringRadii)||!rules.ringRadii.length||rules.ringRadii.length>10)fail('ringRadii');
  rules.ringRadii.forEach((radius,i)=>{if(!Number.isFinite(radius)||radius<=rules.radius+260||(i>0&&radius<=rules.ringRadii[i-1]))fail('ringRadii');});
}
