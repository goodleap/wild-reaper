#!/usr/bin/env python3
"""Rebuild the authored moon expedition using only the Python standard library."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def point(x, y):
    return {'x': round(x, 3), 'y': round(y, 3)}

def rounded_polygon(vertices, radius=38, steps=4):
    result = []
    for i, (x, y) in enumerate(vertices):
        a, b = vertices[i-1], vertices[(i+1) % len(vertices)]
        da, db = math.dist((x,y), a), math.dist((x,y), b)
        trim = min(radius, da*.27, db*.27)
        start = (x+(a[0]-x)*trim/da, y+(a[1]-y)*trim/da)
        end = (x+(b[0]-x)*trim/db, y+(b[1]-y)*trim/db)
        for j in range(steps+1):
            t = j/steps
            result.append(point((1-t)**2*start[0]+2*(1-t)*t*x+t*t*end[0],
                                (1-t)**2*start[1]+2*(1-t)*t*y+t*t*end[1]))
    return result

def solid(id, kind, x, y, width, depth, height, seed):
    # Smooth, finite, reproducible footprints; exact extents are shared by art.
    points = []
    for i in range(32):
        angle = i*math.tau/32
        wobble = 1 + (.035 if kind == 'crater' else .07)*math.sin(angle*3+seed) + .025*math.cos(angle*5+seed*.7)
        points.append((math.cos(angle)*wobble, math.sin(angle)*wobble))
    minx,maxx = min(p[0] for p in points),max(p[0] for p in points)
    miny,maxy = min(p[1] for p in points),max(p[1] for p in points)
    polygon = [point(x-width/2+(px-minx)/(maxx-minx)*width,
                     y-depth/2+(py-miny)/(maxy-miny)*depth) for px,py in points]
    return dict(id=id,kind=kind,x=x,y=y,width=width,depth=depth,height=height,
                heightBand='low' if kind=='crater' else 'high',points=polygon,seed=seed)

def path(*points, width=96):
    return dict(width=width, points=[point(*p) for p in points])

def detail(kind, x, y, rx, ry):
    return dict(kind=kind,x=x,y=y,rx=rx,ry=ry)

outline = rounded_polygon([
    (430,350),(730,270),(910,70),(980,-150),(880,-390),(650,-500),
    (450,-590),(400,-620),(400,-700),(560,-770),(780,-900),(930,-1160),
    (870,-1390),(560,-1510),(120,-1550),(-30,-1580),(-30,-1660),
    (150,-1730),(570,-1790),(850,-1940),(940,-2160),(760,-2330),
    (530,-2380),(360,-2420),(360,-2510),(590,-2590),(640,-2760),(480,-2850),
    (20,-2850),(-200,-2760),(-160,-2600),(0,-2510),(0,-2420),
    (-500,-2350),(-800,-2190),(-900,-1990),(-820,-1800),(-620,-1700),
    (-390,-1660),(-390,-1580),(-650,-1520),(-900,-1390),(-980,-1120),
    (-900,-900),(-650,-770),(-250,-710),(40,-700),(40,-620),
    (-250,-550),(-580,-470),(-840,-330),(-950,-50),(-870,160),(-650,310),(-250,350)
])

solids = [
    solid('lander','equipment',-590,125,180,120,78,1),
    solid('landing-crater','crater',-470,-165,390,240,16,2),
    solid('landing-ridge','ridge',270,20,430,165,86,3),
    solid('landing-west-ridge','ridge',-455,-430,300,90,78,4),
    solid('landing-east-probe','wreck',665,-210,190,130,72,5),
    solid('landing-south-rock','ridge',-35,245,175,105,66,6),
    solid('great-crater','crater',-115,-1090,600,390,22,7),
    solid('western-scar','ridge',-800,-1035,170,260,90,8),
    solid('eastern-crater','crater',650,-955,170,130,15,9),
    solid('crater-north-ridge','ridge',-35,-1440,310,100,80,10),
    solid('survey-wreck','wreck',-540,-1445,170,95,65,11),
    solid('east-scar','ridge',735,-1330,160,140,83,12),
    solid('observatory-ridge','ridge',280,-1845,300,150,88,13),
    solid('observatory-crater','crater',-300,-2070,460,290,20,14),
    solid('fallen-probe','wreck',-650,-1880,150,120,69,15),
    solid('observatory-east-pit','crater',690,-2155,260,180,18,16),
    solid('north-west-ridge','ridge',-330,-2330,240,60,82,17),
    solid('beacon-approach-ridge','ridge',70,-2320,170,90,74,18),
    solid('beacon-equipment','equipment',430,-2715,135,95,78,19),
]

paths = [
    path((-300,170),(-155,65),(-70,-110),(105,-285),(230,-450),(220,-660),
         (260,-795),(440,-1000),(540,-1190),(450,-1340),(-300,-1340),(-345,-1490),(-210,-1620),
         (-190,-1750),(30,-1870),(35,-2035),(350,-2140),(310,-2280),(265,-2380),(180,-2470),(215,-2685)),
    path((-300,170),(-450,270),(-710,240),(-800,100),(-775,-125),(-720,-335),(-340,-330),(-140,-270),(105,-285),width=88),
    path((-300,170),(115,155),(535,135),(700,15),(735,-50),(470,-90),(420,-260),(350,-390),(230,-450),width=88),
    path((220,-660),(40,-790),(-470,-825),(-610,-980),(-640,-1140),(-650,-1280),(-360,-1365),(-345,-1490),width=92),
    path((-640,-1140),(-695,-1160),width=78),
    path((-210,-1620),(-410,-1735),(-690,-1770),(-825,-1945),(-805,-2100),(-710,-2170),(-555,-2255),(-165,-2260),(35,-2190),(350,-2140),width=90),
    path((-710,-2170),(-700,-2150),width=78),
]

details = [
    detail('landing',-300,175,125,82),detail('wreckage',665,-210,150,115),
    detail('wreckage',-540,-1445,135,95),detail('wreckage',-650,-1880,125,92),
    detail('beacon',215,-2685,62,62),
    detail('crater',100,-115,38,25),detail('crater',-770,-370,30,20),
    detail('crater',610,225,44,29),detail('crater',-280,295,30,21),
    detail('crater',485,-840,42,28),detail('crater',-440,-1300,35,24),
    detail('crater',795,-1120,46,30),detail('crater',275,-1400,36,24),
    detail('crater',-485,-1790,30,20),detail('crater',105,-2150,40,27),
    detail('crater',565,-2270,32,22),detail('crater',-40,-2700,35,24),
    detail('tracks',-120,-35,90,28),detail('tracks',475,-1060,72,24),
    detail('tracks',260,-2220,85,25),detail('rubble',-755,-245,55,45),
    detail('rubble',-360,-1390,50,35),detail('rubble',525,-1950,65,40),
]

def main():
    file = ROOT/'dist/config/stages.json'
    data = json.loads(file.read_text())
    moon = next(d for d in data['expeditions'] if d['id']=='moon')
    moon.update(summary='穿过着陆盆地与陨坑岩脊，在残骸之间寻找通路，抵达北方信标。',
                bounds=dict(minX=-980,maxX=980,minY=-2850,maxY=350),
                start=point(-300,170),exit=dict(**point(215,-2685),r=62),
                landform=dict(outline=outline,solids=solids),obstacles=[],paths=paths,details=details,
                supplies=[dict(**point(-775,-125),drop='herb'),dict(**point(-695,-1160),drop='magnet'),dict(**point(-700,-2150),drop='herb')])
    for segment,name,center,gate,span in zip(moon['segments'],['着陆盆地','环坑残骸','信标前哨'],
            [(105,-285),(540,-1190),(350,-2140)],[-660,-1620,-2470],[(40,400),(-390,-30),(0,360)]):
        segment.update(name=name,center=point(*center),gate=gate,gateSpan=dict(minX=span[0],maxX=span[1]))
    file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Moon landform rebuilt:',len(outline),'outline vertices,',len(solids),'solids')

if __name__=='__main__':
    main()
