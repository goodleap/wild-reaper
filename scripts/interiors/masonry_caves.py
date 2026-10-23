"""Authored underground stonework: aqueduct, starwell, sewer and cellar."""
from shapely.geometry import Point
from shapely.affinity import scale
from interior_geometry import make, rect, pos, finish


def oval(x, y, rx, ry):
    return scale(Point(x, y).buffer(1, quad_segs=12), rx, ry)


def exit_at(x, y, dx, dy):
    return dict(x=x, y=y, direction=pos(dx, dy))


def chest(id, cell, x, y):
    return dict(id=id, cellId=cell, x=x, y=y)


def guards(cell, x, y, types, heal=False):
    spots=[(-95,-65),(95,5),(0,105),(85,-105)]
    return dict(cellId=cell, heal=heal, enemies=[dict(type=t,x=x+spots[i][0],y=y+spots[i][1]) for i,t in enumerate(types)])


def prop(id, type, x, y, r, **options):
    return dict(id=id,type=type,x=x,y=y,r=r,collision=True,heightBand='low',**options)


def lamp(id, x, y):
    return dict(id=id,type='wallTorch',x=x,y=y,r=8,collision=False)


def crate(id, x, y):
    return prop(id,'cargo',x,y,16,footprint=dict(width=50,depth=32,offsetY=2))


def accent(type, x, y, rx, ry, angle=0):
    return dict(type=type,x=x,y=y,rx=rx,ry=ry,angle=angle)


def complete(layout, theme):
    layout['artTheme']=theme
    layout['terrain']='clockshadow-city' if theme=='city' else 'ruins'
    finish(layout)
    return layout


def aqueduct():
    rooms=[
        ('藏书院梯室','entry',rect(-1300,280,-800,720)),
        ('分水厅','junction',rect(-700,170,-180,730)),
        ('沉砂池','guard',oval(-420,-310,300,245)),
        ('东侧闸桥','junction',rect(80,200,620,660)),
        ('藏殿梯室','exit',rect(760,20,1240,480)),
        ('上层检修渠','treasury',rect(90,-590,610,-120)),
        ('封存水库','boss',oval(1020,-650,340,270)),
    ]
    links=[
        (0,1,[(-1050,500),(-440,450)],180),
        (1,2,[(-440,450),(-420,-310)],170),
        (2,5,[(-420,-310),(350,-350)],170),
        (5,3,[(350,-350),(350,430)],180),
        (3,4,[(350,430),(1000,250)],180),
        (5,6,[(350,-350),(750,-650),(1020,-650)],180),
        (1,3,[(-440,430),(350,430)],170),
    ]
    layout,_=make('ruinsAqueduct','埋没水道','castle',rooms,links,(-1150,580),(-1040,550),
        dict(rooms=[1,3],switch=(190,335),cellId=3,bar=[-40,330,-40,530]),
        [exit_at(-1150,580,1,0),exit_at(1120,330,-1,0)])
    layout['mechanisms'][0]['name']='升起检修闸'
    layout['chests']=[chest('silt-cache',2,-530,-390),chest('channel-cache',5,450,-465),chest('bridge-locker',3,505,535)]
    layout['groups']=[guards(1,-440,450,['shieldguard','beetle','tidepriest']),guards(2,-420,-310,['beetle','beetle','tidepriest'],True),guards(3,350,430,['shieldguard','beetle']),guards(5,350,-350,['shieldguard','frostmage','beetle','beetle'])]
    layout['boss']=dict(cellId=6,x=1020,y=-620,bossIndex=1,name='水库石卫')
    layout['treasure']=pos(1140,-745)
    layout['props']=[prop('entry-column','brokenColumn',-1210,380,23),prop('split-column','brokenColumn',-590,260,23),prop('silt-column','brokenColumn',-600,-250,23),prop('upper-column','brokenColumn',505,-520,23),prop('reservoir-column','brokenColumn',1230,-580,23),crate('bridge-crate',520,270),lamp('entry-light',-1210,650),lamp('bridge-light',535,590),lamp('east-light',1140,115)]
    layout['groundDetails']=[accent('water',-515,515,115,120),accent('water',-370,-325,120,85),accent('water',1080,-625,115,55),accent('mosaic',350,430,150,105),accent('rubble',-1150,630,110,38),accent('rubble',455,-490,100,45)]
    return complete(layout,'ruins')


