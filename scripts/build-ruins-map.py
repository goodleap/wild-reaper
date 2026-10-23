#!/usr/bin/env python3
"""Bake the shared Ruins terrain and navigation graph (offline Shapely 2.x)."""
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

ROOT = Path(__file__).resolve().parent.parent
BOUNDS = box(-7200, -5400, 7200, 5400)
def point(x, y): return {'x': round(x, 2), 'y': round(y, 2)}
def pair(p): return p['x'], p['y']
def at(x, y, **extra): return {**point(x,y), **extra}
def coordinates(ring): return [point(x,y) for x,y in list(ring.coords)[:-1]]
def rings(shape, prefix):
    parts = [shape] if shape.geom_type == 'Polygon' else list(shape.geoms)
    result = []
    for i,p in enumerate(sorted(parts,key=lambda p:-p.area)):
        p=orient(p)
        result.append({'id':f'{prefix}:{i}','points':coordinates(p.exterior),'hole':False})
        result.extend({'id':f'{prefix}:{i}:hole:{n}','points':coordinates(h),'hole':True} for n,h in enumerate(p.interiors))
    return result

# Regular masonry courts alternate with hooked root-filled courtyards. Long
# missing wings and walls survive as actual impassable ground between them.
ROOMS = [
 ('01','南缘考察营地',(-2200,4100),'camp','forest',[(-850,-550),(-500,-850),(350,-750),(950,-300),(800,400),(220,780),(-600,700),(-900,180)]),
 ('02','断柱前庭',(-800,1800),'ruins','rock',[(-1000,-700),(-400,-900),(900,-850),(1150,-250),(1000,700),(350,850),(-450,700),(-1100,250)]),
 ('03','苔阶残市',(-4300,3300),'ruins','rock',[(-850,-650),(350,-950),(900,-650),(850,-100),(1150,300),(450,750),(-250,900),(-900,500)]),
 ('04','根缠西院',(-5600,900),'grove','forest',[(-1050,-800),(-350,-1250),(450,-1000),(900,-600),(720,-100),(1100,650),(400,1150),(-350,850),(-1000,1000),(-1050,300)]),
 ('05','坍塌藏书院',(-3500,300),'ruins','rock',[(-900,-1100),(300,-1100),(1050,-650),(850,-100),(1150,450),(500,900),(-450,1050),(-850,500),(-650,-50),(-1050,-400)]),
 ('06','沉没回廊',(1700,2800),'ruins','rock',[(-1050,-650),(-350,-1050),(500,-850),(950,-300),(1050,350),(600,900),(-150,1100),(-850,800),(-1150,100)]),
 ('07','东岸旧工坊',(4700,3600),'village','rock',[(-850,-950),(400,-1000),(1100,-650),(1150,100),(800,700),(150,1000),(-650,950),(-1100,350)]),
 ('08','双渠庭院',(4300,700),'ruins','rock',[(-950,-1050),(-250,-1050),(300,-700),(950,-850),(1250,-250),(1000,500),(450,950),(-500,1050),(-1050,350)]),
 ('09','东壁藏殿',(5400,-2100),'fortress','rock',[(-1100,-900),(-400,-1150),(350,-1000),(1000,-700),(1000,500),(600,1100),(-250,950),(-950,550),(-800,-100)]),
 ('10','誓碑长廊',(2100,-1200),'ruins','rock',[(-1150,-600),(-600,-1000),(350,-1000),(950,-600),(1100,200),(550,900),(-350,1100),(-1100,600)]),
 ('11','失落圣殿',(-500,-2200),'fortress','rock',[(-1200,-850),(-450,-1150),(500,-1050),(1200,-700),(1200,350),(650,900),(-250,1100),(-950,850),(-1250,100)]),
 ('12','北坛望台',(-300,-4300),'fortress','rock',[(-1400,-600),(-500,-850),(650,-700),(1350,-300),(1250,400),(500,700),(-450,550),(-1300,700)]),
 ('13','断脊祭径',(-3500,-2500),'pass','rock',[(-1100,-650),(-500,-1050),(500,-1000),(1050,-350),(950,400),(300,900),(-400,1150),(-1100,700),(-850,100)]),
 ('14','苍根禁苑',(-5650,-3600),'grove','forest',[(-1050,-700),(-350,-1150),(400,-1000),(950,-450),(1150,150),(650,800),(-150,1100),(-800,650),(-1100,50)]),
 ('15','星井秘庭',(3100,-4400),'secret','rock',[(-950,-500),(-150,-800),(650,-650),(1050,-150),(850,450),(100,750),(-750,650),(-1100,100)]),
 ('16','西墙暗院',(-6100,3300),'secret','forest',[(-650,-450),(100,-650),(600,-250),(550,350),(0,700),(-600,300)]),
]
CENTERS={id:c for id,_,c,*_ in ROOMS}
LINKS = [
 ('r01','01','02',270,'trail',[(-1600,3050),(-1200,2800)]),
 ('r02','01','03',250,'trail',[(-3300,4300)]),
 ('r03','03','04',240,'trail',[(-5100,2500),(-6100,2200)]),
 ('r04','03','05',230,'trail',[(-3800,2200),(-3600,1650)]),
 ('r05','04','05',250,'trail',[(-4600,1050),(-4450,800)]),
 ('r06','05','02',240,'trail',[(-2300,700),(-1900,1300)]),
 ('r07','02','06',270,'trail',[(400,1850),(600,2600)]),
 ('r08','06','07',250,'bridge',[(2650,2800),(2800,2800),(3400,2800),(3700,3000)]),
 ('r09','07','08',240,'trail',[(5300,2250),(5000,1950)]),
 ('r10','08','09',250,'trail',[(5550,-400),(5950,-700)]),
 ('r11','08','10',240,'bridge',[(3500,150),(3200,150),(2600,150),(2350,-250)]),
 ('r12','10','11',250,'bridge',[(1300,-1450),(1050,-1450),(450,-1450),(150,-1800)]),
 ('r13','02','11',240,'trail',[(-1450,400),(-1400,-600),(-1400,-1100)]),
 ('r14','05','13',230,'trail',[(-2700,-1000),(-2900,-1400)]),
 ('r15','13','11',240,'trail',[(-2200,-2450)]),
 ('r16','13','14',230,'trail',[(-4700,-2500),(-4900,-2900)]),
 ('r17','14','04',230,'trail',[(-6450,-2050),(-6500,-600)]),
 ('r18','11','12',250,'trail',[(-1100,-3550)]),
 ('r19','13','12',230,'trail',[(-2400,-3700),(-1900,-4200)]),
 ('r20','09','15',210,'secret',[(4800,-3500),(4500,-4350)]),
 ('r21','03','16',180,'secret',[(-5350,3900)]),
 ('exit-marsh','04',None,260,'exit',[(-6660,1000)]),
 ('exit-rift','01',None,260,'exit',[(-1800,5000)]),
 ('exit-volcano','09',None,260,'exit',[(6450,-2600)]),
 ('exit-city','07',None,260,'exit',[(6500,3300)]),
]
DECKS={'r08':((2800,2800),(3400,2800)), 'r11':((3200,150),(2600,150)), 'r12':((1050,-1450),(450,-1450))}
SPAWN=at(-2350,4350,area='01')
PLAN={
 'merchant':at(-1820,4270,r=105), 'supply':at(-4080,3430,r=125),
 'occupied':at(4900,-1800,r=225), 'castle':at(-480,-2400,r=360),
 'hunt':at(-3500,-2700,r=280), 'rescue':at(-5900,1100,r=240),
 'rune':at(2950,-4350,r=185), 'rescue-warden':at(4800,3300,r=240),
 'dogcamp':at(-2800,3900,r=115), 'owlroost':at(4800,900,r=240),
 'golemaltar':at(-3650,300,r=270), 'stonevault':at(-200,-4270,r=240),
 'portal:1':at(-6660,1000,r=90,arrivalDirection=point(1,0)),
 'portal:9':at(-1800,5000,r=90,arrivalDirection=point(0,-1)),
 'portal:7':at(6450,-2600,r=90,arrivalDirection=point(-1,0)),
 'portal:4':at(6500,3300,r=90,arrivalDirection=point(-1,0)),
}
CAVES=[
 at(-4000,-100,id='archive-stair',name='藏书院地窖',area='05',caveId='buried-aqueduct',caveName='埋没水道',seed=81501,exitName='坍塌藏书院',approach=point(-3860,80)),
 at(5800,-1800,id='sanctum-stair',name='藏殿地窖',area='09',caveId='buried-aqueduct',caveName='埋没水道',seed=81501,exitName='东壁藏殿',approach=point(5620,-1680)),
 at(3500,-4500,id='starwell-stair',name='星井地窖',area='15',caveId='starwell-vault',caveName='星井地宫',seed=81502,exitName='星井秘庭',approach=point(3340,-4320)),
]
CHESTS=[
 ('west-cache','暗院藏匣','16',-6200,3460),('market-cache','残市旧箱','03',-4650,3650),
 ('root-cache','根隙藏匣','04',-6000,300),('archive-cache','书院遗箱','05',-3000,500),
 ('sunken-cache','回廊遗物','06',1900,3400),('workshop-cache','工坊旧箱','07',5200,4000),
 ('canal-cache','双渠藏匣','08',3900,1000),('tablet-cache','誓碑遗物','10',2350,-1650),
 ('grove-cache','禁苑秘藏','14',-6050,-3850),('north-cache','望台藏匣','12',350,-4470),
]

