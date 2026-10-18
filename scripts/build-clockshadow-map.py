#!/usr/bin/env python3
"""Bake Clockshadow's ground, foundations and route graph. Requires Shapely 2.x."""
import json
import math
import random
import sys
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
sys.dont_write_bytecode = True
from natural_contours import natural_ring, natural_route

ROOT = Path(__file__).resolve().parent.parent
BOUNDS = box(-7200, -5400, 7200, 5400)
RNG = random.Random(1061827)
def p(x, y): return {'x': round(x, 2), 'y': round(y, 2)}
def xy(v): return v['x'], v['y']
def coords(r): return [p(x, y) for x, y in list(r.coords)[:-1]]
def rings(g, prefix):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for i, poly in enumerate(sorted(polys, key=lambda q: -q.area)):
        poly = orient(poly)
        out.append({'id': f'{prefix}:{i}', 'hole': False, 'points': coords(poly.exterior)})
        out.extend({'id': f'{prefix}:{i}:hole:{j}', 'hole': True, 'points': coords(r)} for j, r in enumerate(poly.interiors))
    return out

def organic(x,y,rx,ry,phase=0):
    points=[]
    for i in range(18):
        a=i*math.tau/18;f=1+.10*math.sin(a*3+phase)+.045*math.sin(a*5-phase)
        points.append((x+math.cos(a)*rx*f,y+math.sin(a)*ry*f))
    return Polygon(natural_ring(points,reach=70)).buffer(0)