def starwell():
    rooms=[
        ('星井梯室','entry',rect(-240,780,240,1220)),
        ('断碑廊','treasury',rect(-900,470,-400,930)),
        ('旧井石室','guard',oval(-870,-10,260,230)),
        ('北环廊','guard',rect(-720,-900,-130,-400)),
        ('星纹圆厅','boss',oval(350,-650,350,280)),
        ('刻石藏室','treasury',rect(700,-300,1200,200)),
        ('回廊闸室','junction',rect(400,420,900,880)),
    ]
    links=[(0,1,[(0,1000),(-650,700)],180),(1,2,[(-650,700),(-870,-10)],175),
        (2,3,[(-870,-10),(-900,-500),(-430,-650)],175),(3,4,[(-430,-650),(350,-650)],180),
        (4,5,[(350,-650),(950,-50)],185),(5,6,[(950,-50),(650,650)],180),
        (0,6,[(0,1000),(650,650)],175)]
    layout,_=make('ruinsStarwell','星井地宫','castle',rooms,links,(0,1100),(0,1000),
        dict(rooms=[0,6],switch=(535,570),cellId=6,bar=[277.6,737,372.4,913]),
        [exit_at(0,1100,0,-1)])
    layout['mechanisms'][0]['name']='开启回廊石门'
    layout['chests']=[chest('stela-cache',1,-760,790),chest('north-cache',3,-555,-750),chest('inscription-cache',5,1060,80)]
    layout['groups']=[guards(1,-650,700,['shieldguard','beetle','frostmage']),guards(2,-870,-10,['beetle','tidepriest','beetle'],True),guards(3,-430,-650,['shieldguard','frostmage','beetle']),guards(5,950,-50,['shieldguard','beetle','frostmage']),guards(6,650,650,['beetle','shieldguard'])]
    layout['boss']=dict(cellId=4,x=350,y=-620,bossIndex=1,name='星井守望者')
    layout['treasure']=pos(465,-750)
    layout['props']=[prop('entry-stone','brokenColumn',-155,865,23),prop('stela-column','brokenColumn',-805,550,23),prop('well-column','brokenColumn',-1030,-50,23),prop('north-column','brokenColumn',-605,-810,23),prop('sanctum-column','brokenColumn',585,-550,23),prop('east-column','brokenColumn',1080,-215,23),prop('return-column','brokenColumn',790,780,23),lamp('north-light',-210,-815),lamp('entry-light',150,860),lamp('east-light',1090,130)]
    layout['groundDetails']=[accent('mosaic',350,-650,195,165),accent('mosaic',-430,-650,170,130),accent('water',-900,-70,90,65),accent('rubble',-740,800,130,40),accent('rubble',1020,105,120,40)]
    return complete(layout,'ruins')


def sewer():
    rooms=[
        ('学舍地下梯室','entry',rect(-950,-1170,-450,-730)),
        ('维修廊交汇处','junction',rect(-940,-500,-360,0)),
        ('旧泵房','treasury',rect(-300,-1080,200,-620)),
        ('内苑蓄水井','junction',oval(450,-250,320,250)),
        ('花园梯室','exit',rect(650,200,1150,700)),
        ('支仓','guard',rect(-520,320,20,780)),
        ('废弃储水厅','boss',rect(110,880,790,1420)),
    ]
    links=[(0,1,[(-700,-950),(-650,-250)],180),
        (1,2,[(-650,-250),(-250,-550),(-50,-850)],170),
        (1,5,[(-650,-250),(-650,550),(-250,550)],180),
        (5,3,[(-250,550),(450,550),(450,-250)],180),
        (3,4,[(450,-250),(900,-250),(900,450)],180),
        (5,6,[(-250,550),(-250,1150),(450,1150)],180),
        (1,3,[(-650,-250),(450,-250)],175)]
    layout,_=make('citySewer','旧都地下水道','castle',rooms,links,(-800,-1000),(-710,-940),
        dict(rooms=[1,3],switch=(270,-150),cellId=3,bar=[-100,-355,-100,-145]),
        [exit_at(-800,-1000,.8,.6),exit_at(1010,560,-1,0)])
    layout['mechanisms'][0]['name']='打开维修栏闸'
    layout['chests']=[chest('pump-locker',2,65,-950),chest('reservoir-locker',3,555,-135),chest('store-cache',5,-365,660)]
    layout['groups']=[guards(1,-650,-250,['shieldguard','beetle','frostmage']),guards(2,-50,-850,['beetle','shieldguard','beetle']),guards(3,450,-250,['shieldguard','tidepriest','beetle'],True),guards(5,-250,550,['shieldguard','beetle','frostmage']),guards(4,900,450,['beetle','shieldguard'])]
    layout['boss']=dict(cellId=6,x=450,y=1150,bossIndex=1,name='储水厅守卫')
    layout['treasure']=pos(560,1020)
    layout['props']=[crate('entry-crate',-850,-1090),prop('pump-barrel','barrel',100,-720,19),crate('pump-crate',-200,-1000),prop('shaft-column','brokenColumn',640,-300,23),prop('store-barrel-a','barrel',-430,410,19),prop('store-barrel-b','barrel',-375,410,19),crate('store-crate',-85,690),prop('boss-column-a','brokenColumn',220,1000,23),prop('boss-column-b','brokenColumn',680,1300,23),lamp('entry-light',-535,-1090),lamp('junction-light',-850,-410),lamp('exit-light',1060,270)]
    layout['groundDetails']=[accent('water',450,-250,145,90),accent('water',500,1240,135,55),accent('water',-90,-920,90,50),accent('rubble',-425,690,70,36),accent('mosaic',900,450,145,110)]
    return complete(layout,'city')


