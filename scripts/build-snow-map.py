#!/usr/bin/env python3
"""Bake snow valleys and shared collision contours (offline Shapely 2.x)."""
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

# Wind-carved snow valleys encircle the central thaw lake and glacial ridge.
# Long connected land ribbons form routes; region names do not stamp rooms.
VALLEYS={
 'west':[(-6100,4200,400),(-5700,3500,650),(-6100,2500,460),(-5200,1450,700),(-5700,300,460),(-5850,-900,610),(-5200,-1700,480),(-4300,-2750,650)],
 'north':[(-4300,-2750,650),(-3100,-3500,450),(-1800,-4100,800),(-200,-3650,530),(1400,-4200,600),(3000,-3900,480),(4300,-3250,720)],
 'east':[(4300,-3250,720),(5500,-2700,440),(5850,-1500,700),(5350,-200,420),(5600,1150,650),(4700,2200,430),(3600,3200,780)],
 'south':[(3600,3200,780),(2200,3800,500),(500,3700,740),(-900,4200,440),(-2500,3000,650),(-4000,3200,480),(-5700,3500,650)],
 'inner':[(-3150,1750,430),(-3000,650,650),(-3450,-350,360),(-2150,-1300,660),(-800,-1650,390),(650,-2050,670),(1900,-1350,400),(3050,-100,560),(2700,1200,350)],
}
REGIONS=[
 ('01','西境雪驿',(-5700,3500),'camp','forest','west'),
 ('02','白松边林',(-5200,1450),'grove','forest','west'),
 ('03','霜林隘道',(-5850,-900),'pass','forest','west'),
 ('04','风蚀雪谷',(-4300,-2750),'pass','rock','west'),
 ('05','北境冰台',(-1800,-4100),'fortress','rock','north'),
 ('06','远望雪丘',(1400,-4200),'pass','rock','north'),
 ('07','银杉上谷',(4300,-3250),'grove','forest','north'),
 ('08','冰冠遗台',(5850,-1500),'fortress','rock','east'),
 ('09','东霜峡口',(5600,1150),'pass','rock','east'),
 ('10','霜枝营地',(3600,3200),'camp','forest','east'),
 ('11','冰湖南岸',(500,3700),'grove','forest','south'),
 ('12','雪埋旧道',(-2500,3000),'pass','rock','south'),
 ('13','回音冰湾',(-3000,650),'quarry','rock','inner'),
 ('14','融溪谷地',(-2150,-1300),'grove','forest','inner'),
 ('15','守望遗址',(650,-2050),'fortress','rock','inner'),
 ('16','蓝冰藏径',(3050,-100),'secret','rock','inner'),
]
CENTERS={id:c for id,_,c,*_ in REGIONS}
LINKS=[
 ('s01','01','02',320,'trail',[(-6100,2500)]),
 ('s02','02','03',300,'trail',[(-5700,300)]),
 ('s03','03','04',290,'trail',[(-5200,-1700)]),
 ('s04','04','05',300,'trail',[(-3100,-3500)]),
 ('s05','05','06',290,'trail',[(-200,-3650)]),
 ('s06','06','07',280,'trail',[(3000,-3900)]),
 ('s07','07','08',300,'trail',[(5500,-2700)]),
 ('s08','08','09',280,'trail',[(5350,-200)]),
 ('s09','09','10',300,'trail',[(4700,2200)]),
 ('s10','10','11',310,'trail',[(2200,3800)]),
 ('s11','11','12',300,'trail',[(-900,4200)]),
 ('s12','12','01',310,'trail',[(-4000,3200)]),
 ('s13','13','14',280,'trail',[(-3450,-350)]),
 ('s14','14','15',280,'trail',[(-800,-1650)]),
 ('s15','15','16',280,'bridge',[(1550,-1650),(2100,-1100),(2500,-700)]),
 ('s16','12','13',250,'trail',[(-3150,1750)]),
 ('s17','02','13',270,'bridge',[(-4400,1050),(-4100,950),(-3500,750)]),
 ('s18','04','14',260,'trail',[(-3750,-2050),(-3000,-1800)]),
 ('s19','06','15',250,'trail',[(1600,-3100),(1000,-2700)]),
 ('s20','16','09',260,'trail',[(4050,200),(4750,650)]),
 ('s21','16','10',270,'trail',[(2700,1200),(3000,2200)]),
 ('s22','13','16',270,'bridge',[(-1800,1000),(-1100,700),(-500,600),(100,350),(650,200),(1350,250),(1900,-50)]),
 ('exit-mountain','01',None,320,'exit',[(-6500,4300)]),
 ('exit-volcano','09',None,320,'exit',[(6500,1200),(6700,1800)]),
]
DECKS={'s15':((1550,-1650),(2100,-1100)),'s17':((-4100,950),(-3500,750)),'s22':((100,350),(650,200))}
SPAWN=at(-5700,3610,area='01')
PLAN={
 'merchant':at(-5340,3510,r=105),'supply':at(-4960,1470,r=125),
 'occupied':at(-3200,760,r=225),'castle':at(750,-1930,r=360),
 'hunt':at(-5600,-800,r=280),'rescue':at(-2380,-1220,r=240),
 'rune':at(6050,-1420,r=185),'rescue-warden':at(3380,3200,r=240),
 'dogcamp':at(-6050,3450,r=115),'owlroost':at(4450,-3150,r=240),
 'golemaltar':at(-1550,-4000,r=270),'stonevault':at(5250,1150,r=240),
 'portal:5':at(-6500,4300,r=90,arrivalDirection={'x':math.sqrt(.5),'y':-math.sqrt(.5)}),
 'portal:7':at(6700,1800,r=90,arrivalDirection={'x':-1/math.sqrt(10),'y':-3/math.sqrt(10)}),
}
CAVES=[
 at(-3060,300,id='echo-cave',name='回音冰洞',area='13',caveId='frost-vein-tunnel',caveName='霜脉暗道',seed=81801,exitName='回音冰湾',approach=point(-3000,470)),
 at(4400,-3500,id='cedar-cave',name='银杉冰洞',area='07',caveId='frost-vein-tunnel',caveName='霜脉暗道',seed=81801,exitName='银杉上谷',approach=point(4330,-3320)),
 at(3300,-100,id='blue-cave',name='蓝冰洞口',area='16',caveId='blue-ice-vault',caveName='蓝冰深窟',seed=81802,exitName='蓝冰藏径',approach=point(3110,-30)),
]
CHESTS=[
 ('pine-cache','白松藏匣','02',-5510,1400),('trail-cache','隘道旧箱','03',-6000,-1050),
 ('north-cache','冰台秘匣','05',-1900,-4320),('hill-cache','雪丘藏匣','06',1200,-4350),
 ('cedar-cache','银杉旧箱','07',4120,-3470),('crown-cache','冰冠秘藏','08',6000,-1670),
 ('south-cache','南岸藏匣','11',300,3810),('echo-cache','冰湾旧箱','13',-2760,600),
 ('watch-cache','守望遗箱','15',450,-2180),('blue-cache','蓝冰秘匣','16',3030,180),
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
    caves=[dict(c,approach=dict(c['approach'])) for c in CAVES]
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
        if id in ['s16','s18','s19','s20','s21']:
            # Cross-valley passes tighten at rock saddles and ease around
            # bends; they are footpaths rather than constant-width roads.
            shape=ribbon([(x,y,width/2*([1.28,1.02,1.32,1.12][i%4])) for i,(x,y) in enumerate(raw)],reach=230)
        if id=='s22':
            # Opposing ice/snow tongues wrap the lake, narrowing only at the
            # small true bridge. They are not an even-width road over water.
            west=ribbon([(x,y,w) for (x,y),w in zip(raw[:5],[280,240,300,210,135])],reach=190)
            east=ribbon([(x,y,w) for (x,y),w in zip(raw[5:],[135,235,215,320])],reach=170)
            shape=unary_union([west,east,LineString(DECKS[id]).buffer(width/2,quad_segs=8)]).buffer(0)
        passages.append({'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coordinates(shape.exterior),'waypoints':[point(*p) for p in spine]});corridors.append(shape)
        if id in DECKS:passages[-1]['deck']=[point(*p) for p in DECKS[id]]
    walk=unary_union([*valleys.values(),*corridors]).buffer(0)
    assert walk.geom_type=='Polygon' and BOUNDS.covers(walk),'Valley pass disconnected'
    encounters=[]
    placements=[
      ('02','combat',0,(-5250,1650)),('03','guard',1,(-5700,-1100)),
      ('04','combat',1,(-4300,-2850)),('05','boss',4,(-1870,-4200)),
      ('06','guard',2,(1550,-4150)),('07','combat',2,(4100,-3100)),
      ('08','boss',4,(5820,-1500)),('09','guard',3,(5750,1220)),
      ('10','combat',1,(3800,3050)),('11','combat',1,(600,3500)),
      ('12','guard',1,(-2500,3100)),('13','combat',2,(-2950,850)),
      ('14','combat',2,(-2050,-1450)),('15','guard',3,(800,-2300)),
      ('16','combat',3,(2900,-200)),
    ]
    for n,(area,kind,tier,(x,y)) in enumerate(placements):
        e=at(x,y,id=f'clearing:snow:{area}:{n}',area=area,r=205 if kind=='boss' else 135,kind=kind,tier=tier)
        if kind=='guard':e.update(count=4,strength=1.4,name='雪隘守卫')
        elif kind=='combat':e['count']=5 if tier<3 else 6
        else:e.update(bossKind='ancient' if area=='05' else 'frostcrown',name='冰台守望者' if area=='05' else '霜冠领主')
        encounters.append(e)
    chests=[at(x,y,id=id,name=name,area=area,approach=point(x,y+80)) for id,name,area,x,y in CHESTS]
    landmarks={'spawn':SPAWN}
    for key,p in PLAN.items():
        if key.startswith('portal:'):landmarks[key.replace(':','-')]=dict(p,kind='exit',target=int(key.split(':')[1]))
    for c in caves:landmarks['cave-'+c['id']]={k:c[k] for k in ('x','y','area')}|{'kind':'cave'}
    for e in encounters:
        if e['kind']=='boss':landmarks['boss'+e['area']]={k:e[k] for k in ('x','y','area')}|{'kind':'boss'}
    for c in chests:landmarks['treasure-'+c['id']]={k:c[k] for k in ('x','y','area')}|{'kind':'treasure'}
    protected=[SPAWN,*PLAN.values(),*encounters,*caves,*chests,*[s['approach'] for s in [*caves,*chests]],*[a['center'] for a in areas]]
    reserve=unary_union([*[Point(pair(p)).buffer(p.get('r',90)+65) for p in protected],*[LineString([pair(q) for q in p['waypoints']]).buffer(p['width']/2+55) for p in passages]])
    # The broad quarry and forest valley contain rooted rock/woodland spines.
    # These are terrain, so walking along a long face cannot snag on prop seams.
    spurs=[]
    for id in ['01','02','03','05','07','08','10','11','13','15']:
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
    # Only dark thaw water is unwalkable. Frozen ground inside the snow
    # valleys remains ordinary terrain, without a separate movement mechanic.
    creek=LineString(natural_route([(-4400,2050),(-4100,1350),(-3800,850),(-3900,-100),(-4400,-900)],reach=210)).buffer(265,quad_segs=10)
    melt_lake=Polygon(natural_ring([(-1200,250),(-700,-400),(0,-600),(850,-450),(1500,200),(1900,1100),(1600,2100),(650,2700),(-450,2500),(-1200,1650),(-1450,800)],reach=180)).buffer(0)
    north_melt=LineString(natural_route([(1700,-2350),(1550,-1800),(1825,-1375),(2400,-1400),(3000,-1900)],reach=120)).buffer(400,quad_segs=10)
    # The northern melt stream cuts the wide valley here; only the authored
    # bridge deck spans it, so neither bank becomes an unintended water road.
    bridge_path=next(corridor for passage,corridor in zip(passages,corridors) if passage['id']=='s15')
    # Opening the carved melt banks rounds acute wedges where the curved
    # stream meets the straight bridge. The physical cut is softened too.
    melt_cut=north_melt.difference(bridge_path).buffer(-60,quad_segs=8).buffer(60,quad_segs=8)
    walk=walk.difference(melt_cut).buffer(0)
    if walk.geom_type=='MultiPolygon':walk=max(walk.geoms,key=lambda p:p.area)
    water=unary_union([creek,melt_lake,north_melt]).difference(unary_union([walk,*spurs])).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    # Cave openings sit below real high banks, with the approach facing into
    # the snow valley. They never float as isolated arches in an open field.
    for cave in caves:
        origin=Point(pair(cave));choices=[]
        for ring in [walk.exterior,*walk.interiors]:
            for n in range(math.ceil(ring.length/38)):
                distance=n*38;p=ring.interpolate(distance);a=ring.interpolate(max(0,distance-8));b=ring.interpolate(min(ring.length,distance+8));dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy)
                if not length or p.distance(origin)>740:continue
                nx,ny=-dy/length,dx/length
                if not walk.contains(Point(p.x+nx*16,p.y+ny*16)):nx,ny=-nx,-ny
                if ny<.42 or water.distance(Point(p.x-nx*20,p.y-ny*20))<40:continue
                target=Point(p.x+nx*83,p.y+ny*83);approach=Point(target.x+nx*180,target.y+ny*180)
                if not walk.covers(target.buffer(70)) or not walk.covers(LineString([target,approach]).buffer(65)):continue
                if any(target.distance(Point(pair(site)))<site.get('r',0)+100 for site in PLAN.values()):continue
                choices.append((p.distance(origin)+(1-ny)*100,target,approach))
        assert choices,f"No cliff cave approach {cave['id']}"
        _,target,approach=min(choices,key=lambda c:c[0]);cave.update(point(target.x,target.y));cave['approach']=point(approach.x,approach.y)
        landmarks['cave-'+cave['id']]={k:cave[k] for k in ('x','y','area')}|{'kind':'cave'}
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
            patches.append({'id':f'snow-grove:{n}:{j}','kind':'grove','center':point(center.x,center.y),'x':round(center.x,2),'y':round(center.y,2),'rx':250,'ry':160,'density':.3,'points':r['points']})
    layout={'kind':'rift-forest','worldId':'snow','id':'snow:1','name':'霜雪荒原','revision':1,'artTheme':'snow',
      'palette':{'ground':'#dce6df','brush':'#a8bfb3','forest':'#536f68','ridge':'#8da9ae','water':'#4f8798','waterLight':'#b0d5d8','bridge':'#abae9a'},
      'bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':SPAWN,'areas':areas,'passages':passages,
      'boundaries':rings(walk,'snow-ground'),'solidBoundaries':rings(high,'snow-high'),
      'lakes':[dict(r,kind='water') for r in rings(water,'snow-water')],
      'landmarks':landmarks,'plan':PLAN,'encounters':encounters,'patches':patches,
      'interactions':{'caves':caves,'gates':[],'chests':chests}}
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
    assert .27<=walk.area/BOUNDS.area<=.42,f'Walk fraction {walk.area/BOUNDS.area:.3f}'
    assert len(layout['boundaries'])<=64 and len(layout['solidBoundaries'])<=64 and len(layout['lakes'])<=32

def preview(layout,walk,water,out):
    from xml.sax.saxutils import escape
    out.mkdir(parents=True,exist_ok=True)
    def path(shape):return ' '.join('M'+' L'.join(f"{p['x']},{p['y']}" for p in r['points'])+' Z' for r in rings(shape,'preview'))
    body=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="-7400 -5600 14800 11922">','<rect x="-7400" y="-5600" width="14800" height="11922" fill="#668078"/>',f'<path d="{path(water)}" fill="#4f8798" fill-rule="evenodd" stroke="#a2c9bd" stroke-width="25"/>',f'<path d="{path(walk)}" fill="#dce6df" fill-rule="evenodd" stroke="#a3ad92" stroke-width="24"/>']
    for p in layout['passages']:
        if 'deck' in p:
            a,b=p['deck'];body.append(f'<line x1="{a["x"]}" y1="{a["y"]}" x2="{b["x"]}" y2="{b["y"]}" stroke="#b39a70" stroke-width="{p["width"]}"/>')
    for area in layout['areas']:
        p=area['center'];body.append(f'<text x="{p["x"]}" y="{p["y"]+55}" text-anchor="middle" font-family="Noto Sans CJK SC,sans-serif" font-size="145" font-weight="bold" fill="#3b5147">{escape(area["id"]+" "+area["name"])}</text>')
    for p in layout['encounters']:
        if p['kind']=='boss':body.append(f'<circle cx="{p["x"]}" cy="{p["y"]-170}" r="85" fill="#b76654" stroke="#f0dfb1" stroke-width="20"/>')
    for p in layout['interactions']['caves']:body.append(f'<path d="M{p["x"]-80},{p["y"]+50} a80,100 0 0 1 160,0 z" fill="#334c43" stroke="#b7ac87" stroke-width="25"/>')
    for p in layout['interactions']['chests']:body.append(f'<rect x="{p["x"]-55}" y="{p["y"]-45}" width="110" height="90" fill="#dfbc70" stroke="#836946" stroke-width="20"/>')
    body.extend(['<text x="-6800" y="5850" font-family="Noto Sans CJK SC,sans-serif" font-size="210" fill="#eef0d1">霜雪荒原 · 布局预览</text>',f'<text x="-6800" y="6180" font-family="Noto Sans CJK SC,sans-serif" font-size="140" fill="#d2dfc6">浅色：连续谷地、雪隘与环湖旧道　深色：雪脊与密松林　青蓝：融冰溪湖　14400×10800 · 可行走 {walk.area/BOUNDS.area:.1%}</text>','</svg>'])
    (out/'snow-layout.svg').write_text('\n'.join(body));(out/'snow-layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))

def write_world(layout):
    path=ROOT/'dist/config/worlds.json';source=path.read_text();decoder=json.JSONDecoder();start=source.index('[',source.index('"definitions"'))+1
    while True:
        while source[start].isspace() or source[start]==',':start+=1
        if source[start]==']':raise ValueError('Missing snow world')
        w,end=decoder.raw_decode(source,start)
        if w['id']=='snow':break
        start=end
    w['authored']=layout
    w['colors'].update(ground='#dce6df',light='#f0f2e6',dark='#78959b',accent='#c9e8e6',mist='#e0ebe8',grass='#8ca89e',stone='#9eb5b7')
    w['art']['coast']={'deep':'#315e73','sea':'#4f8798','shallow':'#b0d5d8','sand':'#c7d8d5','grain':'#eff2e8','edge':'#e2ede8','fringe':'#8faea8'}
    w['art']['mapCoast']={'land':'#8da9ae','sand':'#dce6df','sea':'#315e73','shallow':'#4f8798'}
    w['layout']={'paths':[[[p['x'],p['y']] for p in route['waypoints']] for route in layout['passages'] if route['to']],'patches':[['brush',p['x'],p['y'],p['rx'],p['ry'],0,.3] for p in layout['patches']],'lakes':[],'ridges':[],'bossKind':'frostcrown'}
    replacement=json.dumps(w,ensure_ascii=False,indent=2);replacement='\n'.join(('    '+line if i else line) for i,line in enumerate(replacement.splitlines()))
    path.write_text(source[:start]+replacement+source[end:])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-dir',type=Path);parser.add_argument('--write',action='store_true');args=parser.parse_args()
    layout,walk,water=build()
    if args.preview_dir:preview(layout,walk,water,args.preview_dir)
    if args.write:write_world(layout)
    print(json.dumps({'areas':len(layout['areas']),'passages':len(layout['passages']),'walkFraction':round(walk.area/BOUNDS.area,4),'waterRings':len(layout['lakes']),'written':args.write},ensure_ascii=False))

if __name__=='__main__':main()
