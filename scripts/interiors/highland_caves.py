"""Authored mountain, ice and cooled-lava cave plans.

These are seven separate floor plans, rather than recolours of a shared maze.
The baked geometry and route graph share the same room/corridor specifications.
"""

import math

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from interior_geometry import cave_room, finish, make, pos


def _room(name, purpose, x, y, rx, ry, seed):
    # Keep broad natural bends while avoiding dozens of tiny collision segments.
    return name, purpose, cave_room(x, y, rx, ry, seed).simplify(5, preserve_topology=True)


def _link(a, b, rooms, bends=(), width=178):
    start, end = rooms[a][2].centroid, rooms[b][2].centroid
    return a, b, [(start.x, start.y), *bends, (end.x, end.y)], width


def _gate(a, b, rooms, switch, *, width=178, fraction=.54):
    start, end = rooms[a][2].centroid, rooms[b][2].centroid
    dx, dy = end.x - start.x, end.y - start.y
    distance = math.hypot(dx, dy)
    gx, gy = start.x + dx * fraction, start.y + dy * fraction
    # Extend into the rock on both sides: the visible gate actually closes the neck.
    span = width / 2 + 22
    nx, ny = -dy / distance * span, dx / distance * span
    return dict(rooms=[a, b], switch=switch, cellId=b,
                bar=[round(gx - nx, 2), round(gy - ny, 2),
                     round(gx + nx, 2), round(gy + ny, 2)])


def _point(rooms, cell_id, dx=0, dy=0):
    c = rooms[cell_id][2].centroid
    return pos(round(c.x + dx, 2), round(c.y + dy, 2))