def build():
    areas=[];shapes=[];by_id={}
    for id,name,(cx,cy),kind,material,offsets in ROOMS:
        raw=[(cx+x,cy+y) for x,y in offsets]
        # Stone foundations keep their intentional straight walls. Rounded
        # corners and root contours are baked into the collision outline.
        shape=(Polygon(natural_ring(raw,reach=135)) if material=='forest' else Polygon(raw).buffer(58,quad_segs=5).buffer(-58,quad_segs=5)).buffer(0)
        assert shape.geom_type=='Polygon' and shape.contains(Point(cx,cy)),id
        assert BOUNDS.covers(shape),f'{id} leaves map'
        areas.append({'id':id,'name':name,'center':point(cx,cy),'kind':kind,'material':material,'points':coordinates(shape.exterior)})
        shapes.append(shape);by_id[id]=shape
    for i,a in enumerate(shapes):
        for j,b in enumerate(shapes[i+1:],i+1):assert a.intersection(b).area<.1,f'Unplanned room join: {ROOMS[i][0]} / {ROOMS[j][0]}'
    passages=[];corridors=[]
    for id,source,target,width,kind,middle in LINKS:
        raw=[CENTERS[source],*middle,*([CENTERS[target]] if target else [])]
        spine=natural_route(raw,reach=140) if kind not in ('bridge','exit') else raw
        shape=LineString(spine).buffer(width/2,quad_segs=8)
        passages.append({'id':id,'from':source,'to':target,'width':width,'kind':kind,'points':coordinates(shape.exterior),'waypoints':[point(*p) for p in spine]})
        corridors.append(shape)
        if id in DECKS:passages[-1]['deck']=[point(*p) for p in DECKS[id]]
    walk=unary_union([*shapes,*corridors]).buffer(0)
    assert walk.geom_type=='Polygon' and BOUNDS.covers(walk),'Disconnected ground'
    placements=[
      ('02','combat',0,(-700,2150)),('03','combat',1,(-4500,2900)),
      ('04','combat',1,(-5700,300)),('05','guard',2,(-2880,-180)),
      ('06','guard',2,(2100,2490)),('07','combat',1,(4300,4050)),
      ('08','combat',2,(4100,280)),('09','guard',3,(5350,-2450)),
      ('10','guard',3,(1780,-1150)),('11','combat',3,(-1000,-1800)),
      ('12','combat',3,(-900,-4350)),('13','combat',2,(-3220,-2050)),
      ('14','boss',4,(-5550,-3550)),('11','boss',4,(100,-1900)),
      ('15','combat',3,(2850,-4640)),('16','combat',1,(-6000,3200)),
    ]
    encounters=[]
    for n,(area,kind,tier,(x,y)) in enumerate(placements):
        e=at(x,y,id=f'clearing:ruins:{area}:{n}',area=area,r=205 if kind=='boss' else 135,kind=kind,tier=tier)
        if kind=='guard':e.update(count=4,strength=1.4,name='遗迹守卫')
        elif kind=='combat':e['count']=5 if tier<3 else 6
        else:e.update(bossKind='ancient' if area=='14' else 'bloom',name='苍根守望者' if area=='14' else '古殿守望者')
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
    protected_shape=unary_union([
      *[Point(pair(p)).buffer(p.get('r',90)+65) for p in protected],
      *[LineString([pair(q) for q in p['waypoints']]).buffer(p['width']/2+55) for p in passages]])
    # Broken long wings intrude into a court. They are part of the shared
    # terrain mask, not decorative wall rows with overlapping colliders.
    obstructions=[]
    for id in ['02','03','04','05','06','07','08','09','10','11','12','13','14','15']:
        area=by_id[id];boundary=area.exterior;choices=[]
        for n in range(60):
            s=boundary.length*n/60;p=boundary.interpolate(s);a=boundary.interpolate((s-10)%boundary.length);b=boundary.interpolate((s+10)%boundary.length)
            dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length
            if not area.contains(Point(p.x+nx*20,p.y+ny*20)):nx,ny=-nx,-ny
            for depth in [320,500,700]:
                for radius in [125,175,230]:
                    root=LineString([(p.x-nx*180,p.y-ny*180),(p.x+nx*depth,p.y+ny*depth)]).buffer(radius,quad_segs=6)
                    if root.intersects(protected_shape):continue
                    size=walk.intersection(root).area
                    if size<65000:continue
                    candidate=walk.difference(root)
                    if candidate.geom_type!='Polygon' or candidate.buffer(-55).geom_type!='Polygon':continue
                    choices.append((size,root,candidate))
        if choices:
            size,root,walk=max(choices,key=lambda item:item[0]);obstructions.append(root)
    assert len(obstructions)>=10,'Insufficient broken court wings'
    river=LineString(natural_route([(3100,5150),(3050,4000),(3100,2800),(3050,1700),(2900,150),(1700,-500),(750,-1450),(1400,-2800),(2900,-3300),(3100,-5100)],reach=180)).buffer(355,quad_segs=10)
    pools=[scale(Point(1500,4000).buffer(1,quad_segs=10),680,390),scale(Point(4250,-650).buffer(1,quad_segs=10),630,340)]
    water=unary_union([river,*pools]).intersection(BOUNDS).difference(unary_union([walk,*obstructions])).buffer(0)
    high=unary_union([walk,water]).buffer(0)
    patches=[]
    for n,area in enumerate(areas):
        shape=by_id[area['id']].intersection(walk).difference(protected_shape)
        if shape.is_empty:continue
        candidates=list(shape.geoms) if shape.geom_type=='MultiPolygon' else [shape]
        candidate=max(candidates,key=lambda q:q.area);p=candidate.representative_point()
        patch=scale(Point(p.x,p.y).buffer(1,quad_segs=7),230,160).intersection(candidate)
        if patch.is_empty:continue
        for j,r in enumerate(rings(patch,'patch')):
            if r['hole']:continue
            center=Polygon([pair(q) for q in r['points']]).representative_point()
            patches.append({'id':f'ruins-moss:{n}:{j}','kind':'grove','center':point(center.x,center.y),'x':round(center.x,2),'y':round(center.y,2),'rx':230,'ry':160,'density':.35,'points':r['points']})
    layout={'kind':'rift-forest','worldId':'ruins','id':'ruins:1','name':'失落遗迹','revision':1,'artTheme':'ruins',
      'palette':{'ground':'#ded7b8','brush':'#a1b47d','forest':'#4c654c','ridge':'#8c9780','water':'#568e89','waterLight':'#8bb3a0','bridge':'#c7c8ad'},
      'bounds':{'minX':-7200,'minY':-5400,'maxX':7200,'maxY':5400},'spawn':SPAWN,'areas':areas,'passages':passages,
      'boundaries':rings(walk,'ruins-ground'),'solidBoundaries':rings(high,'ruins-high'),
      'lakes':[dict(r,kind='water') for r in rings(water,'ruins-water')],
      'landmarks':landmarks,'plan':PLAN,'encounters':encounters,'patches':patches,
      'interactions':{'caves':CAVES,'gates':[],'chests':chests}}
    validate_geometry(layout,walk,water,by_id)
    return layout,walk,water

