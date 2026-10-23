#!/usr/bin/env python3
"""Bake Ember's shared contours and scenery. Offline dependency: Shapely 2.x."""
import json
import math
import random
import sys
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
sys.dont_write_bytecode = True
from natural_contours import natural_ring, natural_route

ROOT = Path(__file__).resolve().parent.parent
BOUNDS = box(-7200, -5400, 7200, 5400)
RNG = random.Random(1061608)

def p(x, y): return {'x': round(x, 2), 'y': round(y, 2)}
def pair(v): return (v['x'], v['y'])
def coords(r): return [p(x, y) for x, y in list(r.coords)[:-1]]
def rings(g, prefix):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    result = []
    for n, shape in enumerate(sorted(polys, key=lambda a: -a.area)):
        shape = orient(shape)
        result.append({'id': f'{prefix}:{n}', 'points': coords(shape.exterior), 'hole': False})
        result.extend({'id': f'{prefix}:{n}:hole:{i}', 'points': coords(r), 'hole': True} for i, r in enumerate(shape.interiors))
    return result

def organic(cx, cy, rx, ry, phase=0, n=26):
    raw = []
    for i in range(n):
        t = i * math.tau / n
        f = 1 + .13 * math.sin(3*t+phase) + .075 * math.sin(7*t-phase*.7)
        raw.append((cx+math.cos(t)*rx*f, cy+math.sin(t)*ry*f))
    return Polygon(natural_ring(raw, reach=38)).buffer(0)

def route(raw, width):
    smooth = natural_route(raw, reach=145)
    return smooth, LineString(smooth).buffer(width/2, quad_segs=8)

# Each region has a main clearing, offset lobes and a hooked edge. Their
# actual union is shared by walking, projectiles, map art and pathfinding.
ROOMS = [
 ('01',-5550,3500,760,620,'forest'), ('02',-5520,1360,720,940,'forest'),
 ('03',-2800,3100,990,710,'rock'), ('04',-2300,600,950,760,'forest'),
 ('05',-1850,4630,900,410,'rock'), ('06',-5540,-1320,610,840,'rock'),
 ('07',-2720,-1730,1010,630,'rock'), ('08',-5550,-3700,900,660,'forest'),
 ('09',-1780,-3660,1050,580,'forest'), ('10',2450,-3680,1000,850,'rock'),
 ('11',2850,-1350,1000,670,'forest'), ('12',5480,600,710,1010,'rock'),
 ('13',5100,3200,900,780,'rock'), ('14',2040,2810,850,750,'forest'),
 ('15',1300,4720,850,410,'rock'), ('16',1920,650,950,760,'rock'),
 ('17',5670,-3490,760,860,'rock')]
CENTERS = {id:(x,y) for id,x,y,*_ in ROOMS}
# Long contour barriers separate these links; loops offer alternative routes
# without allowing a straight walk across the blocked intervening land.
LINKS = [
 ('c01','01','02',240,'trail',[(-5880,2790),(-6090,2280)]),
 ('c02','01','03',250,'trail',[(-4540,3700),(-4120,3480)]),
 ('c03','02','04',230,'trail',[(-4470,1180),(-4070,1380),(-3650,980)]),
 ('c04','03','04',220,'trail',[(-3340,2240),(-3100,1680)]),
 ('c05','02','06',210,'trail',[(-5810,180),(-6010,-490)]),
 ('c06','06','07',220,'trail',[(-4620,-1650),(-4270,-2040)]),
 ('c07','06','08',230,'trail',[(-6020,-2260),(-6180,-2800)]),
 ('c08','08','09',230,'trail',[(-4350,-4150),(-3700,-4320),(-3170,-4000)]),
 ('c09','07','09',220,'trail',[(-2390,-2620),(-2570,-3000)]),
 ('c10','07','04',180,'shortcut',[(-1870,-1240),(-1540,-500),(-1760,100)]),
 ('c11','09','11',220,'bridge',[(-880,-3000),(-610,-2450),(100,-2200),(1200,-2200),(1800,-1880)]),
 ('c12','04','16',160,'bridge',[(-1250,740),(-850,600),(-450,600),(450,600),(1010,450)]),
 ('c13','16','11',240,'trail',[(2120,-300),(2270,-700)]),
 ('c14','16','12',250,'trail',[(3300,580),(3900,240),(4540,340)]),
 ('c15','16','14',220,'trail',[(1520,1490),(1670,2030)]),
 ('c16','11','12',220,'trail',[(4070,-1390),(4540,-1030),(4740,-440)]),
 ('c17','12','13',230,'trail',[(5880,1920),(5640,2280)]),
 ('c18','13','14',240,'trail',[(3990,3470),(3350,3210)]),
 ('c19','14','15',230,'trail',[(2140,3740),(1860,4190)]),
 ('c20','03','05',230,'trail',[(-2520,3930),(-2250,4150)]),
 ('c21','05','15',240,'bridge',[(-1050,4470),(-600,4350),(450,4350),(850,4550)]),
 ('c22','11','10',240,'trail',[(3130,-2320),(2870,-2760)]),
 ('c23','10','17',190,'secret',[(3740,-4040),(4300,-4210),(4790,-3900)])]

