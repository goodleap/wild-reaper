const fail=path=>{throw new TypeError(`Invalid world travel configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>128)fail(path);return value;};
const number=(value,path,min,max)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const samePoint=(a,b)=>!!a&&!!b&&Math.hypot(a.x-b.x,a.y-b.y)<.02;
const edgeKey=(a,b)=>[a,b].sort().join('|');
const dimensions={weapons:[126,68],skills:[132,76],supplies:[118,64],rest:[142,82]};
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);};
const themes=new Set(['forest','marsh','ruins','beach','mountain','snow','city','ember']);

export function validateWorldTravel(worlds){
  const travel=object(worlds.travel,'travel'),definitions=new Map(worlds.definitions.filter(world=>world.authored).map(world=>[world.id,world]));
  const regions=list(travel.regions,'regions',1,64),byId=new Map(),identities=new Set(),atlasPoints=new Set();
  const identity=(id,path)=>{text(id,path);if(identities.has(id))fail(path+'.duplicate');identities.add(id);};
  const inBounds=(p,bounds,path)=>{object(p,path);number(p.x,path+'.x',bounds.minX,bounds.maxX);number(p.y,path+'.y',bounds.minY,bounds.maxY);};
  for(const [index,region] of regions.entries()){
    const p=`regions[${index}]`;object(region,p);text(region.worldId,p+'.worldId');
    const definition=definitions.get(region.worldId);if(!definition||byId.has(region.worldId))fail(p+'.worldId');byId.set(region.worldId,region);
    const layout=definition.authored,bounds=layout.bounds,core=object(region.core,p+'.core');
    identity(core.id,p+'.core.id');text(core.name,p+'.core.name');
    if(!['camp','village','outpost','refuge'].includes(core.kind))fail(p+'.core.kind');
    if(!themes.has(core.artTheme)||core.artTheme!==(layout.artTheme||'forest'))fail(p+'.core.artTheme');
    if(!layout.areas.some(area=>area.id===core.areaId))fail(p+'.core.areaId');
    inBounds(core,bounds,p+'.core');number(core.radius,p+'.core.radius',250,600);
    const insideCore=(point,path)=>{inBounds(point,bounds,path);if(Math.hypot(point.x-core.x,point.y-core.y)>core.radius-18)fail(path+'.safe radius');};
    const waypoint=object(core.waypoint,p+'.core.waypoint');insideCore(waypoint,p+'.core.waypoint');
    if(waypoint.width!==56||waypoint.depth!==36)fail(p+'.core.waypoint.dimensions');
    insideCore({x:waypoint.x,y:waypoint.y+30},p+'.core.waypoint.door');
    insideCore(core.spawn,p+'.core.spawn');insideCore(core.questBoard,p+'.core.questBoard');
    if(Math.hypot(core.spawn.x-waypoint.x,core.spawn.y-waypoint.y-30)>115)fail(p+'.core.spawn waypoint range');
    const ground=object(core.ground,p+'.core.ground'),plazas=list(ground.plazas,p+'.core.ground.plazas',1,8),streets=list(ground.streets,p+'.core.ground.streets',2,32);
    for(const [n,plaza] of plazas.entries()){
      const q=p+`.core.ground.plazas[${n}]`;inBounds(plaza,bounds,q);number(plaza.width,q+'.width',100,900);number(plaza.depth,q+'.depth',100,900);
      inBounds({x:plaza.x-plaza.width/2,y:plaza.y-plaza.depth/2},bounds,q+'.corner');inBounds({x:plaza.x+plaza.width/2,y:plaza.y+plaza.depth/2},bounds,q+'.corner');
    }
    for(const [n,street] of streets.entries()){
      const q=p+`.core.ground.streets[${n}]`;object(street,q);number(street.width,q+'.width',56,180);
      list(street.points,q+'.points',2,16).forEach((point,n)=>inBounds(point,bounds,q+`.points[${n}]`));
      if(street.points.every(point=>samePoint(point,street.points[0])))fail(q+'.empty road');
    }
    const paved=point=>plazas.some(plaza=>Math.abs(point.x-plaza.x)<=plaza.width/2&&Math.abs(point.y-plaza.y)<=plaza.depth/2)||streets.some(street=>street.points.slice(1).some((b,n)=>segmentDistance(point,street.points[n],b)<=street.width/2));
    for(const [key,point] of [['spawn',core.spawn],['waypoint door',{x:waypoint.x,y:waypoint.y+30}],['quest board',core.questBoard]])if(!paved(point))fail(p+'.core.ground.'+key);
    for(const encounter of layout.encounters)if(Math.hypot(encounter.x-core.x,encounter.y-core.y)<core.radius+encounter.r)fail(p+'.core.encounter overlap');
    for(const [key,site] of Object.entries(layout.plan))if(['occupied','castle','hunt','rescue','rune','rescue-warden','owlroost','golemaltar','stonevault'].includes(key)&&Math.hypot(site.x-core.x,site.y-core.y)<core.radius+site.r)fail(p+'.core.activity overlap.'+key);
    const kinds=new Set(),facilities=list(core.facilities,p+'.core.facilities',4,4),rects=[];
    for(const [n,facility] of facilities.entries()){
      const q=p+`.core.facilities[${n}]`;object(facility,q);identity(facility.id,q+'.id');
      const size=dimensions[facility.kind];if(!size||kinds.has(facility.kind))fail(q+'.kind');kinds.add(facility.kind);
      if(facility.width!==size[0]||facility.depth!==size[1])fail(q+'.dimensions');
      insideCore(facility,q);insideCore({x:facility.x,y:facility.y+30},q+'.door');
      const rect={minX:facility.x-size[0]/2,maxX:facility.x+size[0]/2,minY:facility.y-size[1],maxY:facility.y};
      for(const x of [rect.minX,rect.maxX])for(const y of [rect.minY,rect.maxY])insideCore({x,y},q+'.foundation');
      if(!paved({x:facility.x,y:facility.y+30}))fail(q+'.unpaved door');
      if(rects.some(other=>rect.minX<other.maxX+60&&rect.maxX>other.minX-60&&rect.minY<other.maxY+60&&rect.maxY>other.minY-60))fail(q+'.foundation clearance');
      if(waypoint.x>rect.minX-40&&waypoint.x<rect.maxX+40&&waypoint.y>rect.minY-40&&waypoint.y<rect.maxY+40)fail(q+'.waypoint overlap');
      rects.push(rect);
    }
    object(region.atlas,p+'.atlas');number(region.atlas.x,p+'.atlas.x',-100,100);number(region.atlas.y,p+'.atlas.y',-100,100);
    const key=`${region.atlas.x},${region.atlas.y}`;if(atlasPoints.has(key))fail(p+'.atlas overlap');atlasPoints.add(key);
  }
  if(byId.size!==definitions.size)fail('regions must cover the authored exploration worlds');
  if(!byId.has(travel.startWorldId))fail('startWorldId');
  const edges=new Set(),expected=new Set(worlds.connections.map(([a,b])=>edgeKey(a,b))),adjacent=new Map([...byId.keys()].map(id=>[id,[]]));
  for(const [index,connection] of list(travel.connections,'connections',0,256).entries()){
    const p=`connections[${index}]`;object(connection,p);identity(connection.id,p+'.id');text(connection.name,p+'.name');
    if(connection.from===connection.to||!byId.has(connection.from)||!byId.has(connection.to))fail(p+'.regions');
    const key=edgeKey(connection.from,connection.to);if(edges.has(key)||!expected.has(key))fail(p+'.edge');edges.add(key);
    adjacent.get(connection.from).push(connection.to);adjacent.get(connection.to).push(connection.from);
    const endpoints=object(connection.endpoints,p+'.endpoints');
    if(Object.keys(endpoints).length!==2||!Object.hasOwn(endpoints,connection.from)||!Object.hasOwn(endpoints,connection.to))fail(p+'.endpoints');
    for(const [worldId,targetId] of [[connection.from,connection.to],[connection.to,connection.from]]){
      const q=p+`.endpoints.${worldId}`,endpoint=object(endpoints[worldId],q),world=definitions.get(worldId),layout=world.authored,core=byId.get(worldId).core;
      inBounds(endpoint,layout.bounds,q);text(endpoint.name,q+'.name');
      if(endpoint.artTheme!==core.artTheme)fail(q+'.artTheme');
      if(endpoint.areaId===core.areaId||!layout.areas.some(area=>area.id===endpoint.areaId))fail(q+'.wilderness area');
      if(Math.hypot(endpoint.x-core.x,endpoint.y-core.y)<=core.radius+500)fail(q+'.wilderness distance');
      const direction=object(endpoint.arrivalDirection,q+'.arrivalDirection');number(direction.x,q+'.arrivalDirection.x',-1,1);number(direction.y,q+'.arrivalDirection.y',-1,1);
      if(Math.abs(Math.hypot(direction.x,direction.y)-1)>.001)fail(q+'.arrivalDirection unit length');
      const trigger=object(endpoint.exitTrigger,q+'.exitTrigger'),edge=trigger.edge,bounds=layout.bounds;
      if(!['north','south','east','west'].includes(edge))fail(q+'.exitTrigger.edge');
      number(trigger.width,q+'.exitTrigger.width',180,320);number(trigger.depth,q+'.exitTrigger.depth',32,80);
      const expectedDirection={north:{x:0,y:1},south:{x:0,y:-1},west:{x:1,y:0},east:{x:-1,y:0}}[edge];
      const edgePoint={x:edge==='west'?bounds.minX:edge==='east'?bounds.maxX:endpoint.x,y:edge==='north'?bounds.minY:edge==='south'?bounds.maxY:endpoint.y};
      if(!samePoint(endpoint,edgePoint)||!samePoint(direction,expectedDirection))fail(q+'.exitTrigger boundary');
      const tangent={x:-direction.y,y:direction.x};
      for(const side of [-1,1])inBounds({x:endpoint.x+tangent.x*trigger.width/2*side,y:endpoint.y+tangent.y*trigger.width/2*side},bounds,q+'.exitTrigger width');
      inBounds(endpoint.sign,bounds,q+'.sign');
      const signAlong=(endpoint.sign.x-endpoint.x)*direction.x+(endpoint.sign.y-endpoint.y)*direction.y;
      const signAcross=(endpoint.sign.x-endpoint.x)*tangent.x+(endpoint.sign.y-endpoint.y)*tangent.y;
      if(signAlong<trigger.depth+100||signAlong>420||Math.abs(signAcross)>trigger.width/2)fail(q+'.sign beside approach');
      const transition=object(endpoint.transition,q+'.transition');
      if(transition.theme!==byId.get(targetId).core.artTheme)fail(q+'.transition.theme');
      number(transition.length,q+'.transition.length',180,500);number(transition.width,q+'.transition.width',100,240);
      const portal=layout.plan[`portal:${worlds.order.indexOf(targetId)}`];
      if(!portal||!samePoint(portal,endpoint)||!samePoint(portal.arrivalDirection,direction)||JSON.stringify(portal.exitTrigger)!==JSON.stringify(trigger))fail(q+'.portal plan');
      const passage=layout.passages.find(item=>item.id===`travel:${targetId}`);
      if(!passage||passage.from!==endpoint.areaId||passage.to!==null||passage.kind!=='exit'||passage.width!==trigger.width||passage.width<transition.width+50||!samePoint(passage.waypoints.at(-1),endpoint))fail(q+'.approach');
      const previous=passage.waypoints.at(-2),dx=previous.x-endpoint.x,dy=previous.y-endpoint.y,length=Math.hypot(dx,dy);
      if(length<transition.length||(dx*direction.x+dy*direction.y)/length<.999)fail(q+'.arrivalDirection approach');
      inBounds({x:endpoint.x+direction.x*transition.length,y:endpoint.y+direction.y*transition.length},layout.bounds,q+'.transition end');
    }
  }
  if(edges.size!==expected.size)fail('connections must match the world graph');
  const reached=new Set([travel.startWorldId]);for(const id of reached)for(const neighbor of adjacent.get(id))reached.add(neighbor);
  if(reached.size!==byId.size)fail('disconnected regions');
}