def validate_geometry(layout,walk,water,by_id):
    free=walk.buffer(-55)
    assert free.geom_type=='Polygon','55-unit body cannot traverse the whole map'
    for p in layout['passages']:
        line=LineString([pair(q) for q in p['waypoints']])
        assert walk.buffer(.03).covers(line.buffer(70)),f"Route clearance {p['id']}"
        if 'deck' in p:
            a,b=map(pair,p['deck']);dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);nx,ny=-dy/length,dx/length
            center=((a[0]+b[0])/2,(a[1]+b[1])/2)
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
    assert .24<=walk.area/BOUNDS.area<=.36,f'Walk fraction {walk.area/BOUNDS.area:.3f}'
    assert len(layout['boundaries'])<=64 and len(layout['solidBoundaries'])<=64 and len(layout['lakes'])<=32

def preview(layout,walk,water,out):
    from xml.sax.saxutils import escape
    out.mkdir(parents=True,exist_ok=True)
    def svg_path(shape):return ' '.join('M'+' L'.join(f"{p['x']},{p['y']}" for p in r['points'])+' Z' for r in rings(shape,'preview'))
    body=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="-7400 -5600 14800 11922">','<rect x="-7400" y="-5600" width="14800" height="11922" fill="#5a6555"/>',f'<path d="{svg_path(water)}" fill="#527e82" fill-rule="evenodd" stroke="#8bada6" stroke-width="24"/>',f'<path d="{svg_path(walk)}" fill="#d9d2af" fill-rule="evenodd" stroke="#a6b190" stroke-width="25"/>']
    for p in layout['passages']:
        if 'deck' in p:
            a,b=p['deck'];body.append(f'<line x1="{a["x"]}" y1="{a["y"]}" x2="{b["x"]}" y2="{b["y"]}" stroke="#b8b4a1" stroke-width="{p["width"]}"/>')
    for area in layout['areas']:
        p=area['center'];body.append(f'<text x="{p["x"]}" y="{p["y"]+55}" text-anchor="middle" font-family="Noto Sans CJK SC,sans-serif" font-size="150" font-weight="bold" fill="#394b42">{escape(area["id"]+" "+area["name"])}</text>')
    for p in layout['encounters']:
        if p['kind']=='boss':body.append(f'<circle cx="{p["x"]}" cy="{p["y"]-180}" r="85" fill="#b76654" stroke="#f0dfb1" stroke-width="20"/>')
    for p in layout['interactions']['caves']:body.append(f'<path d="M{p["x"]-80},{p["y"]+50} a80,100 0 0 1 160,0 z" fill="#334c43" stroke="#b7ac87" stroke-width="25"/>')
    for p in layout['interactions']['chests']:body.append(f'<rect x="{p["x"]-55}" y="{p["y"]-45}" width="110" height="90" fill="#dfbc70" stroke="#836946" stroke-width="20"/>')
    body.extend(['<text x="-6800" y="5850" font-family="Noto Sans CJK SC,sans-serif" font-size="210" fill="#e6e4cf">失落遗迹 · 布局预览</text>',f'<text x="-6800" y="6180" font-family="Noto Sans CJK SC,sans-serif" font-size="140" fill="#d2d6bb">浅色：可行走庭院与通道　深色：残墙、坍塌石翼与根林　蓝绿：深水　红点：领主　14400×10800 · 可行走 {walk.area/BOUNDS.area:.1%}</text>','</svg>'])
    (out/'ruins-layout.svg').write_text('\n'.join(body))
    (out/'ruins-layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))

def write_world(layout):
    path=ROOT/'dist/config/worlds.json';source=path.read_text();decoder=json.JSONDecoder();start=source.index('[',source.index('"definitions"'))+1
    while True:
        while source[start].isspace() or source[start]==',':start+=1
        if source[start]==']':raise ValueError('Missing ruins world')
        w,end=decoder.raw_decode(source,start)
        if w['id']=='ruins':break
        start=end
    w['authored']=layout
    w['colors'].update(ground='#ded7b8',light='#e0d8b6',dark='#6d7764',accent='#d8c68e',mist='#ddd9bf',grass='#91a077',stone='#aaa892')
    w['art']['coast']={'deep':'#3d716d','sea':'#568e89','shallow':'#8bb3a0','sand':'#c9c7a7','grain':'#e3ddbd','edge':'#a1b2a0','fringe':'#6d8766'}
    w['art']['mapCoast']={'land':'#c7c8ad','sand':'#d8d3b3','sea':'#3d716d','shallow':'#568e89'}
    w['layout']={'paths':[[[p['x'],p['y']] for p in route['waypoints']] for route in layout['passages'] if route['to']], 'patches':[['brush',p['x'],p['y'],p['rx'],p['ry'],0,.3] for p in layout['patches']], 'lakes':[],'ridges':[],'bossKind':'bloom'}
    replacement=json.dumps(w,ensure_ascii=False,indent=2);replacement='\n'.join(('    '+line if i else line) for i,line in enumerate(replacement.splitlines()))
    path.write_text(source[:start]+replacement+source[end:])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-dir',type=Path);parser.add_argument('--write',action='store_true');args=parser.parse_args()
    layout,walk,water=build()
    if args.preview_dir:preview(layout,walk,water,args.preview_dir)
    if args.write:write_world(layout)
    print(json.dumps({'areas':len(layout['areas']),'passages':len(layout['passages']),'walkFraction':round(walk.area/BOUNDS.area,4),'waterRings':len(layout['lakes']),'written':args.write},ensure_ascii=False))

if __name__=='__main__':main()
