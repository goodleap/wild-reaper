#!/usr/bin/env python3
"""Bake junction settlements and the shared world graph at real map edges.

Shapely is an offline authoring dependency. Existing areas, interiors, encounters
and challenge arenas are preserved; only region exits and safe-core data change.
"""
import argparse
import json
from pathlib import Path

from shapely.geometry import LineString, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import set_precision

ROOT = Path(__file__).resolve().parent.parent

# x/y are the building's front foundation anchor. Doors stand 30 units south.
SIZES = {'weapons': (126, 68), 'skills': (132, 76),
         'supplies': (118, 64), 'rest': (142, 82)}
# Settlement centres follow existing road junctions. The old area-01 camps and
# their content remain part of the wilderness; no internal passage is replaced.
CORES = [
    ('rift-forest', '东岸林镇', 'village', 520, (0, 2), '08', (1360, 0)),
    ('verdant-rift', '双桥村落', 'village', 560, (1.35, .6), '06', (-600, 400)),
    ('marsh', '盘根驿地', 'outpost', 560, (-1.3, 1.4), '04', (-3100, 400)),
    ('ruins', '断柱集镇', 'village', 560, (-.8, 0), '02', (-900, 1900)),
    ('beach', '潮林渔村', 'village', 560, (1.4, 3.1), '08', (-2500, 1400)),
    ('mountain', '回云山驿', 'outpost', 560, (2.8, .2), '08', (-2450, 100)),
    ('snow', '融溪雪驿', 'refuge', 560, (2, -1.2), '14', (-2150, -1300)),
    ('clockshadow-city', '长街市集', 'village', 600, (3, 2.2), '07', (-1300, 0)),
    ('ember-realm-large', '熔桥聚落', 'refuge', 560, (.4, -1.6), '16', (1920, 650)),
]

# Keep every encounter and activity identity. Only the few reservations covered
# by a new settlement move to existing clear ground beyond its safe perimeter.
RELOCATIONS = {
    'rift-forest': {'clearing:rift:08-east': ('12', 2539, -74)},
    'verdant-rift': {'clearing:verdant:06-guard': ('06', -450, 1200),
                     'clearing:verdant:06-north': ('06', -900, -350)},
    'marsh': {'golemaltar': ('04', -3607, 1191),
              'clearing:marsh:04:2': ('04', -3857, 91)},
    'ruins': {'clearing:ruins:02:0': ('02', -249, 2400)},
    'beach': {'clearing:beach:08:6': ('08', -2500, 599),
              'clearing:beach:08:14': ('08', -2900, 2099)},
    'mountain': {'rescue': ('08', -1862, -600),
                 'clearing:mountain:08:6': ('08', -2162, 850)},
    'snow': {'rescue': ('14', -2950, -873),
             'clearing:snow:14:12': ('14', -1550, -1823)},
    'clockshadow-city': {'clearing:city:07-east': ('07', -500, -300)},
    'ember-realm-large': {'clearing:ember:mine-patrol': ('16', 2763, 655)},
}

# Each side is (region, area, endpoint, optional approach bends). Endpoints
# identify the existing wilderness approach; the last segment extends to bounds.
LINKS = [
    ('苔根湿径', ('rift-forest', '16', (-606.86, -2391.43), []),
     ('marsh', '03', (-6860, 1600), [(-6400, 1450)])),
    ('沉石古道', ('marsh', '10', (6500, -3700), [(5900, -3700)]),
     ('ruins', '04', (-6660, 1000), [])),
    ('断碑林径', ('rift-forest', '11', (2993.14, 2294.29), []),
     ('ruins', '03', (-4350, 4900), [(-4450, 4350)])),
    ('海风松径', ('rift-forest', '10', (600, 2500), []),
     ('beach', '09', (-6820, 700), [(-6300, 760)])),
    ('旧港商道', ('beach', '05', (6500, 2300), []),
     ('clockshadow-city', '02', (-6800, 1600), [])),
    ('北郊山路', ('clockshadow-city', '11', (-350, -4850), []),
     ('mountain', '02', (-6800, 2500), [(-6350, 2470)])),
    ('雪线古径', ('mountain', '15', (6500, -4800), []),
     ('snow', '12', (-2300, 4750), [(-2360, 4260)])),
    ('融雪灰谷', ('snow', '09', (6700, 1800), []),
     ('ember-realm-large', '08', (-5150, -4750), [])),
    ('冷炉石道', ('ember-realm-large', '03', (-3800, 4480), [(-3500, 4000)]),
     ('ruins', '09', (6450, -2600), [])),
    ('旧渠石路', ('clockshadow-city', '16', (6650, 3050), []),
     ('ruins', '07', (6500, 3300), [])),
    ('深林回廊', ('rift-forest', '12', (3400, -300), []),
     ('verdant-rift', '03', (-6900, 750), [(-6530, 800)])),
    ('断脊山径', ('verdant-rift', '10', (6900, 300), []),
     ('mountain', '06', (-2850, 4800), [(-2930, 4380)])),
]


