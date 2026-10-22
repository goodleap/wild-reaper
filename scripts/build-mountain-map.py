#!/usr/bin/env python3
"""Bake mountain valleys and shared collision contours (offline Shapely 2.x)."""
import argparse
import json
import math
import sys
from pathlib import Path
from shapely.geometry import Point, Polygon, LineString, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.affinity import scale

sys.dont_write_bytecode=True
from natural_contours import natural_ring,natural_route

ROOT=Path(__file__).resolve().parent.parent
BOUNDS=box(-7200,-5400,7200,5400)
def point(x,y):return {'x':round(x,2),'y':round(y,2)}
def pair(p):return p['x'],p['y']
def at(x,y,**extra):return {**point(x,y),**extra}
def coordinates(ring):return [point(x,y) for x,y in list(ring.coords)[:-1]]
def rings(shape,prefix):
    parts=[shape] if shape.geom_type=='Polygon' else list(shape.geoms);result=[]
    for i,p in enumerate(sorted(parts,key=lambda p:-p.area)):
        p=orient(p);result.append({'id':f'{prefix}:{i}','points':coordinates(p.exterior),'hole':False})
        result.extend({'id':f'{prefix}:{i}:hole:{n}','points':coordinates(h),'hole':True} for n,h in enumerate(p.interiors))
    return result

