#!/usr/bin/env python3
"""Bake Marsh's shared map geometry; Shapely is an offline dependency only."""
import argparse
import json
import math
import sys
from pathlib import Path
from shapely.geometry import Point, Polygon, LineString, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

sys.dont_write_bytecode = True
from natural_contours import natural_ring, natural_route

ROOT = Path(__file__).resolve().parent.parent
BOUNDS = box(-7200, -5400, 7200, 5400)

def point(x, y): return {"x": round(x, 2), "y": round(y, 2)}
def pair(p): return (p['x'], p['y'])
def coordinates(ring): return [point(x,y) for x,y in list(ring.coords)[:-1]]
def rings(shape, prefix):
    parts = [shape] if shape.geom_type == 'Polygon' else list(shape.geoms)
    result = []
    for i,p in enumerate(sorted(parts,key=lambda p:-p.area)):
        p=orient(p)
        result.append({'id':f'{prefix}:{i}','points':coordinates(p.exterior),'hole':False})
        result.extend({'id':f'{prefix}:{i}:hole:{n}','points':coordinates(h),'hole':True} for n,h in enumerate(p.interiors))
    return result

# Explicit banks, hooked clearings and long woodland pockets. These coordinates
# are the source used by the preview, runtime terrain, navigation and map art.
ROOMS = [
 ('01','南缘驿地',(-5800,3900),'camp','forest',[(-900,-500),(-350,-780),(350,-680),(750,-350),(830,260),(400,580),(-400,650),(-850,300)]),
 ('02','芦苇曲岸',(-3500,3500),'grove','forest',[(-1100,-400),(-650,-900),(200,-900),(1000,-500),(950,50),(450,-100),(0,200),(-80,650),(-700,800),(-1200,300)]),
 ('03','旧驿土丘',(-5800,1300),'grove','forest',[(-650,-1150),(120,-1300),(650,-800),(750,-200),(420,300),(650,900),(0,1250),(-650,900),(-800,250),(-510,-300),(-850,-650)]),
 ('04','盘根林庭',(-3100,700),'grove','forest',[(-1050,-500),(-600,-950),(250,-1050),(950,-600),(1100,-50),(750,350),(150,230),(-100,600),(500,900),(-200,1100),(-850,650),(-1150,100)]),
 ('05','沉水旧院',(-5700,-1400),'ruins','rock',[(-850,-500),(-400,-1050),(500,-900),(850,-450),(600,100),(950,500),(400,900),(-100,700),(-650,950),(-1000,300)]),
 ('06','孢雾巢泽',(-5700,-3800),'grove','forest',[(-900,-700),(-200,-1050),(500,-750),(1050,-200),(800,400),(300,900),(-350,750),(-650,300),(-1050,100)]),
 ('07','浮根窄湾',(-2900,-2500),'grove','forest',[(-850,-600),(-300,-1050),(650,-1100),(1000,-500),(650,100),(800,650),(150,1150),(-450,750),(-500,150),(-1000,-50)]),
 ('08','北岸石垒',(-1400,-4350),'ruins','rock',[(-1400,-500),(-500,-700),(300,-600),(1100,-200),(1400,250),(650,650),(0,350),(-700,650),(-1400,100)]),
 ('09','北渡泥洲',(1600,-3350),'grove','forest',[(-650,-900),(200,-1200),(850,-650),(800,0),(1100,400),(500,950),(-150,1200),(-750,750),(-650,150),(-950,-300)]),
 ('10','溺钟遗台',(4700,-3650),'fortress','rock',[(-1000,-850),(-250,-1000),(600,-800),(1150,-200),(1000,500),(450,900),(-250,750),(-850,950),(-1200,200)]),
 ('11','枯木回廊',(5500,-900),'grove','forest',[(-650,-1350),(100,-1500),(650,-950),(500,-350),(850,200),(600,900),(0,1350),(-650,1000),(-850,400),(-550,-200),(-950,-700)]),
 ('12','东岸遗寨',(3200,1100),'village','rock',[(-1000,-600),(-400,-1000),(550,-950),(1100,-250),(700,400),(200,250),(-150,850),(-750,1050),(-1150,500),(-900,0)]),
 ('13','南方沉坛',(5000,3500),'ruins','rock',[(-950,-700),(-350,-1000),(450,-850),(1000,-400),(1100,250),(450,950),(-250,800),(-900,1050),(-1150,250)]),
 ('14','长堤浅丘',(1800,3500),'grove','forest',[(-1100,-700),(-350,-1050),(450,-850),(950,-300),(1250,300),(600,750),(-150,900),(-950,550),(-1250,0)]),
 ('15','河心湿林',(300,-650),'island','forest',[(-800,-650),(-300,-1000),(500,-850),(1100,-350),(1000,200),(500,500),(200,1050),(-450,800),(-1000,300),(-750,-100)]),
 ('16','月苔秘境',(-3200,4870),'secret','forest',[(-650,-180),(-150,-380),(400,-290),(700,50),(230,310),(-350,260),(-750,80)]),
]
CENTERS={id:c for id,_,c,*_ in ROOMS}

