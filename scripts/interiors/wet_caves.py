"""Deterministic room geometry for forest, marsh and coastal cave scenes."""
import math

from shapely.geometry import LineString, Point

from interior_geometry import cave_room, finish, make, pos


def _room(name, purpose, x, y, rx, ry, seed):
    return name, purpose, cave_room(x, y, rx, ry, seed)


def _exit(x, y, dx, dy):
    return dict(x=x, y=y, direction=pos(dx, dy))


def _populate(layout, shape, centers, theme, chests, guards, boss, details):
    layout['artTheme'] = theme
    layout['terrain'] = {'forest': 'verdant-rift', 'marsh': 'marsh', 'beach': 'beach'}[theme]
    layout['chests'] = [dict(id=f'cache-{i}', cellId=cell, x=x, y=y)
                         for i, (cell, x, y) in enumerate(chests)]
    formations = [(-85, -65), (85, 55), (-65, 90), (95, -85)]
    layout['groups'] = []
    for i, (cell, kinds) in enumerate(guards):
        x, y = centers[cell]
        layout['groups'].append(dict(cellId=cell, heal=i == 1, enemies=[
            dict(type=kind, x=x + formations[j][0], y=y + formations[j][1])
            for j, kind in enumerate(kinds)]))
    cell, index, name = boss
    x, y = centers[cell]
    layout['boss'] = dict(cellId=cell, x=x, y=y, bossIndex=index, name=name)
    layout['treasure'] = pos(x + 100, y - 110)
    layout['groundDetails'] = [dict(type=kind, x=x, y=y, rx=rx, ry=ry, angle=angle)
                               for kind, x, y, rx, ry, angle in details]

    # Keep the same physical clearance as the navigation probes, including the
    # corridor links rather than only the chamber centres.
    anchors = [Point(c['x'], c['y']) for c in layout['cells']]
    anchors += [Point(item['x'], item['y']) for key in ('chests', 'mechanisms', 'exits')
                for item in layout[key]]
    anchors += [Point(layout[key]['x'], layout[key]['y'])
                for key in ('boss', 'treasure', 'entrance', 'landing')]
    routes = [LineString([(c['x'], c['y']),
                          (layout['cells'][n]['x'], layout['cells'][n]['y'])])
              for c in layout['cells'] for n in c['neighbors'] if c['id'] < n]
    safe = shape.buffer(-35)
    for point in anchors:
        assert safe.covers(point), (layout['id'], 'anchor outside safe floor', point.wkt)
    for route in routes:
        assert safe.covers(route.interpolate(.5, normalized=True)), (
            layout['id'], 'link midpoint outside safe floor', route.wkt)

    solids = []
    for cell, (cx, cy) in enumerate(centers):
        spec = layout['cells'][cell]
        # Each chamber receives a small asymmetric cluster; keep combat and
        # navigation space open instead of scattering collision across rooms.
        rx = (spec['bounds']['maxX'] - spec['bounds']['minX']) / 2
        ry = (spec['bounds']['maxY'] - spec['bounds']['minY']) / 2
        found = 0
        for step in range(12):
            angle = (step * 2.399963 + cell * .87)
            px = round(cx + math.cos(angle) * rx * .68, 2)
            py = round(cy + math.sin(angle) * ry * .66, 2)
            point = Point(px, py)
            radius = 26 if found == 0 else 22
            if not shape.buffer(-(radius + 14)).covers(point):
                continue
            if any(point.distance(anchor) < radius + 38 for anchor in anchors):
                continue
            if any(point.distance(route) < radius + 30 for route in routes):
                continue
            if any(point.distance(other) < radius + other_r + 22 for other, other_r in solids):
                continue
            kind = 'cavernRock' if found == 0 or theme == 'beach' else 'rootCluster'
            layout['props'].append(dict(id=f'ledge-{cell}-{found}', type=kind,
                x=px, y=py, r=radius, collision=True, heightBand='low'))
            solids.append((point, radius))
            decoration = 'shellPile' if theme == 'beach' else 'caveMushroom'
            layout['props'].append(dict(id=f'edge-detail-{cell}-{found}', type=decoration,
                x=round(px + 26, 2), y=round(py - 14, 2), r=14, collision=False))
            found += 1
            if found == 2:
                break
    finish(layout)
    return layout