def _contents(layout, floor, rooms, *, theme, boss, caches, encounters,
              boss_name, mine=False):
    """Place readable clusters at the edges, reserving actual navigation anchors.

    Furnishing is deterministic. It is rejected if it would touch a walker's
    centreline, a chest, a switch, a spawn or an exit. The room plans themselves
    are explicit below; this helper only handles repeated edge dressing.
    """
    layout['artTheme'] = theme
    layout['terrain'] = {'mountain': 'mountain', 'snow': 'snow',
                         'ember': 'ember-realm-large'}[theme]
    layout['boss'] = dict(cellId=boss, **_point(rooms, boss, 20, 10),
                          bossIndex=1, name=boss_name)
    layout['treasure'] = _point(rooms, boss, 90, -125)
    layout['chests'] = [dict(id=f'side-cache-{i + 1}', cellId=cell,
                             **_point(rooms, cell, dx, dy))
                        for i, (cell, dx, dy) in enumerate(caches)]
    offsets = [(-95, -55), (95, 45), (20, -105), (-80, 100),
               (120, -95), (-140, 25), (40, 125), (-30, -150)]
    for index, (cell, types) in enumerate(encounters):
        enemies = []
        interactions = [target for target in [*layout['chests'], *layout['mechanisms']]
                        if target['cellId'] == cell]
        for kind in types:
            for dx, dy in offsets:
                candidate = _point(rooms, cell, dx, dy)
                if any(math.hypot(candidate['x'] - p['x'], candidate['y'] - p['y']) < 90
                       for p in [*interactions, *enemies]):
                    continue
                enemies.append(dict(type=kind, **candidate))
                break
            else:
                raise ValueError(f'{layout["id"]}: no free enemy position in room {cell}')
        layout['groups'].append(dict(cellId=cell, heal=index in (1, 3), enemies=enemies))

    targets = [layout['entrance'], layout['landing'], layout['boss'],
               layout['treasure'], *layout['chests'], *layout['exits'],
               *layout['mechanisms']]
    occupied = unary_union([Point(p['x'], p['y']).buffer(65) for p in targets] +
                           [Point(enemy['x'], enemy['y']).buffer(42)
                            for group in layout['groups'] for enemy in group['enemies']])
    # Runtime guides also visit adjacency midpoints, so reserve the entire segment.
    cells = layout['cells']
    routes = unary_union([
        LineString([(cell['x'], cell['y']), (cells[n]['x'], cells[n]['y'])]).buffer(42)
        for cell in cells for n in cell['neighbors'] if cell['id'] < n
    ])
    gate = layout['mechanisms'][0]['gate']
    occupied = unary_union([occupied, routes,
                           LineString([(gate['ax'], gate['ay']),
                                       (gate['bx'], gate['by'])]).buffer(65)])
    solid_footprints = []
    mineral = 'iceSpire' if theme == 'snow' else 'oreCluster'
    detail = {'mountain': 'ore', 'snow': 'ice', 'ember': 'ash'}[theme]
    for index, (_, purpose, shape) in enumerate(rooms):
        center = shape.centroid
        min_x, min_y, max_x, max_y = shape.bounds
        rx, ry = (max_x - min_x) / 2, (max_y - min_y) / 2
        candidates = []
        for slot in range(32):
            angle = ((slot / 32 + index * .071) * math.tau) % math.tau
            x = center.x + math.cos(angle) * (rx - 66)
            y = center.y + math.sin(angle) * (ry - 65)
            candidates.append((x, y, angle))
        placed = 0
        for x, y, angle in candidates:
            if placed >= (3 if purpose == 'boss' else 2):
                break
            kind = mineral if (index + placed) % 2 == 0 else 'cavernRock'
            if mine and index in (0, 2, 4) and placed == 0:
                kind = {0: 'cargo', 2: 'minecart', 4: 'barrel'}[index]
            radius = {'iceSpire': 23, 'oreCluster': 24, 'cavernRock': 29,
                      'cargo': 25, 'barrel': 19, 'minecart': 39}[kind]
            # Include body radius plus a small tolerance in every placement check.
            footprint = Point(x, y).buffer(radius + 24)
            if not floor.buffer(-14).covers(footprint) or occupied.intersects(footprint):
                continue
            if any(old.distance(footprint) < 28 for old in solid_footprints):
                continue
            prop = dict(id=f'{theme}-room-{index}-cluster-{placed}', type=kind,
                        x=round(x, 2), y=round(y, 2), r=radius,
                        collision=True, heightBand='low')
            if kind == 'cargo':
                prop.update(r=16, footprint=dict(width=50, depth=32, offsetY=2))
            if kind == 'minecart':
                prop.update(r=18, halfLength=17, angle=0,
                            footprint=dict(width=70, depth=36, offsetY=4))
            layout['props'].append(prop)
            solid_footprints.append(footprint)
            placed += 1
            layout['groundDetails'].append(dict(type='rubble', x=round(x, 2), y=round(y, 2),
                                                rx=52, ry=27, angle=round(angle, 2)))

        # Broad ground marks stay subtle and walkable; the solid edge clusters carry
        # the silhouette. These patches never imply a lethal lava pool or a chasm.
        layout['groundDetails'].append(dict(type=detail,
                                            x=round(center.x - rx * .15, 2),
                                            y=round(center.y + ry * .33, 2),
                                            rx=round(rx * .42, 2), ry=round(ry * .21, 2),
                                            angle=round((index % 3 - 1) * .27, 2)))
        if theme == 'ember' or (theme == 'mountain' and mine):
            layout['groundDetails'].append(dict(type='ore',
                                                x=round(center.x + rx * .38, 2),
                                                y=round(center.y - ry * .23, 2),
                                                rx=48, ry=24, angle=.5))
        if theme == 'mountain' and not mine:
            layout['groundDetails'].append(dict(type='moss',
                                                x=round(center.x - rx * .33, 2),
                                                y=round(center.y - ry * .28, 2),
                                                rx=50, ry=26))
        # Small non-solid marks add scale without cluttering the route or hitboxes.
        if theme != 'snow':
            for slot in (6, 18):
                x, y, _ = candidates[slot]
                if floor.buffer(-28).covers(Point(x, y)):
                    layout['props'].append(dict(id=f'{theme}-room-{index}-fungus-{slot}',
                                                type='caveMushroom', x=round(x, 2),
                                                y=round(y, 2), r=11, collision=False))
    finish(layout)
    return layout


def _folded_ridge():
    # Two mouths traverse a bent ridge. The guardian is a side expedition, while
    # an ore pocket unlocks a diagonal return across the long western dogleg.
    rooms = [
        _room('云隙入口', 'entry', -1200, 780, 250, 210, 31),
        _room('碎石前庭', 'guard', -550, 700, 260, 215, 32),
        _room('叠岭转折', 'junction', -430, 0, 275, 225, 33),
        _room('横穿石梁', 'junction', 220, -290, 290, 240, 34),
        _room('采石出口', 'exit', 1050, -550, 260, 215, 35),
        _room('旧矿侧袋', 'treasury', -1080, -260, 250, 210, 36),
        _room('山腹守卫厅', 'boss', 920, 220, 370, 300, 37),
    ]
    links = [_link(0, 1, rooms, [(-850, 900)]),
             _link(1, 2, rooms, [(-660, 350)], width=172),
             _link(2, 3, rooms, [(-100, -100)], width=175),
             _link(3, 4, rooms, [(650, -510)], width=170),
             _link(2, 5, rooms, [(-760, -80)], width=165),
             _link(3, 6, rooms, [(680, -180), (710, 100)], width=190),
             _link(1, 5, rooms, width=170)]
    layout, floor = make('mountainFold', '叠岭暗道', 'cave', rooms, links,
                         (-1290, 830), (-1190, 755),
                         _gate(1, 5, rooms, (-990, -205), width=170),
                         [dict(x=-1290, y=830, direction=pos(1, -.4)),
                          dict(x=1150, y=-620, direction=pos(-1, .4))])
    return _contents(layout, floor, rooms, theme='mountain', boss=6,
                     caches=[(1, 110, -65), (5, -90, -60), (3, 65, -115)],
                     encounters=[(1, ['beetle', 'stoneape', 'bat']),
                                 (2, ['stoneape', 'bat', 'beetle']),
                                 (3, ['beetle', 'stoneape', 'bat']),
                                 (5, ['bat', 'beetle', 'bat'])],
                     boss_name='叠岭守卫')


