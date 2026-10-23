import argparse, json, math
from pathlib import Path
from collections import deque
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union

D={}
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
   dx=points[0][0]-gx;dy=points[0][1]-gy;distance=math.hypot(dx,dy)
   last['x']=round(gx+dx/distance*100,2);last['y']=round(gy+dy/distance*100,2)
 union=unary_union(shapes).buffer(9,quad_segs=3).buffer(-9,quad_segs=3).simplify(3,preserve_topology=True)
 assert union.geom_type=='Polygon',(id,union.geom_type)
 def ring(r):return [[round(x,2),round(y,2)] for x,y in list(r.coords)[:-1]]
 L=dict(id=id,name=name,style=style,terrain='ruins' if style=='castle' else 'rift-forest',wallRadius=14,bounds=bounds(union),floorPolygons=[dict(outer=ring(union.exterior),holes=[ring(r) for r in union.interiors])],cells=cells,entranceCell=0,entrance=pos(*entrance),landing=pos(*landing),mainRoute=[],exits=exit_specs,chests=[],mechanisms=[],groups=[],boss={},treasure={},props=[],groundDetails=[])
 L['mechanisms']=[dict(id='shortcut',name='升起石闸' if style=='cave' else '开启侧门',x=gate['switch'][0],y=gate['switch'][1],cellId=gate['cellId'],gateId='shortcut-gate',closedLink=gate['closedLink'],gate=dict(zip(['ax','ay','bx','by'],gate['bar'])))]
 L['bounds']={k:(min if k.startswith('min') else max)([L['bounds'][k]]+[c['bounds'][k] for c in cells]) for k in L['bounds']}
 for exit in L['exits']:
  d=exit['direction'];length=math.hypot(d['x'],d['y']);d['x']=round(d['x']/length,6);d['y']=round(d['y']/length,6)
 D[id]=L;return L,union

cave_specs=[('落石洞口','entry',cave_room(-760,650,260,200,0)),('苔影石窟','guard',cave_room(-750,80,235,200,1)),('浅河回廊','junction',cave_room(-220,-280,300,240,2)),('高处石台','treasury',cave_room(-720,-570,230,180,3)),('北侧裂隙','exit',cave_room(240,-660,270,225,4)),('菌光侧洞','guard',cave_room(380,80,260,210,5)),('守卫石厅','boss',cave_room(1000,-210,310,250,6))]
cave_connections=[(0,1,[(-760,650),(-800,340),(-750,80)],175),(1,2,[(-750,80),(-500,-80),(-220,-280)],175),(2,4,[(-220,-280),(50,-400),(240,-660)],165),(1,3,[(-750,80),(-750,-570)],165),(3,4,[(-720,-570),(-260,-650),(240,-660)],170),(2,5,[(-220,-280),(80,-90),(380,80)],175),(5,6,[(380,80),(720,20),(1000,-210)],180)]
L,cave=make('darkriver','暗河洞穴','cave',cave_specs,cave_connections,(-830,700),(-790,600),dict(rooms=[1,3],switch=(-680,-475),cellId=3,bar=[-847,-310,-653,-310]),[dict(x=-830,y=700,direction=pos(.3,-1)),dict(x=365,y=-720,direction=pos(-1,.35))])
L['chests']=[dict(id='moss-cache',cellId=1,x=-850,y=60),dict(id='ledge-cache',cellId=3,x=-790,y=-600),dict(id='mushroom-cache',cellId=5,x=405,y=175)]
L['groups']=[dict(cellId=1,heal=False,enemies=[dict(type='bat',x=-770,y=-10),dict(type='beetle',x=-640,y=105),dict(type='beetle',x=-810,y=175)]),dict(cellId=2,heal=True,enemies=[dict(type='bat',x=-330,y=-350),dict(type='beetle',x=-135,y=-340),dict(type='bat',x=-240,y=-190)]),dict(cellId=3,heal=False,enemies=[dict(type='beetle',x=-720,y=-640),dict(type='bat',x=-610,y=-555)]),dict(cellId=5,heal=False,enemies=[dict(type='spore',x=430,y=75),dict(type='beetle',x=300,y=160),dict(type='bat',x=295,y=-15),dict(type='beetle',x=480,y=0)])]
L['boss']=dict(cellId=6,x=1010,y=-180,bossIndex=1,name='暗河守卫');L['treasure']=pos(1090,-275)
L['props']=[dict(id='entry-stone',type='cavernRock',x=-930,y=645,r=32,collision=True,heightBand='low'),dict(id='river-stone',type='cavernRock',x=-410,y=-350,r=30,collision=True,heightBand='low'),dict(id='north-stone',type='cavernRock',x=250,y=-800,r=35,collision=True,heightBand='low'),dict(id='boss-stone',type='cavernRock',x=1190,y=-110,r=32,collision=True,heightBand='low')]
for i,(x,y) in enumerate([(-900,560),(-820,0),(-120,-420),(350,-10),(520,155),(880,-325),(130,-770)]):L['props'].append(dict(id=f'mushroom-{i}',type='caveMushroom',x=x,y=y,r=12,collision=False))
L['groundDetails']=[dict(type='water',x=-245,y=-240,rx=100,ry=52,angle=-.35),dict(type='moss',x=-810,y=135,rx=85,ry=52),dict(type='moss',x=420,y=100,rx=115,ry=70),dict(type='rubble',x=-850,y=695,rx=85,ry=35),dict(type='rubble',x=1070,y=-310,rx=115,ry=55)]

