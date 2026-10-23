#!/usr/bin/env python3
"""Bake the beach coastline and walkable reef routes; offline Shapely 2.x."""
import argparse
import json
import math
import sys
from pathlib import Path
from shapely.geometry import Point, Polygon, LineString, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.affinity import scale

sys.dont_write_bytecode = True
from natural_contours import natural_ring, natural_route

ROOT=Path(__file__).resolve().parent.parent
BOUNDS=box(-7200,-5400,7200,5400)
def point(x,y): return {'x':round(x,2),'y':round(y,2)}
def pair(p): return p['x'],p['y']
def at(x,y,**extra): return {**point(x,y),**extra}
def coordinates(ring): return [point(x,y) for x,y in list(ring.coords)[:-1]]
def rings(shape,prefix):
    parts=[shape] if shape.geom_type=='Polygon' else list(shape.geoms)
    result=[]
    for i,p in enumerate(sorted(parts,key=lambda p:-p.area)):
        p=orient(p)
        result.append({'id':f'{prefix}:{i}','points':coordinates(p.exterior),'hole':False})
        result.extend({'id':f'{prefix}:{i}:hole:{n}','points':coordinates(h),'hole':True} for n,h in enumerate(p.interiors))
    return result

# Long hooked beaches, slender sand spits and taller wooded coves deliberately
# alternate. The sea joins their outside edges instead of becoming little ponds.
ROOMS=[
 ('01','风帆营地',(-5100,3900),'camp','forest',[(-900,-550),(-350,-780),(400,-650),(950,-200),(800,400),(200,650),(-650,550),(-1050,100)]),
 ('02','贝纹长滩',(-2600,4100),'shore','forest',[(-1450,-260),(-900,-550),(-300,-500),(500,-250),(1400,-150),(1500,250),(800,400),(0,300),(-700,500),(-1500,350)]),
 ('03','退潮沙洲',(400,4150),'island','rock',[(-1550,-100),(-1000,-350),(-400,-300),(300,-100),(1000,-400),(1750,-300),(1850,50),(1200,350),(500,300),(-100,200),(-800,350),(-1450,300)]),
 ('04','礁门水道',(3150,3500),'pass','rock',[(-1300,250),(-1050,-250),(-600,-550),(-200,-800),(350,-900),(900,-650),(1000,-250),(500,-50),(100,100),(-300,500),(-750,650),(-1200,600)]),
 ('05','灯台岬角',(5700,2100),'fortress','rock',[(-550,-1250),(100,-1450),(600,-900),(700,-150),(450,400),(650,1000),(100,1400),(-600,1100),(-900,450),(-650,-250)]),
 ('06','碧潮礁湾',(3000,900),'island','rock',[(-1100,-550),(-550,-1000),(150,-950),(700,-600),(1050,100),(750,700),(150,1050),(-550,800),(-950,300),(-500,100)]),
 ('07','月牙内湾',(300,1400),'shore','forest',[(-1300,-650),(-700,-1050),(150,-900),(700,-450),(1150,-250),(950,450),(450,1000),(-150,1100),(-750,750),(-1150,200),(-600,-100)]),
 ('08','潮林回湾',(-2500,1300),'grove','forest',[(-1000,-850),(-400,-1250),(300,-1000),(800,-550),(950,150),(550,800),(-100,1150),(-800,900),(-1100,200),(-750,-100)]),
 ('09','海风松径',(-5500,900),'grove','forest',[(-850,-1100),(-100,-1450),(550,-950),(800,-300),(550,200),(850,800),(200,1250),(-650,1050),(-1000,300),(-650,-350)]),
 ('10','北岸岩廊',(-5200,-2000),'pass','rock',[(-850,-650),(-650,-1150),(50,-1000),(650,-650),(1000,100),(700,700),(150,950),(-600,1050),(-850,350),(-500,50)]),
 ('11','白帆残港',(-2400,-1800),'village','rock',[(-1200,-650),(-500,-1000),(250,-800),(1000,-950),(1200,-250),(850,350),(350,800),(-350,1000),(-1050,650),(-750,100)]),
 ('12','叠浪望台',(200,-1500),'ruins','rock',[(-800,-600),(-250,-900),(450,-650),(900,-200),(800,450),(250,800),(-450,650),(-950,100)]),
 ('13','青礁长脊',(3000,-1700),'pass','rock',[(-1150,-450),(-650,-850),(0,-700),(650,-1050),(1200,-650),(950,-50),(1250,450),(550,850),(-100,650),(-850,950),(-1200,300)]),
 ('14','北端渔寨',(-2100,-4400),'village','forest',[(-1150,-450),(-500,-800),(250,-650),(1000,-350),(1100,350),(500,700),(-250,550),(-900,800),(-1200,150)]),
 ('15','孤潮眺角',(5600,-3900),'secret','rock',[(-700,-400),(-100,-700),(550,-450),(750,50),(300,650),(-350,600),(-750,100)]),
 ('16','潮声秘湾',(-6200,-4300),'secret','forest',[(-650,-350),(-100,-650),(550,-350),(650,200),(200,650),(-450,550),(-750,50)]),
]
CENTERS={id:c for id,_,c,*_ in ROOMS}
LINKS=[
 ('c01','01','02',260,'trail',[(-4000,4300)]),
 ('c02','01','09',250,'trail',[(-6100,2700),(-6000,2300)]),
 ('c03','02','08',240,'trail',[(-3150,2850),(-3150,2400)]),
 ('c04','08','09',250,'trail',[(-3950,1550),(-4400,1400)]),
 ('c05','08','11',240,'trail',[(-3200,-300),(-3000,-850)]),
 ('c06','09','10',240,'trail',[(-6100,-500),(-5900,-1000)]),
 ('c07','10','11',250,'trail',[(-3900,-2050)]),
 ('c08','10','16',210,'secret',[(-6200,-3400)]),
 ('c09','11','14',240,'trail',[(-3000,-3300)]),
 ('c10','11','12',250,'trail',[(-1100,-1700)]),
 ('c11','12','13',250,'bridge',[(1250,-1700),(1450,-1700),(2050,-1700),(2400,-1650)]),
 ('c12','13','15',220,'bridge',[(3950,-2750),(4400,-3050),(4900,-3450),(5200,-3650)]),
 ('c13','13','06',250,'trail',[(3600,-400)]),
 ('c14','06','05',230,'bridge',[(4100,1150),(4350,1300),(4750,1500),(5150,1750)]),
 ('c15','06','07',240,'trail',[(1700,800),(1350,800)]),
 ('c16','07','08',250,'trail',[(-1100,1700)]),
 ('c17','07','03',240,'trail',[(850,2700),(400,3300)]),
 ('c18','03','04',220,'trail',[(1850,4200),(2250,3650)]),
 ('c19','04','05',240,'trail',[(4500,3500),(5000,2900)]),
 ('c20','02','03',220,'trail',[(-1100,4400),(-600,4350)]),
 ('c21','14','13',240,'trail',[(-700,-4300),(300,-3900),(1700,-3300)]),
 ('exit-rift','01',None,260,'exit',[(-6700,3950)]),
 ('exit-city','05',None,260,'exit',[(6500,2300)]),
]
DECKS={'c11':((1450,-1700),(2050,-1700)),'c12':((4400,-3050),(4900,-3450)),'c14':((4350,1300),(4750,1500))}
SPAWN=at(-5100,4120,area='01')
PLAN={
 'merchant':at(-4700,4000,r=105),'supply':at(-2900,4200,r=125),
 'occupied':at(-2550,-1600,r=225),'castle':at(5600,1900,r=360),
 'hunt':at(3100,-1700,r=280),'rescue':at(-5700,1100,r=240),
 'rune':at(0,-1750,r=185),'rescue-warden':at(-2200,-4300,r=240),
 'dogcamp':at(-5550,3800,r=115),'owlroost':at(100,1600,r=240),
 'golemaltar':at(-5000,-2050,r=270),'stonevault':at(3300,1150,r=240),
 'portal:9':at(-6700,3950,r=90,arrivalDirection=point(1,0)),
 'portal:4':at(6500,2300,r=90,arrivalDirection=point(-1,0)),
}
CAVES=[
 at(-6430,-4300,id='cove-cave',name='潮声洞口',area='16',caveId='limestone-tideway',caveName='白岩潮洞',seed=81601,exitName='潮声秘湾',approach=point(-6250,-4140)),
 at(-2500,-4480,id='village-cave',name='渔寨洞口',area='14',caveId='limestone-tideway',caveName='白岩潮洞',seed=81601,exitName='北端渔寨',approach=point(-2370,-4310)),
 at(650,4250,id='sandbar-cave',name='沙洲洞口',area='03',caveId='shell-vault',caveName='贝影地窟',seed=81602,exitName='退潮沙洲',approach=point(480,4150)),
]
CHESTS=[
 ('shell-cache','贝滩旧箱','02',-3150,4350),('sandbar-cache','沙洲藏匣','03',1150,4100),
 ('reef-gate','礁门遗箱','04',2950,3650),('cape-cache','岬角旧箱','05',5850,2700),
 ('lagoon-cache','碧潮藏匣','06',3300,1450),('pine-cache','松根藏匣','09',-5700,250),
 ('harbor-cache','残港遗箱','11',-1850,-1950),('reef-cache','长脊秘藏','13',3500,-2050),
 ('lookout-cache','孤潮秘箱','15',5850,-3900),('cove-cache','秘湾旧箱','16',-6250,-3950),
]