def _echo_vein():
    # A branching excavation: a supply spur and abandoned side pocket flank the
    # long upper route. The old haulage shaft only opens from its far end.
    rooms = [
        _room('东壁落脚台', 'entry', -1100, 600, 250, 210, 41),
        _room('分矿场', 'junction', -470, 530, 300, 245, 42),
        _room('回声采掘面', 'guard', -530, -200, 265, 220, 43),
        _room('绞盘石台', 'junction', 160, -470, 285, 230, 44),
        _room('岩脉深厅', 'boss', 850, -100, 375, 300, 45),
        _room('废弃物料洞', 'treasury', 260, 470, 255, 220, 46),
        _room('盲矿袋', 'treasury', -1150, -260, 250, 215, 47),
    ]
    links = [_link(0, 1, rooms, [(-800, 660)]),
             _link(1, 2, rooms, [(-600, 180)], width=170),
             _link(2, 3, rooms, [(-240, -410)], width=175),
             _link(3, 4, rooms, [(550, -420), (680, -260)], width=190),
             _link(1, 5, rooms, width=170),
             _link(2, 6, rooms, width=160),
             _link(1, 3, rooms, width=170)]
    layout, floor = make('mountainVein', '回声石窟', 'cave', rooms, links,
                         (-1190, 650), (-1090, 580),
                         _gate(1, 3, rooms, (260, -450), width=170),
                         [dict(x=-1190, y=650, direction=pos(1, -.3))])
    return _contents(layout, floor, rooms, theme='mountain', boss=4, mine=True,
                     caches=[(5, 100, -55), (6, -90, -55), (2, 95, -90)],
                     encounters=[(1, ['beetle', 'bat', 'beetle']),
                                 (2, ['stoneape', 'beetle', 'bat']),
                                 (3, ['stoneape', 'bat', 'beetle']),
                                 (5, ['beetle', 'beetle']),
                                 (6, ['bat', 'stoneape', 'bat'])],
                     boss_name='岩脉守卫')


def _frost_vein():
    # Offset ice throats make a legible east-west traverse. The great ice chamber
    # lies north of the route; the southwest pocket controls a return ice gate.
    rooms = [
        _room('回音入口', 'entry', -1300, -300, 255, 215, 51),
        _room('风蚀冰庭', 'guard', -650, -500, 265, 225, 52),
        _room('错层冰廊', 'junction', -100, 150, 285, 235, 53),
        _room('霜脉交汇', 'junction', 620, -230, 275, 230, 54),
        _room('银杉出口', 'exit', 1250, 120, 255, 215, 55),
        _room('冻封侧窟', 'treasury', -620, 300, 250, 215, 56),
        _room('空鸣冰室', 'boss', 450, -1050, 380, 305, 57),
    ]
    links = [_link(0, 1, rooms, [(-1000, -480)], width=180),
             _link(1, 2, rooms, [(-220, -420), (-240, -20)], width=165),
             _link(2, 3, rooms, [(280, 80), (390, -100)], width=175),
             _link(3, 4, rooms, [(980, -150), (1070, 80)], width=180),
             _link(2, 5, rooms, [(-330, 320)], width=165),
             _link(3, 6, rooms, [(800, -670), (650, -890)], width=190),
             _link(1, 5, rooms, width=170)]
    layout, floor = make('snowVein', '霜脉暗道', 'cave', rooms, links,
                         (-1400, -265), (-1290, -325),
                         _gate(1, 5, rooms, (-700, 380), width=170),
                         [dict(x=-1400, y=-265, direction=pos(1, -.3)),
                          dict(x=1360, y=150, direction=pos(-1, -.2))])
    return _contents(layout, floor, rooms, theme='snow', boss=6,
                     caches=[(1, -85, -95), (2, 80, 100), (5, 65, -95)],
                     encounters=[(1, ['bat', 'frostmage', 'beetle']),
                                 (2, ['beetle', 'frostmage', 'bat']),
                                 (3, ['frostmage', 'beetle', 'bat']),
                                 (5, ['bat', 'frostmage', 'beetle'])],
                     boss_name='冰室守卫')