BLUEPRINT = {'areas': [{'id': '01',
            'name': '南郊驿站',
            'center': {'x': -5700, 'y': 3850},
            'kind': 'camp',
            'material': 'forest'},
           {'id': '02',
            'name': '荒草果园',
            'center': {'x': -5800, 'y': 1500},
            'kind': 'grove',
            'material': 'forest'},
           {'id': '03',
            'name': '城南残市',
            'center': {'x': -3250, 'y': 3550},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '04',
            'name': '炉火工坊',
            'center': {'x': -700, 'y': 2000},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '05',
            'name': '货运仓港',
            'center': {'x': 50, 'y': 4000},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '06',
            'name': '军门兵营',
            'center': {'x': -3400, 'y': 100},
            'kind': 'fortress',
            'material': 'rock'},
           {'id': '07',
            'name': '商旅长街',
            'center': {'x': -1300, 'y': 0},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '08',
            'name': '钟楼广场',
            'center': {'x': 700, 'y': -400},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '09',
            'name': '圣钟学舍',
            'center': {'x': -1600, 'y': -2050},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '10',
            'name': '旧城堡',
            'center': {'x': -4200, 'y': -3350},
            'kind': 'fortress',
            'material': 'rock'},
           {'id': '11',
            'name': '北墙瓮城',
            'center': {'x': 450, 'y': -3700},
            'kind': 'fortress',
            'material': 'rock'},
           {'id': '12',
            'name': '桥头商埠',
            'center': {'x': 3450, 'y': -150},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '13',
            'name': '内苑花园',
            'center': {'x': 3700, 'y': -2600},
            'kind': 'grove',
            'material': 'forest'},
           {'id': '14',
            'name': '沉钟大教堂',
            'center': {'x': 5750, 'y': -3350},
            'kind': 'fortress',
            'material': 'rock'},
           {'id': '15',
            'name': '城东断街',
            'center': {'x': 5750, 'y': 50},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': '16',
            'name': '望河高台',
            'center': {'x': 4800, 'y': 3250},
            'kind': 'ruins',
            'material': 'rock'},
           {'id': 'S1',
            'name': '墙后花园',
            'center': {'x': -6100, 'y': -3100},
            'kind': 'secret',
            'material': 'forest'},
           {'id': 'S2',
            'name': '废仓夹层',
            'center': {'x': 5950, 'y': 4950},
            'kind': 'secret',
            'material': 'rock'},
           {'id': 'S3',
            'name': '封闭水庭',
            'center': {'x': 1450, 'y': -5050},
            'kind': 'secret',
            'material': 'rock'}],
 'plan': {'merchant': {'x': -5430, 'y': 4150, 'r': 105},
          'supply': {'x': -3750, 'y': 3100, 'r': 125},
          'occupied': {'x': -450, 'y': 2450, 'r': 225},
          'castle': {'x': 500, 'y': -200, 'r': 150},
          'hunt': {'x': -3150, 'y': -500, 'r': 200},
          'rescue': {'x': 4200, 'y': -2300, 'r': 230},
          'rune': {'x': 900, 'y': -950, 'r': 185},
          'rescue-warden': {'x': 5450, 'y': 500, 'r': 230},
          'dogcamp': {'x': -5450, 'y': 3600, 'r': 115},
          'owlroost': {'x': -5650, 'y': 2000, 'r': 180},
          'golemaltar': {'x': 450, 'y': 4250, 'r': 230},
          'stonevault': {'x': 4400, 'y': 3800, 'r': 200}},
 'interactions': {'caves': [{'x': -1050,
                             'y': -2500,
                             'id': 'school-sewer',
                             'area': '09',
                             'name': '学舍地窖',
                             'caveId': 'city-sewer',
                             'seed': 11241,
                             'exitName': '返回圣钟学舍'},
                            {'x': 3850,
                             'y': -3150,
                             'id': 'garden-sewer',
                             'area': '13',
                             'name': '内苑暗渠',
                             'caveId': 'city-sewer',
                             'seed': 11241,
                             'exitName': '返回内苑花园'},
                            {'x': 500,
                             'y': 4450,
                             'id': 'wine-cellar',
                             'area': '05',
                             'name': '地下酒窖',
                             'caveId': 'city-cellar',
                             'seed': 11242,
                             'exitName': '返回货运仓港'}],
                  'gates': [],
                  'chests': [{'x': -6080,
                              'y': -3100,
                              'area': 'S1',
                              'kind': 'treasure',
                              'id': 'garden-cache',
                              'name': '墙后花园遗藏'},
                             {'x': 5950,
                              'y': 4950,
                              'area': 'S2',
                              'kind': 'treasure',
                              'id': 'warehouse-cache',
                              'name': '废仓旧匣'},
                             {'x': 1450,
                              'y': -5050,
                              'area': 'S3',
                              'kind': 'treasure',
                              'id': 'water-court-cache',
                              'name': '水庭石匣'},
                             {'x': 5950,
                              'y': 3800,
                              'area': '16',
                              'kind': 'treasure',
                              'id': 'lookout-cache',
                              'name': '望河遗藏'}]},
 'encounters': [{'x': -3400,
                 'y': 100,
                 'id': 'clearing:city:06-guard',
                 'r': 150,
                 'kind': 'guard',
                 'tier': 3,
                 'name': '旧都守卫',
                 'strength': 1.4,
                 'count': 4},
                {'x': -700,
                 'y': 2000,
                 'id': 'clearing:city:04-guard',
                 'r': 150,
                 'kind': 'guard',
                 'tier': 3,
                 'name': '旧都守卫',
                 'strength': 1.4,
                 'count': 4},
                {'x': 450,
                 'y': -3700,
                 'id': 'clearing:city:11-guard',
                 'r': 150,
                 'kind': 'guard',
                 'tier': 3,
                 'name': '旧都守卫',
                 'strength': 1.4,
                 'count': 4},
                {'x': 5750,
                 'y': 50,
                 'id': 'clearing:city:15-guard',
                 'r': 150,
                 'kind': 'guard',
                 'tier': 3,
                 'name': '旧都守卫',
                 'strength': 1.4,
                 'count': 4},
                {'x': -5800,
                 'y': 800,
                 'id': 'clearing:city:02-north',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 0,
                 'count': 5},
                {'x': -5800,
                 'y': 2300,
                 'id': 'clearing:city:02-south',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 1,
                 'count': 6},
                {'x': -3750,
                 'y': 3850,
                 'id': 'clearing:city:03-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 1,
                 'count': 6},
                {'x': -2700,
                 'y': 3550,
                 'id': 'clearing:city:03-east',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 1,
                 'count': 6},
                {'x': -1200,
                 'y': 2000,
                 'id': 'clearing:city:04-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': -550,
                 'y': 4000,
                 'id': 'clearing:city:05-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': -3400,
                 'y': -700,
                 'id': 'clearing:city:06-north',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': -650,
                 'y': 0,
                 'id': 'clearing:city:07-east',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 1,
                 'count': 6},
                {'x': 700,
                 'y': 250,
                 'id': 'clearing:city:08-south',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': -2200,
                 'y': -2050,
                 'id': 'clearing:city:09-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': -1600,
                 'y': -2700,
                 'id': 'clearing:city:09-north',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': 450,
                 'y': -4350,
                 'id': 'clearing:city:11-north',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 3,
                 'count': 6},
                {'x': 3050,
                 'y': -150,
                 'id': 'clearing:city:12-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': 3450,
                 'y': 500,
                 'id': 'clearing:city:12-south',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': 3200,
                 'y': -2600,
                 'id': 'clearing:city:13-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': 4300,
                 'y': -2600,
                 'id': 'clearing:city:13-east',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 3,
                 'count': 6},
                {'x': 5750,
                 'y': -2600,
                 'id': 'clearing:city:14-south',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 3,
                 'count': 6},
                {'x': 5750,
                 'y': -750,
                 'id': 'clearing:city:15-north',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 3,
                 'count': 6},
                {'x': 4100,
                 'y': 3250,
                 'id': 'clearing:city:16-west',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 2,
                 'count': 5},
                {'x': 5800,
                 'y': 3250,
                 'id': 'clearing:city:16-east',
                 'r': 145,
                 'kind': 'combat',
                 'tier': 3,
                 'count': 6},
                {'x': -4200,
                 'y': -3350,
                 'id': 'clearing:city:10-boss',
                 'r': 185,
                 'kind': 'boss',
                 'tier': 4,
                 'bossKind': 'ancient',
                 'name': '旧城堡守望者'},
                {'x': 5750,
                 'y': -3350,
                 'id': 'clearing:city:14-boss',
                 'r': 185,
                 'kind': 'boss',
                 'tier': 4,
                 'bossKind': 'ancient',
                 'name': '沉钟圣堂守望者'}]}
