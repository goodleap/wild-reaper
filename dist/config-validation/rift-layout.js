export function validateRiftLayout(layout,path,bossIds,reservations,neighbors,worldId='forest'){
  const fail=key=>{throw new TypeError(`Invalid world configuration: ${path}.${key}`);};
  if(!layout||layout.kind!=='rift-forest'||layout.revision!==1)fail('identity');
  const legacy=worldId==='forest';
  if(legacy&&(layout.id!=='rift-forest:1'||layout.worldId&&layout.worldId!=='forest'))fail('identity');
  if(!legacy&&(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(worldId)||layout.worldId!==worldId||layout.id!==`${worldId}:1`))fail('identity');
  if(layout.artTheme!=null&&!['forest','snow'].includes(layout.artTheme))fail('artTheme');
  const array=(value,key,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(key);return value;};
  const number=(value,key,min=-10000,max=10000)=>{if(!Number.isFinite(value)||value<min||value>max)fail(key);};
  const text=(value,key)=>{if(typeof value!=='string'||!value||value.length>128)fail(key);};
  const point=(value,key)=>{if(!value||typeof value!=='object')fail(key);number(value.x,key+'.x');number(value.y,key+'.y');};
  const polygon=(value,key)=>array(value,key,3,legacy?2400:12000).forEach((p,index)=>point(p,key+'.'+index));
  const bounds=layout.bounds;if(!bounds||bounds.maxX-bounds.minX!==(legacy?7200:14400)||bounds.maxY-bounds.minY!==(legacy?5400:10800))fail('bounds');
  for(const key of ['minX','minY','maxX','maxY'])number(bounds[key],'bounds.'+key);
  point(layout.spawn,'spawn');
  const ids=new Set();for(const area of array(layout.areas,'areas',legacy?18:1,legacy?18:64)){
    text(area.id,'area.id');text(area.name,'area.name');if(ids.has(area.id))fail('duplicate area');ids.add(area.id);point(area.center,'area.center');polygon(area.points,'area.points');
  }
  const passageIds=new Set(),gateIds=new Set();for(const passage of array(layout.passages,'passages',legacy?20:0,legacy?64:128)){
    text(passage.id,'passage.id');if(passageIds.has(passage.id))fail('duplicate passage');passageIds.add(passage.id);
    if(!ids.has(passage.from)||(passage.to!==null&&!ids.has(passage.to)))fail('passage endpoints');
    number(passage.width,'passage.width',100,400);polygon(passage.points,'passage.points');array(passage.waypoints,'passage.waypoints',2,32).forEach(p=>point(p,'passage.waypoint'));
    if(!['trail','secret','bridge','shortcut','cave','exit'].includes(passage.kind))fail('passage.kind');
    if(passage.gateId){text(passage.gateId,'gateId');if(gateIds.has(passage.gateId))fail('duplicate gate');gateIds.add(passage.gateId);point(passage.gate,'gate');for(const key of ['ax','ay','bx','by'])number(passage.gate[key],'gate.'+key);number(passage.gate.r,'gate.r',1,50);}
  }
  for(const key of ['boundaries','solidBoundaries'])for(const ring of array(layout[key],key,1,64)){polygon(ring.points,key+'.points');if(typeof ring.hole!=='boolean')fail(key+'.hole');}
  for(const lake of array(layout.lakes,'lakes',1,32)){text(lake.id,'lake.id');polygon(lake.points,'lake.points');if(typeof lake.hole!=='boolean')fail('lake.hole');}
  if(legacy)for(const key of ['spawn','cave05','cave15','shortcut08','shortcut13','shortcutGate','boss11','boss17','exitNorth','exitSouth','exitWest','treasure18','treasure07'])point(layout.landmarks?.[key],'landmark.'+key);
  else {
    const inBounds=(p,key)=>{point(p,key);if(p.x<bounds.minX||p.x>bounds.maxX||p.y<bounds.minY||p.y>bounds.maxY)fail(key+'.bounds');};
    inBounds(layout.spawn,'spawn');
    if(!layout.landmarks||typeof layout.landmarks!=='object'||Array.isArray(layout.landmarks))fail('landmarks');
    inBounds(layout.landmarks.spawn,'landmark.spawn');if(Math.hypot(layout.spawn.x-layout.landmarks.spawn.x,layout.spawn.y-layout.landmarks.spawn.y)>.001)fail('landmark.spawn');
    for(const [id,p] of Object.entries(layout.landmarks)){inBounds(p,'landmark.'+id);if(p.area!=null&&!ids.has(p.area))fail('landmark.area');}
    for(const area of layout.areas){inBounds(area.center,'area.center');text(area.kind,'area.kind');if(area.material!=null&&!['rock','forest'].includes(area.material))fail('area.material');if(area.snowTerrain!=null&&(layout.artTheme!=='snow'||!['snow','ice'].includes(area.snowTerrain)))fail('area.snowTerrain');for(const p of area.points)inBounds(p,'area.point');}
    for(const passage of layout.passages){for(const p of [...passage.points,...passage.waypoints])inBounds(p,'passage.point');}
    for(const key of ['boundaries','solidBoundaries','lakes'])for(const ring of layout[key])for(const p of ring.points)inBounds(p,key+'.point');
    const interactions=layout.interactions;if(!interactions||typeof interactions!=='object')fail('interactions');
    const siteIds=new Set(),caves=new Map(),gates=new Set();
    const site=(s,key)=>{text(s.id,key+'.id');text(s.name,key+'.name');if(siteIds.has(s.id))fail('duplicate interaction');siteIds.add(s.id);};
    for(const cave of array(interactions.caves,'interactions.caves',0,16)){
      site(cave,'cave');inBounds(cave,'cave');text(cave.caveId,'cave.caveId');text(cave.exitName,'cave.exitName');number(cave.seed,'cave.seed',0,2147483647);if(!Number.isInteger(cave.seed))fail('cave.seed');
      if(!ids.has(cave.area))fail('cave.area');
      const mouths=caves.get(cave.caveId)||[];mouths.push(cave);caves.set(cave.caveId,mouths);
    }
    for(const mouths of caves.values())if(mouths.length>2||mouths.some(cave=>cave.seed!==mouths[0].seed))fail('cave endpoints');
    for(const gate of array(interactions.gates,'interactions.gates',0,16)){
      site(gate,'gate');if(!gateIds.has(gate.id))fail('gate reference');gates.add(gate.id);inBounds(gate.approach,'gate.approach');
      const center=layout.passages.find(p=>p.gateId===gate.id).gate;if(Math.hypot(center.x-gate.approach.x,center.y-gate.approach.y)<1)fail('gate approach direction');
    }
    if(gates.size!==gateIds.size)fail('gate interaction');
    for(const chest of array(interactions.chests,'interactions.chests',0,32)){site(chest,'chest');inBounds(chest,'chest');}
    const decorationIds=new Set();for(const decoration of array(layout.decorations??[],'decorations',0,64)){
      text(decoration.id,'decoration.id');text(decoration.name,'decoration.name');if(decorationIds.has(decoration.id))fail('duplicate decoration');decorationIds.add(decoration.id);inBounds(decoration,'decoration');if(!['stele','ruins','sanctuary'].includes(decoration.kind))fail('decoration.kind');
      if(decoration.area!=null&&!ids.has(decoration.area))fail('decoration.area');if(decoration.scale!=null)number(decoration.scale,'decoration.scale',.3,3);
    }
    for(const [id,p] of Object.entries(layout.plan??{})){inBounds(p,'plan.'+id);number(p.r,'plan.radius',50,500);}
    const encounterIds=new Set();for(const encounter of layout.encounters??[]){inBounds(encounter,'encounter');if(encounterIds.has(encounter.id))fail('duplicate encounter');encounterIds.add(encounter.id);}
    for(const patch of layout.patches??[]){inBounds(patch.center,'patch.center');for(const p of patch.points)inBounds(p,'patch.point');}
    // Surface connectivity plus authored underground connections, without
    // inserting a hidden surface passage between paired cave mouths.
    const adjacent=new Map([...ids].map(id=>[id,[]]));
    for(const passage of layout.passages)if(passage.to!==null){adjacent.get(passage.from).push(passage.to);adjacent.get(passage.to).push(passage.from);}
    for(const mouths of caves.values())if(mouths.length===2){const [a,b]=mouths;if(!ids.has(a.area)||!ids.has(b.area))fail('cave.area');adjacent.get(a.area).push(b.area);adjacent.get(b.area).push(a.area);}
    const reached=new Set([layout.areas[0].id]);for(const id of reached)for(const next of adjacent.get(id))reached.add(next);
    if(reached.size!==ids.size)fail('disconnected areas');
  }
  for(const key of [...reservations,...neighbors.map(index=>`portal:${index}`)]){point(layout.plan?.[key],'plan.'+key);number(layout.plan[key].r,'plan.radius',50,500);if(key.startsWith('portal:')){point(layout.plan[key].arrivalDirection,'plan.arrivalDirection');const direction=layout.plan[key].arrivalDirection;if(Math.abs(Math.hypot(direction.x,direction.y)-1)>.001)fail('arrivalDirection unit length');}}
  for(const encounter of array(layout.encounters,'encounters',10,32)){text(encounter.id,'encounter.id');point(encounter,'encounter');number(encounter.r,'encounter.r',75,400);number(encounter.tier,'encounter.tier',0,4);if(!['combat','guard','boss'].includes(encounter.kind))fail('encounter.kind');if(encounter.kind==='boss'&&!bossIds.has(encounter.bossKind))fail('encounter.bossKind');if(encounter.name)text(encounter.name,'encounter.name');if(encounter.count!=null){number(encounter.count,'encounter.count',1,12);if(!Number.isInteger(encounter.count))fail('encounter.count');}if(encounter.strength!=null)number(encounter.strength,'encounter.strength',1,3);}
  for(const patch of array(layout.patches,'patches',1,32)){polygon(patch.points,'patch.points');point(patch.center,'patch.center');number(patch.density,'patch.density',0,1);}
  for(const key of ['ground','brush','forest','ridge','water','waterLight','bridge'])if(!/^#[0-9a-fA-F]{6}$/.test(layout.palette?.[key]))fail('palette.'+key);
  return true;
}