def point(x, y):
    return {'x': round(x, 2), 'y': round(y, 2)}


def pair(p):
    return p['x'], p['y']


def from_rings(rings):
    shapes = sorted([set_precision(Polygon([pair(p) for p in ring['points']]).buffer(0), .01)
                     for ring in rings], key=lambda shape: -shape.area)
    # BoundaryMask uses even/odd rings; preserve islands enclosed by lake holes.
    result = Polygon()
    for shape in shapes:
        result = result.symmetric_difference(shape)
    return result.buffer(0)


def rings(shape, prefix, extra=None, original=()):
    parts = [shape] if shape.geom_type == 'Polygon' else list(shape.geoms)
    result = []
    unused = set(range(len(original)))
    old_points = [{pair(point) for point in ring['points']} for ring in original]
    signed_area = lambda coords: sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(coords, coords[1:]+coords[:1]))
    for i, poly in enumerate(sorted(parts, key=lambda p: -p.area)):
        if poly.is_empty or poly.geom_type != 'Polygon':
            continue
        poly = orient(poly)
        for j, ring in enumerate([poly.exterior, *poly.interiors]):
            coords = [(round(x, 2), round(y, 2)) for x, y in list(ring.coords)[:-1]]
            points = set(coords)
            candidates = [(len(points & old_points[n]), n) for n in unused
                          if original[n].get('hole', False) == (j != 0)]
            common, matched = max(candidates, default=(0, -1))
            old = original[matched] if common > 2 else None
            if old:
                unused.remove(matched)
                previous = [pair(p) for p in old['points']]
                if signed_area(coords) * signed_area(previous) < 0:
                    coords.reverse()
                origin = next((p for p in previous if p in points), min(points))
            else:
                origin = min(points)
            start = coords.index(origin)
            coords = coords[start:] + coords[:start]
            value = {**(old or {}), **({} if old else {'id': f'{prefix}:travel:{i}:{j}'}),
                     'points': [point(x, y) for x, y in coords], 'hole': j != 0,
                     **(extra or {})}
            result.append((matched if old else len(original) + len(result), value))
    return [value for _, value in sorted(result, key=lambda item: item[0])]


def settlement_ground(core):
    """World-coordinate paving, kept independent of the walkable-world masks."""
    cx, cy = core['x'], core['y']
    if core['artTheme'] == 'city':
        paths = [([(-2200, 0), (-400, 0)], 112),
                 ([(-1300, 0), (-1050, 550)], 90),
                 ([(-1300, 0), (-1475, -245)], 64),
                 ([(-1300, 0), (-1125, -245)], 64),
                 ([(-1300, 220), (-1450, 380), (-1575, 380), (-1575, 365)], 64),
                 ([(-1300, 220), (-1100, 410), (-925, 410), (-925, 380)], 64),
                 ([(-1300, 220), (-1380, 220), (-1380, 100), (-1300, 0)], 64),
                 ([(-1300, 220), (-1300, 310)], 72)]
        return {'plazas': [{**point(-1300, 100), 'width': 360, 'depth': 300}],
                'streets': [{'width': width, 'points': [point(*p) for p in path]} for path, width in paths]}
    row_north = min(f['y'] for f in core['facilities'])+90
    row_south = max(f['y'] for f in core['facilities'])+90
    x_min, x_max = min(f['x'] for f in core['facilities']), max(f['x'] for f in core['facilities'])
    street = lambda coords, width=84: {'width': width, 'points': [point(x, y) for x, y in coords]}
    streets = [street([(cx, cy-350), (cx, row_south+40)], 96),
               street([(x_min-40, cy+60), (x_max+40, cy+60)], 96),
               street([(x_min, row_north), (x_max, row_north)]),
               street([(x_min, row_south), (x_max, row_south)])]
    for f in core['facilities']:
        row = row_north if f['y'] < cy else row_south
        streets.append(street([(f['x'], f['y']+30), (f['x'], row)], 72))
    streets.append(street([(core['waypoint']['x'], core['waypoint']['y']+30), (cx, core['waypoint']['y']+30)], 72))
    streets.append(street([pair(core['spawn']), (core['waypoint']['x'], core['waypoint']['y']+30)], 72))
    return {'plazas': [{**point(cx, cy+105), 'width': 240, 'depth': 230}], 'streets': streets}