# Stable area identities retain their existing encounters and underground links.
ROOMS = [
 ('01',-5700,3850,780,680),('02',-5800,1500,680,1030),
 ('03',-3250,3550,980,730),('04',-700,2000,900,710),
 ('05',50,4000,940,690),('06',-3400,100,800,890),
 ('07',-1300,0,950,650),('08',700,-400,760,910),
 ('09',-1600,-2050,960,760),('10',-4200,-3350,1020,840),
 ('11',450,-3700,790,780),('12',3450,-150,760,910),
 ('13',3700,-2600,760,840),('14',5750,-3350,900,940),
 ('15',5750,50,740,1080),('16',4800,3250,1070,780),
 ('S1',-6100,-3100,500,610),('S2',5950,4750,530,390),
 ('S3',1000,-4870,650,290)]
CENTERS={id:(x,y) for id,x,y,*_ in ROOMS}
GREEN={'01','02','13','S1'}
# Deliberate street bends have generous corners, while exterior lanes curve.
LINKS=[
 ('01-03','01','03',280,[(-4870,3850),(-4530,3850),(-4530,3550)]),
 ('01-02','01','02',240,[(-6100,3030),(-6250,2500)]),
 ('02-06','02','06',260,[(-5700,400),(-4880,400),(-4500,400),(-4020,400)]),
 ('03-07','03','07',260,[(-2620,3220),(-2620,1200),(-2350,1200),(-2350,0)]),
 ('03-04','03','04',240,[(-2100,3550),(-1600,3550),(-1600,2500)]),
 ('04-05','04','05',240,[(-250,2550),(-250,3200),(50,3400)]),
 ('07-04','07','04',240,[(-1050,550),(-1050,1180),(-700,1180)]),
 ('06-07','06','07',260,[(-2600,100),(-2600,0)]),
 ('06-09','06','09',220,[(-3400,-1190),(-2700,-1190),(-2200,-1500)]),
 ('07-08','07','08',280,[(-350,0),(700,0)]),
 ('08-12','08','12',260,[(1050,-150),(1600,-150),(2550,-150),(3000,-150)]),
 ('05-16','05','16',250,[(1000,3750),(1600,3750),(2550,3750),(3300,3750),(3800,3250)]),
 ('12-16','12','16',240,[(3450,1050),(4000,1050),(4000,2320)]),
 ('12-15','12','15',240,[(4350,-150),(4620,-150),(4620,50)]),
 ('15-16','15','16',220,[(6100,1100),(6100,2300),(5650,2600)]),
 ('12-13','12','13',250,[(3250,-1200),(3250,-1800),(3700,-1800)]),
 ('13-14','13','14',250,[(4600,-2600),(4950,-2600),(4950,-3350)]),
 ('13-15','13','15',220,[(4350,-2000),(4800,-2000),(4800,-950),(5300,-950)]),
 ('09-10','09','10',240,[(-2400,-2050),(-2900,-2050),(-2900,-2700),(-4200,-2700)]),
 ('10-11','10','11',220,[(-3100,-3350),(-3100,-4410),(-1800,-4410),(-950,-4410),(-950,-3700)]),
 ('09-11','09','11',240,[(-600,-2050),(100,-2050),(100,-2800),(450,-2800)]),
 ('10-S1','10','S1',160,[(-5150,-3350),(-5520,-3350),(-5520,-3100)]),
 ('16-S2','16','S2',170,[(5250,4020),(5500,4020),(5500,4600)]),
 ('11-S3','11','S3',160,[(450,-4600),(1000,-4600)])]