# Each bridge has an actual short deck across water. Trails wind through
# separate banks; they do not let the player cut across the root barriers.
LINKS = [
 ('s01','01','02',250,'trail',[(-4650,4100)]),
 ('s02','01','03',230,'trail',[(-6350,2800)]),
 ('s03','02','04',230,'trail',[(-2900,2450)]),
 ('s04','03','04',250,'trail',[(-4600,1500)]),
 ('s05','03','05',230,'trail',[(-6380,-100)]),
 ('s06','04','07',220,'trail',[(-3450,-700),(-3350,-1350)]),
 ('s07','05','07',250,'trail',[(-4350,-1750)]),
 ('s08','05','06',230,'trail',[(-6350,-2700)]),
 ('s09','06','08',250,'trail',[(-4200,-4600),(-3200,-4550)]),
 ('s10','07','08',220,'trail',[(-2300,-3650)]),
 ('s11','08','09',230,'bridge',[(-550,-4000),(-150,-4000),(550,-4000),(1150,-3850)]),
 ('s12','09','10',250,'trail',[(3300,-4350)]),
 ('s13','09','15',210,'bridge',[(1000,-2400),(1000,-2100),(1000,-1500),(700,-1200)]),
 ('s14','10','11',240,'trail',[(6370,-2550),(6250,-1800)]),
 ('s15','11','12',230,'trail',[(5050,400),(4300,650)]),
 ('s16','12','13',240,'trail',[(4250,2050),(4600,2700)]),
 ('s17','13','14',250,'trail',[(3500,4350)]),
 ('s18','14','02',240,'bridge',[(650,3400),(350,3400),(-550,3400),(-1600,3250),(-2300,3300)]),
 ('s19','14','12',230,'trail',[(2400,2350)]),
 ('s20','02','16',170,'secret',[(-4000,4200),(-4100,4670)]),
 ('exit-west','01',None,250,'exit',[(-6500,4450),(-6500,4840)]),
 ('exit-east','10',None,250,'exit',[(5900,-3700),(6570,-3700)]),
]
DECKS={'s11':((-150,-4000),(550,-4000)), 's13':((1000,-2100),(1000,-1500)), 's18':((350,3400),(-550,3400))}

def at(x,y,**extra): return {**point(x,y),**extra}

PLAN = {
 'merchant':at(-5480,4070,r=105), 'supply':at(-3830,3600,r=125),
 'occupied':at(4150,-3860,r=225), 'castle':at(5170,-3830,r=360),
 'hunt':at(-2950,-2640,r=280), 'rescue':at(-5730,1410,r=240),
 'rune':at(200,-600,r=185), 'rescue-warden':at(2700,1400,r=240),
 'dogcamp':at(-6150,3700,r=115), 'owlroost':at(-1580,-4500,r=240),
 'golemaltar':at(-3100,700,r=270), 'stonevault':at(5200,3420,r=240),
 'portal:9':at(-6500,4770,r=90,arrivalDirection={'x':0,'y':-1}),
 'portal:2':at(6500,-3700,r=90,arrivalDirection={'x':-1,'y':0}),
}
SPAWN=at(-5940,4260,area='01')
CAVES=[
 at(-6280,-1440,id='sunken-court',name='沉根洞口',area='05',caveId='rootwater-tunnel',caveName='根下暗河',seed=81401,exitName='沉水旧院',approach=point(-6120,-1290)),
 at(5960,-1100,id='hollow-corridor',name='空木洞口',area='11',caveId='rootwater-tunnel',caveName='根下暗河',seed=81401,exitName='枯木回廊',approach=point(5790,-970)),
 at(-200,-1080,id='island-hollow',name='湿林洞口',area='15',caveId='moss-vault',caveName='苔影地窟',seed=81402,exitName='河心湿林',approach=point(-120,-880)),
]
CHESTS=[
 ('moon-moss','月苔藏匣','16',-3200,4870),('reed-cache','芦苇旧箱','02',-4000,3210),
 ('root-cache','根隙藏匣','04',-3700,230),('spore-hoard','巢泽遗物','06',-6240,-3900),
 ('north-bank','石垒补给','08',-820,-4610),('mud-islet','泥洲遗箱','09',1930,-3420),
 ('hollow-log','枯木藏匣','11',5580,-190),('old-stockade','遗寨旧箱','12',3640,840),
 ('sunken-altar','沉坛遗物','13',4640,4110),('island-cache','湿林秘藏','15',900,-490),
]