# The land source is three continuous variable-width valleys. Named areas
# mark stretches of those valleys rather than generating separate round rooms.
VALLEYS={
 'west':[(-5650,4750,410),(-5500,4200,650),(-5900,3400,500),(-5200,2200,700),(-5700,1150,450),(-5200,-150,650),(-4750,-1300,440),(-4200,-2450,600),(-3900,-3250,390),(-3400,-4400,540)],
 'central':[(-3200,4000,400),(-3200,3400,650),(-2100,2500,500),(-2100,1600,850),(-2400,100,600),(-1800,-700,400),(-1400,-1800,550),(-1750,-2800,420),(0,-4200,800),(500,-4800,350)],
 'east':[(-200,4200,400),(200,3500,650),(1000,2800,600),(1900,2400,750),(2300,1200,480),(2600,200,550),(3800,-500,450),(4200,-1400,550),(4300,-2700,420),(5800,-4300,680)],
 'ledge':[(5200,100,180),(5500,-250,230),(5900,-700,300),(6200,-1150,220)]
}
REGIONS=[
 ('01','南麓驿站',(-5500,4200),'camp','forest','west'),
 ('02','松风林谷',(-5200,2200),'grove','forest','west'),
 ('03','碎石峡径',(-5200,-150),'pass','rock','west'),
 ('04','北壁古道',(-4200,-2450),'pass','rock','west'),
 ('05','云隙高台',(-3400,-4400),'secret','rock','west'),
 ('06','双岭山口',(-3200,3400),'pass','rock','central'),
 ('07','风蚀采石场',(-2100,1600),'quarry','rock','central'),
 ('08','回云谷地',(-2400,100),'grove','forest','central'),
 ('09','鹰落隘口',(-1400,-1800),'pass','rock','central'),
 ('10','古峰石台',(0,-4200),'fortress','rock','central'),
 ('11','山涧营坡',(200,3500),'camp','forest','east'),
 ('12','青潭谷口',(1900,2400),'grove','forest','east'),
 ('13','叠石斜坡',(2600,200),'pass','rock','east'),
 ('14','鹰脊栈道',(4200,-1400),'pass','rock','east'),
 ('15','朝日峰顶',(5800,-4300),'fortress','rock','east'),
 ('16','东壁藏径',(5900,-700),'secret','rock','ledge'),
]
CENTERS={id:c for id,_,c,*_ in REGIONS}
LINKS=[
 ('m01','01','02',320,'trail',[(-5900,3400)]),
 ('m02','02','03',300,'trail',[(-5700,1150)]),
 ('m03','03','04',280,'trail',[(-4750,-1300)]),
 ('m04','04','05',260,'secret',[(-3900,-3250)]),
 ('m05','06','07',320,'trail',[(-2100,2500)]),
 ('m06','07','08',320,'trail',[]),
 ('m07','08','09',280,'trail',[(-1800,-700)]),
 ('m08','09','10',300,'trail',[(-1750,-2800)]),
 ('m09','11','12',320,'trail',[(1000,2800)]),
 ('m10','12','13',300,'trail',[(2300,1200)]),
 ('m11','13','14',280,'trail',[(3800,-500)]),
 ('m12','14','15',290,'trail',[(4300,-2700)]),
 ('m13','01','06',300,'trail',[(-4400,3500)]),
 ('m14','02','07',270,'bridge',[(-4150,1600),(-4000,1500),(-3400,1250),(-2900,1300)]),
 ('m15','03','08',280,'bridge',[(-4000,500),(-3800,490),(-3200,450)]),
 ('m16','04','09',290,'trail',[(-3000,-2200),(-2400,-1700)]),
 ('m17','06','11',300,'trail',[(-1800,3400),(-800,3900)]),
 ('m18','07','12',290,'bridge',[(-1100,2200),(-300,2200),(300,2200),(1100,2550)]),
 ('m19','08','13',280,'bridge',[(-1400,-350),(-400,-550),(100,-350),(700,-100),(1500,0)]),
 ('m20','09','14',270,'trail',[(200,-1700),(1000,-2200),(2500,-2150),(3400,-1800)]),
 ('m21','10','15',300,'trail',[(2000,-4500),(3400,-4000),(4650,-4100)]),
 ('m22','14','16',210,'secret',[(5000,-1200),(5400,-800)]),
 ('m23','13','16',220,'trail',[(4600,300),(5200,100),(5650,-250)]),
 ('exit-city','01',None,320,'exit',[(-6500,4700)]),
 ('exit-snow','15',None,320,'exit',[(6500,-4300),(6500,-4800)]),
]
DECKS={'m14':((-4000,1500),(-3400,1250)),'m15':((-3800,490),(-3200,450)),'m18':((-300,2200),(300,2200)),'m19':((100,-350),(700,-100))}
SPAWN=at(-5570,4320,area='01')
PLAN={
 'merchant':at(-5150,4100,r=105),'supply':at(-4900,2250,r=125),
 'occupied':at(-2400,1550,r=225),'castle':at(0,-4000,r=360),
 'hunt':at(-5400,-100,r=280),'rescue':at(-2650,180,r=240),
 'rune':at(6100,-4200,r=185),'rescue-warden':at(0,3500,r=240),
 'dogcamp':at(-5900,4000,r=115),'owlroost':at(2000,2700,r=240),
 'golemaltar':at(-4350,-2350,r=270),'stonevault':at(-1150,-1900,r=240),
 'portal:4':at(-6500,4700,r=90,arrivalDirection=point(1,0)),
 'portal:6':at(6500,-4800,r=90,arrivalDirection=point(0,1)),
}
CAVES=[
 at(-3550,-4480,id='cloud-cave',name='云隙洞口',area='05',caveId='folded-ridge-tunnel',caveName='叠岭暗道',seed=81701,exitName='云隙高台',approach=point(-3400,-4320)),
 at(-2350,1850,id='quarry-cave',name='采石洞口',area='07',caveId='folded-ridge-tunnel',caveName='叠岭暗道',seed=81701,exitName='风蚀采石场',approach=point(-2170,1710)),
 at(5900,-750,id='ledge-cave',name='东壁洞口',area='16',caveId='echo-vein-vault',caveName='回声石窟',seed=81702,exitName='东壁藏径',approach=point(5770,-600)),
]
CHESTS=[
 ('pine-cache','松根藏匣','02',-5600,2300),('gravel-cache','峡径旧箱','03',-5000,-350),
 ('cloud-cache','云隙秘匣','05',-3150,-4380),('quarry-cache','采石遗箱','07',-1800,1300),
 ('valley-cache','谷地旧箱','08',-2350,-200),('peak-cache','古峰藏匣','10',350,-4300),
 ('lake-cache','青潭藏匣','12',1650,2400),('slope-cache','叠石旧箱','13',2800,350),
 ('sunrise-cache','朝日秘藏','15',5600,-4450),('ledge-cache','东壁秘匣','16',6000,-900),
]