def build():
    areas=[];shapes=[];by_id={}
    for id,name,(cx,cy),kind,material,offsets in ROOMS:
        shape=Polygon(natural_ring([(cx+x,cy+y) for x,y in offsets],reach=145)).buffer(0)
        assert shape.geom_type=='Polygon' and shape.contains(Point(cx,cy)),id
        assert BOUNDS.covers(shape),f'{id} leaves bounds'
        areas.append({'id':id,'name':name,'center':point(cx,cy),'kind':kind,'material':material,'points':coordinates(shape.exterior)})
        shapes.append(shape);by_id[id]=shape
    for i,a in enumerate(shapes):
        for j,b in enumerate(shapes[i+1:],i+1):
            if (ROOMS[i][0],ROOMS[j][0]) not in [('02','03'),('03','04')]:assert a.intersection(b).area<.1,f'Unplanned shore join {ROOMS[i][0]}/{ROOMS[j][0]}'
    passages=[];corridors=[];land_routes=[]
    for id,source,target,width,kind,middle in LINKS:
        raw=[CENTERS[source],*middle,*([CENTERS[target]] if target else [])]
        spine=natural_route(raw,reach=150) if kind not in ('bridge','exit') else raw
        line=LineString(spine);shape=line.buffer(width/2,quad_segs=8)
        passages.append({'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coordinates(shape.exterior),'waypoints':[point(*p) for p in spine]})
        corridors.append(shape)
        if id in DECKS:passages[-1]['deck']=[point(*p) for p in DECKS[id]]
        else:land_routes.append((line,kind,width))
    # The western coast is one continuous landmass. Long wooded spines
    # divide its interior, while the southern sand belt is continuous too.
    west_plain=Polygon(natural_ring([(-6260,-2850),(-4900,-2920),(-3600,-2300),(-2750,-2600),(-1500,-2250),(-1700,-1000),(-1550,300),(-1800,1750),(-2800,2550),(-3900,2900),(-4800,2300),(-6100,2150),(-6520,800),(-6320,-600)],reach=190)).buffer(0)
    walk=unary_union([*shapes,*corridors,west_plain]).buffer(0)
    assert walk.geom_type=='Polygon' and BOUNDS.covers(walk),'Disconnected shore routes'
    placements=[
      ('02','combat',0,(-2400,4050)),('03','combat',1,(100,4100)),
      ('04','guard',2,(3000,3350)),('05','combat',3,(5900,1500)),
      ('06','boss',4,(3100,550)),('07','combat',1,(500,1900)),
      ('08','combat',1,(-2500,950)),('09','boss',4,(-5200,550)),
      ('10','guard',2,(-5550,-1800)),('11','combat',2,(-2200,-2250)),
      ('12','guard',2,(500,-1150)),('13','combat',3,(3450,-1400)),
      ('14','combat',2,(-1850,-4150)),('15','combat',3,(5400,-4050)),
      ('08','guard',2,(-2800,1800)),('04','combat',2,(3450,3150)),
    ]
    encounters=[]
    for n,(area,kind,tier,(x,y)) in enumerate(placements):
        e=at(x,y,id=f'clearing:beach:{area}:{n}',area=area,r=205 if kind=='boss' else 135,kind=kind,tier=tier)
        if kind=='guard':e.update(count=4,strength=1.4,name='海岸守卫')
        elif kind=='combat':e['count']=5 if tier<3 else 6
        else:e.update(bossKind='deepcaller' if area=='06' else 'ancient',name='碧潮守望者' if area=='06' else '海风古树')
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
    # Long irregular reef/woodland tongues bend the coastline. Their varying
    # tapered profiles share the authoritative collision, not capsule decor.
    spurs=[]
    inland_spines=[
      [(-4570,-1100),(-3950,-1350),(-3480,-700),(-3500,0),(-3800,750),(-4370,600),(-4640,-100)],
      [(-5700,-1100),(-5050,-1250),(-4320,-1020),(-4010,-500),(-4380,-150),(-5110,-250),(-5700,-450)],
      [(-4730,2020),(-4210,1950),(-3700,2500),(-3580,3150),(-3960,3500),(-4510,3150),(-4820,2650)],
      [(-2510,-1180),(-1920,-1320),(-1540,-720),(-1730,-100),(-2340,-180),(-2630,-600)],
    ]
    for raw in inland_spines:
        spine=Polygon(natural_ring(raw,reach=130)).difference(reserve).buffer(0)
        candidate=walk.difference(spine)
        assert candidate.geom_type=='Polygon' and candidate.buffer(-55).geom_type=='Polygon','Wooded spine severs coast'
        walk=candidate;spurs.append(spine)
    for id in ['02','04','05','06','07','08','09','10','11','13','14']:
        area=by_id[id];boundary=area.exterior;choices=[]
        for n in range(60):
            s=boundary.length*n/60;p=boundary.interpolate(s);a=boundary.interpolate((s-12)%boundary.length);b=boundary.interpolate((s+12)%boundary.length)
            dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy);tx,ty=dx/length,dy/length;nx,ny=-ty,tx
            if not area.contains(Point(p.x+nx*20,p.y+ny*20)):nx,ny=-nx,-ny
            for depth in [300,450,620]:
                for radius in [150,210,270]:
                    local=[(-radius,-180),(-radius*.95,depth*.15),(-radius*.62,depth*.65),(-radius*.15,depth),(radius*.35,depth*.86),(radius*.6,depth*.5),(radius,depth*.08),(radius*1.05,-180)]
                    contour=natural_ring([(p.x+tx*u+nx*v,p.y+ty*u+ny*v) for u,v in local],reach=60)
                    reef=Polygon(contour).buffer(0)
                    if reef.intersects(reserve):continue
                    size=walk.intersection(reef).area
                    if size<55000:continue
                    candidate=walk.difference(reef)
                    if candidate.geom_type!='Polygon' or candidate.buffer(-55).geom_type!='Polygon':continue
                    choices.append((size,reef,candidate))
        if choices:
            size,reef,walk=max(choices,key=lambda item:item[0]);spurs.append(reef)
    assert len(spurs)>=6,'Too few meaningful reef/woodland tongues'
    # A single west mainland faces the eastern ocean and its broad lagoon.
    # Most sand spit edges touch water; only the inland flank carries forest.
    mainland=Polygon(natural_ring([(-7200,-5400),(-3600,-5400),(-1700,-5250),(-900,-4450),(100,-3450),(850,-2700),(500,-2050),(-1000,-900),(-1450,0),(-900,900),(-1300,2200),(-700,3350),(-1050,4400),(-2500,4850),(-5000,4750),(-7200,5000)],reach=160)).buffer(0).intersection(BOUNDS)
    # A low landward dune anchors the long south beach; eastern reef tongues
    # form actual barriers without a uniform raised halo around every island.
    dune=Polygon(natural_ring([(-3100,3600),(-2100,3350),(-1100,3450),(100,3650),(1700,3500),(2700,2550),(3600,2350),(4300,2850),(3800,3300),(2700,3600),(1400,4050),(200,3950),(-1200,4100),(-2700,4050)],reach=120)).buffer(0)
    reef_shelves=[by_id['13'].buffer(180).intersection(box(-7200,-1550,7200,5400)),by_id['05'].buffer(170).intersection(box(-7200,-5400,5500,5400))]
    landmass=unary_union([mainland,dune,*reef_shelves,*spurs]).intersection(BOUNDS)
    bridge_water=unary_union([LineString(deck).buffer(500,cap_style=2,quad_segs=8) for deck in DECKS.values()])
    lagoon=Polygon(natural_ring([(-1000,-600),(0,-850),(1450,-500),(1900,250),(1700,1400),(1200,2600),(500,3250),(-500,3100),(-900,2200),(-1150,1100)],reach=180)).buffer(0)
    landmass=landmass.difference(unary_union([bridge_water,lagoon]).difference(walk))
    # Filling all narrow numerical slivers into the solid shelf prevents
    # tiny decorative puddles from becoming isolated water regions.
    water=BOUNDS.difference(landmass).difference(walk).buffer(0)
    water_parts=[water] if water.geom_type=='Polygon' else list(water.geoms)
    water=unary_union([p for p in water_parts if p.area>20000]).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    patches=[]
    for n,area in enumerate(areas):
        if area['material']!='forest':continue
        free=by_id[area['id']].intersection(walk).difference(reserve)
        if free.is_empty:continue
        candidate=max(list(free.geoms) if free.geom_type=='MultiPolygon' else [free],key=lambda q:q.area);p=candidate.representative_point()
        patch=scale(Point(p.x,p.y).buffer(1,quad_segs=7),240,175).intersection(candidate)
        for j,r in enumerate(rings(patch,'patch')):
            if r['hole']:continue
            center=Polygon([pair(q) for q in r['points']]).representative_point()
            patches.append({'id':f'beach-grove:{n}:{j}','kind':'grove','center':point(center.x,center.y),'x':round(center.x,2),'y':round(center.y,2),'rx':240,'ry':175,'density':.3,'points':r['points']})
    layout={'kind':'rift-forest','worldId':'beach','id':'beach:1','name':'潮汐海岸','revision':1,'artTheme':'beach',
      'palette':{'ground':'#eedcaf','brush':'#a6bb80','forest':'#426c56','ridge':'#989a81','water':'#398e9c','waterLight':'#82c8bd','bridge':'#ba9865'},
      'bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':SPAWN,'areas':areas,'passages':passages,
      'boundaries':rings(walk,'beach-ground'),'solidBoundaries':rings(high,'beach-high'),
      'lakes':[dict(r,kind='water') for r in rings(water,'beach-sea')],
      'landmarks':landmarks,'plan':PLAN,'encounters':encounters,'patches':patches,
      'interactions':{'caves':CAVES,'gates':[],'chests':chests}}
    validate_geometry(layout,walk,water)
    return layout,walk,water

def validate_geometry(layout,walk,water):
    free=walk.buffer(-55)
    assert free.geom_type=='Polygon','55-unit body cannot traverse all shores'
    for p in layout['passages']:
        line=LineString([pair(q) for q in p['waypoints']])
        assert walk.buffer(.03).covers(line.buffer(70)),f"Route clearance {p['id']}"
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
    assert .22<=walk.area/BOUNDS.area<=.40,f'Walk fraction {walk.area/BOUNDS.area:.3f}'
    assert len(layout['boundaries'])<=64 and len(layout['solidBoundaries'])<=64 and len(layout['lakes'])<=32

def preview(layout,walk,water,out):
    from xml.sax.saxutils import escape
    out.mkdir(parents=True,exist_ok=True)
    def path(shape):return ' '.join('M'+' L'.join(f"{p['x']},{p['y']}" for p in r['points'])+' Z' for r in rings(shape,'preview'))
    body=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="-7400 -5600 14800 11922">','<rect x="-7400" y="-5600" width="14800" height="11922" fill="#436d59"/>',f'<path d="{path(water)}" fill="#398e9c" fill-rule="evenodd" stroke="#82c8bd" stroke-width="25"/>',f'<path d="{path(walk)}" fill="#eedcaf" fill-rule="evenodd" stroke="#c3c9a2" stroke-width="24"/>']
    for p in layout['passages']:
        if 'deck' in p:
            a,b=p['deck'];body.append(f'<line x1="{a["x"]}" y1="{a["y"]}" x2="{b["x"]}" y2="{b["y"]}" stroke="#bb9660" stroke-width="{p["width"]}"/>')
    for area in layout['areas']:
        p=area['center'];body.append(f'<text x="{p["x"]}" y="{p["y"]+55}" text-anchor="middle" font-family="Noto Sans CJK SC,sans-serif" font-size="145" font-weight="bold" fill="#344f45">{escape(area["id"]+" "+area["name"])}</text>')
    for p in layout['encounters']:
        if p['kind']=='boss':body.append(f'<circle cx="{p["x"]}" cy="{p["y"]-170}" r="85" fill="#b76654" stroke="#f0dfb1" stroke-width="20"/>')
    for p in CAVES:body.append(f'<path d="M{p["x"]-80},{p["y"]+50} a80,100 0 0 1 160,0 z" fill="#334c43" stroke="#b7ac87" stroke-width="25"/>')
    for p in layout['interactions']['chests']:body.append(f'<rect x="{p["x"]-55}" y="{p["y"]-45}" width="110" height="90" fill="#dfbc70" stroke="#836946" stroke-width="20"/>')
    body.extend(['<text x="-6800" y="5850" font-family="Noto Sans CJK SC,sans-serif" font-size="210" fill="#eef0d1">潮汐海岸 · 布局预览</text>',f'<text x="-6800" y="6180" font-family="Noto Sans CJK SC,sans-serif" font-size="140" fill="#d2dfc6">浅沙：可走长滩与礁径　深绿：林地/礁脊阻隔　青蓝：外海与礁湖　褐色：栈桥　14400×10800 · 可行走 {walk.area/BOUNDS.area:.1%}</text>','</svg>'])
    (out/'beach-layout.svg').write_text('\n'.join(body));(out/'beach-layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))

def write_world(layout):
    path=ROOT/'dist/config/worlds.json';source=path.read_text();decoder=json.JSONDecoder();start=source.index('[',source.index('"definitions"'))+1
    while True:
        while source[start].isspace() or source[start]==',':start+=1
        if source[start]==']':raise ValueError('Missing beach world')
        w,end=decoder.raw_decode(source,start)
        if w['id']=='beach':break
        start=end
    w['authored']=layout
    w['colors'].update(ground='#eedcaf',light='#f5e7c6',dark='#748a72',accent='#e5cc8a',mist='#dce9d9',grass='#96b581',stone='#a4aa92')
    w['art']['coast']={'deep':'#236679','sea':'#398e9c','shallow':'#82c8bd','sand':'#eedcaf','grain':'#f5e7c6','edge':'#b7d8c2','fringe':'#a6b984'}
    w['art']['mapCoast']={'land':'#d9d8aa','sand':'#eedcaf','sea':'#236679','shallow':'#398e9c'}
    w['layout']={'paths':[[[p['x'],p['y']] for p in route['waypoints']] for route in layout['passages'] if route['to']],'patches':[['brush',p['x'],p['y'],p['rx'],p['ry'],0,.3] for p in layout['patches']],'lakes':[],'ridges':[],'bossKind':'deepcaller'}
    replacement=json.dumps(w,ensure_ascii=False,indent=2);replacement='\n'.join(('    '+line if i else line) for i,line in enumerate(replacement.splitlines()))
    path.write_text(source[:start]+replacement+source[end:])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-dir',type=Path);parser.add_argument('--write',action='store_true');args=parser.parse_args()
    layout,walk,water=build()
    if args.preview_dir:preview(layout,walk,water,args.preview_dir)
    if args.write:write_world(layout)
    print(json.dumps({'areas':len(layout['areas']),'passages':len(layout['passages']),'walkFraction':round(walk.area/BOUNDS.area,4),'waterFraction':round(water.area/BOUNDS.area,4),'waterRings':len(layout['lakes']),'written':args.write},ensure_ascii=False))

if __name__=='__main__':main()