def build():
    areas=[];shapes=[];by_id={}
    for id,name,(cx,cy),kind,material,offsets in ROOMS:
        shape=Polygon(natural_ring([(cx+x,cy+y) for x,y in offsets],reach=165)).buffer(0)
        assert shape.geom_type=='Polygon' and shape.contains(Point(cx,cy)), id
        assert BOUNDS.covers(shape),f'{id} leaves map'
        areas.append({'id':id,'name':name,'center':point(cx,cy),'kind':kind,'material':material,'points':coordinates(shape.exterior)})
        shapes.append(shape);by_id[id]=shape
    for i,a in enumerate(shapes):
        for j,b in enumerate(shapes[i+1:],i+1):assert a.intersection(b).area<.1,f'Unplanned area join: {ROOMS[i][0]} / {ROOMS[j][0]}'
    passages=[];corridors=[]
    for id,source,target,width,kind,middle in LINKS:
        raw=[CENTERS[source],*middle,*([CENTERS[target]] if target else [])]
        spine=natural_route(raw,reach=160) if kind not in ('bridge','exit') else raw
        shape=LineString(spine).buffer(width/2,quad_segs=8)
        assert shape.geom_type=='Polygon',id
        passages.append({'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coordinates(shape.exterior),'waypoints':[point(*p) for p in spine]})
        corridors.append(shape)
        if id in DECKS:passages[-1]['deck']=[point(*p) for p in DECKS[id]]
    walk=unary_union([*shapes,*corridors]).buffer(0)
    assert walk.geom_type=='Polygon' and BOUNDS.covers(walk),'Disconnected or out-of-map ground'

    basin_points=[(-800,5300),(250,5300),(800,4500),(900,3600),(1300,2400),(2200,2000),(3700,2000),(4400,1450),(4050,650),(3150,100),(2500,-550),(2200,-1900),(2100,-2800),(1600,-3650),(1000,-4850),(550,-5250),(-500,-5250),(-800,-4400),(-1000,-3400),(-1700,-2350),(-2300,-1750),(-3900,-1400),(-4700,-600),(-4450,100),(-3350,600),(-2500,850),(-2050,1500),(-1600,2450),(-1200,3500)]
    basin=Polygon(natural_ring(basin_points,reach=180)).buffer(0)
    branches=[
        ([(-1500,1650),(-2750,1850),(-3650,2180),(-4300,2650)],270),
        ([(1800,-2200),(2800,-1800),(3650,-1800),(4200,-2260)],300),
        ([(350,4250),(1450,4790),(2650,4930),(3500,4820)],220),
    ]
    basin=unary_union([basin,*[LineString(natural_route(points,reach=160)).buffer(width,quad_segs=12) for points,width in branches]])
    from shapely.affinity import scale
    side_pools=[scale(Point(-4380,-3120).buffer(1,quad_segs=12),570,440),scale(Point(6220,1930).buffer(1,quad_segs=12),540,650)]
    basin=unary_union([basin,*side_pools])
    # Local side pools connect the whole basin visually without creating
    # invisible solid shore obstacles. The actual land mask stays authoritative.
    water=basin.difference(walk).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    assert water.is_valid and high.is_valid
    encounters=[]
    placements=[
      ('02','combat',0,(-2980,3000)),('03','combat',1,(-6100,700)),
      ('04','guard',2,(-3440,-150)),('05','combat',2,(-5420,-1100)),
      ('07','guard',3,(-3230,-2330)),('08','combat',2,(-2210,-4240)),
      ('09','guard',3,(1630,-2670)),('10','combat',3,(4070,-3200)),
      ('11','combat',2,(5450,-1720)),('11','combat',2,(5090,-320)),
      ('12','guard',3,(3650,590)),('13','combat',3,(4570,3180)),
      ('14','combat',1,(1790,3930)),('15','combat',2,(580,-850)),
      ('06','boss',4,(-5650,-3830)),('10','boss',4,(4690,-3200)),
    ]
    for n,(area,kind,tier,(x,y)) in enumerate(placements):
        e=at(x,y,id=f'clearing:marsh:{area}:{n}',area=area,r=205 if kind=='boss' else 135,kind=kind,tier=tier)
        if kind=='guard':e.update(count=4,strength=1.4,name='湿地守卫')
        elif kind=='combat':e['count']=5 if tier<3 else 6
        else:e.update(bossKind='broodmother' if area=='06' else 'deepcaller',name='孢雾母巢' if area=='06' else '溺钟守望者')
        encounters.append(e)
    chests=[at(x,y,id=id,name=name,area=area,approach=point(x,y+80)) for id,name,area,x,y in CHESTS]
    landmarks={'spawn':SPAWN,
        'exitRuins':at(6500,-3700,area='10',kind='exit',target=2),
        'exitRift':at(-6500,4770,area='01',kind='exit',target=9)}
    for cave in CAVES:landmarks['cave-'+cave['id']]={k:v for k,v in cave.items() if k in ('x','y','area')}|{'kind':'cave'}
    for e in encounters:
        if e['kind']=='boss':landmarks['boss'+e['area']]={k:e[k] for k in ('x','y','area')}|{'kind':'boss'}
    for c in chests:landmarks['treasure-'+c['id']]={k:c[k] for k in ('x','y','area')}|{'kind':'treasure'}
    patches=[]
    for n,(area,x,y,rx,ry) in enumerate([
        ('01',-5350,3550,240,170),('02',-4060,3700,260,200),('03',-6050,2000,280,200),
        ('04',-2700,300,350,240),('05',-6030,-1900,220,160),('06',-5240,-4150,250,200),
        ('07',-2470,-3040,250,300),('08',-520,-4340,270,150),('09',1820,-3830,250,230),
        ('10',5130,-3080,230,190),('11',5760,-70,260,290),('12',2660,1410,220,280),
        ('13',5500,3860,280,220),('14',1380,3100,290,220),('15',400,-150,290,240),
        ('16',-3280,4880,290,140)]):
        p=Point(x,y).buffer(1,quad_segs=8)
        p=scale(p,xfact=rx,yfact=ry,origin=(x,y)).intersection(by_id[area])
        for j,ring in enumerate(rings(p,'patch')):
            if ring['hole']:continue
            patches.append({'id':f'marsh-brush:{n}:{j}','kind':'sparse','center':point(x,y),'x':x,'y':y,'rx':rx,'ry':ry,'angle':0,'density':.3,'points':ring['points']})
    layout={'kind':'rift-forest','worldId':'marsh','id':'marsh:1','name':'迷雾沼泽','revision':1,'artTheme':'marsh',
            'palette':{'ground':'#a2ab84','brush':'#91a36f','forest':'#365c48','ridge':'#738477','water':'#426f69','waterLight':'#799b83','bridge':'#a48c60'},
        'bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':SPAWN,'areas':areas,'passages':passages,
        'boundaries':rings(walk,'marsh-ground'),'solidBoundaries':rings(high,'marsh-high'),
        'lakes':[dict(r,kind='water') for r in rings(water,'marsh-water')],
        'landmarks':landmarks,'plan':PLAN,'encounters':encounters,'patches':patches,
        'interactions':{'caves':CAVES,'gates':[],'chests':chests}}
    protected=[SPAWN,*PLAN.values(),*encounters,*CAVES,*chests,*[s['approach'] for s in [*CAVES,*chests]],*[a['center'] for a in areas]]
    # Broad landforms grow inward from the actual outer boundary. Their tips
    # remain rounded, and they cannot pinch a protected route or target body.
    protected_shape=unary_union([
        # The central courtyard remains open independently of the prison
        # situated in its southwest pocket.
        Point(3140,1120).buffer(305),
        *[Point(pair(p)).buffer(p.get('r',100)+65) for p in protected],
        *[LineString([pair(q) for q in p['waypoints']]).buffer(p['width']/2+55) for p in passages],
    ])
    landforms=[];landform_shapes=[]
    for id in ['03','04','05','06','07','09','11','12','13','14','06','11','14','09']:
        area=by_id[id];boundary=area.exterior;choices=[]
        for n in range(72):
            s=boundary.length*n/72;p=boundary.interpolate(s);a=boundary.interpolate((s-10)%boundary.length);b=boundary.interpolate((s+10)%boundary.length)
            dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length
            if not area.contains(Point(p.x+nx*20,p.y+ny*20)):nx,ny=-nx,-ny
            for depth in [450,650,850]:
                for radius in [210,290,360]:
                    root=LineString([(p.x-nx*200,p.y-ny*200),(p.x+nx*depth,p.y+ny*depth)]).buffer(radius,quad_segs=12)
                    if root.intersects(protected_shape):continue
                    cut=walk.intersection(root);size=cut.area
                    if size<100000:continue
                    candidate=walk.difference(root)
                    if candidate.geom_type!='Polygon' or candidate.buffer(-55).geom_type!='Polygon':continue
                    choices.append((size,root,candidate))
        assert choices,f'No broad landform pocket in {id}'
        size,root,walk=max(choices,key=lambda item:item[0]);landforms.append((id,size));landform_shapes.append(root)
    water=basin.difference(unary_union([walk,*landform_shapes])).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    layout['boundaries']=rings(walk,'marsh-ground');layout['solidBoundaries']=rings(high,'marsh-high')
    layout['lakes']=[dict(r,kind='water') for r in rings(water,'marsh-water')]
    # Inner landforms are rooted woodland/stone, not submerged obstacles.
    # Remove them from the water source even when a side bay passes nearby.
    # Their shared high outline will receive the regular edge scenery.
    print('Inset landforms:',','.join(f'{id}:{round(size)}' for id,size in landforms),file=sys.stderr)
    surfaces=[]
    for n,(area,wanted,rx,ry,shape,angle) in enumerate([
        ('03',(-5550,2070),100,68,'kidney',.4),
        ('07',(-2250,-3030),130,80,'bays',-.3),
        ('13',(5550,3810),120,90,'kidney',.8)]):
        radius=max(rx,ry)+49
        safe=by_id[area].intersection(walk).buffer(-radius)
        for p in protected:safe=safe.difference(Point(pair(p)).buffer(p.get('r',90)+radius))
        for p in passages:safe=safe.difference(LineString([pair(q) for q in p['waypoints']]).buffer(p['width']/2+radius))
        minx,miny,maxx,maxy=by_id[area].bounds
        candidates=[(x,y) for x in range(round(minx),round(maxx)+1,25) for y in range(round(miny),round(maxy)+1,25) if safe.contains(Point(x,y))]
        assert candidates,f'No shallow pool pocket {area}'
        x,y=min(candidates,key=lambda p:(p[0]-wanted[0])**2+(p[1]-wanted[1])**2)
        surfaces.append(at(x,y,id=f'marsh-pool:{n}',type='mud',kind='water',shape=shape,rx=rx,ry=ry,angle=angle,seed=.17+n*.23,scale=rx/80,island=False))
    layout['surfaces']=surfaces
    validate_geometry(layout,walk,by_id)
    return layout,walk,water

def validate_geometry(layout,walk,by_id):
    # Whole-body clearance, not just a point-in-polygon check. One connected
    # eroded component must contain every route endpoint and interaction.
    free=walk.buffer(-55)
    assert free.geom_type=='Polygon','55-unit body cannot traverse the entire map'
    for p in layout['passages']:
        line=LineString([pair(q) for q in p['waypoints']])
        assert walk.buffer(.03).covers(line.buffer(70)),f"Route clearance {p['id']}"
    targets=[('spawn',layout['spawn'],155)]
    targets.extend((key,p,min(p['r'],150)) for key,p in layout['plan'].items())
    targets.extend((p['id'],p,65) for group in layout['interactions'].values() for p in group)
    targets.extend((p['id']+':approach',p['approach'],55) for group in layout['interactions'].values() for p in group if 'approach' in p)
    targets.extend((p['id'],p,65 if p['kind']=='boss' else 45) for p in layout['encounters'])
    for id,p,r in targets:
        assert walk.covers(Point(pair(p)).buffer(r)),f'Target clearance {id}'
        assert free.contains(Point(pair(p))),f'Target disconnected {id}'
    for area in layout['areas']:
        assert by_id[area['id']].covers(Point(pair(area['center'])).buffer(90)),f"Area anchor {area['id']}"
    assert .25<=walk.area/BOUNDS.area<=.35,f'Walk fraction {walk.area/BOUNDS.area:.3f}'

def preview(layout,walk,water,out):
    from xml.sax.saxutils import escape
    out.mkdir(parents=True,exist_ok=True)
    def svg_path(shape):
        chunks=[]
        for ring in rings(shape,'preview'):
            chunks.append('M'+' L'.join(f"{p['x']},{p['y']}" for p in ring['points'])+' Z')
        return ' '.join(chunks)
    body=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1180" viewBox="-7400 -5600 14800 12128">',
          '<rect x="-7400" y="-5600" width="14800" height="12128" fill="#253f39"/>',
          f'<path d="{svg_path(water)}" fill="#447b83" fill-rule="evenodd" stroke="#719e9c" stroke-width="34"/>',
          f'<path d="{svg_path(walk)}" fill="#c4c9a1" fill-rule="evenodd" stroke="#879f73" stroke-width="35"/>']
    for p in layout['passages']:
        if 'deck' in p:
            a,b=p['deck'];body.append(f'<line x1="{a["x"]}" y1="{a["y"]}" x2="{b["x"]}" y2="{b["y"]}" stroke="#af8752" stroke-width="{p["width"]}"/>')
    for area in layout['areas']:
        p=area['center'];body.append(f'<text x="{p["x"]}" y="{p["y"]+55}" text-anchor="middle" font-family="Noto Sans CJK SC,sans-serif" font-size="155" font-weight="bold" fill="#283e35">{escape(area["id"]+" "+area["name"])}</text>')
    for p in layout['encounters']:
        if p['kind']=='boss':body.append(f'<circle cx="{p["x"]}" cy="{p["y"]-180}" r="85" fill="#bb5e53" stroke="#f1d9ae" stroke-width="20"/>')
    for p in layout['interactions']['caves']:body.append(f'<path d="M{p["x"]-80},{p["y"]+50} a80,100 0 0 1 160,0 z" fill="#233c36" stroke="#b4aa80" stroke-width="25"/>')
    for p in layout['interactions']['chests']:body.append(f'<rect x="{p["x"]-55}" y="{p["y"]-45}" width="110" height="90" fill="#dfbc70" stroke="#836946" stroke-width="20"/>')
    body.append('<text x="-6800" y="5900" font-family="Noto Sans CJK SC,sans-serif" font-size="210" fill="#e2e7c9">迷雾沼泽 · 布局预览</text>')
    body.append(f'<text x="-6800" y="6220" font-family="Noto Sans CJK SC,sans-serif" font-size="150" fill="#becbb2">浅色：可行走干地　深绿：根林阻隔　蓝绿：深水　褐色：桥梁　红点：领主　黄色：藏匣　14400×10800 · 可行走 {walk.area/BOUNDS.area:.1%}</text>')
    body.append('</svg>');(out/'marsh-layout.svg').write_text('\n'.join(body))
    (out/'marsh-layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))
    (out/'marsh-summary.json').write_text(json.dumps({'walkFraction':walk.area/BOUNDS.area,'areas':len(layout['areas']),'passages':len(layout['passages']),'surfaceCycles':len([p for p in layout['passages'] if p['to']])-len(layout['areas'])+1,'waterRings':len(layout['lakes'])},indent=2))

def write_world(layout):
    path=ROOT/'dist/config/worlds.json';source=path.read_text();decoder=json.JSONDecoder()
    start=source.index('[',source.index('"definitions"'))+1
    while True:
        while source[start].isspace() or source[start]==',':start+=1
        if source[start]==']':raise ValueError('Missing marsh world')
        w,end=decoder.raw_decode(source,start)
        if w['id']=='marsh':break
        start=end
    w['authored']=layout
    # The macro source is still a valid configuration record for shared tools;
    # authored maps read the exact baked geometry above at runtime.
    w['layout']={'paths':[[[p['x'],p['y']] for p in route['waypoints']] for route in layout['passages'] if route['to']],
                 'patches':[['brush',p['x'],p['y'],p['rx'],p['ry'],0,.3] for p in layout['patches']],
                 'lakes':[],'ridges':[],'bossKind':'broodmother'}
    replacement=json.dumps(w,ensure_ascii=False,indent=2)
    replacement='\n'.join(('    '+line if i else line) for i,line in enumerate(replacement.splitlines()))
    path.write_text(source[:start]+replacement+source[end:])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-dir',type=Path);parser.add_argument('--write',action='store_true');args=parser.parse_args()
    layout,walk,water=build()
    if args.preview_dir:preview(layout,walk,water,args.preview_dir)
    if args.write:write_world(layout)
    print(json.dumps({'areas':len(layout['areas']),'passages':len(layout['passages']),'walkFraction':round(walk.area/BOUNDS.area,4),'waterRings':len(layout['lakes']),'written':args.write},ensure_ascii=False))

if __name__=='__main__':main()