def _blue_ice():
    # A broad horseshoe wraps around the central blue-ice arena. Completing the
    # outer crescent opens a short return to the mouth without retracing it.
    rooms = [
        _room('蓝冰入口', 'entry', -200, 1100, 260, 215, 61),
        _room('弧冰前庭', 'guard', -850, 650, 285, 230, 62),
        _room('裂冰西窟', 'treasury', -1050, -200, 260, 225, 63),
        _room('静霜北室', 'treasury', -250, -700, 285, 230, 64),
        _room('折光东窟', 'treasury', 650, -400, 275, 225, 65),
        _room('冰闸石台', 'junction', 650, 450, 270, 230, 66),
        _room('蓝冰心室', 'boss', -150, 100, 385, 310, 67),
    ]
    links = [_link(0, 1, rooms, [(-500, 850)], width=180),
             _link(1, 2, rooms, [(-1160, 270)], width=170),
             _link(2, 3, rooms, [(-730, -600)], width=170),
             _link(3, 4, rooms, [(220, -700), (450, -570)], width=180),
             _link(4, 5, rooms, [(830, 40)], width=175),
             _link(5, 6, rooms, [(260, 380)], width=190),
             _link(0, 5, rooms, width=180)]
    layout, floor = make('snowBlueIce', '蓝冰深窟', 'cave', rooms, links,
                         (-170, 1200), (-230, 1100),
                         _gate(0, 5, rooms, (745, 480), width=180),
                         [dict(x=-170, y=1200, direction=pos(-.2, -1))])
    return _contents(layout, floor, rooms, theme='snow', boss=6,
                     caches=[(2, -90, -65), (3, 90, -85), (4, 100, -60)],
                     encounters=[(1, ['beetle', 'frostmage', 'bat']),
                                 (2, ['bat', 'frostmage', 'bat']),
                                 (3, ['frostmage', 'beetle', 'bat']),
                                 (4, ['frostmage', 'beetle', 'bat']),
                                 (5, ['beetle', 'bat'])],
                     boss_name='蓝冰守卫')


def _bridge_mine():
    # A compact trial excavation. The short eastern supply drift contrasts with
    # the western climb to the oreface, which unlocks the disused central shaft.
    rooms = [
        _room('桥头落脚洞', 'entry', -950, 600, 255, 215, 71),
        _room('试掘分岔', 'junction', -350, 550, 275, 225, 72),
        _room('旧凿石面', 'guard', -850, -100, 255, 215, 73),
        _room('赤铁绞盘台', 'junction', -180, -350, 280, 235, 74),
        _room('试掘深厅', 'boss', 550, -180, 375, 300, 75),
        _room('物料盲巷', 'treasury', 450, 550, 270, 225, 76),
    ]
    links = [_link(0, 1, rooms, width=180),
             _link(1, 2, rooms, [(-550, 250)], width=175),
             _link(2, 3, rooms, [(-570, -350)], width=165),
             _link(3, 4, rooms, [(170, -440), (400, -320)], width=190),
             _link(1, 5, rooms, width=175),
             _link(1, 3, rooms, width=170)]
    layout, floor = make('emberBridge', '赤铁试掘坑', 'cave', rooms, links,
                         (-1050, 640), (-950, 580),
                         _gate(1, 3, rooms, (-80, -330), width=170),
                         [dict(x=-1050, y=640, direction=pos(1, -.2))])
    return _contents(layout, floor, rooms, theme='ember', boss=4, mine=True,
                     caches=[(2, -90, -60), (3, 70, -110), (5, 100, 60)],
                     encounters=[(1, ['beetle', 'flamelizard', 'bat']),
                                 (2, ['flamelizard', 'beetle', 'bat']),
                                 (3, ['beetle', 'flamelizard', 'bat']),
                                 (5, ['bat', 'beetle', 'flamelizard'])],
                     boss_name='赤铁守卫')