def _rootwater():
    centers = [(-1100, 500), (-1100, -180), (-400, -500), (320, -500),
               (-400, 180), (320, 180), (1040, 100)]
    specs = [
        _room('湿根洞口', 'entry', *centers[0], 250, 220, 11),
        _room('沉木浅滩', 'guard', *centers[1], 250, 235, 12),
        _room('分流石台', 'junction', *centers[2], 290, 230, 13),
        _room('上游透光口', 'exit', *centers[3], 250, 230, 14),
        _room('根下蓄水室', 'treasury', *centers[4], 255, 225, 15),
        _room('盘根回廊', 'guard', *centers[5], 250, 225, 16),
        _room('暗河深潭', 'boss', *centers[6], 335, 280, 17)]
    links = [
        (0, 1, [centers[0], (-1190, 170), centers[1]], 190),
        (1, 2, [centers[1], (-780, -400), centers[2]], 180),
        (2, 3, [centers[2], (-30, -565), centers[3]], 185),
        (2, 4, [centers[2], (-485, -140), centers[4]], 185),
        (4, 5, [centers[4], (-30, 245), centers[5]], 180),
        (3, 5, [centers[3], centers[5]], 180),
        (5, 6, [centers[5], (690, 230), centers[6]], 195)]
    layout, shape = make('marshRootwater', '根下暗河', 'cave', specs, links,
        (-1160, 600), (-1110, 495),
        dict(rooms=[3, 5], switch=(375, 20), cellId=5, bar=[215, -150, 425, -150]),
        [_exit(-1160, 600, .3, -1), _exit(395, -590, -.3, 1)])
    return _populate(layout, shape, centers, 'marsh',
        [(1, -1200, -100), (4, -500, 245), (5, 425, 255)],
        [(1, ['boglurker', 'bat', 'beetle']), (2, ['rootbinder', 'bat', 'boglurker']),
         (4, ['spore', 'boglurker']), (5, ['rootbinder', 'boglurker', 'bat'])],
        (6, 2, '深潭孢冠'),
        [('water', -420, -480, 160, 85, -.3), ('water', -400, 210, 140, 75, .2),
         ('water', 1050, 145, 180, 90, .1), ('roots', -1100, -120, 120, 75, -.3),
         ('moss', 310, -520, 125, 70, 0), ('roots', 350, 220, 125, 70, .3)])


def _moss():
    centers = [(450, 700), (-300, 650), (-800, 50), (-500, -650),
               (250, -600), (450, 0), (1120, -550)]
    specs = [
        _room('苔阶洞口', 'entry', *centers[0], 250, 210, 21),
        _room('菌伞暖窟', 'guard', *centers[1], 255, 225, 22),
        _room('漏水岩腹', 'junction', *centers[2], 285, 260, 23),
        _room('旧根藏室', 'treasury', *centers[3], 255, 225, 24),
        _room('孢雾石厅', 'guard', *centers[4], 265, 235, 25),
        _room('归途闸室', 'treasury', *centers[5], 240, 215, 26),
        _room('苔冠深室', 'boss', *centers[6], 340, 280, 27)]
    links = [
        (0, 1, [centers[0], (85, 800), centers[1]], 185),
        (1, 2, [centers[1], (-665, 435), centers[2]], 180),
        (2, 3, [centers[2], (-870, -330), centers[3]], 190),
        (3, 4, [centers[3], (-110, -760), centers[4]], 180),
        (4, 5, [centers[4], (350, -310), centers[5]], 185),
        (0, 5, [centers[0], centers[5]], 180),
        (4, 6, [centers[4], (700, -675), centers[6]], 195)]
    layout, shape = make('marshMoss', '苔影地窟', 'cave', specs, links,
        (500, 790), (450, 690),
        dict(rooms=[0, 5], switch=(500, 150), cellId=5, bar=[345, 350, 555, 350]),
        [_exit(500, 790, -.3, -1)])
    return _populate(layout, shape, centers, 'marsh',
        [(1, -355, 755), (3, -575, -735), (5, 375, -60)],
        [(1, ['spore', 'beetle', 'boglurker']), (2, ['boglurker', 'bat', 'rootbinder']),
         (3, ['spore', 'beetle']), (4, ['rootbinder', 'spore', 'boglurker']),
         (5, ['beetle', 'bat'])], (6, 2, '苔冠守卫'),
        [('moss', -310, 650, 160, 95, .3), ('water', -850, 40, 140, 100, -.5),
         ('roots', -470, -670, 150, 80, .2), ('moss', 220, -610, 165, 95, -.4),
         ('moss', 1120, -520, 200, 115, .2), ('rubble', 460, 730, 95, 45, 0)])