def ribbon(knots,reach=170):
    centers=natural_route([(x,y) for x,y,_ in knots],reach=reach)
    widths=[]
    for a,b in zip(knots,knots[1:]):widths.extend(a[2]+(b[2]-a[2])*i/3 for i in range(3))
    widths.append(knots[-1][2]);left=[];right=[];normals=[]
    for i,((x,y),width) in enumerate(zip(centers,widths)):
        a=centers[max(0,i-1)];b=centers[min(len(centers)-1,i+1)];dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length
        normals.append((nx,ny));left.append((x+nx*width,y+ny*width));right.append((x-nx*width,y-ny*width))
    # Half-width caps end the valley smoothly without circular arena bulbs.
    def cap(index,sign):
        x,y=centers[index];nx,ny=normals[index];w=widths[index];tx,ty=ny,-nx
        return [(x+nx*math.cos(a)*w+tx*math.sin(a)*w*.55*sign,y+ny*math.cos(a)*w+ty*math.sin(a)*w*.55*sign) for a in [math.pi/4,math.pi/2,3*math.pi/4]]
    outline=[*left,*cap(-1,1),*reversed(right),*reversed(cap(0,-1))]
    shape=Polygon(natural_ring(outline,reach=90)).buffer(0)
    assert shape.geom_type=='Polygon' and BOUNDS.covers(shape),'Invalid valley ribbon'
    return shape