def cellar():
    rooms=[
        ('货仓梯室','entry',rect(-1190,520,-710,980)),
        ('卸货库','treasury',rect(-620,480,-80,1020)),
        ('旧酒桶库','guard',rect(-1110,-250,-590,250)),
        ('中转仓','junction',rect(-470,-340,70,140)),
        ('看守室','guard',rect(190,20,710,480)),
        ('深处储藏室','treasury',rect(100,-900,700,-400)),
        ('封存酒库','boss',rect(760,-730,1440,-170)),
    ]
    links=[(0,1,[(-950,750),(-350,750)],180),(0,2,[(-950,750),(-850,0)],180),
        (2,3,[(-850,0),(-200,-100)],180),(3,4,[(-200,-100),(450,250)],180),
        (4,5,[(450,250),(400,-650)],180),(5,6,[(400,-650),(1100,-450)],185),
        (1,3,[(-350,750),(-200,-100)],175)]
    layout,_=make('cityCellar','地下酒窖','castle',rooms,links,(-1050,850),(-950,760),
        dict(rooms=[1,3],switch=(-100,30),cellId=3,bar=[-373.5,307.6,-176.5,342.4]),
        [exit_at(-1050,850,1,0)])
    layout['mechanisms'][0]['name']='打开卸货侧门'
    # The existing clock-bridge quest selects the farthest ordinary guarded chest.
    layout['chests']=[chest('receiving-cache',1,-350,875),chest('transit-cache',3,-200,-225),chest('chain-cache',5,250,-750)]
    layout['groups']=[guards(1,-350,750,['beetle','shieldguard','beetle']),guards(2,-850,0,['shieldguard','beetle','frostmage']),guards(3,-200,-100,['shieldguard','beetle','beetle'],True),guards(4,450,250,['shieldguard','frostmage','beetle']),guards(5,400,-650,['shieldguard','frostmage','beetle'])]
    layout['boss']=dict(cellId=6,x=1100,y=-450,bossIndex=1,name='封存库守卫')
    layout['treasure']=pos(1230,-570)
    layout['props']=[crate('entry-crate',-1090,610),crate('receiving-crate-a',-510,590),crate('receiving-crate-b',-440,590),crate('deep-crate',595,-785),prop('guard-table','table',600,120,21,footprint=dict(width=72,depth=42,offsetY=2)),prop('boss-column','brokenColumn',1320,-295,23)]
    for i,(x,y) in enumerate([(-1010,-140),(-1010,-75),(-1010,145),(-950,145),(-360,-245),(-300,-245),(195,-520),(260,-520),(940,-600),(1005,-600),(1320,-650)]):
        layout['props'].append(prop(f'barrel-{i}','barrel',x,y,19))
    layout['props'] += [lamp('entry-light',-790,605),lamp('store-light',-165,590),lamp('guard-light',600,390),lamp('deep-light',600,-475),lamp('vault-light',1330,-640)]
    layout['groundDetails']=[accent('rubble',-1040,875,105,35),accent('rubble',-1000,160,90,35),accent('mosaic',450,250,150,100),accent('rubble',570,-760,95,40),accent('mosaic',1100,-450,170,110)]
    return complete(layout,'city')


def build_layouts():
    return {layout['id']:layout for layout in [aqueduct(),starwell(),sewer(),cellar()]}