def _north_mine():
    # Two long mining galleries flank a locked haulage shaft. Both wings remain
    # useful: western ore pockets, eastern stores, then the deep terminal arena.
    rooms = [
        _room('赤铁矿口', 'entry', -150, 1300, 265, 220, 81),
        _room('运矿分流场', 'junction', -150, 640, 295, 240, 82),
        _room('西脉采场', 'treasury', -900, 350, 260, 225, 83),
        _room('深层旧矿', 'treasury', -1000, -400, 280, 235, 84),
        _room('主绞盘洞室', 'junction', -230, -680, 290, 240, 85),
        _room('东翼排渣室', 'guard', 550, -350, 270, 225, 86),
        _room('旧运矿堆场', 'treasury', 650, 420, 275, 230, 87),
        _room('深脉守卫厅', 'boss', -150, -1400, 385, 310, 88),
    ]
    links = [_link(0, 1, rooms, [(-260, 960)], width=185),
             _link(1, 2, rooms, [(-600, 570)], width=175),
             _link(2, 3, rooms, [(-1120, 40)], width=170),
             _link(3, 4, rooms, [(-730, -650)], width=175),
             _link(4, 7, rooms, [(-80, -1050)], width=190),
             _link(4, 5, rooms, [(180, -620), (380, -460)], width=180),
             _link(5, 6, rooms, [(760, 20)], width=175),
             _link(6, 1, rooms, [(230, 560)], width=180),
             _link(1, 4, rooms, width=175)]
    layout, floor = make('emberNorth', '赤铁深矿', 'cave', rooms, links,
                         (-115, 1400), (-180, 1295),
                         _gate(1, 4, rooms, (-120, -670), width=175),
                         [dict(x=-115, y=1400, direction=pos(-.2, -1))])
    return _contents(layout, floor, rooms, theme='ember', boss=7, mine=True,
                     caches=[(2, -95, 65), (3, -90, -80), (6, 100, 60)],
                     encounters=[(1, ['beetle', 'flamelizard', 'bat']),
                                 (2, ['stoneape', 'beetle', 'bat']),
                                 (3, ['flamelizard', 'beetle', 'bat']),
                                 (4, ['beetle', 'flamelizard', 'bat']),
                                 (5, ['flamelizard', 'beetle', 'bat']),
                                 (6, ['beetle', 'flamelizard', 'bat'])],
                     boss_name='深矿守卫')


def _cooled_cavern():
    # Asymmetric lava tubes swell into chambers, rather than another mine grid.
    # The upper cooled tube returns from beyond the arena to the first cavern.
    rooms = [
        _room('南岸冷凝口', 'entry', -1250, 600, 265, 225, 91),
        _room('灰烬浅窟', 'guard', -650, 800, 295, 240, 92),
        _room('凝流交汇', 'junction', 50, 420, 325, 250, 93),
        _room('余温侧室', 'treasury', 700, 750, 275, 225, 94),
        _room('冷却熔心', 'boss', 900, -50, 395, 315, 95),
        _room('黑曜回廊', 'guard', 100, -440, 280, 235, 96),
        _room('岩壳高台', 'treasury', -700, -100, 265, 225, 97),
    ]
    links = [_link(0, 1, rooms, [(-960, 850)], width=180),
             _link(1, 2, rooms, [(-250, 750), (-100, 550)], width=180),
             _link(2, 3, rooms, [(400, 650)], width=170),
             _link(2, 4, rooms, [(500, 300), (650, 50)], width=195),
             _link(4, 5, rooms, [(600, -350), (380, -480)], width=185),
             _link(5, 6, rooms, [(-250, -390), (-450, -250)], width=170),
             _link(1, 6, rooms, width=175)]
    layout, floor = make('emberSouth', '冷却熔窟', 'cave', rooms, links,
                         (-1350, 600), (-1240, 630),
                         _gate(1, 6, rooms, (-790, -180), width=175),
                         [dict(x=-1350, y=600, direction=pos(1, .2))])
    return _contents(layout, floor, rooms, theme='ember', boss=4,
                     caches=[(1, -90, 85), (3, 90, -80), (6, 85, -65)],
                     encounters=[(1, ['beetle', 'flamelizard', 'bat']),
                                 (2, ['flamelizard', 'beetle', 'bat']),
                                 (3, ['beetle', 'flamelizard', 'bat']),
                                 (5, ['flamelizard', 'bat', 'beetle']),
                                 (6, ['beetle', 'bat', 'flamelizard'])],
                     boss_name='熔心守卫')


def build_layouts():
    return {layout['id']: layout for layout in (
        _folded_ridge(), _echo_vein(), _frost_vein(), _blue_ice(),
        _bridge_mine(), _north_mine(), _cooled_cavern(),
    )}