def build():
    valleys={id:ribbon(knots) for id,knots in VALLEYS.items()}
    areas=[];by_id={}
    for id,name,(x,y),kind,material,valley in REGIONS:
        radius=1150 if kind in ['quarry','fortress'] else 1000
        zone=valleys[valley].intersection(box(x-radius,y-radius,x+radius,y+radius)).buffer(0)
        if zone.geom_type!='Polygon':zone=next(p for p in zone.geoms if p.contains(Point(x,y)))
        assert zone.covers(Point(x,y).buffer(100)),f'Area anchor {id}'
        by_id[id]=zone;areas.append({'id':id,'name':name,'center':point(x,y),'kind':kind,'material':material,'points':coordinates(zone.exterior)})
    passages=[];corridors=[]
    for id,source,target,width,kind,middle in LINKS:
        raw=[CENTERS[source],*middle,*([CENTERS[target]] if target else [])]
        spine=natural_route(raw,reach=230) if kind not in ['bridge','exit'] else raw
        shape=LineString(spine).buffer(width/2,quad_segs=8)
        if id in ['m13','m16','m17','m20','m21','m22','m23']:
            # Cross-valley passes tighten at rock saddles and ease around
            # bends; they are footpaths rather than constant-width roads.
            shape=ribbon([(x,y,width/2*([1.28,1.02,1.32,1.12][i%4])) for i,(x,y) in enumerate(raw)],reach=230)
        passages.append({'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coordinates(shape.exterior),'waypoints':[point(*p) for p in spine]});corridors.append(shape)
        if id in DECKS:passages[-1]['deck']=[point(*p) for p in DECKS[id]]
    walk=unary_union([*valleys.values(),*corridors]).buffer(0)
    assert walk.geom_type=='Polygon' and BOUNDS.covers(walk),'Valley pass disconnected'
    encounters=[]
    placements=[
      ('02','combat',0,(-5300,1900)),('03','guard',1,(-4950,-50)),
      ('04','combat',2,(-4000,-2600)),('05','boss',4,(-3270,-4400)),
      ('06','guard',1,(-3250,3150)),('07','combat',2,(-1850,1850)),
      ('08','combat',1,(-2250,350)),('09','guard',3,(-1450,-2150)),
      ('10','combat',3,(-350,-4200)),('11','combat',1,(450,3450)),
      ('12','combat',2,(1750,2150)),('13','guard',2,(2750,100)),
      ('14','combat',3,(4050,-1650)),('15','boss',4,(5650,-4300)),
      ('16','combat',3,(6050,-900)),('10','guard',3,(200,-4500)),
    ]
    for n,(area,kind,tier,(x,y)) in enumerate(placements):
        e=at(x,y,id=f'clearing:mountain:{area}:{n}',area=area,r=205 if kind=='boss' else 135,kind=kind,tier=tier)
        if kind=='guard':e.update(count=4,strength=1.4,name='山口守卫')
        elif kind=='combat':e['count']=5 if tier<3 else 6
        else:e.update(bossKind='ancient' if area=='05' else 'bloom',name='云隙守望者' if area=='05' else '群峰守望者')
        encounters.append(e)
    chests=[at(x,y,id=id,name=name,area=area,approach=point(x,y+80)) for id,name,area,x,y in CHESTS]
    landmarks={'spawn':SPAWN}
    for key,p in PLAN.items():
        if key.startswith('portal:'):landmarks[key.replace(':','-')]=dict(p,kind='exit',target=int(key.split(':')[1]))
    for c in CAVES:landmarks['cave-'+c['id']]={k:c[k] for k in ('x','y','area')}|{'kind':'cave'}
    for e in encounters:
        if e['kind']=='boss':landmarks['boss'+e['area']]={k:e[k] for k in ('x','y','area')}|{'kind':'boss'}
    for c in chests:landmarks['treasure-'+c['id']]={k:c[k] for k in ('x','y','area')}|{'kind':'treasure'}
    protected=[SPAWN,*PLAN.values(),*encounters,*CAVES,*chests,*[s['approach'] for s in [*CAVES,*chests]],*[a['center'] for a in areas]]
    reserve=unary_union([*[Point(pair(p)).buffer(p.get('r',90)+65) for p in protected],*[LineString([pair(q) for q in p['waypoints']]).buffer(p['width']/2+55) for p in passages]])
    # The broad quarry and forest valley contain rooted rock/woodland spines.
    # These are terrain, so walking along a long face cannot snag on prop seams.
    spurs=[]
    for id in ['01','02','03','04','07','08','10','12','13','15']:
        area=by_id[id];boundary=area.exterior;choices=[]
        for n in range(54):
            s=boundary.length*n/54;p=boundary.interpolate(s);a=boundary.interpolate((s-12)%boundary.length);b=boundary.interpolate((s+12)%boundary.length)
            dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy);tx,ty=dx/length,dy/length;nx,ny=-ty,tx
            if not area.contains(Point(p.x+nx*20,p.y+ny*20)):nx,ny=-nx,-ny
            for depth in [250,380,520]:
                for radius in [130,180,230]:
                    local=[(-radius,-200),(-radius*.9,depth*.2),(-radius*.45,depth*.7),(0,depth),(radius*.45,depth*.8),(radius*.85,depth*.3),(radius,-200)]
                    reef=Polygon(natural_ring([(p.x+tx*u+nx*v,p.y+ty*u+ny*v) for u,v in local],reach=70)).buffer(0)
                    if reef.intersects(reserve):continue
                    cut=walk.intersection(reef)
                    if cut.area<45000:continue
                    candidate=walk.difference(reef)
                    if candidate.geom_type!='Polygon' or candidate.buffer(-55).geom_type!='Polygon':continue
                    choices.append((cut.area,reef,candidate))
        if choices:
            _,reef,walk=max(choices,key=lambda q:q[0]);spurs.append(reef)
    # Round both projecting ridge tips and sharp concave junctions on the
    # shared terrain contour, never by painting over a different collider.
    walk=walk.buffer(80,quad_segs=6).buffer(-160,quad_segs=6).buffer(80,quad_segs=6).simplify(1.2,preserve_topology=True)
    # Water is confined to real streams and two alpine pools. The remaining
    # land is raised mountain; no invisible chasm or special gravity mechanic.
    creek=LineString(natural_route([(-4050,2700),(-3950,2050),(-3700,1375),(-3500,450),(-3750,-450)],reach=160)).buffer(260,quad_segs=10)
    south_lake=Polygon(natural_ring([(-650,1700),(-100,1300),(450,1600),(700,2200),(450,2900),(-150,3200),(-650,2700),(-850,2100)],reach=150)).buffer(0)
    high_lake=Polygon(natural_ring([(-600,-900),(200,-1200),(1050,-900),(1400,-350),(1050,300),(400,500),(-350,100),(-750,-450)],reach=160)).buffer(0)
    stream=LineString(natural_route([(300,500),(250,1000),(-100,1700)],reach=120)).buffer(110,quad_segs=8)
    water=unary_union([creek,south_lake,high_lake,stream]).difference(unary_union([walk,*spurs])).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    patches=[]
    for n,area in enumerate(areas):
        if area['material']!='forest' and area['kind']!='quarry':continue
        free=by_id[area['id']].intersection(walk).difference(reserve)
        if free.is_empty:continue
        candidate=max(list(free.geoms) if free.geom_type=='MultiPolygon' else [free],key=lambda q:q.area);p=candidate.representative_point()
        patch=scale(Point(p.x,p.y).buffer(1,quad_segs=7),250,160).intersection(candidate)
        for j,r in enumerate(rings(patch,'patch')):
            if r['hole']:continue
            center=Polygon([pair(q) for q in r['points']]).representative_point()
            patches.append({'id':f'mountain-grove:{n}:{j}','kind':'grove','center':point(center.x,center.y),'x':round(center.x,2),'y':round(center.y,2),'rx':250,'ry':160,'density':.3,'points':r['points']})
    layout={'kind':'rift-forest','worldId':'mountain','id':'mountain:1','name':'群峰山地','revision':1,'artTheme':'mountain',
      'palette':{'ground':'#d2cbb0','brush':'#9caf83','forest':'#49694f','ridge':'#92978c','water':'#538c91','waterLight':'#a2c9bd','bridge':'#aa936b'},
      'bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':SPAWN,'areas':areas,'passages':passages,
      'boundaries':rings(walk,'mountain-ground'),'solidBoundaries':rings(high,'mountain-high'),
      'lakes':[dict(r,kind='water') for r in rings(water,'mountain-water')],
      'landmarks':landmarks,'plan':PLAN,'encounters':encounters,'patches':patches,
      'interactions':{'caves':CAVES,'gates':[],'chests':chests}}
    validate_geometry(layout,walk,water)
    return layout,walk,water

def validate_geometry(layout,walk,water):
    free=walk.buffer(-55);assert free.geom_type=='Polygon','55-unit body cannot traverse every valley'
    for p in layout['passages']:
        line=LineString([pair(q) for q in p['waypoints']]);assert walk.buffer(.03).covers(line.buffer(70)),f"Route clearance {p['id']}"
        if 'deck' in p:
            a,b=map(pair,p['deck']);dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length;center=((a[0]+b[0])/2,(a[1]+b[1])/2)
            for sign in [-1,1]:assert water.covers(Point(center[0]+nx*sign*(p['width']/2+70),center[1]+ny*sign*(p['width']/2+70)).buffer(30)),f"Bridge water sides {p['id']}"
    targets=[('spawn',layout['spawn'],155)]
    targets.extend((key,p,min(p['r'],150)) for key,p in layout['plan'].items())
    targets.extend((p['id'],p,65) for group in layout['interactions'].values() for p in group)
    targets.extend((p['id']+':approach',p['approach'],55) for group in layout['interactions'].values() for p in group if 'approach' in p)
    targets.extend((p['id'],p,65 if p['kind']=='boss' else 45) for p in layout['encounters'])
    for id,p,r in targets:
        assert walk.covers(Point(pair(p)).buffer(r)),f'Target clearance {id}'
        assert free.contains(Point(pair(p))),f'Target disconnected {id}'
    for area in layout['areas']:assert walk.covers(Point(pair(area['center'])).buffer(90)),f"Area anchor {area['id']}"
    assert .27<=walk.area/BOUNDS.area<=.40,f'Walk fraction {walk.area/BOUNDS.area:.3f}'
    assert len(layout['boundaries'])<=64 and len(layout['solidBoundaries'])<=64 and len(layout['lakes'])<=32

def preview(layout,walk,water,out):
    from xml.sax.saxutils import escape
    out.mkdir(parents=True,exist_ok=True)
    def path(shape):return ' '.join('M'+' L'.join(f"{p['x']},{p['y']}" for p in r['points'])+' Z' for r in rings(shape,'preview'))
    body=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="-7400 -5600 14800 11922">','<rect x="-7400" y="-5600" width="14800" height="11922" fill="#666f66"/>',f'<path d="{path(water)}" fill="#538c91" fill-rule="evenodd" stroke="#a2c9bd" stroke-width="25"/>',f'<path d="{path(walk)}" fill="#d2cbb0" fill-rule="evenodd" stroke="#a3ad92" stroke-width="24"/>']
    for p in layout['passages']:
        if 'deck' in p:
            a,b=p['deck'];body.append(f'<line x1="{a["x"]}" y1="{a["y"]}" x2="{b["x"]}" y2="{b["y"]}" stroke="#b39a70" stroke-width="{p["width"]}"/>')
    for area in layout['areas']:
        p=area['center'];body.append(f'<text x="{p["x"]}" y="{p["y"]+55}" text-anchor="middle" font-family="Noto Sans CJK SC,sans-serif" font-size="145" font-weight="bold" fill="#3b5147">{escape(area["id"]+" "+area["name"])}</text>')
    for p in layout['encounters']:
        if p['kind']=='boss':body.append(f'<circle cx="{p["x"]}" cy="{p["y"]-170}" r="85" fill="#b76654" stroke="#f0dfb1" stroke-width="20"/>')
    for p in CAVES:body.append(f'<path d="M{p["x"]-80},{p["y"]+50} a80,100 0 0 1 160,0 z" fill="#334c43" stroke="#b7ac87" stroke-width="25"/>')
    for p in layout['interactions']['chests']:body.append(f'<rect x="{p["x"]-55}" y="{p["y"]-45}" width="110" height="90" fill="#dfbc70" stroke="#836946" stroke-width="20"/>')
    body.extend(['<text x="-6800" y="5850" font-family="Noto Sans CJK SC,sans-serif" font-size="210" fill="#eef0d1">群峰山地 · 布局预览</text>',f'<text x="-6800" y="6180" font-family="Noto Sans CJK SC,sans-serif" font-size="140" fill="#d2dfc6">浅色：连续谷地、山口与斜向山径　深色：连片山脊　青蓝：溪流与高山湖　14400×10800 · 可行走 {walk.area/BOUNDS.area:.1%}</text>','</svg>'])
    (out/'mountain-layout.svg').write_text('\n'.join(body));(out/'mountain-layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))

def write_world(layout):
    path=ROOT/'dist/config/worlds.json';source=path.read_text();decoder=json.JSONDecoder();start=source.index('[',source.index('"definitions"'))+1
    while True:
        while source[start].isspace() or source[start]==',':start+=1
        if source[start]==']':raise ValueError('Missing mountain world')
        w,end=decoder.raw_decode(source,start)
        if w['id']=='mountain':break
        start=end
    w['authored']=layout
    w['colors'].update(ground='#d2cbb0',light='#e2dcc3',dark='#607367',accent='#bfd5b6',mist='#d4dfd5',grass='#93a77c',stone='#a2a89a')
    w['art']['coast']={'deep':'#3d717b','sea':'#538c91','shallow':'#a2c9bd','sand':'#b8bea2','grain':'#e2dcc3','edge':'#b1c4ac','fringe':'#829b78'}
    w['art']['mapCoast']={'land':'#92978c','sand':'#c8c9ad','sea':'#3d717b','shallow':'#538c91'}
    w['layout']={'paths':[[[p['x'],p['y']] for p in route['waypoints']] for route in layout['passages'] if route['to']],'patches':[['brush',p['x'],p['y'],p['rx'],p['ry'],0,.3] for p in layout['patches']],'lakes':[],'ridges':[],'bossKind':'bloom'}
    replacement=json.dumps(w,ensure_ascii=False,indent=2);replacement='\n'.join(('    '+line if i else line) for i,line in enumerate(replacement.splitlines()))
    path.write_text(source[:start]+replacement+source[end:])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-dir',type=Path);parser.add_argument('--write',action='store_true');args=parser.parse_args()
    layout,walk,water=build()
    if args.preview_dir:preview(layout,walk,water,args.preview_dir)
    if args.write:write_world(layout)
    print(json.dumps({'areas':len(layout['areas']),'passages':len(layout['passages']),'walkFraction':round(walk.area/BOUNDS.area,4),'waterRings':len(layout['lakes']),'written':args.write},ensure_ascii=False))

if __name__=='__main__':main()