BRIDGES={'08-12':((1450,-150),(2700,-150)), '05-16':((1450,3750),(2700,3750))}
# Existing difficulty, encounter identities, cave seeds and rewards stay intact.
plan={key:dict(v) for key,v in BLUEPRINT['plan'].items()}
plan.update(merchant={**plan['merchant'],'x':-5900,'y':4000},
 supply={**plan['supply'],'x':-3750,'y':3250},
 occupied={**plan['occupied'],'x':-500,'y':2400},
 castle={**plan['castle'],'x':430,'y':-400},
 hunt={**plan['hunt'],'x':-3650,'y':-460},
 rescue={**plan['rescue'],'x':4020,'y':-2300},
 rune={**plan['rune'],'x':950,'y':-920},
 **{'rescue-warden':{**plan['rescue-warden'],'x':5540,'y':530}},
 dogcamp={**plan['dogcamp'],'x':-5450,'y':3600},
 owlroost={**plan['owlroost'],'x':-5650,'y':2000},
 golemaltar={**plan['golemaltar'],'x':450,'y':4250},
 stonevault={**plan['stonevault'],'x':4500,'y':3650})
PLAN_AREAS=dict(zip(plan,['01','03','04','08','06','13','08','15','01','02','05','16']))
for key,v in plan.items():v['area']=PLAN_AREAS[key]
encounters=[dict(v) for v in BLUEPRINT['encounters']]
for v in encounters:
    v['area']=v['id'].split(':')[-1].split('-')[0]
    if v['area']=='02':v['x']=-6200 if 'south' in v['id'] else -5800;v['y']=1850 if 'south' in v['id'] else 950
    if v['id'].endswith('03-east'):v.update(x=-2780,y=3670)
    if v['id'].endswith('11-north'):v.update(x=500,y=-4200)
    if v['id'].endswith('16-east'):v.update(x=5450,y=3300)
interactions={key:[dict(v) for v in BLUEPRINT['interactions'][key]] for key in ['caves','gates','chests']}
for v in interactions['chests']:
    if v['area']=='S2':v.update(x=5950,y=4750)
    if v['area']=='S3':v.update(x=1000,y=-4870)
    if v['area']=='16':v.update(x=5630,y=3660)
for key in ['caves','chests']:
    for v in interactions[key]:v['approach']=p(v['x'],v['y']+65 if key=='caves' else v['y']+45)
spawn={**p(-5700,3850),'area':'01'}

areas=[];area_polys={};room_solids=[]
for i,(id,x,y,rx,ry) in enumerate(ROOMS):
    base=next(a for a in BLUEPRINT['areas'] if a['id']==id)
    if id in GREEN:
        shape=organic(x,y,rx,ry,i*.61)
    else:
        # Staggered courtyards avoid a repeated row of rectangular plazas.
        raw=[(x-rx,y-ry*.65),(x-rx*.7,y-ry),(x+rx*.35,y-ry),
             (x+rx*.35,y-ry*.82),(x+rx,y-ry*.82),(x+rx,y+ry*.48),
             (x+rx*.63,y+ry*.48),(x+rx*.63,y+ry),(x-rx*.45,y+ry),(x-rx*.45,y+ry*.76),(x-rx,y+ry*.76)]
        shape=Polygon(raw).buffer(-34,join_style=2).buffer(34,quad_segs=3)
    shape=shape.intersection(BOUNDS.buffer(-100))
    area_polys[id]=shape;room_solids.append(shape)
    areas.append({**base,'center':p(x,y),'points':coords(shape.exterior)})
passages=[];lines=[];corridors=[]
def add_route(id,source,target,raw,width,kind='trail',main=False):
    raw=[tuple(v) for v in raw]
    # Road corners remain authored; round only their shoulder, not their graph.
    line=LineString(raw);shape=line.buffer(width/2,quad_segs=6,join_style=1)
    passage={'id':id,'from':source,'to':target,'width':width,'kind':kind,'mainRoute':main,'points':coords(shape.exterior),'waypoints':[p(*v) for v in raw]}
    if id in BRIDGES:
        a,b=BRIDGES[id];passage.update(kind='bridge',deck=[p(*a),p(*b)],points=coords(box(a[0],a[1]-width/2,b[0],b[1]+width/2).exterior))
    passages.append(passage);lines.append(line);corridors.append(shape)
for id,source,target,width,middle in LINKS:
    kind='secret' if target.startswith('S') else 'trail'
    raw=[CENTERS[source],*middle,CENTERS[target]]
    if source in GREEN and target in GREEN:raw=natural_route(raw,reach=95)
    add_route(id,source,target,raw,width,kind,id in ['01-03','03-07','07-08','08-12','12-13','13-14'])

