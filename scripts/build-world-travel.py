#!/usr/bin/env python3
"""Bake the shared world travel graph and short wilderness approaches.

Shapely is an offline authoring dependency. Existing areas, interiors, encounters
and challenge arenas are preserved; only region exits and safe-core data change.
"""
import argparse
import json
import math
from pathlib import Path

from shapely.geometry import LineString, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import set_precision

ROOT = Path(__file__).resolve().parent.parent

# x/y are the building's front foundation anchor. Doors stand 30 units south.
SIZES = {'weapons': (126, 68), 'skills': (132, 76),
         'supplies': (118, 64), 'rest': (142, 82)}
CORES = [
    ('rift-forest', '南岸营地', 'camp', 350, (0, 2), (-3168, 1812.14),
     [(-3318, 1757), (-3058, 1657), (-3318, 1937), (-2938, 1937)]),
    ('verdant-rift', '晨光村落', 'village', 420, (1.35, .6), (-5900, 3915),
     [(-6050, 3760), (-5770, 3760), (-6050, 3980), (-5770, 4040)]),
    ('marsh', '南缘驿地', 'outpost', 420, (-1.3, 1.4), (-5800, 3915),
     [(-5950, 3760), (-5630, 3700), (-5950, 4040), (-5670, 4040)]),
    ('ruins', '考察营地', 'camp', 420, (-.8, 0), (-2200, 4115),
     [(-2350, 4040), (-2070, 3960), (-2350, 4240), (-2070, 4240)]),
    ('beach', '风帆渔村', 'village', 420, (1.4, 3.1), (-5100, 3915),
     [(-5250, 3760), (-4970, 3760), (-5250, 4040), (-4970, 4020)]),
    ('mountain', '南麓驿站', 'outpost', 420, (2.8, .2), (-5500, 4215),
     [(-5650, 4060), (-5370, 4060), (-5690, 4340), (-5350, 4260)]),
    ('snow', '西境雪驿', 'refuge', 420, (2, -1.2), (-5700, 3515),
     [(-5850, 3360), (-5570, 3360), (-5850, 3640), (-5570, 3740)]),
    ('clockshadow-city', '南郊街市', 'village', 420, (3, 2.2), (-5760, 3770),
     [(-5810, 3710), (-5570, 3710), (-5810, 3990), (-5470, 3910)]),
    ('ember-realm-large', '暖灰避难所', 'refuge', 420, (.4, -1.6), (-5610, 3420),
     [(-5700, 3360), (-5420, 3360), (-5700, 3660), (-5420, 3640)]),
]

# Each side is (region, area, endpoint, optional approach bends). Endpoints
# deliberately lie outside the settlement and face a wilderness counterpart.
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


def build(worlds):
    defs = {w['id']: w for w in worlds['definitions']}
    regions = []
    for world_id, name, kind, radius, atlas, waypoint, facilities in CORES:
        layout = defs[world_id]['authored']
        area = next(a for a in layout['areas'] if a['id'] == '01')
        core = {'id': f'core:{world_id}', 'name': name, 'kind': kind,
                **area['center'], 'radius': radius,
                'artTheme': layout.get('artTheme', 'forest'), 'areaId': '01',
                'facilities': [], 'waypoint': {**point(*waypoint), 'width': 56, 'depth': 36}}
        for (facility_kind, (width, depth)), (x, y) in zip(SIZES.items(), facilities):
            core['facilities'].append({'id': f'hub:{world_id}:{facility_kind}',
                                      'kind': facility_kind, **point(x, y),
                                      'width': width, 'depth': depth})
        regions.append({'worldId': world_id, 'core': core, 'atlas': point(*atlas)})

    travel = {'startWorldId': 'rift-forest', 'regions': regions, 'connections': []}
    by_world = {region['worldId']: [] for region in regions}
    for name, source, target in LINKS:
        a, b = source[0], target[0]
        connection = {'id': f'{a}--{b}', 'from': a, 'to': b, 'name': name, 'endpoints': {}}
        for this, other in [(source, target), (target, source)]:
            world_id, area_id, end, bends = this
            layout = defs[world_id]['authored']
            area = next(area for area in layout['areas'] if area['id'] == area_id)
            route = [pair(area['center']), *bends, end]
            dx, dy = route[-2][0] - end[0], route[-2][1] - end[1]
            length = math.hypot(dx, dy)
            direction = {'x': round(dx / length, 8), 'y': round(dy / length, 8)}
            endpoint = {**point(*end), 'areaId': area_id, 'arrivalDirection': direction,
                        'name': name, 'artTheme': layout.get('artTheme', 'forest'),
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
            shape = set_precision(LineString(route).buffer(width / 2, quad_segs=8), .01)
            bounds = layout['bounds']
            assert box(bounds['minX'], bounds['minY'], bounds['maxX'], bounds['maxY']).covers(shape), (world_id, target, 'bounds')
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
                                               'r': 90, 'arrivalDirection': endpoint['arrivalDirection']}
            matched = [key for key, mark in layout['landmarks'].items() if mark.get('kind') == 'exit' and mark.get('target') == index]
            if world_id == 'rift-forest':
                matched = [{'marsh': 'exitNorth', 'ruins': 'exitSouth', 'beach': 'exitWest'}.get(target, 'exitVerdant')]
            for key in matched or [f'exit:{target}']:
                layout['landmarks'][key] = {**point(endpoint['x'], endpoint['y']), 'area': area_id, 'kind': 'exit', 'target': index}

        # Only add the short approaches; do not rebake or reshape authored rooms.
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