def _tideway():
    centers = [(-1500, 500), (-900, 0), (-250, 200), (400, -200),
               (1130, 100), (-250, -550), (550, -980)]
    specs = [
        _room('白岩潮口', 'entry', *centers[0], 255, 215, 31),
        _room('碎贝浅厅', 'guard', *centers[1], 255, 225, 32),
        _room('回潮石湾', 'junction', *centers[2], 270, 235, 33),
        _room('潮线分岔', 'guard', *centers[3], 270, 235, 34),
        _room('东侧海蚀口', 'exit', *centers[4], 265, 225, 35),
        _room('高滩贝室', 'treasury', *centers[5], 255, 225, 36),
        _room('深潮回音厅', 'boss', *centers[6], 340, 285, 37)]
    links = [
        (0, 1, [centers[0], (-1240, 170), centers[1]], 190),
        (1, 2, [centers[1], (-575, 190), centers[2]], 185),
        (2, 3, [centers[2], (120, 110), centers[3]], 190),
        (3, 4, [centers[3], (780, -130), centers[4]], 180),
        (3, 5, [centers[3], (120, -550), centers[5]], 180),
        (2, 5, [centers[2], centers[5]], 180),
        (5, 6, [centers[5], (70, -930), centers[6]], 195)]
    layout, shape = make('beachTideway', '白岩潮洞', 'cave', specs, links,
        (-1600, 550), (-1500, 500),
        dict(rooms=[2, 5], switch=(-300, -390), cellId=5, bar=[-355, -180, -145, -180]),
        [_exit(-1600, 550, 1, -.3), _exit(1245, 145, -1, -.3)])
    return _populate(layout, shape, centers, 'beach',
        [(1, -995, -65), (3, 485, -295), (5, -280, -660)],
        [(1, ['beetle', 'bat', 'tidepriest']), (2, ['tidepriest', 'beetle']),
         (3, ['beetle', 'tidepriest', 'bat']), (5, ['tidepriest', 'bat', 'beetle'])],
        (6, 1, '潮洞守卫'),
        [('shells', -920, 15, 155, 85, .2), ('water', -270, 245, 170, 80, -.1),
         ('water', 430, -170, 140, 75, .4), ('shells', -285, -565, 145, 80, -.2),
         ('water', 560, -930, 190, 105, -.2), ('rubble', 1120, 95, 115, 70, 0)])


def _shell():
    centers = [(-800, 650), (-50, 850), (700, 500), (900, -250),
               (200, -850), (-800, -450), (0, -100)]
    specs = [
        _room('退潮洞口', 'entry', *centers[0], 245, 215, 41),
        _room('漂木长厅', 'guard', *centers[1], 295, 215, 42),
        _room('贝砂转湾', 'junction', *centers[2], 260, 245, 43),
        _room('浪痕狭厅', 'guard', *centers[3], 235, 280, 44),
        _room('白贝藏室', 'treasury', *centers[4], 280, 225, 45),
        _room('回湾石闸', 'guard', *centers[5], 260, 235, 46),
        _room('螺心深窟', 'boss', *centers[6], 340, 280, 47)]
    links = [
        (0, 1, [centers[0], (-450, 880), centers[1]], 180),
        (1, 2, [centers[1], (365, 800), centers[2]], 185),
        (2, 3, [centers[2], (970, 160), centers[3]], 180),
        (3, 4, [centers[3], (650, -690), centers[4]], 190),
        (4, 5, [centers[4], (-330, -835), centers[5]], 190),
        (0, 5, [centers[0], centers[5]], 180),
        (5, 6, [centers[5], (-425, -210), centers[6]], 200)]
    layout, shape = make('beachShell', '贝影地窟', 'cave', specs, links,
        (-895, 680), (-795, 650),
        dict(rooms=[0, 5], switch=(-850, -280), cellId=5, bar=[-905, -80, -695, -80]),
        [_exit(-895, 680, 1, -.2)])
    return _populate(layout, shape, centers, 'beach',
        [(1, -115, 950), (3, 1005, -245), (4, 165, -960)],
        [(1, ['beetle', 'bat', 'tidepriest']), (2, ['beetle', 'tidepriest']),
         (3, ['tidepriest', 'bat', 'beetle']), (4, ['beetle', 'bat']),
         (5, ['tidepriest', 'beetle', 'bat'])], (6, 1, '贝窟守卫'),
        [('rubble', -80, 850, 180, 75, .1), ('shells', 690, 525, 170, 95, -.3),
         ('water', 915, -235, 105, 165, 0), ('shells', 195, -850, 180, 100, .2),
         ('rubble', -820, -455, 130, 85, .2), ('shells', 10, -70, 200, 110, -.1)])