# Within-quarter lanes form loops around actual building blocks, connected to
# the same macro graph used for large detours and guidance.
for id,x,y,rx,ry in ROOMS:
    if id.startswith('S') or id in GREEN:continue
    a=min(570,rx*.60);b=min(440,ry*.58)
    route=[(x,y),(x-a,y),(x-a,y-b),(x+a,y-b),(x+a,y+b),(x-a,y+b),(x-a,y),(x,y)]
    add_route(id+'-court-loop',id,id,route,170)
# Spur graph entries make every off-road interaction independently reachable.
for key in ['caves','chests']:
    for v in interactions[key]:add_route('visit:'+v['id'],v['area'],None,[CENTERS[v['area']],xy(v['approach'])],160,'cave' if key=='caves' else 'secret')
for key,v in plan.items():add_route('site:'+key,v['area'],None,[CENTERS[v['area']],xy(v)],170)
# Stable identities allow test and renderer to share the new boundary data.
walk=unary_union([*room_solids,*corridors])
left=[(1600,-5200),(1510,-4700),(1640,-4200),(1510,-3200),(1600,-2300),(1600,-1000),(1600,700),(1490,1300),(1630,2200),(1600,3000),(1600,4450),(1360,5100)]
right=[(2480,5100),(2550,4450),(2550,3000),(2600,2200),(2460,1300),(2550,700),(2550,-1000),(2550,-2300),(2640,-3200),(2520,-4200),(2630,-4700),(2550,-5200)]
water=Polygon(natural_ring([*left,*right],reach=100)).buffer(0)
bridge_shapes=[Polygon([xy(q) for q in v['points']]) for v in passages if v['kind']=='bridge']
walk=walk.difference(water).union(unary_union(bridge_shapes))

# Protect complete bodies, objective areas, actual doors, and both sides of
# each road before filling spaces with inseparable street-front blocks.
objects=[spawn,*plan.values(),*encounters,*[v for k in ['caves','chests'] for v in interactions[k]]]
reserved=unary_union([Point(xy(v)).buffer((v.get('r',110)+55) if v in plan.values() or v.get('kind')=='boss' else (95 if v in encounters else 125)) for v in objects])
route_protection=unary_union([line.buffer(64) for line in lines])
protected=unary_union([reserved,route_protection,*[Point(*v).buffer(105) for v in CENTERS.values()]])
structures=[];foundations=[]
def structure(id,kind,area,x,y,w,d,h,solid=True,style=None):
    shape=box(x-w/2,y-d/2,x+w/2,y+d/2)
    if not BOUNDS.buffer(-12).covers(shape):return False
    if solid and (shape.intersects(protected) or shape.intersects(water)):return False
    if solid and any(shape.intersection(q).area>.05 for q in foundations):return False
    structures.append({'id':id,'cityKind':kind,**p(x,y),'width':round(w,2),'depth':round(d,2),'height':h,'style':RNG.randrange(6) if style is None else style,'area':area,'solid':solid})
    if solid:foundations.append(shape)
    return True