BLUEPRINT = {'areas': [{'id': '01', 'name': '暖灰营地', 'center': {'x': -5500, 'y': 3450}, 'kind': 'camp', 'paletteKind': 'ash-camp'}, {'id': '02', 'name': '烬叶疏林', 'center': {'x': -5400, 'y': 1360}, 'kind': 'forest', 'paletteKind': 'grove'}, {'id': '03', 'name': '赤铁废采场', 'center': {'x': -2750, 'y': 3150}, 'kind': 'quarry', 'paletteKind': 'quarry'}, {'id': '04', 'name': '熄火盆地', 'center': {'x': -2250, 'y': 600}, 'kind': 'basin', 'paletteKind': 'basin'}, {'id': '05', 'name': '硫烟浅滩', 'center': {'x': -1750, 'y': 4680}, 'kind': 'shore', 'paletteKind': 'sulfur'}, {'id': '06', 'name': '黑曜峡谷', 'center': {'x': -5430, 'y': -1300}, 'kind': 'canyon', 'paletteKind': 'obsidian'}, {'id': '07', 'name': '赤铁矿脊', 'center': {'x': -2520, 'y': -1700}, 'kind': 'mine', 'paletteKind': 'mine'}, {'id': '08', 'name': '耐热绿洲', 'center': {'x': -5450, 'y': -3640}, 'kind': 'oasis', 'paletteKind': 'oasis'}, {'id': '09', 'name': '赤陶暖谷', 'center': {'x': -1750, 'y': -3660}, 'kind': 'valley', 'paletteKind': 'terracotta'}, {'id': '10', 'name': '熔冠火山口', 'center': {'x': 2500, 'y': -3670}, 'kind': 'boss', 'paletteKind': 'crater'}, {'id': '11', 'name': '焦土高台', 'center': {'x': 2900, 'y': -1450}, 'kind': 'plateau', 'paletteKind': 'charred'}, {'id': '12', 'name': '玄武岩长廊', 'center': {'x': 5350, 'y': 540}, 'kind': 'canyon', 'paletteKind': 'basalt'}, {'id': '13', 'name': '熔炉遗台', 'center': {'x': 5100, 'y': 3160}, 'kind': 'ruins', 'paletteKind': 'ruins'}, {'id': '14', 'name': '旧铸聚落', 'center': {'x': 2000, 'y': 2800}, 'kind': 'village', 'paletteKind': 'foundry'}, {'id': '15', 'name': '南岸熔窟', 'center': {'x': 1240, 'y': 4700}, 'kind': 'cave', 'paletteKind': 'cavern'}, {'id': '16', 'name': '熔桥前庭', 'center': {'x': 1790, 'y': 700}, 'kind': 'village', 'paletteKind': 'forecourt'}, {'id': '17', 'name': '熔晶秘谷', 'center': {'x': 5600, 'y': -3420}, 'kind': 'secret', 'paletteKind': 'crystal'}], 'plan': {'merchant': {'x': -5430, 'y': -3890, 'r': 105, 'area': '08'}, 'supply': {'x': -5100, 'y': 3600, 'r': 125, 'area': '01'}, 'occupied': {'x': -2100, 'y': -1800, 'r': 225, 'area': '07'}, 'castle': {'x': 2100, 'y': 3050, 'r': 360, 'area': '14'}, 'hunt': {'x': -2500, 'y': 600, 'r': 280, 'area': '04'}, 'rescue': {'x': -1450, 'y': -3800, 'r': 240, 'area': '09'}, 'rune': {'x': 3600, 'y': -1400, 'r': 185, 'area': '11'}, 'rescue-warden': {'x': 5720, 'y': 1020, 'r': 240, 'area': '12'}, 'dogcamp': {'x': -5400, 'y': 3000, 'r': 115, 'area': '01'}, 'owlroost': {'x': -5700, 'y': 780, 'r': 240, 'area': '02'}, 'golemaltar': {'x': 1300, 'y': 4900, 'r': 270, 'area': '15'}, 'stonevault': {'x': 5800, 'y': -3750, 'r': 240, 'area': '17'}}, 'interactions': {'caves': [{'id': 'bridge-mine', 'name': '桥头矿洞', 'caveName': '赤铁试掘坑', 'area': '16', 'x': 1400, 'y': 0, 'approach': {'x': 1400, 'y': 70}, 'caveId': 'ember-bridge-mine', 'seed': 1061601, 'exitName': '返回熔桥前庭', 'footprintSides': [{'x': 1332, 'y': -16, 'r': 18}, {'x': 1468, 'y': -16, 'r': 18}]}, {'id': 'north-mine', 'name': '赤铁矿洞', 'caveName': '赤铁深矿', 'area': '07', 'x': -3040, 'y': -2140, 'approach': {'x': -3040, 'y': -2070}, 'caveId': 'ember-north-mine', 'seed': 1061602, 'exitName': '返回赤铁矿脊', 'footprintSides': [{'x': -3108, 'y': -2156, 'r': 18}, {'x': -2972, 'y': -2156, 'r': 18}]}, {'id': 'south-cavern', 'name': '南岸熔窟', 'caveName': '冷却熔窟', 'area': '15', 'x': 1300, 'y': 4500, 'approach': {'x': 1300, 'y': 4570}, 'caveId': 'ember-south-cavern', 'seed': 1061603, 'exitName': '返回南岸熔窟', 'footprintSides': [{'x': 1232, 'y': 4484, 'r': 18}, {'x': 1368, 'y': 4484, 'r': 18}]}], 'gates': [], 'chests': [{'id': 'forest-supply', 'name': '林间补给', 'area': '02', 'x': -5700, 'y': 1100, 'approach': {'x': -5740, 'y': 1140}}, {'id': 'quarry-cache', 'name': '采场旧匣', 'area': '03', 'x': -1300, 'y': 3180, 'approach': {'x': -1340, 'y': 3220}}, {'id': 'oasis-cache', 'name': '热泉尽端补给', 'area': '08', 'x': -6700, 'y': -3550, 'approach': {'x': -6740, 'y': -3510}}, {'id': 'terrace-cache', 'name': '暖谷石龛', 'area': '09', 'x': -950, 'y': -3630, 'approach': {'x': -990, 'y': -3590}}, {'id': 'mine-supply', 'name': '矿营补给匣', 'area': '16', 'x': 2610, 'y': 410, 'approach': {'x': 2570, 'y': 450}}, {'id': 'basalt-cache', 'name': '玄武长廊补给', 'area': '12', 'x': 5800, 'y': -300, 'approach': {'x': 5760, 'y': -260}}, {'id': 'foundry-cache', 'name': '旧铸台宝箱', 'area': '14', 'x': 2750, 'y': 2550, 'approach': {'x': 2710, 'y': 2590}}, {'id': 'south-cache', 'name': '南岸储藏', 'area': '15', 'x': 2280, 'y': 4830, 'approach': {'x': 2240, 'y': 4870}}, {'id': 'crystal-cache', 'name': '熔晶秘藏', 'area': '17', 'x': 5700, 'y': -3200, 'approach': {'x': 5660, 'y': -3160}}, {'id': 'spur-cache', 'name': '山路补给', 'area': '17', 'x': 5800, 'y': -1660, 'approach': {'x': 5760, 'y': -1620}}]}, 'encounters': [{'id': 'clearing:ember:camp-ridge', 'name': '灰坡巡游', 'area': '01', 'x': -4600, 'y': 3320, 'r': 150, 'tier': 0, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:forest-outer', 'name': '烬叶游群', 'area': '02', 'x': -5750, 'y': 1840, 'r': 170, 'tier': 0, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:forest-north', 'name': '北林哨群', 'area': '02', 'x': -5020, 'y': 700, 'r': 160, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:quarry', 'name': '赤铁守卫', 'area': '03', 'x': -2700, 'y': 3020, 'r': 230, 'tier': 2, 'kind': 'guard', 'count': 4}, {'id': 'clearing:ember:basin-west', 'name': '盆地游群', 'area': '04', 'x': -3190, 'y': 770, 'r': 180, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:basin-north', 'name': '岩地守群', 'area': '04', 'x': -1800, 'y': 320, 'r': 160, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:sulfur', 'name': '浅滩行兽', 'area': '05', 'x': -1630, 'y': 4740, 'r': 160, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:obsidian', 'name': '峡底哨群', 'area': '06', 'x': -5000, 'y': -1240, 'r': 160, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:mine-ridge', 'name': '矿脊游群', 'area': '07', 'x': -3450, 'y': -1820, 'r': 160, 'tier': 1, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:terrace', 'name': '暖谷巡守', 'area': '09', 'x': -1640, 'y': -3250, 'r': 170, 'tier': 2, 'kind': 'guard', 'count': 4}, {'id': 'clearing:ember:charred', 'name': '焦土游群', 'area': '11', 'x': 2470, 'y': -1360, 'r': 200, 'tier': 2, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:basalt', 'name': '长廊巡守', 'area': '12', 'x': 4450, 'y': 610, 'r': 170, 'tier': 2, 'kind': 'guard', 'count': 4}, {'id': 'clearing:ember:foundry', 'name': '旧炉行兽', 'area': '14', 'x': 1630, 'y': 2520, 'r': 160, 'tier': 2, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:mine-patrol', 'name': '矿道巡游', 'area': '16', 'x': 2390, 'y': 780, 'r': 160, 'tier': 0, 'kind': 'combat', 'count': 4}, {'id': 'clearing:ember:boss-north', 'name': '熔冠古王', 'area': '10', 'x': 2490, 'y': -3760, 'r': 300, 'tier': 4, 'kind': 'boss', 'count': 1, 'bossKind': 'furnace', 'strength': 1}, {'id': 'clearing:ember:boss-southeast', 'name': '遗台守王', 'area': '13', 'x': 5120, 'y': 3040, 'r': 300, 'tier': 4, 'kind': 'boss', 'count': 1, 'bossKind': 'ancient', 'strength': 1}]}
ROOM_SHAPES = {
 '01':[(-1,-.25),(-.8,-.72),(-.2,-.91),(.31,-.70),(.86,-.54),(1,.02),(.73,.36),(.91,.77),(.27,.97),(-.38,.80),(-.94,.45)],
 '02':[(-.51,-1),(.05,-1.08),(.57,-.76),(.54,-.27),(.94,.12),(.70,.53),(.42,.91),(-.17,1.02),(-.66,.71),(-.87,.29),(-.61,-.16),(-.84,-.54)],
 '03':[(-1,-.40),(-.59,-.77),(-.08,-.91),(.42,-.73),(.90,-.42),(1,.13),(.73,.65),(.27,.89),(-.16,.64),(-.58,.95),(-.98,.52),(-.76,.03)],
 '04':[(-1,-.20),(-.75,-.65),(-.35,-.93),(.16,-.81),(.77,-.95),(1,-.28),(.79,.20),(.91,.69),(.35,.93),(-.12,.75),(-.62,1.01),(-.96,.49)],
 '05':[(-1,-.30),(-.70,-.76),(-.07,-.97),(.58,-.80),(1,-.23),(.87,.37),(.44,.75),(-.13,.93),(-.69,.70),(-.97,.22)],
 '06':[(-.60,-1),(.17,-.91),(.70,-.66),(.44,-.18),(.83,.31),(.52,.88),(-.13,1.02),(-.53,.66),(-.92,.21),(-.72,-.34)],
 '07':[(-1,-.17),(-.74,-.58),(-.32,-.73),(.07,-1.02),(.55,-.81),(.92,-.29),(1,.19),(.64,.68),(.11,.83),(-.43,.60),(-.84,.85)],
 '08':[(-.95,-.33),(-.64,-.78),(-.13,-.95),(.36,-.83),(.91,-.57),(.96,-.03),(.61,.41),(.44,.89),(-.12,.98),(-.58,.62),(-1,.22)],
 '09':[(-1,-.31),(-.68,-.74),(-.10,-.85),(.48,-.70),(1,-.29),(.90,.23),(.53,.61),(.12,.91),(-.43,.70),(-.87,.83)],
 '10':[(-.91,-.36),(-.71,-.83),(-.14,-1.04),(.40,-.91),(.88,-.53),(1,.05),(.68,.59),(.16,.99),(-.41,.80),(-.95,.35)],
 '11':[(-1,-.35),(-.51,-.74),(.02,-1.01),(.53,-.69),(.98,-.28),(.83,.21),(1,.63),(.35,.94),(-.17,.72),(-.60,.99),(-.89,.43)],
 '12':[(-.49,-1),(.13,-.95),(.71,-.64),(.50,-.16),(.91,.27),(.65,.76),(.11,1.03),(-.43,.84),(-.86,.34),(-.66,-.25),(-.83,-.61)],
 '13':[(-1,-.30),(-.61,-.77),(-.12,-.92),(.34,-.75),(.83,-.90),(1,-.25),(.78,.31),(.91,.77),(.28,1.04),(-.24,.84),(-.77,.49)],
 '14':[(-1,-.44),(-.63,-.91),(-.11,-.81),(.24,-.51),(.73,-.84),(1,-.29),(.80,.28),(.92,.81),(.36,.99),(-.09,.57),(-.58,.89),(-1,.41)],
 '15':[(-1,-.32),(-.62,-.78),(-.08,-1.02),(.50,-.83),(.96,-.38),(1,.19),(.66,.61),(.12,.91),(-.43,.72),(-.90,.45)],
 '16':[(-1,-.25),(-.73,-.75),(-.24,-.90),(.22,-.73),(.78,-.91),(1,-.28),(.81,.28),(.95,.77),(.34,.94),(-.15,.71),(-.74,.88),(-.96,.39)],
 '17':[(-.72,-.82),(-.14,-1.02),(.43,-.78),(.83,-.33),(1,.18),(.63,.71),(.14,1.04),(-.39,.76),(-.92,.33),(-.78,-.21)]}