def build(worlds):
    defs = {w['id']: w for w in worlds['definitions']}
    regions = []
    for world_id, name, kind, radius, atlas, area_id, centre in CORES:
        layout = defs[world_id]['authored']
        cx, cy = centre
        sx, sy = (250, 180) if world_id == 'rift-forest' else (280, 210)
        facilities = [(cx-sx, cy-sy), (cx+sx, cy-sy),
                      (cx-sx, cy+sy), (cx+sx, cy+sy)]
        waypoint = {
            'rift-forest': (1300, 120), 'verdant-rift': (-680, 360),
            'marsh': (-3240, 400), 'beach': (-2620, 1400),
            'snow': (-2270, -1300),
        }.get(world_id, (cx-65, cy-40))
        if world_id == 'clockshadow-city':
            facilities = [(-1475, -275), (-1125, -275), (-1575, 335), (-925, 350)]
            waypoint = (-1300, 190)
        elif world_id == 'ember-realm-large':
            facilities = [(1645, 425), (2220, 460), (1645, 900), (2195, 900)]
            waypoint = (2010, 800)
        core = {'id': f'core:{world_id}', 'name': name, 'kind': kind,
                **point(cx, cy), 'radius': radius,
                'artTheme': layout.get('artTheme', 'forest'), 'areaId': area_id,
                'facilities': [], 'waypoint': {**point(*waypoint), 'width': 56, 'depth': 36},
                'spawn': point(waypoint[0], waypoint[1]+100), 'questBoard': point(cx+70, cy+80)}
        for (facility_kind, (width, depth)), (x, y) in zip(SIZES.items(), facilities):
            core['facilities'].append({'id': f'hub:{world_id}:{facility_kind}',
                                      'kind': facility_kind, **point(x, y),
                                      'width': width, 'depth': depth})
        if world_id == 'clockshadow-city':
            core['questBoard'] = point(-1200, 110)
        core['ground'] = settlement_ground(core)
        # Paving follows existing ground; settlement relocation may not fill a
        # lake, erase a building, or connect across an authored task barrier.
        ground = from_rings(layout['boundaries']).intersection(from_rings(layout['solidBoundaries'])).difference(from_rings(layout['lakes']))
        paving = unary_union([box(p['x']-p['width']/2, p['y']-p['depth']/2,
                                  p['x']+p['width']/2, p['y']+p['depth']/2)
                              for p in core['ground']['plazas']] +
                             [LineString([pair(p) for p in road['points']]).buffer(road['width']/2)
                              for road in core['ground']['streets']])
        assert paving.geom_type == 'Polygon', (world_id, 'disconnected paving')
        assert ground.buffer(.03).covers(paving), (world_id, 'paving outside existing land')
        for facility in core['facilities']:
            x, y, width, depth = (facility[key] for key in ['x', 'y', 'width', 'depth'])
            assert ground.buffer(.03).covers(box(x-width/2, y-depth, x+width/2, y)), (world_id, facility['kind'], 'foundation')
        regions.append({'worldId': world_id, 'core': core, 'atlas': point(*atlas)})
        for key, (area, x, y) in RELOCATIONS.get(world_id, {}).items():
            if key in layout['plan']:
                layout['plan'][key].update(point(x, y), area=area)
            else:
                next(e for e in layout['encounters'] if e['id'] == key).update(point(x, y), area=area)

    travel = {'startWorldId': 'rift-forest', 'regions': regions, 'connections': []}
    by_world = {region['worldId']: [] for region in regions}
    for name, source, target in LINKS:
        a, b = source[0], target[0]
        connection = {'id': f'{a}--{b}', 'from': a, 'to': b, 'name': name, 'endpoints': {}}
        for this, other in [(source, target), (target, source)]:
            world_id, area_id, end, bends = this
            layout = defs[world_id]['authored']
            area = next(area for area in layout['areas'] if area['id'] == area_id)
            bounds = layout['bounds']
            edge = min([('west', abs(end[0]-bounds['minX'])),
                        ('east', abs(end[0]-bounds['maxX'])),
                        ('north', abs(end[1]-bounds['minY'])),
                        ('south', abs(end[1]-bounds['maxY']))], key=lambda item: item[1])[0]
            dx, dy = {'west': (1, 0), 'east': (-1, 0), 'north': (0, 1), 'south': (0, -1)}[edge]
            end = (bounds['minX'] if edge == 'west' else bounds['maxX'] if edge == 'east' else end[0],
                   bounds['minY'] if edge == 'north' else bounds['maxY'] if edge == 'south' else end[1])
            approach = (end[0]+dx*420, end[1]+dy*420)
            route = [pair(area['center']), *bends, approach, end]
            direction = point(dx, dy)
            width = 240 if world_id == 'rift-forest' else 260
            endpoint = {**point(*end), 'areaId': area_id, 'arrivalDirection': direction,
                        'name': name, 'artTheme': layout.get('artTheme', 'forest'),
                        'exitTrigger': {'edge': edge, 'width': width, 'depth': 48},
                        'sign': point(end[0]+dx*220-dy*(width/2-30),
                                      end[1]+dy*220+dx*(width/2-30)),
                        'transition': {'theme': defs[other[0]]['authored'].get('artTheme', 'forest'),
                                       'length': 320, 'width': 180}}
            connection['endpoints'][world_id] = endpoint
            by_world[world_id].append((other[0], area_id, route, endpoint))
        travel['connections'].append(connection)

    for world_id, exits in by_world.items():
        layout = defs[world_id]['authored']
        layout['passages'] = [p for p in layout['passages'] if p['kind'] != 'exit']
        for key in [key for key in layout['plan'] if key.startswith('portal:')]:
            del layout['plan'][key]
        shapes = []
        for target, area_id, route, endpoint in exits:
            width = 240 if world_id == 'rift-forest' else 260
            bounds = layout['bounds']
            extent = box(bounds['minX'], bounds['minY'], bounds['maxX'], bounds['maxY'])
            shape = set_precision(LineString(route).buffer(width / 2, quad_segs=8).intersection(extent), .01)
            for area in layout['areas']:
                if area['id'] != area_id:
                    overlap = Polygon([pair(p) for p in area['points']]).intersection(shape).area
                    assert overlap < 1, (world_id, target, 'unplanned area join', area['id'], overlap)
            shapes.append(shape)
            passage = {'id': f'travel:{target}', 'from': area_id, 'to': None,
                       'width': width, 'kind': 'exit',
                       'points': [point(x, y) for x, y in list(shape.exterior.coords)[:-1]],
                       'waypoints': [point(x, y) for x, y in route]}
            layout['passages'].append(passage)
            index = worlds['order'].index(target)
            layout['plan'][f'portal:{index}'] = {**point(endpoint['x'], endpoint['y']),
                                               'r': 90, 'arrivalDirection': endpoint['arrivalDirection'],
                                               'exitTrigger': endpoint['exitTrigger']}
            matched = [key for key, mark in layout['landmarks'].items() if mark.get('kind') == 'exit' and mark.get('target') == index]
            if world_id == 'rift-forest':
                matched = [{'marsh': 'exitNorth', 'ruins': 'exitSouth', 'beach': 'exitWest'}.get(target, 'exitVerdant')]
            for key in matched or [f'exit:{target}']:
                layout['landmarks'][key] = {**point(endpoint['x'], endpoint['y']), 'area': area_id, 'kind': 'exit', 'target': index}

        # Extend only wilderness exits; do not rebake or reshape authored rooms.
        added = unary_union(shapes)
        for key in ['boundaries', 'solidBoundaries']:
            previous = from_rings(layout[key])
            # Geometry is stored to centimetre precision. Already baked joins
            # must not grow redundant collinear points on every regeneration.
            if not previous.buffer(.03).covers(added):
                layout[key] = rings(previous.union(added).buffer(0), f'{world_id}:{key}', original=layout[key])
        if layout.get('lakes'):
            previous = from_rings(layout['lakes'])
            if previous.intersection(added).area > .03:
                water = previous.difference(added).buffer(0)
                water_kind = layout['lakes'][0].get('kind', 'water')
                layout['lakes'] = rings(water, f'{world_id}:water', {'kind': water_kind}, original=layout['lakes'])
        if layout.get('emberScene'):
            scene = layout['emberScene']
            scene['groundRings'] = layout['boundaries']
            scene['highOpenRings'] = layout['solidBoundaries']
            scene['lavaRings'] = [{key: value for key, value in ring.items() if key != 'kind'}
                                  for ring in layout['lakes']]
            scene['roads'] = [road for road in scene['roads']
                              if not road['id'].startswith(('trail:exit:', 'travel:'))]
            scene['roads'].extend({'id': passage['id'], 'width': 92,
                                   'material': 'ochre', 'points': passage['waypoints']}
                                  for passage in layout['passages'] if passage['kind'] == 'exit')

    worlds['connections'] = [[link['from'], link['to']] for link in travel['connections']]
    worlds['travel'] = travel
    return travel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'dist/config/worlds.json'
    worlds = json.loads(path.read_text())
    travel = build(worlds)
    if args.write:
        path.write_text(json.dumps(worlds, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'regions': len(travel['regions']), 'connections': len(travel['connections']),
                      'facilities': sum(len(r['core']['facilities']) for r in travel['regions']),
                      'written': args.write}, ensure_ascii=False))


if __name__ == '__main__':
    main()