# Real buildings define the visual and physical edge of each urban quarter.
# Near-neighbor modules abut: a block has no unpainted invisible seam.
for id,cx,cy,rx,ry in ROOMS:
    if id in GREEN or id.startswith('S'):continue
    shape=area_polys[id]
    rows=range(-int(ry)//145, int(ry)//145+1)
    for row in rows:
        y=cy+row*145;offset=0 if row%2==0 else 110
        for col in range(-int(rx)//220, int(rx)//220+1):
            x=cx+col*220+offset;w=220;d=145
            body=box(x-w/2,y-d/2,x+w/2,y+d/2)
            if not shape.covers(body) or protected.intersects(body.buffer(4)):continue
            kinds={'03':'market','04':'workshop','05':'warehouse','06':'barracks','09':'school','10':'wing','11':'barracks','14':'house','16':'warehouse'}
            kind=kinds.get(id,'house');h=92 if kind=='house' else 100
            structure(f'city:block:{id}:{row}:{col}',kind,id,x,y,w,d,h)
# Continuous frontage follows outer lot edges; these are actual foundations,
# not a broad flat mass pretending to be a building.
for area,cx,cy,rx,ry in ROOMS:
    if area in GREEN or area.startswith('S'):continue
    ring=list(orient(area_polys[area]).exterior.coords)
    for leg,(a,b) in enumerate(zip(ring,ring[1:])):
        dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
        if length<250 or abs(dx)>1 and abs(dy)>1:continue
        for n in range(int(length//210)):
            t=(n+.5)*210/length;off=74
            x=a[0]+dx*t+dy/length*off;y=a[1]+dy*t-dx/length*off
            w,d=(210,145) if abs(dx)>abs(dy) else (145,210)
            structure(f'city:frontage:{area}:{leg}:{n}','warehouse' if area in ['05','16'] else 'house',area,x,y,w,d,92)

# The tower court is a compact square with a visible eastern frontage.
for n,(x,y,w,d) in enumerate([(960,-510,180,130),(1030,-500,180,130),(1030,-350,180,130),(430,-80,180,110),(180,-600,180,130),(180,-440,180,130)]):
    structure(f'city:square:front:{n}','house','08',x,y,w,d,92)

# Small corner lots fit between streets and objective yards rather than
# leaving every missed large grid cell as an empty foreground.
for area,cx,cy,rx,ry in ROOMS:
    if area in GREEN or area.startswith('S'):continue
    for n,(dx,dy) in enumerate([(a,b) for a in [-340,-260,-200,200,260,340] for b in [-285,-210,210,285]]):
        x=cx+dx;y=cy+dy
        if not area_polys[area].covers(box(x-90,y-55,x+90,y+55)):continue
        kind='market' if area=='03' else 'workshop' if area=='04' else 'house'
        structure(f'city:corner:{area}:{n}',kind,area,x,y,180,110,85)

# Fill a few central street corners left between the different lane bearings.
# Search is bounded offline; it never moves a reserved road or destination.
for area,cx,cy,rx,ry in ROOMS:
    if area in GREEN or area.startswith('S'):continue
    def visible_count():
        return sum(abs(s['x']-cx)-s['width']/2<250 and abs(s['y']-cy)-s['depth']/2<250 for s in structures if s['solid'])
    candidates=sorted([(dx,dy) for dx in range(-360,361,40) for dy in range(-320,321,40)],key=lambda v:abs(math.hypot(*v)-320))
    for n,(dx,dy) in enumerate(candidates):
        if visible_count()>=3:break
        x=cx+dx;y=cy+dy
        if not area_polys[area].covers(box(x-90,y-60,x+90,y+60)):continue
        kind='warehouse' if area in ['05','16'] else 'workshop' if area=='04' else 'house'
        structure(f'city:inner-lot:{area}:{n}',kind,area,x,y,180,120,94)

# Large landmarks are restrained, identifiable assemblies with open courts.
for id,kind,area,x,y,w,d,h in [
 ('keep','keep','10',-4200,-4060,390,230,160),
 ('keep-west','wing','10',-4575,-4060,250,230,112),
 ('keep-east','wing','10',-3825,-4060,250,230,112),
 ('cathedral','cathedral','14',5750,-4080,390,240,175),
 ('chapel-west','wing','14',5400,-4080,230,210,110),
 ('chapel-east','wing','14',6100,-4080,230,210,110)]:
    # Replace overlapping ordinary modules; retain protected objective roads.
    footprint=box(x-w/2,y-d/2,x+w/2,y+d/2)
    discard=[s for s in structures if footprint.intersects(box(s['x']-s['width']/2,s['y']-s['depth']/2,s['x']+s['width']/2,s['y']+s['depth']/2))]
    for s in discard:structures.remove(s)
    foundations=[box(s['x']-s['width']/2,s['y']-s['depth']/2,s['x']+s['width']/2,s['y']+s['depth']/2) for s in structures if s['solid']]
    structure('city:landmark:'+id,kind,area,x,y,w,d,h)
# A gateway's beam is overhead. Its grounded piers are independent real
# foundations, not painted solid-looking posts inside a non-colliding prop.
for id,area,x,y,w,d in [('west','06',-4500,400,62,320),('south','03',-4500,3550,62,360),('north','11',450,-2990,320,62),('garden','13',4750,-2600,62,360)]:
    structure('city:gate:'+id,'gate',area,x,y,w,d,110,False,1)
    vertical=d>w;span=d if vertical else w;pier=min(32,span*.11)
    if vertical:structures[-1]['visual']=False  # Open span, without an overhead beam or an empty render stamp.
    for side in [-1,1]:
        px=x if vertical else x+side*(span-pier)/2
        py=y+side*(span-pier)/2 if vertical else y
        placed=structure(f'city:gate-pier:{id}:{side}','wall',area,px,py,w if vertical else pier,pier if vertical else d,58.8,True,1)
        # A vertical entry can adjoin a turning road or existing building.
        # Keep that real opening; never force symmetry by blocking the road.
        assert vertical or placed,f'overhead gate beam needs two real piers: {id}:{side}'

# Place towers before slicing the wall strips. A rejected tower never deletes
# an existing wall; successful footprints subtract only their exact interval.
for n,(area,x,y) in enumerate([('06',-4500,170),('06',-4500,630),('03',-4500,3600),('03',-4500,4100),('11',220,-2990),('11',680,-2990),('13',4750,-2840),('13',4750,-2360)]):
    structure(f'city:gate-tower:{n}','tower',area,x,y,120,120,125)

# Cut complete usable runs first, then tile them. Rejecting whole 240-unit
# tiles at each tower/road used to leave arbitrary extra breaches beside gates.
# Road reservations retain their full existing clearance; solid neighbours
# meet the wall precisely rather than accumulating a per-tile safety gap.
def wall_line(prefix,area,a,b,gaps):
    horizontal=a[1]==b[1];start=a[0] if horizontal else a[1];end=b[0] if horizontal else b[1]
    strip=box(start,a[1]-31,end,a[1]+31) if horizontal else box(a[0]-31,start,a[0]+31,end)
    cuts=[(start,end)]
    def subtract(low,high):
        nonlocal cuts
        cuts=[v for lo,hi in cuts for v in [(lo,min(hi,low)),(max(lo,high),hi)] if v[1]-v[0]>.02]
    for low,high in gaps:subtract(low,high)
    for obstacle in [protected.buffer(.03),water.buffer(.03),*foundations]:
        hit=strip.intersection(obstacle)
        if hit.is_empty:continue
        parts=list(hit.geoms) if hasattr(hit,'geoms') else [hit]
        for part in parts:
            bounds=part.bounds
            subtract(bounds[0] if horizontal else bounds[1],bounds[2] if horizontal else bounds[3])
    for run,(low,high) in enumerate(cuts):
        count=math.ceil((high-low)/240)
        for n in range(count):
            lo=low+(high-low)*n/count;hi=low+(high-low)*(n+1)/count
            x=(lo+hi)/2 if horizontal else a[0];y=a[1] if horizontal else (lo+hi)/2
            assert structure(f'city:wall:{prefix}:{run}:{n}','wall',area,x,y,hi-lo if horizontal else 62,62 if horizontal else hi-lo,75),f'unexpected wall conflict: {prefix}:{lo}:{hi}'
wall_line('outer-west','06',(-4500,-2350),(-4500,4700),[(240,560),(3370,3730)])
wall_line('inner-north','11',(-2800,-2990),(1300,-2990),[(-1080,-820),(290,610)])
wall_line('garden-east','13',(4750,-4700),(4750,-1700),[(-2780,-2420)])

# Building lots around narrow connecting streets make long travel lanes read
# as inhabited alleys, with intermittent courtyards and vegetation gaps.
for passage in passages:
    if passage['kind'] in ['bridge','secret','cave'] or passage['id'].startswith(('site:','visit:')) or '-court-loop' in passage['id']:continue
    area=passage['from']
    if area in GREEN and passage['to'] in GREEN:continue
    raw=[xy(q) for q in passage['waypoints']]
    for leg,(a,b) in enumerate(zip(raw,raw[1:])):
        dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
        if length<500 or abs(dx)>1 and abs(dy)>1:continue
        for n in range(1,int(length//280)):
            t=n*280/length
            for side in [-1,1]:
                off=passage['width']/2+100
                x=a[0]+dx*t-dy/length*off*side;y=a[1]+dy*t+dx/length*off*side
                w,d=(250,190) if abs(dx)>abs(dy) else (190,250)
                body=box(x-w/2,y-d/2,x+w/2,y+d/2)
                if body.intersects(reserved.buffer(30)) or water.intersects(body):continue
                # Mostly attached buildings; each fourth bay is a green court.
                if (n+leg)%4==0:continue
                structure(f'city:street:{passage["id"]}:{leg}:{n}:{side}','house',area,x,y,w,d,88)

# One functional bell tower (plan.castle) owns the square; low masonry gives
# the neighboring court a readable scale without duplicating its silhouette.
for x,y in [(800,-650),(850,-620),(1150,-900),(1100,-650),(1000,-1100),(250,-1150),(1100,100),(1000,350),(350,200),(100,-700)]:
    if not walk.covers(Point(x,y).buffer(85)):continue
    if structure('city:square:fountain','fountain','08',x,y,85,65,28):break
for n,(x,y) in enumerate([(1280,-800),(1280,-600),(200,-1100),(350,-1100),(1300,100),(1150,300)]):
    if walk.covers(Point(x,y).buffer(65)):structure(f'city:square:planter:{n}','planter','08',x,y,82,52,25)
# Tree-root islands make the orchard and gardens readable at ordinary view
# scale. They share ground/high outlines, so all edge foliage is truly solid.
green_islands=[]
for area,cx,cy,rx,ry in ROOMS:
    if area not in GREEN:continue
    placed=0
    for n,(dx,dy) in enumerate(sorted([(a,b) for a in [-430,-320,-230,230,320,430] for b in [-420,-290,-160,160,290,420]],key=lambda v:abs(math.hypot(*v)-320))):
        shape=organic(cx+dx,cy+dy,100+(n%2)*20,85+(n%3)*12,n*.7)
        if not walk.covers(shape.buffer(85)) or shape.intersects(protected.buffer(15)):continue
        if any(shape.distance(q)<150 for q in green_islands):continue
        green_islands.append(shape);placed+=1
        if placed>=4:break
walk=walk.difference(unary_union(green_islands))
walk=walk.difference(unary_union(foundations)).buffer(0)
# Include objective approach space explicitly, connected by the authored legs.
# Outlying encounters receive reserved pockets, not inaccessible spawn points.
for v in objects:
    if not walk.covers(Point(xy(v)).buffer(60)):
        nearest=CENTERS[v.get('area','01')]
        pocket=Point(xy(v)).buffer(v.get('r',100)+95)
        link=LineString([nearest,xy(v.get('approach',v)),xy(v)]).buffer(55)
        assert not unary_union(foundations).intersects(link.buffer(-3)),f'objective foundation conflict {v}'
        walk=walk.union(pocket).union(link)
# Water never becomes a walkable shortcut from an objective expansion.
walk=walk.difference(water).union(unary_union(bridge_shapes)).difference(unary_union(foundations)).simplify(.6,preserve_topology=True)
assert walk.geom_type=='Polygon' and walk.is_valid,'all quarters form one connected surface'
for passage in passages:
    line=LineString([xy(v) for v in passage['waypoints']])
    assert walk.buffer(.15).covers(line.buffer(50,quad_segs=4)),f'route body clearance {passage["id"]}'
for v in objects:
    assert walk.buffer(.15).covers(Point(xy(v)).buffer(55)),f'objective standing space {v}'
# Large buildings are high barriers; canal is low and traversable by flyers.
high=walk.union(water).difference(unary_union(foundations)).simplify(.6,preserve_topology=True)
landmarks={'spawn':spawn}
for v in interactions['caves']:landmarks[v['id']]={**p(v['x'],v['y']),'area':v['area'],'kind':'cave'}
for v in interactions['chests']:landmarks[v['id']]={**p(v['x'],v['y']),'area':v['area'],'kind':'treasure'}
for v in encounters:
    if v['kind']=='boss':landmarks[v['id']]={**p(v['x'],v['y']),'area':v['area'],'kind':'boss'}
patches=[]
for id,x,y,rx,ry in [('02',-6200,1600,160,210),('13',3400,-2900,150,130),('S1',-6300,-3300,130,150)]:
    shape=organic(x,y,rx,ry,2);patches.append({'id':'city-brush:'+id,'kind':'sparse','center':p(x,y),'x':x,'y':y,'rx':rx,'ry':ry,'angle':0,'density':.24,'points':coords(shape.exterior)})
layout={'kind':'rift-forest','worldId':'clockshadow-city','id':'clockshadow-city:1','name':'钟影旧都','revision':1,'artTheme':'city','artStyle':'clockshadow-renewed','bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':spawn,'areas':areas,'passages':passages,'boundaries':rings(walk,'city-ground'),'solidBoundaries':rings(high,'city-high'),'lakes':[dict(v,kind='water') for v in rings(water.difference(walk),'city-canal')],'landmarks':landmarks,'plan':plan,'encounters':encounters,'patches':patches,'interactions':interactions,'decorations':[],'cityStructures':structures,'palette':{'ground':'#d8cbae','brush':'#97a473','forest':'#526c4d','ridge':'#827e6c','water':'#578c94','waterLight':'#a4c6b8','bridge':'#bda67c'}}
path=ROOT/'dist/config/worlds.json';worlds=json.loads(path.read_text());target=next(w for w in worlds['definitions'] if w['id']=='clockshadow-city');target['authored']=layout
path.write_text(json.dumps(worlds,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'areas':len(areas),'passages':len(passages),'structures':len(structures),'walkableFraction':round(walk.area/BOUNDS.area,3),'boundaryRings':len(layout['boundaries']),'boundaryPoints':sum(len(v['points']) for v in layout['boundaries'])}))
