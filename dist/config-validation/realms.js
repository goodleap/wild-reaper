const fail=path=>{throw new TypeError(`Invalid realm configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const number=(value,path,min=0,max=1e6)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const integer=(value,path,min=0,max=1e6)=>{number(value,path,min,max);if(!Number.isSafeInteger(value))fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>80)fail(path);return value;};

export function validateRealms(sections) {
  const c=object(sections.realms,'realms');
  if(!Array.isArray(c.enabledModes)||c.enabledModes.length!==1||c.enabledModes[0]!=='world')fail('enabledModes');
  if(!Array.isArray(c.definitions)||c.definitions.length!==4)fail('definitions');
  const ids=new Set();let nextLevel=1;
  for(const [i,realm] of c.definitions.entries()) {
    const path=`definitions[${i}]`;object(realm,path);text(realm.id,path+'.id');text(realm.name,path+'.name');
    if(ids.has(realm.id))fail(path+'.id');ids.add(realm.id);
    if(integer(realm.minLevel,path+'.minLevel',1)!==nextLevel)fail(path+'.minLevel');
    if(i===c.definitions.length-1) {
      if(realm.maxLevel!==null||realm.bolts!==0||realm.duration!==0)fail(path+'.terminal');
    }else {
      integer(realm.maxLevel,path+'.maxLevel',realm.minLevel);nextLevel=realm.maxLevel+1;
      integer(realm.bolts,path+'.bolts',1,12);number(realm.duration,path+'.duration',2,60);
    }
  }
  const t=object(c.trial,'trial');
  for(const key of ['boltRadius','boltSpreadRadius'])number(t[key],'trial.'+key,1,1000);
  number(t.warning,'trial.warning',.5,5);number(t.retrySeconds,'trial.retrySeconds',0,300);
  if(t.boltRadius>=t.boltSpreadRadius||c.definitions.some(r=>r.bolts&&r.duration/r.bolts<=t.warning))fail('trial.geometry/timing');
  number(t.pressureRatio,'trial.pressureRatio',.01,1);number(t.directRatio,'trial.directRatio',.01,1);
  const m=object(c.materials,'materials');text(m.id,'materials.id');text(m.name,'materials.name');
  integer(m.maxPerTrial,'materials.maxPerTrial',1,3);number(m.damageReductionEach,'materials.damageReductionEach',0,.3);
  if(m.damageReductionEach*m.maxPerTrial>=1)fail('materials.reduction');
  integer(m.inventoryCap,'materials.inventoryCap',m.maxPerTrial,999);
  for(const key of ['starter','eliteDrop','bossDrop'])integer(m[key],'materials.'+key,1,m.inventoryCap);
  if(m.starter<m.maxPerTrial||m.bossDrop<m.eliteDrop)fail('materials.supply');
  const colors=object(c.colors,'colors');for(const key of ['warning','strike'])if(!/^#[\da-f]{6}$/i.test(colors[key]))fail('colors.'+key);
  return c;
}