areas, room_polys, room_by_id = [], [], {}
for i,(id,x,y,rx,ry,material) in enumerate(ROOMS):
    original = next(a for a in BLUEPRINT['areas'] if a['id']==id)
    shape=Polygon(natural_ring([(x+u*rx,y+v*ry) for u,v in ROOM_SHAPES[id]],reach=85))
    shape=shape.intersection(BOUNDS.buffer(-100))
    assert shape.geom_type=='Polygon'
    area={**original,'center':p(x,y),'material':material,'points':coords(shape.exterior)}
    areas.append(area);room_polys.append(shape);room_by_id[id]=shape

passages, corridor_polys, route_lines, roads = [], [], [], []
BRIDGES = {'c12':('ember-bridge-main',-450,450,600,160), 'c11':('ember-bridge-north',100,1200,-2200,220), 'c21':('ember-bridge-south',-600,450,4350,240)}
bridges=[]
for id,source,target,width,kind,middle in LINKS:
    raw=[CENTERS[source],*middle,CENTERS[target]]
    # A bridge remains rectilinear; its winding approaches retain anchors.
    linepoints,shape=route(raw,width) if kind!='bridge' else (raw,LineString(raw).buffer(width/2,quad_segs=8))
    route_lines.append(LineString(linepoints));corridor_polys.append(shape)
    passage={'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coords(shape.exterior),'waypoints':[p(*q) for q in linepoints]}
    if kind=='bridge':
        bid,ax,bx,y,w=BRIDGES[id];deck=[p(ax,y),p(bx,y)];deck_shape=box(ax,y-w/2,bx,y+w/2)
        passage.update(points=coords(deck_shape.exterior),deck=deck)
        bridges.append({'id':bid,'connection':id,'center':p((ax+bx)/2,y),'deck':deck,'width':w,'points':passage['points']})
    passages.append(passage)
    # Trails are worn paths subordinate to terrain, not bold map connectors.
    road_points=raw if kind=='bridge' else linepoints
    roads.append({'id':'trail:'+id,'width':74 if kind=='secret' else 92,'material':'ash' if source in ['06','07','10','12'] else 'ochre','points':[p(*q) for q in road_points]})
# Natural exits are applied after local scenery so their clear approaches
# cannot change the seeded placement of unrelated plants and camp props.
EXITS=[
 (6,'08',(-5150,-4750),(0,1),[CENTERS['08'],(-5150,-3700),(-5150,-4820)]),
 (2,'01',(-6500,4230),(0,-1),[CENTERS['01'],(-6100,3720),(-6500,3920),(-6500,4300)])]
bridges.sort(key=lambda b:['c12','c11','c21'].index(b['connection']))
walk=unary_union([*room_polys,*corridor_polys])
# Real lava channels are low terrain: only the bridge deck admits walkers,
# while flyers and projectiles can cross the open channel.
left_bank=[(20,-3020),(100,-2800),(100,-2500),(100,-1900),(100,-1600),(-120,-1270),(-280,-850),(-370,-170),(-450,80),(-450,300),(-450,900),(-450,1150),(-530,1650),(-390,2200),(-560,2800),(-650,3370),(-600,3750),(-600,4050),(-600,4650),(-600,4900),(-360,5210)]
right_bank=[(250,5180),(450,4900),(450,4650),(450,4050),(450,3750),(380,3290),(500,2760),(420,2210),(560,1670),(450,1150),(450,900),(450,300),(450,80),(610,-350),(730,-990),(1020,-1300),(1200,-1600),(1200,-1900),(1200,-2500),(1200,-2800),(970,-3130),(420,-3260)]
low=Polygon(natural_ring([*left_bank,*right_bank],reach=95)).buffer(0)
walk=walk.difference(low).union(unary_union([Polygon([pair(q) for q in b['points']]) for b in bridges]))

# Keep existing encounter/reward identities, place their actual bodies and
# approaches deliberately inside the new smaller regional spaces.
def relocate(v,scale=.52):
    a=next(a for a in BLUEPRINT['areas'] if a['id']==v['area']);cx,cy=CENTERS[v['area']]
    return p(cx+(v['x']-a['center']['x'])*scale,cy+(v['y']-a['center']['y'])*scale)
plan={key:{**v,**relocate(v,.50)} for key,v in BLUEPRINT['plan'].items()}
encounters=[{**v,**relocate(v,.55)} for v in BLUEPRINT['encounters']]
interactions={'caves':[],'gates':[],'chests':[]}
for typ in ['caves','chests']:
    for source in BLUEPRINT['interactions'][typ]:
        q={**source,**relocate(source,.57)};q.pop('footprintSides',None)
        q['approach']=p(q['x'],q['y']+(70 if typ=='caves' else 50))
        interactions[typ].append(q)
spur=next(q for q in interactions['chests'] if q['id']=='spur-cache')
spur.update(x=6030,y=-3050,approach=p(6030,-3000))
# The camp stays sheltered, but not an enormous empty plaza.
spawn={**p(-5650,3540),'area':'01'}
plan['supply'].update(x=-5260,y=3590)
plan['dogcamp'].update(x=-5480,y=3160)
# Separate dense gameplay structures from one another and from encounter fields.
plan['castle'].update(x=2180,y=3030)
plan['hunt'].update(x=-2640,y=640)
plan['rune'].update(x=3250,y=-1470)
plan['golemaltar'].update(x=1360,y=4840)
plan['stonevault'].update(x=5840,y=-3750)
encounters[0].update(x=-4950,y=3410)
encounters[4].update(x=-2920,y=930)
encounters[5].update(x=-1950,y=300)
next(v for v in encounters if v['id']=='clearing:ember:basalt').update(x=5140,y=680)
# Preserve a clear approach to each objective and graph center.
reserved=[Point(pair(spawn)).buffer(145)]
reserved += [Point(pair(v)).buffer(v['r']+75) for v in plan.values()]
reserved += [Point(pair(v)).buffer(v['r']+95) for v in encounters]
reserved += [Point(pair(v)).buffer(135) for typ in ['caves','chests'] for v in interactions[typ]]
reserved += [Point(*v).buffer(130) for v in CENTERS.values()]
local_routes=[LineString([CENTERS[v['area']],pair(v)]) for v in [*plan.values(),*encounters,*[q for t in ['caves','chests'] for q in interactions[t]]]]
route_protection=unary_union([line.buffer(116) for line in [*route_lines,*local_routes]])
CAMPS=[('01',-5910,3450),('08',-6040,-3890),('16',2270,300),('07',-3110,-1390),('14',1660,3200)]
camppockets=[organic(x,y,215,190,i) for i,(_,x,y) in enumerate(CAMPS)]
walk=walk.union(unary_union(camppockets))
protected=unary_union([*reserved,route_protection,*camppockets])
gameplay_reserved=unary_union(reserved)
# Rock and woodland tongues split broad clearings into connected pockets.
# Every tongue joins the external barrier; it is not a second floating wall.
cutouts=[]
# Wide, off-axis peninsulas are individually placed. Never clip a peninsula
# around graph rays or objective disks: that produces repeated pointed forks.
PENINSULAS=[('02',-.78,.05,330,210),('03',.10,.93,330,330),
 ('04',.86,-.12,330,230),('06',-.84,-.18,290,270),
 ('07',-.10,-.89,260,210),('09',.07,.89,390,220),
 ('11',-.88,.13,280,230),('12',.83,-.10,310,260),
 ('13',-.83,.04,290,220),('14',.04,-.90,260,280),
 ('16',.05,.93,290,230),('17',-.88,-.06,300,230)]
for i,(id,ox,oy,rx,ry) in enumerate(PENINSULAS):
    _,x,y,sx,sy,_=next(r for r in ROOMS if r[0]==id)
    candidate=organic(x+ox*sx,y+oy*sy,rx,ry,i*.3,n=18)
    if not candidate.intersects(protected.buffer(35)) and candidate.intersects(room_by_id[id].exterior):
        cutouts.append(candidate)
walk=walk.difference(unary_union(cutouts)).buffer(6,quad_segs=4).buffer(-6,quad_segs=4).simplify(1.2,preserve_topology=True)
if walk.geom_type=='MultiPolygon':walk=max(walk.geoms,key=lambda q:q.area)
assert walk.geom_type=='Polygon','all passages must join real walkable land'
# Remaining blocked islands provide local choices without obstructing the
# baked path graph or mandatory interaction space.
islands=[]
for i,(id,x,y,rx,ry,material) in enumerate(ROOMS):
    for k in range(18):
        t=k*2.399+i*.7;cx=x+math.cos(t)*rx*.55;cy=y+math.sin(t)*ry*.57
        shape=organic(cx,cy,105+(k%3)*24,100+(k%2)*40,i+k)
        if walk.contains(shape.buffer(100)) and not protected.intersects(shape.buffer(65)) and all(not q.buffer(180).intersects(shape) for q in islands):
            islands.append(shape)
            if sum(q.intersects(room_by_id[id]) for q in islands)>=2:break
walk=walk.difference(unary_union(islands))
assert walk.geom_type=='Polygon' and walk.is_valid
for line in route_lines:assert walk.buffer(.1).covers(line.buffer(70)), 'body-wide passage remains open'
for q in [spawn,*plan.values(),*encounters,*[a['center'] for a in areas],*[v for t in ['caves','chests'] for v in interactions[t]],*[v['approach'] for t in ['caves','chests'] for v in interactions[t]]]:
    assert walk.covers(Point(pair(q)).buffer(60)),f'body standing space {q}'

# A small optional shallow lava patch uses the existing hazard behavior.
surface={'id':'ember-sulfur-shallow','type':'mud','kind':'lava','x':-2380,'y':4780,'rx':110,'ry':72,'shape':'rounded','angle':0,'seed':.37,'scale':110/80,'paintedByWorld':True}
# Find a free side pocket if the selected organic contour covers this spot.
for dx,dy in [(-480,140),(-550,-60),(480,-120),(400,180),(-300,-210)]:
    spot=Point(CENTERS['05'][0]+dx,CENTERS['05'][1]+dy)
    if walk.covers(spot.buffer(190)) and not protected.intersects(spot.buffer(190)):
        surface.update(x=spot.x,y=spot.y);break
else:
    # The hazard gets its own connected pocket, never a mandatory road.
    surface.update(x=-2700,y=4770)
    pocket=organic(surface['x'],surface['y'],260,230,4)
    walk=walk.union(pocket).union(LineString([pair(surface),CENTERS['05']]).buffer(150))

props=[];solid=[]
TONE={'02':'amber','04':'amber','08':'oasis','09':'amber','11':'charred','14':'amber'}
def add(kind,x,y,area,width,depth,height,visual=None,collision=True,group=None):
    width=max(width,depth);half=(width-depth)/2
    body=LineString([(x-half,y),(x+half,y)]).buffer(depth/2) if half else Point(x,y).buffer(depth/2)
    if collision:
        exclusion=gameplay_reserved if group and group.startswith('camp:') else protected
        if not walk.covers(body.buffer(55)) or exclusion.intersects(body.buffer(8)):return False
        if any(other.distance(body)<(10 if group and group.startswith('camp:') else 60) for other in solid):return False
    seed=RNG.random()
    prop={'id':f'ember:scenery:{len(props)}','type':'log' if half else ('rock' if kind in ['basalt','ore','crystal'] else 'tree'),'variant':'ember-native','emberKind':kind,**p(x,y),'width':width,'depth':depth,'height':height,'visualWidth':visual or width,'r':depth/2,'halfLength':half,'angle':0,'heightBand':'low' if kind in ['shrub','ore','basalt'] else 'high','scale':1,'seed':seed,'collision':collision,'area':area,'tone':TONE.get(area,'terracotta' if area=='03' and seed<.6 else 'amber' if area in ['01','14'] else 'basalt')}
    if group:prop['group']=group
    props.append(prop)
    if collision:solid.append(body)
    return True
# Several tightly composed groups per region, never one uniform prop grid.
for i,(id,x,y,rx,ry,material) in enumerate(ROOMS):
    count=0
    for attempt in range(180):
        a=RNG.random()*math.tau;r=.35+RNG.random()*.6;cx=x+math.cos(a)*rx*r;cy=y+math.sin(a)*ry*r
        if not walk.contains(Point(cx,cy).buffer(115)) or protected.intersects(Point(cx,cy).buffer(115)):continue
        if any(Point(cx,cy).distance(v)<150 for v in solid):continue
        planted=0
        for j,(dx,dy) in enumerate([(-35,-15),(55,25),(-20,95)]):
            if material=='forest':kind=['tree','shrub','basalt'][j] if attempt%3 else ['tree','tree','shrub'][j]
            else:kind=['basalt','ore' if id in ['03','07','17'] else 'shrub','dead-tree' if attempt%3==0 else 'basalt'][j]
            if kind in ['tree','dead-tree']:spec=(24,24,84+int(RNG.random()*22),90+int(RNG.random()*25))
            elif kind=='shrub':spec=(38,30,29,64)
            else:spec=(48+int(RNG.random()*20),36,45+int(RNG.random()*16),72)
            planted+=add(kind,cx+dx,cy+dy,id,*spec,group=f'{id}:{count}')
        if planted:count+=1
        if count>=12:break
# Small camp compositions sit beside real travel space. Their elements share
# an axis and purpose; no isolated oversized symbol in a bare plaza.
for id,cx,cy in CAMPS:
    specs=[('shelter',0,0,110,64,82,126),('crate',92,44,32,28,33,38),('barrel',114,82,26,26,36,30),('lamp',-68,90,12,12,58,26),('bench',15,113,62,23,28,68)]
    for kind,dx,dy,w,d,h,v in specs:add(kind,cx+dx,cy+dy,id,w,d,h,v,group=f'camp:{id}')
for i,(id,x,y,rx,ry,material) in enumerate(ROOMS):
    for k in range(48):
        a=k*2.399+i*.4;r=.2+(k%7)*.09;qx=x+math.cos(a)*rx*r;qy=y+math.sin(a)*ry*r
        if not walk.contains(Point(qx,qy).buffer(35)) or route_protection.intersects(Point(qx,qy).buffer(30)):continue
        if any(Point(qx,qy).distance(Point(pair(v)))<(v.get('r',80)*.55+32) for v in [spawn,*plan.values(),*encounters]):continue
        add('shrub',qx,qy,id,22,16,14,32,collision=False,group=f'herbs:{id}')
# Keep the bridge-mine's identity with a real shelter when other props are
# displaced by objective reservations.
if not any(q['emberKind']=='shelter' for q in props):
    for x in range(2200,2650,60):
        if add('shelter',x,1080,'16',110,64,82,126):break
assert any(q['emberKind']=='shelter' for q in props)

# Avoid hazards under props. Sparse scenery only adds true body colliders.
props=[q for q in props if math.hypot(q['x']-surface['x'],q['y']-surface['y'])>260]
# The two short exterior roads are the only changed surface. Existing prop
# identities and random variants survive unless their footprint crosses one.
exit_shapes=[]
for target,area,point,direction,raw in EXITS:
    linepoints,shape=route(raw,220)
    plan[f'portal:{target}']={**p(*point),'r':90,'area':area,'arrivalDirection':p(*direction)}
    passages.append({'id':f'exit:{target}','from':area,'to':None,'width':220,'kind':'exit','points':coords(shape.exterior),'waypoints':[p(*q) for q in linepoints]})
    roads.append({'id':f'trail:exit:{target}','width':92,'material':'ochre','points':[p(*q) for q in linepoints]})
    exit_shapes.extend([shape,Point(point).buffer(145)])
exit_ground=unary_union(exit_shapes)
def crosses_exit(q):
    body=LineString([(q['x']-q['halfLength'],q['y']),(q['x']+q['halfLength'],q['y'])]).buffer(q['r']) if q['halfLength'] else Point(pair(q)).buffer(q['r'])
    return body.intersects(exit_ground.buffer(8))
props=[q for q in props if not crosses_exit(q)]
walk=walk.union(exit_ground)
assert walk.geom_type=='Polygon' and walk.is_valid
for passage in passages:
    line=LineString([pair(q) for q in passage['waypoints']])
    assert walk.buffer(.1).covers(line.buffer(70)),f'body-wide passage remains open: {passage["id"]}'
for target,_,point,direction,_ in EXITS:
    assert walk.covers(Point(point).buffer(60)),f'portal {target} standing space'
    assert walk.covers(LineString([point,(point[0]+direction[0]*170,point[1]+direction[1]*170)]).buffer(60)),f'portal {target} arrival approach'
landmarks={'spawn':spawn}
for target,_,_,_,_ in EXITS:landmarks[f'portal-{target}']={**plan[f'portal:{target}'],'kind':'exit','target':target}
for i,v in enumerate(interactions['caves']):landmarks[f'cave:{i}']={**p(v['x'],v['y']),'area':v['area'],'kind':'cave'}
for i,v in enumerate(interactions['chests']):landmarks[f'treasure:{i}']={**p(v['x'],v['y']),'area':v['area'],'kind':'treasure'}
for v in encounters:
    if v['kind']=='boss':landmarks[v['id']]={**p(v['x'],v['y']),'area':v['area'],'kind':'boss'}
ground=rings(walk,'ember-ground');lava=low.difference(walk);lava_rings=rings(lava,'ember-lava');high=rings(walk.union(low),'ember-high')
layout={'kind':'rift-forest','worldId':'ember-realm-large','id':'ember-realm-large:1','name':'熔火之境','revision':1,'artTheme':'ember','bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':spawn,'areas':areas,'passages':passages,'boundaries':ground,'solidBoundaries':high,'lakes':[dict(q,kind='lava') for q in lava_rings],'landmarks':landmarks,'plan':plan,'encounters':encounters,'patches':[],'interactions':interactions,'palette':{'ground':'#ecd4ad','brush':'#b5ad70','forest':'#595a39','ridge':'#716657','water':'#e88a50','waterLight':'#f7c074','bridge':'#b99159'}}
layout['emberScene']={'revision':2,'sample':False,'groundRings':ground,'highOpenRings':high,'lavaRings':lava_rings,'bridge':bridges[0],'bridges':bridges,'zones':[{'id':'zone:'+a['id'],'area':a['id'],'kind':a['kind'],'paletteKind':a['paletteKind'],'points':a['points']} for a in areas],'surfaces':[surface],'props':props,'roads':roads,'details':[]}
path=ROOT/'dist/config/worlds.json';worlds=json.loads(path.read_text());target=next(w for w in worlds['definitions'] if w['id']=='ember-realm-large');target['authored']=layout
path.write_text(json.dumps(worlds,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'areas':len(areas),'passages':len(passages),'props':len(props),'walkableFraction':round(walk.area/BOUNDS.area,3),'rings':len(ground),'boundaryPoints':sum(len(r['points']) for r in ground),'tongues':len(cutouts),'islands':len(islands),'surface':p(surface['x'],surface['y'])}))