def rect(x1,y1,x2,y2):return box(x1+12,y1+12,x2-12,y2-12).buffer(12,quad_segs=3)
castle_specs=[('门厅','entry',rect(-220,530,220,870)),('中央厅','junction',rect(-300,30,300,430)),('卫兵室','guard',rect(-850,10,-460,350)),('书库','treasury',rect(460,10,850,350)),('侧廊','guard',rect(-260,-450,260,-120)),('守卫大厅','boss',rect(-350,-1060,350,-660)),('藏物室','treasury',rect(530,-980,890,-680))]
castle_connections=[(0,1,[(0,700),(0,230)],180),(1,2,[(0,190),(-655,190)],150),(1,3,[(0,190),(655,190)],150),(2,4,[(-655,180),(-655,-285),(0,-285)],150),(4,5,[(0,-285),(0,-860)],170),(5,6,[(0,-830),(710,-830)],150),(1,4,[(0,230),(0,-285)],170)]
L,castle=make('forestCastle','林间旧堡','castle',castle_specs,castle_connections,(0,795),(0,680),dict(rooms=[1,4],switch=(145,-245),cellId=4,bar=[-100,-45,100,-45]),[dict(x=0,y=795,direction=pos(0,-1))])
L['chests']=[dict(id='guard-cache',cellId=2,x=-745,y=210),dict(id='library-cache',cellId=3,x=740,y=125),dict(id='side-treasury',cellId=6,x=775,y=-840)]
L['groups']=[dict(cellId=1,heal=False,enemies=[dict(type='shieldguard',x=-145,y=180),dict(type='shieldguard',x=140,y=265),dict(type='frostmage',x=95,y=130)]),dict(cellId=2,heal=True,enemies=[dict(type='shieldguard',x=-680,y=100),dict(type='frostmage',x=-595,y=245)]),dict(cellId=3,heal=False,enemies=[dict(type='frostmage',x=580,y=150),dict(type='shieldguard',x=690,y=250)]),dict(cellId=4,heal=True,enemies=[dict(type='shieldguard',x=-110,y=-300),dict(type='frostmage',x=115,y=-345)]),dict(cellId=6,heal=False,enemies=[dict(type='shieldguard',x=650,y=-790),dict(type='frostmage',x=735,y=-900)])]
L['boss']=dict(cellId=5,x=0,y=-840,bossIndex=1,name='旧堡守卫');L['treasure']=pos(100,-950)
L['props']=[dict(id=f'pillar-{i}',type='castlePillar',x=x,y=y,r=25,collision=True,heightBand='high') for i,(x,y) in enumerate([(-215,105),(215,355),(-255,-975),(255,-735)])]
L['props'] += [dict(id='barrel-1',type='barrel',x=-785,y=70,r=19,collision=True,heightBand='low'),dict(id='guard-crate',type='cargo',x=-770,y=285,r=16,footprint=dict(width=50,depth=32,offsetY=2),collision=True,heightBand='low'),dict(id='library-shelf',type='shelf',x=655,y=65,r=10,halfLength=48,angle=0,footprint=dict(width=116,depth=20,offsetY=12),collision=True,heightBand='high'),dict(id='library-table',type='table',x=655,y=290,r=21,halfLength=15,angle=0,footprint=dict(width=72,depth=42,offsetY=2),collision=True,heightBand='low'),dict(id='treasury-crate',type='cargo',x=600,y=-900,r=16,footprint=dict(width=50,depth=32,offsetY=2),collision=True,heightBand='low')]
for i,(x,y) in enumerate([(-175,575),(175,575),(-260,85),(260,85),(-185,-410),(185,-410),(-280,-1015),(280,-1015)]):L['props'].append(dict(id=f'torch-{i}',type='wallTorch',x=x,y=y,r=8,collision=False))
L['groundDetails']=[dict(type='rug',x=0,y=700,rx=90,ry=100),dict(type='rug',x=0,y=-855,rx=125,ry=145),dict(type='tiles',x=0,y=230,rx=175,ry=110),dict(type='rubble',x=-740,y=310,rx=70,ry=20)]
for L in D.values():
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
parser=argparse.ArgumentParser(description='Bake the two authored underground samples with Shapely 2.')
parser.add_argument('--write',action='store_true',help='Update only the two authored layout entries in geography.json')
parser.add_argument('--output',type=Path,help='Optional JSON fragment output')
args=parser.parse_args()
if args.output:args.output.write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n')
if args.write:
 target=Path(__file__).resolve().parents[1]/'dist/config/geography.json'
 data=json.loads(target.read_text());data['interiors'].setdefault('authoredLayouts',{}).update(D)
 target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print({k:{'rooms':sum(c['kind']=='room' for c in v['cells']),'cells':len(v['cells']),'vertices':sum(len(p['outer'])+sum(map(len,p['holes'])) for p in v['floorPolygons']),'bounds':v['bounds']} for k,v in D.items()})
