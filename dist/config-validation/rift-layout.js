export function validateRiftLayout(layout,path,bossIds,reservations,neighbors){
  const fail=key=>{throw new TypeError(`Invalid world configuration: ${path}.${key}`);};
  if(!layout||layout.kind!=='rift-forest'||layout.revision!==1)fail('identity');
  const array=(value,key,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(key);return value;};
  const number=(value,key,min=-10000,max=10000)=>{if(!Number.isFinite(value)||value<min||value>max)fail(key);};
  const text=(value,key)=>{if(typeof value!=='string'||!value||value.length>128)fail(key);};
  const point=(value,key)=>{if(!value||typeof value!=='object')fail(key);number(value.x,key+'.x');number(value.y,key+'.y');};
  const polygon=(value,key)=>array(value,key,3,2400).forEach((p,index)=>point(p,key+'.'+index));
  const bounds=layout.bounds;if(!bounds||bounds.maxX-bounds.minX!==7200||bounds.maxY-bounds.minY!==5400)fail('bounds');
  for(const key of ['minX','minY','maxX','maxY'])number(bounds[key],'bounds.'+key);
  point(layout.spawn,'spawn');
  const ids=new Set();for(const area of array(layout.areas,'areas',18,18)){
    text(area.id,'area.id');text(area.name,'area.name');if(ids.has(area.id))fail('duplicate area');ids.add(area.id);point(area.center,'area.center');polygon(area.points,'area.points');
  }
  const passageIds=new Set();for(const passage of array(layout.passages,'passages',20,64)){
    text(passage.id,'passage.id');if(passageIds.has(passage.id))fail('duplicate passage');passageIds.add(passage.id);
    if(!ids.has(passage.from)||(passage.to!==null&&!ids.has(passage.to)))fail('passage endpoints');
    number(passage.width,'passage.width',100,400);polygon(passage.points,'passage.points');array(passage.waypoints,'passage.waypoints',2,32).forEach(p=>point(p,'passage.waypoint'));
    if(!['trail','secret','bridge','shortcut','cave','exit'].includes(passage.kind))fail('passage.kind');
    if(passage.gateId){text(passage.gateId,'gateId');point(passage.gate,'gate');for(const key of ['ax','ay','bx','by'])number(passage.gate[key],'gate.'+key);number(passage.gate.r,'gate.r',1,50);}
  }
  for(const key of ['boundaries','solidBoundaries'])for(const ring of array(layout[key],key,1,64)){polygon(ring.points,key+'.points');if(typeof ring.hole!=='boolean')fail(key+'.hole');}
  for(const lake of array(layout.lakes,'lakes',1,32)){text(lake.id,'lake.id');polygon(lake.points,'lake.points');if(typeof lake.hole!=='boolean')fail('lake.hole');}
  for(const key of ['spawn','cave05','cave15','shortcut08','shortcut13','shortcutGate','boss11','boss17','exitNorth','exitSouth','exitWest','treasure18','treasure07'])point(layout.landmarks?.[key],'landmark.'+key);
  for(const key of [...reservations,...neighbors.map(index=>`portal:${index}`)]){point(layout.plan?.[key],'plan.'+key);number(layout.plan[key].r,'plan.radius',50,500);if(key.startsWith('portal:')){point(layout.plan[key].arrivalDirection,'plan.arrivalDirection');const direction=layout.plan[key].arrivalDirection;if(Math.abs(Math.hypot(direction.x,direction.y)-1)>.001)fail('arrivalDirection unit length');}}
  for(const encounter of array(layout.encounters,'encounters',10,32)){text(encounter.id,'encounter.id');point(encounter,'encounter');number(encounter.r,'encounter.r',75,400);number(encounter.tier,'encounter.tier',0,4);if(!['combat','guard','boss'].includes(encounter.kind))fail('encounter.kind');if(encounter.kind==='boss'&&!bossIds.has(encounter.bossKind))fail('encounter.bossKind');if(encounter.name)text(encounter.name,'encounter.name');if(encounter.count!=null){number(encounter.count,'encounter.count',1,12);if(!Number.isInteger(encounter.count))fail('encounter.count');}if(encounter.strength!=null)number(encounter.strength,'encounter.strength',1,3);}
  for(const patch of array(layout.patches,'patches',1,32)){polygon(patch.points,'patch.points');point(patch.center,'patch.center');number(patch.density,'patch.density',0,1);}
  for(const key of ['ground','brush','forest','ridge','water','waterLight','bridge'])if(!/^#[0-9a-fA-F]{6}$/.test(layout.palette?.[key]))fail('palette.'+key);
  return true;
}
