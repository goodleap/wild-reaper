"""Offline geometry shared by authored underground map builders (Shapely 2)."""
import math
from collections import deque
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union

def pos(x,y):return {'x':x,'y':y}
def bounds(shape):
 a,b,c,d=shape.bounds
 return dict(minX=round(a,2),minY=round(b,2),maxX=round(c,2),maxY=round(d,2))
def room(shape,id,name,purpose):
 c=shape.centroid
 return dict(id=id,name=name,kind='room',purpose=purpose,x=round(c.x,2),y=round(c.y,2),bounds=bounds(shape),neighbors=[])
def cave_room(x,y,rx,ry,seed):
 pts=[]
 for i in range(48):
  a=i*math.tau/48
  m=1+.055*math.sin(a*3+seed)+.03*math.cos(a*5+seed*2)
  pts.append((x+rx*math.cos(a)*m,y+ry*math.sin(a)*m))
 return Polygon(pts)
def make(id,name,style,room_specs,connections,entrance,landing,gate,exit_specs):
 shapes=[];cells=[]
 for i,(label,purpose,s) in enumerate(room_specs):shapes.append(s);cells.append(room(s,i,label,purpose))
 for a,b,points,width in connections:
  seq=[a]
  for segment,(start,end) in enumerate(zip(points,points[1:])):
   if segment:
    turn=Point(start).buffer(width/2,quad_segs=5);k=len(cells)
    cells.append(dict(id=k,name='通道转角',kind='corridor',purpose='passage',x=start[0],y=start[1],bounds=bounds(turn),neighbors=[]));seq.append(k)
   line=LineString([start,end]);shape=line.buffer(width/2,quad_segs=5)
   k=len(cells);center=line.interpolate(.5,normalized=True)
   cells.append(dict(id=k,name='通道',kind='corridor',purpose='passage',x=round(center.x,2),y=round(center.y,2),bounds=bounds(shape),neighbors=[]))
   shapes.append(shape);seq.append(k)
  seq.append(b)
  for u,v in zip(seq,seq[1:]):cells[u]['neighbors'].append(v);cells[v]['neighbors'].append(u)
  if {a,b}==set(gate['rooms']):
   gate['closedLink']=[seq[-2],seq[-1]]
   last=cells[seq[-2]];gx=(gate['bar'][0]+gate['bar'][2])/2;gy=(gate['bar'][1]+gate['bar'][3])/2
   dx=points[-2][0]-gx;dy=points[-2][1]-gy;distance=math.hypot(dx,dy)
   last['x']=round(gx+dx/distance*100,2);last['y']=round(gy+dy/distance*100,2)
 union=unary_union(shapes).buffer(9,quad_segs=3).buffer(-9,quad_segs=3).simplify(3,preserve_topology=True)
 assert union.geom_type=='Polygon',(id,union.geom_type)
 def ring(r):return [[round(x,2),round(y,2)] for x,y in list(r.coords)[:-1]]
 L=dict(id=id,name=name,style=style,terrain='ruins' if style=='castle' else 'rift-forest',wallRadius=14,bounds=bounds(union),floorPolygons=[dict(outer=ring(union.exterior),holes=[ring(r) for r in union.interiors])],cells=cells,entranceCell=0,entrance=pos(*entrance),landing=pos(*landing),mainRoute=[],exits=exit_specs,chests=[],mechanisms=[],groups=[],boss={},treasure={},props=[],groundDetails=[])
 L['mechanisms']=[dict(id='shortcut',name='升起石闸' if style=='cave' else '开启侧门',x=gate['switch'][0],y=gate['switch'][1],cellId=gate['cellId'],gateId='shortcut-gate',closedLink=gate['closedLink'],gate=dict(zip(['ax','ay','bx','by'],gate['bar'])))]
 L['bounds']={k:(min if k.startswith('min') else max)([L['bounds'][k]]+[c['bounds'][k] for c in cells]) for k in L['bounds']}
 for exit in L['exits']:
  d=exit['direction'];length=math.hypot(d['x'],d['y']);d['x']=round(d['x']/length,6);d['y']=round(d['y']/length,6)
 return L,union

def rect(x1,y1,x2,y2):return box(x1+12,y1+12,x2-12,y2-12).buffer(12,quad_segs=3)

def finish(L):
 # Runtime pacing follows the finite boss branch. Cave mouths remain independent.
 blocked=set(L['mechanisms'][0]['closedLink']);parents={0:None};q=deque([0])
 while q:
  a=q.popleft()
  for b in L['cells'][a]['neighbors']:
   if set([a,b])==blocked or b in parents:continue
   parents[b]=a;q.append(b)
 route=[];at=L['boss']['cellId']
 while at is not None:route.append(at);at=parents[at]
 L['mainRoute']=list(reversed(route))
 for c in L['cells']:c['neighbors'].sort()
 return L
