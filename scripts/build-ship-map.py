#!/usr/bin/env python3
"""Rebuild the compact ship scenes from shared floor/solid footprints."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
def p(x,y): return {'x':round(x,2),'y':round(y,2)}
def rounded_rect(x,y,w,d,r=12):
    points=[];r=min(r,w/2,d/2)
    for cx,cy,start in [(x+w/2-r,y-d/2+r,-90),(x+w/2-r,y+d/2-r,0),(x-w/2+r,y+d/2-r,90),(x-w/2+r,y-d/2+r,180)]:
        for n in range(5):
            a=math.radians(start+n*22.5);points.append(p(cx+math.cos(a)*r,cy+math.sin(a)*r))
    return points
def rounded_polygon(vertices):
    result=[]
    for i,(x,y) in enumerate(vertices):
        before,after=vertices[i-1],vertices[(i+1)%len(vertices)]
        a=(x+(before[0]-x)*.14,y+(before[1]-y)*.14)
        b=(x+(after[0]-x)*.14,y+(after[1]-y)*.14)
        for n in range(5):
            t=n/4;result.append(p((1-t)**2*a[0]+2*(1-t)*t*x+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*y+t*t*b[1]))
    return result
def solid(id,kind,x,y,w,d,h,corner=12,band='high'):
    return dict(id=id,kind=kind,x=x,y=y,width=w,depth=d,height=h,corner=min(corner,w/2,d/2),heightBand=band,points=rounded_rect(x,y,w,d,corner))
def path(*points,width=108):return {'width':width,'points':[p(*q) for q in points]}
def detail(kind,x,y,rx,ry):return dict(kind=kind,x=x,y=y,rx=rx,ry=ry)
def link(id,x,y,to,arrival,direction,label,requires=None):
    return dict(id=id,kind='stairs',x=x,y=y,to=to,arrival=p(*arrival),direction=p(*direction),requiresSegment=requires,label=label)

scenes=[
 dict(id='aft-deck',name='后甲板',kind='deck',bounds=dict(minX=-820,maxX=820,minY=-480,maxY=480),
      outline=rounded_polygon([(-820,-310),(-740,-450),(-560,-480),(820,-480),(820,480),(-560,480),(-740,450),(-820,310)]),
      solids=[solid('aft-cabin','cabin',-280,-40,360,160,90,18),solid('aft-barrels','barrels',-630,300,92,96,42,20),
              solid('aft-rope-cargo','cargo',-595,-315,125,105,48),solid('aft-mast','mast',110,-215,60,56,174,26),
              solid('aft-forward-cargo','cargo',425,-330,160,115,56),solid('aft-capstan','capstan',410,285,82,72,48,30)],
      obstacles=[],
      paths=[path((-650,0),(-580,-230),(-350,-280),(40,-315),(215,-310),(235,-170),(290,20)),
             path((-650,0),(-530,160),(-230,210),(100,180),(290,20)),
             path((290,20),(520,90),(650,260)),path((-530,160),(-490,340),width=90)],
      details=[detail('rope',-520,-360,34,22),detail('grate',-260,300,105,54),detail('hatch',520,90,64,49),
               detail('scuff',250,60,130,86),detail('rope',610,-310,34,23)],
      supplies=[dict(x=-490,y=340,drop='herb')],
      links=[link('aft-to-hold',650,260,'cargo-hold',(-650,290),(0,-1),'下到货舱',0)]),
 dict(id='cargo-hold',name='下层货舱',kind='hold',bounds=dict(minX=-780,maxX=780,minY=-520,maxY=520),
      outline=rounded_rect(0,0,1560,1040,24),
      solids=[solid('hold-aft-cargo','cargo',-360,60,260,245,76,18),solid('hold-forward-cargo','cargo',100,180,300,180,68,18),
              solid('hold-room-wall','bulkhead',-20,-235,560,42,74,8),solid('hold-lower-wall','bulkhead',-115,345,40,150,68,8),
              solid('hold-bunks','bunks',-535,-385,145,90,49,10),solid('hold-chart','charttable',-90,-385,135,85,39,12),
              solid('hold-shelf','shelf',170,-420,160,65,65,9),solid('hold-barrels','barrels',550,225,110,95,47,22)],
      obstacles=[],
      paths=[path((-650,290),(-620,-130),(-430,-170),(-360,-330),(-320,-385)),
             path((-360,-330),(-320,-305),(310,-305),(380,-20),width=100),
             path((-650,290),(-370,300),(-230,390),(-230,455),(130,455),(380,335),(380,-20),width=96),
             path((380,-20),(560,-150),(650,-350)),path((310,-305),(650,-350),width=96)],
      details=[detail('rug',-330,-385,105,72),detail('lamp',-700,-225,74,60),detail('lamp',650,15,74,60),
               detail('grate',60,-70,105,56),detail('scuff',-580,150,130,90),detail('rope',560,360,34,23)],
      supplies=[dict(x=-320,y=-385,drop='magnet')],
      links=[link('hold-to-aft',-665,410,'aft-deck',(500,200),(-1,0),'返回后甲板'),
             link('hold-to-fore',650,-350,'foredeck',(-650,240),(0,-1),'登上船首甲板',1)]),
 dict(id='foredeck',name='船首甲板',kind='deck',bounds=dict(minX=-850,maxX=850,minY=-500,maxY=500),
      outline=rounded_polygon([(-850,-500),(350,-500),(650,-360),(850,-85),(850,85),(650,360),(350,500),(-850,500)]),
      solids=[solid('fore-cabin','cabin',-490,-170,300,150,88,18),solid('fore-mast','mast',-80,20,70,66,190,30),
              solid('fore-cargo','cargo',-270,310,160,110,49),solid('fore-barrels','barrels',-680,15,104,90,46,20),
              solid('fore-capstan','capstan',395,-245,96,82,49,35),solid('fore-rope-locker','cargo',225,335,145,92,45)],
      obstacles=[],
      paths=[path((-650,240),(-480,150),(-250,145),(-80,165),(170,50),(290,0)),
             path((-650,240),(-790,180),(-790,-340),(-490,-375),(-240,-355),(75,-170),(290,0),width=100),
             path((290,0),(480,40),(650,0)),path((170,50),(20,305),width=96)],
      details=[detail('rope',500,230,36,25),detail('grate',-450,55,100,48),detail('rope',-180,-310,34,22),
               detail('scuff',300,40,130,90),detail('hatch',30,-310,80,54)],
      supplies=[dict(x=20,y=305,drop='herb')],
      links=[link('fore-to-hold',-680,360,'cargo-hold',(510,-350),(-1,0),'返回下层货舱',1)])
]

def main():
    file=ROOT/'dist/config/stages.json';data=json.loads(file.read_text());ship=next(d for d in data['expeditions'] if d['id']=='ship')
    ship.update(summary='穿过后甲板与下层货舱，沿楼梯登上船首甲板。',objective='逐层突破船上敌军，抵达船首撤离点。',
                start=dict(x=-650,y=0,sceneId='aft-deck'),exit=dict(x=650,y=0,r=62,sceneId='foredeck'),scenes=scenes)
    for key in ['bounds','obstacles','paths','details','supplies']:ship.pop(key,None)
    for segment,scene,center in zip(ship['segments'],scenes,[(290,20),(380,-20),(290,0)]):
        segment.update(sceneId=scene['id'],name=scene['name'],center=p(*center));segment.pop('gate',None)
    file.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Ship scenes rebuilt:', ', '.join(scene['id'] for scene in scenes))

if __name__=='__main__':main()
