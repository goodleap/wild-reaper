const fail=path=>{throw new TypeError(`Invalid world travel configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min,max)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>128)fail(path);return value;};
const number=(value,path,min,max)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const samePoint=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<.02;
const edgeKey=(a,b)=>[a,b].sort().join('|');
const dimensions={weapons:[126,68],skills:[132,76],supplies:[118,64],rest:[142,82]};
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
    const kinds=new Set(),facilities=list(core.facilities,p+'.core.facilities',4,4),rects=[];
    for(const [n,facility] of facilities.entries()){
      const q=p+`.core.facilities[${n}]`;object(facility,q);identity(facility.id,q+'.id');
      const size=dimensions[facility.kind];if(!size||kinds.has(facility.kind))fail(q+'.kind');kinds.add(facility.kind);
      if(facility.width!==size[0]||facility.depth!==size[1])fail(q+'.dimensions');
      insideCore(facility,q);insideCore({x:facility.x,y:facility.y+30},q+'.door');
      const rect={minX:facility.x-size[0]/2,maxX:facility.x+size[0]/2,minY:facility.y-size[1],maxY:facility.y};
      inBounds({x:rect.minX,y:rect.minY},bounds,q+'.foundation');inBounds({x:rect.maxX,y:rect.maxY},bounds,q+'.foundation');
      if(rects.some(other=>rect.minX<other.maxX+36&&rect.maxX>other.minX-36&&rect.minY<other.maxY+36&&rect.maxY>other.minY-36))fail(q+'.foundation clearance');
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
      const transition=object(endpoint.transition,q+'.transition');
      if(transition.theme!==byId.get(targetId).core.artTheme)fail(q+'.transition.theme');
      number(transition.length,q+'.transition.length',180,500);number(transition.width,q+'.transition.width',100,240);
      const portal=layout.plan[`portal:${worlds.order.indexOf(targetId)}`];
      if(!portal||!samePoint(portal,endpoint)||!samePoint(portal.arrivalDirection,direction))fail(q+'.portal plan');
      const passage=layout.passages.find(item=>item.id===`travel:${targetId}`);
      if(!passage||passage.from!==endpoint.areaId||passage.to!==null||passage.kind!=='exit'||passage.width<transition.width+50||!samePoint(passage.waypoints.at(-1),endpoint))fail(q+'.approach');
      const previous=passage.waypoints.at(-2),dx=previous.x-endpoint.x,dy=previous.y-endpoint.y,length=Math.hypot(dx,dy);
      if(length<transition.length||(dx*direction.x+dy*direction.y)/length<.999)fail(q+'.arrivalDirection approach');
      inBounds({x:endpoint.x+direction.x*transition.length,y:endpoint.y+direction.y*transition.length},layout.bounds,q+'.transition end');
    }
  }
  if(edges.size!==expected.size)fail('connections must match the world graph');
  const reached=new Set([travel.startWorldId]);for(const id of reached)for(const neighbor of adjacent.get(id))reached.add(neighbor);
  if(reached.size!==byId.size)fail('disconnected regions');
}