def _roots():
    centers = [(0, 850), (0, 200), (-750, 100), (-800, -600),
               (0, -500), (790, -650), (800, 200)]
    specs = [
        _room('岩根洞口', 'entry', *centers[0], 250, 210, 51),
        _room('树根分厅', 'junction', *centers[1], 270, 235, 52),
        _room('侧根石廊', 'guard', *centers[2], 260, 235, 53),
        _room('枯叶藏窟', 'treasury', *centers[3], 270, 230, 54),
        _room('盘根闸厅', 'guard', *centers[4], 265, 230, 55),
        _room('老根深室', 'boss', *centers[5], 340, 280, 56),
        _room('东侧菌穴', 'treasury', *centers[6], 245, 230, 57)]
    links = [
        (0, 1, [centers[0], (70, 515), centers[1]], 190),
        (1, 2, [centers[1], (-390, 265), centers[2]], 180),
        (2, 3, [centers[2], (-900, -245), centers[3]], 185),
        (3, 4, [centers[3], (-420, -685), centers[4]], 180),
        (1, 4, [centers[1], centers[4]], 180),
        (4, 5, [centers[4], (380, -650), centers[5]], 195),
        (1, 6, [centers[1], (405, 110), centers[6]], 180)]
    layout, shape = make('verdantRoots', '岩根洞', 'cave', specs, links,
        (-45, 945), (0, 840),
        dict(rooms=[1, 4], switch=(70, -345), cellId=4, bar=[-105, -150, 105, -150]),
        [_exit(-45, 945, .2, -1)])
    return _populate(layout, shape, centers, 'forest',
        [(2, -850, 175), (3, -885, -675), (6, 895, 265)],
        [(1, ['beetle', 'bat']), (2, ['rootbinder', 'beetle', 'bat']),
         (3, ['beetle', 'spore']), (4, ['rootbinder', 'bat', 'beetle']),
         (6, ['spore', 'beetle', 'bat'])], (5, 1, '老根守卫'),
        [('roots', -15, 190, 165, 95, -.2), ('moss', -750, 110, 135, 85, .3),
         ('roots', -820, -585, 170, 85, .1), ('rubble', 20, -510, 140, 85, .2),
         ('roots', 790, -630, 200, 110, -.3), ('moss', 800, 190, 140, 90, -.1)])


def _echo():
    centers = [(-900, 700), (-350, 100), (-1100, 0), (-1100, -750),
               (-350, -650), (450, -1050), (550, -150)]
    specs = [
        _room('南侧回声口', 'entry', *centers[0], 255, 220, 61),
        _room('回音分厅', 'junction', *centers[1], 270, 235, 62),
        _room('落石外环', 'guard', *centers[2], 270, 230, 63),
        _room('根脉暗窟', 'treasury', *centers[3], 270, 245, 64),
        _room('北侧响石厅', 'guard', *centers[4], 270, 235, 65),
        _room('谷底透光口', 'exit', *centers[5], 260, 225, 66),
        _room('深处共鸣厅', 'boss', *centers[6], 340, 280, 67)]
    links = [
        (0, 1, [centers[0], (-550, 460), centers[1]], 190),
        (1, 2, [centers[1], (-745, 170), centers[2]], 185),
        (2, 3, [centers[2], (-1220, -370), centers[3]], 180),
        (3, 4, [centers[3], (-740, -820), centers[4]], 185),
        (1, 4, [centers[1], centers[4]], 180),
        (4, 5, [centers[4], (20, -970), centers[5]], 190),
        (4, 6, [centers[4], (80, -420), centers[6]], 195)]
    layout, shape = make('verdantEcho', '回声洞', 'cave', specs, links,
        (-985, 760), (-890, 695),
        dict(rooms=[1, 4], switch=(-400, -480), cellId=4, bar=[-455, -275, -245, -275]),
        [_exit(-985, 760, 1, -.6), _exit(550, -1110, -1, .5)])
    return _populate(layout, shape, centers, 'forest',
        [(2, -1190, 90), (3, -1190, -845), (4, -265, -730)],
        [(1, ['bat', 'beetle']), (2, ['rootbinder', 'bat', 'beetle']),
         (3, ['bat', 'spore', 'beetle']), (4, ['rootbinder', 'bat', 'beetle'])],
        (6, 1, '回声守卫'),
        [('rubble', -350, 120, 150, 90, .2), ('roots', -1110, -10, 160, 85, -.3),
         ('moss', -1100, -770, 155, 90, .4), ('rubble', -345, -650, 160, 80, -.2),
         ('roots', 550, -125, 190, 110, .2), ('moss', 450, -1060, 125, 75, 0)])


def build_layouts():
    layouts = [_rootwater(), _moss(), _tideway(), _shell(), _roots(), _echo()]
    return {layout['id']: layout for layout in layouts}
