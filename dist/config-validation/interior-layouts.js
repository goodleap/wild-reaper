const fail=path=>{throw new TypeError(`Invalid interior layout configuration: ${path}`);};
const object=(value,path)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(path);return value;};
const list=(value,path,min=0,max=128)=>{if(!Array.isArray(value)||value.length<min||value.length>max)fail(path);return value;};
const number=(value,path,min,max)=>{if(!Number.isFinite(value)||value<min||value>max)fail(path);return value;};
const integer=(value,path,min,max)=>{number(value,path,min,max);if(!Number.isSafeInteger(value))fail(path);return value;};
const text=(value,path)=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail(path);return value;};
const id=(value,path)=>{if(typeof value!=='string'||!/^[a-zA-Z][a-zA-Z0-9:_-]{0,95}$/.test(value))fail(path);return value;};
const bool=(value,path)=>{if(typeof value!=='boolean')fail(path);};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const toPair=p=>[p.x,p.y];
const epsilon=.001;
function edgeDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);}
function touching(a,b,c,d){
  if(Math.max(a[0],b[0])+epsilon<Math.min(c[0],d[0])||Math.max(c[0],d[0])+epsilon<Math.min(a[0],b[0])||Math.max(a[1],b[1])+epsilon<Math.min(c[1],d[1])||Math.max(c[1],d[1])+epsilon<Math.min(a[1],b[1]))return false;
  return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||edgeDistance(a,c,d)<epsilon||edgeDistance(b,c,d)<epsilon||edgeDistance(c,a,b)<epsilon||edgeDistance(d,a,b)<epsilon;
}
function inside(p,ring){
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if(edgeDistance(p,a,b)<epsilon)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
function ring(value,path,bounds){
  list(value,path,3,1024);let area=0;
  for(let i=0;i<value.length;i++){
    const a=list(value[i],`${path}.${i}`,2,2),b=list(value[(i+1)%value.length],path+'.next',2,2);
    number(a[0],path+'.x',bounds.minX,bounds.maxX);number(a[1],path+'.y',bounds.minY,bounds.maxY);
    if(distance(a,b)<epsilon)fail(path+'.duplicate edge');area+=a[0]*b[1]-a[1]*b[0];
  }
  if(Math.abs(area)<2)fail(path+'.area');
  for(let i=0;i<value.length;i++)for(let j=i+2;j<value.length;j++){
    if(i===0&&j===value.length-1)continue;
    if(touching(value[i],value[(i+1)%value.length],value[j],value[(j+1)%value.length]))fail(path+'.self intersection');
  }
  return value;
}
function ringsTouch(a,b){return a.some((p,i)=>b.some((q,j)=>touching(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));}
function point(value,path,bounds){object(value,path);number(value.x,path+'.x',bounds.minX,bounds.maxX);number(value.y,path+'.y',bounds.minY,bounds.maxY);return value;}
function box(value,path,parent){
  object(value,path);
  for(const axis of ['X','Y'])for(const prefix of ['min','max'])number(value[prefix+axis],path+'.'+prefix+axis,parent?.['min'+axis]??-10000,parent?.['max'+axis]??10000);
  if(value.maxX<=value.minX||value.maxY<=value.minY)fail(path+'.size');return value;
}
const props=new Set(['cavernRock','caveMushroom','castlePillar','wallTorch','barrel','cargo','table','shelf','rug']);

// Baked floor rings are shared by drawing and collision. The graph describes
// rooms and progression only; it cannot override an invalid physical contour.
export function validateInteriorLayouts(value,path,{worldIds,enemyIds}){
  object(value,path);
  for(const key of ['darkriver','forestCastle'])if(!Object.hasOwn(value,key))fail(path+'.'+key);
  const entries=Object.entries(value);if(entries.length>16)fail(path+'.count');
  const layoutIds=new Set();
  for(const [key,layout]of entries){
    const p=path+'.'+key;object(layout,p);id(layout.id,p+'.id');if(layoutIds.has(layout.id))fail(p+'.duplicate id');layoutIds.add(layout.id);
    text(layout.name,p+'.name');if(!['cave','castle'].includes(layout.style))fail(p+'.style');
    if(key==='darkriver'&&layout.style!=='cave'||key==='forestCastle'&&layout.style!=='castle')fail(p+'.style');
    if(!worldIds.has(layout.terrain))fail(p+'.terrain');number(layout.wallRadius,p+'.wallRadius',1,48);
    const bounds=box(layout.bounds,p+'.bounds');
    for(const length of [bounds.maxX-bounds.minX,bounds.maxY-bounds.minY])number(length,p+'.bounds.size',300,10000);
    let vertexCount=0;
    const floors=list(layout.floorPolygons,p+'.floorPolygons',1,16);
    for(const [index,polygon]of floors.entries()){
      const q=`${p}.floorPolygons.${index}`;object(polygon,q);ring(polygon.outer,q+'.outer',bounds);vertexCount+=polygon.outer.length;
      const holes=list(polygon.holes,q+'.holes',0,32);
      for(const [i,hole]of holes.entries()){
        ring(hole,q+'.holes.'+i,bounds);vertexCount+=hole.length;
        if(!inside(hole[0],polygon.outer)||ringsTouch(hole,polygon.outer))fail(q+'.hole outside floor');
        for(let j=0;j<i;j++)if(inside(hole[0],holes[j])||inside(holes[j][0],hole)||ringsTouch(hole,holes[j]))fail(q+'.overlapping holes');
      }
    }
    if(vertexCount>4096)fail(p+'.floor vertex count');
    const onFloor=at=>floors.some(poly=>inside(toPair(at),poly.outer)&&!poly.holes.some(hole=>inside(toPair(at),hole)));
    const standing=(at,q,b=bounds)=>{point(at,q,b);if(!onFloor(at))fail(q+'.outside floor');return at;};
    const cells=list(layout.cells,p+'.cells',2,128),cellRef=(n,q)=>integer(n,q,0,cells.length-1);
    for(const [i,cell]of cells.entries()){
      const q=`${p}.cells.${i}`;object(cell,q);if(cell.id!==i)fail(q+'.id');text(cell.name,q+'.name');text(cell.purpose,q+'.purpose');
      if(!['room','corridor'].includes(cell.kind))fail(q+'.kind');box(cell.bounds,q+'.bounds',bounds);standing(cell,q,cell.bounds);
      const neighbors=list(cell.neighbors,q+'.neighbors',1,16);if(new Set(neighbors).size!==neighbors.length)fail(q+'.duplicate neighbor');
      for(const n of neighbors){cellRef(n,q+'.neighbor');if(n===i)fail(q+'.self neighbor');}
    }
    for(const cell of cells)for(const n of cell.neighbors)if(!cells[n].neighbors.includes(cell.id))fail(p+'.nonreciprocal neighbor');
    const entranceId=cellRef(layout.entranceCell,p+'.entranceCell');
    standing(layout.entrance,p+'.entrance',cells[entranceId].bounds);standing(layout.landing,p+'.landing',cells[entranceId].bounds);
    const reachable=(blocked=new Set())=>{
      const reached=new Set([entranceId]),queue=[entranceId];
      for(const current of queue)for(const n of cells[current].neighbors){const edge=[current,n].sort((a,b)=>a-b).join(':');if(blocked.has(edge)||reached.has(n))continue;reached.add(n);queue.push(n);}
      return reached;
    };
    if(reachable().size!==cells.length)fail(p+'.disconnected cells');
    const inCell=(value,q)=>{object(value,q);const n=cellRef(value.cellId,q+'.cellId');standing(value,q,cells[n].bounds);return n;};
    const identities=new Map();
    const identity=(value,q,group)=>{id(value,q);if(!identities.has(group))identities.set(group,new Set());const ids=identities.get(group);if(ids.has(value))fail(q+'.duplicate');ids.add(value);};
    for(const [i,exit]of list(layout.exits,p+'.exits',1,8).entries()){
      const q=`${p}.exits.${i}`;standing(exit,q);object(exit.direction,q+'.direction');number(exit.direction.x,q+'.direction.x',-1,1);number(exit.direction.y,q+'.direction.y',-1,1);
      if(Math.abs(Math.hypot(exit.direction.x,exit.direction.y)-1)>.001)fail(q+'.direction.length');
    }
    for(const [i,chest]of list(layout.chests,p+'.chests',0,32).entries()){const q=`${p}.chests.${i}`;inCell(chest,q);identity(chest.id,q+'.id','chests');}
    const mechanisms=list(layout.mechanisms,p+'.mechanisms',0,16),gateIds=new Set(),closedEdges=new Set();
    for(const [i,mechanism]of mechanisms.entries()){
      const q=`${p}.mechanisms.${i}`;inCell(mechanism,q);identity(mechanism.id,q+'.id','mechanisms');text(mechanism.name,q+'.name');id(mechanism.gateId,q+'.gateId');
      if(gateIds.has(mechanism.gateId))fail(q+'.duplicate gate');gateIds.add(mechanism.gateId);
      const [a,b]=list(mechanism.closedLink,q+'.closedLink',2,2);cellRef(a,q+'.closedLink');cellRef(b,q+'.closedLink');
      if(!cells[a].neighbors.includes(b))fail(q+'.closedLink edge');
      const edge=[a,b].sort((a,b)=>a-b).join(':');if(closedEdges.has(edge))fail(q+'.duplicate closedLink');closedEdges.add(edge);
      const gate=object(mechanism.gate,q+'.gate'),start={x:gate.ax,y:gate.ay},end={x:gate.bx,y:gate.by};point(start,q+'.gate.start',bounds);point(end,q+'.gate.end',bounds);
      number(distance(toPair(start),toPair(end)),q+'.gate.length',40,800);
    }
    // Every switch must be obtainable without first passing its own closed gate.
    const blocked=new Set(closedEdges),pending=new Set(mechanisms);
    for(let pass=0;pass<mechanisms.length&&pending.size;pass++){
      const reached=reachable(blocked);let changed=false;
      for(const mechanism of pending)if(reached.has(mechanism.cellId)){pending.delete(mechanism);blocked.delete([...mechanism.closedLink].sort((a,b)=>a-b).join(':'));changed=true;}
      if(!changed)break;
    }
    if(pending.size)fail(p+'.unreachable mechanism');
    const boss=object(layout.boss,p+'.boss'),bossCell=inCell(boss,p+'.boss');integer(boss.bossIndex,p+'.boss.bossIndex',1,1e6);text(boss.name,p+'.boss.name');
    standing(layout.treasure,p+'.treasure',cells[bossCell].bounds);
    const route=list(layout.mainRoute,p+'.mainRoute',2,cells.length);if(route[0]!==entranceId||route.at(-1)!==bossCell||new Set(route).size!==route.length)fail(p+'.mainRoute endpoints');
    for(const [i,n]of route.entries()){cellRef(n,p+'.mainRoute');if(i&&!cells[route[i-1]].neighbors.includes(n))fail(p+'.mainRoute edge');}
    const groupCells=new Set();let enemies=0;
    for(const [i,group]of list(layout.groups,p+'.groups',1,64).entries()){
      const q=`${p}.groups.${i}`;object(group,q);const n=cellRef(group.cellId,q+'.cellId');if(groupCells.has(n)||n===bossCell)fail(q+'.duplicate/boss cell');groupCells.add(n);bool(group.heal,q+'.heal');
      for(const [j,enemy]of list(group.enemies,q+'.enemies',1,32).entries()){
        const s=`${q}.enemies.${j}`;standing(enemy,s,cells[n].bounds);if(enemy.type==='boss'||!enemyIds.has(enemy.type))fail(s+'.type');enemies++;
      }
    }
    if(enemies>256)fail(p+'.enemy count');
    for(const [i,prop]of list(layout.props,p+'.props',0,128).entries()){
      const q=`${p}.props.${i}`;point(prop,q,bounds);identity(prop.id,q+'.id','props');if(!props.has(prop.type))fail(q+'.type');number(prop.r,q+'.r',1,200);
      if(prop.halfLength!=null)number(prop.halfLength,q+'.halfLength',1,400);
      if(prop.angle!=null)number(prop.angle,q+'.angle',-Math.PI*2,Math.PI*2);
      if(prop.collision!=null)bool(prop.collision,q+'.collision');if(prop.heightBand!=null&&!['high','low'].includes(prop.heightBand))fail(q+'.heightBand');
      if(prop.footprint!=null){
        object(prop.footprint,q+'.footprint');for(const key of ['width','depth'])number(prop.footprint[key],q+'.footprint.'+key,1,512);
        if(prop.footprint.offsetY!=null)number(prop.footprint.offsetY,q+'.footprint.offsetY',-256,256);
      }
    }
    for(const [i,detail]of list(layout.groundDetails,p+'.groundDetails',0,128).entries()){
      const q=`${p}.groundDetails.${i}`;point(detail,q,bounds);if(!['water','moss','rubble','rug','tiles'].includes(detail.type))fail(q+'.type');
      number(detail.rx,q+'.rx',1,800);number(detail.ry,q+'.ry',1,800);if(detail.angle!=null)number(detail.angle,q+'.angle',-Math.PI*2,Math.PI*2);
    }
  }
  return true;
}
